/* songs.js — Screens „Songs“ und „Import“: Liste, aktueller Song,
   Importieren (Datei oder eingefügt), Exportieren (ohne Text voreingestellt),
   Löschen mit Rückfrage. Prüfen und Normalisieren rein in songdata.js. */

import { S, songList, currentSong, setCurrentSong, putSong, deleteSong } from './store.js';
import { parseSongText, exportSong, songSummary, copyId } from './songdata.js';
import { prettyChord } from './chordsym.js';
import { $, showScreen, modal } from './ui.js';
import { logError } from './log.js';

let hooks = { practice: () => {}, griffe: () => {}, transcribe: () => {}, home: () => {} };
let pending = null; // geprüfter Song im Import

/** Verdrahten. h: { practice(id), griffe(id), transcribe(id), home() } */
export function initSongs(h) {
  hooks = { ...hooks, ...h };
  $('#songs-import').addEventListener('click', openImport);
  $('#imp-back').addEventListener('click', showSongs);
  $('#imp-file').addEventListener('change', async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    try { $('#imp-text').value = await f.text(); } catch (err) { logError('import:file', err); }
    e.target.value = '';
    check();
  });
  $('#imp-text').addEventListener('input', check);
  $('#imp-ok').addEventListener('click', take);
}

/** Zeile „12 Wechsel · 3 Abschnitte · Video“ zu einem Song. */
export function songFacts(song) {
  const parts = [];
  parts.push(song.events.length ? `${song.events.length} Wechsel` : 'noch keine Wechsel');
  if (song.sections.length) parts.push(`${song.sections.length} ${song.sections.length === 1 ? 'Abschnitt' : 'Abschnitte'}`);
  if (song.sources.some((s) => s.type === 'youtube' && s.videoId)) parts.push('Video');
  if (song.verified) parts.push('gegengehört');
  return parts.join(' · ');
}

export function showSongs() {
  const cur = currentSong();
  const mk = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  $('#song-list').replaceChildren(...songList().map((song) => {
    const li = mk('li', `card song-item${song.id === cur?.id ? ' current' : ''}`);
    const head = mk('div', 'card-head');
    const h = mk('h2', 'h2', song.title);
    head.append(h);
    if (song.id === cur?.id) head.append(mk('span', 'badge', 'aktuell'));
    const by = mk('p', 'small muted', [song.artist, song.key].filter(Boolean).join(' · '));
    const facts = mk('p', 'small muted', songFacts(song));
    const chords = mk('p', 'song-chords', song.chords.map(prettyChord).join('  '));
    const row = mk('div', 'song-actions');
    const btn = (label, fn, cls = 'btn btn-secondary btn-sm') => { const b = mk('button', cls, label); b.type = 'button'; b.addEventListener('click', fn); return b; };
    row.append(
      btn('Üben', () => practice(song.id), 'btn btn-primary btn-sm'),
      btn('Griffe', () => hooks.griffe(song.id)),
      btn('Transkribieren', () => hooks.transcribe(song.id)),
      btn('Exportieren', () => exportOne(song)),
      btn('Löschen', () => remove(song)),
    );
    li.append(head, by, facts, chords, row);
    return li;
  }));
  showScreen('songs');
}

async function practice(id) {
  await setCurrentSong(id);
  hooks.practice(id);
}

/** Datei anbieten; Text nur auf Wunsch. */
async function exportOne(song) {
  let lyrics = false;
  if (song.lyrics?.some((l) => l.line)) {
    const a = await modal('Exportieren', 'Der Text bleibt sonst nur auf diesem Gerät.',
      [{ label: 'Abbrechen', value: 'no' }, { label: 'Mit Text', value: 'with' }, { label: 'Ohne Text', value: 'without', primary: true }]);
    if (a === 'no') return;
    lyrics = a === 'with';
  }
  const text = exportSong(song, { lyrics });
  try {
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${song.id}.json`;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  } catch (e) {
    logError('export', e);
    try { await navigator.clipboard.writeText(text); await modal('Exportieren', 'Die Datei ging nicht – das JSON liegt jetzt in der Zwischenablage.', [{ label: 'OK', value: 'ok', primary: true }]); } catch { /* egal */ }
  }
}

async function remove(song) {
  if (S.songs.size <= 1) {
    await modal('Löschen', 'Der letzte Song lässt sich nicht löschen. Importiere erst einen anderen.', [{ label: 'OK', value: 'ok', primary: true }]);
    return;
  }
  const a = await modal(`„${song.title}“ löschen?`, 'Wechsel, Griffe, Abschnitte und der Übe-Fortschritt dieses Songs gehen verloren. Vorher exportieren?',
    [{ label: 'Abbrechen', value: 'no' }, { label: 'Löschen', value: 'yes', primary: true }]);
  if (a !== 'yes') return;
  await deleteSong(song.id);
  showSongs();
}

/* ---------- Import ----------------------------------------------------- */

function openImport() {
  $('#imp-text').value = '';
  check();
  showScreen('import');
}

function check() {
  const text = $('#imp-text').value;
  const errs = $('#imp-errors'), prev = $('#imp-preview'), ok = $('#imp-ok');
  pending = null;
  if (!text.trim()) {
    errs.replaceChildren();
    prev.hidden = true;
    ok.disabled = true;
    return;
  }
  const r = parseSongText(text);
  errs.replaceChildren(...r.errors.slice(0, 12).map((m) => { const li = document.createElement('li'); li.textContent = m; return li; }));
  if (r.errors.length > 12) { const li = document.createElement('li'); li.textContent = `… und ${r.errors.length - 12} weitere.`; errs.append(li); }
  ok.disabled = !r.ok;
  prev.hidden = !r.ok;
  if (!r.ok) return;
  pending = r.song;
  const s = songSummary(r.song);
  $('#imp-title').textContent = s.title + (s.artist ? ` – ${s.artist}` : '');
  $('#imp-chords').textContent = s.chords.map(prettyChord).join('  ');
  $('#imp-facts').textContent = `${s.events} Wechsel · ${s.sections} Abschnitte${r.song.lyrics?.length ? ' · mit Text' : ''}${S.songs.has(r.song.id) ? ' · gibt es schon' : ''}`;
}

async function take() {
  if (!pending) return;
  let song = pending;
  if (S.songs.has(song.id)) {
    const a = await modal(`„${S.songs.get(song.id).title}“ gibt es schon`, 'Ersetzen überschreibt Wechsel, Griffe und Abschnitte. Als Kopie bleibt der alte Song, wie er ist.',
      [{ label: 'Abbrechen', value: 'no' }, { label: 'Als Kopie', value: 'copy' }, { label: 'Ersetzen', value: 'replace', primary: true }]);
    if (a === 'no') return;
    if (a === 'copy') song = { ...song, id: copyId(song.id, [...S.songs.keys()]), title: `${song.title} (Kopie)` };
  }
  await putSong(song);
  if (!S.settings.currentSong || !S.songs.has(S.settings.currentSong)) await setCurrentSong(song.id);
  pending = null;
  showSongs();
}
