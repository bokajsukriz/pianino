/* audio.js — ein AudioContext für die ganze App: Entsperren beim ersten
   Tipp (iOS), Klavier (Salamander über window.ChorPiano, bis zum Laden
   Synth-Ersatz), Klick und Melodiestimme. Geplant wird immer mit Audiozeit
   (clock.js); kein Fehler hier darf eine Übung blockieren. */

import { logError } from './log.js';

let ctx = null;
let graph = null;
let piano = null;     // geladene Sätze { soft, mid, loud } (mid zuerst) oder null (dann Synth)
let pianoLoad = null;

/** Lautstärken der Busse: Melodie lauter als die Begleitung. */
const LEVEL = { piano: 0.8, click: 0.5, melody: 1.0 };

function buildGraph(c) {
  const comp = c.createDynamicsCompressor();
  comp.threshold.value = -10; comp.knee.value = 6; comp.ratio.value = 4;
  comp.attack.value = 0.005; comp.release.value = 0.15;
  comp.connect(c.destination);
  const bus = (g) => { const n = c.createGain(); n.gain.value = g; n.connect(comp); return n; };
  return { piano: bus(LEVEL.piano), click: bus(LEVEL.click), melody: bus(LEVEL.melody) };
}

/** Der eine AudioContext (lazy). */
export function getCtx() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    ctx = new AC({ latencyHint: 'interactive' });
    graph = buildGraph(ctx);
  }
  return ctx;
}

/** Beim ersten Tipp aufrufen: resume() plus ein stiller Puffer (iOS). */
export async function unlock() {
  try {
    const c = getCtx();
    if (c.state !== 'running') await c.resume();
    const b = c.createBuffer(1, 1, c.sampleRate);
    const s = c.createBufferSource();
    s.buffer = b; s.connect(c.destination); s.start();
  } catch (e) { logError('audio:unlock', e); }
}

/** Klaviersamples im Hintergrund laden (Startscreen). */
/** Wie lange ein Ton klingen kann (s): tiefe länger, hohe kürzer — passend zu
 *  den vorab gekürzten Dateien. */
const keepSec = (m) => (m <= 48 ? 5 : m <= 72 ? 4 : 2.5);
/** Effektivwert des früheren Einzel-Satzes: alle Stufen werden darauf
 *  ausgeglichen, die Gesamtlautstärke bleibt wie vor den drei Stufen. Die
 *  Stufe ändert nur den Klang (leise weicher, laut heller); die Lautstärke
 *  kommt weiter von `gain`. */
const PIANO_REF = 0.0651;
/** Welche Stufe zu einer Lautstärke: leise Begleitung weich, kräftig (und die
 *  linke Hand, 1,1×) hell. */
export const layerFor = (gain) => (gain < 0.55 ? 'soft' : gain > 1.05 ? 'loud' : 'mid');

export function preloadPiano() {
  if (piano || pianoLoad || !window.ChorPiano) return pianoLoad;
  const P = window.ChorPiano;
  const one = (layer) => P.load({ keepSec, base: P.baseOf(layer) });
  // „mid“ zuerst (damit klingt schon alles), die anderen Stufen danach.
  pianoLoad = one('mid')
    .then((mid) => {
      piano = { mid };
      for (const layer of ['soft', 'loud']) one(layer).then((set) => { if (piano) piano[layer] = set; }).catch((e) => logError(`audio:piano:${layer}`, e));
      return piano;
    })
    .catch((e) => { logError('audio:piano', e); pianoLoad = null; return null; });
  return pianoLoad;
}
export const pianoReady = () => !!piano?.mid;

/** Aktuelle Audiozeit. */
export const now = () => getCtx().currentTime;
/** Was gerade zu hören ist (Audiozeit minus Ausgabelatenz) — für die Anzeige. */
export function audibleNow() {
  const c = getCtx();
  return c.currentTime - (c.outputLatency || c.baseLatency || 0);
}
export const isRunning = () => !!ctx && ctx.state === 'running';
export async function suspend() { try { if (ctx && ctx.state === 'running') await ctx.suspend(); } catch (e) { logError('audio:suspend', e); } }
export async function resume() { try { if (ctx && ctx.state !== 'running') await ctx.resume(); } catch (e) { logError('audio:resume', e); } }

const hz = (midi) => 440 * Math.pow(2, (midi - 69) / 12);

/** Ersatzklang bis die Samples da sind: Dreieck + Sinus, schnell abklingend. */
function synthNote(c, dest, midi, time, dur, gain) {
  const f = hz(midi);
  const g = c.createGain();
  const peak = 0.28 * gain;
  g.gain.setValueAtTime(0.0001, time);
  g.gain.linearRampToValueAtTime(peak, time + 0.006);
  g.gain.exponentialRampToValueAtTime(peak * 0.35, time + 0.35);
  g.gain.exponentialRampToValueAtTime(0.0001, time + Math.max(0.4, dur) + 0.25);
  const lp = c.createBiquadFilter();
  lp.type = 'lowpass'; lp.frequency.value = Math.min(6000, f * 6);
  lp.connect(g).connect(dest);
  for (const [type, mul, lvl] of [['triangle', 1, 1], ['sine', 2, 0.25]]) {
    const o = c.createOscillator(), og = c.createGain();
    o.type = type; o.frequency.value = f * mul; og.gain.value = lvl;
    o.connect(og).connect(lp);
    o.start(time); o.stop(time + Math.max(0.4, dur) + 0.3);
  }
}

function pianoNote(c, dest, set, midi, time, dur, gain) {
  if (set?.mid && window.ChorPiano) {
    try {
      const layer = set[layerFor(gain)] || set.mid;
      window.ChorPiano.play(c, layer, midi, time, { dur, gain: 0.32 * gain * (PIANO_REF / layer.ref), release: 0.25, dest });
      return;
    } catch (e) { logError('audio:sample', e); }
  }
  synthNote(c, dest, midi, time, dur, gain);
}

function clickAt(c, dest, time, accent, gain, high = false) {
  const o = c.createOscillator(), g = c.createGain();
  o.type = 'sine';
  o.frequency.value = high ? (accent ? 2400 : 2000) : (accent ? 1500 : 1000);
  const peak = 0.6 * gain;
  g.gain.setValueAtTime(peak, time);
  g.gain.exponentialRampToValueAtTime(peak * 0.05, time + 0.03);
  g.gain.linearRampToValueAtTime(0, time + 0.031);
  o.connect(g).connect(dest);
  o.start(time); o.stop(time + 0.035);
}

/** Melodiestimme: Sinus, Vibrato 5 Hz, 40 ms Einschwingen. */
function melodyAt(c, dest, midi, time, dur, gain) {
  const o = c.createOscillator(), g = c.createGain();
  const lfo = c.createOscillator(), depth = c.createGain();
  o.type = 'sine';
  o.frequency.value = hz(midi);
  lfo.frequency.value = 5;
  depth.gain.value = 12; // Cent
  lfo.connect(depth).connect(o.detune);
  const peak = 0.35 * gain, end = time + Math.max(0.08, dur);
  g.gain.setValueAtTime(0.0001, time);
  g.gain.linearRampToValueAtTime(peak, time + 0.04);
  g.gain.setValueAtTime(peak, Math.max(time + 0.04, end - 0.06));
  g.gain.linearRampToValueAtTime(0.0001, end + 0.06);
  o.connect(g).connect(dest);
  o.start(time); lfo.start(time);
  o.stop(end + 0.08); lfo.stop(end + 0.08);
}

/** Einen Klavierton planen. */
export function note(midi, time, { dur = 1, gain = 1 } = {}) {
  try { pianoNote(getCtx(), graph.piano, piano, midi, time, dur, gain); } catch (e) { logError('audio:note', e); }
}

/** Töne der linken Hand eines Griffs (lh als Liste oder, alt, als Zahl). */
export const lhNotes = (v) => (v?.lh == null ? [] : [].concat(v.lh));

/** Griff vorspielen: beide Hände gleichzeitig, LH 10 % lauter. */
export function chord(v, time, { dur = 1.5, gain = 1, lh = true, rh = true } = {}) {
  if (!v) return;
  if (lh) for (const m of lhNotes(v)) note(m, time, { dur, gain: gain * 1.1 });
  if (rh) for (const m of v.rh || []) note(m, time, { dur, gain });
}

/** Anschläge aus accomp.js stepHits planen. grip(chord) → Griff oder null;
 *  beatDur: Sekunden je Schlag; gain: Gesamtlautstärke (leise Begleitung < 1). */
export function playHits(hits, time, beatDur, grip, { gain = 1 } = {}) {
  for (const h of hits) {
    const v = grip(h.chord);
    if (!v) continue;
    const notes = h.hand === 'lh' ? lhNotes(v) : (v.rh || []);
    for (const m of notes) note(m, time, { dur: Math.max(0.1, h.beats * beatDur), gain: h.gain * gain });
  }
}

/** Klick: 1500 Hz auf der Eins, sonst 1000 Hz, 30 ms. high: 2400/2000 Hz —
 *  über dem Bereich, in dem hear.js nach Fremdtönen sucht (1000 Hz läge
 *  zwischen H5 und C6). */
export function click(time, accent = false, gain = 1, high = false) {
  try { clickAt(getCtx(), graph.click, time, accent, gain, high); } catch (e) { logError('audio:click', e); }
}

/** Melodieton; octaveDown → eine Oktave tiefer. */
export function melody(midi, time, dur, { octaveDown = false, gain = 1 } = {}) {
  try { melodyAt(getCtx(), graph.melody, octaveDown ? midi - 12 : midi, time, dur, gain); } catch (e) { logError('audio:melody', e); }
}

/** Selbsttest: Klick, Synth-Akkord und Melodie in einen fremden
 *  (Offline-)Kontext planen. */
export function renderSmoke(c, mel) {
  const g = buildGraph(c);
  clickAt(c, g.click, 0.05, true, 1);
  clickAt(c, g.click, 0.55, false, 1);
  for (const m of [45, 69, 72, 76]) synthNote(c, g.piano, m, 0.1, 0.8, 1);
  for (const n of mel.slice(0, 4)) melodyAt(c, g.melody, n.midi, 0.2 + n.at * 0.4, n.dur * 0.4, 1);
  return true;
}
