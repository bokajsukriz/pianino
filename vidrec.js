/* vidrec.js — Videorekorder auf der Liedseite: direkt in der App aufnehmen,
   gleich klein (720p, 15 Bilder/s, 0,8 Mbit/s, Ton 128 kbit/s ohne
   Echo-/Rauschfilter — es geht um Musik). Nichts muss danach umgewandelt
   werden. Kamera und Vorschau laufen in host (unter der Videoliste, nie über
   dem Player). Firefox nimmt WebM auf, Chrome und Safari MP4. WebM aus
   MediaRecorder hat keine Länge und lässt sich schlecht spulen: einmal mit
   Mediabunny umpacken (ohne neu zu kodieren). */

import { fmtClock } from './marks.js';
import { logError } from './log.js';

// ANNAHME: 15 Bilder/s und 0,8 Mbit/s reichen für Hände und Griffe; ca. 7 MB je Minute.
export const REC = { width: 1280, height: 720, fps: 15, videoBps: 800_000, audioBps: 128_000 };
const TYPES = ['video/mp4;codecs=avc1,mp4a.40.2', 'video/webm;codecs=vp8,opus', 'video/webm;codecs=vp9,opus', 'video/webm', 'video/mp4'];

export const canRecord = () => !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder === 'function';

function el(tag, cls = '', text = null) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

function button(cls, text, onClick) {
  const b = el('button', cls, text);
  b.type = 'button';
  b.addEventListener('click', onClick);
  return b;
}

const sizeText = (n) => (n < 1e6 ? '< 1 MB' : `${Math.round(n / 1e6)} MB`);

/** Rekorder in host öffnen. onStart() beim Start der Aufnahme (YouTube
 *  anhalten). → { done, close }: done ist ein Promise auf den Blob der
 *  Aufnahme oder null (abgebrochen); close() bricht ab (Liedseite zu). */
export function openRecorder(host, { onStart = () => {} } = {}) {
  let stream = null, rec = null, chunks = [], size = 0, t0 = 0, timer = 0, lock = null;
  let facing = 'environment', finish = () => {};
  const done = new Promise((resolve) => { finish = resolve; });

  const preview = document.createElement('video');
  preview.muted = true;
  preview.playsInline = true;
  preview.setAttribute('playsinline', '');
  preview.autoplay = true;
  const status = el('span', 'small muted', 'Kamera wird geöffnet …');
  const start = button('btn btn-primary btn-sm', '● Aufnahme starten', () => begin());
  const stop = button('btn btn-primary btn-sm', '■ Stopp', () => end());
  const flip = button('btn btn-secondary btn-sm', '⟲ Kamera', () => { facing = facing === 'environment' ? 'user' : 'environment'; openCam(); });
  const cancel = button('btn btn-ghost btn-sm', 'Abbrechen', () => quit(null));
  stop.hidden = true;
  start.disabled = true;
  const row = el('div', 'sp-set-actions');
  row.append(start, stop, flip, cancel, status);
  const box = el('div', 'vid-rec');
  box.append(preview, row);
  host.replaceChildren(box);
  host.hidden = false;

  function release() {
    for (const t of stream?.getTracks() || []) t.stop();
    stream = null;
    preview.srcObject = null;
  }

  async function openCam() {
    release();
    start.disabled = true;
    status.textContent = 'Kamera wird geöffnet …';
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: facing }, width: { ideal: REC.width }, height: { ideal: REC.height }, frameRate: { ideal: REC.fps, max: 30 } },
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
    } catch (e) {
      logError('vidrec:cam', e);
      status.textContent = e?.name === 'NotAllowedError'
        ? 'Kamera bzw. Mikrofon nicht erlaubt – in den Browser-Einstellungen für diese Seite freigeben.'
        : `Kamera geht nicht: ${e?.message || e}`;
      return;
    }
    if (!host.contains(box)) { release(); return; } // inzwischen geschlossen
    preview.srcObject = stream;
    preview.play().catch(() => {});
    start.disabled = false;
    status.textContent = 'Bereit';
  }

  async function begin() {
    if (!stream || rec) return;
    const type = TYPES.find((m) => MediaRecorder.isTypeSupported(m)) || '';
    try {
      rec = new MediaRecorder(stream, { ...(type ? { mimeType: type } : {}), videoBitsPerSecond: REC.videoBps, audioBitsPerSecond: REC.audioBps });
    } catch (e) {
      logError('vidrec:start', e);
      status.textContent = `Aufnahme geht nicht: ${e?.message || e}`;
      return;
    }
    chunks = [];
    size = 0;
    rec.ondataavailable = (e) => { if (e.data?.size) { chunks.push(e.data); size += e.data.size; } };
    rec.start(1000);
    onStart();
    try { lock = await navigator.wakeLock?.request('screen'); } catch { /* geht auch ohne */ }
    t0 = performance.now();
    start.hidden = true;
    flip.hidden = true;
    cancel.hidden = true;
    stop.hidden = false;
    const tick = () => { status.textContent = `● ${fmtClock((performance.now() - t0) / 1000)} · ${sizeText(size)}`; };
    tick();
    timer = setInterval(tick, 500); // nur Anzeige, kein Audio-Timing
  }

  async function end() {
    if (!rec) return;
    const r = rec;
    const stopped = new Promise((resolve) => { r.onstop = resolve; });
    if (r.state !== 'inactive') r.stop();
    await stopped;
    const type = (r.mimeType || chunks[0]?.type || 'video/webm').split(';')[0];
    const blob = new Blob(chunks, { type });
    status.textContent = 'Fertig …';
    quit(await fixWebm(blob));
  }

  function quit(result) {
    clearInterval(timer);
    lock?.release().catch(() => {});
    lock = null;
    if (rec && rec.state !== 'inactive') { rec.onstop = null; rec.stop(); }
    rec = null;
    release();
    box.remove();
    host.hidden = true;
    finish(result);
  }

  openCam();
  return { done, close: () => quit(null) };
}

/** WebM aus MediaRecorder ohne Länge und Sprungmarken: mit Mediabunny
 *  umpacken (Pakete kopieren, nichts neu kodieren). Geht das nicht, bleibt
 *  die Aufnahme, wie sie ist. → Blob */
export async function fixWebm(blob) {
  if (!blob.type.includes('webm')) return blob;
  try {
    const mb = await import('./vendor/mediabunny/mediabunny.min.mjs');
    const input = new mb.Input({ source: new mb.BlobSource(blob), formats: mb.ALL_FORMATS });
    const target = new mb.BufferTarget();
    const output = new mb.Output({ format: new mb.WebMOutputFormat(), target });
    const conv = await mb.Conversion.init({ input, output, showWarnings: false });
    if (!conv.isValid || conv.discardedTracks.length) return blob;
    await conv.execute();
    return target.buffer ? new Blob([target.buffer], { type: 'video/webm' }) : blob;
  } catch (e) {
    logError('vidrec:webm', e);
    return blob;
  }
}
