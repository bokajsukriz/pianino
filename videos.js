/* videos.js — Videos aus dem Unterricht auf der Liedseite. Oben neben dem
   Zahnrad ein Video-Knopf; er klappt eine Liste auf (wie die Einstellungen,
   über dem Leadsheet, überdeckt den Player nicht): je Video ein kurzer Text
   („Strophe“, „Rhythmus“ …), antippen spielt es dort ab, mit Tempo
   0,5 / 0,75 / 1 und Wiederholen. „+ Video“ nimmt eine Datei vom Gerät (auf
   dem Handy auch direkt aufnehmen). Gespeichert als eigener Datensatz je
   Video in IndexedDB (store.js listVideos), nur auf diesem Gerät, nicht im
   Export. Spielt ein Unterrichtsvideo, pausiert YouTube und umgekehrt. */

import { listVideos, putVideo, deleteVideo } from './store.js';
import { fmtClock } from './marks.js';
import { $, modal, ask } from './ui.js';

const RATES = [0.5, 0.75, 1];

let vs = null; // { songId, list, open, current, url, rate, loop, busy }
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
  $('#sp-videos video')?.pause();
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
  const loop = button('btn btn-secondary btn-sm', '↻ Wiederholen', () => {
    vs.loop = !vs.loop;
    v.loop = vs.loop;
    loop.setAttribute('aria-pressed', vs.loop ? 'true' : 'false');
  });
  loop.setAttribute('aria-pressed', vs.loop ? 'true' : 'false');
  const row = el('div', 'sp-set-row');
  row.append(el('b', 'sp-vid-now', rec.label), rates, loop);
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
    const info = [fmtDate(rec.added), rec.durationSec ? fmtClock(rec.durationSec) : ''].filter(Boolean).join(' · ');
    pick.append(el('span', 'sp-vid-label', rec.label), el('span', 'small muted', info));
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
  add.disabled = !!vs.busy;
  const foot = el('div', 'sp-set-actions');
  foot.append(add, ...(vs.busy ? [el('span', 'small muted', vs.busy)] : []));
  parts.push(foot);
  host.replaceChildren(...parts);
  paintList();
}

/** Länge aus den Metadaten (nur zur Anzeige). → Sekunden oder 0 */
function probeDuration(blob) {
  return new Promise((resolve) => {
    const v = document.createElement('video');
    const url = URL.createObjectURL(blob);
    const done = (d) => { clearTimeout(t); URL.revokeObjectURL(url); v.removeAttribute('src'); resolve(d); };
    const t = setTimeout(() => done(0), 4000);
    v.preload = 'metadata';
    v.onloadedmetadata = () => done(Number.isFinite(v.duration) ? Math.round(v.duration * 10) / 10 : 0);
    v.onerror = () => done(0);
    v.src = url;
  });
}

async function addVideo(file) {
  if (!vs) return;
  const mine = vs;
  if (file.type && !file.type.startsWith('video/')) {
    await modal('Kein Video', 'Diese Datei ist kein Video.', [{ label: 'OK', value: '', primary: true }]);
    return;
  }
  const label = await ask('Video hinzufügen', 'Kurz, worum es geht:', { placeholder: 'z. B. Strophe, Rhythmus, Refrain, besondere Stelle', ok: 'Speichern' });
  if (label == null || vs !== mine) return;
  vs.busy = 'Speichert …';
  paint();
  try { await navigator.storage?.persist?.(); } catch { /* nur eine Bitte */ }
  const id = `video:${mine.songId}:${Date.now().toString(36)}${Math.floor(performance.now() % 1e4).toString(36)}`;
  const rec = {
    id, songId: mine.songId, label: label || file.name.replace(/\.[^.]+$/, '') || 'Video',
    name: file.name, type: file.type, size: file.size,
    durationSec: await probeDuration(file), added: new Date().toISOString(), blob: file,
  };
  await putVideo(rec);
  // DB.put schluckt Fehler (z. B. Speicher voll): nachsehen, ob es da ist.
  const ok = (await listVideos(mine.songId)).some((r) => r.id === id);
  if (vs !== mine) return;
  vs.busy = '';
  if (!ok) {
    paint();
    await modal('Nicht gespeichert', 'Das Video ließ sich nicht speichern – vielleicht ist der Speicher voll. Ein kürzeres Video versuchen oder alte löschen.', [{ label: 'OK', value: '', primary: true }]);
    return;
  }
  vs.list.push(rec);
  paintButton();
  paint();
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
