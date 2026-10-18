/* phrases.js — REIN: „Geführt“ — der Song in Phrasen, am Stück gelernt.
   Kein DOM, kein Date.now(), kein Math.random(). Phrasen kommen aus der
   Zeitleiste des Songs (timeline.js phrasesOf: je Abschnitt eine, gleiche
   Abschnitte zusammengefasst); Akkorde sind Symbole ('Am', 'D/F#').

   Ablauf je Phrase (didaktisch nach Rücksprache mit einer Klavierlehrerin):
     Warten  Die App zeigt den Akkord und geht weiter, sobald er liegt
             (Mikrofon). Kein Tempo. Hilfe gibt es in drei Stufen, und zwar
             JE ÜBERGANG (es hakt fast immer nur an einer Stelle):
               1 Kennenlernen  Tastenbild, Bewegungssatz, Bass-Richtung
               2 Festigen      Bewegungssatz; Tastenbild nach 4 s, Klang nach 8 s
               3 Auswendig     nur der Akkordname; Hilfe nach 6 s, Klang nach 12 s
             Auf: 3× hintereinander ohne Hilfe gefunden, in Stufe 1 binnen
             3 s, in Stufe 2 binnen 2 s. Ab: 2× hintereinander Hilfe von selbst
             nötig oder länger als 8 s. Hilfe selbst holen ist kein Fehler,
             zählt aber nicht für den Aufstieg. Neuer Übetag: eine Stufe
             tiefer, bis der Übergang heute einmal sauber war (Aufwärmen).
             Tempo, sobald alle Übergänge der Phrase in Stufe 3 sind.
             Schnellspur: allererster Durchgang ohne Hilfe, jeder Wechsel
             binnen 2 s → alle Übergänge Stufe 3, gleich Tempo.
     Tempo   Klick, die Wechsel im echten Rhythmus der Phrase, keine
             Bewertung im Lauf. Danach: hakte etwas → Angebot, den Übergang
             kurz zu pendeln; sauber → schneller (+4, beim ersten Fehlerlosen
             gleich, sonst nach 2), 2× mit mehr als einem Fehler → −5, unter
             44 BPM zurück ins Warten. Sauber beim Song-Tempo (ohne bpm: 60)
             → die Phrase sitzt, die nächste wird frei.

   Zustand je Phrase (Datensatz phrase:<songId>:<phraseId>):
   { id, mode: 'wait' | 'tempo', bpm, streak, bad, solid, passes,
     tempoErrors, lastPlayed,
     trans: { '<von>><nach>': { stage, up, down, okDay } } } */

import { daysBetween } from './dates.js';
import { phrasesOf } from './timeline.js';

export const GUIDE = Object.freeze({
  minBpm: 44, startMax: 56, target: 60, top: 76, up: 4, down: 5,
  changeBpm: 50,      // Pendeln: sauber = Wechsel binnen 1 Schlag
  stageSec: Object.freeze({ 1: 3, 2: 2, 3: 2 }), // Wechselzeit, die je Stufe für „auf“ zählt
  upRun: 3,           // so oft hintereinander sauber → eine Stufe höher
  downRun: 2,         // so oft hintereinander Hilfe nötig → eine Stufe tiefer
  slowSec: 8,         // länger gesucht zählt wie Hilfe nötig
  fastSec: 2,         // Schnellspur: allererster Durchgang, jeder Wechsel so schnell
  // Hilfe je Stufe: Tastenbild (kb) und Klang (play) nach so vielen Sekunden;
  // Stufe 1 zeigt das Tastenbild sofort.
  help: Object.freeze({ 1: Object.freeze({ kb: 0, play: 8 }), 2: Object.freeze({ kb: 4, play: 8 }), 3: Object.freeze({ kb: 6, play: 12 }) }),
  cleanToUp: 2,
  badToDown: 2,
  maxPasses: 8,       // je Phrase und Sitzung, dann Wechsel
  reviewDays: 2,      // sitzende Phrase nach so vielen Tagen kurz wiederholen
  repairChanges: 4, repairSeconds: 30,
});

/** Phrasen in Lernreihenfolge. Jede wird erst frei, wenn die davor sitzt.
 *  ANNAHME: Wie im Song, außer dass Phrasen mit den wenigsten verschiedenen
 *  Übergängen zuerst kommen (bei Gleichstand Reihenfolge im Song) — leichtes
 *  zuerst, ohne die Form zu verlieren.
 *  → [{ id, name, chords (Folge ohne Zeiten), events (relativ), beats,
 *       fromBeat, toBeat, once }] */
export function phraseDefs(song) {
  const defs = phrasesOf(song).map((p, i) => ({ ...p, once: p.whole, order: i }));
  const n = (d) => new Set(transitionKeys(d)).size;
  return defs.sort((a, b) => n(a) - n(b) || a.order - b.order);
}

/** Ziel-Tempo, bei dem eine Phrase „sitzt“: das Song-Tempo, ohne bpm GUIDE.target. */
export const targetBpm = (song) => song?.bpm ?? GUIDE.target;

export function newPhrase(id) {
  return { id, mode: 'wait', bpm: null, streak: 0, bad: 0, solid: false, passes: 0, tempoErrors: 0, lastPlayed: null, trans: {} };
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

/** Ereignisse im Tempo-Modus: Phrasen bis 4 Takte zweimal, sonst einmal.
 *  → { events: [{ at, chord }] (relativ), beats } */
export function tempoEvents(def, beatsPerBar = 4) {
  const twice = def.beats <= 4 * beatsPerBar && !def.once;
  const events = twice ? [...def.events, ...def.events.map((e) => ({ ...e, at: e.at + def.beats }))] : [...def.events];
  return { events, beats: twice ? 2 * def.beats : def.beats };
}

/** Sekunden je Schlag. */
export const beatSec = (bpm) => 60 / bpm;

/** Startempo aus den Wechselzeiten: langsamster Wechsel = 1 Schlag. */
export function startBpm(changes) {
  const slow = Math.max(0.01, ...changes.map((c) => c.sec));
  return Math.max(GUIDE.minBpm, Math.min(GUIDE.startMax, Math.floor(60 / slow)));
}

/* ---------- Hilfe-Stufen je Übergang ---------------------------------- */

export const transKey = (from, to) => `${from}>${to}`;

/** Übergänge einer Phrase im Warten-Modus (inkl. Naht zurück zum Anfang). */
export function transitionKeys(def) {
  const seq = waitSequence(def);
  return seq.slice(1).map((to, i) => transKey(seq[i], to));
}

/** Stufe, mit der ein Übergang heute gezeigt wird: die gespeicherte, an
 *  einem neuen Übetag eine tiefer, bis er heute einmal sauber war. */
export function stageOf(state, from, to, today) {
  const t = state.trans?.[transKey(from, to)];
  if (!t) return 1;
  return t.okDay && t.okDay !== today ? Math.max(1, t.stage - 1) : t.stage;
}

/** Einen Wechsel werten. change: { from, to, sec, auto, self } — auto: Hilfe
 *  kam von selbst (Tastenbild oder Klang), self: selbst geholt (oder
 *  getippt, obwohl das Mikrofon an war). → neuer Zustand des Übergangs. */
export function applyChange(t0, change, today) {
  const t = { stage: 1, up: 0, down: 0, okDay: null, ...t0 };
  const shown = t.okDay && t.okDay !== today ? Math.max(1, t.stage - 1) : t.stage;
  const clean = !change.auto && !change.self && change.sec <= GUIDE.stageSec[shown];
  if (clean) {
    t.okDay = today;
    t.down = 0;
    t.up += 1;
    if (t.up >= GUIDE.upRun && t.stage < 3) { t.stage += 1; t.up = 0; }
  } else if (change.self) {
    t.up = 0;
  } else {
    t.up = 0;
    if (change.auto || change.sec > GUIDE.slowSec) {
      t.down += 1;
      if (t.down >= GUIDE.downRun) { t.stage = Math.max(1, shown - 1); t.down = 0; }
    }
  }
  return t;
}

/** Wechsel in den Zustand einer Phrase übernehmen (Warten und Pendeln). */
export function applyChanges(state, changes, today) {
  const trans = { ...(state.trans || {}) };
  for (const c of changes) {
    const k = transKey(c.from, c.to);
    trans[k] = applyChange(trans[k], c, today);
  }
  return { ...state, trans };
}

/** Warten-Durchgang anwenden. changes: [{ from, to, sec, auto, self }],
 *  keys: transitionKeys der Phrase. → { state, clean, toTempo, fast } */
export function applyWait(state, { changes, keys = [], today }) {
  let s = applyChanges(state, changes, today);
  s = { ...s, passes: (state.passes || 0) + 1, lastPlayed: today };
  const clean = changes.length > 0 && changes.every((c) => !c.auto && !c.self);
  const fast = !(state.passes > 0) && clean && changes.every((c) => c.sec <= GUIDE.fastSec);
  if (fast) {
    s.trans = { ...s.trans };
    for (const k of keys) s.trans[k] = { ...(s.trans[k] || { up: 0, down: 0 }), stage: 3, okDay: today };
  }
  const toTempo = keys.length > 0 && keys.every((k) => (s.trans[k]?.stage || 1) >= 3);
  if (toTempo) {
    s.mode = 'tempo';
    s.bpm = state.bpm ? Math.max(GUIDE.minBpm, Math.min(state.bpm, startBpm(changes))) : startBpm(changes);
    s.streak = 0; s.bad = 0;
  }
  return { state: s, clean, toTempo, fast };
}

/** Tempo-Durchgang anwenden. errors: Wechsel ohne erkannten Akkord;
 *  target: Tempo, bei dem die Phrase sitzt (targetBpm).
 *  → { state, clean, up, down, toWait, nowSolid } */
export function applyTempo(state, { errors, today, target = GUIDE.target }) {
  const top = Math.max(GUIDE.top, target);
  const s = { ...state, passes: (state.passes || 0) + 1, lastPlayed: today };
  const out = { clean: errors === 0, up: false, down: false, toWait: false, nowSolid: false };
  if (errors === 0) {
    s.bad = 0;
    s.streak = (state.streak || 0) + 1;
    if (state.bpm >= target && !state.solid) { s.solid = true; out.nowSolid = true; }
    // Schnellspur: solange in dieser Phrase noch nie ein Fehler war, jeder
    // saubere Durchgang ein Schritt.
    const need = state.tempoErrors ? GUIDE.cleanToUp : 1;
    if (s.streak >= need && state.bpm < top) {
      s.bpm = Math.min(top, state.bpm + GUIDE.up);
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

/** Übergänge, an denen es hakte: Ereignis i nicht erkannt → (Akkord davor →
 *  Akkord i). chords: Akkorde der Ereignisse. Gleiche Paare zusammengefasst,
 *  das häufigste zuerst. Ein verpasstes Ereignis mit demselben Akkord wie
 *  davor zählt nicht als Übergang. */
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

/** Die Phrase, an der gerade gearbeitet wird: die erste freie, die noch
 *  nicht sitzt (sonst die letzte freie). → def oder null */
export function focusPhrase(defs, states) {
  if (!defs.length) return null;
  const free = unlocked(defs, states);
  const id = free.find((x) => !st(states, x).solid) ?? free[free.length - 1];
  return defs.find((d) => d.id === id) || null;
}

/** Fortschritt im Song (0..1): sitzt = 1, im Tempo = ½, angefangen = ⅕. */
export function guideProgress(defs, states) {
  if (!defs.length) return 0;
  const v = (id) => {
    const s = st(states, id);
    return s.solid ? 1 : s.mode === 'tempo' ? 0.5 : s.passes > 0 ? 0.2 : 0;
  };
  return defs.reduce((a, d) => a + v(d.id), 0) / defs.length;
}
