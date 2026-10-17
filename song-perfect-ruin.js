/* song-perfect-ruin.js — REIN: Songdaten „Perfect Ruin“ (Kwabs).
   Austauschbar: Die App liest nur dieses Objekt. Kein Liedtext.

   NICHT VERIFIZIERT: Die Akkordfolge stammt aus Nutzer-Tabs. Prüfen gegen
   die Noten (Musicnotes MN0148299) oder mit der Lehrkraft, dann hier
   korrigieren und `verified: true` setzen. */

export const SONG = Object.freeze({
  id: 'perfect-ruin',
  title: 'Perfect Ruin',
  artist: 'Kwabs',
  key: 'a-Moll',
  verified: false,
  beatsPerBar: 4,
  // Original etwa 76–79 BPM, in den Noten „Freely“ mit Viertel = 72.
  originalBpm: Object.freeze([76, 79]),
  sheetBpm: 72,
  // Übetempo: Einstieg, Untergrenze, Ziel.
  practiceBpm: Object.freeze({ start: 55, min: 50, target: 60 }),

  // ANNAHME: ein Akkord pro Takt (harmonischer Rhythmus nicht geprüft).
  // Akkord-ids aus chords.js; im Song immer die :song-Voicings.
  // ANNAHME: Die Tabs nennen „Am – D – F (zweimal), dann Am – Dm – C – F,
  // Am – Dm – F“. Die Takte 4, 8, 16 (je F) sind aufgefüllt.
  verse: Object.freeze([
    'Am:song', 'D:song', 'F:song', 'F:song',
    'Am:song', 'D:song', 'F:song', 'F:song',
    'Am:song', 'Dm:song', 'C:song', 'F:song',
    'Am:song', 'Dm:song', 'F:song', 'F:song',
  ]),
  chorus: Object.freeze([
    'C:song', 'F:song', 'Dm:song', 'C:song',
    'F:song', 'Dm:song', 'C:song', 'F:song',
  ]),
  // Auflösung nach dem Refrain (1 Takt).
  resolve: Object.freeze(['Am:song']),

  // Loops für die Übungen (je Akkord 1 Takt, wiederholt).
  loops: Object.freeze({
    verse: Object.freeze(['Am:song', 'D:song', 'F:song']),
    chorus: Object.freeze(['C:song', 'F:song', 'Dm:song', 'C:song', 'F:song']),
  }),

  /* Melodiestimme — wird NICHT von der App-Entwicklung transkribiert.
     Format: [{ bar, beat, dur, midi }]
       bar  Takt ab 1, gezählt über die ganze Form: Strophe 1–16,
            Refrain 17–24, Auflösung 25
       beat Einsatz im Takt ab 1, in Vierteln (1.5 = „1 und“)
       dur  Dauer in Vierteln
       midi Tonhöhe, 60 = C4
     Leer = Schalter „Melodie“ ausgegraut („Melodie noch nicht erfasst“). */
  melody: Object.freeze([]),
});

/** Ganze Form am Stück: Strophe → Refrain → Auflösung (25 Takte). */
export function songForm(song = SONG) {
  return [...song.verse, ...song.chorus, ...song.resolve];
}
