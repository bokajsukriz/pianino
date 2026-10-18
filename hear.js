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
  voiceLo: 50,      // tiefster Ton der Lagen, die checkChordAny prüft
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

/** Gehörte Töne zum Anzeigen (Mikrofon-Test): örtliche Spitzen im
 *  Halbton-Spektrum, höchstens 30 dB unter der lautesten und `loud` dB über
 *  dem Grundrauschen. cents: Abweichung der lautesten Frequenz im Band von der
 *  gleichstufigen Stimmung (a′ = 440 Hz), parabolisch zwischen den Bins.
 *  → [{ midi, db, cents }], lauteste zuerst, höchstens `max`. */
export function peakNotes(db, sampleRate, fftSize, { lo = 48, hi = 90, max = 6 } = {}) {
  const L = semitoneLevels(db, sampleRate, fftSize, { lo: lo - 1, hi: hi + 1 });
  const at = (m) => L[m - lo + 1];
  const vals = [];
  for (let m = lo; m <= hi; m++) vals.push(at(m));
  const floor = median(vals), top = Math.max(...vals);
  const binHz = sampleRate / fftSize;
  const out = [];
  for (let m = lo; m <= hi; m++) {
    const v = at(m);
    if (v < top - 30 || v - floor < HEAR.loud || v < at(m - 1) || v < at(m + 1)) continue;
    // Spitzen-Bin im Band ±½ Halbton, dann Parabel durch die Nachbarn.
    const a = Math.max(1, Math.ceil(hz(m - 0.5) / binHz)), b = Math.min(db.length - 2, Math.floor(hz(m + 0.5) / binHz));
    let k = a;
    for (let i = a; i <= b; i++) if (db[i] > db[k]) k = i;
    const y0 = db[k - 1], y1 = db[k], y2 = db[k + 1];
    const den = y0 - 2 * y1 + y2;
    const d = den ? Math.max(-0.5, Math.min(0.5, 0.5 * (y0 - y2) / den)) : 0;
    const cents = 1200 * Math.log2(((k + d) * binHz) / hz(m));
    out.push({ midi: m, db: v, cents: Math.round(cents) });
  }
  return out.sort((x, y) => y.db - x.db).slice(0, max);
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

/** Töne der linken Hand: lh als Zahl (alt) oder als Liste (Griff, voicing.js). */
const bassNotes = (chord) => (chord?.lh == null ? [] : [].concat(chord.lh));

function median(xs) {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

/** Liegt `chord` ({ rh: [midi…], lh: midi | [midi…] })?
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
  const bass = bassNotes(chord);
  const allowed = harmonics([...rh, ...bass]);
  const ringing = prev ? harmonics([...prev.rh, ...bassNotes(prev)]) : new Set();
  const floor = median(Array.from({ length: 36 }, (_, i) => L(55 + i)));
  const ref = Math.max(...rh.map(L));
  const loud = ref - floor >= P.loud;
  const nb = (m) => Math.max(SILENT, ...[m - 1, m + 1].filter((q) => !allowed.has(q)).map(L));
  // Der 5. und 7. Teilton des Basses (Terz, Septime) können den einen
  // unterscheidenden Ton vortäuschen: Dm mit Bass D3 liefert ein leises F♯5 —
  // klingt das echte F5 schon aus, sähe es aus wie D. Klingt der Halbton
  // daneben mit, muss so ein Ton deshalb laut sein.
  const fromBass = new Set(bass.flatMap((b) => [5, 7].map((k) => Math.round(b + 12 * Math.log2(k)))));
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
  // Fremdtöne im Bereich rund um die Akkordtöne (für tiefe Lagen erweitert).
  const fLo = Math.min(P.foreignLo, Math.min(...rh) - 5), fHi = Math.max(P.foreignHi, Math.max(...rh) + 8);
  for (let m = fLo; m <= fHi; m++) {
    if (allowed.has(m)) continue;
    if (ringing.has(m) && !(since && since.rise[m - lo] >= P.rise)) continue;
    if (L(m) > ref - P.foreign || L(m) > weakest - P.foreignWeak
      || (peak && peak[m - lo] > peakRef - P.foreign)) foreign.push(m);
  }
  return { ok: loud && !missing.length && !foreign.length, loud, present: loud ? present : [], missing, foreign: loud ? foreign : [] };
}

/** Alle engen Lagen der rechten Hand: Grundstellung und Umkehrungen, tiefster
 *  Ton zwischen lo und hi (MIDI). Am → [57,60,64], [60,64,69], [64,69,72], …
 *  Die Lage aus chords.js ist darunter, wenn sie eng ist (alle :song-Lagen).
 *  Simulation (800 Ausklänge in Song-Lage, 1200 in vier anderen Lagen, Urteil
 *  bis 1 s nach dem Anschlag), checkChordAny gegen checkChord:
 *    andere Lagen  erkannt 98 % (nur RH) / 97 % (mit Bass) statt 30 % / 24 %,
 *                  Fehlgriffe 0,4 % / 3,8 %;
 *    Song-Lage     erkannt 100 % / 97,5 % wie bisher, Fehlgriffe nur RH 0,4 %
 *                  wie bisher, mit Bass 12 % statt 6 %: die Obertöne des
 *                  Basses ergänzen manchmal eine Nachbarlage (z. B. F2 liefert
 *                  C4, F4, A4). Gewollt: der Akkord zählt, nicht die Lage. */
export function voicings(chord, { lo = 50, hi = 76 } = {}) {
  const pcs = [...new Set(chord.rh.map((m) => ((m % 12) + 12) % 12))];
  const out = [];
  for (let b = lo; b <= hi; b++) {
    if (!pcs.includes(b % 12)) continue;
    const v = [b];
    for (const p of pcs) {
      if (p === b % 12) continue;
      let m = b + 1;
      while (m % 12 !== p) m++;
      v.push(m);
    }
    out.push(v.sort((x, y) => x - y));
  }
  const own = chord.rh.join();
  if (!out.some((v) => v.join() === own)) out.push([...chord.rh]);
  return out;
}

/** Liegt der Akkord — in irgendeiner engen Lage (voicings)? Geprüft wird
 *  jede Lage mit checkChord. Der Bass gilt in der Lage aus chords.js (eine
 *  Oktave tiefer erlaubt, ließ seine Obertöne Fehlgriffe zudecken).
 *  Als Nachklang geduldet wird nur der Vorakkord in seiner Lage aus chords.js
 *  — in allen Oktaven geduldet, ging jeder dritte Ganzton-Fehlgriff mit Bass
 *  als „klingt nur nach“ durch. Für Übungen, die genau eine Lage
 *  verlangen, checkChord direkt nehmen.
 *  → wie checkChord, dazu rh: die Lage, die passte (oder die mit den
 *  wenigsten fehlenden Tönen). */
export function checkChordAny(levels, since, chord, { prev = null, voiceLo = HEAR.voiceLo, ...opts } = {}) {
  let best = null;
  for (const rh of voicings(chord, { lo: voiceLo })) {
    const r = checkChord(levels, since, { ...chord, rh }, { ...opts, prev });
    if (r.ok) return { ...r, rh };
    if (!best || r.missing.length < best.missing.length) best = { ...r, rh };
  }
  return best;
}

