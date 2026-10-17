/* ear-worker.js — essentia.js im Web Worker. Eigener Worker, weil essentia
   (Emscripten/Embind) intern new Function braucht: die strenge CSP der Seite
   (index.html) gilt hier nicht, der Worker hat nur die Rechte seiner Herkunft.

   Geprüft wird ein ERWARTETER Song-Akkord: essentia liefert die Chroma (HPCP,
   nach SpectralWhitening), verglichen wird mit dem Muster des erwarteten
   Akkords und seiner Konkurrenten (die anderen Song-Akkorde und alle
   Varianten mit einem Ton der rechten Hand ±1/±2 Halbtöne daneben). Das
   ChordsDetection von essentia hält dagegen nur Dur/Moll auseinander und ließ
   in der Simulation 18–39 % der Fehlgriffe als richtig durch. So (Abstand
   0,02, bis 1 s nach dem Anschlag): nur rechte Hand 96 % erkannt, 0 %
   Fehlgriffe durchgelassen; mit Bass 84 % erkannt, 5 % Fehlgriffe — die
   Obertöne des Basses füllen Tonklassen auf. Mit Abstand 0,03: 81 % / 4 %.

   Nachrichten: { id, frame: Float32Array (≈ 0,17 s), sampleRate, expect: ['Am', …] }
     → { id, results: { Am: { ok, score, chord }, … }, hpcp: [12 Werte, Bin 0 = A] }
   Beim Start einmal { ready: true } bzw. { error }. */

let essentia = null, wasm = null;

const whenReady = (m) => new Promise((resolve) => {
  if (m.calledRun) resolve();
  else {
    const prev = m.onRuntimeInitialized;
    m.onRuntimeInitialized = () => { prev?.(); resolve(); };
  }
});

// ---- Worker-seitig: Akkord-Verifikation per essentia.js-HPCP + Template-Vergleich ----
// Rahmen: frame = Float32Array, Länge 4096 @ 22050 Hz oder 8192 @ 44100/48000 Hz (≈0,17–0,19 s),
// Fensterende ≈ jetzt; Länge = Zweierpotenz (Spectrum-FFT). Pro Frame aufrufen (Hop ≈ 50 ms),
// akzeptieren, wenn ok in ≥ 2 aufeinanderfolgenden Frames binnen 1,0 s nach dem Anschlag.
const CC_SONG = { Am: [69, 72, 76], D: [69, 74, 78], F: [69, 72, 77], Dm: [69, 74, 77], C: [67, 72, 76] }; // RH-Voicing (MIDI)
const CC_MARGIN = 0.02;   // cos(erwartet) − max cos(Konkurrenz)
const CC_MIN_COS = 0.8;   // Mindest-Ähnlichkeit zum erwarteten Template
const CC_POW = 0.25;      // HPCP-Kompression vor dem Vergleich
const CC_H3 = 0.3, CC_H5 = 0.1; // Obertongewichte im Template: 3. Teilton (+7 HT), 5. Teilton (+4 HT)
const CC_NAMES = ['A', 'A#', 'B', 'C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#']; // HPCP-Bin 0 = A (ref. 440 Hz)
const ccPc = (m) => (((m - 69) % 12) + 12) % 12;
const ccKey = (ns) => [...new Set(ns.map(ccPc))].sort((a, b) => a - b).join();
function ccTemplate(ns) {
  const t = new Float64Array(12);
  for (const m of ns) { const p = ccPc(m); t[p] += 1; t[(p + 7) % 12] += CC_H3; t[(p + 4) % 12] += CC_H5; }
  let n = 0; for (const v of t) n += v * v; n = Math.sqrt(n);
  return t.map((v) => v / n);
}
// Pro Song-Akkord: eigenes Template + Konkurrenten (die anderen 4 Song-Akkorde und alle Varianten
// mit einem RH-Ton ±1/±2 HT, als Tonklassen-Mengen, Duplikate/identische Mengen entfernt).
const CC_TEMPLATES = (() => {
  const out = {};
  for (const x in CC_SONG) {
    const rh = CC_SONG[x], seen = new Set([ccKey(rh)]), comp = [];
    const add = (name, ns) => { const k = ccKey(ns); if (!seen.has(k) && new Set(ns.map(ccPc)).size === 3) { seen.add(k); comp.push({ name, t: ccTemplate(ns) }); } };
    for (const o in CC_SONG) if (o !== x) add(o, CC_SONG[o]);
    for (let i = 0; i < 3; i++) for (const d of [-2, -1, 1, 2]) {
      const w = rh.slice(); w[i] += d; add(x + '?' + w.map((m) => CC_NAMES[ccPc(m)]).join('-'), w);
    }
    out[x] = { t: ccTemplate(rh), comp };
  }
  return out;
})();

/** Chroma eines Fensters: Float32Array(12), Bin 0 = A. */
function hpcpOf(e, frame, sampleRate) {
  const N = frame.length;
  const del = [];
  try {
    const v = e.arrayToVector(frame); del.push(v);
    const win = e.Windowing(v, true, N, 'blackmanharris62', 0, true); del.push(win.frame);
    const spec = e.Spectrum(win.frame, N); del.push(spec.spectrum);
    const pk = e.SpectralPeaks(spec.spectrum, 1e-5, 5000, 60, 40, 'magnitude', sampleRate);
    del.push(pk.frequencies, pk.magnitudes);
    const wh = e.SpectralWhitening(spec.spectrum, pk.frequencies, pk.magnitudes, 5000, sampleRate);
    del.push(wh.magnitudes);
    const hp = e.HPCP(pk.frequencies, wh.magnitudes,
      false, 500, 0, 5000, false, 300, false, 'unitMax', 440, sampleRate, 12, 'squaredCosine', 1);
    del.push(hp.hpcp);
    return e.vectorToArray(hp.hpcp); // Kopie, überlebt das delete()
  } finally {
    for (const o of del) o.delete();
  }
}

/** Erwarteten Akkord gegen seine Konkurrenten prüfen. → { ok, score, chord } */
function compare(h, expectedSymbol) {
  const T = CC_TEMPLATES[expectedSymbol];
  if (!T) throw new Error('chordCheck: unbekannter Akkord ' + expectedSymbol);
  let n = 0; const x = new Float64Array(12);
  for (let i = 0; i < 12; i++) { x[i] = Math.pow(Math.max(h[i], 0), CC_POW); n += x[i] * x[i]; }
  n = Math.sqrt(n);
  if (!(n > 0)) return { ok: false, score: -1, chord: null };
  const cos = (t) => { let s = 0; for (let i = 0; i < 12; i++) s += x[i] * t[i]; return s / n; };
  const cExp = cos(T.t);
  let cBest = -1, best = null;
  for (const c of T.comp) { const s = cos(c.t); if (s > cBest) { cBest = s; best = c.name; } }
  const score = cExp - cBest;
  return { ok: score >= CC_MARGIN && cExp >= CC_MIN_COS, score, chord: score >= 0 ? expectedSymbol : best };
}

(async () => {
  try {
    const [{ EssentiaWASM }, { default: Essentia }] = await Promise.all([
      import('./vendor/essentia/essentia-wasm.es.js'),
      import('./vendor/essentia/essentia.js-core.es.min.js'),
    ]);
    await whenReady(EssentiaWASM);
    wasm = EssentiaWASM;
    essentia = new Essentia(wasm);
    self.postMessage({ ready: true });
  } catch (err) {
    self.postMessage({ error: String(err?.message || err) });
  }
})();

self.onmessage = (ev) => {
  const { id, frame, sampleRate, expect } = ev.data;
  const results = {};
  let hpcp = null;
  try {
    hpcp = hpcpOf(essentia, frame, sampleRate);
    for (const sym of expect) results[sym] = compare(hpcp, sym);
  } catch (err) {
    for (const sym of expect) results[sym] = { ok: false, score: -1, chord: null, error: String(err?.message || err) };
  }
  self.postMessage({ id, results, hpcp: hpcp ? Array.from(hpcp) : null });
};
