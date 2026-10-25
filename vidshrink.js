/* vidshrink.js — Videos aus dem Unterricht beim Speichern verkleinern:
   kürzere Seite höchstens 720 px, höchstens 10 Bilder/s, H.264 mit einer
   Datenrate nach Bildgröße; der Ton wird übernommen, wie er ist (iPhone und
   Android nehmen AAC auf). Umgewandelt wird mit Mediabunny (vendor/mediabunny/,
   MPL-2.0) über WebCodecs, also mit dem Hardware-Encoder des Geräts —
   meist schneller als Echtzeit. Die Bibliothek wird erst beim ersten Video geladen.
   Ohne WebCodecs oder wenn es das Video nicht lesen kann (z. B. HDR,
   Firefox auf Android) rechnet ffmpeg.wasm (vendor/ffmpeg/, eigener Cache im
   Service Worker, erst bei Bedarf geladen); als Letztes wird es stumm
   abgespielt und mit MediaRecorder neu aufgenommen (Echtzeit).
   Klappt beides nicht, bleibt das Original, mit Grund.
   shrinkPlan ist rein (Tests in Node). */

import { logError } from './log.js';

const SHORT = 720;          // kürzere Seite höchstens
// ANNAHME: Es geht vor allem ums Hören und ein bisschen Sehen — 10 Bilder/s
// reichen, um Hände und Griffe zu erkennen (5 ruckelt bei schnellen Wechseln).
const MAX_FPS = 10;
const RATE_720P = 600_000;   // bit/s bei 1280 × 720 und 10 Bildern/s
const MIN_RATE = 200_000;
/** Stand der Verkleinerung; ältere Videos (kleinere Zahl oder true) lassen
 *  sich mit „Verkleinern“ noch einmal verkleinern. */
export const SHRINK_V = 2;

const even = (n) => Math.max(2, Math.round(n / 2) * 2);

/** Zielgröße, Bildrate und Datenrate für ein Video w × h mit fps Bildern/s
 *  (fps 0 = unbekannt). → { width, height, frameRate|null, bitrate } */
export function shrinkPlan(w, h, fps = 0) {
  const k = Math.min(1, SHORT / Math.max(1, Math.min(w, h)));
  const width = even(w * k), height = even(h * k);
  const frameRate = !fps || fps > MAX_FPS + 1 ? MAX_FPS : null;
  // ANNAHME: Für Klavier-Aufnahmen (ruhige Kamera, Hände im Bild) reichen
  // 0,6 Mbit/s bei 720p und 10 Bildern/s; kleinere Bilder anteilig weniger.
  const bitrate = Math.round(Math.max(MIN_RATE, Math.min(RATE_720P, RATE_720P * (width * height) / (1280 * 720))));
  return { width, height, frameRate, bitrate };
}

const DISCARD = {
  unknown_source_codec: 'unbekanntes Format',
  undecodable_source_codec: 'Format lässt sich hier nicht lesen',
  no_encodable_target_codec: 'kein passender Encoder',
  cannot_copy: 'lässt sich nicht übernehmen',
};
const fmtMB = (n) => `${Math.round(n / 1e6)} MB`;

/** Kann dieser Browser überhaupt umwandeln (WebCodecs oder Neuaufnahme)? */
export const canShrink = () => hasCodecs() || hasWasm() || canRerecord();
const hasWasm = () => typeof WebAssembly === 'object' && typeof Worker === 'function';
const hasCodecs = () => typeof VideoEncoder === 'function' && typeof VideoDecoder === 'function';
const canRerecord = () => typeof MediaRecorder === 'function' && typeof HTMLCanvasElement !== 'undefined'
  && typeof HTMLCanvasElement.prototype.captureStream === 'function';

class Skip extends Error {} // nicht verkleinern, Grund in message

/** Video verkleinern, der Reihe nach: WebCodecs (schnell, Hardware) →
 *  ffmpeg.wasm (ohne WebCodecs, z. B. Firefox auf Android; rechnet auf dem
 *  Prozessor, dauert bei 4K länger als das Video) → Neuaufnahme übers Canvas
 *  (Echtzeit). onProgress(0…1, wie) — wie: 'schnell', 'ffmpeg' oder
 *  'echtzeit'. ctx: laufender AudioContext für den Ton der Neuaufnahme,
 *  host: Element, in dem sie sichtbar läuft. → { result, cancel }; result
 *  ist ein Promise auf { blob, reason, how }: blob der kleinere Blob oder
 *  null (dann das Original nehmen), reason warum nicht. */
export function shrinkVideo(file, onProgress = () => {}, { ctx = null, host = null } = {}) {
  const job = { canceled: false, conv: null, stop: null, ff: null };
  const steps = [
    ['schnell', hasCodecs, 'kein WebCodecs', () => viaCodecs(file, onProgress, job)],
    ['ffmpeg', hasWasm, 'kein WebAssembly', () => viaFfmpeg(file, onProgress, job)],
    ['echtzeit', canRerecord, 'keine Neuaufnahme möglich', () => viaRecorder(file, onProgress, job, ctx, host)],
  ];
  const result = (async () => {
    const why = [];
    for (const [how, can, no, run] of steps) {
      if (job.canceled) return { blob: null, reason: 'abgebrochen' };
      if (!can()) { why.push(no); continue; }
      try {
        const out = await run();
        if (out.size >= file.size * 0.9) return { blob: null, reason: 'wäre nicht kleiner', how };
        return { blob: out, reason: '', how };
      } catch (e) {
        if (job.canceled) return { blob: null, reason: 'abgebrochen' };
        const w = e instanceof Skip ? e.message : String(e?.message || e);
        logError(`vidshrink:${how}`, `${w} (${file.type || '?'}, ${fmtMB(file.size)})`);
        why.push(`${STEP_NAME[how]}: ${w}`);
      }
    }
    return { blob: null, reason: why.join('; ') || 'Browser kann nicht umwandeln' };
  })();
  const cancel = () => {
    job.canceled = true;
    job.conv?.cancel().catch(() => {});
    try { job.ff?.terminate(); } catch { /* schon aus */ }
    job.stop?.();
  };
  return { result, cancel };
}

const STEP_NAME = { schnell: 'WebCodecs', ffmpeg: 'ffmpeg', echtzeit: 'Neuaufnahme' };

/** ffmpeg.wasm (vendor/ffmpeg/, im eigenen Worker): kürzere Seite 720,
 *  10 Bilder/s, H.264, Ton AAC 96 kbit/s. Größe und Länge liest vorher
 *  Mediabunny (reines JavaScript, geht auch ohne WebCodecs). → Blob */
async function viaFfmpeg(file, onProgress, job) {
  let plan = null, dur = 0;
  try {
    const mb = await import('./vendor/mediabunny/mediabunny.min.mjs');
    const input = new mb.Input({ source: new mb.BlobSource(file), formats: mb.ALL_FORMATS });
    const v = await input.getPrimaryVideoTrack();
    if (v) plan = shrinkPlan(v.displayWidth, v.displayHeight, 0);
    dur = await input.computeDuration();
  } catch { /* dann ohne Prozent und mit Standard-Datenrate */ }
  const { FFmpeg } = await import('./vendor/ffmpeg/index.js');
  const ff = new FFmpeg();
  job.ff = ff;
  try {
    const base = new URL('./vendor/ffmpeg/core/', import.meta.url).href;
    onProgress(0, 'ffmpeg');
    await ff.load({ coreURL: `${base}ffmpeg-core.js`, wasmURL: `${base}ffmpeg-core.wasm` });
    if (job.canceled) throw new Skip('abgebrochen');
    ff.on('log', ({ message }) => {
      const m = / time=(\d+):(\d+):([\d.]+)/.exec(message);
      if (m && dur > 0) onProgress(Math.min(1, (m[1] * 3600 + m[2] * 60 + Number(m[3])) / dur), 'ffmpeg');
    });
    const ext = (/\.[a-z0-9]{2,4}$/i.exec(file.name || '') || ['.mp4'])[0];
    const input = new File([file], `in${ext}`, { type: file.type });
    await ff.createDir('/in');
    await ff.mount('WORKERFS', { files: [input] }, '/in');
    const ret = await ff.exec([
      '-i', `/in/${input.name}`, '-map', '0:v:0', '-map', '0:a:0?',
      // kürzere Seite höchstens 720 (nie hochrechnen), 10 Bilder/s
      '-vf', "fps=10,scale='if(gte(iw,ih),-2,min(720,iw))':'if(gte(iw,ih),min(720,ih),-2)'",
      '-c:v', 'libx264', '-preset', 'ultrafast', '-b:v', String(plan?.bitrate || 600000), '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-b:a', '96k', '-movflags', '+faststart', '/out.mp4',
    ]);
    if (job.canceled) throw new Skip('abgebrochen');
    if (ret !== 0) throw new Skip(`Fehler ${ret}`);
    const out = await ff.readFile('/out.mp4');
    if (!out?.length) throw new Skip('leeres Ergebnis');
    return new Blob([out], { type: 'video/mp4' });
  } finally {
    try { ff.terminate(); } catch { /* schon aus */ }
    job.ff = null;
  }
}

/** Schnell: mit Mediabunny über WebCodecs neu kodieren. → Blob (wirft Skip) */
async function viaCodecs(file, onProgress, job) {
  const mb = await import('./vendor/mediabunny/mediabunny.min.mjs');
  const input = new mb.Input({ source: new mb.BlobSource(file), formats: mb.ALL_FORMATS });
  const video = await input.getPrimaryVideoTrack();
  if (!video) throw new Skip('keine Videospur');
  if (!(await video.canDecode())) {
    let info = video.codec || '?';
    try { info = (await video.getCodecParameterString()) || info; } catch { /* nur Anzeige */ }
    let hdr = false;
    try { hdr = await video.hasHighDynamicRange(); } catch { /* nur Anzeige */ }
    throw new Skip(`Video (${info}${hdr ? ', HDR' : ''}) lässt sich hier nicht lesen`);
  }
  // iPhones legen neben dem Stereo-Ton weitere Spuren ab (3D-Ton …): die
  // erste lesbare nehmen, AAC bevorzugt; die übrigen weglassen.
  const audios = await input.getAudioTracks();
  let audio = audios.find((t) => t.codec === 'aac') || null;
  if (!audio) for (const t of audios) if (t.codec && await t.canDecode()) { audio = t; break; }
  if (audios.length && !audio) throw new Skip(`Ton (${audios.map((t) => t.codec || '?').join(', ')}) lässt sich hier nicht lesen`);
  let fps = 0;
  try { fps = (await video.computePacketStats(100)).averagePacketRate || 0; } catch { /* unbekannt */ }
  const plan = shrinkPlan(video.displayWidth, video.displayHeight, fps);
  if (!(await mb.canEncodeVideo('avc', { width: plan.width, height: plan.height, bitrate: plan.bitrate }))) throw new Skip('kein H.264-Encoder');
  const target = new mb.BufferTarget();
  const output = new mb.Output({ format: new mb.Mp4OutputFormat({ fastStart: 'in-memory' }), target });
  job.conv = await mb.Conversion.init({
    input, output, showWarnings: false,
    video: (t) => (t === video ? {
      width: plan.width, height: plan.height, fit: 'contain', codec: 'avc', bitrate: plan.bitrate,
      ...(plan.frameRate ? { frameRate: plan.frameRate } : {}), forceTranscode: true,
    } : { discard: true }),
    audio: (t) => (t === audio ? {} : { discard: true }),
  });
  // Ohne Bild oder Ton lieber gar nicht.
  const lost = job.conv.discardedTracks.find((d) => d.track === video || d.track === audio);
  if (lost) throw new Skip(`${lost.track === video ? 'Video' : 'Ton'}: ${DISCARD[lost.reason] || lost.reason}`);
  if (!job.conv.isValid) throw new Skip('nicht umwandelbar');
  if (job.canceled) throw new Skip('abgebrochen');
  job.conv.onProgress = (p) => onProgress(Math.max(0, Math.min(1, p)), 'schnell');
  await job.conv.execute();
  if (!target.buffer) throw new Skip('leeres Ergebnis');
  return new Blob([target.buffer], { type: 'video/mp4' });
}

const once = (el, ok, bad, ms) => new Promise((resolve, reject) => {
  const t = setTimeout(() => { off(); reject(new Skip('lädt nicht')); }, ms);
  const yes = () => { off(); resolve(); };
  const no = () => { off(); reject(new Skip('lässt sich hier nicht abspielen')); };
  const off = () => { clearTimeout(t); el.removeEventListener(ok, yes); el.removeEventListener(bad, no); };
  el.addEventListener(ok, yes);
  el.addEventListener(bad, no);
});

/** Während der Neuaufnahme Video und Ergebnis nebeneinander sichtbar in
 *  host (iOS gibt aus unsichtbaren Videos oft keine Bilder heraus, und man
 *  sieht, was aufgenommen wird). */
function workBox(host, v, canvas) {
  const box = document.createElement('div');
  box.className = 'vid-work';
  box.setAttribute('aria-hidden', 'true');
  const fig = (el, text) => {
    const f = document.createElement('figure');
    const c = document.createElement('figcaption');
    c.textContent = text;
    f.append(el, c);
    return f;
  };
  box.append(fig(v, 'Original'), fig(canvas, 'Neuaufnahme'));
  (host || document.body).append(box);
  if (host) host.hidden = false;
  return { remove() { box.remove(); if (host && !host.children.length) host.hidden = true; } };
}

/** Ist das Bild (praktisch) schwarz? Stichprobe auf 16 × 9 Punkten. */
function isBlack(probe, pg, source) {
  pg.drawImage(source, 0, 0, probe.width, probe.height);
  const d = pg.getImageData(0, 0, probe.width, probe.height).data;
  let max = 0;
  for (let k = 0; k < d.length; k += 4) max = Math.max(max, d[k], d[k + 1], d[k + 2]);
  return max < 12;
}

/** Langsam, aber für alles, was der Browser abspielen kann: das Video stumm
 *  abspielen, verkleinert auf ein Canvas zeichnen und mit MediaRecorder neu
 *  aufnehmen. Der Ton kommt aus decodeAudioData und läuft über ctx mit
 *  (stumm geschaltete Videos geben keinen Ton ab, ungestumm abspielen
 *  verlangt ein Tippen). Dauert so lange wie das Video. Bleibt das Bild
 *  schwarz (Safari mit HDR-Videos), Abbruch statt eines schwarzen Videos.
 *  → Blob */
async function viaRecorder(file, onProgress, job, ctx, host) {
  const url = URL.createObjectURL(file);
  const v = document.createElement('video');
  const canvas = document.createElement('canvas');
  const tracks = [];
  let src = null, box = null;
  try {
    v.muted = true;
    v.playsInline = true;
    v.setAttribute('playsinline', '');
    v.preload = 'auto';
    box = workBox(host, v, canvas);
    v.src = url;
    await once(v, 'loadeddata', 'error', 15000);
    const dur = v.duration;
    if (!(dur > 0) || !v.videoWidth) throw new Skip('Länge oder Größe unbekannt');
    const plan = shrinkPlan(v.videoWidth, v.videoHeight, 0);
    canvas.width = plan.width;
    canvas.height = plan.height;
    const g = canvas.getContext('2d');
    const probe = document.createElement('canvas');
    probe.width = 16;
    probe.height = 9;
    const pg = probe.getContext('2d', { willReadFrequently: true });
    const stream = canvas.captureStream(plan.frameRate || 10);
    tracks.push(...stream.getTracks());
    let buf = null;
    if (ctx) {
      try { buf = await ctx.decodeAudioData(await file.arrayBuffer()); } catch { buf = null; }
    }
    if (!buf) throw new Skip('Ton lässt sich nicht lesen');
    if (ctx.state !== 'running') { try { await ctx.resume(); } catch { /* unten geprüft */ } }
    if (ctx.state !== 'running') throw new Skip('Ton gesperrt – „Verkleinern“ am Video antippen');
    const dest = ctx.createMediaStreamDestination();
    src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(dest);
    for (const t of dest.stream.getAudioTracks()) { stream.addTrack(t); tracks.push(t); }
    const type = ['video/mp4;codecs=avc1,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm']
      .find((m) => MediaRecorder.isTypeSupported(m));
    if (!type) throw new Skip('keine Aufnahme möglich');
    const rec = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: plan.bitrate, audioBitsPerSecond: 96000 });
    const chunks = [];
    rec.ondataavailable = (e) => { if (e.data?.size) chunks.push(e.data); };
    const stopped = new Promise((resolve) => { rec.onstop = resolve; });
    let stop = () => {};
    const ended = new Promise((resolve, reject) => {
      v.addEventListener('ended', () => resolve(), { once: true });
      job.stop = () => resolve();
      stop = reject;
    });
    // Schwarz-Prüfung: ab 0,5 s im Video jede Sekunde, bis einmal Bild kam.
    let seen = false, blackChecks = 0, nextCheck = 0.5;
    const check = () => {
      if (seen || v.currentTime < nextCheck) return;
      nextCheck = v.currentTime + 1;
      if (!isBlack(probe, pg, canvas)) { seen = true; return; }
      if (++blackChecks >= 3 || v.currentTime > dur - 0.3) stop(new Skip('Bild bleibt schwarz (vermutlich ein HDR-Video)'));
    };
    let raf = 0, vfc = 0;
    const paint = () => {
      g.drawImage(v, 0, 0, plan.width, plan.height);
      check();
      onProgress(Math.min(1, v.currentTime / dur), 'echtzeit');
    };
    const loop = v.requestVideoFrameCallback
      ? () => { paint(); vfc = v.requestVideoFrameCallback(loop); }
      : () => { paint(); raf = requestAnimationFrame(loop); };
    await v.play();
    rec.start(1000);
    src.start(ctx.currentTime, v.currentTime);
    loop();
    try {
      await ended;
    } finally {
      cancelAnimationFrame(raf);
      if (vfc) v.cancelVideoFrameCallback?.(vfc);
      if (rec.state !== 'inactive') rec.stop();
      await stopped;
    }
    if (job.canceled) throw new Skip('abgebrochen');
    if (!seen) throw new Skip('Bild bleibt schwarz (vermutlich ein HDR-Video)');
    return new Blob(chunks, { type: type.split(';')[0] });
  } finally {
    try { src?.stop(); } catch { /* schon aus */ }
    for (const t of tracks) t.stop();
    v.pause();
    v.removeAttribute('src');
    v.load();
    box?.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }
}
