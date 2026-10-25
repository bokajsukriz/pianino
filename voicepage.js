/* voicepage.js — Übung „Voicings“ (von der Songs-Seite): eine Griff-Form
   wie 3 – 1 – 5 – 8 (Terz unten, darüber Grundton, Quinte, Oktave) durch
   eine Progression aus fünf Akkorden. Ohne Takt: liegt der Akkord
   (Mikrofon, sonst antippen bzw. Enter), kommt der nächste; nach dem
   fünften beginnt die Runde von vorn. Hilfe in drei Stufen (Tasten / Töne /
   nur Akkord), „Griff zeigen“ (G) deckt die Tasten kurz auf, ohne dass es
   zählt. Hört das Mikrofon eine ganze Runde, zählt sie als sauber; nach
   CLEAN_FOR_NEXT sauberen schlägt die Seite die nächste Tonart vor. Es hört
   immer der eigene Erkenner (hear.js), alle vier Töne in genau der Lage.
   Gemerkt in settings.voicingEx. Regeln und Lagen rein in shapes.js. */

import * as audio from './audio.js';
import * as mic from './mic.js';
import { S, saveSettings } from './store.js';
import {
  SHAPES, SPLITS, PROGRESSIONS, KEYS, progressionChords, shapeRound, shapeTarget,
  roundKey, CLEAN_FOR_NEXT, nextKey, HEAR_SHAPE,
} from './shapes.js';
import { prettyChord } from './chordsym.js';
import { pitchClassName } from './chords.js';
import { allKeys } from './voicing.js';
import { EAR } from './ear.js';
import { renderGrip, rangeFor } from './keyboard.js';
import { $, showScreen, screenName, frameLoop, modal, setToggle } from './ui.js';

const HELPS = Object.freeze([
  { id: 'keys', label: 'Tasten' },
  { id: 'notes', label: 'Töne' },
  { id: 'chord', label: 'Nur Akkord' },
]);
const PEEK_MS = 2500;

let st = null;
let wired = false;
let wakeLock = null;

/** Gemerkte Wahl (settings.voicingEx), mit Voreinstellungen. */
function prefs() {
  const p = S.settings.voicingEx || {};
  return {
    shape: SHAPES.some((s) => s.id === p.shape) ? p.shape : SHAPES[0].id,
    prog: PROGRESSIONS.some((x) => x.id === p.prog) ? p.prog : PROGRESSIONS[0].id,
    key: KEYS.includes(p.key) ? p.key : KEYS[0],
    split: SPLITS.includes(p.split) ? p.split : SPLITS[0],
    help: HELPS.some((h) => h.id === p.help) ? p.help : HELPS[0].id,
    done: p.done && typeof p.done === 'object' ? { ...p.done } : {},
  };
}

async function savePrefs() {
  const { shape, prog, key, split, help, done } = st;
  S.settings.voicingEx = { shape, prog, key, split, help, done };
  await saveSettings();
}

function wire() {
  if (wired) return;
  wired = true;
  $('#vx-back').addEventListener('click', close);
  $('#vx-play').addEventListener('click', toggle);
  $('#vx-listen').addEventListener('click', listen);
  $('#vx-peek').addEventListener('click', peek);
  $('#vx-mic').addEventListener('click', toggleMic);
  $('#vx-nextkey').addEventListener('click', () => choose({ key: nextKey(st.key) }));
  $('#vx-progs').addEventListener('click', (e) => { const b = e.target.closest('[data-prog]'); if (b) choose({ prog: b.dataset.prog }); });
  $('#vx-keys').addEventListener('click', (e) => { const b = e.target.closest('[data-key]'); if (b) choose({ key: b.dataset.key }); });
  $('#vx-splits').addEventListener('click', (e) => { const b = e.target.closest('[data-split]'); if (b) choose({ split: Number(b.dataset.split) }); });
  $('#vx-helps').addEventListener('click', (e) => { const b = e.target.closest('[data-help]'); if (b) choose({ help: b.dataset.help }); });
  $('.vx-stage').addEventListener('click', (e) => { if (!e.target.closest('button')) tap(); });
  document.addEventListener('keydown', onKey);
}

/** Übung öffnen; onBack: zurück zur Songs-Seite. */
export function openVoicings(onBack) {
  wire();
  st = { onBack, ...prefs(), round: null, i: 0, running: false, shownAt: 0, okRun: 0, wait: false, clean: true, peekUntil: 0, stop: null };
  build();
  showScreen('voicings');
  paintChoices();
  paintIdle();
  st.stop = frameLoop(tick);
}

function close() {
  if (!st) return;
  halt();
  if (mic.isOpen()) mic.close();
  st.stop?.();
  const back = st.onBack;
  st = null;
  back?.();
}

/* ---------- Wahl -------------------------------------------------------- */

const shapeOf = () => SHAPES.find((s) => s.id === st.shape);
const progOf = () => PROGRESSIONS.find((p) => p.id === st.prog);
const chords = () => progressionChords(st.prog, st.key);
const doneHere = () => st.done[roundKey(st.prog, st.key)] || 0;

/** Lagen der Runde neu berechnen (nach jeder Wahl). */
function build() {
  st.round = shapeRound(chords(), st.shape, { split: st.split });
  st.range = rangeFor(st.round.flatMap((s) => allKeys(s.grip)), { min: 15 });
  if (mic.isOpen()) mic.setPool(st.round.map(shapeTarget));
}

/** Progression, Tonart, Aufteilung oder Hilfe ändern; eine laufende Runde
 *  beginnt mit der neuen Wahl von vorn. */
async function choose(change) {
  Object.assign(st, change);
  build();
  paintChoices();
  if (st.running) { st.clean = true; show(0); } else paintIdle();
  await savePrefs();
}

function paintChoices() {
  const mk = (attr, value, label, on, sub = '') => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'toggle toggle-sm';
    b.dataset[attr] = value;
    b.setAttribute('aria-pressed', String(on));
    b.textContent = label;
    if (sub) { const s = document.createElement('small'); s.textContent = sub; b.append(s); }
    return b;
  };
  $('#vx-progs').replaceChildren(...PROGRESSIONS.map((p) => mk('prog', p.id,
    progressionChords(p.id, st.key).map(prettyChord).join(' – '), p.id === st.prog, p.roman)));
  $('#vx-keys').replaceChildren(...KEYS.map((k) => mk('key', k, prettyChord(k), k === st.key)));
  $('#vx-splits').replaceChildren(...SPLITS.map((n) => mk('split', String(n),
    `Links ${n} · rechts ${st.shape.length - n}`, n === st.split)));
  $('#vx-helps').replaceChildren(...HELPS.map((h) => mk('help', h.id, h.label, h.id === st.help)));
  $('#vx-shape').textContent = shapeOf().name;
}

/** „Übe jetzt das Voicing 3158 mit der Progression C – Am – … (I – vi – …).“ */
const say = () => `Übe jetzt das Voicing ${st.shape} mit der Progression ${chords().map(prettyChord).join(' – ')} (${progOf().roman}).`;

/* ---------- Ablauf ------------------------------------------------------ */

async function toggle() {
  if (st.running) { halt(); paintIdle(); return; }
  await audio.unlock();
  if (!st || !(await askMic())) return;
  await syncMic();
  if (!st) return;
  st.running = true;
  st.clean = true;
  keepAwake();
  show(0);
  paintControls();
}

function halt() {
  st.running = false;
  st.wait = false;
  releaseAwake();
  paintControls();
}

/** Akkord `i` der Runde zeigen. */
function show(i) {
  st.i = i;
  st.shownAt = audio.now();
  st.okRun = 0;
  st.wait = false;
  st.peekUntil = 0;
  const step = st.round[i];
  const big = $('#vx-big');
  big.textContent = prettyChord(step.symbol);
  big.className = `dr-big${step.symbol.length > 4 ? ' long' : ''}`;
  $('#vx-say').textContent = i === 0 ? say() : '';
  $('#vx-live').textContent = prettyChord(step.symbol);
  paintSeq();
  paintHelp();
  paintHint();
  paintCount();
}

function paintHint() {
  const next = st.round[st.i + 1]?.symbol;
  const listening = mic.isOpen();
  const parts = [listening ? '' : 'Antippen, sobald er liegt', next ? `dann ${prettyChord(next)}` : 'dann von vorn'];
  $('#vx-hint').textContent = parts.filter(Boolean).join(' · ');
}

function paintCount() {
  const n = doneHere();
  $('#vx-count').textContent = `${prettyChord(st.key)} · ${n}/${CLEAN_FOR_NEXT}`;
}

/** Die fünf Akkorde, der aktuelle markiert. */
function paintSeq() {
  $('#vx-seq').replaceChildren(...st.round.map((s, k) => {
    const e = document.createElement('span');
    e.className = `vx-seq-chord${st.running && k === st.i ? ' cur' : ''}${st.running && k < st.i ? ' done' : ''}`;
    e.textContent = prettyChord(s.symbol);
    return e;
  }));
}

/** Stufen und Töne nach Händen, Tastatur — je nach Hilfe-Stufe. */
function paintHelp() {
  const step = st.round[st.i];
  const g = step.grip;
  const keys = allKeys(g);
  const peeking = performance.now() < st.peekUntil;
  const showNotes = st.help !== 'chord' || peeking;
  const showKb = st.help === 'keys' || peeking;
  // Ohne Töne (Hilfe „Nur Akkord“) bleiben die Stufen: die Form ist ja gleich.
  const hand = (label, notes) => {
    if (!notes.length) return null;
    const box = document.createElement('span');
    box.className = 'vx-hand';
    const l = document.createElement('small'); l.textContent = label;
    box.append(l);
    for (const m of notes) {
      const n = document.createElement('span');
      n.className = 'vx-note';
      const b = document.createElement('b'); b.textContent = String(step.degrees[keys.indexOf(m)]);
      n.append(b);
      if (showNotes) { const t = document.createElement('span'); t.textContent = pitchClassName(m); n.append(t); }
      box.append(n);
    }
    return box;
  };
  $('#vx-degrees').replaceChildren(...[hand('links', g.lh), hand('rechts', g.rh)].filter(Boolean));
  const kb = $('#vx-kb');
  kb.hidden = !showKb;
  if (showKb) {
    const prev = st.running && st.i > 0 && !peeking ? st.round[st.i - 1].grip : null;
    renderGrip(kb, { prev, next: g, range: st.range, title: `${prettyChord(step.symbol)}: ${keys.map(pitchClassName).join(', ')}` });
  }
  $('#vx-peek').hidden = showKb || !st.running;
}

function paintIdle() {
  st.i = 0;
  const big = $('#vx-big');
  big.textContent = prettyChord(st.round[0].symbol);
  big.className = 'dr-big idle';
  $('#vx-say').textContent = say();
  $('#vx-hint').textContent = 'Start: Akkord für Akkord, ohne Takt.';
  $('#vx-live').textContent = '';
  paintSeq();
  paintHelp();
  paintCount();
  paintControls();
}

function paintControls() {
  if (!st) return;
  $('#vx-play-icon').setAttribute('d', st.running ? 'M7 5h4v14H7zM13 5h4v14h-4z' : 'M8 5l11 7-11 7z');
  $('#vx-play').setAttribute('aria-label', st.running ? 'Anhalten' : 'Start');
  setToggle($('#vx-mic'), !!S.settings.mic && mic.supported(), !mic.supported());
  $('#vx-nextkey').hidden = doneHere() < CLEAN_FOR_NEXT;
  $('#vx-nextkey').textContent = `Weiter mit ${prettyChord(nextKey(st.key))}`;
  paintSeq();
}

/** Akkord liegt: der nächste; nach dem letzten die Runde von vorn. */
async function got(byMic) {
  if (!byMic) st.clean = false;
  $('#vx-big').classList.add('got');
  st.wait = true;
  const last = st.i >= st.round.length - 1;
  if (last) await roundDone();
  const at = st;
  setTimeout(() => {
    if (st !== at || !st.running) return;
    show(last ? 0 : st.i + 1);
  }, last ? 900 : 250);
}

/** Runde fertig: sauber (ganz übers Mikrofon gehört) zählt. */
async function roundDone() {
  const k = roundKey(st.prog, st.key);
  const was = st.clean;
  if (was) st.done[k] = (st.done[k] || 0) + 1;
  st.clean = true;
  paintCount();
  paintControls();
  $('#vx-hint').textContent = was
    ? (doneHere() >= CLEAN_FOR_NEXT ? `Sauber! Noch einmal – oder weiter mit ${prettyChord(nextKey(st.key))}.` : 'Sauber! Gleich noch einmal.')
    : 'Runde geschafft – noch einmal.';
  if (was) await savePrefs();
}

/** Antippen bzw. Enter: ohne Mikrofon „liegt“. */
function tap() {
  if (!st?.running || st.wait || mic.isOpen()) return;
  got(false);
}

/** Je Frame: Mikrofon lesen (wie „Folgen üben“ ohne Takt); Griff-zeigen
 *  nach PEEK_MS wieder zu. */
function tick() {
  if (!st) return;
  if (st.peekUntil && performance.now() >= st.peekUntil) { st.peekUntil = 0; paintHelp(); }
  if (!st.running || st.wait || !mic.isOpen()) return;
  const step = st.round[st.i];
  const aim = shapeTarget(step);
  const t = audio.now();
  // Immer der eigene Erkenner: essentia hört nur Tonnamen, keine Lage, und
  // erkannte den richtigen Griff in der Simulation nur zu 57 % (Bass unter
  // E♭3: 26 %). Die Einstellung „Hören mit“ gilt hier deshalb nicht.
  const smp = mic.sample(t, [aim], { ear: 'eigen' });
  if (!smp?.fresh) return;
  const onsetAt = t - smp.sinceOnset;
  const judging = smp.sinceOnset <= EAR.judge && onsetAt >= st.shownAt - 0.15;
  const before = st.round[(st.i + st.round.length - 1) % st.round.length];
  const prevAim = before.symbol !== step.symbol ? shapeTarget(before) : null;
  // Alle vier Töne geprüft, in genau dieser Lage (shapes.js shapeTarget).
  if (judging && smp.is(aim, prevAim, { exact: true, tune: HEAR_SHAPE })) {
    if (++st.okRun >= 2) got(true);
    return;
  }
  st.okRun = 0;
}

/** Griff des aktuellen Akkords vorspielen (das Mikrofon hört so lange weg). */
async function listen() {
  await audio.unlock();
  if (!st) return;
  const t = audio.now() + 0.05;
  audio.chord(st.round[st.i].grip, t, { dur: 1.5 });
  if (mic.isOpen()) mic.ignoreUntil(t + 2.2);
  st.shownAt = t + 2.2;
}

/** Tasten kurz zeigen (zählt nicht als Fehler). */
function peek() {
  if (!st?.running) return;
  st.peekUntil = performance.now() + PEEK_MS;
  paintHelp();
}

/* ---------- Mikrofon ---------------------------------------------------- */

const wantMic = () => mic.supported() && S.settings.mic !== false;

async function askMic() {
  if (wantMic() && S.settings.mic == null) {
    const a = await modal('Mit Mikrofon üben?',
      'Pianino hört zu, ob der Akkord liegt, und zeigt dann den nächsten – du musst nicht aufs Handy tippen. '
      + 'Es wird nichts aufgenommen oder gespeichert.',
      [{ label: 'Ohne', value: 'no' }, { label: 'Mikrofon an', value: 'yes', primary: true }]);
    S.settings.mic = a === 'yes';
    await saveSettings();
  }
  return !!st;
}

async function syncMic() {
  if (S.settings.mic && mic.supported() && !mic.isOpen()) {
    $('#vx-hint').textContent = 'Mikrofon wird vorbereitet …';
    if (!(await mic.open())) {
      S.settings.mic = false;
      await saveSettings();
      if (st) $('#vx-hint').textContent = 'Kein Mikrofon erreichbar – dann antippen, sobald der Akkord liegt.';
    }
  }
  if (!S.settings.mic && mic.isOpen()) mic.close();
  if (st && mic.isOpen()) mic.setPool(st.round.map(shapeTarget));
  if (st) paintControls();
}

async function toggleMic() {
  S.settings.mic = !S.settings.mic;
  await saveSettings();
  if (!st) return;
  if (st.running || S.settings.mic === false) await syncMic();
  else paintControls();
  if (st?.running) { st.clean = false; show(st.i); }
}

/* ---------- Tasten, Bildschirm ------------------------------------------ */

function onKey(e) {
  if (!st || screenName() !== 'voicings' || !$('#modal').hidden) return;
  if (e.target.closest?.('input, textarea, select')) return;
  if (e.key === ' ') { e.preventDefault(); toggle(); }
  else if (e.key === 'Enter') { e.preventDefault(); tap(); }
  else if (e.key === 'g' || e.key === 'G') peek();
  else if (e.key === 'a' || e.key === 'A') listen();
}

async function keepAwake() {
  try {
    if (!wakeLock && 'wakeLock' in navigator && document.visibilityState === 'visible') wakeLock = await navigator.wakeLock.request('screen');
  } catch { /* still ignorieren */ }
}
function releaseAwake() {
  try { wakeLock?.release(); } catch { /* egal */ }
  wakeLock = null;
}
