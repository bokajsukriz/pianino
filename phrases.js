/* phrases.js — REIN: „Geführt“ — der Song in Phrasen, am Stück gelernt.
   Kein DOM, kein Date.now(), kein Math.random().

   Ablauf je Phrase (didaktisch nach Rücksprache mit einer Klavierlehrerin):
     Warten  Die App zeigt den Akkord und geht weiter, sobald er liegt (Mikrofon).
             Kein Tempo. Gemessen wird die Wechselzeit je Übergang.
             3× hintereinander sauber (jeder Wechsel ≤ 1 Schlag bei 50 BPM)
             → Tempo. Schon der allererste Durchgang sauber → sofort Tempo
             (wer die Akkorde kann, übt sie nicht noch einmal einzeln).
     Tempo   Klick, ein Akkord pro Takt. Fehler stoppen nicht; danach wird
             der Übergang, der hakte, kurz im Warten-Modus gependelt.
             Sauber → schneller (+4, beim ersten Fehlerlosen gleich, sonst
             nach 2), 2× mit mehr als einem Fehler → −5, unter 44 BPM zurück
             ins Warten. Sauber bei ≥ 60 BPM → die Phrase sitzt, die nächste
             wird frei.

   Zustand je Phrase (Datensatz phrase:<id>):
   { id, mode: 'wait' | 'tempo', bpm, streak, bad, solid, passes,
     tempoErrors, lastPlayed } */

import { songForm } from './song-perfect-ruin.js';
import { daysBetween } from './dates.js';

export const GUIDE = Object.freeze({
  minBpm: 44, startMax: 56, target: 60, top: 76, up: 4, down: 5,
  changeBpm: 50,      // Maßstab für „sauber“ im Warten-Modus: 1 Schlag bei 50 BPM
  cleanToTempo: 3,
  cleanToUp: 2,
  badToDown: 2,
  maxPasses: 8,       // je Phrase und Sitzung, dann Wechsel
  hintAfter: 4,       // s im Warten-Modus, dann Tastenbild
  playAfter: 8,       // s, dann klingt der Akkord
  reviewDays: 2,      // sitzende Phrase nach so vielen Tagen kurz wiederholen
  repairChanges: 4, repairSeconds: 30,
});

/** Phrasen in Lernreihenfolge. Jede wird erst frei, wenn die davor sitzt.
 *  ANNAHME: Zeilen und Refrain wie in song-perfect-ruin.js (unverifiziert). */
export function phraseDefs(song) {
  const v = song.verse;
  return [
    { id: 'z1', name: 'Zeile 1', chords: v.slice(0, 4), tip: 'Daumen bleibt auf dem A.' },
    { id: 'z4', name: 'Zeile 4', chords: v.slice(12, 16), tip: 'Wie Zeile 1, nur ohne schwarze Taste.' },
    { id: 'z3', name: 'Zeile 3', chords: v.slice(8, 12), tip: 'Bei C rutscht die ganze Hand eine Taste tiefer.' },
    { id: 'ref', name: 'Refrain', chords: [...song.chorus], tip: 'Nur drei Akkorde, im Kreis.' },
    { id: 'strophe', name: 'Strophe', chords: [...v], once: true, tip: 'Vier Zeilen am Stück.' },
    { id: 'form', name: 'Ganzer Song', chords: songForm(song), once: true, tip: 'Strophe, Refrain, Schluss.' },
  ];
}

export function newPhrase(id) {
  return { id, mode: 'wait', bpm: null, streak: 0, bad: 0, solid: false, passes: 0, tempoErrors: 0, lastPlayed: null };
}

const st = (states, id) => states[id] || newPhrase(id);

/** Frei = alle Phrasen davor sitzen. */
export function unlocked(defs, states) {
  const out = [];
  for (const d of defs) {
    out.push(d.id);
    if (!st(states, d.id).solid) break;
  }
  return out;
}

/** Akkordfolge im Warten-Modus: gleiche Nachbarn zusammengefasst (Warten
 *  kennt keinen Rhythmus), bei Loop-Phrasen am Ende zurück zum Anfang (übt
 *  die Naht mit). continued: der erste Akkord liegt schon (vorheriger
 *  Durchgang endete darauf) → weglassen. */
export function waitSequence(def, { continued = false } = {}) {
  const seq = def.chords.filter((c, i) => i === 0 || c !== def.chords[i - 1]);
  if (!def.once && seq.length > 1 && seq[seq.length - 1] !== seq[0]) seq.push(seq[0]);
  return continued ? seq.slice(1) : seq;
}

/** Takte im Tempo-Modus: 4-Takt-Phrasen zweimal, sonst einmal. */
export function tempoBars(def) {
  return def.chords.length <= 4 && !def.once ? [...def.chords, ...def.chords] : [...def.chords];
}

/** Sekunden je Schlag. */
export const beatSec = (bpm) => 60 / bpm;

/** Startempo aus den Wechselzeiten: langsamster Wechsel = 1 Schlag. */
export function startBpm(changes) {
  const slow = Math.max(0.01, ...changes.map((c) => c.sec));
  return Math.max(GUIDE.minBpm, Math.min(GUIDE.startMax, Math.floor(60 / slow)));
}

/** Warten-Durchgang anwenden. changes: [{ from, to, sec }], helped: es
 *  wurde getippt oder der Akkord vorgespielt. → { state, clean, toTempo } */
export function applyWait(state, { changes, helped = false, today }) {
  const s = { ...state, passes: (state.passes || 0) + 1, lastPlayed: today };
  const clean = !helped && changes.length > 0 && changes.every((c) => c.sec <= beatSec(GUIDE.changeBpm));
  s.streak = clean ? (state.streak || 0) + 1 : 0;
  const first = !(state.passes > 0);
  const toTempo = clean && (first || s.streak >= GUIDE.cleanToTempo);
  if (toTempo) {
    s.mode = 'tempo';
    s.bpm = state.bpm ? Math.max(GUIDE.minBpm, Math.min(state.bpm, startBpm(changes))) : startBpm(changes);
    s.streak = 0; s.bad = 0;
  }
  return { state: s, clean, toTempo };
}

/** Tempo-Durchgang anwenden. errors: Takte ohne erkannten Akkord.
 *  → { state, clean, up, down, toWait, nowSolid } */
export function applyTempo(state, { errors, today }) {
  const s = { ...state, passes: (state.passes || 0) + 1, lastPlayed: today };
  const out = { clean: errors === 0, up: false, down: false, toWait: false, nowSolid: false };
  if (errors === 0) {
    s.bad = 0;
    s.streak = (state.streak || 0) + 1;
    if (state.bpm >= GUIDE.target && !state.solid) { s.solid = true; out.nowSolid = true; }
    // Schnellspur: solange in dieser Phrase noch nie ein Fehler war, jeder
    // saubere Durchgang ein Schritt.
    const need = state.tempoErrors ? GUIDE.cleanToUp : 1;
    if (s.streak >= need && state.bpm < GUIDE.top) {
      s.bpm = Math.min(GUIDE.top, state.bpm + GUIDE.up);
      s.streak = 0;
      out.up = true;
    }
  } else {
    s.tempoErrors = (state.tempoErrors || 0) + 1;
    s.streak = 0;
    if (errors > 1) {
      s.bad = (state.bad || 0) + 1;
      if (s.bad >= GUIDE.badToDown) {
        s.bad = 0;
        if (state.bpm - GUIDE.down < GUIDE.minBpm) { s.mode = 'wait'; out.toWait = true; } else { s.bpm = state.bpm - GUIDE.down; out.down = true; }
      }
    }
  }
  return { state: s, ...out };
}

/** Übergänge, an denen es hakte: Takt i nicht erkannt → (Akkord davor → Akkord i).
 *  Gleiche Paare zusammengefasst, das häufigste zuerst. Ein verpasster Takt
 *  mit demselben Akkord wie davor zählt nicht als Übergang. */
export function repairPairs(bars, missed) {
  const count = new Map();
  for (const i of missed) {
    if (i <= 0 || bars[i] === bars[i - 1]) continue;
    const k = `${bars[i - 1]}>${bars[i]}`;
    count.set(k, (count.get(k) || 0) + 1);
  }
  return [...count.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k.split('>'));
}

/** Welche Phrase als Nächstes?
 *  1. Zu Beginn einer Sitzung: eine sitzende Phrase, die ≥ 2 Tage nicht
 *     dran war, einmal im Tempo (kurze Wiederholung statt Aufwärmen).
 *  2. Sonst die erste freie, die noch nicht sitzt — höchstens 8 Durchgänge
 *     je Sitzung, dann eine andere.
 *  3. Sitzt alles: der ganze Song bzw. die am längsten nicht gespielte.
 *  → { id, review } */
export function nextPhrase(defs, states, { today, roundPasses = {} }) {
  const free = unlocked(defs, states);
  const fresh = Object.keys(roundPasses).length === 0;
  if (fresh) {
    const due = free.filter((id) => {
      const s = st(states, id);
      return s.solid && s.lastPlayed && daysBetween(s.lastPlayed, today) >= GUIDE.reviewDays;
    }).sort((a, b) => (st(states, a).lastPlayed < st(states, b).lastPlayed ? -1 : 1));
    if (due.length) return { id: due[0], review: true };
  }
  const open = free.filter((id) => !st(states, id).solid);
  const focus = open.find((id) => (roundPasses[id] || 0) < GUIDE.maxPasses);
  if (focus) return { id: focus, review: false };
  // Alles sitzt oder die offenen sind für heute durch: die am seltensten
  // gespielte freie Phrase, bei Gleichstand die späteste in der Reihenfolge.
  const least = Math.min(...free.map((id) => roundPasses[id] || 0));
  const pick = free.filter((id) => (roundPasses[id] || 0) === least).pop();
  return { id: pick, review: false };
}

/** Fortschritt im Song (0..1): sitzt = 1, im Tempo = ½, angefangen = ⅕. */
export function guideProgress(defs, states) {
  const v = (id) => {
    const s = st(states, id);
    return s.solid ? 1 : s.mode === 'tempo' ? 0.5 : s.passes > 0 ? 0.2 : 0;
  };
  return defs.reduce((a, d) => a + v(d.id), 0) / defs.length;
}
