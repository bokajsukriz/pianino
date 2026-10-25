/* shapes.js — REIN: Übung „Voicings“. Eine Griff-Form wie „3158“ (Stufen
   von unten nach oben: Terz, Grundton, Quinte, Oktave) durch eine
   Progression aus fünf Akkorden in einer Tonart.
   Kein DOM, keine Zeit, kein Zufall. MIDI 60 = C4.

   shapeRound(['C', 'Am', …], '3158', { split: 2 })[0].grip → { lh: [52, 60], rh: [67, 72], … }
   im Griff-Format von voicing.js: jeder Ton liegt über dem vorigen, der
   tiefste in BASS_LO…BASS_HI, die Lagen so, dass die Hände so wenig wie
   möglich wandern. */

import { parseChord } from './chordsym.js';

/** Stufen, die eine Form enthalten darf. 8 = Grundton eine Oktave höher. */
export const DEGREES = Object.freeze([1, 3, 5, 7, 8]);
/** Tiefster Ton der Form (Basston der linken Hand): C3–H3.
 *  ANNAHME: wie im Unterricht, E3 C4 G4 C5 für C — darunter wird es mit der
 *  Terz im Bass schnell matschig, darüber fehlt das Fundament. Und darunter
 *  hört das Handy-Mikrofon den Bass kaum noch (Simulation: G mit H2 nur in
 *  19 von 33 Fällen erkannt); dafür springt ein Wechsel auch mal um eine
 *  Sexte. */
export const BASS_LO = 48, BASS_HI = 59;
/** Erster Akkord: Basston möglichst nah an E3. */
const BASS_START = 52;

/** Die Formen der Übung. Links spielt die App die tiefsten `split` Töne
 *  (Voreinstellung 2: Terz und Grundton); das Mikrofon hört die Hände nicht. */
export const SHAPES = Object.freeze([
  Object.freeze({ id: '3158', name: '3 – 1 – 5 – 8', text: 'Terz unten, darüber Grundton, Quinte, Oktave' }),
]);

/** Progressionen aus fünf Akkorden: Stufen als [Halbtöne über der Tonika, Typ].
 *  ANNAHME: gängige Pop-Folgen. */
export const PROGRESSIONS = Object.freeze([
  { id: 'p1', roman: 'I – vi – IV – V – I', steps: [[0, ''], [9, 'm'], [5, ''], [7, ''], [0, '']] },
  { id: 'p2', roman: 'I – V – vi – IV – I', steps: [[0, ''], [7, ''], [9, 'm'], [5, ''], [0, '']] },
  { id: 'p3', roman: 'vi – IV – I – V – vi', steps: [[9, 'm'], [5, ''], [0, ''], [7, ''], [9, 'm']] },
  { id: 'p4', roman: 'I – vi – ii – V – I', steps: [[0, ''], [9, 'm'], [2, 'm'], [7, ''], [0, '']] },
  { id: 'p5', roman: 'I – iii – vi – IV – I', steps: [[0, ''], [4, 'm'], [9, 'm'], [5, ''], [0, '']] },
  { id: 'p6', roman: 'vi – ii – V – I – vi', steps: [[9, 'm'], [2, 'm'], [7, ''], [0, ''], [9, 'm']] },
].map((p) => Object.freeze({ ...p, steps: Object.freeze(p.steps.map((s) => Object.freeze(s))) })));

/** Alle Tonarten der Übung. */
export const KEYS = Object.freeze(['C', 'G', 'F', 'D', 'Bb', 'A', 'Eb', 'E', 'Ab']);
const KEY_PC = Object.freeze({ C: 0, G: 7, F: 5, D: 2, Bb: 10, A: 9, Eb: 3, E: 4, Ab: 8 });
const SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const FLAT = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
const FLAT_KEYS = new Set(['F', 'Bb', 'Eb', 'Ab']);

/** Stufen: welche Progressionen und Tonarten in Frage kommen.
 *  ANNAHME (Rat der Klavierpädagogik): leicht = die zwei häufigsten
 *  Pop-Folgen in Tonarten mit höchstens einem Vorzeichen; mittel = dazu
 *  Moll-Start und ii, bis zwei Vorzeichen; schwer = die weniger gewohnten
 *  Folgen (iii, Quintfall ab vi) und alle Tonarten bis vier Vorzeichen. */
export const LEVELS = Object.freeze({
  1: Object.freeze({ progs: Object.freeze(['p1', 'p2']), keys: Object.freeze(['C', 'G', 'F']) }),
  2: Object.freeze({ progs: Object.freeze(['p1', 'p2', 'p3', 'p4']), keys: Object.freeze(['C', 'G', 'F', 'D', 'Bb']) }),
  3: Object.freeze({ progs: Object.freeze(['p3', 'p4', 'p5', 'p6']), keys: KEYS }),
});

/** Zufällige Runde einer Stufe → { prog, key }; nach Möglichkeit nicht
 *  dieselbe wie `last`. rand: () => [0, 1). */
export function pickRound(level, rand, last = null) {
  const lv = LEVELS[level] || LEVELS[1];
  const all = lv.progs.flatMap((prog) => lv.keys.map((key) => ({ prog, key })));
  const pool = all.filter((x) => !last || x.prog !== last.prog || x.key !== last.key);
  const list = pool.length ? pool : all;
  return list[Math.min(list.length - 1, Math.floor(rand() * list.length))];
}

const pcOf = (x) => ((x % 12) + 12) % 12;

/** '3158' → [3, 1, 5, 8] oder null (unbekannte Stufe, leer, doppelt). */
export function parseShape(s) {
  const d = String(s ?? '').replace(/[^0-9]/g, '').split('').map(Number);
  if (!d.length || d.some((x) => !DEGREES.includes(x)) || new Set(d).size !== d.length) return null;
  return d;
}

/** Akkorde einer Progression in einer Tonart → ['C', 'Am', 'F', 'G', 'C'].
 *  Kreuz- oder B-Schreibweise nach Tonart. */
export function progressionChords(progId, key) {
  const p = PROGRESSIONS.find((x) => x.id === progId);
  if (!p || !(key in KEY_PC)) return [];
  const names = FLAT_KEYS.has(key) ? FLAT : SHARP;
  return p.steps.map(([iv, q]) => names[pcOf(KEY_PC[key] + iv)] + q);
}

/** Halbtöne einer Stufe über dem Grundton (ivs: Intervalle des Akkordtyps).
 *  3: die Terz des Typs (sus: der Vorhalt), 5: seine Quinte, 7: seine
 *  Septime (ohne: Oktave). → Zahl oder null */
function degreeInterval(deg, ivs) {
  if (deg === 1 || deg === 8) return 0;
  if (deg === 3) return ivs.find((x) => x >= 2 && x <= 5) ?? null;
  if (deg === 5) return ivs.find((x) => x >= 6 && x <= 8) ?? null;
  if (deg === 7) return ivs.find((x) => x >= 9 && x <= 11) ?? 0;
  return null;
}

/** Tonstufen der Form für einen Akkord, von unten → [pc] oder null. */
export function shapePcs(symbol, shape) {
  const c = parseChord(symbol), d = parseShape(shape);
  if (!c || !d) return null;
  const ivs = c.pcs.map((p) => pcOf(p - c.root)).sort((a, b) => a - b);
  const out = d.map((deg) => degreeInterval(deg, ivs));
  return out.some((x) => x === null) ? null : out.map((iv) => pcOf(c.root + iv));
}

/** Tasten der Form mit Basston `bass` (MIDI): jeder Ton der nächste mit
 *  seiner Tonstufe über dem vorigen. */
function stack(bass, pcs) {
  const out = [bass];
  for (const p of pcs.slice(1)) {
    let m = out[out.length - 1] + 1;
    while (pcOf(m) !== p) m++;
    out.push(m);
  }
  return out;
}

/** Bewegung zwischen zwei gleich langen Tastenfolgen (Summe der Abstände). */
const motion = (a, b) => a.reduce((s, m, i) => s + Math.abs(m - b[i]), 0);

/** Alle Lagen der Form für `symbol` (Basston in BASS_LO…BASS_HI),
 *  je aufsteigend → [[midi]] (leer, wenn die Form nicht passt). */
export function shapeKeys(symbol, shape) {
  const pcs = shapePcs(symbol, shape);
  if (!pcs) return [];
  const out = [];
  for (let b = BASS_LO; b <= BASS_HI; b++) if (pcOf(b) === pcs[0]) out.push(stack(b, pcs));
  return out;
}

/** Griff (voicing.js-Format) aus Tasten: die tiefsten `split` links. */
export function splitKeys(keys, split = 2) {
  const n = Math.max(0, Math.min(keys.length - 1, split));
  const lh = keys.slice(0, n), rh = keys.slice(n);
  return { rh, rhFingers: rh.map(() => null), lh, lhFingers: lh.map(() => null), note: '' };
}

/** Ganze Runde: je Akkord { symbol, grip, degrees: [Stufe je Taste] }.
 *  Die Lagen so, dass die Hände insgesamt am wenigsten wandern — auch vom
 *  letzten Akkord zurück zum ersten, denn die Runde wiederholt sich. Ein
 *  Akkord, der wieder kommt, liegt wieder gleich. Bei Gleichstand der
 *  erste Basston näher an E3. Je Akkord gibt es höchstens zwei Lagen, also
 *  probiert es alle Kombinationen durch (≤ 2⁵). */
export function shapeRound(chords, shape, { split = 2 } = {}) {
  const d = parseShape(shape);
  const symbols = [...new Set(chords)];
  const opts = symbols.map((c) => shapeKeys(c, shape));
  if (!chords.length || opts.some((o) => !o.length)) return null;
  let best = null, bestCost = Infinity;
  const pick = new Array(symbols.length).fill(0);
  for (;;) {
    const keys = chords.map((c) => opts[symbols.indexOf(c)][pick[symbols.indexOf(c)]]);
    let cost = 0;
    for (let i = 0; i < keys.length; i++) cost += motion(keys[i], keys[(i + 1) % keys.length]);
    cost = cost * 100 + Math.abs(keys[0][0] - BASS_START);
    if (cost < bestCost) { best = keys; bestCost = cost; }
    let i = 0;
    while (i < pick.length && ++pick[i] >= opts[i].length) pick[i++] = 0;
    if (i === pick.length) break;
  }
  return chords.map((symbol, i) => ({ symbol, grip: splitKeys(best[i], split), degrees: d }));
}

/** Ziel für den Erkenner ({ name, rh, lh, pcs } wie voicing.js hearTarget):
 *  alle Töne der Form aufsteigend in rh, für hear.js checkTones (mic.js
 *  `loose`) — durchlässig, es zählen vor allem falsche Töne. */
export function shapeTarget(step) {
  const all = [...step.grip.lh, ...step.grip.rh].sort((a, b) => a - b);
  return { name: step.symbol, rh: all, lh: [], pcs: [...new Set(all.map(pcOf))].sort((a, b) => a - b) };
}
