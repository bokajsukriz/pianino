/* hear.js — REIN: Liegt der erwartete Akkord? Aus einem Spektrum (dB je
   FFT-Bin, wie AnalyserNode.getFloatFrequencyData es liefert) werden Pegel je
   Halbton gebildet und gegen die bekannten Töne des Akkords geprüft.
   Kein DOM, keine Zeit, kein Zufall — mic.js liefert die Spektren.

   Es wird nicht frei transkribiert, sondern nur gefragt: Klingen die drei
   Töne der rechten Hand, und klingt nichts Fremdes? Fremd ist ein Halbton,
   der weder Akkordton noch Oberton eines Akkordtons (auch des Basses) ist.
   Ausgelegt nach einer Simulation mit den Salamander-Samples (Raumhall,
   Handy-Mikro ohne Tiefen, Rauschen, Klick, ungleicher Anschlag, ±20 Cent
   Verstimmung, Nachklang des Vorakkords), je Messfenster: 98–99 % der
   richtigen Griffe erkannt, ein falscher Akkord nie und ein Ton einen
   Halbton daneben in 1–4 % der Fälle als richtig durchgelassen. Fehlt mit
   Bass ein Ton der rechten Hand ganz, geht das oft durch (die Obertöne des
   Basses füllen ihn auf) — gewollt tolerant: „nicht erkannt“ bei richtigem
   Griff stört mehr als ein übersehener Fehler. */

export const HEAR = Object.freeze({
  lo: 40, hi: 100,  // ausgewertete Halbtöne (MIDI)
  band: 0.4,        // ± Halbton um die Sollfrequenz
  presence: 24,     // Akkordton höchstens so viele dB unter dem lautesten
  neighbour: 3,     // … und so viel lauter als seine fremden Nachbarn
  foreign: 12,      // Fremdton muss mindestens so viel leiser sein als der lauteste
  foreignWeak: 6,   // … und so viel leiser als der leiseste Akkordton
  thirdOfBass: 12,  // … und so nah, wenn ihn auch der Bass liefern könnte (siehe unten)
  loud: 18,         // lautester Akkordton über dem Grundrauschen (Median)
  ringing: 0.8,     // Anteil des alten Spektrums, der als Nachklang gilt
  foreignLo: 62, foreignHi: 86,
  onset: 0.5,       // Anteil neuer Energie, ab dem ein Anschlag zählt
  holdDecay: 8,     // dB/s: so schnell vergisst der Spitzenpegel
});

const SILENT = -200;
const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);

/** dB je Bin → dB je Halbton (lo..hi), jeweils der lauteste Bin im Band. */
export function semitoneLevels(db, sampleRate, fftSize, { lo = HEAR.lo, hi = HEAR.hi, band = HEAR.band } = {}) {
  const out = new Float64Array(hi - lo + 1).fill(SILENT);
  const binHz = sampleRate / fftSize;
  for (let m = lo; m <= hi; m++) {
    const a = Math.ceil(hz(m - band) / binHz), b = Math.floor(hz(m + band) / binHz);
    let best = SILENT;
    for (let k = Math.max(0, a); k <= Math.min(db.length - 1, b); k++) {
      const v = db[k];
      if (v > best) best = v;
    }
    out[m - lo] = best;
  }
  return out;
}

/** Was ist neu dazugekommen? Leistung jetzt minus Nachklang von vorher. */
export function freshLevels(now, before, ringing = HEAR.ringing) {
  return now.map((n, i) => {
    const p = Math.pow(10, n / 10) - ringing * Math.pow(10, before[i] / 10);
    return p > 1e-20 ? 10 * Math.log10(p) : SILENT;
  });
}

/** Spitzenpegel seit dem letzten Anschlag. Bewertet wird, was angeschlagen
 *  wurde, nicht der Ausklang: Töne klingen verschieden schnell ab, und im
 *  Ausklang können Obertöne des Basses wie Akkordtöne aussehen.
 *  hold: Zustand vom letzten Aufruf (oder null), dt: Sekunden seitdem.
 *  Der Beginn eines Anschlags (mehr als die Hälfte der Energie neu) setzt
 *  den Zustand zurück; danach folgt er dem Lautesten und vergisst langsam
 *  (holdDecay). → { levels, onset } */
export function holdLevels(hold, levels, fresh, dt, { lo = HEAR.lo, onset = HEAR.onset, holdDecay = HEAR.holdDecay } = {}) {
  let now = 0, neu = 0;
  for (let m = 55; m <= 90; m++) {
    now += Math.pow(10, levels[m - lo] / 10);
    neu += Math.pow(10, fresh[m - lo] / 10);
  }
  const isOnset = now > 0 && neu / now >= onset;
  if (!hold || (isOnset && !hold.onset)) return { levels: Float64Array.from(levels), onset: isOnset };
  const out = levels.map((v, i) => Math.max(v, hold.levels[i] - holdDecay * dt));
  return { levels: out, onset: isOnset };
}

/** Halbtöne der Teiltöne 1–8 (nur die, die nah an einem Halbton liegen). */
export function harmonics(notes) {
  const h = new Set();
  for (const n of notes) {
    for (let k = 1; k <= 8; k++) {
      const m = n + 12 * Math.log2(k);
      if (Math.abs(m - Math.round(m)) < 0.35) h.add(Math.round(m));
    }
  }
  return h;
}

function median(xs) {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

/** Liegt `chord` ({ rh: [midi…], lh })?
 *  levels/fresh: semitoneLevels jetzt bzw. freshLevels(jetzt, vor ~0,35 s).
 *  prev: Akkord davor — seine Töne dürfen (Pedal) noch nachklingen und zählen
 *  nur als fremd, wenn sie neu angeschlagen wurden.
 *  → { ok, loud, present: [midi], missing: [midi], foreign: [midi] } */
export function checkChord(levels, fresh, chord, { prev = null, lo = HEAR.lo, ...tune } = {}) {
  const P = { ...HEAR, ...tune };
  const L = (m) => levels[m - lo] ?? SILENT;
  const F = (m) => fresh[m - lo] ?? SILENT;
  const rh = chord.rh;
  const allowed = harmonics([...rh, chord.lh]);
  const ringing = prev ? harmonics([...prev.rh, prev.lh]) : new Set();
  const floor = median(Array.from({ length: 36 }, (_, i) => L(55 + i)));
  const ref = Math.max(...rh.map(L));
  const loud = ref - floor >= P.loud;
  const nb = (m) => Math.max(SILENT, ...[m - 1, m + 1].filter((q) => !allowed.has(q)).map(L));
  // Der 5. und 7. Teilton des Basses (Terz, Septime) können den einen
  // unterscheidenden Ton vortäuschen: Dm mit Bass D3 liefert ein leises F♯5 —
  // klingt das echte F5 schon aus, sähe es aus wie D. Klingt der Halbton
  // daneben mit, muss so ein Ton deshalb laut sein.
  const fromBass = new Set([5, 7].map((k) => Math.round(chord.lh + 12 * Math.log2(k))));
  const rival = (m) => fromBass.has(m) && nb(m) >= ref - P.presence;
  const present = rh.filter((m) => L(m) >= ref - (rival(m) ? P.thirdOfBass : P.presence)
    && L(m) - nb(m) >= P.neighbour);
  const missing = rh.filter((m) => !present.includes(m));
  const weakest = Math.min(...rh.map(L));
  const foreign = [];
  for (let m = P.foreignLo; m <= P.foreignHi; m++) {
    if (allowed.has(m)) continue;
    const v = ringing.has(m) ? Math.min(L(m), F(m)) : L(m);
    if (v > ref - P.foreign || v > weakest - P.foreignWeak) foreign.push(m);
  }
  return { ok: loud && !missing.length && !foreign.length, loud, present: loud ? present : [], missing, foreign: loud ? foreign : [] };
}
