/* hear.js — REIN: Liegt der erwartete Akkord? Aus einem Spektrum (dB je
   FFT-Bin, wie AnalyserNode.getFloatFrequencyData es liefert) werden Pegel je
   Halbton gebildet und gegen die bekannten Töne des Akkords geprüft.
   Kein DOM, keine Zeit, kein Zufall — mic.js liefert die Spektren und sagt,
   wann angeschlagen wurde.

   Es wird nicht frei transkribiert, sondern nur gefragt: Klingen die drei
   Töne der rechten Hand, und klingt nichts Fremdes? Fremd ist ein Halbton,
   der weder Akkordton noch Oberton eines Akkordtons (auch des Basses) ist.

   Zwei Dinge merkt sich der Aufrufer seit dem Anschlag (followOnset):
   – wie weit jeder Halbton seit dem Anschlag gestiegen ist. Ein Ton des
     Vorakkords, der (Pedal) nur nachklingt, steigt nicht; wird er neu
     angeschlagen, schon — dann ist er fremd, auch wenn er nachklingen dürfte.
   – den Spitzenpegel ab `settle` nach dem Anschlag. Ein falscher Ton klingt
     oft schneller ab als die Obertöne des Basses, die den fehlenden richtigen
     Ton auffüllen; ohne Gedächtnis sähe der Griff nach ~0,7 s richtig aus.
     Vor `settle` steckt der Anschlag selbst noch im FFT-Fenster und
     verschmiert das Spektrum, deshalb zählt der Spitzenpegel erst danach.

   Ausgelegt nach einer Simulation mit den Salamander-Samples (Raumhall,
   Handy-Mikro ohne Tiefen, Rauschen, Klick, ungleicher Anschlag, ±20 Cent
   Verstimmung, Nachklang des Vorakkords mit und ohne Pedal), 800 Ausklänge,
   bewertet bis 1 s nach dem Anschlag (zwei Fenster in Folge richtig):
     nur rechte Hand: 100 % der richtigen Griffe erkannt, „Ton daneben“
       (ein Ton ±1/±2 Halbtöne) 0,4 % durchgelassen, anderer Akkord 0 %;
     mit Bass: 97,5 % erkannt, Ton daneben 6,3 %, anderer Akkord 1,3 %.
   (Vorher ohne Gedächtnis: 100 / 0,8 / 0 und 97,5 / 20,4 / 1,3 %.) Stabil,
   wenn mic.js den Anschlag bis 0,1 s zu spät erkennt. Was mit Bass noch
   durchgeht, ist meist Dm über D3: A4 und D5 sind dort 3. und 4. Teilton des
   Basses, nur das F5 muss wirklich gespielt sein.
   Fehlt mit Bass ein Ton der rechten Hand ganz, geht das oft durch (die
   Obertöne des Basses füllen ihn auf) — gewollt tolerant: „nicht erkannt“
   bei richtigem Griff stört mehr als ein übersehener Fehler. */

export const HEAR = Object.freeze({
  lo: 40, hi: 100,  // ausgewertete Halbtöne (MIDI)
  band: 0.4,        // ± Halbton um die Sollfrequenz
  presence: 24,     // Akkordton höchstens so viele dB unter dem lautesten
  neighbour: 3,     // … und so viel lauter als seine fremden Nachbarn
  foreign: 12,      // Fremdton muss mindestens so viel leiser sein als der lauteste
                    // (jetzt und im Spitzenpegel seit `settle`)
  foreignWeak: 6,   // … und so viel leiser als der leiseste Akkordton
  thirdOfBass: 12,  // … und so nah, wenn ihn auch der Bass liefern könnte (siehe unten)
  loud: 18,         // lautester Akkordton über dem Grundrauschen (Median)
  rise: 10,         // dB: so weit muss ein nachklingender Ton steigen, um als neu zu gelten
                    // (Pedal-Nachklang schwebt um einige dB)
  settle: 0.45,     // s nach dem Anschlag: ab hier zählt der Spitzenpegel (FFT-Fenster + Rand)
  foreignLo: 62, foreignHi: 86,
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

/** Gedächtnis seit dem Anschlag, je Spektrum nach dem Anschlag aufrufen.
 *  state: Rückgabe vom letzten Aufruf; null beim ersten Spektrum nach einem
 *  Anschlag — dann ist `before` das letzte Spektrum davor (Fenster endet vor
 *  dem Anschlag). age: s seit dem Anschlag.
 *  → { base, rise, peak }: base = Spektrum vor dem Anschlag; rise[i] = größter
 *  Anstieg über base in dB; peak[i] = Spitzenpegel ab age ≥ settle (sonst null).
 *  Gibt ein neues Objekt zurück, `state` bleibt unverändert. */
export function followOnset(state, levels, age, before = null, { settle = HEAR.settle } = {}) {
  const base = state ? state.base : Float64Array.from(before ?? levels);
  const rise = levels.map((v, i) => Math.max(v - base[i], state ? state.rise[i] : -Infinity));
  const late = age >= settle - 1e-9;
  const peak = !late ? null : state?.peak ? levels.map((v, i) => Math.max(v, state.peak[i])) : Float64Array.from(levels);
  return { base, rise, peak };
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
 *  levels: semitoneLevels jetzt. since: followOnset(…) für dieses Spektrum
 *  (oder null: dann gelten Töne des Vorakkords nie als fremd, und es gibt
 *  keinen Spitzenpegel).
 *  prev: Akkord davor — seine Töne dürfen (Pedal) noch nachklingen und zählen
 *  nur als fremd, wenn sie seit dem Anschlag um `rise` gestiegen sind.
 *  → { ok, loud, present: [midi], missing: [midi], foreign: [midi] } */
export function checkChord(levels, since, chord, { prev = null, lo = HEAR.lo, ...tune } = {}) {
  const P = { ...HEAR, ...tune };
  const L = (m) => levels[m - lo] ?? SILENT;
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
  // Spitzenpegel: derselbe Abstand wie jetzt, aber gegen den lautesten
  // Akkordton im Spitzenpegel — ein abgeklungener falscher Ton bleibt fremd.
  const peak = since?.peak;
  const peakRef = peak ? Math.max(...rh.map((m) => peak[m - lo])) : 0;
  const foreign = [];
  for (let m = P.foreignLo; m <= P.foreignHi; m++) {
    if (allowed.has(m)) continue;
    if (ringing.has(m) && !(since && since.rise[m - lo] >= P.rise)) continue;
    if (L(m) > ref - P.foreign || L(m) > weakest - P.foreignWeak
      || (peak && peak[m - lo] > peakRef - P.foreign)) foreign.push(m);
  }
  return { ok: loud && !missing.length && !foreign.length, loud, present: loud ? present : [], missing, foreign: loud ? foreign : [] };
}
