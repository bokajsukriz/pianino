/* videos.js — Videos aus dem Unterricht auf der Liedseite. Oben neben dem
   Zahnrad ein Video-Knopf; er klappt eine Liste auf (wie die Einstellungen,
   über dem Leadsheet, überdeckt den Player nicht): je Video ein kurzer Text
   („Strophe“, „Rhythmus“ …), antippen spielt es dort ab, mit Tempo
   0,5 / 0,75 / 1 und in Schleife (am Ende wieder von vorn). „+ Video“ nimmt eine Datei vom Gerät (auf
   dem Handy auch direkt aufnehmen). Gespeichert als eigener Datensatz je
   Video in IndexedDB (store.js listVideos), nur auf diesem Gerät, nicht im
   Export. Beim Hinzufügen wird es verkleinert (vidshrink.js, 720p); ältere
   Videos lassen sich nachträglich verkleinern („Verkleinern“ am Video).
   „● Aufnehmen“ nimmt direkt in der App auf (vidrec.js), gleich klein.
   „⤓ Aufs Handy“ lädt ein Video herunter (Ordner Download, den die
   Galerie zeigt); auf Wunsch geschieht das nach jeder Aufnahme von selbst
   (settings.videoToDevice).
   Spielt ein Unterrichtsvideo, pausiert YouTube und umgekehrt. */

import { S, saveSettings, listVideos, putVideo, deleteVideo } from './store.js';
import { openRecorder, canRecord } from './vidrec.js';
import { fmtClock } from './marks.js';
import { shrinkVideo, canShrink, SHRINK_V } from './vidshrink.js';
import { $, modal, ask } from './ui.js';
import * as audio from './audio.js';

const RATES = [0.5, 0.75, 1];

let vs = null; // { songId, list, open, current, url, rate, loop, busy, cancel, recorder }
let hooks = { onOpen: () => {}, onPlay: () => {} };
let wired = false;

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

const fmtSize = (b) => (b >= 1e9 ? `${(b / 1e9).toFixed(1).replace('.', ',')} GB` : `${Math.max(1, Math.round(b / 1e6))} MB`);

const fmtDate = (iso) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('de-DE', { day: 'numeric', month: 'short', year: 'numeric' });
};

/** hooks: onOpen() — Liste geht auf (Einstellungen schließen),
 *  onPlay() — Unterrichtsvideo startet (YouTube anhalten). */
export function initVideos(h) {
  hooks = { ...hooks, ...h };
  if (wired) return;
  wired = true;
  $('#sp-vids').addEventListener('click', () => toggleVideos());
  $('#sp-vid-file').addEventListener('change', (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (f) addVideo(f);
  });
}

/** Liedseite öffnet: Videos dieses Songs laden. */
export async function openVideos(songId) {
  closeVideos();
  const mine = { songId, list: [], open: false, current: null, url: null, rate: 1, loop: false, busy: '' };
  vs = mine;
  paintButton();
  const list = await listVideos(songId);
  if (vs !== mine) return;
  vs.list = list;
  paintButton();
}

/** Liedseite schließt. */
export function closeVideos() {
  if (!vs) return;
  vs.cancel?.();
  vs.recorder?.close();
  if (vs.open) toggleVideos(false);
  vs = null;
}

export const videosOpen = () => !!vs?.open;

/** Unterrichtsvideo anhalten (YouTube startet). */
export function pauseLesson() {
  const v = $('#sp-videos video');
  if (v && !v.paused) v.pause();
}

/** Video-Knopf ↔ Liste. */
export function toggleVideos(open = !vs?.open) {
  if (!vs || !!open === vs.open) return;
  vs.open = !!open;
  if (open) hooks.onOpen();
  else stopCurrent();
  $('#sp-videos').hidden = !open;
  paintButton();
  if (open) paint();
}

function stopCurrent() {
  if (!vs) return;
  const v = $('#sp-videos video');
  if (v) { v.pause(); v.removeAttribute('src'); v.load(); }
  if (vs.url) URL.revokeObjectURL(vs.url);
  vs.url = null;
  vs.current = null;
}

function paintButton() {
  const b = $('#sp-vids');
  const n = vs?.list.length || 0;
  b.setAttribute('aria-expanded', vs?.open ? 'true' : 'false');
  b.setAttribute('aria-label', vs?.open ? 'Videos schließen' : `Videos aus dem Unterricht${n ? ` (${n})` : ''}`);
  const badge = $('#sp-vids-n');
  badge.textContent = n ? String(n) : '';
  badge.hidden = !n || !!vs?.open;
}

function select(rec) {
  if (vs.current === rec.id) return;
  stopCurrent();
  vs.current = rec.id;
  vs.url = URL.createObjectURL(rec.blob);
  paint();
  const v = $('#sp-videos video');
  v?.play().catch(() => {}); // ohne Geste blockiert der Browser: dann ▶ am Video
}

function paintPlayer(rec) {
  const box = el('div', 'sp-vid-player');
  const v = document.createElement('video');
  v.src = vs.url;
  v.controls = true;
  v.playsInline = true;
  v.setAttribute('playsinline', '');
  v.preload = 'metadata';
  v.loop = vs.loop;
  v.playbackRate = vs.rate;
  v.addEventListener('play', () => hooks.onPlay());
  // Manche Browser setzen das Tempo beim Laden zurück.
  v.addEventListener('loadedmetadata', () => {
    v.playbackRate = vs?.rate ?? 1;
    if (vs && !rec.durationSec && Number.isFinite(v.duration) && v.duration > 0) {
      rec.durationSec = Math.round(v.duration * 10) / 10;
      putVideo(rec);
      paintList();
    }
  });
  const rates = el('div', 'seg');
  rates.setAttribute('role', 'group');
  rates.setAttribute('aria-label', 'Geschwindigkeit');
  for (const r of RATES) {
    const b = button('seg-btn', String(r).replace('.', ','), () => {
      vs.rate = r;
      v.playbackRate = r;
      for (const x of rates.children) x.setAttribute('aria-pressed', x === b ? 'true' : 'false');
    });
    b.setAttribute('aria-pressed', r === vs.rate ? 'true' : 'false');
    rates.append(b);
  }
  const loop = button('btn btn-secondary btn-sm', '↻ Schleife', () => {
    vs.loop = !vs.loop;
    v.loop = vs.loop;
    loop.setAttribute('aria-pressed', vs.loop ? 'true' : 'false');
  });
  loop.setAttribute('aria-pressed', vs.loop ? 'true' : 'false');
  loop.title = 'An: am Ende fängt das Video wieder von vorn an';
  const row = el('div', 'sp-set-row');
  row.append(el('b', 'sp-vid-now', rec.label), rates, loop,
    button('btn btn-secondary btn-sm', '⤓ Aufs Handy', () => toDevice(rec), `„${rec.label}“ aufs Handy herunterladen`));
  if (Number(rec.shrunk || 0) < SHRINK_V && !rec.noShrink && canShrink() && rec.size > 4e6) {
    const sh = button('btn btn-secondary btn-sm', 'Verkleinern', () => shrinkSaved(rec), `„${rec.label}“ verkleinern (${fmtSize(rec.size)})`);
    sh.disabled = !!vs.busy;
    row.append(sh);
  }
  box.append(v, row);
  return box;
}

function paintList() {
  const ul = $('#sp-videos .sp-vid-list');
  if (!ul || !vs) return;
  ul.replaceChildren(...vs.list.map((rec) => {
    const li = el('li', 'sp-vid-item');
    const pick = button('sp-vid-pick', '', () => select(rec));
    pick.setAttribute('aria-current', vs.current === rec.id ? 'true' : 'false');
    const info = [fmtDate(rec.added), rec.durationSec ? fmtClock(rec.durationSec) : '', rec.size ? fmtSize(rec.size) : ''].filter(Boolean).join(' · ');
    pick.append(el('span', 'sp-vid-label', rec.label), el('span', 'small muted', info));
    if (!rec.shrunk && rec.shrinkNote) pick.append(el('span', 'small muted', `Nicht verkleinert: ${rec.shrinkNote}`));
    li.append(
      pick,
      button('btn btn-ghost btn-sm', '✎', () => rename(rec), `„${rec.label}“ umbenennen`),
      button('btn btn-ghost btn-sm sp-danger-text', '×', () => remove(rec), `„${rec.label}“ löschen`),
    );
    return li;
  }));
}

function paint() {
  if (!vs?.open) return;
  const host = $('#sp-videos');
  const parts = [];
  const rec = vs.list.find((r) => r.id === vs.current);
  if (rec) parts.push(paintPlayer(rec));
  if (vs.list.length) {
    parts.push(el('ul', 'sp-vid-list'));
  } else {
    parts.push(el('p', 'small muted', 'Noch keine Videos. Nimm im Unterricht eine Stelle auf und füge sie hier mit einem kurzen Text hinzu – z. B. „Strophe“, „Rhythmus“ oder „Refrain“.'));
  }
  const add = button('btn btn-secondary btn-sm', '+ Video', () => $('#sp-vid-file').click());
  add.disabled = !!vs.busy || !!vs.recorder;
  const foot = el('div', 'sp-set-actions');
  if (canRecord()) {
    const recBtn = button('btn btn-primary btn-sm', '● Aufnehmen', () => record());
    recBtn.disabled = !!vs.busy || !!vs.recorder;
    const keep = el('label', 'small sp-vid-keep');
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = !!S.settings.videoToDevice;
    cb.addEventListener('change', () => { S.settings.videoToDevice = cb.checked; saveSettings(); });
    keep.append(cb, ' Aufnahmen auch aufs Handy');
    foot.append(recBtn, add, keep);
  } else foot.append(add);
  if (vs.busy) {
    const note = el('span', 'small muted', vs.busy);
    note.id = 'sp-vid-busy';
    foot.append(note);
    if (vs.cancel) foot.append(button('btn btn-ghost btn-sm', 'Original nehmen', () => vs.cancel()));
  }
  parts.push(foot);
  host.replaceChildren(...parts);
  paintList();
}

/** Direkt in der App aufnehmen (vidrec.js), danach benennen wie beim
 *  Hinzufügen; ist schon klein, wird nicht verkleinert. */
async function record() {
  if (!vs || vs.busy || vs.recorder) return;
  const mine = vs;
  stopCurrent();
  mine.recorder = openRecorder($('#sp-vid-rec'), { onStart: () => hooks.onPlay() });
  paint();
  const blob = await mine.recorder.done;
  mine.recorder = null;
  if (vs !== mine) return;
  paint();
  if (!blob?.size) return;
  const day = new Date().toISOString().slice(0, 10);
  const ext = blob.type.includes('mp4') ? 'mp4' : 'webm';
  const file = new File([blob], `Aufnahme ${day}.${ext}`, { type: blob.type });
  let label = await askWithPreview(file);
  if (vs !== mine) return;
  if (label == null) {
    const a = await modal('Aufnahme verwerfen?', 'Ohne Namen wird sie als „Aufnahme“ gespeichert.', [
      { label: 'Verwerfen', value: 'drop' }, { label: 'Behalten', value: 'keep', primary: true },
    ]);
    if (a === 'drop' || vs !== mine) return;
    label = '';
  }
  vs.busy = 'Speichert …';
  paint();
  const rec = {
    id: newId(mine.songId), songId: mine.songId, label: label || 'Aufnahme',
    name: file.name, type: file.type, size: file.size, origSize: file.size, shrunk: SHRINK_V, recorded: true,
    durationSec: await probeDuration(file), added: new Date().toISOString(), blob: file,
  };
  const ok = await saveChecked(rec, mine);
  if (vs !== mine) return;
  vs.busy = '';
  if (ok) { vs.list.push(rec); paintButton(); }
  paint();
  if (!ok) return;
  flash(`Gespeichert (${fmtSize(file.size)})`);
  if (S.settings.videoToDevice) toDevice(rec);
}

const newId = (songId) => `video:${songId}:${Date.now().toString(36)}${Math.floor(performance.now() % 1e4).toString(36)}`;

/** Video aufs Handy laden: als Download (landet im Ordner Download, den die
 *  Galerie-Apps auf Android anzeigen). */
function toDevice(rec) {
  const ext = (rec.type || '').includes('webm') ? 'webm' : (rec.type || '').includes('quicktime') ? 'mov' : 'mp4';
  const day = String(rec.added || '').slice(0, 10);
  const safe = `${rec.label || 'Video'}`.replace(/[\\/:*?"<>|]+/g, ' ').trim().slice(0, 60);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(rec.blob);
  a.download = `Pianino ${safe} ${day}.${ext}`;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 60000);
  flash('Aufs Handy geladen (Ordner „Download“)');
}

/** Länge aus den Metadaten (nur zur Anzeige). → Sekunden oder 0 */
function probeDuration(blob) {
  return new Promise((resolve) => {
    const v = document.createElement('video');
    const url = URL.createObjectURL(blob);
    const done = (d) => { clearTimeout(t); v.onerror = null; v.removeAttribute('src'); v.load(); setTimeout(() => URL.revokeObjectURL(url), 2000); resolve(d); };
    const t = setTimeout(() => done(0), 4000);
    v.preload = 'metadata';
    v.onloadedmetadata = () => done(Number.isFinite(v.duration) ? Math.round(v.duration * 10) / 10 : 0);
    v.onerror = () => done(0);
    v.src = url;
  });
}

/** Verkleinern mit Fortschritt im Fuß der Liste. → { blob, reason } */
async function shrinkWithProgress(file, mine) {
  if (!canShrink()) return { blob: null, reason: 'Browser kann nicht umwandeln' };
  let lock = null;
  try { lock = await navigator.wakeLock?.request('screen'); } catch { /* geht auch ohne */ }
  const job = shrinkVideo(file, (p, how) => {
    if (vs !== mine) return;
    const pct = Math.round(p * 100);
    vs.busy = how === 'ffmpeg' && !pct
      ? 'Lädt den Umwandler (beim ersten Mal 31 MB) … – App bitte offen lassen'
      : `Verkleinert${how === 'echtzeit' ? ' (so lang wie das Video)' : how === 'ffmpeg' ? ' (ohne Hardware, dauert)' : ''} … ${pct} % – App bitte offen lassen`;
    const n = $('#sp-vid-busy');
    if (n) n.textContent = vs.busy;
  }, { ctx: audio.isRunning() ? audio.getCtx() : null, host: $('#sp-vid-work') });
  mine.cancel = job.cancel;
  mine.busy = 'Verkleinert …';
  paint();
  const out = await job.result;
  mine.cancel = null;
  lock?.release().catch(() => {});
  return out;
}

/** Speichern und nachsehen, ob es da ist (DB.put schluckt Fehler, z. B.
 *  Speicher voll). */
async function saveChecked(rec, mine) {
  await putVideo(rec);
  const ok = (await listVideos(mine.songId)).some((r) => r.id === rec.id && r.size === rec.size);
  if (!ok) await modal('Nicht gespeichert', 'Das Video ließ sich nicht speichern – vielleicht ist der Speicher voll. Ein kürzeres Video versuchen oder alte löschen.', [{ label: 'OK', value: '', primary: true }]);
  return ok;
}

/** Name erfragen, darüber das Video zum Anschauen (erst sehen, worum es
 *  geht). Die Tastatur geht erst auf, wenn man ins Feld tippt. */
async function askWithPreview(file) {
  const v = $('#modal-video');
  const url = URL.createObjectURL(file);
  v.onerror = () => { v.hidden = true; }; // Format kann der Browser nicht zeigen: nur fragen
  v.src = url;
  v.hidden = false;
  const p = ask('Video hinzufügen', 'Erst anschauen, dann kurz, worum es geht:', { placeholder: 'z. B. Strophe, Rhythmus, Refrain, besondere Stelle', ok: 'Speichern' });
  $('#modal-input').blur();
  v.play().catch(() => {}); // ohne Erlaubnis: ▶ am Video
  const label = await p;
  v.onerror = null;
  v.pause();
  v.removeAttribute('src');
  v.load();
  v.hidden = true;
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return label;
}

async function addVideo(file) {
  if (!vs || vs.busy) return;
  const mine = vs;
  if (file.type && !file.type.startsWith('video/')) {
    await modal('Kein Video', 'Diese Datei ist kein Video.', [{ label: 'OK', value: '', primary: true }]);
    return;
  }
  const label = await askWithPreview(file);
  if (label == null || vs !== mine) return;
  // Noch im Tippen auf „Speichern“: Ton freigeben (für die Neuaufnahme).
  await audio.unlock();
  try { await navigator.storage?.persist?.(); } catch { /* nur eine Bitte */ }
  const { blob: small, reason } = await shrinkWithProgress(file, mine);
  if (vs !== mine) return;
  const blob = small || file;
  vs.busy = 'Speichert …';
  paint();
  const id = newId(mine.songId);
  const rec = {
    id, songId: mine.songId, label: label || file.name.replace(/\.[^.]+$/, '') || 'Video',
    name: file.name, type: blob.type || file.type, size: blob.size, origSize: file.size, shrunk: small ? SHRINK_V : 0, shrinkNote: small ? '' : (reason === 'abgebrochen' ? 'Original behalten' : reason),
    durationSec: await probeDuration(blob), added: new Date().toISOString(), blob,
  };
  const ok = await saveChecked(rec, mine);
  if (vs !== mine) return;
  vs.busy = '';
  if (ok) {
    vs.list.push(rec);
    paintButton();
  }
  paint();
  if (ok) flash(small ? `Verkleinert: ${fmtSize(file.size)} → ${fmtSize(small.size)}` : `Gespeichert (${fmtSize(file.size)}), nicht verkleinert: ${reason}`);
}

/** Schon gespeichertes Video nachträglich verkleinern. */
async function shrinkSaved(rec) {
  if (!vs || vs.busy) return;
  const mine = vs;
  const unlocked = audio.unlock(); // im Tippen: Ton freigeben (für die Neuaufnahme)
  if (vs.current === rec.id) { stopCurrent(); }
  await unlocked;
  const { blob: small, reason } = await shrinkWithProgress(rec.blob, mine);
  if (vs !== mine) return;
  vs.busy = '';
  if (!small) {
    rec.noShrink = true; // nur für diese Sitzung, der Knopf verschwindet
    if (reason !== 'abgebrochen') { rec.shrinkNote = reason; await putVideo(rec); }
    paint();
    flash(`Nicht verkleinert: ${reason}`);
    return;
  }
  const before = rec.size;
  const next = { ...rec, blob: small, type: small.type, size: small.size, origSize: rec.origSize || before, shrunk: SHRINK_V, shrinkNote: '' };
  const ok = await saveChecked(next, mine);
  if (vs !== mine) return;
  if (ok) Object.assign(rec, next);
  paint();
  if (ok) flash(`Verkleinert: ${fmtSize(before)} → ${fmtSize(small.size)}`);
}

/** Kurze Meldung im Fuß der Liste. */
function flash(text) {
  if (!vs?.open) return;
  const n = el('span', 'small muted', text);
  $('#sp-videos .sp-set-actions')?.append(n);
  setTimeout(() => n.remove(), 12000);
}

async function rename(rec) {
  const label = await ask('Umbenennen', '', { value: rec.label, ok: 'Speichern' });
  if (!label || !vs) return;
  rec.label = label;
  await putVideo(rec);
  paint();
}

async function remove(rec) {
  const a = await modal(`„${rec.label}“ löschen?`, 'Das Video ist dann von diesem Gerät weg.', [
    { label: 'Abbrechen', value: '' }, { label: 'Löschen', value: 'yes', primary: true },
  ]);
  if (a !== 'yes' || !vs) return;
  if (vs.current === rec.id) stopCurrent();
  await deleteVideo(rec.id);
  vs.list = vs.list.filter((r) => r.id !== rec.id);
  paintButton();
  paint();
}
