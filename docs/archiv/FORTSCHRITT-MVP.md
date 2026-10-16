# Fortschritt Pianino MVP

Bezug: `ARBEITSANWEISUNG-MVP.md`. Stand: abgeschlossen (Version 1.0).

## 5 Screens
- [x] S1 Erster Start (Vorschläge, freies Feld, Vorschau, „Passt so“ / „Überspringen“, `settings.plan`)
- [x] S2 Start (Plan, „5 Minuten“ mit Aufteilung, „Nur 1 Minute“, Wochenkarte Mo–So, Song-Karte, Direkteinstiege, „Über“)
- [x] S3 Akkord-Blitz: Karte (Symbol 120 px, Stufe, Countdown-Ring, Schlagpunkte, ganze Fläche tippbar)
- [x] S4 Akkord-Blitz: Auflösung (Klang 1,5 s, Tonnamen, Merksatz, Tastatur, drei Knöpfe mit Kriterium)
- [x] S5 Kurze Wege (eine Tastatur mit bleibt/Start/Ziel, Akkordleiste, Schlagpunkte, Takt n von 8, BPM mit Ziel, Tipp, Abfrage)
- [x] S6 Groove (Achtelraster RH/LH, Cursor, jetzt/gleich, Schalter Klick/Melodie, BPM-Bereich, Tipp, Abfrage)
- [x] S7 Play-Along (dunkel, jetzt/gleich, Taktfelder der Strophe, Schalter, Hinweis „Summ mit …“)
- [x] S8 Abschluss (dunkel, drei Zeilen, Belohnung 8 Takte, „Noch 1 Minute“, „Fertig“)
- [x] Hinweis „Dreh das Handy quer“ (sperrt nichts), Wake Lock während der Übungen

## 6 Songdaten
- [x] `song-perfect-ruin.js` mit `verified: false`, leere `melody` mit dokumentiertem Format
- [x] `chords.js` mit 10 Akkorden, `transition()`

## 7 Logik
- [x] 7.1 Leitner (`leitner.js`): Fächer, Vormerkung, Wiederholung nach 3–5 Karten, geblockter Einstieg, Rundenaufbau, kein Rückstau, Stufenvorschlag
- [x] 7.2 Kurze Wege + Tempo (`tempo.js`): ±BPM, „sitzt“, Aufwärmen nach 7 Tagen, geblockte neue Loops
- [x] 7.3 Groove: Muster als Daten, Vorspiel → Einzähler → 4 Takte, Tempo im Bereich
- [x] 7.4 5-Minuten-Mix (`mix.js`), weiche Zeitlimits, Fortschrittsbalken, Pause/Beenden, Wochenziel
- [x] 7.5 Play-Along, Melodiestimme (Sinus, Vibrato 5 Hz, 40 ms, Oktave tiefer), `test-melody.js`

## 8 Gestaltung
- [x] Farben, Schrift lokal, Tastaturfarben mit Helligkeitsunterschied, keine roten Fehlerfarben, keine Emojis, keine Verläufe

## 9 Audio
- [x] Ein AudioContext, Entsperren beim ersten Tipp, Synth-Ersatz, Samples vorladen (`keepSec: () => 3`)
- [x] `clock.js` Lookahead 150 ms / Timer 25 ms, Anzeige per requestAnimationFrame

## 10 Selbsttests und Abnahme
- [x] `runSelfTests()` (Node: reine Teile; Browser: zusätzlich Takt-Scheduler und Audio-Smoke-Test)
- [x] Screenshots aller 8 Screens (Playwright, Chromium)
- [x] Abnahmekriterien geprüft (siehe PR-Beschreibung)
