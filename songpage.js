/* songpage.js — Liedseite: ein Song zum Mitspielen. Oben der YouTube-Player
   200 × 200, immer sichtbar und nie überdeckt) steht mit seiner Steuerung
   (Zeitleiste, große Play/Pause-Taste, ±5 s, Geschwindigkeit als
   Auswahlmenü, Schalter fürs Mitscrollen) in der Leiste unten, im Querformat links.
   Darunter das Leadsheet (leadsheet.js): jeder Abschnitt eine Karte über die
   ganze Breite mit festem Raster — 2 Takte pro Zeile, eine Zelle je Schlag —
   und darunter sein Teil der Tabs. Zelle antippen → Akkord ab diesem Schlag
   wählen (Blatt unten, überdeckt den Player nicht). Mit Startzeit und Tempo
   läuft die Markierung mit dem Video mit. Unten die Leiste: darüber alle
   Akkorde des Songs (Antippen: anhören; Halten: die Tasten ansehen und
   ändern), darunter Zeitleiste und Abspielen. Loop über einen Abschnitt oder
   einzelne Takte: ↻ an der Karte. Die Tabs sind eingefügter Text und
   bleiben auf dem Gerät. Tasten: Leertaste Play/Pause, ←/→ ±5 s, Esc
   schließt das Blatt. */

import * as yt from './yt.js';
import { S, putSong, saveSettings } from './store.js';
import { setYoutube, addChord, songFromVideo, setVoicing } from './songdata.js';
import { youtubeSource, eventIndexAt } from './timeline.js';
import { parseYouTubeId, tapTempo } from './tap.js';
import { parseTabText } from './tabtext.js';
import { parseChord, prettyChord } from './chordsym.js';
import { voicingFor, allKeys, voicingFromKeys, NOTE_MAX } from './voicing.js';
import { renderKeyboard, voicingMarks } from './keyboard.js';
import { noteName } from './chords.js';
import * as audio from './audio.js';
import { nextMarkName, fmtClock } from './marks.js';
import {
  METERS, MAX_BARS, sectionList, addSection, resizeSection, deleteSection, updateSection, setBeatsPerBar,
  setChordAt, shiftChordAt, sectionGrid, sectionTimes, playPos, tabBlocks, blocksForSections, sectionsFromTabs,
  orderByStart, fitBars, tapChordAt, barsTime, barSpan, loopLead,
} from './leadsheet.js';
import { drillChunks } from './drill.js';
import { openDrill } from './drillpage.js';
import { initWizard, startWizard, stopWizard, paintWizard } from './songwizard.js';
import { $, $$, showScreen, screenName, modal, ask, frameLoop, onLongPress } from './ui.js';

const RATES = [0.5, 0.75, 1];
const SKIP = 5;
const SECTION_NAMES = ['Intro', 'Strophe', 'Pre-Chorus', 'Refrain', 'Bridge', 'Solo', 'Outro'];
const NUMBERED = new Set(['Strophe', 'Pre-Chorus', 'Refrain', 'Bridge', 'Solo']);
const EPS = 1e-6;
const LANDSCAPE = '(orientation: landscape) and (min-width: 700px)';
const meterLabel = (n) => (n === 6 ? '6/8' : `${n}/4`);
// ANNAHME: Bei 6/8 ist ein Schlag (eine Zelle, ein Tempo-Schlag) eine Achtel.
const unitLabel = (n) => (n === 6 ? 'Achtel' : 'Viertel');

let st = null;
let wired = false;
let hooks = { action: async () => {}, griffe: () => {} };

const song = () => S.songs.get(st.songId);
const dur = () => st.player?.duration() || youtubeSource(song())?.durationSec || 0;

async function save(next) {
  await putSong(next);
  if (!st) return;
  // Läuft ein Abschnitts-Loop, zieht er mit (Takte, Startzeit geändert).
  if (st.loop?.sec) {
    const r = loopRange(st.loop.sec, st.loop.bars) || loopRange(st.loop.sec, null);
    if (r) Object.assign(st.loop, r, { pre: loopLead(song()) });
    else { st.loop = null; st.loopOn = false; }
  }
  paintSections();
  paintTransport();
  refreshSheet();
  paintWizard();
  paintSettings();
}

/** Nach Startzeit ordnen, dann Takte aus Tempo und Zeit (wo nicht von Hand). */
const tidy = (s) => fitBars(orderByStart(s), youtubeSource(s)?.durationSec || 0);

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

/** h.action(songId, name): Griffe, Üben, Exportieren, Löschen (verlassen die
 *  Liedseite oder brauchen die App), von app.js;
 *  h.griffe(songId, symbol): Griff-Editor für einen Akkord (Assistent). */
export function initSongPage(h) {
  hooks = { ...hooks, ...h };
}

function wire() {
  if (wired) return;
  wired = true;
  $('#sp-back').addEventListener('click', close);
  $('#sp-more').addEventListener('click', () => toggleSettings());
  // Titel und Interpret in der Titelleiste (nur bei geöffneten Einstellungen sichtbar).
  for (const id of ['title', 'artist']) $(`#sp-${id}-in`).addEventListener('change', saveName);
  $('#sp-settings').addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.closest('input')) e.target.blur(); });
  $('#sp-play').addEventListener('click', togglePlay);
  $('#sp-rew').addEventListener('click', () => skip(-SKIP));
  $('#sp-fwd').addEventListener('click', () => skip(SKIP));
  $('#sp-rate').addEventListener('change', (e) => setRate(Number(e.target.value)));
  $('#sp-follow').addEventListener('click', () => { S.settings.followScroll = !follows(); saveSettings(); paintFollow(); });
  $('#sp-load').addEventListener('click', loadFromInput);
  $('#sp-url').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); loadFromInput(); } });
  wireTrack();
  $('#sp-addsec').addEventListener('click', addHere);
  $('#sp-fromtabs').addEventListener('click', fromTabs);
  $('#sp-sheet-close').addEventListener('click', closeSheet);
  initWizard(wizardApi);
  // Tabs
  document.addEventListener('keydown', onKey);
  // Takte wählen (lange drücken, ziehen): dabei nicht scrollen; der Klick danach zählt nicht.
  $('#sp-sections').addEventListener('touchmove', (e) => { if (st?.barDrag) e.preventDefault(); }, { passive: false });
  $('#sp-sections').addEventListener('click', (e) => { if (performance.now() < barClickGuard) { e.stopPropagation(); e.preventDefault(); } }, true);
  // Leiste (unten bzw. links): Platz lassen, Blatt daneben setzen.
  if (window.ResizeObserver) {
    new ResizeObserver(() => { fitDock(); placeSheet(); }).observe($('#sp-dock'));
    new ResizeObserver(() => reserveSpace()).observe($('#sp-sheet'));
  }
  window.addEventListener('resize', () => { fitDock(); placeSheet(); });
}

/** Liedseite öffnen; wizard: Assistent ab diesem Schritt ('video' …).
 *  → Promise, erfüllt mit „Zurück“. */
export function openSongPage(songId, { wizard = null } = {}) {
  wire();
  let s = S.songs.get(songId);
  if (!s) return Promise.resolve();
  // Ältere Songs: Abschnitte nach Startzeit, nicht nach Anlegen.
  const ordered = tidy(s);
  if (ordered !== s) { putSong(ordered); s = ordered; }
  return new Promise((resolve) => {
    st = {
      songId, resolve, player: null, loop: null, loopOn: false, rate: 1,
      stop: null, drag: null, lastPos: null, lastSec: null, leadLeft: null, folded: new Set(), sheet: null, taps: [], beatTaps: [], settings: false,
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
    fitDock();
    paintFollow();
    paintTransport();
    paintTabs();
    if (wizard) startWizard(wizard); else stopWizard();
    if (src?.videoId) loadVideo(src.videoId);
    st.stop = frameLoop(tick);
  });
}

function close() {
  if (!st) return;
  if (st.settings) toggleSettings(false);
  stopWizard();
  closeSheet();
  st.stop?.();
  st.player?.destroy();
  const r = st.resolve;
  st = null;
  r?.();
}

/** Titel/Künstler neu zeichnen (nach „Umbenennen“ im Menü). */
export function refreshSongPage() {
  if (!st) return;
  $('#sp-title').textContent = song().title;
  $('#sp-artist').textContent = song().artist || '';
  if (!st.settings) return;
  if (document.activeElement !== $('#sp-title-in')) $('#sp-title-in').value = song().title;
  if (document.activeElement !== $('#sp-artist-in')) $('#sp-artist-in').value = song().artist || '';
}

/* ---------- Einstellungen (Zahnrad) ------------------------------------- */

async function saveName() {
  if (!st) return;
  const t = $('#sp-title-in').value.trim(), a = $('#sp-artist-in').value.trim();
  const s = song();
  if (!t) { $('#sp-title-in').value = s.title; return; } // ein Titel muss bleiben
  if (t === s.title && a === (s.artist || '')) return;
  await putSong({ ...s, title: t, artist: a });
  refreshSongPage();
}

/** Zahnrad ↔ X: Einstellungen auf/zu. */
function toggleSettings(open = !st.settings) {
  if (!!open === !!st.settings) return;
  if (!open) document.activeElement?.blur?.(); // offene Eingabe übernehmen
  st.settings = !!open;
  if (open) closeSheet();
  const b = $('#sp-more');
  b.setAttribute('aria-expanded', open ? 'true' : 'false');
  b.setAttribute('aria-label', open ? 'Einstellungen schließen' : 'Einstellungen');
  $('#sp-gear').toggleAttribute('hidden', !!open); // SVG kennt .hidden nicht
  $('#sp-x').toggleAttribute('hidden', !open);
  $('#sp-settings').hidden = !open;
  for (const id of ['title', 'artist']) { $(`#sp-${id}`).hidden = !!open; $(`#sp-${id}-in`).hidden = !open; }
  if (open) { refreshSongPage(); paintSettings(); }
  reserveSpace();
}

/** Taktart ändern (Akkorde, die im kürzeren Takt keinen Platz haben, fallen weg). */
async function changeMeter(n) {
  const s = song(), bpb = s.beatsPerBar;
  if (n === bpb) return;
  if (n < bpb && s.events.some((e) => (e.at % bpb) >= n - EPS)) {
    const a = await modal(`Auf ${meterLabel(n)} umstellen?`, `Akkorde auf Schlag ${n + 1}${bpb > n + 1 ? ` bis ${bpb}` : ''} fallen weg.`, [
      { label: 'Abbrechen', value: '' }, { label: 'Umstellen', value: 'yes', primary: true },
    ]);
    if (a !== 'yes' || !st) return;
  }
  await save(tidy(setBeatsPerBar(song(), n)));
}
const changeBpm = (bpm) => save(tidy({ ...song(), bpm }));
const stepBpm = (by) => changeBpm(Math.max(30, Math.min(240, (song().bpm || 80) + by)));
function tapBeat() {
  const now = performance.now() / 1000;
  if (st.beatTaps.length && now - st.beatTaps[st.beatTaps.length - 1] > 2) st.beatTaps = [];
  st.beatTaps.push(now);
  const r = tapTempo(st.beatTaps);
  if (r.bpm) changeBpm(r.bpm);
  else $('#sp-tapnote').textContent = `Weiter tippen (noch ${r.need}×) …`;
}

/** Einstellungen zeichnen: Takt, Tempo, Aktionen. */
function paintSettings() {
  if (!st?.settings) return;
  const s = song(), bpb = s.beatsPerBar;
  const meters = el('div', 'seg');
  meters.setAttribute('role', 'group');
  meters.setAttribute('aria-label', 'Taktart');
  for (const n of METERS) {
    const b = button('seg-btn', meterLabel(n), () => changeMeter(n));
    b.setAttribute('aria-pressed', n === bpb ? 'true' : 'false');
    meters.append(b);
  }
  const tapNote = el('span', 'small muted', st.beatTaps.length > 1 ? `${st.beatTaps.length} Tipps` : '');
  tapNote.id = 'sp-tapnote';
  const act = (text, fn, cls = 'btn btn-secondary btn-sm') => button(cls, text, fn);
  const leaveTo = (name) => () => { toggleSettings(false); hooks.action(st.songId, name); };
  const actions = el('div', 'sp-set-actions');
  actions.append(
    act('Assistent', () => { toggleSettings(false); startWizard('video'); }),
    ...(tabsHaveHeaders(s) ? [act('Abschnitte aus den Tabs', () => { toggleSettings(false); fromTabs(); })] : []),
    act('Video ändern', () => { toggleSettings(false); $('#sp-novideo').hidden = false; $('#sp-url').focus(); }),
    act('Griffe', leaveTo('griffe')),
    act('Damit üben', leaveTo('practice')),
    act('Exportieren', leaveTo('export')),
    act('Löschen', leaveTo('delete'), 'btn btn-secondary btn-sm sp-danger'),
  );
  const takt = el('div', 'sp-set-row');
  takt.append(el('span', 'sp-lab', 'Takt'), meters);
  const tempo = el('div', 'sp-set-row');
  tempo.append(
    el('span', 'sp-lab', 'Tempo'),
    stepper(s.bpm ? String(s.bpm) : '–', stepBpm, 'Tempo'),
    button('btn btn-secondary btn-sm', 'Tippen', tapBeat, `Tempo tippen (je ${unitLabel(bpb)})`),
    ...(s.bpm ? [button('btn btn-ghost btn-sm', 'ohne', () => changeBpm(null))] : []),
    tapNote,
  );
  $('#sp-settings').replaceChildren(takt, tempo, actions);
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
      onState: () => { if (st === mine) { paintTransport(); autoTitle(); } },
    });
    if (st !== mine) { p.destroy(); return; }
    st.player = p;
    $('#sp-vnote').textContent = '';
    const d = p.duration();
    const src = youtubeSource(song());
    if (d > 0 && Math.abs((src?.durationSec || 0) - d) > 0.5) await save(tidy(setYoutube(song(), { durationSec: Math.round(d * 10) / 10 })));
    st.rate = 1;
    paintTransport();
    paintSections();
    paintWizard();
    autoTitle();
  } catch (e) {
    if (st !== mine) return;
    $('#sp-vnote').textContent = e?.message === 'offline'
      ? 'Kein Netz – das Video lässt sich gerade nicht laden. Die Tabs gehen trotzdem.'
      : yt.errorText(e?.message);
  }
}

/** Neuer Song aus einem YouTube-Link: Titel und Interpret aus den Angaben des
 *  Players übernehmen (einmal; danach gehört der Titel dem Nutzer). */
async function autoTitle() {
  const s = song();
  if (!st?.player || !s?.autoTitle) return;
  const m = st.player.meta();
  if (!m) return; // kommt mit einem späteren Zustandswechsel
  const { title, artist } = songFromVideo(m.title, m.author);
  const next = { ...s, title: title || s.title, artist: artist || s.artist };
  delete next.autoTitle;
  await putSong(next);
  refreshSongPage();
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

/** Loop über einen Abschnitt bzw. nur die Takte bars ({ from, to }, absolut).
 *  → { start, end, name, bars } oder null */
function loopRange(id, bars) {
  const r = sectionRange(id);
  if (!r || !bars) return r && { ...r, bars: null };
  const b = barsTime(song(), id, bars.from, bars.to, dur());
  if (!b) return null;
  return { ...b, name: `${r.name} · ${bars.from === bars.to ? `T. ${bars.from}` : `T. ${bars.from}–${bars.to}`}`, bars };
}

/** Abschnitts-Loop (neu) beginnen: einen Takt vor dem Anfang einsteigen
 *  (Vorlauf, loopLead), damit man den Einsatz findet; zwischen den
 *  Durchgängen genauso (tick, loopStart). */
function startLoop(id, bars) {
  const p = st.player;
  if (!p) { $('#sp-vnote').textContent = 'Erst ein Video laden.'; return; }
  const r = loopRange(id, bars);
  if (!r) { $('#sp-vnote').textContent = bars ? 'Für einzelne Takte braucht es das Tempo oder den Start des nächsten Abschnitts.' : whyNoRange(id); return; }
  $('#sp-vnote').textContent = '';
  st.loop = { ...r, sec: id, pre: loopLead(song()) };
  st.loopOn = true;
  p.seek(loopStart(st.loop));
  if (!p.playing()) play(p);
  paintSections();
  paintTransport();
}

/** Takte wählen: auf einen Takt lange drücken, dann über weitere ziehen; beim
 *  Loslassen läuft der Loop über die markierten Takte (ein Takt, wenn man
 *  nicht zieht). Kurzes Tippen bleibt für die Zellen (Akkord wählen). */
const HOLD_MS = 450, HOLD_SLOP = 10;
let barClickGuard = 0; // bis dahin zählt der Klick nach dem Ziehen nicht

function wireBarDrag(rows, secId) {
  let timer = null, down = null, anchor = null, span = null;
  const barAt = (x, y) => {
    const e = document.elementFromPoint(x, y)?.closest('.sp-bar');
    return e && rows.contains(e) ? Number(e.dataset.bar) : null;
  };
  const show = (a, b) => {
    span = barSpan(a, b);
    for (const el2 of rows.querySelectorAll('.sp-bar')) el2.classList.toggle('looped', Number(el2.dataset.bar) >= span.from && Number(el2.dataset.bar) <= span.to);
  };
  const stop = () => {
    clearTimeout(timer); timer = null;
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    window.removeEventListener('pointercancel', cancel);
    st.barDrag = false;
    down = null; anchor = null;
  };
  const move = (e) => {
    if (!down) return;
    if (anchor == null) { if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > HOLD_SLOP) stop(); return; }
    const b = barAt(e.clientX, e.clientY);
    if (b != null) show(anchor, b);
  };
  const up = () => {
    const sel = anchor != null ? span : null;
    stop();
    if (!sel) return;
    barClickGuard = performance.now() + 500;
    // Erst nach dem Klick, der auf das Loslassen folgt (der Raster wird neu gezeichnet).
    setTimeout(() => startLoop(secId, sel), 0);
  };
  const cancel = () => { stop(); for (const el2 of rows.querySelectorAll('.sp-bar.looped')) el2.classList.remove('looped'); };
  rows.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const b = barAt(e.clientX, e.clientY);
    if (b == null || st.barDrag) return;
    down = { x: e.clientX, y: e.clientY };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
    timer = setTimeout(() => {
      timer = null;
      anchor = b;
      st.barDrag = true; // ab jetzt kein Scrollen mehr (touchmove, siehe wire)
      navigator.vibrate?.(12);
      show(b, b);
    }, HOLD_MS);
  });
  // Kein Kontextmenü beim langen Drücken.
  rows.addEventListener('contextmenu', (e) => e.preventDefault());
}

/** Warum ein Abschnitt (noch) nicht im Video zu finden ist. */
function whyNoRange(id) {
  const sec = song().sections.find((x) => x.id === id);
  const tm = sectionTimes(song(), dur()).find((x) => x.id === id);
  if (tm?.start == null) return `Für „${sec?.name}“ fehlt die Startzeit: im Video an den Anfang spulen, dann ⋯ → „Start hier“.`;
  return `Für „${sec?.name}“ fehlt das Ende: Tempo setzen (Zahnrad oben) oder beim nächsten Abschnitt „Start hier“.`;
}

/** Abschnitt als Loop (↻ an der Karte). Noch einmal: Loop aus. */
function loopSection(id) {
  if (st.loopOn && st.loop?.sec === id) { st.loopOn = false; paintSections(); paintTransport(); return; }
  startLoop(id, null);
}

/** Ab einem Takt spielen (Pfeil vor der Zeile). Ein laufender Loop bleibt nur,
 *  wenn der Takt darin liegt. */
function playFromBar(id, bar) {
  const p = st.player;
  if (!p) { $('#sp-vnote').textContent = 'Erst ein Video laden.'; return; }
  const b = barsTime(song(), id, bar, bar, dur());
  if (!b) { $('#sp-vnote').textContent = whyNoRange(id); return; }
  $('#sp-vnote').textContent = '';
  if (st.loopOn && !(st.loop?.sec === id && b.start >= st.loop.start - 0.01 && b.start < st.loop.end)) {
    st.loopOn = false;
    paintSections();
    paintTransport();
  }
  p.seek(b.start);
  if (!p.playing()) play(p);
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
    const r = loopRange(id, null);
    if (r) st.loop = { ...r, sec: id, pre: loopLead(song()) };
  }
  p.seek(tm.start);
  if (!p.playing()) play(p);
  paintTransport();
}

/** Wo ein Loop beginnt: Start minus Vorlauf (der Takt davor). */
const loopStart = (l) => Math.max(0, l.start - (l.pre || 0));

/* ---------- Abschnitte (Leadsheet) -------------------------------------- */

async function addHere() {
  const base = await pickName();
  if (!base || !st) return;
  const id = await addNamed(base);
  $(`#sp-sections [data-id="${id}"]`)?.scrollIntoView({ block: 'nearest' });
}

/** Abschnitt „base“ (nummeriert, wo üblich) ab der aktuellen Stelle. → id */
async function addNamed(base) {
  const s = song();
  const name = NUMBERED.has(base) || s.sections.some((x) => x.name === base) ? nextMarkName(s.sections, base) : base;
  const t = st.player ? st.player.now() : null;
  const added = addSection(s, { name, startSec: t });
  const id = added.sections[added.sections.length - 1].id;
  // Einsortiert nach Startzeit, nicht hinten angehängt.
  await save(tidy(added));
  return id;
}

/** Was der Assistent (songwizard.js) auf der Liedseite tun darf. */
const wizardApi = {
  song: () => song(),
  now: () => (st?.player ? st.player.now() : null),
  hasVideo: () => !!st?.player || !!youtubeSource(song())?.videoId,
  addSection: (base) => addNamed(base),
  deleteSection: (id) => save(tidy(deleteSection(song(), id))),
  setBpm: (bpm) => save(tidy({ ...song(), bpm })),
  tapChord: async (sym) => {
    const t = st.player ? st.player.now() : null;
    const r = t == null ? null : tapChordAt(song(), t, sym);
    if (!r) return null;
    await save(r.song);
    return r.at;
  },
  clearChord: (at) => save(setChordAt(song(), at, null)),
  newChord: async () => {
    const c = (await ask('Neuer Akkord', 'z. B. Am, D/F# oder Bbmaj7', { ok: 'Anlegen' }))?.trim();
    if (!c || !st) return null;
    if (!parseChord(c)) {
      await modal('Unbekannter Akkord', `„${c}“ kann ich nicht lesen. Beispiele: Am, D/F#, Fmaj7, Bb, C#m7.`, [{ label: 'OK', value: '', primary: true }]);
      return null;
    }
    await save(addChord(song(), c));
    return c;
  },
  griffe: (sym) => hooks.griffe(st.songId, sym),
};


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
async function fromTabs() {
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
const tabsHaveHeaders = (s) => tabBlocks(s?.tabText || '').some((b) => b.header);

/** „Folgen üben“: die Abschnitte (bzw. nur `sectionIds`) in 2-Takt-Folgen
 *  zum Klick. Das Video hält an; zurück geht es an dieselbe Stelle. */
async function drill(sectionIds = null) {
  const chunks = drillChunks(song(), { sectionIds });
  if (!chunks.length) {
    await modal('Noch keine Akkorde', 'Erst im Raster Akkorde setzen (Zelle antippen) – oder im Zahnrad (oben) die Abschnitte aus den Tabs anlegen.', [{ label: 'OK', value: '', primary: true }]);
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
  const showText = !!text;
  const lines = showText ? parseTabText(text, s) : [];
  const blocks = showText ? tabBlocks(text, lines) : [];
  const { map, rest, intro } = blocksForSections(s, blocks);
  $('#sp-main').style.setProperty('--tab-size', `${S.settings.tabSize || 15}px`);
  // Ohne Abschnitte: die Tabs am Stück; sonst nur der Text vor der ersten Überschrift.
  paintLines($('#sp-intro'), list.length ? intro.flatMap((b) => b.lines) : lines);
  $('#sp-sec-empty').hidden = list.length > 0;
  $('#sp-fromtabs').hidden = !blocks.some((b) => b.header);
  const sel = st.sheet?.kind === 'chord' ? st.sheet.arg : null;
  $('#sp-sections').replaceChildren(...list.map((sec, i) => card(s, sec, times[i], map[sec.id], sel)));
  $('#sp-rest').hidden = !list.length || !rest.length;
  paintLines($('#sp-rest-text'), rest.flatMap((b) => [{ kind: 'header', text: b.header }, ...b.lines]));
  paintTicks(times);
  paintChordBar();
  st.lastPos = null;
  st.lastSec = null;
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
  const loopBars = loopOn ? st.loop.bars : null;
  const bars = el('div', `sp-rows m${bpb}${loopOn ? ' looping' : ''}`);
  let row = null;
  for (const b of sectionGrid(s, sec)) {
    // Zwei Takte pro Zeile; vor jeder Zeile ein Pfeil: ab hier spielen.
    if (!row || row.querySelectorAll('.sp-bar').length >= 2) {
      row = el('div', 'sp-row');
      row.append(button('sp-go', '▶', () => playFromBar(sec.id, b.bar), `Ab Takt ${b.bar} spielen`));
      bars.append(row);
    }
    const bar = el('div', 'sp-bar');
    bar.dataset.bar = b.bar;
    const picked = loopBars && b.bar >= loopBars.from && b.bar <= loopBars.to;
    if (picked) bar.classList.add('looped');
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
    row.append(bar);
  }
  li.append(head);
  if (loopOn) li.append(el('p', 'sp-loophint', loopBars ? 'Wiederholt die markierten Takte. Neu wählen: auf einen Takt lange drücken und über weitere ziehen. ↻ noch einmal beendet den Loop.' : 'Wiederholt den Abschnitt. Nur bestimmte Takte: auf einen Takt lange drücken und über weitere ziehen.'));
  wireBarDrag(bars, sec.id);
  li.append(bars);
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

/** Seitenende frei halten für die Leiste unten. → Höhe der Leiste (px) */
function fitDock() {
  const land = matchMedia(LANDSCAPE).matches;
  const h = land ? 0 : $('#sp-dock').offsetHeight || 0;
  reserveSpace();
  return h;
}

/** Platz am Ende lassen: Hochformat unter der Leiste, bei offenem Blatt
 *  zusätzlich so hoch wie das Blatt — sonst lassen sich die letzten Zeilen
 *  nicht über das Blatt hinaus hochschieben. Querformat: die Leiste steht
 *  links; bei offenem Blatt Platz im scrollenden Leadsheet. */
function reserveSpace() {
  const land = matchMedia(LANDSCAPE).matches;
  const sh = $('#sp-sheet');
  const sheetH = sh.hidden ? 0 : sh.offsetHeight + 16;
  const dockH = land ? 0 : $('#sp-dock').offsetHeight || 0;
  $('#s-song').style.paddingBottom = land ? '' : `calc(${dockH + sheetH}px + 8px)`;
  $('#sp-main').style.paddingBottom = land && sheetH ? `${sheetH}px` : '';
}

function placeSheet() {
  const sh = $('#sp-sheet');
  if (sh.hidden) return;
  const dock = $('#sp-dock');
  if (matchMedia(LANDSCAPE).matches) {
    sh.style.bottom = '0px';
    sh.style.left = `${Math.round(dock.getBoundingClientRect().right + 8)}px`;
    sh.style.maxHeight = `${Math.max(140, Math.round(window.innerHeight * 0.62))}px`;
  } else {
    const h = dock.offsetHeight || 0;
    sh.style.bottom = `${h}px`;
    sh.style.left = '0px';
    sh.style.maxHeight = `${Math.max(150, window.innerHeight - h - 70)}px`;
  }
  reserveSpace();
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
  reserveSpace();
  for (const c of $$('#sp-sections .sp-bt.sel')) c.classList.remove('sel');
}

function refreshSheet() {
  const k = st?.sheet;
  if (!k) return;
  if (k.kind === 'chord') chordSheet(k.arg);
  else if (k.kind === 'grip') gripSheet(k.arg);
  else if (k.kind === 'section') sectionSheet(k.arg);
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

/** Alle Akkorde des Songs (Liste und die in den Wechseln verwendeten). */
const songChords = (s) => {
  const out = [...s.chords];
  for (const e of s.events) if (!out.includes(e.chord)) out.push(e.chord);
  return out;
};

/** Akkord anhören (Griff des Songs oder Standardlage). */
async function hearChord(sym) {
  await audio.unlock();
  const v = voicingFor(song(), sym);
  if (v) audio.chord(v, audio.now() + 0.02, { dur: 1.8 });
}

/** Akkordzeile unten: Antippen hört den Akkord, Halten öffnet die Tasten. */
function paintChordBar() {
  const s = song();
  // Ganz vorn: Folgen üben (Symbol: Pfeil im Kreis mit Folge).
  const ns = 'http://www.w3.org/2000/svg';
  const icon = document.createElementNS(ns, 'svg');
  icon.setAttribute('viewBox', '0 0 24 24'); icon.setAttribute('width', '24'); icon.setAttribute('height', '24');
  icon.setAttribute('aria-hidden', 'true'); icon.setAttribute('fill', 'none'); icon.setAttribute('stroke', 'currentColor');
  icon.setAttribute('stroke-width', '2.2'); icon.setAttribute('stroke-linecap', 'round'); icon.setAttribute('stroke-linejoin', 'round');
  for (const d of ['M3 6h8M3 12h5M3 18h8', 'M14 7l7 5-7 5z']) {
    const path = document.createElementNS(ns, 'path');
    path.setAttribute('d', d);
    icon.append(path);
  }
  const drillBtn = button('sp-ch sp-ch-drill', null, () => drill(), 'Folgen üben');
  drillBtn.title = 'Folgen üben';
  drillBtn.append(icon);
  $('#sp-chordbar').replaceChildren(drillBtn, ...songChords(s).map((sym) => {
    const own = !!s.voicings?.[sym];
    const b = button(`sp-ch${own ? '' : ' std'}`, prettyChord(sym), () => hearChord(sym), `${sym}: antippen zum Anhören, halten für die Tasten`);
    b.dataset.sym = sym;
    onLongPress(b, () => gripSheet(sym));
    return b;
  }));
}

/** Kleiner Editor: welche Tasten zum Akkord gehören; Tasten antippen
 *  schaltet sie an/aus (Hände und Finger trägt man nicht ein). */
function gripSheet(sym) {
  const s = song();
  const v = voicingFor(s, sym);
  const keys = allKeys(v);
  const prev = $('#sp-sheet .sp-gripkb');
  const keep = st.sheet?.kind === 'grip' && st.sheet.arg === sym && prev ? prev.scrollLeft : null;
  const marks = voicingMarks(v);
  for (const [m, x] of marks) marks.set(m, { ...x, hand: 'rh', finger: null });
  const wrap = el('div', 'sp-gripkb');
  const kb = renderKeyboard(wrap, {
    lo: 36, hi: 84, marks, ww: 26, wh: matchMedia(LANDSCAPE).matches ? 58 : 92, px: true,
    title: `Klaviatur C2 bis C6, ${prettyChord(sym)}: ${keys.map(noteName).join(', ') || 'keine Taste'}`,
  });
  wrap.addEventListener('click', (e) => {
    const g = e.target.closest('[data-midi]');
    if (g) toggleKey(sym, Number(g.dataset.midi));
  });
  const names = el('p', 'sp-gripnames', keys.length ? keys.map(noteName).join(' · ') : 'Keine Taste – antippen, um den Griff einzutragen.');
  const own = !!s.voicings?.[sym];
  openSheet('grip', sym, prettyChord(sym),
    v?.std ? 'Standardlage. Tasten antippen, um den Griff aus dem Unterricht einzutragen.' : '', [
      names,
      wrap,
      row(big('Anhören', () => hearChord(sym), { quiet: true }),
        ...(own ? [big('Standardlage', () => save(setVoicing(song(), sym, null)), { quiet: true })] : [])),
    ]);
  const mid = keys.length ? Math.round((keys[0] + keys[keys.length - 1]) / 2) : 60;
  wrap.scrollLeft = keep ?? Math.max(0, kb.center(Math.max(36, Math.min(84, mid))) - wrap.clientWidth / 2);
}

async function toggleKey(sym, m) {
  const s = song();
  const keys = allKeys(voicingFor(s, sym));
  const next = keys.includes(m) ? keys.filter((k) => k !== m) : [...keys, m];
  const v = voicingFromKeys(next, s.voicings?.[sym]?.note?.slice(0, NOTE_MAX));
  if (v.rh.length > 5 || v.lh.length > 5) { $('#sp-sheet-text').textContent = 'Höchstens 5 Tasten über und 5 unter G3.'; $('#sp-sheet-text').hidden = false; return; }
  if (!keys.includes(m)) { await audio.unlock(); audio.note(m, audio.now() + 0.02, { dur: 1.2 }); }
  await save(setVoicing(s, sym, next.length ? v : null));
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
  // Beim Wählen anspielen, damit man hört, ob er passt; gleicher Akkord wie davor = Neuanschlag.
  const hear = (s0, c) => {
    const v = voicingFor(s0, c);
    if (v) audio.chord(v, audio.now() + 0.02, { dur: 1.8 });
  };
  const set = (c) => { hear(s, c); return save(setChordAt(clearCell(s), beat, c, true)); };
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
    const s2 = addChord(song(), c);
    hear(s2, c);
    await save(setChordAt(clearCell(s2), beat, c, true));
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
    await save(updateSection(resizeSection(song(), id, n), id, { barsSet: true }));
  };
  const setStart = (sec2) => save(tidy(updateSection(song(), id, { startSec: Math.max(0, Math.round(sec2 * 100) / 100) })));
  const del = async () => {
    const a = await modal(`„${sec.name}“ löschen?`, 'Seine Akkorde fallen weg; die Abschnitte danach rücken auf.', [
      { label: 'Abbrechen', value: '' }, { label: 'Löschen', value: 'yes', primary: true },
    ]);
    if (a !== 'yes' || !st) return;
    closeSheet();
    await save(tidy(deleteSection(song(), id)));
  };
  const rename = async () => {
    const n = await ask('Abschnitt umbenennen', '', { value: sec.name, ok: 'Umbenennen' });
    if (n && st) await save(updateSection(song(), id, { name: n }));
  };
  const times = [
    ...(t != null ? [big(`Start hier (${fmtClock(t)})`, () => setStart(st.player.now()), { quiet: true })] : []),
    ...(sec.startSec != null ? [
      big('Start −0,2 s', () => setStart(sec.startSec - 0.2), { quiet: true }),
      big('Start +0,2 s', () => setStart(sec.startSec + 0.2), { quiet: true }),
    ] : []),
  ];
  // Takte aus Tempo und Startzeiten, solange man sie nicht selbst ändert.
  const next = sectionList(s).find((x) => x.bar > sec.bar);
  const fits = !!s.bpm && next?.startSec != null;
  const auto = big('aus der Zeit', () => save(tidy(updateSection(song(), id, { barsSet: false }))), { quiet: true, aria: 'Takte wieder aus Tempo und Startzeiten' });
  openSheet('section', id, sec.name, text, [
    label(fits && !sec.barsSet ? 'Takte (aus Tempo und Startzeiten)' : 'Takte'),
    row(stepper(String(sec.bars), resize, 'Takte'), ...(fits && sec.barsSet ? [auto] : [])),
    ...(times.length ? [row(...times)] : []),
    row(big('Folgen üben', () => drill([id]), { quiet: true }), big('Umbenennen', rename, { quiet: true }),
      big('Löschen', del, { quiet: true })),
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
  for (const b of [btn, $('#sp-rew'), $('#sp-fwd')]) b.disabled = !p;
  // Geschwindigkeit als Auswahlmenü (nur neu aufbauen, wenn sich die Liste ändert).
  const rates = p ? p.rates().filter((r) => RATES.includes(r)) : RATES;
  const sel = $('#sp-rate');
  if (sel.dataset.rates !== rates.join()) {
    sel.dataset.rates = rates.join();
    sel.replaceChildren(...rates.map((r) => { const o = el('option', '', `${String(r).replace('.', ',')}×`); o.value = String(r); return o; }));
  }
  sel.value = String(st.rate);
  sel.disabled = !p;
  for (const b of $$('#sp-sections [data-loop]')) {
    const on = st.loopOn && st.loop?.sec === b.dataset.loop;
    // Im Vorlauf (Takt vor dem Loop) zählt der Knopf die Schläge herunter.
    b.textContent = on && st.leadLeft ? String(st.leadLeft) : '↻';
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
  if (p && st.loopOn && st.loop && p.playing() && !p.seeking() && t >= st.loop.end - 0.03) {
    p.seek(loopStart(st.loop)); // mit Vorlauf (Abschnitt: der Takt davor)
  }
  paintLead(p, t);
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
  // Wo im Leadsheet: Karte, Takt, Schlag.
  const pos = p ? playPos(song(), t, d) : null;
  const key = pos ? `${pos.id}:${pos.beat == null ? '' : Math.floor(pos.beat + EPS)}` : '';
  if (key !== st.lastPos) {
    st.lastPos = key;
    paintPlayhead(pos, playing);
  }
}

/** Im Vorlauf eines Abschnitts-Loops: Schläge bis zum Einsatz. */
function paintLead(p, t) {
  const l = st.loop;
  const pre = l?.sec && st.loopOn && p?.playing() ? l.pre : 0;
  const left = pre && t < l.start - 0.02 && t >= l.start - pre - 0.5
    ? Math.max(1, Math.ceil((l.start - t) / (pre / song().beatsPerBar))) : null;
  if (left !== st.leadLeft) { st.leadLeft = left; paintTransport(); }
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
  if (playing && !st.sheet && follows()) followIntoView(target === cardEl ? cardEl.querySelector('.sp-card-head') : target);
}

/** Automatisch mitscrollen (Schalter unten, gemerkt; Standard: an). */
const follows = () => S.settings.followScroll !== false;
function paintFollow() {
  $('#sp-follow').setAttribute('aria-pressed', follows() ? 'true' : 'false');
}

/** Knoten in den sichtbaren Bereich holen (unter dem stehenden Player). */
function followIntoView(node) {
  const r = node.getBoundingClientRect();
  const land = matchMedia(LANDSCAPE).matches;
  const box = land ? $('#sp-main').getBoundingClientRect() : null;
  const top = land ? box.top : 8;
  const bottom = land ? box.bottom : window.innerHeight - ($('#sp-dock').offsetHeight || 0);
  if (r.top >= top + 4 && r.bottom <= bottom - 4) return;
  const by = r.top - top - 12;
  if (land) $('#sp-main').scrollBy({ top: by, behavior: 'smooth' });
  else window.scrollBy({ top: by, behavior: 'smooth' });
}

function onKey(e) {
  if (!st || screenName() !== 'song' || !$('#modal').hidden) return;
  if (e.key === 'Escape' && st.sheet) { e.preventDefault(); closeSheet(); return; }
  if (e.key === 'Escape' && st.settings) { e.preventDefault(); toggleSettings(false); return; }
  if (e.target.closest?.('input, textarea, select')) return;
  if (e.key === ' ') { e.preventDefault(); togglePlay(); }
  else if (e.key === 'ArrowLeft') { e.preventDefault(); skip(-SKIP); }
  else if (e.key === 'ArrowRight') { e.preventDefault(); skip(SKIP); }
}

/* ---------- Tabs (vorhandener Text) ------------------------------------ */

function paintTabs() {
  paintSections();
}
