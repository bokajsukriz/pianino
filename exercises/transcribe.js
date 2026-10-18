/* exercises/transcribe.js — Transkribieren (Arbeitsanweisung Transkription 7):
   die Akkordwechsel selbst heraushören, mit dem YouTube-Video, verlangsamt
   und im Loop, und eintippen. Vier Schritte, jeder jederzeit erreichbar:
     1 Video und Tempo   Link/ID laden, Tempo aus dem JSON oder per Tippen
     2 Die Eins          „Hier ist Takt 1“, ±20 ms, ±1 Schlag, Raster-Check
                         mit Schlagpunkten und leisem Klick (Zeit aus yt.js,
                         nicht clock.js — reicht für die Kontrolle)
     3 Wechsel tippen    ein Knopf je Akkord (Tasten 1–9, Leertaste = Pause),
                         auf ½ bzw. ¼ Schlag gerastert, Rückgängig mehrstufig
     4 Prüfen            Band mit dem Video, Ereignis antippen: ±Raster,
                         Akkord ändern, löschen; „Klavier dazu“ (clock.js);
                         Abschnitte; Text (bleibt auf dem Gerät); „Fertig gehört“
   Alles wird laufend in song:<id> gespeichert. Reine Logik in tap.js,
   timeline.js und songdata.js. */

import * as audio from '../audio.js';
import * as yt from '../yt.js';
import { createBand } from '../band.js';
import { S, putSong, saveSettings } from '../store.js';
import { parseYouTubeId, tapTempo } from '../tap.js';
import {
  youtubeSource, secToBeat, beatToSec, quantize, barOf, countLabel, songEndBeat, sectionRange,
} from '../timeline.js';
import {
  setYoutube, setEvent, removeEvent, moveEvent, changeEvent, addChord, setSectionStart, removeSection,
  nextSectionName, relayoutSections, gridOf,
} from '../songdata.js';
import { parseChord, prettyChord, sameChord } from '../chordsym.js';
import { voicingFor } from '../voicing.js';
import { stepHits } from '../accomp.js';
import { createClock } from '../clock.js';
import { $, $$, showScreen, screenName, modal, ask, frameLoop, makeDots, setDots, fmtTime } from '../ui.js';

const SECTION_NAMES = ['Intro', 'Strophe', 'Pre-Chorus', 'Refrain', 'Bridge', 'Outro'];
const EPS = 1e-6;

let st = null;
let wired = false;

const song = () => S.songs.get(st.songId);
const leadSec = () => Math.max(0, Math.min(300, S.settings.leadMs ?? 80)) / 1000;
/** Zeitleiste steht (Tempo und Takt 1 festgelegt)? */
const timed = (s = song()) => !!s.bpm && youtubeSource(s)?.offsetSec != null;

function say(text) { $('#tr-status').textContent = text; }

/** Song speichern; mit undo: vorher einen Rückgängig-Schritt ablegen. */
async function commit(next, { undo = true } = {}) {
  const cur = song();
  if (undo) st.undo.push(JSON.parse(JSON.stringify(cur)));
  if (st.undo.length > 200) st.undo.shift();
  // ¼-Raster im Song nur, solange ein Ereignis darauf liegt.
  const quarter = next.events.some((e) => Math.abs(e.at * 2 - Math.round(e.at * 2)) > EPS);
  const out = { ...next };
  if (quarter) out.grid = 0.25; else delete out.grid;
  st.version++;
  await putSong(out);
  paintStatic();
}

function wire() {
  if (wired) return;
  wired = true;
  $('#tr-back').addEventListener('click', () => close());
  for (const b of $$('#s-tr [data-step-btn]')) b.addEventListener('click', () => goStep(Number(b.dataset.stepBtn)));
  $('#tr-load').addEventListener('click', loadFromInput);
  $('#tr-url').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); loadFromInput(); } });
  $('#tr-play').addEventListener('click', togglePlay);
  $('#tr-rew').addEventListener('click', () => { if (st.player) st.player.seek(st.player.now() - 2); });
  $('#tr-undo').addEventListener('click', undo);
  $('#tr-bpm-down').addEventListener('click', () => setBpm((song().bpm || 80) - 1));
  $('#tr-bpm-up').addEventListener('click', () => setBpm((song().bpm || 80) + 1));
  $('#tr-tap').addEventListener('click', tapBeat);
  $('#tr-one').addEventListener('click', markOne);
  for (const b of $$('#s-tr [data-nudge]')) b.addEventListener('click', () => nudge(b.dataset.nudge));
  $('#tr-click').addEventListener('click', () => { st.click = !st.click; $('#tr-click').setAttribute('aria-pressed', st.click ? 'true' : 'false'); });
  $('#tr-lead').addEventListener('input', () => { S.settings.leadMs = Number($('#tr-lead').value); $('#tr-lead-v').textContent = `${S.settings.leadMs} ms`; });
  $('#tr-lead').addEventListener('change', saveSettings);
  for (const b of $$('#s-tr [data-grid]')) b.addEventListener('click', () => { st.grid = Number(b.dataset.grid); paintStatic(); });
  $('#tr-loop').addEventListener('click', () => { st.loop = !st.loop; paintStatic(); });
  $('#tr-loop-sec').addEventListener('change', () => {
    const sec = song().sections.find((s) => s.id === $('#tr-loop-sec').value);
    if (sec) { $('#tr-loop-a').value = sec.bar; $('#tr-loop-b').value = sec.bar + sec.bars - 1; st.loop = true; paintStatic(); }
  });
  $('#tr-piano').addEventListener('click', () => { st.piano = !st.piano; if (!st.piano) stopPiano(); paintStatic(); });
  $('#tr-secstart').addEventListener('click', sectionHere);
  $('#tr-lyrics-text').addEventListener('change', saveLyricsText);
  $('#tr-lyrics-tap').addEventListener('click', tapLyric);
  $('#tr-lyrics-reset').addEventListener('click', () => { st.lyricIdx = 0; paintLyrics(); });
  $('#tr-done').addEventListener('click', doneHearing);
  $('#tr-sel-left').addEventListener('click', () => shiftSel(-1));
  $('#tr-sel-right').addEventListener('click', () => shiftSel(1));
  $('#tr-sel-del').addEventListener('click', deleteSel);
  $('#tr-sel-chord').addEventListener('change', () => changeSel($('#tr-sel-chord').value));
  document.addEventListener('keydown', onKey);
}

/** Editor öffnen. → Promise, erfüllt mit „Zurück“. */
export function openTranscribe(songId) {
  wire();
  const s = S.songs.get(songId);
  if (!s) return Promise.resolve();
  return new Promise((resolve) => {
    st = {
      songId, resolve, step: 1, player: null, undo: [], version: 0, grid: gridOf(s), loop: false, click: false,
      piano: false, pianoClock: null, taps: [], sel: null, lyricIdx: 0, stopFrame: null, lastBeat: null, rate: 1,
    };
    $('#tr-title').textContent = s.title;
    st.band = createBand($('#tr-band'), { onPick: (at) => { st.sel = at; goStep(4); paintSel(); } });
    $('#tr-lead').value = String(S.settings.leadMs ?? 80);
    $('#tr-lead-v').textContent = `${S.settings.leadMs ?? 80} ms`;
    const src = youtubeSource(s);
    $('#tr-url').value = src?.videoId || '';
    $('#tr-vnote').textContent = src?.videoId ? '' : 'Noch kein Video. Link oder ID eingeben und „Laden“.';
    showScreen('tr');
    goStep(!src?.videoId || !s.bpm ? 1 : src.offsetSec == null ? 2 : 3);
    if (src?.videoId) loadVideo(src.videoId);
    st.stopFrame = frameLoop(tick);
    audio.preloadPiano();
  });
}

function close() {
  if (!st) return;
  st.stopFrame?.();
  stopPiano();
  st.player?.destroy();
  const r = st.resolve;
  st = null;
  r?.();
}

/* ---------- Schritte und Anzeige --------------------------------------- */

function goStep(n) {
  st.step = n;
  for (const el of $$('#s-tr .tr-step')) el.hidden = Number(el.dataset.step) !== n;
  for (const b of $$('#s-tr [data-step-btn]')) b.setAttribute('aria-pressed', Number(b.dataset.stepBtn) === n ? 'true' : 'false');
  $('#tr-chords').hidden = n !== 3;
  $('#tr-band').hidden = n < 3;
  if (n === 3 && st.player && st.rate === 1 && st.player.rates().includes(0.75)) setRate(0.75);
  paintStatic();
}

/** Alles, was sich nur bei Änderungen ändert. */
function paintStatic() {
  if (!st) return;
  const s = song();
  const src = youtubeSource(s);
  $('#tr-bpm').textContent = s.bpm ? String(s.bpm) : '–';
  $('#tr-offset').textContent = src?.offsetSec != null
    ? `Takt 1 bei ${fmtSec(src.offsetSec)}` : 'Takt 1 ist noch nicht gesetzt.';
  for (const b of $$('#s-tr [data-grid]')) b.setAttribute('aria-pressed', Number(b.dataset.grid) === st.grid ? 'true' : 'false');
  $('#tr-loop').setAttribute('aria-pressed', st.loop ? 'true' : 'false');
  $('#tr-piano').setAttribute('aria-pressed', st.piano ? 'true' : 'false');
  $('#tr-undo').disabled = !st.undo.length;
  $('#tr-done').textContent = s.verified ? 'Gegengehört ✓' : 'Fertig gehört';
  makeDots($('#tr-dots'), s.beatsPerBar);
  // Akkordknöpfe (Schritt 3)
  $('#tr-chords').replaceChildren(...s.chords.map((sym, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn tr-chord';
    b.dataset.sym = sym;
    b.innerHTML = '';
    const k = document.createElement('small');
    k.textContent = i < 9 ? String(i + 1) : '';
    const n = document.createElement('b');
    n.textContent = prettyChord(sym);
    b.append(k, n);
    b.addEventListener('click', () => tapChord(sym));
    return b;
  }), (() => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn btn-secondary tr-chord tr-add';
    b.textContent = '+ Akkord';
    b.addEventListener('click', addSymbol);
    return b;
  })());
  // Abschnitte
  const sel = $('#tr-loop-sec');
  sel.replaceChildren(new Option('Abschnitt …', ''), ...s.sections.map((x) => new Option(`${x.name} (T. ${x.bar}–${x.bar + x.bars - 1})`, x.id)));
  $('#tr-seclist').replaceChildren(...s.sections.map((x) => {
    const li = document.createElement('li');
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip-sm';
    b.textContent = `${x.name} · T. ${x.bar}–${x.bar + x.bars - 1}`;
    b.addEventListener('click', () => sectionMenu(x));
    li.append(b);
    return li;
  }));
  if (!$('#tr-secname').options.length) {
    $('#tr-secname').replaceChildren(...SECTION_NAMES.map((n) => new Option(n, n)));
    $('#tr-secname').value = 'Strophe';
  }
  paintSel();
  paintLyrics();
  st.band.reset();
}

/** 72.345 → „1:12,35“ */
function fmtSec(sec) {
  const m = Math.floor(sec / 60), rest = sec - m * 60;
  return `${m}:${rest.toFixed(2).padStart(5, '0').replace('.', ',')}`;
}

function paintSel() {
  const s = song();
  const box = $('#tr-sel');
  const e = st.sel == null ? null : s.events.find((x) => Math.abs(x.at - st.sel) < EPS);
  box.hidden = !e;
  if (!e) { $('#tr-sel-none').hidden = false; return; }
  $('#tr-sel-none').hidden = true;
  $('#tr-sel-label').textContent = `${prettyChord(e.chord)} · Takt ${barOf(s, e.at)}, ${countLabel(s, e.at)}`;
  const sel = $('#tr-sel-chord');
  sel.replaceChildren(...s.chords.map((c) => new Option(prettyChord(c), c)));
  sel.value = e.chord;
}

function paintLyrics() {
  const s = song();
  const lines = s.lyrics || [];
  if (document.activeElement !== $('#tr-lyrics-text')) $('#tr-lyrics-text').value = lines.map((l) => l.line).join('\n');
  const next = lines[st.lyricIdx];
  $('#tr-lyrics-info').textContent = !lines.length ? ''
    : next ? `Nächste Zeile (${st.lyricIdx + 1} von ${lines.length}): ${next.line}` : 'Alle Zeilen getippt.';
  $('#tr-lyrics-tap').disabled = !next || !timed(s);
}

/** Je Frame: Zeit, Takt, Band, Loop, Raster-Klick, Klavier dazu. */
function tick() {
  if (!st || screenName() !== 'tr') return;
  const s = song();
  const p = st.player;
  const t = p ? p.now() : 0;
  const playing = !!p?.playing();
  $('#tr-play').textContent = playing ? 'Pause' : 'Abspielen';
  if (!timed(s)) {
    $('#tr-time').textContent = p ? fmtTime(t) : '';
    return;
  }
  const lead = leadSec();
  const shown = secToBeat(s, t + lead);   // Anzeige: dem Ton voraus
  const heard = secToBeat(s, t);
  const bpb = s.beatsPerBar;
  $('#tr-time').textContent = `${fmtTime(t)} · ${shown < 0 ? 'vor Takt 1' : `Takt ${barOf(s, shown)}, ${Math.floor(((shown % bpb) + bpb) % bpb) + 1}`}`;
  setDots($('#tr-dots'), shown < 0 ? -1 : Math.floor(((shown % bpb) + bpb) % bpb));
  if (st.step >= 3) st.band.update(s, shown, { selected: st.step === 4 ? st.sel : null, version: st.version });
  // Raster-Klick: beim Überschreiten eines Schlags (gehörte Zeit).
  if (st.click && playing && st.step === 2 && st.lastBeat != null && Math.floor(heard) > Math.floor(st.lastBeat) && heard >= 0) {
    audio.click(audio.now() + 0.01, Math.floor(heard) % bpb === 0, 0.35);
  }
  // Loop A–B (Takte): an B zurück zu A minus einem Takt Vorlauf.
  if (st.loop && playing) {
    const a = Math.max(1, Number($('#tr-loop-a').value) || 1), b = Math.max(a, Number($('#tr-loop-b').value) || a);
    if (heard >= b * bpb) p.seek(beatToSec(s, (a - 2) * bpb) - lead);
  }
  // Klavier dazu: Uhr neu ansetzen, wenn sie vom Video wegläuft.
  if (st.piano && st.step === 4) syncPiano(s, playing, heard);
  st.lastBeat = heard;
}

/* ---------- Video ------------------------------------------------------ */

async function loadFromInput() {
  const id = parseYouTubeId($('#tr-url').value);
  if (!id) { say('Das ist kein YouTube-Link und keine Video-ID.'); return; }
  const src = youtubeSource(song());
  if (src?.videoId !== id) await commit(setYoutube(song(), { videoId: id, offsetSec: src?.videoId === id ? src.offsetSec : null, durationSec: 0 }));
  loadVideo(id);
}

async function loadVideo(id) {
  st.player?.destroy();
  st.player = null;
  $('#tr-vnote').textContent = 'Video lädt …';
  const mine = st;
  try {
    const p = await yt.create($('#tr-yt'), id, {
      onError: (code) => { if (st === mine) $('#tr-vnote').textContent = yt.errorText(code); },
      onState: (state) => {
        if (st !== mine) return;
        if (state === 'playing' && $('#tr-vnote').textContent.startsWith('Startet')) $('#tr-vnote').textContent = '';
        if (state !== 'playing') stopPiano();
      },
    });
    if (st !== mine) { p.destroy(); return; }
    st.player = p;
    $('#tr-vnote').textContent = '';
    const dur = p.duration();
    const src = youtubeSource(song());
    if (dur > 0 && Math.abs((src?.durationSec || 0) - dur) > 0.5) await commit(setYoutube(song(), { durationSec: Math.round(dur * 10) / 10 }), { undo: false });
    paintRates();
  } catch (e) {
    if (st !== mine) return;
    $('#tr-vnote').textContent = e?.message === 'offline'
      ? 'Kein Netz – YouTube lässt sich nicht laden. Griffe und Abschnitte gehen trotzdem; zum Heraushören braucht es das Video.'
      : yt.errorText(e?.message);
  }
}

function paintRates() {
  const rates = (st.player?.rates() || [1]).filter((r) => [0.5, 0.75, 1].includes(r));
  $('#tr-rates').replaceChildren(...rates.map((r) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'seg-btn';
    b.textContent = `${String(r).replace('.', ',')}×`;
    b.setAttribute('aria-pressed', r === st.rate ? 'true' : 'false');
    b.addEventListener('click', () => setRate(r));
    return b;
  }));
}

function setRate(r) {
  st.rate = r;
  st.player?.setRate(r);
  stopPiano();
  paintRates();
}

function togglePlay() {
  const p = st?.player;
  if (!p) { say('Erst ein Video laden.'); return; }
  audio.unlock();
  if (p.playing()) p.pause();
  else {
    p.play();
    setTimeout(() => { if (st?.player === p && !p.playing()) $('#tr-vnote').textContent = 'Startet nicht? Einmal direkt aufs Video tippen.'; }, 2500);
  }
}

/** Jetzt-Zeit für Tipps: die gehörte Stelle (Video-Zeit minus Anzeige-Vorlauf). */
const tapSec = () => (st.player ? st.player.now() - leadSec() : null);

/* ---------- Schritt 1: Tempo ------------------------------------------ */

async function setBpm(b) {
  const bpm = Math.max(30, Math.min(220, Math.round(b)));
  await commit({ ...song(), bpm });
}

function tapBeat() {
  const p = st.player;
  // Video-Zeit, solange es läuft (stimmt auch bei 0,75×), sonst die Uhr.
  const t = p?.playing() ? p.now() : performance.now() / 1000;
  const src = p?.playing() ? 'v' : 'c';
  if (st.taps.length && (st.tapSrc !== src || t - st.taps[st.taps.length - 1] > 2.5 || t < st.taps[st.taps.length - 1])) st.taps = [];
  st.tapSrc = src;
  st.taps.push(t);
  const r = tapTempo(st.taps);
  if (r.bpm) {
    $('#tr-tapinfo').textContent = `${r.taps} Tipps: ${r.bpm} BPM übernommen`;
    if (r.bpm !== song().bpm) setBpm(r.bpm);
  } else $('#tr-tapinfo').textContent = `${r.taps} Tipps – noch ${r.need}`;
}

/* ---------- Schritt 2: Die Eins ---------------------------------------- */

async function markOne() {
  const t = tapSec();
  if (t == null) { say('Erst ein Video laden.'); return; }
  await commit(setYoutube(song(), { offsetSec: Math.max(0, Math.round(t * 1000) / 1000) }));
  say(`Takt 1 bei ${fmtSec(Math.max(0, t))}.`);
}

async function nudge(kind) {
  const s = song(), src = youtubeSource(s);
  if (src?.offsetSec == null) { say('Erst „Hier ist Takt 1“ tippen.'); return; }
  const beat = s.bpm ? 60 / s.bpm : 0.75;
  const by = { '-beat': -beat, '-20': -0.02, '+20': 0.02, '+beat': beat }[kind] || 0;
  await commit(setYoutube(s, { offsetSec: Math.max(0, Math.round((src.offsetSec + by) * 1000) / 1000) }));
}

/* ---------- Schritt 3: Wechsel tippen ---------------------------------- */

async function tapChord(sym) {
  const s = song();
  if (!timed(s)) { say('Erst Tempo (Schritt 1) und Takt 1 (Schritt 2) festlegen.'); return; }
  const t = tapSec();
  if (t == null) return;
  const at = quantize(secToBeat(s, t), st.grid);
  if (at < 0) { say('Vor Takt 1 – da gibt es noch keinen Wechsel.'); return; }
  await commit(setEvent(s, at, sym));
  st.sel = at;
  say(`${prettyChord(sym)} ab Takt ${barOf(s, at)}, ${countLabel(s, at)}`);
}

async function addSymbol() {
  const t = await ask('Neuer Akkord', 'Symbol wie Am, D/F#, F6/9.', { placeholder: 'z. B. G/B', ok: 'Anhängen' });
  if (!t) return;
  if (!parseChord(t)) { say(`„${t}“ kann die App nicht lesen.`); return; }
  if (song().chords.some((c) => sameChord(c, t))) { say(`${prettyChord(t)} gibt es schon.`); return; }
  await commit(addChord(song(), t));
}

async function undo() {
  const prev = st.undo.pop();
  if (!prev) return;
  st.version++;
  await putSong(prev);
  paintStatic();
  say('Rückgängig.');
}

function onKey(e) {
  if (!st || screenName() !== 'tr' || !$('#modal').hidden) return;
  if (e.target.closest?.('input, textarea, select')) return;
  if (e.key === ' ') { e.preventDefault(); togglePlay(); return; }
  if (st.step === 3 && /^[1-9]$/.test(e.key)) {
    const sym = song().chords[Number(e.key) - 1];
    if (sym) { e.preventDefault(); tapChord(sym); }
  }
}

/* ---------- Schritt 4: Prüfen ------------------------------------------ */

async function shiftSel(dir) {
  if (st.sel == null) return;
  const r = moveEvent(song(), st.sel, dir * st.grid);
  if (r.at === st.sel) { say('Weiter geht es nicht – da liegt schon ein Wechsel.'); return; }
  st.sel = r.at;
  await commit(r.song);
}

async function deleteSel() {
  if (st.sel == null) return;
  const at = st.sel;
  st.sel = null;
  await commit(removeEvent(song(), at));
}

async function changeSel(sym) {
  if (st.sel == null) return;
  await commit(changeEvent(song(), st.sel, sym));
}

/** Letzter Takt des Songs: aus der Videolänge oder den Ereignissen. */
function endBar(s) {
  const src = youtubeSource(s);
  let end = songEndBeat(s);
  if (src?.durationSec && timed(s)) end = Math.max(end, secToBeat(s, src.durationSec));
  return Math.max(1, Math.ceil(end / s.beatsPerBar - EPS));
}

async function sectionHere() {
  const s = song();
  if (!timed(s)) { say('Erst Tempo und Takt 1 festlegen.'); return; }
  const t = tapSec();
  const beat = st.sel != null && !st.player?.playing() ? st.sel : t != null ? secToBeat(s, t) : 0;
  const bar = Math.max(1, barOf(s, Math.max(0, beat)));
  const name = nextSectionName(s, $('#tr-secname').value);
  await commit(setSectionStart(s, bar, name, Math.max(endBar(s), bar)));
  say(`${name} beginnt bei Takt ${bar}.`);
}

async function sectionMenu(sec) {
  const a = await modal(sec.name, `Takt ${sec.bar} bis ${sec.bar + sec.bars - 1}`, [
    { label: 'Löschen', value: 'del' }, { label: 'Umbenennen', value: 'ren' }, { label: 'Hinspringen', value: 'go', primary: true },
  ]);
  const s = song();
  if (a === 'go' && st.player && timed(s)) st.player.seek(beatToSec(s, sectionRange(s, sec).fromBeat - s.beatsPerBar) - leadSec());
  else if (a === 'del') await commit(removeSection(s, sec.id, endBar(s)));
  else if (a === 'ren') {
    const t = await ask('Abschnitt umbenennen', '', { value: sec.name, ok: 'Umbenennen' });
    if (t) await commit(relayoutSections({ ...s, sections: s.sections.map((x) => (x.id === sec.id ? { ...x, name: t } : x)) }, endBar(s)));
  }
}

async function saveLyricsText() {
  const s = song();
  const old = s.lyrics || [];
  const lines = $('#tr-lyrics-text').value.split('\n').map((l) => l.trim()).filter(Boolean);
  const lyrics = lines.map((line, i) => ({ at: old[i]?.line === line ? old[i].at : (old[i]?.at ?? null), line }));
  const next = { ...s, lyrics };
  if (!lines.length) delete next.lyrics;
  st.lyricIdx = Math.min(st.lyricIdx, lyrics.length);
  await commit(next);
}

/** Beim Abspielen pro Zeile einmal tippen; gerastert auf ganze Schläge. */
async function tapLyric() {
  const s = song();
  const t = tapSec();
  if (t == null || !timed(s)) return;
  const lines = [...(s.lyrics || [])];
  if (!lines[st.lyricIdx]) return;
  const at = Math.max(0, quantize(secToBeat(s, t), 1));
  lines[st.lyricIdx] = { ...lines[st.lyricIdx], at };
  // Spätere Zeilen, die davor lägen, werden zurückgesetzt.
  for (let i = st.lyricIdx + 1; i < lines.length; i++) if (lines[i].at != null && lines[i].at < at) lines[i] = { ...lines[i], at: null };
  st.lyricIdx++;
  await commit({ ...s, lyrics: lines });
}

async function doneHearing() {
  const s = song();
  if (s.verified) {
    const a = await modal('Gegengehört', 'Wieder als „nicht gegengehört“ markieren?', [{ label: 'Nein', value: 'no' }, { label: 'Ja', value: 'yes', primary: true }]);
    if (a === 'yes') await commit({ ...s, verified: false });
    return;
  }
  const a = await modal('Mit der Aufnahme gegengehört?', 'Dann gilt der Song als geprüft. Ändern kannst du später trotzdem alles.',
    [{ label: 'Noch nicht', value: 'no' }, { label: 'Ja, gegengehört', value: 'yes', primary: true }]);
  if (a === 'yes') await commit({ ...s, verified: true });
}

/* ---------- Klavier dazu ----------------------------------------------- */

function stopPiano() {
  st?.pianoClock?.stop();
  if (st) st.pianoClock = null;
}

/** Uhr synchron zur Zeitleiste starten (bpm × Rate); weicht sie mehr als
 *  ¼ Schlag vom Video ab (Sprung, Loop, Rate), neu ansetzen. */
function syncPiano(s, playing, heard) {
  if (!playing) { stopPiano(); return; }
  const rate = st.player.rate() || 1;
  const pc = st.pianoClock;
  if (pc) {
    const clockBeat = pc.startBeat + pc.position(audio.now()) / 2;
    if (Math.abs(clockBeat - heard) < 0.25 && pc.rate === rate) return;
    stopPiano();
  }
  const ctx = audio.getCtx();
  if (ctx.state !== 'running') return;
  const startBeat = Math.ceil(heard * 2 + 0.2) / 2; // nächstes Achtel mit etwas Luft
  const delay = ((startBeat - heard) * 60) / s.bpm / rate;
  const grip = (sym) => voicingFor(s, sym);
  const clock = createClock(ctx, {
    bpm: s.bpm * rate, beatsPerBar: s.beatsPerBar,
    onStep: (step) => {
      const b = startBeat + step.index / 2;
      audio.playHits(stepHits(s, b, { from: step.index === 0 ? b : -1 }), step.time, clock.stepDur * 2, grip, { gain: 0.35 });
    },
  });
  clock.startBeat = startBeat;
  clock.rate = rate;
  st.pianoClock = clock;
  clock.start(audio.now() + delay);
}
