/* chords.js — REIN: feste Akkorde, Tonnamen und Bewegungssätze.
   Kein DOM, keine Zeit, kein Zufall. MIDI 60 = C4 (eingestrichenes c).

   Die festen :root-Griffe sind die Karten des Akkord-Blitz (Stufen 1–2).
   Die :song-Griffe der alten Version stimmen nicht mit dem Unterricht
   überein; sie dienen nur noch den Selbsttests und der Simulation der
   Erkenner (docs/archiv/mikro-sim/). Die Griffe eines Songs stehen im Song
   (voicing.js: voicingFor). moveText, bassText und transition arbeiten mit
   Griff-Objekten (voicing.js). */

import { voicingDiff, handStill } from './voicing.js';

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

/** Tonnamen eines Griffs: { rh: ['A3', 'C4', 'E4'], lh: ['A2', 'E3'] }. */
export function gripNoteNames(v) {
  return { rh: (v?.rh || []).map(noteName), lh: (v?.lh || []).map(noteName) };
}

/** Fester Akkord aus CHORDS als Griff-Objekt (voicing.js).
 *  ANNAHME: Der Basston der linken Hand wird mit dem kleinen Finger (5) gespielt. */
export function gripOf(chord) {
  return { rh: [...chord.rh], rhFingers: [...chord.fingers], lh: [chord.lh], lhFingers: [5] };
}

/** Übergang der rechten Hand von einem Griff zum nächsten (voicingDiff).
 *  → { stay: [midi…], moves: [{ from, to, finger }], release: [midi…], add: [midi…] } */
export function transition(prev, next) {
  const d = voicingDiff(prev, next).rh;
  return {
    stay: d.keep.map((x) => x.key),
    moves: d.move.map((m) => ({ from: m.from, to: m.to, finger: m.finger })),
    release: d.release.map((x) => x.key),
    add: d.add.map((x) => x.key),
  };
}

/** Schwarze Taste? */
export function isBlack(midi) {
  return [1, 3, 6, 8, 10].includes(((midi % 12) + 12) % 12);
}

/* ---------- Bewegungssätze (Geführt, Kurze Wege, Griff-Editor) ------- */

const joinDe = (xs) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} und ${xs[xs.length - 1]}`);
const fingerDe = (f) => (f === 1 ? 'Daumen' : String(f));
const pcn = (m) => pitchClassName(m);
const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);

/** Satz für eine Hand aus voicingDiff, z. B. „Daumen bleibt auf A. C und E
 *  loslassen, 3 auf D.“ oder „Daumen bleibt auf A, 2 auf C und 5 auf G
 *  dazu.“ Ohne Fingersätze nur Töne: „A bleibt. C loslassen, D dazu.“ */
function handText(d) {
  if (handStill(d)) return 'bleibt liegen.';
  let keep = '';
  if (d.keep.length) {
    const many = d.keep.length > 1;
    keep = d.keep.every((x) => x.finger)
      ? `${joinDe(d.keep.map((x) => fingerDe(x.finger)))} ${many ? 'bleiben' : 'bleibt'} auf ${joinDe(d.keep.map((x) => pcn(x.key)))}`
      : `${joinDe(d.keep.map((x) => pcn(x.key)))} ${many ? 'bleiben' : 'bleibt'}`;
  }
  const rel = d.release.length ? `${joinDe(d.release.map((x) => pcn(x.key)))} loslassen` : '';
  const addPlain = d.add.some((x) => !x.finger);
  const add = d.add.length ? joinDe(d.add.map((x) => (x.finger && !addPlain ? `${fingerDe(x.finger)} auf ${pcn(x.key)}` : pcn(x.key)))) : '';
  let mv = '';
  if (d.move.length) {
    const up = d.move.every((m) => m.semis > 0), down = d.move.every((m) => m.semis < 0);
    const alone = !d.keep.length && !d.add.length && !d.release.length;
    if (alone && (up || down) && d.move.every((m) => Math.abs(m.semis) <= 2)) mv = `eine Stufe ${up ? 'höher' : 'tiefer'}`;
    else if (alone && d.move.every((m) => m.semis === d.move[0].semis && Math.abs(m.semis) === 12)) mv = `eine Oktave ${up ? 'höher' : 'tiefer'}`;
    else mv = d.move.map((m) => `${fingerDe(m.finger)} von ${pcn(m.from)} auf ${pcn(m.to)}`).join(', ');
  }
  if (rel) {
    const rest = [rel, add && (addPlain ? `${add} dazu` : add), mv].filter(Boolean).join(', ');
    return keep ? `${cap(keep)}. ${cap(rest)}.` : `${cap(rest)}.`;
  }
  const rest = [add && `${add} dazu`, mv].filter(Boolean).join(', ');
  // „eine Stufe tiefer.“ bleibt klein (steht hinter „Links:“).
  return (keep || add ? cap([keep, rest].filter(Boolean).join(', ')) : rest) + '.';
}

/** Kurze Beschreibung eines Griffs (ohne Vorgänger): die Notiz, sonst die Töne. */
export function gripText(v) {
  if (!v) return '';
  if (v.note) return v.note;
  const part = (keys, fs) => keys.map((m, i) => (fs?.[i] ? `${pcn(m)} (${fs[i]})` : pcn(m))).join(' ');
  const out = [];
  if (v.rh?.length) out.push(`Rechts ${part(v.rh, v.rhFingers)}`);
  if (v.lh?.length) out.push(`links ${part(v.lh, v.lhFingers)}`);
  return `${cap(out.join(', '))}.`;
}

/** Wie kommen die Hände von einem Griff zum nächsten? Aus voicingDiff, z. B.
 *  „Rechts: Daumen bleibt auf A, 2 auf C und 5 auf G dazu. Links: eine Stufe
 *  tiefer.“ Ändert sich nur rechts, ohne „Rechts:“. lh: false → nur rechts.
 *  Ohne Vorgänger: der Griff selbst (gripText). */
export function moveText(prev, next, { lh = true } = {}) {
  if (!next) return '';
  if (!prev) return gripText(next);
  const d = voicingDiff(prev, next);
  const rStill = handStill(d.rh), lStill = !lh || handStill(d.lh);
  if (rStill && lStill) return 'Gleicher Griff – liegen lassen.';
  if (lStill) return handText(d.rh);
  if (rStill) return `Links: ${handText(d.lh)}`;
  return `Rechts: ${handText(d.rh)} Links: ${handText(d.lh)}`;
}

const bassOf = (v) => (v?.lh?.length ? Math.min(...v.lh) : null);

/** Bass-Hinweis: „Bass: hoch zum D“, „Bass: runter zum F“, „Bass: bleibt auf
 *  dem A“, „Bass: A“ (tiefster Ton der linken Hand). Ohne linke Hand: ''. */
export function bassText(prev, next) {
  const b = bassOf(next);
  if (b === null) return '';
  const n = pcn(b);
  const a = bassOf(prev);
  if (a === null) return `Bass: ${n}`;
  if (a === b) return `Bass: bleibt auf dem ${n}`;
  return `Bass: ${b > a ? 'hoch' : 'runter'} zum ${n}`;
}
