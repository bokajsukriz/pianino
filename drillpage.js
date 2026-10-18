/* drillpage.js — „Folgen üben“: die 2-Takt-Folgen aus dem Leadsheet
   (drill.js) zum Klick mitspielen. Jede Folge kommt mit einem Takt Vorlauf
   (Folge schon sichtbar, Klick zählt groß ein), dann 2 Takte zum Klick;
   danach der Vorlauf der nächsten Folge. „Wiederholen“ bleibt bei derselben,
   Tempo ±5 gilt ab dem nächsten Vorlauf. Ohne Mikrofon: man spielt einfach
   mit. Audio-Timing über clock.js (Lookahead auf der AudioContext-Uhr), die
   Anzeige folgt per requestAnimationFrame der hörbaren Audiozeit. Tasten:
   Leertaste Start/Pause, ←/→ Folge, R Wiederholen, +/− Tempo. */

import * as audio from './audio.js';
import { createClock } from './clock.js';
import { S, saveSettings } from './store.js';
import { DRILL, cycleBeats, cyclePhase, nextChunk, stepBpm, startBpm } from './drill.js';
import { $, showScreen, screenName, frameLoop } from './ui.js';

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
  document.addEventListener('keydown', onKey);
}

/** Folgen üben. chunks aus drill.drillChunks; onBack: zurück zur Liedseite. */
export function openDrill(song, chunks, onBack) {
  wire();
  st = {
    song, chunks, onBack, idx: 0, repeat: false, running: false, cycles: [],
    bpm: startBpm(song, S.settings.drillBpm?.[song.id]), shown: null, phaseKey: null, stop: null,
  };
  $('#dr-song').textContent = song.title;
  showScreen('drill');
  paintControls();
  paintChunk(0);
  paintIdle();
  st.stop = frameLoop(tick);
}

function close() {
  if (!st) return;
  halt();
  st.stop?.();
  const back = st.onBack;
  st = null;
  back?.();
}

/* ---------- Ablauf ------------------------------------------------------ */

async function toggle() {
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
  if (!st || screenName() !== 'drill' || !st.running) return;
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
  const btn = $('#dr-play');
  btn.classList.toggle('on', st.running);
  btn.setAttribute('aria-label', st.running ? 'Pause' : 'Start');
  $('#dr-play-icon').setAttribute('d', st.running ? 'M7 5h4v14H7zM13 5h4v14h-4z' : 'M8 5l11 7-11 7z');
  $('#dr-repeat').setAttribute('aria-pressed', st.repeat ? 'true' : 'false');
  $('#dr-bpm').textContent = String(st.bpm);
  $('#dr-slower').disabled = st.bpm <= DRILL.min;
  $('#dr-faster').disabled = st.bpm >= DRILL.max;
  const one = st.chunks.length < 2;
  $('#dr-prev').disabled = $('#dr-nextbtn').disabled = one;
}
