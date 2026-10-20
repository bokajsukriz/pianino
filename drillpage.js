/* drillpage.js — „Folgen üben“: die 2-Takt-Folgen aus dem Leadsheet
   (drill.js) zum Klick mitspielen. Jede Folge kommt mit einem Takt Vorlauf
   (Folge schon sichtbar, Klick zählt groß ein), dann 2 Takte zum Klick;
   danach der Vorlauf der nächsten Folge. „Wiederholen“ bleibt bei derselben,
   Tempo ±5 gilt ab dem nächsten Vorlauf. Ohne Mikrofon: man spielt einfach
   mit. Audio-Timing über clock.js (Lookahead auf der AudioContext-Uhr), die
   Anzeige folgt per requestAnimationFrame der hörbaren Audiozeit. Tasten:
   Leertaste Start/Pause, ←/→ Folge, R Wiederholen, +/− Tempo.

   Umschalter „Nur Akkorde“: kein Takt, kein Klick. Groß der zu greifende
   Akkord, klein „A → B“ und darunter der Wechsel auf der Tastatur; liegt er
   (Mikrofon, sonst antippen bzw. Enter), kommt der nächste. Welche Wechsel,
   wie gemessen und wann Zufallswechsel dazukommen: drill.js SWAP. Je
   Übergang gemerkt in settings.drillSwaps[songId]. */

import * as audio from './audio.js';
import * as mic from './mic.js';
import { createClock } from './clock.js';
import { S, saveSettings, today } from './store.js';
import {
  DRILL, cycleBeats, cyclePhase, nextChunk, stepBpm, startBpm,
  SWAP, swapPairs, rateSwap, applySwap, pickSwap, swapQueue, roundOver, weakestSwap, chunkWith,
} from './drill.js';
import { prettyChord } from './chordsym.js';
import { voicingFor, hearTarget, allKeys } from './voicing.js';
import { EAR } from './ear.js';
import { renderGrip, rangeFor } from './keyboard.js';
import { $, showScreen, screenName, frameLoop, modal, setToggle, rand } from './ui.js';

const KEEP = 3; // so viele Durchgänge bleiben für die Anzeige gemerkt

let st = null;
let wired = false;
let wakeLock = null;

function wire() {
  if (wired) return;
  wired = true;
  $('#dr-back').addEventListener('click', close);
  $('#dr-play').addEventListener('click', toggle);
  $('#dr-prev').addEventListener('click', () => go(-1));
  $('#dr-nextbtn').addEventListener('click', () => go(1));
  $('#dr-repeat').addEventListener('click', () => { st.repeat = !st.repeat; paintControls(); paintNext(); });
  $('#dr-slower').addEventListener('click', () => setBpm(-1));
  $('#dr-faster').addEventListener('click', () => setBpm(1));
  $('#dr-mode-takt').addEventListener('click', () => setMode('takt'));
  $('#dr-mode-swap').addEventListener('click', () => setMode('swap'));
  $('#dr-mic').addEventListener('click', toggleMic);
  $('#dr-transfer').addEventListener('click', transfer);
  // Ohne Mikrofon: Antippen heißt „liegt“.
  $('.dr-stage').addEventListener('click', (e) => { if (!e.target.closest('button')) swapTap(); });
  document.addEventListener('keydown', onKey);
}

/** Folgen üben. chunks aus drill.drillChunks (für dieselben `sectionIds`);
 *  onBack: zurück zur Liedseite. */
export function openDrill(song, chunks, onBack, { sectionIds = null } = {}) {
  wire();
  st = {
    song, chunks, onBack, idx: 0, repeat: false, running: false, cycles: [],
    bpm: startBpm(song, S.settings.drillBpm?.[song.id]), shown: null, phaseKey: null, stop: null,
    mode: S.settings.drillMode === 'swap' ? 'swap' : 'takt', swaps: swapPairs(song, { sectionIds }), sw: null,
  };
  $('#dr-song').textContent = song.title;
  showScreen('drill');
  paintMode();
  st.stop = frameLoop(tick);
}

function close() {
  if (!st) return;
  halt();
  swapStop();
  if (mic.isOpen()) mic.close();
  st.stop?.();
  const back = st.onBack;
  st = null;
  back?.();
}

/* ---------- Ablauf ------------------------------------------------------ */

async function toggle() {
  if (st.mode === 'swap') { if (st.sw?.on) { swapStop(); swapIdle(); } else await swapStart(); return; }
  if (st.running) { halt(); paintIdle(); return; }
  await audio.unlock();
  if (!st) return;
  begin(st.idx);
}

/** Ab Folge `idx` loslegen (mit Vorlauf). */
function begin(idx) {
  halt();
  st.running = true;
  st.gen = (st.gen || 0) + 1;
  startCycle(audio.getCtx().currentTime + 0.12, idx, st.gen);
  keepAwake();
  paintControls();
}

/** Alles anhalten; schon geplante Klicks (≤ 150 ms) klingen noch aus. */
function halt() {
  for (const c of st.cycles) c.clock.stop();
  st.cycles = [];
  st.running = false;
  st.phaseKey = null;
  releaseAwake();
  paintControls();
}

/** Einen Durchgang (Vorlauf + Folge) zur Audiozeit `at` planen; beim
 *  letzten Schlag wird der nächste nahtlos dahinter geplant. */
function startCycle(at, idx, gen) {
  const bpb = st.song.beatsPerBar;
  const chunk = st.chunks[idx];
  const total = cycleBeats(chunk, bpb);
  const leadBeats = DRILL.lead * bpb;
  const cyc = { idx, bpm: st.bpm, t0: at, clock: null };
  cyc.clock = createClock(audio.getCtx(), {
    bpm: cyc.bpm, totalSteps: total, stepsPerBeat: 1, beatsPerBar: bpb,
    onStep: (step) => {
      // Einzählen etwas lauter, die Eins betont.
      audio.click(step.time, step.beat === 0, step.index < leadBeats ? 0.9 : 0.65);
      if (step.index === total - 1 && st?.running && st.gen === gen) {
        startCycle(cyc.clock.endTime, nextChunk(idx, st.chunks.length, st.repeat), gen);
      }
    },
  });
  st.cycles.push(cyc);
  if (st.cycles.length > KEEP) st.cycles.shift();
  cyc.clock.start(at);
}

/** Vorige/nächste Folge. Läuft es, geht es dort mit Vorlauf weiter. */
function go(dir) {
  if (st.mode === 'swap') { if (dir > 0 && st.sw?.on) swapSkip(); return; }
  const n = st.chunks.length;
  const idx = (st.idx + dir + n) % n;
  if (st.running) begin(idx);
  else { paintChunk(idx); paintIdle(); }
}

function setBpm(dir) {
  st.bpm = stepBpm(st.bpm, dir);
  S.settings.drillBpm = { ...(S.settings.drillBpm || {}), [st.song.id]: st.bpm };
  saveSettings();
  paintControls();
}

function onKey(e) {
  if (!st || screenName() !== 'drill' || !$('#modal').hidden) return;
  if (e.target.closest?.('input, textarea, select')) return;
  if (e.key === ' ') { e.preventDefault(); toggle(); }
  else if (e.key === 'Enter' && st.mode === 'swap') { e.preventDefault(); swapTap(); }
  else if (st.mode === 'swap') { if (e.key === 'ArrowRight') { e.preventDefault(); go(1); } }
  else if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1); }
  else if (e.key === 'ArrowRight') { e.preventDefault(); go(1); }
  else if (e.key === 'r' || e.key === 'R') $('#dr-repeat').click();
  else if (e.key === '+') setBpm(1);
  else if (e.key === '-') setBpm(-1);
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

/* ---------- Anzeige ----------------------------------------------------- */

function tick() {
  if (!st || screenName() !== 'drill') return;
  if (st.mode === 'swap') { swapTick(); return; }
  if (!st.running) return;
  const now = audio.audibleNow();
  let cyc = st.cycles[0];
  for (const c of st.cycles) if (c.t0 <= now) cyc = c;
  if (!cyc) return;
  if (cyc.idx !== st.shown) paintChunk(cyc.idx);
  const bpb = st.song.beatsPerBar;
  const beat = Math.max(0, (now - cyc.t0) / (60 / cyc.bpm));
  const ph = cyclePhase(st.chunks[cyc.idx], bpb, beat);
  const key = !ph ? 'end' : ph.lead ? `l${ph.left}` : `c${ph.cell}`;
  if (key === st.phaseKey) return;
  st.phaseKey = key;
  paintPhase(ph);
}

/** Folge `idx` ins Raster (fest: 2 Takte pro Zeile wie im Leadsheet). */
function paintChunk(idx) {
  st.idx = idx;
  st.shown = idx;
  const c = st.chunks[idx];
  const bpb = st.song.beatsPerBar;
  $('#dr-name').textContent = c.name;
  $('#dr-count').textContent = `${idx + 1} / ${st.chunks.length}`;
  const bars = $('#dr-bars');
  bars.className = `sp-bars dr-bars m${bpb}${c.bars === 1 ? ' one' : ''}`;
  bars.replaceChildren(...c.grid.map((b) => {
    const bar = document.createElement('div');
    bar.className = 'sp-bar';
    const no = document.createElement('span');
    no.className = 'sp-no';
    no.textContent = String(b.bar);
    const beats = document.createElement('div');
    beats.className = 'sp-beats';
    beats.style.gridTemplateColumns = `repeat(${bpb}, minmax(0, 1fr))`;
    for (const cell of b.cells) {
      const sp = document.createElement('span');
      sp.className = `sp-bt ${!cell.chord ? 'e' : cell.early ? 'pre' : 'c'}${cell.half ? ' half' : ''}${cell.chord && cell.chord.length > 3 ? ' long' : ''}`;
      sp.textContent = cell.chord || '·';
      beats.append(sp);
    }
    bar.append(no, beats);
    return bar;
  }));
  paintNext();
  $('#dr-live').textContent = c.name;
}

function paintNext() {
  if (!st) return;
  const n = st.chunks.length;
  const next = nextChunk(st.idx, n, st.repeat);
  $('#dr-next').textContent = st.repeat ? 'Danach: dieselbe Folge noch einmal' : n > 1 ? `Danach: ${st.chunks[next].name}` : 'Danach: dieselbe Folge noch einmal';
}

function paintPhase(ph) {
  const cells = [...$('#dr-bars').querySelectorAll('.sp-bt')];
  for (const c of cells) c.classList.remove('cur');
  for (const b of $('#dr-bars').querySelectorAll('.sp-bar')) b.classList.remove('playing');
  const big = $('#dr-big');
  if (!ph) return;
  if (ph.lead) {
    big.textContent = String(ph.left);
    big.className = 'dr-big lead';
    $('#dr-hint').textContent = 'Gleich geht’s los …';
    return;
  }
  const cell = cells[ph.cell];
  cell?.classList.add('cur');
  cell?.closest('.sp-bar')?.classList.add('playing');
  big.textContent = ph.chord || '·';
  big.className = `dr-big${(ph.chord || '').length > 4 ? ' long' : ''}`;
  $('#dr-hint').textContent = ph.next ? `dann ${ph.next}` : '';
}

function paintIdle() {
  const c = st.chunks[st.idx];
  const first = c.grid[0].cells.find((x) => x.chord)?.chord || '';
  for (const x of $('#dr-bars').querySelectorAll('.cur, .playing')) x.classList.remove('cur', 'playing');
  $('#dr-big').textContent = first;
  $('#dr-big').className = `dr-big idle${first.length > 4 ? ' long' : ''}`;
  $('#dr-hint').textContent = 'Start: ein Takt Vorlauf, dann mitspielen.';
}

function paintControls() {
  if (!st) return;
  const swap = st.mode === 'swap';
  const on = swap ? !!st.sw?.on : st.running;
  const btn = $('#dr-play');
  btn.classList.toggle('on', on);
  btn.setAttribute('aria-label', on ? (swap ? 'Stopp' : 'Pause') : 'Start');
  $('#dr-play-icon').setAttribute('d', !on ? 'M8 5l11 7-11 7z' : swap ? 'M6 6h12v12H6z' : 'M7 5h4v14H7zM13 5h4v14h-4z');
  $('#dr-repeat').setAttribute('aria-pressed', st.repeat ? 'true' : 'false');
  $('#dr-bpm').textContent = String(st.bpm);
  $('#dr-slower').disabled = st.bpm <= DRILL.min;
  $('#dr-faster').disabled = st.bpm >= DRILL.max;
  const one = st.chunks.length < 2;
  $('#dr-prev').disabled = $('#dr-nextbtn').disabled = one;
  if (swap) $('#dr-nextbtn').disabled = !on;
}

/* ---------- Umschalter -------------------------------------------------- */

function setMode(mode) {
  if (!st || st.mode === mode) return;
  halt();
  swapStop();
  if (mode === 'takt' && mic.isOpen()) mic.close();
  st.mode = mode;
  S.settings.drillMode = mode;
  saveSettings();
  paintMode();
}

/** Anzeige und Knöpfe zum Modus. */
function paintMode() {
  const swap = st.mode === 'swap';
  setToggle($('#dr-mode-takt'), !swap);
  setToggle($('#dr-mode-swap'), swap);
  $('#dr-bars').hidden = swap;
  $('#dr-taktrow').hidden = swap;
  $('#dr-help-takt').hidden = swap;
  $('#dr-swaprow').hidden = !swap;
  $('#dr-help-swap').hidden = !swap;
  $('#dr-prev').hidden = swap;
  $('#dr-nextbtn').setAttribute('aria-label', swap ? 'Wechsel überspringen' : 'Nächste Folge');
  $('#dr-transfer').hidden = true;
  $('#dr-kb').hidden = true;
  paintControls();
  if (swap) swapIdle();
  else { paintChunk(st.idx); paintIdle(); }
}

/* ---------- Nur Akkorde ------------------------------------------------- */

const sym = (c) => prettyChord(c);
const grip = (c) => voicingFor(st.song, c);
const target = (c) => (c ? hearTarget(c, grip(c)) : null);
const states = () => S.settings.drillSwaps?.[st.song.id] || {};
const fmtSec = (x) => `${x.toFixed(1).replace('.', ',')} s`;
/** Mikrofon an? (null = noch nie gefragt: dann wie „an“ anbieten.) */
const wantMic = () => mic.supported() && S.settings.mic !== false;

/** Neue Runde. */
async function swapStart() {
  if (!st.swaps.pairs.length) {
    $('#dr-hint').textContent = 'Hier gibt es noch keinen Akkordwechsel.';
    return;
  }
  await audio.unlock();
  if (!st) return;
  if (wantMic() && S.settings.mic == null) {
    const a = await modal('Mit Mikrofon üben?',
      'Pianino hört zu, ob der Akkord liegt, und zeigt dann den nächsten – du musst nicht aufs Handy tippen. '
      + 'Es wird nichts aufgenommen oder gespeichert.',
      [{ label: 'Ohne', value: 'no' }, { label: 'Mikrofon an', value: 'yes', primary: true }]);
    S.settings.mic = a === 'yes';
    await saveSettings();
    if (!st) return;
  }
  await syncMic();
  if (!st) return;
  st.sw = { on: true, t0: performance.now(), results: [], queue: [], cur: null, lastKey: null, held: null };
  $('#dr-transfer').hidden = true;
  keepAwake();
  swapNext();
  paintControls();
}

/** Mikrofon zum Schalter öffnen bzw. schließen. */
async function syncMic() {
  if (S.settings.mic && mic.supported() && !mic.isOpen()) {
    $('#dr-hint').textContent = 'Mikrofon wird vorbereitet …';
    if (!(await mic.open())) {
      S.settings.mic = false;
      await saveSettings();
      if (st) $('#dr-hint').textContent = 'Kein Mikrofon erreichbar – dann antippen, sobald der Akkord liegt.';
    }
  }
  if (!S.settings.mic && mic.isOpen()) mic.close();
  if (mic.isOpen()) mic.setPool(st.song.chords.map(target));
  if (st) setToggle($('#dr-mic'), !!S.settings.mic && mic.isOpen(), !mic.supported());
}

async function toggleMic() {
  S.settings.mic = !S.settings.mic;
  await saveSettings();
  if (!st) return;
  if (st.sw?.on || S.settings.mic === false) await syncMic();
  else setToggle($('#dr-mic'), !!S.settings.mic, !mic.supported());
  if (st.sw?.on) swapShow(); // neu ansetzen, mit oder ohne Mikrofon
}

function swapStop() {
  if (!st?.sw) return;
  st.sw.on = false;
  releaseAwake();
  paintControls();
}

/** Nächsten Wechsel holen (Warteschlange, sonst neu ziehen). */
function swapNext() {
  const sw = st.sw;
  if (roundOver(sw.results.length, (performance.now() - sw.t0) / 1000)) { swapEnd(); return; }
  if (!sw.queue.length) {
    const p = pickSwap({ ...st.swaps, states: states(), current: sw.held, lastKey: sw.lastKey, rand });
    if (!p) { swapEnd(); return; }
    sw.queue = swapQueue(p, states()).map((x) => ({ ...x, random: p.random }));
  }
  const q = sw.queue.shift();
  // Liegt A schon (Kette), wird gleich B gemessen; sonst erst A greifen.
  // start: ab wann der Wechsel zählt — Anschlag von A, bzw. in der Kette
  // ab dem Zeigen von B (vorher wusste man ihn nicht).
  sw.cur = { ...q, step: sw.held === q.from ? 'to' : 'from', start: null, missed: false, played: false, shownAt: audio.now(), okRun: 0, heard: '' };
  swapShow();
}

/** Aktuellen Schritt zeigen. */
function swapShow() {
  const c = st.sw.cur;
  c.shownAt = audio.now();
  c.okRun = 0;
  if (c.step === 'to' && c.start == null) c.start = c.shownAt;
  const aim = c.step === 'to' ? c.to : c.from;
  const big = $('#dr-big');
  big.textContent = sym(aim);
  big.className = `dr-big${sym(aim).length > 4 ? ' long' : ''}`;
  $('#dr-name').textContent = `${sym(c.from)} → ${sym(c.to)}${c.random ? ' · Zufall' : ''}`;
  const n = st.sw.results.length;
  $('#dr-count').textContent = `${n} / ${SWAP.roundChanges}`;
  const listening = mic.isOpen();
  $('#dr-hint').textContent = c.step === 'from'
    ? `Erst ${sym(c.from)} greifen${listening ? '' : ' – dann antippen'}.`
    : listening ? 'Jetzt wechseln.' : 'Wechseln, dann antippen.';
  const t = states()[`${c.from}>${c.to}`];
  $('#dr-next').textContent = t?.best != null ? `Bestwert ${sym(c.from)} → ${sym(c.to)}: ${fmtSec(t.best)}` : '';
  // ANNAHME: Die Tastatur steht sofort da, solange der Übergang neu ist oder
  // gerade hakt (Kästchen 1); sonst erst nach SWAP.slowSec (dann ist er ohnehin
  // nicht mehr flüssig) — sonst liest man nur ab.
  c.kb = c.step === 'from' || (t?.box ?? 1) <= 1;
  paintKb(c);
  $('#dr-live').textContent = `${sym(c.from)} nach ${sym(c.to)}`;
}

function paintKb(c) {
  const host = $('#dr-kb');
  const b = grip(c.step === 'to' ? c.to : c.from);
  const a = c.step === 'to' ? grip(c.from) : null;
  host.hidden = !c.kb || !b;
  if (host.hidden) return;
  const range = rangeFor([...allKeys(a), ...allKeys(b)], { min: 15 });
  renderGrip(host, { prev: a, next: b, range, title: `Tastatur: ${sym(c.step === 'to' ? c.to : c.from)}` });
}

/** Akkord liegt (gehört zur Audiozeit `at` angeschlagen, oder getippt). */
function swapGot(at) {
  const sw = st.sw, c = sw.cur;
  $('#dr-big').classList.add('got');
  if (c.step === 'from') {
    sw.held = c.from;
    c.start = at;
    c.step = 'to';
    setTimeout(() => { if (st?.sw?.on && st.sw.cur === c) swapShow(); }, 250);
    return;
  }
  const sec = Math.max(0, at - c.start);
  const key = `${c.from}>${c.to}`;
  const known = st.swaps.pairs.some((p) => p.key === key) || c.random;
  const rating = rateSwap(sec, { bpm: st.song.bpm, missed: c.missed });
  if (known) {
    const all = { ...(S.settings.drillSwaps || {}) };
    const mine = { ...(all[st.song.id] || {}) };
    const before = mine[key]?.best;
    mine[key] = applySwap(mine[key], rating, sec, today());
    all[st.song.id] = mine;
    S.settings.drillSwaps = all;
    saveSettings();
    sw.results.push({ key, from: c.from, to: c.to, rating, sec });
    const word = rating === 'fluent' ? 'flüssig' : rating === 'slow' ? 'noch zögerlich' : c.missed ? 'gehakt' : 'zu lang';
    const best = rating !== 'stuck' && (before == null || sec < before) ? ' · neuer Bestwert' : '';
    $('#dr-hint').textContent = `${fmtSec(sec)} – ${word}${best}`;
  } else {
    $('#dr-hint').textContent = fmtSec(sec);
  }
  sw.lastKey = key;
  sw.held = c.to;
  sw.cur = null;
  setTimeout(() => { if (st?.sw?.on && !st.sw.cur) swapNext(); }, 300);
}

/** Antippen bzw. Enter: ohne Mikrofon „liegt“ (mit nur, wenn der Akkord
 *  noch keinen Griff hat — dann gibt es nichts zu hören). */
function swapTap() {
  const c = st?.sw?.cur;
  if (!st || st.mode !== 'swap' || !st.sw.on || !c) return;
  if (mic.isOpen() && target(c.step === 'to' ? c.to : c.from)) return;
  swapGot(audio.now());
}

/** Überspringen: zählt nicht, der liegende Akkord bleibt. */
function swapSkip() {
  st.sw.queue = [];
  swapNext();
}

/** Je Frame: Hilfe nach der Zeit, Mikrofon lesen. */
function swapTick() {
  const sw = st.sw;
  if (!sw?.on || !sw.cur) return;
  const c = sw.cur;
  const t = audio.now();
  const waited = t - (c.step === 'to' ? c.start ?? c.shownAt : c.shownAt);
  if (c.step === 'to' && !c.kb && waited >= SWAP.slowSec) { c.kb = true; paintKb(c); }
  const aim = c.step === 'to' ? c.to : c.from;
  if (!c.played && waited >= SWAP.helpSec) {
    // Zu lange: vorspielen, zählt als gehakt.
    c.played = true;
    if (c.step === 'to') c.missed = true;
    c.kb = true;
    paintKb(c);
    audio.chord(grip(aim), t + 0.05, { dur: 1.5 });
    if (mic.isOpen()) mic.ignoreUntil(t + 2.2);
    $('#dr-hint').textContent = `So klingt ${sym(aim)}.`;
  }
  if (!mic.isOpen()) return;
  const smp = mic.sample(t, [target(aim)]);
  if (!smp?.fresh) return;
  const onsetAt = t - smp.sinceOnset;
  // Nur ein neuer Anschlag zählt (der alte Akkord klingt noch nach).
  const judging = smp.sinceOnset <= EAR.judge && onsetAt >= c.shownAt - 0.15;
  const prev = c.step === 'to' ? c.from : sw.held;
  if (judging && smp.is(target(aim), target(prev))) {
    if (++c.okRun >= 2) swapGot(onsetAt); // zwei Auswertungen in Folge
    return;
  }
  c.okRun = 0;
  // Fehlgriff (nur essentia nennt einen anderen Akkord): neutral sagen, zählt als gehakt.
  if (judging && smp.chord && smp.chord !== aim && smp.chord !== prev && smp.chord !== c.heard) {
    c.heard = smp.chord;
    if (c.step === 'to') c.missed = true;
    $('#dr-hint').textContent = `Ich höre ${sym(smp.chord)} – gesucht ${sym(aim)}.`;
  }
}

/** Runde vorbei: kurz zusammenfassen, dann die Folge im Takt anbieten. */
function swapEnd() {
  const sw = st.sw;
  swapStop();
  sw.cur = null;
  const r = sw.results;
  const fluent = r.filter((x) => x.rating === 'fluent').length;
  $('#dr-kb').hidden = true;
  $('#dr-big').textContent = 'Fertig';
  $('#dr-big').className = 'dr-big idle';
  $('#dr-count').textContent = `${r.length} / ${SWAP.roundChanges}`;
  $('#dr-name').textContent = `${r.length} Wechsel`;
  $('#dr-hint').textContent = r.length ? `${fluent} davon flüssig.` : '';
  const weak = weakestSwap(r);
  $('#dr-next').textContent = weak ? `Am meisten gehakt: ${sym(weak.from)} → ${sym(weak.to)}` : r.length ? 'Alles flüssig.' : '';
  const i = weak ? chunkWith(st.song, st.chunks, weak.from, weak.to) : -1;
  const btn = $('#dr-transfer');
  btn.hidden = i < 0;
  btn.dataset.idx = String(i);
  if (i >= 0) btn.textContent = `${sym(weak.from)} → ${sym(weak.to)} jetzt im Takt`;
}

/** Zur Folge mit dem schwächsten Wechsel, im Takt. */
function transfer() {
  const i = Number($('#dr-transfer').dataset.idx);
  if (!(i >= 0)) return;
  st.idx = i;
  setMode('takt');
}

/** Vor dem Start. */
function swapIdle() {
  const { pairs } = st.swaps;
  const sts = states();
  const solid = pairs.filter((p) => (sts[p.key]?.box ?? 1) >= SWAP.solidBox).length;
  $('#dr-kb').hidden = true;
  $('#dr-count').textContent = '';
  $('#dr-name').textContent = pairs.length ? `${pairs.length} Wechsel im Stück` : '';
  $('#dr-big').textContent = pairs.length ? `${sym(pairs[0].from)} → ${sym(pairs[0].to)}` : '';
  $('#dr-big').className = 'dr-big idle long';
  $('#dr-hint').textContent = pairs.length ? 'Start: immer ein Akkord, liegt er, kommt der nächste.' : 'Hier gibt es noch keinen Akkordwechsel.';
  $('#dr-next').textContent = !pairs.length ? '' : solid === pairs.length
    ? 'Alle Wechsel sitzen – jetzt kommen auch Zufallswechsel.'
    : `${solid} von ${pairs.length} sitzen. Erst die echten Wechsel, die schwachen öfter.`;
  setToggle($('#dr-mic'), !!S.settings.mic && mic.supported(), !mic.supported());
}
