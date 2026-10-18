/* songpage.js — Liedseite: ein Song zum Mitspielen. Oben der YouTube-Player
   (immer sichtbar, nie überdeckt) mit großer Play/Pause-Taste, ±5 s, Tempo
   0,5 / 0,75 / 1, Zeitleiste und Loop (A–B, Abschnitt, gespeicherte Loops).
   Darunter das Leadsheet (leadsheet.js): jeder Abschnitt eine Karte über die
   ganze Breite mit festem Raster — 2 Takte pro Zeile, eine Zelle je Schlag —
   und darunter sein Teil der Tabs. Zelle antippen → Akkord ab diesem Schlag
   wählen (Blatt unten, überdeckt den Player nicht). Mit Startzeit und Tempo
   läuft die Markierung mit dem Video mit. Tabs sind eingefügter Text oder
   ein PDF vom Gerät; beides bleibt auf dem Gerät. Tasten: Leertaste
   Play/Pause, ←/→ ±5 s, L Loop, Esc schließt das Blatt. */

import * as yt from './yt.js';
import { S, putSong, saveSettings, getPdf, putPdf, deletePdf } from './store.js';
import { setYoutube, addChord } from './songdata.js';
import { youtubeSource, eventIndexAt } from './timeline.js';
import { parseYouTubeId, tapTempo } from './tap.js';
import { parseTabText, chordsInText, stripMarkup } from './tabtext.js';
import { parseChord } from './chordsym.js';
import { nextMarkName, fmtClock, addLoop, updateLoop, removeLoop, sortLoops } from './marks.js';
import {
  METERS, MAX_BARS, sectionList, addSection, resizeSection, deleteSection, updateSection, setBeatsPerBar,
  setChordAt, shiftChordAt, sectionGrid, sectionTimes, playPos, tabBlocks, blocksForSections, sectionsFromTabs,
  orderByStart, sectionProgress,
} from './leadsheet.js';
import { drillChunks } from './drill.js';
import { openDrill } from './drillpage.js';
import { $, $$, showScreen, screenName, modal, ask, frameLoop, onLongPress } from './ui.js';

const RATES = [0.5, 0.75, 1];
const SKIP = 5;
const SECTION_NAMES = ['Intro', 'Strophe', 'Pre-Chorus', 'Refrain', 'Bridge', 'Solo', 'Outro'];
const NUMBERED = new Set(['Strophe', 'Pre-Chorus', 'Refrain', 'Bridge', 'Solo']);
const SIZE = { min: 11, max: 30, step: 2 };
const EPS = 1e-6;
const LANDSCAPE = '(orientation: landscape) and (min-width: 700px)';
const meterLabel = (n) => (n === 6 ? '6/8' : `${n}/4`);
// ANNAHME: Bei 6/8 ist ein Schlag (eine Zelle, ein Tempo-Schlag) eine Achtel.
const unitLabel = (n) => (n === 6 ? 'Achtel' : 'Viertel');

let st = null;
let wired = false;
let hooks = { menu: async () => {} };

const song = () => S.songs.get(st.songId);
const dur = () => st.player?.duration() || youtubeSource(song())?.durationSec || 0;

async function save(next) {
  await putSong(next);
  if (!st) return;
  // Läuft ein Abschnitts-Loop, zieht er mit (Takte, Startzeit geändert).
  if (st.loop?.sec) {
    const r = sectionRange(st.loop.sec);
    if (r) Object.assign(st.loop, r);
    else { st.loop = null; st.loopOn = false; }
  }
  paintSections();
  paintTransport();
  refreshSheet();
}

function el(tag, cls = '', text = null) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

function button(cls, text, onClick, label = null) {
  const b = el('button', cls, text);
  b.type = 'button';
  if (label) b.setAttribute('aria-label', label);
  b.addEventListener('click', onClick);
  return b;
}

/* ---------- Verdrahtung ------------------------------------------------- */

/** h.menu(songId): Menü „Mehr“ (Exportieren, Löschen, Üben …), von app.js. */
export function initSongPage(h) {
  hooks = { ...hooks, ...h };
}

function wire() {
  if (wired) return;
  wired = true;
  $('#sp-back').addEventListener('click', close);
  $('#sp-more').addEventListener('click', () => hooks.menu(st.songId));
  $('#sp-play').addEventListener('click', togglePlay);
  $('#sp-rew').addEventListener('click', () => skip(-SKIP));
  $('#sp-fwd').addEventListener('click', () => skip(SKIP));
  $('#sp-loop').addEventListener('click', toggleLoop);
  $('#sp-a').addEventListener('click', () => setAB('a'));
  $('#sp-b').addEventListener('click', () => setAB('b'));
  $('#sp-saveloop').addEventListener('click', saveLoop);
  $('#sp-load').addEventListener('click', loadFromInput);
  $('#sp-url').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); loadFromInput(); } });
  wireTrack();
  $('#sp-addsec').addEventListener('click', addHere);
  $('#sp-fromtabs').addEventListener('click', fromTabs);
  $('#sp-drill').addEventListener('click', () => drill());
  $('#sp-sheet-close').addEventListener('click', closeSheet);
  // Tabs
  for (const b of $$('#s-song [data-tabmode]')) b.addEventListener('click', () => setTabMode(b.dataset.tabmode));
  $('#sp-smaller').addEventListener('click', () => setSize(-SIZE.step));
  $('#sp-bigger').addEventListener('click', () => setSize(SIZE.step));
  $('#sp-edit').addEventListener('click', toggleEdit);
  $('#sp-pdf-file').addEventListener('change', pickPdf);
  $('#sp-pdf-open').addEventListener('click', () => { if (st.pdfUrl) window.open(st.pdfUrl, '_blank'); });
  $('#sp-pdf-del').addEventListener('click', removePdf);
  document.addEventListener('keydown', onKey);
}

/** Liedseite öffnen. → Promise, erfüllt mit „Zurück“. */
export function openSongPage(songId) {
  wire();
  let s = S.songs.get(songId);
  if (!s) return Promise.resolve();
  // Ältere Songs: Abschnitte nach Startzeit, nicht nach Anlegen.
  const ordered = orderByStart(s);
  if (ordered !== s) { putSong(ordered); s = ordered; }
  return new Promise((resolve) => {
    st = {
      songId, resolve, player: null, loop: null, loopOn: false, rate: 1, editing: false, pdfUrl: null,
      stop: null, drag: null, lastPos: null, lastSec: null, progId: null, folded: new Set(), sheet: null, taps: [],
    };
    $('#sp-title').textContent = s.title;
    $('#sp-artist').textContent = s.artist || '';
    $('#sp-vnote').textContent = '';
    const src = youtubeSource(s);
    $('#sp-url').value = src?.videoId ? `https://youtu.be/${src.videoId}` : '';
    $('#sp-novideo').hidden = !!src?.videoId;
    $('#sp-yt').hidden = !src?.videoId;
    $('#sp-sheet').hidden = true;
    showScreen('song');
    paintLoops();
    paintTransport();
    paintTabs();
    if (src?.videoId) loadVideo(src.videoId);
    st.stop = frameLoop(tick);
  });
}

function close() {
  if (!st) return;
  closeSheet();
  st.stop?.();
  st.player?.destroy();
  if (st.pdfUrl?.startsWith('blob:')) URL.revokeObjectURL(st.pdfUrl);
  const r = st.resolve;
  st = null;
  r?.();
}

/** Titel/Künstler neu zeichnen (nach „Umbenennen“ im Menü). */
export function refreshSongPage() {
  if (!st) return;
  $('#sp-title').textContent = song().title;
  $('#sp-artist').textContent = song().artist || '';
}

/* ---------- Video ------------------------------------------------------- */

async function loadFromInput() {
  const id = parseYouTubeId($('#sp-url').value);
  if (!id) { $('#sp-vnote').textContent = 'Das ist kein YouTube-Link und keine Video-ID.'; return; }
  const src = youtubeSource(song());
  if (src?.videoId !== id) await save(setYoutube(song(), { videoId: id, offsetSec: null, durationSec: 0 }));
  $('#sp-novideo').hidden = true;
  $('#sp-yt').hidden = false;
  loadVideo(id);
}

async function loadVideo(id) {
  st.player?.destroy();
  st.player = null;
  $('#sp-vnote').textContent = 'Video lädt …';
  const mine = st;
  try {
    const p = await yt.create($('#sp-yt'), id, {
      onError: (code) => { if (st === mine) $('#sp-vnote').textContent = yt.errorText(code); },
      onState: () => { if (st === mine) paintTransport(); },
    });
    if (st !== mine) { p.destroy(); return; }
    st.player = p;
    $('#sp-vnote').textContent = '';
    const d = p.duration();
    const src = youtubeSource(song());
    if (d > 0 && Math.abs((src?.durationSec || 0) - d) > 0.5) await putSong(setYoutube(song(), { durationSec: Math.round(d * 10) / 10 }));
    st.rate = 1;
    paintTransport();
    paintSections();
  } catch (e) {
    if (st !== mine) return;
    $('#sp-vnote').textContent = e?.message === 'offline'
      ? 'Kein Netz – das Video lässt sich gerade nicht laden. Die Tabs gehen trotzdem.'
      : yt.errorText(e?.message);
  }
}

function togglePlay() {
  const p = st?.player;
  if (!p) { $('#sp-vnote').textContent = 'Erst ein Video laden.'; return; }
  if (p.playing()) p.pause();
  else play(p);
}

function play(p) {
  p.play();
  setTimeout(() => { if (st?.player === p && !p.playing() && !$('#sp-vnote').textContent) $('#sp-vnote').textContent = 'Startet nicht? Einmal direkt aufs Video tippen.'; }, 2500);
}

function skip(by) {
  const p = st?.player;
  if (!p) return;
  p.seek(Math.max(0, Math.min(dur() || Infinity, p.now() + by)));
}

function setRate(r) {
  st.rate = r;
  st.player?.setRate(r);
  paintTransport();
}

/* ---------- Loop -------------------------------------------------------- */

/** Wo ein Abschnitt im Video liegt. → { start, end, name } oder null */
function sectionRange(id) {
  const s = song();
  const sec = s.sections.find((x) => x.id === id);
  const tm = sectionTimes(s, dur()).find((x) => x.id === id);
  if (!sec || tm?.start == null || tm.end == null || tm.end <= tm.start) return null;
  return { start: tm.start, end: tm.end, name: sec.name };
}

/** Warum ein Abschnitt (noch) nicht im Video zu finden ist. */
function whyNoRange(id) {
  const sec = song().sections.find((x) => x.id === id);
  const tm = sectionTimes(song(), dur()).find((x) => x.id === id);
  if (tm?.start == null) return `Für „${sec?.name}“ fehlt die Startzeit: im Video an den Anfang spulen, dann ⋯ → „Start hier“.`;
  return `Für „${sec?.name}“ fehlt das Ende: Tempo setzen (Mehr → Takt und Tempo) oder beim nächsten Abschnitt „Start hier“.`;
}

/** Loop an: A–B, falls gesetzt, sonst der Abschnitt an der aktuellen Stelle. */
function toggleLoop() {
  if (!st.player) return;
  if (st.loopOn) { st.loopOn = false; paintTransport(); paintLoops(); return; }
  if (!st.loop) {
    const pos = playPos(song(), st.player.now(), dur());
    const r = pos && sectionRange(pos.id);
    if (!r) { $('#sp-vnote').textContent = pos ? whyNoRange(pos.id) : 'Für den Loop A und B tippen – oder bei einem Abschnitt ↻.'; return; }
    st.loop = { ...r, sec: pos.id };
  }
  st.loopOn = true;
  paintTransport();
}

/** Abschnitt als Loop (↻ an der Karte). Noch einmal: Loop aus. */
function loopSection(id) {
  const p = st.player;
  if (!p) { $('#sp-vnote').textContent = 'Erst ein Video laden.'; return; }
  if (st.loopOn && st.loop?.sec === id) { st.loopOn = false; paintTransport(); return; }
  const r = sectionRange(id);
  if (!r) { $('#sp-vnote').textContent = whyNoRange(id); return; }
  $('#sp-vnote').textContent = '';
  st.loop = { ...r, sec: id };
  st.loopOn = true;
  p.seek(r.start);
  if (!p.playing()) play(p);
  paintTransport();
  paintLoops();
}

/** Ab dem Anfang eines Abschnitts spielen (▶ an der Karte). */
function playSection(id) {
  const p = st.player;
  if (!p) { $('#sp-vnote').textContent = 'Erst ein Video laden.'; return; }
  const tm = sectionTimes(song(), dur()).find((x) => x.id === id);
  if (tm?.start == null) { $('#sp-vnote').textContent = whyNoRange(id); return; }
  $('#sp-vnote').textContent = '';
  // Läuft ein Abschnitts-Loop, wandert er mit.
  if (st.loopOn && st.loop?.sec && st.loop.sec !== id) {
    const r = sectionRange(id);
    if (r) st.loop = { ...r, sec: id };
  }
  p.seek(tm.start);
  if (!p.playing()) play(p);
  paintTransport();
}

/** A bzw. B an die aktuelle Stelle. */
function setAB(which) {
  const p = st.player;
  if (!p) return;
  const t = p.now();
  const cur = st.loop && !st.loop.sec ? st.loop : { start: 0, end: dur() || t + 10 };
  const next = which === 'a' ? { start: t, end: Math.max(t + 1, cur.end) } : { start: Math.min(cur.start, t - 1), end: t };
  st.loop = { start: Math.max(0, next.start), end: next.end, name: 'A–B', sec: null };
  st.loopOn = true;
  paintTransport();
  paintLoops();
}

/* ---------- Gespeicherte Loops ----------------------------------------- */

/** Wo ein Loop beginnt: Start minus Vorlauf. */
const loopStart = (l) => Math.max(0, l.start - (l.pre || 0));
const PRE_STEPS = [0, 1, 2, 3];

/** Bereich unter einem Namen speichern. → gespeicherter Loop oder null */
async function storeLoop(range, suggestion) {
  const name = await ask('Loop speichern', `${fmtClock(range.start, { tenths: true })} bis ${fmtClock(range.end, { tenths: true })}`, { value: suggestion, ok: 'Speichern' });
  if (!name || !st) return null;
  const r = addLoop(song().loops || [], { name, start: range.start, end: Math.min(range.end, dur() || range.end), pre: 0 });
  await putSong({ ...song(), loops: r.loops });
  return r.loops.find((l) => l.id === r.id);
}

/** Laufenden Loop (A–B oder Abschnitt) speichern. */
async function saveLoop() {
  if (!st.loop) return;
  const saved = await storeLoop(st.loop, st.loop.sec ? st.loop.name : nextMarkName(song().loops || [], 'Loop'));
  if (!saved || !st) return;
  st.loop = { ...saved, sec: null, saved: saved.id };
  paintLoops();
  paintTransport();
}

/** Gespeicherten Loop starten (Antippen). Noch einmal antippen: Loop aus. */
function playLoop(l) {
  const p = st.player;
  if (!p) { $('#sp-vnote').textContent = 'Erst ein Video laden.'; return; }
  if (st.loopOn && st.loop?.saved === l.id) { st.loopOn = false; paintTransport(); paintLoops(); return; }
  st.loop = { start: l.start, end: l.end, pre: l.pre || 0, name: l.name, sec: null, saved: l.id };
  st.loopOn = true;
  p.seek(loopStart(st.loop));
  if (!p.playing()) play(p);
  paintTransport();
  paintLoops();
}

async function loopMenu(l) {
  const t = st.player ? st.player.now() : null;
  const pre = l.pre || 0;
  const nextPre = PRE_STEPS[(PRE_STEPS.indexOf(pre) + 1) % PRE_STEPS.length] ?? 0;
  const a = await modal(l.name, `${fmtClock(l.start, { tenths: true })} bis ${fmtClock(l.end, { tenths: true })}${pre ? ` · ${pre} s Vorlauf` : ''}`, [
    ...(t != null ? [{ label: `Start hier (${fmtClock(t)})`, value: 'start' }, { label: `Ende hier (${fmtClock(t)})`, value: 'end' }] : []),
    { label: 'Start −0,2 s', value: 's-' }, { label: 'Start +0,2 s', value: 's+' },
    { label: 'Ende −0,2 s', value: 'e-' }, { label: 'Ende +0,2 s', value: 'e+' },
    { label: nextPre ? `Vorlauf ${nextPre} s` : 'Ohne Vorlauf', value: 'pre' },
    { label: 'Umbenennen', value: 'ren' },
    { label: 'Löschen', value: 'del' },
    { label: 'Schließen', value: '', primary: true },
  ]);
  const loops = song().loops || [];
  let next = null;
  if (a === 'start') next = updateLoop(loops, l.id, { start: t });
  else if (a === 'end') next = updateLoop(loops, l.id, { end: t });
  else if (a === 's-' || a === 's+') next = updateLoop(loops, l.id, { start: l.start + (a === 's-' ? -0.2 : 0.2) });
  else if (a === 'e-' || a === 'e+') next = updateLoop(loops, l.id, { end: l.end + (a === 'e-' ? -0.2 : 0.2) });
  else if (a === 'pre') next = updateLoop(loops, l.id, { pre: nextPre });
  else if (a === 'ren') {
    const n = await ask('Loop umbenennen', '', { value: l.name, ok: 'Umbenennen' });
    if (n) next = updateLoop(loops, l.id, { name: n });
  } else if (a === 'del') {
    const yes = await modal(`„${l.name}“ löschen?`, '', [{ label: 'Abbrechen', value: 'no' }, { label: 'Löschen', value: 'yes', primary: true }]);
    if (yes === 'yes') {
      next = removeLoop(loops, l.id);
      if (st.loop?.saved === l.id) { st.loop = null; st.loopOn = false; }
    }
  }
  if (!next) return;
  await putSong({ ...song(), loops: next });
  // Läuft dieser Loop gerade, gilt die Änderung sofort.
  const now = next.find((x) => x.id === l.id);
  if (now && st.loop?.saved === l.id) Object.assign(st.loop, { start: now.start, end: now.end, pre: now.pre || 0, name: now.name });
  paintLoops();
  paintTransport();
}

function paintLoops() {
  if (!st) return;
  const loops = sortLoops(song().loops);
  $('#sp-loops').replaceChildren(...loops.map((l) => {
    const li = el('li');
    const on = st.loopOn && st.loop?.saved === l.id;
    const b = button(`sp-mark sp-saved${on ? ' now' : ''}`, null, () => playLoop(l));
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
    b.append(el('b', '', `↻ ${l.name}`), el('small', '', `${fmtClock(l.start)}–${fmtClock(l.end)}${l.pre ? ` · ${l.pre} s vorher` : ''}`));
    onLongPress(b, () => loopMenu(l));
    li.append(b);
    return li;
  }));
}

/* ---------- Abschnitte (Leadsheet) -------------------------------------- */

async function addHere() {
  const base = await pickName();
  if (!base || !st) return;
  const s = song();
  const name = NUMBERED.has(base) || s.sections.some((x) => x.name === base) ? nextMarkName(s.sections, base) : base;
  const t = st.player ? st.player.now() : null;
  const added = addSection(s, { name, startSec: t });
  const id = added.sections[added.sections.length - 1].id;
  // Einsortiert nach Startzeit, nicht hinten angehängt.
  await save(orderByStart(added));
  $(`#sp-sections [data-id="${id}"]`)?.scrollIntoView({ block: 'nearest' });
}

/** Namensauswahl: Vorschläge als Knöpfe, „Anderer …“ als Eingabe. */
async function pickName() {
  const t = st.player ? ` (Start bei ${fmtClock(st.player.now())})` : '';
  const v = await modal(`Neuer Abschnitt${t}`, '', [
    ...SECTION_NAMES.map((n) => ({ label: n, value: n })),
    { label: 'Anderer …', value: '*' },
    { label: 'Abbrechen', value: '' },
  ]);
  if (v !== '*') return v;
  return ask('Name des Abschnitts', '', { placeholder: 'z. B. Zwischenteil', ok: 'Anlegen' });
}

/** Abschnitte (mit Vorschlag für die Akkorde) aus den Überschriften der Tabs. */
export async function fromTabs() {
  if (!st) return;
  const s = song();
  if (!tabBlocks(s.tabText || '').some((b) => b.header)) {
    await modal('Keine Überschriften in den Tabs', 'Abschnitte entstehen aus Zeilen wie „[Verse 1]“ oder „[Chorus]“.', [{ label: 'OK', value: '', primary: true }]);
    return;
  }
  if (s.sections.length || s.events.length) {
    const a = await modal('Abschnitte aus den Tabs?', 'Die Abschnitte und Akkorde im Raster werden ersetzt.', [
      { label: 'Abbrechen', value: '' }, { label: 'Ersetzen', value: 'yes', primary: true },
    ]);
    if (a !== 'yes' || !st) return;
  }
  if (st.loop?.sec) { st.loop = null; st.loopOn = false; }
  closeSheet();
  await save(sectionsFromTabs(song(), song().tabText));
  await modal('Nur ein Vorschlag', 'Je Akkordzeile der Tabs 2 Takte, die Akkorde gleichmäßig darauf verteilt. Bitte anhören und im Raster korrigieren. Startzeit: beim ersten Abschnitt ⋯ → „Start hier“; mit Tempo rechnen sich die übrigen daraus.', [{ label: 'OK', value: '', primary: true }]);
}

/** Gibt es Überschriften in den Tabs (für „Abschnitte aus den Tabs“)? */
export const tabsHaveHeaders = (s) => tabBlocks(s?.tabText || '').some((b) => b.header);

/** „Folgen üben“: die Abschnitte (bzw. nur `sectionIds`) in 2-Takt-Folgen
 *  zum Klick. Das Video hält an; zurück geht es an dieselbe Stelle. */
async function drill(sectionIds = null) {
  const chunks = drillChunks(song(), { sectionIds });
  if (!chunks.length) {
    await modal('Noch keine Akkorde', 'Erst im Raster Akkorde setzen (Zelle antippen) – oder unter „Mehr“ die Abschnitte aus den Tabs anlegen.', [{ label: 'OK', value: '', primary: true }]);
    return;
  }
  closeSheet();
  st.player?.pause();
  const y = window.scrollY;
  const mine = st;
  openDrill(song(), chunks, () => {
    if (st !== mine) return;
    showScreen('song');
    window.scrollTo(0, y);
    paintTransport();
  });
}

function paintSections() {
  if (!st) return;
  const s = song();
  const list = sectionList(s);
  const times = sectionTimes(s, dur());
  const text = s.tabText || '';
  const showText = tabMode() === 'text' && !!text;
  const lines = showText ? parseTabText(text, s) : [];
  const blocks = showText ? tabBlocks(text, lines) : [];
  const { map, rest, intro } = blocksForSections(s, blocks);
  $('#sp-main').style.setProperty('--tab-size', `${S.settings.tabSize || 15}px`);
  $('#sp-text-empty').hidden = !!text || tabMode() !== 'text';
  // Ohne Abschnitte: die Tabs am Stück; sonst nur der Text vor der ersten Überschrift.
  paintLines($('#sp-intro'), list.length ? intro.flatMap((b) => b.lines) : lines);
  $('#sp-sec-empty').hidden = list.length > 0;
  $('#sp-fromtabs').hidden = !blocks.some((b) => b.header);
  const sel = st.sheet?.kind === 'chord' ? st.sheet.arg : null;
  $('#sp-sections').replaceChildren(...list.map((sec, i) => card(s, sec, times[i], map[sec.id], sel)));
  $('#sp-rest').hidden = !list.length || !rest.length;
  paintLines($('#sp-rest-text'), rest.flatMap((b) => [{ kind: 'header', text: b.header }, ...b.lines]));
  paintTicks(times);
  st.lastPos = null;
  st.lastSec = null;
  st.progId = null;
}

function paintLines(host, lines) {
  host.hidden = !lines.length;
  // Akkorde wie eingefügt (# statt ♯): ♯ ist in der Festbreitenschrift schmaler und verschöbe die Spalten.
  host.replaceChildren(...lines.map((l) => el('div', `tl tl-${l.kind}`, l.text || ' ')));
}

function card(s, sec, time, block, sel) {
  const bpb = s.beatsPerBar;
  const li = el('li', 'sp-card');
  li.dataset.id = sec.id;
  const head = el('div', 'sp-card-head');
  const name = el('h3', 'sp-card-name', sec.name);
  name.append(el('small', '', `${sec.bars} ${sec.bars === 1 ? 'Takt' : 'Takte'}${time?.start != null ? ` · ${fmtClock(time.start)}` : ''}`));
  const loopOn = st.loopOn && st.loop?.sec === sec.id;
  const loop = button(`sp-chip${loopOn ? ' on' : ''}`, '↻', () => loopSection(sec.id), `${sec.name} als Loop`);
  loop.dataset.loop = sec.id;
  loop.setAttribute('aria-pressed', loopOn ? 'true' : 'false');
  head.append(
    name,
    button('sp-chip', '▶', () => playSection(sec.id), `${sec.name} abspielen`),
    loop,
    button('sp-chip', '⋯', () => sectionSheet(sec.id), `${sec.name}: Takte, Start, Name`),
  );
  const bars = el('div', `sp-bars m${bpb}`);
  for (const b of sectionGrid(s, sec)) {
    const bar = el('div', 'sp-bar');
    bar.dataset.bar = b.bar;
    bar.append(el('span', 'sp-no', String(b.bar)));
    const beats = el('div', 'sp-beats');
    beats.style.gridTemplateColumns = `repeat(${bpb}, minmax(0, 1fr))`;
    b.cells.forEach((c, k) => {
      const kind = !c.chord ? 'e' : c.carried ? 'carry' : c.early ? 'pre' : 'c';
      const cls = ['sp-bt', kind];
      if (c.half) cls.push('half');
      if (c.chord && c.chord.length > 3) cls.push('long');
      if (sel != null && Math.abs(sel - c.beat) < EPS) cls.push('sel');
      const what = c.chord ? (c.carried ? `${c.chord} klingt weiter` : c.half ? `${c.chord} auf „und“` : c.chord) : 'kein Wechsel';
      const cell = button(cls.join(' '), c.chord || '·', () => chordSheet(c.beat), `Takt ${b.bar}, ${unitLabel(bpb)} ${k + 1}: ${what}`);
      cell.dataset.beat = c.beat;
      beats.append(cell);
    });
    bar.append(beats);
    bars.append(bar);
  }
  // Dünne Linie oben: wie weit man (ungefähr) im Abschnitt ist.
  const prog = el('div', 'sp-prog');
  prog.append(el('i'));
  li.append(prog, head, bars);
  if (block) {
    const folded = st.folded.has(sec.id);
    const tab = el('div', 'sp-text sp-cardtab');
    paintLines(tab, [{ kind: 'source', text: `[${block.header}]` }, ...block.lines]);
    tab.hidden = folded;
    const fold = button('sp-fold', folded ? '▸ Tab zeigen' : '▾ Tab ausblenden', () => {
      if (st.folded.has(sec.id)) st.folded.delete(sec.id); else st.folded.add(sec.id);
      paintSections();
    });
    fold.setAttribute('aria-expanded', folded ? 'false' : 'true');
    li.append(tab, fold);
  }
  return li;
}

/** Striche auf der Zeitleiste: wo die Abschnitte beginnen. */
function paintTicks(times) {
  const d = dur();
  const list = song().sections;
  $('#sp-ticks').replaceChildren(...(d > 0 ? times : []).filter((x) => x.start != null).map((x) => {
    const i = el('i');
    i.style.left = `${Math.min(100, (x.start / d) * 100)}%`;
    i.title = list.find((s) => s.id === x.id)?.name || '';
    return i;
  }));
}

/* ---------- Blatt unten (Akkord, Abschnitt, Takt und Tempo) ------------ */

/** Blatt zeigen. Es bleibt unter dem Player (überdeckt ihn nie) und ist nicht
 *  modal: man kann weiter Zellen antippen, das Blatt folgt. */
function openSheet(kind, arg, title, text, nodes) {
  st.sheet = { kind, arg };
  const sh = $('#sp-sheet');
  $('#sp-sheet-title').textContent = title;
  $('#sp-sheet-text').textContent = text;
  $('#sp-sheet-text').hidden = !text;
  $('#sp-sheet-body').replaceChildren(...nodes);
  const wasHidden = sh.hidden;
  sh.hidden = false;
  placeSheet();
  for (const c of $$('#sp-sections .sp-bt.sel')) c.classList.remove('sel');
  if (kind === 'chord') {
    const c = $(`#sp-sections .sp-bt[data-beat="${arg}"]`);
    c?.classList.add('sel');
    keepVisible(c);
  }
  if (wasHidden) $('#sp-sheet-close').focus({ preventScroll: true });
}

function placeSheet() {
  const sh = $('#sp-sheet');
  if (sh.hidden) return;
  const player = $('.sp-player').getBoundingClientRect();
  if (matchMedia(LANDSCAPE).matches) {
    sh.style.left = `${Math.round(player.right + 8)}px`;
    sh.style.maxHeight = `${Math.round(window.innerHeight * 0.58)}px`;
  } else {
    sh.style.left = '0px';
    sh.style.maxHeight = `${Math.max(200, Math.round(window.innerHeight - Math.max(0, player.bottom) - 8))}px`;
  }
}

/** Zelle nicht unter dem Blatt verschwinden lassen. */
function keepVisible(cell) {
  if (!cell) return;
  const r = cell.getBoundingClientRect();
  const top = $('#sp-sheet').getBoundingClientRect().top;
  const by = r.bottom - top + 16;
  if (by <= 0) return;
  if (matchMedia(LANDSCAPE).matches) $('#sp-main').scrollBy({ top: by });
  else window.scrollBy({ top: by });
}

function closeSheet() {
  if (!st) return;
  st.sheet = null;
  st.taps = [];
  $('#sp-sheet').hidden = true;
  for (const c of $$('#sp-sections .sp-bt.sel')) c.classList.remove('sel');
}

function refreshSheet() {
  const k = st?.sheet;
  if (!k) return;
  if (k.kind === 'chord') chordSheet(k.arg);
  else if (k.kind === 'section') sectionSheet(k.arg);
  else if (k.kind === 'meter') openMeterSheet();
}

const label = (text) => el('div', 'sp-lab', text);
const row = (...nodes) => { const d = el('div', 'sp-sheet-row'); d.append(...nodes); return d; };
const big = (text, onClick, { on = false, quiet = false, disabled = false, aria = null } = {}) => {
  const b = button(`sp-big${on ? ' on' : ''}${quiet ? ' q' : ''}`, text, onClick, aria);
  if (on) b.setAttribute('aria-pressed', 'true');
  b.disabled = disabled;
  return b;
};

function stepper(value, onStep, what) {
  const box = el('span', 'sp-stepper');
  box.append(
    button('sp-round', '−', () => onStep(-1), `${what} weniger`),
    el('b', '', value),
    button('sp-round', '+', () => onStep(1), `${what} mehr`),
  );
  return box;
}

/** Akkord ab Schlag `beat` wählen. */
function chordSheet(beat) {
  const s = song();
  const bpb = s.beatsPerBar;
  const bar = Math.floor(beat / bpb + EPS) + 1;
  const k = Math.round(beat - (bar - 1) * bpb) + 1;
  const unit = unitLabel(bpb);
  const inCell = s.events.filter((e) => e.at >= beat - EPS && e.at < beat + 1 - EPS);
  const exact = s.events.find((e) => Math.abs(e.at - beat) < EPS);
  const before = eventIndexAt(s, beat - 0.5);
  const sounding = before >= 0 ? s.events[before].chord : null;
  const text = exact ? `Hier wechselt es zu ${exact.chord}; der klingt bis zum nächsten Wechsel.`
    : inCell.length ? `Wechsel zu ${inCell[inCell.length - 1].chord} auf „und“.`
      : sounding ? `Hier klingt noch ${sounding}. Ein Akkord setzt hier einen Wechsel.`
        : 'Ein Akkord klingt ab hier bis zum nächsten Wechsel.';
  const chords = [...s.chords];
  for (const e of s.events) if (!chords.includes(e.chord)) chords.push(e.chord);
  const clearCell = (song0) => inCell.reduce((acc, e) => setChordAt(acc, e.at, null), song0);
  const set = (c) => save(setChordAt(clearCell(s), beat, c));
  const shift = async (dir) => {
    const r = shiftChordAt(s, beat, dir);
    if (r.at === beat) return;
    st.sheet = { kind: 'chord', arg: r.at };
    await save(r.song);
  };
  const newChord = async () => {
    const c = (await ask('Neuer Akkord', 'z. B. D/F# oder Bbmaj7', { ok: 'Setzen' }))?.trim();
    if (!c || !st) return;
    if (!parseChord(c)) {
      await modal('Unbekannter Akkord', `„${c}“ kann ich nicht lesen. Beispiele: Am, D/F#, Fmaj7, Bb, C#m7.`, [{ label: 'OK', value: '', primary: true }]);
      return;
    }
    await save(setChordAt(clearCell(addChord(song(), c)), beat, c));
  };
  openSheet('chord', beat, `Takt ${bar}, ${unit} ${k}`, text, [
    row(...chords.map((c) => big(c, () => set(c), { on: exact?.chord === c })), big('+ Akkord', newChord, { quiet: true })),
    row(
      big('kein Wechsel', () => save(clearCell(s)), { quiet: true, disabled: !inCell.length }),
      big(`◀ ${unit}`, () => shift(-1), { quiet: true, disabled: !exact, aria: `Wechsel eine ${unit} früher` }),
      big(`${unit} ▶`, () => shift(1), { quiet: true, disabled: !exact, aria: `Wechsel eine ${unit} später` }),
    ),
  ]);
}

/** Abschnitt: Takte, Startzeit, Name, Loop, Löschen. */
function sectionSheet(id) {
  const s = song();
  const sec = sectionList(s).find((x) => x.id === id);
  if (!sec) { closeSheet(); return; }
  const tm = sectionTimes(s, dur()).find((x) => x.id === id);
  const t = st.player ? st.player.now() : null;
  const text = tm?.start != null
    ? `beginnt bei ${fmtClock(tm.start, { tenths: true })} im Video${sec.startSec == null ? ' (aus dem Tempo gerechnet)' : ''}`
    : 'Startzeit im Video noch offen: an den Anfang spulen, dann „Start hier“.';
  const resize = async (by) => {
    const n = Math.max(1, Math.min(MAX_BARS, sec.bars + by));
    if (n === sec.bars) return;
    const cutFrom = sec.fromBeat + n * s.beatsPerBar;
    if (n < sec.bars && s.events.some((e) => e.at >= cutFrom - EPS && e.at < sec.toBeat - EPS)) {
      const a = await modal(`Takt ${sec.bar + n} hat Akkorde`, 'Beim Kürzen fallen sie weg.', [
        { label: 'Abbrechen', value: '' }, { label: 'Kürzen', value: 'yes', primary: true },
      ]);
      if (a !== 'yes' || !st) return;
    }
    await save(resizeSection(song(), id, n));
  };
  const setStart = (sec2) => save(orderByStart(updateSection(song(), id, { startSec: Math.max(0, Math.round(sec2 * 100) / 100) })));
  const del = async () => {
    const a = await modal(`„${sec.name}“ löschen?`, 'Seine Akkorde fallen weg; die Abschnitte danach rücken auf.', [
      { label: 'Abbrechen', value: '' }, { label: 'Löschen', value: 'yes', primary: true },
    ]);
    if (a !== 'yes' || !st) return;
    closeSheet();
    await save(deleteSection(song(), id));
  };
  const rename = async () => {
    const n = await ask('Abschnitt umbenennen', '', { value: sec.name, ok: 'Umbenennen' });
    if (n && st) await save(updateSection(song(), id, { name: n }));
  };
  const keep = async () => {
    const r = sectionRange(id);
    if (!r) { $('#sp-vnote').textContent = whyNoRange(id); return; }
    if (await storeLoop(r, sec.name)) paintLoops();
  };
  const times = [
    ...(t != null ? [big(`Start hier (${fmtClock(t)})`, () => setStart(st.player.now()), { quiet: true })] : []),
    ...(sec.startSec != null ? [
      big('Start −0,2 s', () => setStart(sec.startSec - 0.2), { quiet: true }),
      big('Start +0,2 s', () => setStart(sec.startSec + 0.2), { quiet: true }),
    ] : []),
  ];
  openSheet('section', id, sec.name, text, [
    label('Takte'),
    stepper(String(sec.bars), resize, 'Takte'),
    ...(times.length ? [row(...times)] : []),
    row(big('Folgen üben', () => drill([id]), { quiet: true }), big('Umbenennen', rename, { quiet: true }),
      big('Loop speichern', keep, { quiet: true }), big('Löschen', del, { quiet: true })),
  ]);
}

/** „Takt und Tempo“ (aus „Mehr“). */
export function openMeterSheet() {
  if (!st) return;
  const s = song();
  const bpb = s.beatsPerBar;
  const setMeter = async (n) => {
    if (n === bpb) return;
    if (n < bpb && s.events.some((e) => (e.at % bpb) >= n - EPS)) {
      const a = await modal(`Auf ${meterLabel(n)} umstellen?`, `Akkorde auf Schlag ${n + 1}${bpb > n + 1 ? ` bis ${bpb}` : ''} fallen weg.`, [
        { label: 'Abbrechen', value: '' }, { label: 'Umstellen', value: 'yes', primary: true },
      ]);
      if (a !== 'yes' || !st) return;
    }
    await save(setBeatsPerBar(song(), n));
  };
  const setBpm = (bpm) => save({ ...song(), bpm });
  const step = (by) => setBpm(Math.max(30, Math.min(240, (song().bpm || 80) + by)));
  const tap = () => {
    const now = performance.now() / 1000;
    if (st.taps.length && now - st.taps[st.taps.length - 1] > 2) st.taps = [];
    st.taps.push(now);
    const r = tapTempo(st.taps);
    if (r.bpm) setBpm(r.bpm);
    else $('#sp-tapnote').textContent = `Weiter tippen (noch ${r.need}×) …`;
  };
  const meters = el('div', 'seg');
  meters.setAttribute('role', 'group');
  meters.setAttribute('aria-label', 'Taktart');
  for (const n of METERS) {
    const b = button('seg-btn', meterLabel(n), () => setMeter(n));
    b.setAttribute('aria-pressed', n === bpb ? 'true' : 'false');
    meters.append(b);
  }
  const tapNote = el('span', 'small muted', st.taps.length > 1 ? `${st.taps.length} Tipps` : '');
  tapNote.id = 'sp-tapnote';
  openSheet('meter', null, 'Takt und Tempo',
    `Mit Tempo und der Startzeit des ersten Abschnitts läuft die Markierung im Raster mit dem Video mit; Abschnitte ohne eigene Startzeit rechnen sich daraus. Tempo in ${unitLabel(bpb)}n pro Minute.`, [
      label('Taktart'),
      meters,
      label('Tempo'),
      row(
        stepper(s.bpm ? String(s.bpm) : '–', step, 'Tempo'),
        button('btn btn-secondary btn-sm', 'Tippen', tap, `Tempo tippen (je ${unitLabel(bpb)})`),
        ...(s.bpm ? [button('btn btn-ghost btn-sm', 'ohne', () => setBpm(null))] : []),
        tapNote,
      ),
    ]);
}

/* ---------- Zeitleiste (ziehen zum Spulen) ----------------------------- */

function wireTrack() {
  const track = $('#sp-track');
  const at = (e) => {
    const r = track.getBoundingClientRect();
    return Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * dur();
  };
  track.addEventListener('pointerdown', (e) => {
    if (!st?.player || !dur()) return;
    track.setPointerCapture(e.pointerId);
    st.drag = at(e);
  });
  track.addEventListener('pointermove', (e) => { if (st?.drag != null) st.drag = at(e); });
  const end = (e) => {
    if (st?.drag == null) return;
    const t = e.type === 'pointercancel' ? null : at(e);
    st.drag = null;
    if (t != null) st.player.seek(t);
  };
  track.addEventListener('pointerup', end);
  track.addEventListener('pointercancel', end);
  track.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); e.stopPropagation(); skip(e.key === 'ArrowLeft' ? -SKIP : SKIP); }
  });
}

/* ---------- Anzeige je Frame ------------------------------------------- */

function paintTransport() {
  if (!st) return;
  const p = st.player;
  const playing = !!p?.playing();
  const btn = $('#sp-play');
  btn.setAttribute('aria-label', playing ? 'Pause' : 'Abspielen');
  btn.classList.toggle('on', playing);
  $('#sp-play-icon').setAttribute('d', playing ? 'M7 5h4v14H7zM13 5h4v14h-4z' : 'M8 5l11 7-11 7z');
  for (const b of [btn, $('#sp-rew'), $('#sp-fwd'), $('#sp-loop'), $('#sp-a'), $('#sp-b')]) b.disabled = !p;
  const rates = p ? p.rates().filter((r) => RATES.includes(r)) : RATES;
  $('#sp-rates').replaceChildren(...rates.map((r) => {
    const b = button('seg-btn', `${String(r).replace('.', ',')}×`, () => setRate(r));
    b.setAttribute('aria-pressed', r === st.rate ? 'true' : 'false');
    b.disabled = !p;
    return b;
  }));
  const loop = $('#sp-loop');
  loop.setAttribute('aria-pressed', st.loopOn ? 'true' : 'false');
  // Ein gespeicherter Loop steht hervorgehoben in der Liste; der Knopf bleibt kurz.
  loop.textContent = st.loopOn && st.loop && !st.loop.saved ? `Loop: ${st.loop.name}` : 'Loop';
  // „Speichern“ nur für einen laufenden, noch nicht gespeicherten Loop.
  $('#sp-saveloop').hidden = !(st.loopOn && st.loop && !st.loop.saved);
  for (const b of $$('#sp-sections [data-loop]')) {
    const on = st.loopOn && st.loop?.sec === b.dataset.loop;
    b.classList.toggle('on', on);
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
  }
}

function tick() {
  if (!st || screenName() !== 'song') return;
  const p = st.player;
  const d = dur();
  const t = st.drag ?? (p ? p.now() : 0);
  // Loop: an B zurück zu A.
  if (p && st.loopOn && st.loop && p.playing() && !p.seeking() && t >= st.loop.end - 0.03) p.seek(loopStart(st.loop));
  $('#sp-cur').textContent = fmtClock(t);
  $('#sp-dur').textContent = d ? fmtClock(d) : '–:––';
  const frac = d ? Math.min(1, t / d) : 0;
  $('#sp-fill').style.width = `${frac * 100}%`;
  $('#sp-thumb').style.left = `${frac * 100}%`;
  const reg = $('#sp-region');
  if (st.loopOn && st.loop && d) {
    reg.hidden = false;
    reg.style.left = `${(st.loop.start / d) * 100}%`;
    reg.style.width = `${(Math.min(d, st.loop.end) - st.loop.start) / d * 100}%`;
  } else reg.hidden = true;
  const playing = !!p?.playing();
  if (playing !== $('#sp-play').classList.contains('on')) paintTransport();
  paintProgress(p ? sectionProgress(song(), t, d) : null);
  // Wo im Leadsheet: Karte, Takt, Schlag.
  const pos = p ? playPos(song(), t, d) : null;
  const key = pos ? `${pos.id}:${pos.beat == null ? '' : Math.floor(pos.beat + EPS)}` : '';
  if (key !== st.lastPos) {
    st.lastPos = key;
    paintPlayhead(pos, playing);
  }
}

function paintProgress(prog) {
  const id = prog?.id || '';
  if (id !== st.progId) {
    for (const x of $$('#sp-sections .sp-prog.on')) x.classList.remove('on');
    st.progId = id;
  }
  if (!prog) return;
  const bar = $(`#sp-sections .sp-card[data-id="${prog.id}"] .sp-prog`);
  if (!bar) return;
  bar.classList.add('on');
  bar.firstChild.style.width = `${(prog.frac * 100).toFixed(2)}%`;
}

function paintPlayhead(pos, playing) {
  for (const x of $$('#sp-sections .now, #sp-sections .playing, #sp-sections .cur')) x.classList.remove('now', 'playing', 'cur');
  const changed = (pos?.id || '') !== st.lastSec;
  st.lastSec = pos?.id || '';
  if (!pos) { $('#sp-section').textContent = ''; return; }
  const cardEl = $(`#sp-sections .sp-card[data-id="${pos.id}"]`);
  if (!cardEl) return;
  cardEl.classList.add('now');
  if (changed) $('#sp-section').textContent = `Abschnitt: ${song().sections.find((x) => x.id === pos.id)?.name || ''}`;
  let target = cardEl;
  if (pos.beat != null) {
    const cell = cardEl.querySelector(`.sp-bt[data-beat="${Math.floor(pos.beat + EPS)}"]`);
    if (cell) {
      cell.classList.add('cur');
      target = cell.closest('.sp-bar');
      target.classList.add('playing');
    }
  }
  // Beim Abspielen mitscrollen, solange das Blatt nicht offen ist.
  if (playing && !st.sheet) followIntoView(target === cardEl ? cardEl.querySelector('.sp-card-head') : target);
}

/** Knoten in den sichtbaren Bereich holen (unter dem stehenden Player). */
function followIntoView(node) {
  const r = node.getBoundingClientRect();
  const land = matchMedia(LANDSCAPE).matches;
  const box = land ? $('#sp-main').getBoundingClientRect() : null;
  const top = land ? box.top : $('.sp-top').getBoundingClientRect().bottom;
  const bottom = land ? box.bottom : window.innerHeight;
  if (r.top >= top + 4 && r.bottom <= bottom - 4) return;
  const by = r.top - top - 12;
  if (land) $('#sp-main').scrollBy({ top: by, behavior: 'smooth' });
  else window.scrollBy({ top: by, behavior: 'smooth' });
}

function onKey(e) {
  if (!st || screenName() !== 'song' || !$('#modal').hidden) return;
  if (e.key === 'Escape' && st.sheet) { e.preventDefault(); closeSheet(); return; }
  if (e.target.closest?.('input, textarea, select')) return;
  if (e.key === ' ') { e.preventDefault(); togglePlay(); }
  else if (e.key === 'ArrowLeft') { e.preventDefault(); skip(-SKIP); }
  else if (e.key === 'ArrowRight') { e.preventDefault(); skip(SKIP); }
  else if (e.key === 'l' || e.key === 'L') toggleLoop();
}

/* ---------- Tabs: Text oder PDF ---------------------------------------- */

const tabMode = () => song().tabMode || 'text';

async function setTabMode(mode) {
  if (st.editing) await finishEdit();
  await putSong({ ...song(), tabMode: mode });
  paintTabs();
}

function setSize(by) {
  const cur = S.settings.tabSize || 15;
  S.settings.tabSize = Math.max(SIZE.min, Math.min(SIZE.max, cur + by));
  saveSettings();
  $('#sp-main').style.setProperty('--tab-size', `${S.settings.tabSize}px`);
}

async function paintTabs() {
  const mode = tabMode();
  for (const b of $$('#s-song [data-tabmode]')) b.setAttribute('aria-pressed', b.dataset.tabmode === mode ? 'true' : 'false');
  $('#sp-pdfbox').hidden = mode !== 'pdf';
  $('#sp-smaller').hidden = $('#sp-bigger').hidden = $('#sp-edit').hidden = mode !== 'text';
  paintEdit();
  paintSections();
  if (mode === 'pdf') await paintPdf();
}

function paintEdit() {
  $('#sp-sheetview').hidden = st.editing;
  $('#sp-text-edit').hidden = !st.editing;
  $('#sp-addsec').hidden = $('#sp-drill').hidden = st.editing;
  $('#sp-edit').textContent = st.editing ? 'Fertig' : song().tabText ? 'Tabs ändern' : 'Tabs einfügen';
}

async function toggleEdit() {
  if (st.editing) { await finishEdit(); return; }
  closeSheet();
  st.editing = true;
  const ta = $('#sp-text-edit');
  ta.value = song().tabText || '';
  paintEdit();
  ta.focus();
}

/** Text übernehmen; neue Akkorde daraus kommen in die Akkordliste des Songs. */
async function finishEdit() {
  st.editing = false;
  // Gespeichert wird der aufgeräumte Text (Markdown-Reste weg, zusammengeklebte
  // Zeilen getrennt), damit „Tabs ändern“ ihn so zeigt wie die Ansicht.
  const text = stripMarkup($('#sp-text-edit').value).replace(/\s+$/, '');
  const s = song();
  const chords = [...s.chords];
  for (const c of chordsInText(text)) if (!chords.includes(c)) chords.push(c);
  const next = { ...s, chords, tabText: text };
  if (!text) delete next.tabText;
  await putSong(next);
  paintEdit();
  paintSections();
}

async function paintPdf() {
  const rec = await getPdf(st.songId);
  if (!st) return;
  if (st.pdfUrl?.startsWith('blob:')) URL.revokeObjectURL(st.pdfUrl);
  st.pdfUrl = null;
  const has = !!rec?.blob;
  $('#sp-pdf-name').textContent = has ? rec.name : 'Noch kein PDF.';
  $('#sp-pdf-open').hidden = !has;
  $('#sp-pdf-del').hidden = !has;
  const frame = $('#sp-pdf-frame');
  if (has) {
    // Über den Service Worker (eigene Antwort ohne die CSP der Seite); ohne
    // ihn als blob: — dann zeigt manch ein Browser das PDF nur über „Groß öffnen“.
    st.pdfUrl = navigator.serviceWorker?.controller ? `pdf/${st.songId}?v=${rec.blob.size}-${Date.now()}` : URL.createObjectURL(rec.blob);
    frame.src = st.pdfUrl;
    frame.hidden = false;
  } else {
    frame.removeAttribute('src');
    frame.hidden = true;
  }
}

async function pickPdf(e) {
  const f = e.target.files?.[0];
  e.target.value = '';
  if (!f) return;
  if (f.type && f.type !== 'application/pdf') { await modal('Kein PDF', 'Bitte eine PDF-Datei wählen.', [{ label: 'OK', value: 'ok', primary: true }]); return; }
  await putPdf(st.songId, f.name, f);
  await putSong({ ...song(), tabMode: 'pdf' });
  paintTabs();
}

async function removePdf() {
  const a = await modal('PDF entfernen?', 'Es liegt nur auf diesem Gerät.', [{ label: 'Abbrechen', value: 'no' }, { label: 'Entfernen', value: 'yes', primary: true }]);
  if (a !== 'yes') return;
  await deletePdf(st.songId);
  paintPdf();
}
