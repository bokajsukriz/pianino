/* mic.js — Mikrofon für „Geführt“: getUserMedia → AnalyserNode im
   gemeinsamen AudioContext (nicht an die Lautsprecher angeschlossen).
   Nichts wird aufgenommen oder gespeichert; es werden nur Spektren gelesen.
   Echo-Unterdrückung, Rauschunterdrückung und Pegelautomatik sind aus — die
   würden Klaviertöne verbiegen oder wegregeln. Spielt die App selbst einen
   Akkord vor, wird so lange weggehört (ignoreUntil), sonst erkennte sie sich
   selbst. */

import * as audio from './audio.js';
import { semitoneLevels, freshLevels } from './hear.js';
import { logError } from './log.js';

const BEFORE = 0.35; // s: Vergleichsspektrum für „neu angeschlagen“

let stream = null, source = null, analyser = null, buf = null;
let history = [];
let quietUntil = 0;

export const supported = () => !!navigator.mediaDevices?.getUserMedia;
export const isOpen = () => !!analyser;

/** FFT-Länge für ein Fenster von gut ⅓ s (48 kHz und 44,1 kHz: 16384). */
const fftFor = (sr) => Math.pow(2, Math.round(Math.log2(sr * 0.36)));

/** Mikrofon öffnen (fragt beim ersten Mal nach der Erlaubnis). → true/false */
export async function open() {
  if (analyser) return true;
  if (!supported()) return false;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    });
    const ctx = audio.getCtx();
    source = ctx.createMediaStreamSource(stream);
    analyser = ctx.createAnalyser();
    analyser.fftSize = Math.min(32768, Math.max(2048, fftFor(ctx.sampleRate)));
    analyser.smoothingTimeConstant = 0;
    source.connect(analyser);
    buf = new Float32Array(analyser.frequencyBinCount);
    history = [];
    return true;
  } catch (e) {
    logError('mic:open', e);
    close();
    return false;
  }
}

export function close() {
  try { stream?.getTracks().forEach((t) => t.stop()); } catch { /* egal */ }
  try { source?.disconnect(); } catch { /* egal */ }
  stream = null; source = null; analyser = null; buf = null; history = [];
}

/** Bis zur Audiozeit `t` nicht hinhören (eigenes Vorspielen). */
export function ignoreUntil(t) {
  quietUntil = Math.max(quietUntil, t);
  history = [];
}

/** Aktuelles Spektrum lesen. → { levels, fresh } oder null (kein Mikrofon,
 *  gerade weggehört). Je Bildschirm-Frame aufrufen; `t` = audio.now(). */
export function sample(t) {
  if (!analyser) return null;
  analyser.getFloatFrequencyData(buf);
  if (t < quietUntil) return null;
  const ctx = audio.getCtx();
  const levels = semitoneLevels(buf, ctx.sampleRate, analyser.fftSize);
  history.push({ t, levels });
  while (history.length > 1 && history[1].t <= t - BEFORE) history.shift();
  const old = history[0].t <= t - BEFORE + 0.05 ? history[0].levels : null;
  return { levels, fresh: old ? freshLevels(levels, old) : levels };
}
