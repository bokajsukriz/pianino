/* ear.js — Akkorde hören mit essentia.js (Music Technology Group, UPF;
   AGPL-3.0, vendor/essentia/, siehe THIRD-PARTY.md). Die Rechnung läuft in
   ear-worker.js (Chroma von essentia, Vergleich mit dem erwarteten Akkord und
   seinen Fehlgriff-Varianten); hier nur Start, Anfragen und die Regeln fürs Urteil.
   Geladen wird erst, wenn das Mikrofon an ist (≈ 2,9 MB WebAssembly). */

/** Regeln fürs Urteil (mic.js, exercises/guided.js). judge gilt für beide
 *  Erkenner: im Ausklang verschieben sich die Anteile, und ein falscher Griff
 *  sähe irgendwann richtig aus. */
export const EAR = Object.freeze({
  judge: 1.0,        // s nach einem Anschlag; danach wird nicht mehr geurteilt
});

let worker = null, starting = null, nextId = 1;
const waiting = new Map();

/** Worker starten und essentia laden (einmal). → Promise<true> */
export function loadEar() {
  starting ??= new Promise((resolve, reject) => {
    worker = new Worker(new URL('./ear-worker.js', import.meta.url), { type: 'module' });
    worker.onmessage = (ev) => {
      const d = ev.data;
      if (d.ready) { resolve(true); return; }
      if (d.error && d.id === undefined) { reject(new Error(d.error)); return; }
      waiting.get(d.id)?.(d);
      waiting.delete(d.id);
    };
    worker.onerror = (ev) => reject(new Error(ev.message || 'ear-worker'));
  }).catch((e) => {
    worker?.terminate();
    worker = null; starting = null;
    throw e;
  });
  return starting;
}

/** Ein Fenster (≈ 0,17 s, Länge 2^n) gegen erwartete Song-Akkorde prüfen.
 *  frame wird übergeben (danach leer). expect: Symbole, z. B. ['Am', 'D'].
 *  → Promise<{ results: { Am: { ok, score, chord }, … }, hpcp }>; chord: das
 *  erwartete Symbol, ein anderer Song-Akkord oder eine Variante wie 'Am?A-C-F#'. */
export function checkFrame(frame, sampleRate, expect) {
  const id = nextId++;
  return new Promise((resolve) => {
    waiting.set(id, resolve);
    worker.postMessage({ id, frame, sampleRate, expect }, [frame.buffer]);
  });
}
