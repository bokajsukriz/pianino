/* tempo.js — REIN: Stufen und Tempo-Regeln für „Kurze Wege“ (7.2) und
   „Groove“ (7.3). Kein DOM, kein Date.now(), kein Math.random(). */

import { daysBetween } from './dates.js';
import { songForm } from './song-perfect-ruin.js';

/* ---------- Kurze Wege ------------------------------------------------- */

export const WEGE = Object.freeze({
  start: 55, min: 50, target: 60, up: 4, down: 6, cleanNeeded: 3, staleDays: 7, warmDrop: 6,
  barsPerBlock: 8, newBlocked: 2, maxLevel: 6,
});

/** Stufen 1–6 mit ihren Loops. chords: Akkord-ids, je einer pro Takt.
 *  once: Form einmal am Stück statt 8 Takte Loop. */
export function wegeStages(song) {
  const pend = (a, b) => [`${a}:song`, `${b}:song`];
  const p12 = [
    { id: 'am-f', chords: pend('Am', 'F') },
    { id: 'f-dm', chords: pend('F', 'Dm') },
    { id: 'am-dm', chords: pend('Am', 'Dm') },
    { id: 'am-d', chords: pend('Am', 'D') },
  ];
  return {
    1: p12.slice(0, 2).map((l) => ({ ...l, lh: false })),
    2: p12.slice(2, 4).map((l) => ({ ...l, lh: false })),
    3: p12.map((l) => ({ ...l, id: `${l.id}:lh`, lh: true })),
    4: [{ id: 'verse', chords: [...song.loops.verse], lh: true }],
    5: [{ id: 'chorus', chords: [...song.loops.chorus], lh: true }],
    6: [{ id: 'form', chords: songForm(song), lh: true, once: true }],
  };
}

/** Akkord-ids eines Blocks: 8 Takte Loop bzw. die Form einmal. */
export function blockChords(def, bars = WEGE.barsPerBlock) {
  if (def.once) return [...def.chords];
  return Array.from({ length: bars }, (_, i) => def.chords[i % def.chords.length]);
}

export function newLoop(id, bpm = WEGE.start) {
  return { id, bpm, bestBpm: bpm, cleanStreak: 0, lastPlayed: null, solid: false, blocks: 0 };
}

/** Länger als 7 Tage nicht geübt? */
export function isStale(loop, today) {
  return !!loop.lastPlayed && daysBetween(loop.lastPlayed, today) >= WEGE.staleDays;
}

/** Tempo für den nächsten Block. Nach ≥ 7 Tagen Pause −6 (min. 50) zum
 *  Aufwärmen; das gespeicherte Tempo bleibt (kein Rückschritt). Nach dem
 *  ersten Block gilt lastPlayed = heute und damit wieder das normale Tempo. */
export function blockBpm(loop, today) {
  return isStale(loop, today) ? Math.max(WEGE.min, loop.bpm - WEGE.warmDrop) : loop.bpm;
}

/** Ergebnis eines Blocks anwenden (ok = „Drangeblieben“). */
export function applyWege(loop, ok, today) {
  const l = { ...loop, lastPlayed: today, blocks: (loop.blocks || 0) + 1 };
  if (ok) {
    l.cleanStreak = (loop.cleanStreak || 0) + 1;
    if (l.cleanStreak >= WEGE.cleanNeeded) {
      if (loop.bpm >= WEGE.target) l.solid = true;
      l.bpm = Math.min(WEGE.target, loop.bpm + WEGE.up);
      l.cleanStreak = 0;
    }
  } else {
    l.bpm = Math.max(WEGE.min, loop.bpm - WEGE.down);
    l.cleanStreak = 0;
  }
  l.bestBpm = Math.max(loop.bestBpm || 0, l.bpm);
  return l;
}

/** Welcher Loop kommt als Nächstes?
 *  1. Ein neuer Loop läuft seine ersten 2 Blöcke geblockt weiter.
 *  2. Ein nie geübter Loop wird eingeführt.
 *  3. Ein Loop, der ≥ 7 Tage nicht geübt wurde, wird bevorzugt.
 *  4. Sonst wechseln: ein anderer als der letzte, der in dieser Runde am
 *     seltensten lief (Gleichstand: rand). */
export function nextLoop(defs, loops, { lastId = null, today, rand, roundBlocks = {} }) {
  const ids = defs.map((d) => d.id);
  const st = (id) => loops[id] || newLoop(id);
  if (lastId && ids.includes(lastId) && st(lastId).blocks < WEGE.newBlocked) return lastId;
  const never = ids.find((id) => !st(id).blocks);
  if (never) return never;
  const stale = ids.filter((id) => id !== lastId && isStale(st(id), today) && !roundBlocks[id]);
  if (stale.length) return stale[0];
  const others = ids.length > 1 ? ids.filter((id) => id !== lastId) : ids;
  const least = Math.min(...others.map((id) => roundBlocks[id] || 0));
  const pool = others.filter((id) => (roundBlocks[id] || 0) === least);
  return pool[Math.min(pool.length - 1, Math.floor(rand() * pool.length))];
}

/** Sitzen alle Loops der Stufe? (Stufenvorschlag) */
export function stageSolid(defs, loops) {
  return defs.every((d) => loops[d.id]?.solid);
}

/* ---------- Groove (Ballade) ------------------------------------------- */

const bits = (s) => Object.freeze([...s].map(Number));

/** Muster je Stufe als Achtelraster (8 Felder). loops: 'pend' = Am F,
 *  sonst Namen aus song.loops. */
export const GROOVE_STAGES = Object.freeze({
  1: Object.freeze({ rh: bits('10000000'), lh: bits('10000000'), loops: ['pend'], bpm: [55, 55] }),
  2: Object.freeze({ rh: bits('10001000'), lh: bits('10000000'), loops: ['pend'], bpm: [55, 60] }),
  3: Object.freeze({ rh: bits('11111111'), lh: bits('10000000'), loops: ['pend'], bpm: [55, 65] }),
  4: Object.freeze({ rh: bits('11111111'), lh: bits('10000000'), loops: ['verse', 'chorus'], bpm: [60, 65] }),
});
export const GROOVE_MAX_LEVEL = 4;
export const GROOVE = Object.freeze({ step: 4, okNeeded: 3, barsPerBlock: 4 });

/** Akkord-ids eines Groove-Loops. */
export function grooveLoopChords(name, song) {
  return name === 'pend' ? ['Am:song', 'F:song'] : [...song.loops[name]];
}

/** Tempo in den Bereich der Stufe holen. */
export function grooveBpm(level, bpm) {
  const [lo, hi] = GROOVE_STAGES[level].bpm;
  return Math.min(hi, Math.max(lo, bpm ?? lo));
}

/** Ergebnis eines Groove-Blocks. state: { bpm, roundOk } (roundOk = „Groovt“
 *  in dieser Runde seit der letzten Erhöhung).
 *  → { bpm, roundOk, suggest } — suggest: Stufenvorschlag fällig. */
export function applyGroove(level, state, ok) {
  const [lo, hi] = GROOVE_STAGES[level].bpm;
  const bpm = grooveBpm(level, state.bpm);
  if (!ok) return { bpm: Math.max(lo, bpm - GROOVE.step), roundOk: 0, suggest: false };
  const roundOk = (state.roundOk || 0) + 1;
  if (roundOk < GROOVE.okNeeded) return { bpm, roundOk, suggest: false };
  const suggest = bpm >= hi && level < GROOVE_MAX_LEVEL;
  return { bpm: Math.min(hi, bpm + GROOVE.step), roundOk: 0, suggest };
}
