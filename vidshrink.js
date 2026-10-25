/* vidshrink.js — Videos aus dem Unterricht beim Speichern verkleinern:
   kürzere Seite höchstens 720 px, höchstens 10 Bilder/s, H.264 mit einer
   Datenrate nach Bildgröße; der Ton wird übernommen, wie er ist (iPhone und
   Android nehmen AAC auf). Umgewandelt wird mit Mediabunny (vendor/mediabunny/,
   MPL-2.0) über WebCodecs, also mit dem Hardware-Encoder des Geräts —
   meist schneller als Echtzeit. Die Bibliothek wird erst beim ersten Video geladen.
   Kann der Browser das Video so nicht lesen (z. B. HDR vom iPhone), wird es
   stumm abgespielt und mit MediaRecorder neu aufgenommen (Echtzeit).
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
export const canShrink = () => hasCodecs() || canRerecord();
const hasCodecs = () => typeof VideoEncoder === 'function' && typeof VideoDecoder === 'function';
const canRerecord = () => typeof MediaRecorder === 'function' && typeof HTMLCanvasElement !== 'undefined'
  && typeof HTMLCanvasElement.prototype.captureStream === 'function';

class Skip extends Error {} // nicht verkleinern, Grund in message

/** Video verkleinern. onProgress(0…1, wie) — wie: 'schnell' (WebCodecs) oder
 *  'echtzeit' (Neuaufnahme). ctx: laufender AudioContext für den Ton der
 *  Neuaufnahme. → { result, cancel }; result ist ein Promise auf
 *  { blob, reason, how }: blob der kleinere Blob oder null (dann das
 *  Original nehmen), reason warum nicht. */
export function shrinkVideo(file, onProgress = () => {}, { ctx = null } = {}) {
  const job = { canceled: false, conv: null, stop: null };
  const result = (async () => {
    let why = '';
    if (hasCodecs()) {
      try {
        const out = await viaCodecs(file, onProgress, job);
        if (out) return done(out, 'schnell');
      } catch (e) {
        if (job.canceled) return { blob: null, reason: 'abgebrochen' };
        why = e instanceof Skip ? e.message : String(e?.message || e);
        logError('vidshrink:codecs', `${why} (${file.type || '?'}, ${fmtMB(file.size)})`);
      }
    } else why = 'kein WebCodecs';
    if (job.canceled) return { blob: null, reason: 'abgebrochen' };
    if (!canRerecord()) return { blob: null, reason: why || 'Browser kann nicht umwandeln' };
    try {
      const out = await viaRecorder(file, onProgress, job, ctx);
      return done(out, 'echtzeit');
    } catch (e) {
      if (job.canceled) return { blob: null, reason: 'abgebrochen' };
      const w2 = e instanceof Skip ? e.message : String(e?.message || e);
      logError('vidshrink:recorder', `${w2} (${file.type || '?'})`);
      return { blob: null, reason: why ? `${why}; Neuaufnahme: ${w2}` : w2 };
    }
  })();
  function done(out, how) {
    if (out.size >= file.size * 0.9) return { blob: null, reason: 'wäre nicht kleiner', how };
    return { blob: out, reason: '', how };
  }
  const cancel = () => { job.canceled = true; job.conv?.cancel().catch(() => {}); job.stop?.(); };
  return { result, cancel };
}

/** Schnell: mit Mediabunny über WebCodecs neu kodieren. → Blob (wirft Skip) */
async function viaCodecs(file, onProgress, job) {
  const mb = await import('./vendor/mediabunny/mediabunny.min.mjs');
  const input = new mb.Input({ source: new mb.BlobSource(file), formats: mb.ALL_FORMATS });
  const video = await input.getPrimaryVideoTrack();
  if (!video) throw new Skip('keine Videospur');
  if (!(await video.canDecode())) throw new Skip(`Video (${video.codec || '?'}) lässt sich hier nicht lesen`);
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

/** Langsam, aber für alles, was der Browser abspielen kann: das Video stumm
 *  abspielen, verkleinert auf ein Canvas zeichnen und mit MediaRecorder neu
 *  aufnehmen. Der Ton kommt aus decodeAudioData und läuft über ctx mit
 *  (stumm geschaltete Videos geben keinen Ton ab, ungestumm abspielen
 *  verlangt ein Tippen). Dauert so lange wie das Video. → Blob */
async function viaRecorder(file, onProgress, job, ctx) {
  const url = URL.createObjectURL(file);
  const v = document.createElement('video');
  const tracks = [];
  let src = null;
  try {
    v.muted = true;
    v.playsInline = true;
    v.setAttribute('playsinline', '');
    v.preload = 'auto';
    v.src = url;
    await once(v, 'loadeddata', 'error', 15000);
    const dur = v.duration;
    if (!(dur > 0) || !v.videoWidth) throw new Skip('Länge oder Größe unbekannt');
    const plan = shrinkPlan(v.videoWidth, v.videoHeight, 0);
    const canvas = document.createElement('canvas');
    canvas.width = plan.width;
    canvas.height = plan.height;
    const g = canvas.getContext('2d');
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
    let raf = 0;
    const draw = () => {
      g.drawImage(v, 0, 0, plan.width, plan.height);
      onProgress(Math.min(1, v.currentTime / dur), 'echtzeit');
      raf = requestAnimationFrame(draw);
    };
    const ended = new Promise((resolve) => {
      v.addEventListener('ended', resolve, { once: true });
      job.stop = resolve;
    });
    await v.play();
    rec.start(1000);
    src.start(ctx.currentTime, v.currentTime);
    draw();
    await ended;
    cancelAnimationFrame(raf);
    rec.stop();
    await stopped;
    if (job.canceled) throw new Skip('abgebrochen');
    return new Blob(chunks, { type: type.split(';')[0] });
  } finally {
    try { src?.stop(); } catch { /* schon aus */ }
    for (const t of tracks) t.stop();
    v.pause();
    v.removeAttribute('src');
    v.load();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }
}
