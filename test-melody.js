/* test-melody.js — REIN: Testmelodie NUR für den Selbsttest.
   a-Moll-Tonleiter über 4 Takte (A4 hinauf bis A5 und zurück bis A4),
   Viertelnoten. Keine Melodie des Songs. Format wie SONG.melody:
   [{ bar, beat, dur, midi }]. */

const SCALE = [69, 71, 72, 74, 76, 77, 79, 81, 79, 77, 76, 74, 72, 71, 69, 69];

export const TEST_MELODY = Object.freeze(SCALE.map((midi, i) => Object.freeze({
  bar: 1 + Math.floor(i / 4), beat: 1 + (i % 4), dur: i === SCALE.length - 1 ? 1 : 0.9, midi,
})));
