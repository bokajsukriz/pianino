/* mictest.js — Mikrofon-Test (Über → „Mikrofon testen“): Pegel, gehörte
   Töne mit Abweichung in Cent und das Urteil beider Erkenner für die fünf
   Song-Akkorde. Zum Ausprobieren und Fehlersuchen; kein Teil einer Übung. */

import * as audio from './audio.js';
import * as mic from './mic.js';
import { noteName } from './chords.js';
import { $, showScreen, frameLoop } from './ui.js';

const SYMS = ['Am', 'D', 'F', 'Dm', 'C'];
const PC = ['A', 'A♯', 'H', 'C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯']; // essentia-Chroma: Bin 0 = A
let stop = null;

/** Pegel −70…0 dBFS als Prozent. */
export const levelPct = (db) => Math.max(0, Math.min(100, ((db + 70) / 70) * 100));

/** „A4 −12 ct · C5 · E5“ (Cent erst ab ±10). */
export function notesText(notes) {
  if (!notes?.length) return '–';
  return notes.map((n) => `${noteName(n.midi)}${Math.abs(n.cents) >= 10 ? ` ${n.cents > 0 ? '+' : '−'}${Math.abs(n.cents)} ct` : ''}`).join(' · ');
}

function paint(d) {
  $('#mt-level').style.width = `${levelPct(d?.db ?? -Infinity).toFixed(0)}%`;
  $('#mt-db').textContent = Number.isFinite(d?.db) ? `${Math.round(d.db)} dB` : '–';
  $('#mt-onset').classList.toggle('on', !!d && d.sinceOnset < 0.3);
  $('#mt-notes').textContent = notesText(d?.notes);
  const hp = d?.hpcp;
  $('#mt-chroma').textContent = hp
    ? hp.map((v, i) => [v, i]).filter(([v]) => v >= 0.5).sort((a, b) => b[0] - a[0]).map(([, i]) => PC[i]).join(' ') || '–'
    : (mic.earStatus() === 'failed' ? 'essentia nicht geladen' : 'lädt …');
  for (const s of SYMS) {
    const e = d?.eigen?.[s], x = d?.essentia?.[s];
    const ce = $(`#mt-e-${s}`), cx = $(`#mt-x-${s}`);
    ce.textContent = e == null ? '–' : e ? '✓' : '·';
    ce.classList.toggle('yes', !!e);
    cx.textContent = x ? `${x.ok ? '✓' : '·'} ${x.score >= 0 ? '+' : '−'}${Math.abs(x.score).toFixed(2)}` : '–';
    cx.classList.toggle('yes', !!x?.ok);
  }
}

export async function openMicTest() {
  showScreen('mictest');
  $('#mt-note').textContent = 'Mikrofon wird geöffnet …';
  await audio.unlock();
  if (!(await mic.open())) {
    $('#mt-note').textContent = 'Kein Mikrofon: Erlaubnis im Browser prüfen (Schloss-Symbol neben der Adresse).';
    return;
  }
  $('#mt-note').textContent = 'Spiel einen Akkord. Grün = erkannt. Die Urteile gelten bis 1 s nach dem Anschlag.';
  mic.setDiagnose(true);
  let shown = null;
  stop = frameLoop(() => {
    mic.sample(audio.now());
    const d = mic.diag();
    // Urteile 1,5 s nach dem Anschlag stehen lassen, damit man sie lesen kann.
    if (d && (d.sinceOnset < 1.5 || !shown)) shown = d;
    paint(d && shown ? { ...d, eigen: shown.eigen, essentia: shown.essentia, hpcp: shown.hpcp } : d);
  });
}

export function closeMicTest() {
  stop?.();
  stop = null;
  mic.setDiagnose(false);
  mic.close();
}
