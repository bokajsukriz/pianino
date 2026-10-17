/* mic.js — Mikrofon für „Geführt“: getUserMedia → AnalyserNode im
   gemeinsamen AudioContext (nicht an die Lautsprecher angeschlossen).
   Nichts wird aufgenommen oder gespeichert; gelesen wird nur das jeweils
   letzte Fenster. Drei Arten zu hören (Einstellung `ear`, EARS):
     eigen     hear.js — prüft die Töne des erwarteten Akkords im Spektrum
               (≈ ⅓ s), mit Gedächtnis seit dem Anschlag, synchron.
     essentia  ear.js — essentia.js im Worker vergleicht die Chroma des
               Fensters (≈ 0,17 s) mit dem erwarteten Akkord, asynchron.
     beide     eigen sagt ja UND essentia hält den erwarteten Akkord für den
               wahrscheinlichsten (Abstand ≥ 0). Simulation, mit Bass:
               Fehlgriffe 7,1 → 3,8 %, erkannt 98,8 → 95 %; nur rechte Hand
               100 → 97,5 %, Fehlgriffe 0,8 → 0,4 %. Solange essentia lädt
               (oder nicht lädt), hört nur der eigene.
   Echo-Unterdrückung, Rauschunterdrückung und Pegelautomatik sind aus — die
   würden Klaviertöne verbiegen oder wegregeln. Spielt die App selbst einen
   Akkord vor, wird so lange weggehört (ignoreUntil), sonst erkennte sie sich
   selbst. */

import * as audio from './audio.js';
import { chordById } from './chords.js';
import { semitoneLevels, followOnset, checkChord } from './hear.js';
import { loadEar, checkFrame } from './ear.js';
import { S } from './store.js';
import { logError } from './log.js';

const EVERY = 0.07;      // s zwischen zwei Auswertungen
const ONSET_DB = 6;      // so viel lauter als 0,15 s vorher = Anschlag
const ONSET_BACK = 0.15;
const FFT = 16384;       // eigen: ≈ ⅓ s
const ESSENTIA_FRAME = 8192; // essentia liefert bei 16384 keine Akkorde (Stärke −1)

let stream = null, source = null, analyser = null, timeBuf = null, freqBuf = null;
let quietUntil = 0, last = null, asked = 0, busy = false, generation = 0;
let levels = [], lastOnset = -Infinity, onsetHigh = false, earState = 'off';
let prevSpec = null, before = null, since = null; // eigen: Gedächtnis seit dem Anschlag (hear.js)

export const supported = () => !!navigator.mediaDevices?.getUserMedia;
export const isOpen = () => !!analyser;
export const EARS = Object.freeze(['eigen', 'essentia', 'beide']);
/** Gewählte Art zu hören. */
export const earMode = () => (EARS.includes(S.settings.ear) ? S.settings.ear : 'eigen');

/** essentia im Hintergrund laden (einmal); bis dahin hört nichts. */
function ensureEar() {
  if (earState !== 'off') return;
  earState = 'loading';
  loadEar().then(() => { earState = 'ready'; }).catch((e) => { logError('mic:ear', e); earState = 'failed'; });
}
/** 'off' | 'loading' | 'ready' | 'failed' */
export const earStatus = () => earState;

/** Mikrofon öffnen. → true/false */
export async function open() {
  if (analyser) return true;
  if (!supported()) return false;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    });
    const ctx = audio.getCtx();
    source = ctx.createMediaStreamSource(stream);
    analyser = ctx.createAnalyser();
    analyser.fftSize = FFT;
    analyser.smoothingTimeConstant = 0;
    source.connect(analyser);
    timeBuf = new Float32Array(FFT);
    freqBuf = new Float32Array(analyser.frequencyBinCount);
    reset();
    return true;
  } catch (e) {
    logError('mic:open', e);
    close();
    return false;
  }
}

function reset() {
  last = null; levels = []; lastOnset = -Infinity; onsetHigh = false; asked = 0; busy = false; generation++;
  prevSpec = null; before = null; since = null;
}

export function close() {
  try { stream?.getTracks().forEach((t) => t.stop()); } catch { /* egal */ }
  try { source?.disconnect(); } catch { /* egal */ }
  stream = null; source = null; analyser = null; timeBuf = null; freqBuf = null;
  reset();
}

/** Bis zur Audiozeit `t` nicht hinhören (eigenes Vorspielen). */
export function ignoreUntil(t) {
  quietUntil = Math.max(quietUntil, t);
  reset();
}

/** Anschlag: Pegel der letzten ~50 ms deutlich über dem von vor 0,15 s.
 *  Zählt nur die steigende Flanke (mehrere Auswertungen hintereinander über
 *  der Schwelle sind ein Anschlag). → true bei neuem Anschlag */
function trackOnset(t) {
  const n = Math.min(timeBuf.length, Math.round(audio.getCtx().sampleRate * 0.05));
  let e = 0;
  for (let i = timeBuf.length - n; i < timeBuf.length; i++) e += timeBuf[i] * timeBuf[i];
  const db = 10 * Math.log10(e / n + 1e-12);
  levels.push({ t, db });
  while (levels.length > 1 && levels[1].t <= t - ONSET_BACK) levels.shift();
  const high = levels[0].t <= t - ONSET_BACK + 0.03 && db - levels[0].db >= ONSET_DB && db > -60;
  const isNew = high && !onsetHigh;
  onsetHigh = high;
  if (isNew) lastOnset = t;
  return isNew;
}

/** Was klingt gerade? Je Bildschirm-Frame aufrufen, `t` = audio.now(),
 *  want: Akkord-ids, die gerade in Frage kommen (essentia prüft nur diese).
 *  → null (kein Mikrofon, gerade weggehört, noch nichts da) oder
 *  { is(id, prevId) → bool, chord, sinceOnset, fresh }
 *  is: liegt der Akkord `id`? chord: stattdessen gehörter Song-Akkord (nur
 *  essentia, sonst ''). sinceOnset: s seit dem letzten Anschlag, gemessen
 *  beim Lesen des Fensters. fresh: neu seit dem letzten Aufruf. */
export function sample(t, want = []) {
  if (!analyser || t < quietUntil) return null;
  const mode = earMode();
  if (mode !== 'eigen') ensureEar();
  if (!busy && (!asked || t - asked >= EVERY)) {
    asked = t;
    analyser.getFloatTimeDomainData(timeBuf);
    const onset = trackOnset(t);
    const sinceOnset = t - lastOnset;
    const sr = audio.getCtx().sampleRate;
    // Eigener Erkenner (außer bei „essentia“ allein): synchron, mit Gedächtnis.
    let eigenIs = null;
    if (mode !== 'essentia') {
      analyser.getFloatFrequencyData(freqBuf);
      const now = semitoneLevels(freqBuf, sr, FFT);
      // Neuer Anschlag: Gedächtnis zurücksetzen, Spektrum davor merken.
      if (onset) { since = null; before = prevSpec; }
      if (Number.isFinite(lastOnset)) since = followOnset(since, now, sinceOnset, before);
      prevSpec = now;
      const mem = since;
      eigenIs = (id, prevId) => checkChord(now, mem, chordById(id), { prev: prevId ? chordById(prevId) : null }).ok;
    }
    if (mode !== 'eigen' && earState === 'ready') {
      const gen = generation;
      busy = true;
      const expect = [...new Set(want.map((id) => chordById(id).symbol))];
      checkFrame(timeBuf.slice(FFT - ESSENTIA_FRAME), sr, expect).then(({ results }) => {
        busy = false;
        if (gen !== generation) return;
        const errs = Object.values(results).filter((r) => r.error);
        if (errs.length) logError('mic:chord', errs[0].error);
        const other = Object.values(results).map((r) => r.chord).find((c) => c && !c.includes('?') && !expect.includes(c)) || '';
        const ess = (id) => results[chordById(id).symbol];
        const is = mode === 'beide'
          ? (id, prevId) => eigenIs(id, prevId) && (ess(id)?.score ?? -1) >= 0
          : (id) => !!ess(id)?.ok;
        last = { chord: other, sinceOnset, fresh: true, is };
      });
    } else if (eigenIs) {
      last = { chord: '', sinceOnset, fresh: true, is: eigenIs };
    }
  }
  if (!last) return null;
  const out = last;
  last = { ...last, fresh: false };
  return out;
}
