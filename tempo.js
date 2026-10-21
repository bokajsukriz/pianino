/* tempo.js — REIN: Stufen und Tempo-Regeln für „Kurze Wege“ (7.2) und
   „Groove“ (7.3). Kein DOM, kein Date.now(), kein Math.random(). */

import { daysBetween } from './dates.js';
import { transitionCounts, chordSequence, songEndBeat } from './timeline.js';

/** Tempo für die Anzeige: Prozent vom Song-Tempo, dahinter die BPM in
 *  Klammern; ohne Song-Tempo nur die BPM. */
export function tempoText(bpm, songBpm) {
  if (!songBpm) return `${bpm} BPM`;
  return `${Math.round(bpm / songBpm * 100)} % (${bpm} BPM)`;
}

/* ---------- Kurze Wege ------------------------------------------------- */

export const WEGE = Object.freeze({
  start: 55, min: 50, target: 60, up: 4, down: 6, cleanNeeded: 3, staleDays: 7, warmDrop: 6,
  barsPerBlock: 8, newBlocked: 2, maxLevel: 6,
});

/** Häufigste Übergänge des Songs als Paare (a ↔ b zusammengezählt, die
 *  Richtung des ersten Auftretens). Ohne Ereignisse: Nachbarn in chords.
 *  → [[a, b], …] häufigste zuerst */
export function songPairs(song) {
  const map = new Map();
  for (const t of transitionCounts(song)) {
    const k = [t.from, t.to].sort().join('~');
    if (!map.has(k)) map.set(k, { pair: [t.from, t.to], count: 0, first: t.first });
    map.get(k).count += t.count;
  }
  const out = [...map.values()].sort((a, b) => b.count - a.count || a.first - b.first).map((x) => x.pair);
  if (out.length || (song.events || []).length) return out;
  const ch = song.chords || [];
  return ch.slice(1).map((c, i) => [ch[i], c]);
}

/** Stufen 1–6 mit ihren Loops. chords: Akkordsymbole, je einer pro Takt.
 *  once: einmal am Stück statt 8 Takte Loop. Je Paar ein Loop (Pendel):
 *  1 die zwei häufigsten Übergänge, 2 die nächsten zwei, 3 die vier mit
 *  linker Hand, 4 die Übergänge 5–8 mit linker Hand, 5 alle (bis 8) mit
 *  linker Hand, 6 die Akkordfolge des Songs am Stück.
 *  ANNAHME: Stufe 6 höchstens 24 Wechsel lang (wie früher die Form). */
export function wegeStages(song) {
  const pairs = songPairs(song).slice(0, 8);
  const loop = ([a, b], lh) => ({ id: `${song.id}:${a}~${b}${lh ? ':lh' : ''}`, chords: [a, b], lh });
  const first = pairs.slice(0, 2), second = pairs.slice(2, 4).length ? pairs.slice(2, 4) : first;
  const four = pairs.slice(0, 4), more = pairs.slice(4, 8).length ? pairs.slice(4, 8) : four;
  const seq = (song.events || []).length ? chordSequence(song, 0, songEndBeat(song)) : [...(song.chords || [])];
  return {
    1: first.map((x) => loop(x, false)),
    2: second.map((x) => loop(x, false)),
    3: four.map((x) => loop(x, true)),
    4: more.map((x) => loop(x, true)),
    5: pairs.map((x) => loop(x, true)),
    6: [{ id: `${song.id}:form`, chords: seq.slice(0, 24), lh: true, once: true }],
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
export const GROOVE = Object.freeze({ step: 4, okNeeded: 3, barsPerBlock: 4 });

/** Muster je Stufe als Achtelraster (8 Felder). phrases: 'focus' = die
 *  Phrase, an der in „Geführt“ gerade gearbeitet wird, 'all' = alle Phrasen
 *  im Wechsel. */
export const GROOVE_STAGES = Object.freeze({
  1: Object.freeze({ rh: bits('10000000'), lh: bits('10000000'), phrases: 'focus', bpm: [55, 55] }),
  2: Object.freeze({ rh: bits('10001000'), lh: bits('10000000'), phrases: 'focus', bpm: [55, 60] }),
  3: Object.freeze({ rh: bits('11111111'), lh: bits('10000000'), phrases: 'focus', bpm: [55, 65] }),
  4: Object.freeze({ rh: bits('11111111'), lh: bits('10000000'), phrases: 'all', bpm: [60, 65] }),
});
export const GROOVE_MAX_LEVEL = 4;

/** Ausschnitte für Groove: die Phrasen in Stücken zu höchstens `bars`
 *  Takten. defs: phrases.js phraseDefs (in Lernreihenfolge).
 *  Ohne Ereignisse: die Akkorde des Songs, einer pro Takt (ANNAHME).
 *  → [{ id, name, tl: { events, beatsPerBar }, fromBeat, bars, phrase }] */
export function grooveWindows(song, defs, { bars = GROOVE.barsPerBlock } = {}) {
  const bpb = song.beatsPerBar;
  if (!(song.events || []).length || !defs.length) {
    const ch = (song.chords || []).slice(0, bars);
    const events = ch.map((c, i) => ({ at: i * bpb, chord: c }));
    return events.length ? [{ id: 'chords', name: 'Akkorde', tl: { events, beatsPerBar: bpb }, fromBeat: 0, bars: ch.length, phrase: null }] : [];
  }
  const out = [];
  for (const d of defs) {
    const total = Math.max(1, Math.round(d.beats / bpb));
    const n = Math.ceil(total / bars);
    for (let w = 0; w < n; w++) {
      const len = Math.min(bars, total - w * bars);
      out.push({
        id: `${d.id}:${w}`, name: n > 1 ? `${d.name}, Takt ${w * bars + 1}–${w * bars + len}` : d.name,
        tl: song, fromBeat: d.fromBeat + w * bars * bpb, bars: len, phrase: d.id,
      });
    }
  }
  return out;
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
