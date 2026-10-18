/* test-melody.js — REIN: Testmelodie NUR für den Selbsttest.
   a-Moll-Tonleiter über 4 Takte (A4 hinauf bis A5 und zurück bis A4),
   Viertelnoten. Keine Melodie eines Songs. Format wie song.melody
   (melody.js): [{ at, dur, midi }], at in Schlägen ab der Eins von Takt 1. */

const SCALE = [69, 71, 72, 74, 76, 77, 79, 81, 79, 77, 76, 74, 72, 71, 69, 69];

export const TEST_MELODY = Object.freeze(SCALE.map((midi, i) => Object.freeze({
  at: i, dur: i === SCALE.length - 1 ? 1 : 0.9, midi,
})));
