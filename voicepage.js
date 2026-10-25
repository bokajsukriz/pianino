/* voicepage.js — Übung „Voicings“ (von der Songs-Seite): eine Griff-Form
   wie 3 – 1 – 5 – 8 (Terz unten, darüber Grundton, Quinte, Oktave) durch
   eine Progression aus fünf Akkorden. Progression und Tonart zieht die
   Seite zufällig aus der gewählten Stufe (beim Öffnen und mit „Andere
   Folge“). Ohne Takt: liegt der Akkord (Mikrofon, sonst antippen bzw.
   Enter), kommt der nächste; nach dem fünften die Runde von vorn.
   Gehört wird immer mit dem eigenen Erkenner, durchlässig (hear.js
   checkTones): es zählen vor allem falsche Töne, nicht Lage und
   Vollständigkeit. Gemerkt wird nur die Stufe (settings.voicingEx).
   Regeln und Lagen rein in shapes.js. */

import * as audio from './audio.js';
import * as mic from './mic.js';
import { S, saveSettings } from './store.js';
import { SHAPES, LEVELS, PROGRESSIONS, progressionChords, shapeRound, shapeTarget, pickRound, spellNote } from './shapes.js';
import { prettyChord } from './chordsym.js';
import { allKeys } from './voicing.js';
import { EAR } from './ear.js';
import { $, showScreen, screenName, frameLoop, modal, setToggle, rand } from './ui.js';

let st = null;
let wired = false;
let wakeLock = null;

function wire() {
  if (wired) return;
  wired = true;
  $('#vx-back').addEventListener('click', close);
  $('#vx-play').addEventListener('click', toggle);
  $('#vx-listen').addEventListener('click', listen);
  $('#vx-mic').addEventListener('click', toggleMic);
  $('#vx-other').addEventListener('click', () => newRound());
  $('#vx-levels').addEventListener('click', (e) => {
    const b = e.target.closest('[data-level]');
    if (b) setLevel(Number(b.dataset.level));
  });
  $('.vx-stage').addEventListener('click', (e) => { if (!e.target.closest('button')) tap(); });
  document.addEventListener('keydown', onKey);
}

/** Übung öffnen; onBack: zurück zur Songs-Seite. */
export function openVoicings(onBack) {
  wire();
  const level = Number(S.settings.voicingEx?.level);
  st = { onBack, shape: SHAPES[0].id, level: LEVELS[level] ? level : 1, pick: null, round: null, i: 0, running: false, shownAt: 0, okRun: 0, wait: false, stop: null };
  $('#vx-title').textContent = `Voicing ${st.shape}`;
  showScreen('voicings');
  paintLevels();
  newRound();
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

/** Neue Zufallsrunde der Stufe; läuft die Übung, gleich mit ihr weiter. */
function newRound() {
  st.pick = pickRound(st.level, rand, st.pick);
  st.round = shapeRound(progressionChords(st.pick.prog, st.pick.key), st.shape);
  if (mic.isOpen()) mic.setPool(st.round.map(shapeTarget));
  const roman = PROGRESSIONS.find((p) => p.id === st.pick.prog).roman;
  $('#vx-what').textContent = `${prettyChord(st.pick.key)}-Dur · ${roman}`;
  if (st.running) show(0); else paintIdle();
}

async function setLevel(level) {
  if (!LEVELS[level] || level === st.level) return;
  st.level = level;
  paintLevels();
  newRound();
  S.settings.voicingEx = { ...S.settings.voicingEx, level };
  await saveSettings();
}

function paintLevels() {
  for (const b of $('#vx-levels').querySelectorAll('[data-level]')) {
    b.setAttribute('aria-pressed', String(Number(b.dataset.level) === st.level));
  }
}

/* ---------- Ablauf ------------------------------------------------------ */

async function toggle() {
  if (st.running) { halt(); paintIdle(); return; }
  await audio.unlock();
  if (!st || !(await askMic())) return;
  await syncMic();
  if (!st) return;
  st.running = true;
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
  paintNow(false);
  $('#vx-hint').textContent = mic.isOpen() ? '' : 'Antippen, sobald er liegt';
  $('#vx-live').textContent = prettyChord(st.round[i].symbol);
}

function paintIdle() {
  st.i = 0;
  paintNow(true);
  $('#vx-hint').textContent = '';
  $('#vx-live').textContent = '';
  paintControls();
}

/** Folge (aktueller Akkord markiert), groß der Akkord, darunter seine Töne
 *  von unten nach oben. */
function paintNow(idle) {
  $('#vx-seq').replaceChildren(...st.round.map((s, k) => {
    const e = document.createElement('span');
    e.className = `vx-seq-chord${!idle && k === st.i ? ' cur' : ''}${!idle && k < st.i ? ' done' : ''}`;
    e.textContent = prettyChord(s.symbol);
    return e;
  }));
  const step = st.round[st.i];
  const big = $('#vx-big');
  big.textContent = prettyChord(step.symbol);
  big.className = `dr-big${step.symbol.length > 4 ? ' long' : ''}${idle ? ' idle' : ''}`;
  $('#vx-notes').textContent = allKeys(step.grip).map((m) => prettyChord(spellNote(m, st.pick.key))).join(' · ');
}

function paintControls() {
  if (!st) return;
  $('#vx-play-icon').setAttribute('d', st.running ? 'M7 5h4v14H7zM13 5h4v14h-4z' : 'M8 5l11 7-11 7z');
  $('#vx-play').setAttribute('aria-label', st.running ? 'Anhalten' : 'Start');
  setToggle($('#vx-mic'), !!S.settings.mic && mic.supported(), !mic.supported());
}

/** Akkord liegt: der nächste; nach dem letzten die Runde von vorn. */
function got() {
  $('#vx-big').classList.add('got');
  st.wait = true;
  const last = st.i >= st.round.length - 1;
  const at = st;
  setTimeout(() => {
    if (st !== at || !st.running) return;
    show(last ? 0 : st.i + 1);
  }, last ? 700 : 250);
}

/** Antippen bzw. Enter: ohne Mikrofon „liegt“. */
function tap() {
  if (!st?.running || st.wait || mic.isOpen()) return;
  got();
}

/** Je Frame: Mikrofon lesen (wie „Folgen üben“ ohne Takt). */
function tick() {
  if (!st?.running || st.wait || !mic.isOpen()) return;
  const step = st.round[st.i];
  const aim = shapeTarget(step);
  const t = audio.now();
  // Immer der eigene Erkenner: essentia hört nur Tonnamen und erkannte die
  // Form in der Simulation nur zu 57 %. Die Einstellung „Hören mit“ gilt
  // hier deshalb nicht.
  const smp = mic.sample(t, [aim], { ear: 'eigen' });
  if (!smp?.fresh) return;
  const onsetAt = t - smp.sinceOnset;
  const judging = smp.sinceOnset <= EAR.judge && onsetAt >= st.shownAt - 0.15;
  const before = st.round[(st.i + st.round.length - 1) % st.round.length];
  const prevAim = before.symbol !== step.symbol ? shapeTarget(before) : null;
  if (judging && smp.is(aim, prevAim, { loose: true })) {
    if (++st.okRun >= 2) got();
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
  if (st?.running) show(st.i);
}

/* ---------- Tasten, Bildschirm ------------------------------------------ */

function onKey(e) {
  if (!st || screenName() !== 'voicings' || !$('#modal').hidden) return;
  if (e.target.closest?.('input, textarea, select')) return;
  if (e.key === ' ') { e.preventDefault(); toggle(); }
  else if (e.key === 'Enter') { e.preventDefault(); tap(); }
  else if (e.key === 'a' || e.key === 'A') listen();
  else if (e.key === 'n' || e.key === 'N') newRound();
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
