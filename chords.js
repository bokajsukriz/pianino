/* chords.js — REIN: Akkord-Bibliothek (Arbeitsanweisung 6.2).
   Kein DOM, keine Zeit, kein Zufall. MIDI 60 = C4 (eingestrichenes c).
   Fingersätze sind Vorschläge und lassen sich hier ändern. */

const NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];

/** Tonname mit Oktave, Kreuz als ♯: 66 → 'F♯4'. */
export function noteName(midi) {
  return NAMES[((midi % 12) + 12) % 12] + (Math.floor(midi / 12) - 1);
}

/** Tonname ohne Oktave: 66 → 'F♯'. */
export function pitchClassName(midi) {
  return NAMES[((midi % 12) + 12) % 12];
}

export const CHORDS = Object.freeze([
  { id: 'Am:root', symbol: 'Am', degree: 'i', rh: [57, 60, 64], fingers: [1, 3, 5], lh: 45,
    tip: 'A, C, E: drei weiße Tasten, je eine überspringen.' },
  { id: 'F:root', symbol: 'F', degree: 'VI', rh: [53, 57, 60], fingers: [1, 3, 5], lh: 41,
    tip: 'F, A, C: drei weiße Tasten, je eine überspringen.' },
  { id: 'C:root', symbol: 'C', degree: 'III', rh: [48, 52, 55], fingers: [1, 3, 5], lh: 36,
    tip: 'C, E, G: drei weiße Tasten, je eine überspringen.' },
  { id: 'Dm:root', symbol: 'Dm', degree: 'iv', rh: [50, 53, 57], fingers: [1, 3, 5], lh: 38,
    tip: 'D, F, A: drei weiße Tasten, je eine überspringen.' },
  { id: 'D:root', symbol: 'D', degree: 'IV', rh: [50, 54, 57], fingers: [1, 3, 5], lh: 38,
    tip: 'Wie Dm, nur F♯ statt F: der Mittelfinger auf die schwarze Taste.' },
  { id: 'Am:song', symbol: 'Am', degree: 'i', rh: [69, 72, 76], fingers: [1, 3, 5], lh: 45,
    tip: 'Daumen auf dem A, darüber C und E.' },
  { id: 'D:song', symbol: 'D', degree: 'IV', rh: [69, 74, 78], fingers: [1, 3, 5], lh: 50,
    tip: 'Daumen bleibt auf dem A, darüber D und F♯ (schwarz).' },
  { id: 'F:song', symbol: 'F', degree: 'VI', rh: [69, 72, 77], fingers: [1, 2, 5], lh: 41,
    tip: 'Daumen auf dem A, Zeigefinger auf dem C, kleiner Finger auf dem F.' },
  { id: 'Dm:song', symbol: 'Dm', degree: 'iv', rh: [69, 74, 77], fingers: [1, 3, 5], lh: 50,
    tip: 'Daumen bleibt auf dem A, darüber D und F.' },
  { id: 'C:song', symbol: 'C', degree: 'III', rh: [67, 72, 76], fingers: [1, 3, 5], lh: 48,
    tip: 'Der Daumen rutscht vom A aufs G, darüber C und E.' },
].map((c) => Object.freeze({ ...c, rh: Object.freeze(c.rh), fingers: Object.freeze(c.fingers) })));

const BY_ID = new Map(CHORDS.map((c) => [c.id, c]));

/** Akkord nach id oder undefined. */
export function chordById(id) {
  return BY_ID.get(id);
}

/** Song-Voicing zu einem Symbol: 'F' → F:song. */
export function songChord(symbol) {
  return BY_ID.get(`${symbol}:song`);
}

/** Alle Töne eines Akkords (LH zuerst), z. B. zum Vorspielen. */
export function chordNotes(chord) {
  return [chord.lh, ...chord.rh];
}

/** Tonnamen eines Akkords: { rh: ['A3', 'C4', 'E4'], lh: 'A2' }. */
export function chordNoteNames(chord) {
  return { rh: chord.rh.map(noteName), lh: noteName(chord.lh) };
}

/** Übergang der rechten Hand von einem Akkord zum nächsten.
 *  Gleiche MIDI-Töne bleiben liegen (stay). Die übrigen Töne werden nach
 *  Fingerposition einander zugeordnet: von unten nach oben der Reihe nach.
 *  finger = Fingersatz des Zieltons im Zielakkord.
 *  → { stay: [midi…], moves: [{ from, to, finger }] } */
export function transition(fromId, toId) {
  const a = chordById(fromId), b = chordById(toId);
  if (!a || !b) throw new Error(`Unbekannter Akkord: ${!a ? fromId : toId}`);
  const stay = a.rh.filter((m) => b.rh.includes(m));
  const from = a.rh.filter((m) => !stay.includes(m)); // aufsteigend, weil rh aufsteigend
  const to = b.rh.filter((m) => !stay.includes(m));
  const moves = [];
  for (let i = 0; i < Math.min(from.length, to.length); i++) {
    moves.push({ from: from[i], to: to[i], finger: b.fingers[b.rh.indexOf(to[i])] });
  }
  return { stay, moves };
}

/** Finger eines Tons im Akkord (rechte Hand) oder null. */
export function fingerFor(chord, midi) {
  const i = chord.rh.indexOf(midi);
  return i < 0 ? null : chord.fingers[i];
}

/** Schwarze Taste? */
export function isBlack(midi) {
  return [1, 3, 6, 8, 10].includes(((midi % 12) + 12) % 12);
}
