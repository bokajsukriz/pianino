/* songs.js — Startpunkt „Songs“ und „Import“: Liste der Songs (Antippen
   öffnet die Liedseite), neuer Song, Importieren (Datei oder eingefügt),
   Exportieren (ohne Text voreingestellt), Löschen mit Rückfrage. Prüfen und
   Normalisieren rein in songdata.js. */

import { S, songList, currentSong, setCurrentSong, putSong, deleteSong } from './store.js';
import { parseSongText, exportSong, songSummary, copyId, newSong } from './songdata.js';
import { prettyChord } from './chordsym.js';
import { $, showScreen, modal, ask } from './ui.js';
import { logError } from './log.js';

let hooks = { open: () => {}, practice: () => {} };
let pending = null; // geprüfter Song im Import

/** Verdrahten. h: { open(id) Liedseite, practice() Übungen } */
export function initSongs(h) {
  hooks = { ...hooks, ...h };
  $('#songs-import').addEventListener('click', openImport);
  $('#songs-new').addEventListener('click', createSong);
  $('#songs-practice').addEventListener('click', () => hooks.practice());
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

/** Zeile „12 Wechsel · 3 Abschnitte · Video“ zu einem Song (Übungen). */
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
    const li = mk('li');
    const b = mk('button', `card song-item${song.id === cur?.id ? ' current' : ''}`);
    b.type = 'button';
    b.append(mk('span', 'song-item-title', song.title));
    const by = [song.artist, song.tabText ? 'Tabs' : '', song.sources.some((x) => x.type === 'youtube' && x.videoId) ? 'Video' : '',
      song.marks?.length ? `${song.marks.length} ${song.marks.length === 1 ? 'Abschnitt' : 'Abschnitte'}` : ''].filter(Boolean).join(' · ');
    if (by) b.append(mk('span', 'small muted', by));
    b.addEventListener('click', async () => { await setCurrentSong(song.id); hooks.open(song.id); });
    li.append(b);
    return li;
  }));
  showScreen('songs');
}

/** Neuer Song: Titel und Interpret, dann die Liedseite mit dem Assistenten
 *  (Video → Teile → Akkordwechsel → Griffe). */
async function createSong() {
  const title = await ask('Neuer Song', 'Titel', { placeholder: 'z. B. Perfect Ruin', ok: 'Weiter' });
  if (!title) return;
  const artist = await ask('Interpret', 'Darf leer bleiben.', { ok: 'Anlegen' });
  const song = { ...newSong(title, [...S.songs.keys()]), artist: (artist || '').trim() };
  await putSong(song);
  await setCurrentSong(song.id);
  hooks.open(song.id, { wizard: 'video' });
}

/** Datei anbieten; Text und Tabs nur auf Wunsch. */
export async function exportOne(song) {
  let lyrics = false;
  if (song.lyrics?.some((l) => l.line) || song.tabText) {
    const a = await modal('Exportieren', 'Text und Tabs bleiben sonst nur auf diesem Gerät. Ein PDF wird nie exportiert.',
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

/** → true, wenn gelöscht. */
export async function removeSong(song) {
  if (S.songs.size <= 1) {
    await modal('Löschen', 'Der letzte Song lässt sich nicht löschen. Leg erst einen anderen an.', [{ label: 'OK', value: 'ok', primary: true }]);
    return false;
  }
  const a = await modal(`„${song.title}“ löschen?`, 'Tabs, PDF, Abschnitte, Griffe, Wechsel und der Übe-Fortschritt dieses Songs gehen verloren. Vorher exportieren?',
    [{ label: 'Abbrechen', value: 'no' }, { label: 'Löschen', value: 'yes', primary: true }]);
  if (a !== 'yes') return false;
  await deleteSong(song.id);
  return true;
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
