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
  // ANNAHME (Klavierlehrerin): F mit 1-3-5 statt 1-2-5 — Spanne A–F ist eine
  // Sexte; so bleibt Finger 3 der Mittelton und Finger 5 der obere in allen
  // Song-Akkorden, und kein Wechsel braucht einen Fingertausch auf dem C.
  { id: 'F:song', symbol: 'F', degree: 'VI', rh: [69, 72, 77], fingers: [1, 3, 5], lh: 41,
    tip: 'Daumen auf dem A, Finger 3 auf dem C, Finger 5 auf dem F.' },
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

/* ---------- Bewegungssätze (Geführt) ----------------------------------- */

const joinDe = (xs) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} und ${xs[xs.length - 1]}`);

/** „Daumen“, „Finger 3“, „Finger 3 und 5“, „Daumen und Finger 5“. */
function fingersDe(fs) {
  const others = fs.filter((f) => f !== 1);
  const rest = others.length ? `Finger ${joinDe(others.map(String))}` : '';
  if (!fs.includes(1)) return rest;
  if (!rest) return 'Daumen';
  return others.length > 1 ? `Daumen, ${rest}` : `Daumen und ${rest}`;
}

/** Wie kommt die rechte Hand von einem Akkord zum nächsten? Ein Satz, z. B.
 *  „Daumen bleibt auf dem A. Finger 3 und 5 rutschen hoch: aufs D und F♯.“
 *  Ohne fromId: der Tipp zum Griff selbst. */
export function moveText(fromId, toId) {
  const b = chordById(toId);
  if (!fromId) return b.tip;
  const a = chordById(fromId);
  if (fromId === toId) return 'Gleicher Griff – liegen lassen.';
  const t = transition(fromId, toId);
  const parts = [];
  if (t.stay.length) {
    const fs = t.stay.map((m) => a.fingers[a.rh.indexOf(m)]);
    parts.push(`${fingersDe(fs)} ${fs.length > 1 ? 'bleiben' : 'bleibt'} auf ${joinDe(t.stay.map((m) => `dem ${pitchClassName(m)}`))}.`);
  }
  if (t.moves.length) {
    const up = t.moves.every((m) => m.to > m.from), down = t.moves.every((m) => m.to < m.from);
    const fs = t.moves.map((m) => m.finger);
    if ((up || down) && t.moves.length === 3) {
      parts.push(`Die ganze Hand rutscht ${up ? 'hoch' : 'runter'}: aufs ${joinDe(t.moves.map((m) => pitchClassName(m.to)))}.`);
    } else if (up || down) {
      parts.push(`${fingersDe(fs)} ${fs.length > 1 ? 'rutschen' : 'rutscht'} ${up ? 'hoch' : 'runter'}: aufs ${joinDe(t.moves.map((m) => pitchClassName(m.to)))}.`);
    } else {
      parts.push(`${t.moves.map((m) => `${fingersDe([m.finger])} ${m.to > m.from ? 'hoch' : 'runter'} aufs ${pitchClassName(m.to)}`).join(', ')}.`);
    }
  }
  return parts.join(' ');
}

/** Bass-Hinweis: „Bass: hoch zum D“, „Bass: runter zum F“, „Bass: bleibt auf dem A“, „Bass: A“. */
export function bassText(fromId, toId) {
  const b = chordById(toId), n = pitchClassName(b.lh);
  if (!fromId) return `Bass: ${n}`;
  const a = chordById(fromId);
  if (a.lh === b.lh) return `Bass: bleibt auf dem ${n}`;
  return `Bass: ${b.lh > a.lh ? 'hoch' : 'runter'} zum ${n}`;
}

