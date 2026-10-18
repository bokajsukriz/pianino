/* melody.js — REIN: Melodiestimme eines Songs (Groove, ab Stufe 2).
   Format (optional im Song, wird nicht von der App-Entwicklung
   transkribiert): melody: [{ at, dur, midi }] — at Schlag wie bei den
   Ereignissen (0 = Eins von Takt 1), dur in Schlägen, midi 60 = C4.
   Ohne Melodie bleibt der Schalter „Melodie“ ausgegraut. */

export const hasMelody = (song) => Array.isArray(song?.melody) && song.melody.length > 0;

/** Melodietöne, die in [fromBeat, toBeat) beginnen. */
export function melodyIn(song, fromBeat, toBeat) {
  if (!hasMelody(song)) return [];
  return song.melody.filter((n) => n.at >= fromBeat - 1e-6 && n.at < toBeat - 1e-6);
}
