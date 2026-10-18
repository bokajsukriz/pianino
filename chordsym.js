/* chordsym.js — REIN: Akkordsymbole lesen und aus Tasten benennen.
   Kein DOM, keine Zeit, kein Zufall.

   parseChord('F6/9/A') → { root: 5, rootName: 'F', quality: '6/9', bass: 9,
   bassName: 'A', pcs: [0, 2, 5, 7, 9] } — pcs sind die Tonstufen (0 = C),
   aufsteigend, mit Basston. Unbekannt → null (die App zeigt dann nur den
   Namen). In „F6/9“ ist der Schrägstrich Teil des Typs, kein Basston. */

const LETTER = Object.freeze({ C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11, H: 11 });

/** Akkordtypen: Intervalle über dem Grundton. Reihenfolge = wie gebräuchlich
 *  (für nameFromKeys). Aliasse zeigen auf denselben Typ.
 *  ANNAHME: Reihenfolge der Gebräuchlichkeit nach Pop-Begleitung geschätzt
 *  (Dur, Moll, Septakkorde, Sus, Sext-, add9-, dann seltenere). */
const QUALITIES = Object.freeze([
  ['', [0, 4, 7]],
  ['m', [0, 3, 7]],
  ['7', [0, 4, 7, 10]],
  ['m7', [0, 3, 7, 10]],
  ['maj7', [0, 4, 7, 11]],
  ['sus4', [0, 5, 7]],
  ['sus2', [0, 2, 7]],
  ['add9', [0, 2, 4, 7]],
  ['6', [0, 4, 7, 9]],
  ['m6', [0, 3, 7, 9]],
  ['6/9', [0, 2, 4, 7, 9]],
  ['madd9', [0, 2, 3, 7]],
  ['9', [0, 2, 4, 7, 10]],
  ['m9', [0, 2, 3, 7, 10]],
  ['maj9', [0, 2, 4, 7, 11]],
  ['7sus4', [0, 5, 7, 10]],
  ['m6/9', [0, 2, 3, 7, 9]],
  ['dim', [0, 3, 6]],
  ['m7b5', [0, 3, 6, 10]],
  ['dim7', [0, 3, 6, 9]],
  ['aug', [0, 4, 8]],
  ['5', [0, 7]],
].map(([q, iv]) => Object.freeze([q, Object.freeze(iv)])));

const ALIASES = Object.freeze({
  min: 'm', '-': 'm', M7: 'maj7', 'Δ7': 'maj7', 'Δ': 'maj7', sus: 'sus4', '+': 'aug', '°': 'dim',
  'm(add9)': 'madd9', 'add2': 'add9', '69': '6/9', 'm69': 'm6/9', 'ø': 'm7b5', 'ø7': 'm7b5', '°7': 'dim7',
});

const INTERVALS = new Map(QUALITIES);
/** Alle Schreibweisen, längste zuerst (damit „m7“ vor „m“ greift). */
const SPELLINGS = [...QUALITIES.map(([q]) => [q, q]), ...Object.entries(ALIASES)]
  .sort((a, b) => b[0].length - a[0].length);

/** Bevorzugte Schreibweise je Tonstufe (Pop: Kreuz außer E♭, A♭, B♭). */
export const PC_NAMES = Object.freeze(['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B']);

const pcOf = (n) => ((n % 12) + 12) % 12;

/** 'F#' → { pc: 6, len: 2 } am Anfang von s, sonst null. */
function readNote(s) {
  const m = /^([A-H])([#b♯♭]?)/.exec(s);
  if (!m) return null;
  let pc = LETTER[m[1]];
  if (m[2] === '#' || m[2] === '♯') pc += 1;
  if (m[2] === 'b' || m[2] === '♭') pc -= 1;
  return { pc: pcOf(pc), name: m[1].replace('H', 'B') + (m[2] ? (m[2] === '♯' ? '#' : m[2] === '♭' ? 'b' : m[2]) : ''), len: m[0].length };
}

/** Tonname allein ('F#', 'Bb', 'H') → Tonstufe oder null. */
export function parseNote(s) {
  const n = readNote(String(s ?? '').trim());
  return n && n.len === String(s).trim().length ? n.pc : null;
}

/** Akkordsymbol lesen. → { root, rootName, quality, bass, bassName, pcs } oder null. */
export function parseChord(symbol) {
  if (typeof symbol !== 'string') return null;
  const s = symbol.trim();
  const r = readNote(s);
  if (!r) return null;
  const rest = s.slice(r.len);
  for (const [spell, q] of SPELLINGS) {
    if (!rest.startsWith(spell)) continue;
    const tail = rest.slice(spell.length);
    let bass = null, bassName = null;
    if (tail) {
      if (tail[0] !== '/') continue;
      const b = readNote(tail.slice(1));
      if (!b || b.len !== tail.length - 1) continue;
      bass = b.pc; bassName = b.name;
    }
    const pcs = new Set(INTERVALS.get(q).map((iv) => pcOf(r.pc + iv)));
    if (bass !== null) pcs.add(bass);
    return { root: r.pc, rootName: r.name, quality: q, bass, bassName, pcs: [...pcs].sort((a, b) => a - b) };
  }
  return null;
}

/** Intervalle eines Akkordtyps über dem Grundton (Kopie) oder null. */
export function qualityIntervals(quality) {
  const iv = INTERVALS.get(quality);
  return iv ? [...iv] : null;
}

/** Bedeuten zwei Symbole denselben Akkord? ('D/F#' = 'D/Gb', 'Am' = 'Amin') */
export function sameChord(a, b) {
  const x = parseChord(a), y = parseChord(b);
  if (!x || !y) return a === b;
  return x.root === y.root && x.quality === y.quality && x.bass === y.bass;
}

/** Anzeige: '#' → '♯', 'b' nach einem Tonbuchstaben → '♭'. */
export function prettyChord(symbol) {
  return String(symbol ?? '').replace(/#/g, '♯').replace(/([A-H])b/g, '$1♭');
}

/** Welche Akkorde passen zu diesen Tasten? Basston = tiefster Ton.
 *  Ein Akkord passt, wenn die Tonstufen der Tasten genau seine sind — die
 *  Quinte darf fehlen (Begleitungen lassen sie oft weg). Liegt der tiefste
 *  Ton nicht auf dem Grundton, wird es ein Slash-Akkord.
 *  ANNAHME: Reihenfolge — vollständig vor „ohne Quinte“, Grundton im Bass vor
 *  Slash-Akkord, dann gebräuchlicher Typ (QUALITIES), dann weniger Töne.
 *  → ['Am', 'C6/A', …] (Kreuz-Schreibweise nach PC_NAMES) */
export function nameFromKeys(midiNotes) {
  const notes = [...new Set((midiNotes || []).filter(Number.isFinite))];
  if (!notes.length) return [];
  const bassPc = pcOf(Math.min(...notes));
  const have = new Set(notes.map(pcOf));
  const out = [];
  QUALITIES.forEach(([q, iv], qi) => {
    if (iv.length < 3 && have.size > iv.length) return; // Powerchord nur für zwei Töne
    for (let root = 0; root < 12; root++) {
      const pcs = iv.map((x) => pcOf(root + x));
      const fifth = iv.includes(7) && iv.length > 3 ? pcOf(root + 7) : null;
      const fifthTri = iv.includes(7) && iv.length === 3 ? pcOf(root + 7) : null;
      const covers = [...have].every((p) => pcs.includes(p));
      if (!covers) continue;
      const missing = pcs.filter((p) => !have.has(p));
      let full;
      if (!missing.length) full = 0;
      else if (missing.length === 1 && (missing[0] === fifth || missing[0] === fifthTri) && have.has(root)) full = 1;
      else continue;
      // Ohne Quinte wird ein Dreiklang zum Zweiklang: nur, wenn Terz und Grundton da sind.
      if (full && have.size < 2) continue;
      const slash = bassPc !== root;
      const name = PC_NAMES[root] + q + (slash ? `/${PC_NAMES[bassPc]}` : '');
      out.push({ name, rank: [full, slash ? 1 : 0, qi, pcs.length] });
    }
  });
  out.sort((a, b) => {
    for (let i = 0; i < a.rank.length; i++) if (a.rank[i] !== b.rank[i]) return a.rank[i] - b.rank[i];
    return 0;
  });
  return [...new Set(out.map((x) => x.name))];
}
