/* melody.js — REIN: Melodie-Ausschnitte für Play-Along und Groove (7.5).
   Format der Melodie: [{ bar, beat, dur, midi }], bar ab 1 über die ganze
   Form (Strophe 1–16, Refrain 17–24, Auflösung 25), beat ab 1 in Vierteln. */

import { songForm } from './song-perfect-ruin.js';

export const hasMelody = (song) => Array.isArray(song.melody) && song.melody.length > 0;

/** Melodie-Ereignisse für `bars` Takte ab Formtakt `startBar` (ab 1).
 *  → [{ bar (0-basiert relativ), beat, dur, midi }] */
export function melodySlice(melody, startBar, bars) {
  return melody
    .filter((n) => n.bar >= startBar && n.bar < startBar + bars)
    .map((n) => ({ ...n, bar: n.bar - startBar }));
}

/** Wo in der Form passt ein Loop zur Melodie? Gesucht wird die erste Stelle,
 *  an der die Akkorde der Form Takt für Takt mit den gespielten Akkorden
 *  übereinstimmen. → Formtakt (ab 1) oder null.
 *  ANNAHME: Melodie läuft im Groove nur dort, wo der geübte Loop wörtlich so
 *  im Song steht. Für das Pendel Am–F gibt es keine solche Stelle, dort bleibt
 *  die Melodie stumm. */
export function melodyStartFor(song, chords) {
  const form = songForm(song);
  for (let s = 0; s + chords.length <= form.length; s++) {
    if (chords.every((c, i) => form[s + i] === c)) return s + 1;
  }
  return null;
}
