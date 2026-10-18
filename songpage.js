/* songpage.js — Liedseite: ein Song zum Mitspielen. Oben der YouTube-Player
   (immer sichtbar, nie überdeckt) mit großer Play/Pause-Taste, ±5 s, Tempo
   0,5 / 0,75 / 1, Zeitleiste mit Abschnitten und Loop; darunter die Tabs —
   eingefügter Text (Akkordzeilen hervorgehoben, Schriftgröße einstellbar)
   oder ein PDF vom Gerät. Abschnitte sind Marken in Sekunden (marks.js):
   „+ Abschnitt“ setzt eine an der aktuellen Stelle, Antippen springt hin,
   „Loop“ wiederholt den Abschnitt, in dem man gerade ist (oder A–B).
   Text, Tabs und PDF bleiben auf dem Gerät. Tasten: Leertaste Play/Pause,
   ←/→ ±5 s, L Loop. */

import * as yt from './yt.js';
import { S, putSong, saveSettings, getPdf, putPdf, deletePdf } from './store.js';
import { setYoutube } from './songdata.js';
import { youtubeSource } from './timeline.js';
import { parseYouTubeId } from './tap.js';
import { prettyChord } from './chordsym.js';
import { parseTabText, chordsInText } from './tabtext.js';
import { addMark, removeMark, renameMark, moveMark, markRange, markAt, nextMarkName, sortMarks, fmtClock } from './marks.js';
import { $, $$, showScreen, screenName, modal, ask, frameLoop, onLongPress } from './ui.js';

const RATES = [0.5, 0.75, 1];
const SKIP = 5;
const SECTION_NAMES = ['Intro', 'Strophe', 'Pre-Chorus', 'Refrain', 'Bridge', 'Solo', 'Outro'];
const SIZE = { min: 12, max: 30, step: 2 };

let st = null;
let wired = false;
let hooks = { menu: async () => {} };

const song = () => S.songs.get(st.songId);
const dur = () => st.player?.duration() || youtubeSource(song())?.durationSec || 0;

async function save(next) {
  await putSong(next);
  paintMarks();
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
  $('#sp-addmark').addEventListener('click', addHere);
  $('#sp-load').addEventListener('click', loadFromInput);
  $('#sp-url').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); loadFromInput(); } });
  wireTrack();
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
  const s = S.songs.get(songId);
  if (!s) return Promise.resolve();
  return new Promise((resolve) => {
    st = { songId, resolve, player: null, loop: null, loopOn: false, rate: 1, editing: false, pdfUrl: null, stop: null, drag: null, lastMark: '' };
    $('#sp-title').textContent = s.title;
    $('#sp-artist').textContent = s.artist || '';
    $('#sp-vnote').textContent = '';
    const src = youtubeSource(s);
    $('#sp-url').value = src?.videoId ? `https://youtu.be/${src.videoId}` : '';
    $('#sp-novideo').hidden = !!src?.videoId;
    $('#sp-yt').hidden = !src?.videoId;
    showScreen('song');
    paintMarks();
    paintTransport();
    paintTabs();
    if (src?.videoId) loadVideo(src.videoId);
    st.stop = frameLoop(tick);
  });
}

function close() {
  if (!st) return;
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
    paintMarks();
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
  else {
    p.play();
    setTimeout(() => { if (st?.player === p && !p.playing() && !$('#sp-vnote').textContent) $('#sp-vnote').textContent = 'Startet nicht? Einmal direkt aufs Video tippen.'; }, 2500);
  }
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

/** Loop an: A–B, falls gesetzt, sonst der Abschnitt an der aktuellen Stelle. */
function toggleLoop() {
  if (!st.player) return;
  if (st.loopOn) { st.loopOn = false; paintTransport(); return; }
  if (!st.loop) {
    const m = markAt(song().marks, st.player.now());
    if (!m) { $('#sp-vnote').textContent = 'Für den Loop erst einen Abschnitt setzen – oder A und B.'; return; }
    st.loop = { ...markRange(song().marks, m.id, dur()), name: m.name, id: m.id };
  }
  st.loopOn = true;
  paintTransport();
}

/** Loop über einen Abschnitt (Abschnitt antippen, wenn Loop an ist). */
function loopMark(id) {
  const m = sortMarks(song().marks).find((x) => x.id === id);
  if (!m) return;
  st.loop = { ...markRange(song().marks, id, dur()), name: m.name, id };
  paintTransport();
}

/** A bzw. B an die aktuelle Stelle. */
function setAB(which) {
  const p = st.player;
  if (!p) return;
  const t = p.now();
  const cur = st.loop && !st.loop.id ? st.loop : { start: 0, end: dur() || t + 10 };
  const next = which === 'a' ? { start: t, end: Math.max(t + 1, cur.end) } : { start: Math.min(cur.start, t - 1), end: t };
  st.loop = { start: Math.max(0, next.start), end: next.end, name: 'A–B', id: null };
  st.loopOn = true;
  paintTransport();
}

/* ---------- Abschnitte -------------------------------------------------- */

async function addHere() {
  const t = st.player ? st.player.now() : 0;
  const base = await pickName();
  if (!base) return;
  await save({ ...song(), marks: addMark(song().marks, t, nextMarkName(song().marks, base)) });
}

/** Namensauswahl: Vorschläge als Knöpfe, „Anderer …“ als Eingabe. */
async function pickName() {
  const v = await modal('Abschnitt beginnt hier', '', [
    ...SECTION_NAMES.map((n) => ({ label: n, value: n })),
    { label: 'Anderer …', value: '*' },
    { label: 'Abbrechen', value: '' },
  ]);
  if (v !== '*') return v;
  return ask('Name des Abschnitts', '', { placeholder: 'z. B. Zwischenteil', ok: 'Setzen' });
}

async function markMenu(m) {
  const t = st.player ? st.player.now() : null;
  const a = await modal(m.name, `beginnt bei ${fmtClock(m.sec, { tenths: true })}`, [
    { label: 'Löschen', value: 'del' },
    { label: 'Umbenennen', value: 'ren' },
    ...(t != null ? [{ label: `Hierher (${fmtClock(t)})`, value: 'move' }] : []),
    { label: 'Loop', value: 'loop', primary: true },
  ]);
  if (a === 'del') {
    if (st.loop?.id === m.id) { st.loop = null; st.loopOn = false; }
    await save({ ...song(), marks: removeMark(song().marks, m.id) });
  } else if (a === 'ren') {
    const n = await ask('Abschnitt umbenennen', '', { value: m.name, ok: 'Umbenennen' });
    if (n) await save({ ...song(), marks: renameMark(song().marks, m.id, n) });
  } else if (a === 'move') {
    await save({ ...song(), marks: moveMark(song().marks, m.id, t) });
  } else if (a === 'loop') {
    loopMark(m.id);
    st.loopOn = true;
    st.player?.seek(st.loop.start);
    paintTransport();
  }
  if (st.loop?.id) { const r = markRange(song().marks, st.loop.id, dur()); if (r) Object.assign(st.loop, r); }
}

function paintMarks() {
  if (!st) return;
  const marks = sortMarks(song().marks);
  $('#sp-marks').replaceChildren(...marks.map((m) => {
    const li = document.createElement('li');
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'sp-mark';
    b.dataset.id = m.id;
    const n = document.createElement('b'); n.textContent = m.name;
    const t = document.createElement('small'); t.textContent = fmtClock(m.sec);
    b.append(n, t);
    b.addEventListener('click', () => {
      st.player?.seek(m.sec);
      if (st.loopOn) loopMark(m.id);
    });
    onLongPress(b, () => markMenu(m));
    li.append(b);
    return li;
  }));
  $('#sp-marks-hint').hidden = marks.length > 0;
  // Striche auf der Zeitleiste
  const d = dur();
  $('#sp-ticks').replaceChildren(...(d > 0 ? marks : []).map((m) => {
    const i = document.createElement('i');
    i.style.left = `${(m.sec / d) * 100}%`;
    i.title = m.name;
    return i;
  }));
  st.lastMark = '';
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
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'seg-btn';
    b.textContent = `${String(r).replace('.', ',')}×`;
    b.setAttribute('aria-pressed', r === st.rate ? 'true' : 'false');
    b.disabled = !p;
    b.addEventListener('click', () => setRate(r));
    return b;
  }));
  const loop = $('#sp-loop');
  loop.setAttribute('aria-pressed', st.loopOn ? 'true' : 'false');
  loop.textContent = st.loopOn && st.loop ? `Loop: ${st.loop.name}` : 'Loop';
}

function tick() {
  if (!st || screenName() !== 'song') return;
  const p = st.player;
  const d = dur();
  const t = st.drag ?? (p ? p.now() : 0);
  // Loop: an B zurück zu A.
  if (p && st.loopOn && st.loop && p.playing() && t >= st.loop.end - 0.03) p.seek(st.loop.start);
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
  // Aktueller Abschnitt hervorgehoben.
  const m = markAt(song().marks, t);
  const id = m?.id || '';
  if (id !== st.lastMark) {
    st.lastMark = id;
    for (const b of $$('#sp-marks .sp-mark')) b.classList.toggle('now', b.dataset.id === id);
    $('#sp-section').textContent = m ? `Abschnitt: ${m.name}` : '';
    $('#sp-marks .sp-mark.now')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
}

function onKey(e) {
  if (!st || screenName() !== 'song' || !$('#modal').hidden) return;
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
  const cur = S.settings.tabSize || 17;
  S.settings.tabSize = Math.max(SIZE.min, Math.min(SIZE.max, cur + by));
  saveSettings();
  $('#sp-text').style.fontSize = `${S.settings.tabSize}px`;
}

async function paintTabs() {
  const mode = tabMode();
  for (const b of $$('#s-song [data-tabmode]')) b.setAttribute('aria-pressed', b.dataset.tabmode === mode ? 'true' : 'false');
  $('#sp-textbox').hidden = mode !== 'text';
  $('#sp-pdfbox').hidden = mode !== 'pdf';
  $('#sp-smaller').hidden = $('#sp-bigger').hidden = $('#sp-edit').hidden = mode !== 'text';
  if (mode === 'text') paintText();
  else await paintPdf();
}

function paintText() {
  const text = song().tabText || '';
  const view = $('#sp-text');
  view.style.fontSize = `${S.settings.tabSize || 17}px`;
  view.hidden = st.editing;
  $('#sp-text-edit').hidden = !st.editing;
  $('#sp-edit').textContent = st.editing ? 'Fertig' : text ? 'Bearbeiten' : 'Text einfügen';
  $('#sp-text-empty').hidden = !!text || st.editing;
  view.replaceChildren(...parseTabText(text).map((l) => {
    const div = document.createElement('div');
    div.className = `tl tl-${l.kind}`;
    div.textContent = l.kind === 'chords' ? l.text.replace(/\S+/g, (x) => prettyChord(x)) : (l.text || ' ');
    return div;
  }));
}

async function toggleEdit() {
  if (st.editing) { await finishEdit(); return; }
  st.editing = true;
  const ta = $('#sp-text-edit');
  ta.value = song().tabText || '';
  paintText();
  ta.focus();
}

/** Text übernehmen; neue Akkorde daraus kommen in die Akkordliste des Songs. */
async function finishEdit() {
  st.editing = false;
  const text = $('#sp-text-edit').value.replace(/\s+$/, '');
  const s = song();
  const chords = [...s.chords];
  for (const c of chordsInText(text)) if (!chords.includes(c)) chords.push(c);
  const next = { ...s, chords, tabText: text };
  if (!text) delete next.tabText;
  await putSong(next);
  paintText();
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
