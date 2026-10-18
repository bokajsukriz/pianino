# Fortschritt: Songs selbst transkribieren, mit YouTube üben

Bezug: `ARBEITSANWEISUNG-TRANSKRIPTION.md`. Stand: umgesetzt; offen ist nur,
was sich in der Entwicklungsumgebung nicht prüfen ließ (unten).

## 4 Datenmodell
- [x] 4.1 `songdata.js`: `validateSong` (deutsche Meldungen), `normalizeSong` (Nachbarn gleicher Akkorde zusammengefasst, unbekannte Felder und `beatTimes` erhalten), Export ohne Text voreingestellt, Raster ½ bzw. ¼ (`grid`)
- [x] 4.1 `docs/song-schema.md` mit Beispiel ohne Liedtext
- [x] 4.2 `chordsym.js`: `parseChord` (alle Typen, Slash, `F6/9` vs. `F6/9/A`), `nameFromKeys` (gebräuchlichste zuerst, `// ANNAHME:`), `sameChord`, `prettyChord`
- [x] 4.2 `chords.js`: `transition`, `moveText`, `bassText` mit Griff-Objekten; `moveText` aus `voicingDiff`; `:root`-Griffe für den Akkord-Blitz
- [x] 4.2 `hear.js`/`ear-worker.js` hingen über `mic.js` an ids aus `chords.js` → jetzt Ziele aus `voicing.js hearTarget` (Töne, Tonstufen). An der Erkennung nichts geändert: `hear.js` nimmt `lh` zusätzlich als Liste; `ear-worker.js` baut die Muster aus Tonstufen statt fester Lagen (siehe „Prüfung der Erkenner“)
- [x] 4.3 `timeline.js`: `beatToSec`/`secToBeat`, `chordAt`, `eventsIn`, `quantize`, `sectionRange`, `phrasesOf` (gleiche Abschnitte → „Strophe 1/2“), `chordSequence`
- [x] 4.4 `DATA_VERSION` 2, Migration 2 (rein in `migrations.js`, idempotent): Perfect Ruin ohne Griffe, Ereignisse, Abschnitte; `phrase:*` → `archiv:phrase:*`; Karten und Loops bleiben; `settings.currentSong`
- [x] 4.4 Fortschritt je Song: `phrase:<songId>:<phraseId>`, `wann:<songId>:<phraseId>`; Übergänge als Symbolpaare
- [x] 4.5 `voicing.js`: `validateVoicing` (Fehler/Warnungen), `voicingDiff`, `defaultVoicing` (`// ANNAHME:`), `upgradeVoicing` (altes Format)

## 5 Screens
- [x] Songs, Import (Datei/eingefügt, Fehlerliste, Vorschau, „Ersetzen“ / „Als Kopie“), Export, Löschen mit Rückfrage
- [x] Start zeigt den aktuellen Song; ohne Ereignisse führt er zu „Transkribieren“ (und „Griffe“)

## 6 YouTube
- [x] `yt.js` (laden, `create`, `play`, `pause`, `seek`, `setRate`, `rates`, `now`, Ereignisse), `youtube-nocookie.com`
- [x] Zeit geglättet (performance.now × Rate, neu ansetzen ab 0,25 s), Anzeige-Vorlauf 0–300 ms (Standard 80) in `settings.leadMs`
- [x] CSP: `script-src 'self' https://www.youtube.com https://s.ytimg.com`, `frame-src https://www.youtube-nocookie.com https://www.youtube.com`; kein `unsafe-*`; `sw.js` nur gleiche Herkunft
- [x] Player immer sichtbar (≥ 356 × 200 im Querformat), Fehlermeldungen (kein Netz, nicht einbettbar, gelöscht, „Startet nicht?“), Zeitleiste steht, solange der Player nicht spielt
- [x] Loop A–B mit einem Takt Vorlauf, Raten 0,5 / 0,75 / 1, Mikrofon standardmäßig aus (Kopfhörer-Hinweis)
- [x] 6.3 Play-Along: Video + Akkordband (Countdown „D in 1½“, vorgezogene Wechsel vor dem Taktstrich, Text), ganzer Song / Abschnitt / Loop über die Phrase, gespielte Sekunden; ohne Quelle/Offset/Netz eigene Begleitung auf der Zeitleiste

## 7 Transkribieren
- [x] Schritt 1: Link/ID (`parseYouTubeId`), Dauer vom Player, Tipp-Tempo (≥ 8, ohne Ausreißer), ±1
- [x] Schritt 2: „Hier ist Takt 1“ (minus Vorlauf), ±20 ms, ±1 Schlag, Raster-Check mit Punkten und Klick (Zeit aus `yt.js`)
- [x] Schritt 3: Akkordknöpfe, „+ Akkord“, Raster ½/¼, ersetzen an gleicher Stelle, Rückgängig mehrstufig, Tasten 1–9, Leertaste
- [x] Schritt 4: Band antippen → ±Raster, Akkord ändern, löschen; „Klavier dazu“ (`clock.js`, neu angesetzt bei Abweichung); Abschnitte mit Namensvorschlägen und Nummer; Text (tippen, ganze Schläge, „bleibt nur auf diesem Gerät“); „Fertig gehört“ mit Rückfrage
- [x] Speichert laufend, nach Neuladen alles da

## 8 Griff-Editor
- [x] Akkordleiste (Standardlage-Hinweis, „+ Akkord“, langes Drücken: umbenennen, Standardlage, löschen nur ohne Ereignisse)
- [x] Klaviatur C2–C6, verschiebbar, zentriert, weiße Tasten 30 px; Links/Rechts, Finger 1–5, „–“, Finger wandert mit, Auswahl springt weiter
- [x] Farben je Hand (`--kb-rh`, `--kb-lh`) plus „L“; Speichern bei jeder Änderung, Rückgängig mehrstufig; Namensvorschlag („Klingt wie D/F♯. Umbenennen?“), Warnungen als Zeile
- [x] Anhören, Gebrochen (Achtel bei 90 BPM über `clock.js`)
- [x] Wechsel-Ansicht „Mit Vorgänger“ (blass, Punkt/durchgestrichen/Ring/Pfeil, Vorgänger durchschaltbar, Satz aus `moveText`); dieselbe Ansicht in „Geführt“ (Stufe 1) und „Kurze Wege“
- [x] Spickzettel „Alle Griffe“ (Hochformat)
- [x] Stift-Symbol in „Geführt“ öffnet den Editor beim aktuellen Akkord

## 9 Üben auf der Zeitleiste
- [x] Geführt: Phrasen aus `phrasesOf`, wenigste Übergänge zuerst (`// ANNAHME:`); Warten mit `chordSequence`; Tempo im echten Rhythmus, Ankündigung vom Ereignis aus; Muster der Groove-Stufe, wenn alle Übergänge Stufe 3; Bewertung je Ereignis; `repairPairs` mit Ereignissen; Ziel = Song-bpm (sonst 60)
- [x] Wann (`exercises/wann.js`, `tap.js scoreTaps`, Stufen 1–3, `wann:<songId>:<phraseId>`), mit YouTube oder Klick + leiser Begleitung, Tippen oder Mikrofon
- [x] Groove über die Ereignisse einer Phrase; Kurze Wege aus den häufigsten Übergängen; Akkord-Blitz mit den Akkorden des Songs (alte Karten bleiben)
- [x] Mix: ohne Ereignisse kein Mix; sonst 30 s Wann, 2½ min Geführt, 2 min Play-Along

## 11 Selbsttests
- [x] Node: 137 grün (davon neu 9–14: Song-JSON, Akkordsymbole, Griffe, Zeitleiste, Tippen, Migration; 3/4/6/8 auf Song-Daten umgestellt), ohne Liedtext
- [x] Browser: 141 grün, darunter „Wechsel auf „4 und“ im Tempo-Modus auf dem richtigen Achtel“ (`OfflineAudioContext`, Abweichung 0,02 ms)

## Prüfung der Erkenner
- [x] `ear-worker.js`: altes und neues Muster für Am, D, F, Dm, C auf 100 000 Zufalls-Chromas verglichen — Score und Urteil identisch (nur die Namen der Fehlgriff-Varianten sind anders sortiert, sie dienen nur der Anzeige)
- [x] `hear.js`: alt gegen neu auf 8000 künstlichen Spektren (mit Fehlgriffen, Fremdtönen, Vorakkord) — identisch
- [x] Simulation `docs/archiv/mikro-sim/` (800 Ausklänge, Salamander, `MODE=any WIN=1.0`), alter gegen neuen `hear.js`: Ausgabe zeichengleich — nur rechte Hand 100 % erkannt / 0,4 % Ton daneben / 0 % anderer Akkord, mit Bass 97,5 % / 12,1 % / 2,5 %

## Abnahme in der Entwicklungsumgebung (Playwright, Chromium)
- [x] Perfect Ruin nach dem Update da, ohne Ereignisse; Start führt zu „Transkribieren“
- [x] Die drei Griffe aus dem Selbsttest im Editor eingegeben (inkl. Umbenennen D → D/F#, F → F6/9 über den Namensvorschlag), Wechsel-Ansicht und Spickzettel geprüft — ohne Netz
- [x] Transkribieren mit YouTube-Stub: Video laden, Tipp-Tempo, Takt 1, Wechsel tippen, Rückgängig, verschieben, Abschnitt; nach Neuladen alles da
- [x] Export → Import gleich (ohne Text)
- [x] Play-Along mit Stub (Band, Loop, Rate) und ohne Netz (eigene Begleitung mit Hinweis)
- [x] Geführt, Wann (ohne Video), Groove, Kurze Wege, Akkord-Blitz ohne Netz

## Offen (nicht prüfbar in der Entwicklungsumgebung)
- [ ] Echtes YouTube: Die Sandbox sperrt youtube.com. Getestet wurde mit einem Stub der IFrame-API. Auf dem Gerät prüfen: Konsole ohne CSP-Verstöße, ob `https://s.ytimg.com` und `frame-src https://www.youtube.com` wirklich nötig sind (sonst streichen), Werbung, `playVideo()` nach Tipp auf iOS
- [ ] Safari unter iOS und Chrome unter Android (Quer- und Hochformat)
