/* vidshrink.js — Videos aus dem Unterricht beim Speichern verkleinern:
   kürzere Seite höchstens 720 px, höchstens 30 Bilder/s, H.264 mit einer
   Datenrate nach Bildgröße; der Ton wird übernommen, wie er ist (iPhone und
   Android nehmen AAC auf). Umgewandelt wird mit Mediabunny (vendor/mediabunny/,
   MPL-2.0) über WebCodecs, also mit dem Hardware-Encoder des Geräts —
   meist schneller als Echtzeit. Die Bibliothek wird erst beim ersten Video geladen.
   shrinkPlan ist rein (Tests in Node). */

import { logError } from './log.js';

const SHORT = 720;          // kürzere Seite höchstens
const MAX_FPS = 30;
const RATE_720P = 1_500_000; // bit/s bei 1280 × 720
const MIN_RATE = 400_000;

const even = (n) => Math.max(2, Math.round(n / 2) * 2);

/** Zielgröße, Bildrate und Datenrate für ein Video w × h mit fps Bildern/s
 *  (fps 0 = unbekannt). → { width, height, frameRate|null, bitrate } */
export function shrinkPlan(w, h, fps = 0) {
  const k = Math.min(1, SHORT / Math.max(1, Math.min(w, h)));
  const width = even(w * k), height = even(h * k);
  const frameRate = fps > MAX_FPS + 2 ? MAX_FPS : null;
  // ANNAHME: Für Klavier-Aufnahmen (ruhige Kamera, Hände im Bild) reichen
  // 1,5 Mbit/s bei 720p; kleinere Bilder anteilig weniger.
  const bitrate = Math.round(Math.max(MIN_RATE, Math.min(RATE_720P, RATE_720P * (width * height) / (1280 * 720))));
  return { width, height, frameRate, bitrate };
}

/** Kann dieser Browser überhaupt umwandeln? */
export const canShrink = () => typeof VideoEncoder === 'function' && typeof VideoDecoder === 'function';

/** Video verkleinern. onProgress(0…1). → { blob, cancel } wobei blob ein
 *  Promise ist: der kleinere Blob (video/mp4) oder null, wenn es nicht geht,
 *  nicht kleiner wird oder abgebrochen wurde (dann das Original nehmen). */
export function shrinkVideo(file, onProgress = () => {}) {
  let conv = null, canceled = false;
  const blob = (async () => {
    if (!canShrink()) return null;
    const mb = await import('./vendor/mediabunny/mediabunny.min.mjs');
    const input = new mb.Input({ source: new mb.BlobSource(file), formats: mb.ALL_FORMATS });
    const track = await input.getPrimaryVideoTrack();
    if (!track || canceled) return null;
    let fps = 0;
    try { fps = (await track.computePacketStats(100)).averagePacketRate || 0; } catch { /* unbekannt */ }
    const plan = shrinkPlan(track.displayWidth, track.displayHeight, fps);
    if (!(await mb.canEncodeVideo('avc', { width: plan.width, height: plan.height, bitrate: plan.bitrate }))) return null;
    const target = new mb.BufferTarget();
    const output = new mb.Output({ format: new mb.Mp4OutputFormat({ fastStart: 'in-memory' }), target });
    conv = await mb.Conversion.init({
      input, output, tracks: 'primary', showWarnings: false,
      video: {
        width: plan.width, height: plan.height, fit: 'contain', codec: 'avc', bitrate: plan.bitrate,
        ...(plan.frameRate ? { frameRate: plan.frameRate } : {}), forceTranscode: true,
      },
    });
    // Ohne Ton (nicht übernehmbar) lieber das Original.
    if (!conv.isValid || conv.discardedTracks.some((d) => d.track.type === 'audio' || d.track.type === 'video')) return null;
    if (canceled) return null;
    conv.onProgress = (p) => onProgress(Math.max(0, Math.min(1, p)));
    await conv.execute();
    if (canceled || !target.buffer) return null;
    const out = new Blob([target.buffer], { type: 'video/mp4' });
    return out.size < file.size * 0.9 ? out : null;
  })().catch((e) => { if (!canceled) logError('vidshrink', e); return null; });
  const cancel = () => { canceled = true; conv?.cancel().catch(() => {}); };
  return { blob, cancel };
}
