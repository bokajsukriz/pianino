# Fremde Bestandteile

Pianino lädt zur Laufzeit nichts von fremden Servern. Alle Bestandteile Dritter
liegen im Repo.

## Klavier: Salamander Grand Piano

| Feld | Wert |
|---|---|
| Komponente | Salamander Grand Piano V3 (Yamaha C5) |
| Urheber | Alexander Holm |
| Fassung | Tone.js, https://github.com/Tonejs/audio, Ordner `salamander/` |
| Dateien | `samples/salamander/*.mp3` (25 Dateien, C1–C7 = MIDI 24–96, ein Ton alle drei Halbtöne, 44,1 kHz stereo, ≈ 1,8 MB) |
| Lizenz | Creative Commons Namensnennung 3.0 (CC BY 3.0), https://creativecommons.org/licenses/by/3.0/ |
| Namensnennung in der App | Startscreen → „Über“ → „Lizenzen und Dank“ |
| Verändert | Die Dateien liegen **unverändert** hier, nur umbenannt auf die MIDI-Tonhöhe (`C4.mp3` → `60.mp3`, `Ds4` → `63`, `Fs4` → `66`, `A4` → `69`). Verändert wird erst beim Laden in der App (`piano-samples.js`): Stille am Anfang entfernt, auf 3 s gekürzt, ausgeblendet, zu Mono gemischt, Pegel angeglichen und gleichstufig umgestimmt (gemessene Abweichung je Datei, `TUNE`). |
| Herkunft im Projekt | übernommen aus der Schwester-App `bokajsukriz/choirapp` (`samples/salamander/`, Abschnitt „Klavier“ in `samples/LIZENZ.md`) |

## Klavier-Lader `piano-samples.js`

Aus `bokajsukriz/choirapp` übernommen (gleiche Urheberschaft wie diese App),
Kopfkommentar angepasst, Namespace `window.ChorPiano` beibehalten.

## Schrift: Bricolage Grotesque

| Feld | Wert |
|---|---|
| Komponente | Bricolage Grotesque (Schrift) |
| Urheber | Mathieu Triay / Atelier Triay (Copyright 2022 The Bricolage Grotesque Project Authors) |
| Datei | `fonts/bricolage-grotesque-latin.woff2` |
| SHA-256 | `854bb88e2fbf6024f58ce853d1ebe480f5ecb72f109c45094ba13361b4613991` |
| Quelle | https://github.com/ateliertriay/bricolage — bezogen aus https://github.com/google/fonts, Ordner `ofl/bricolagegrotesque` |
| Lizenz | SIL Open Font License 1.1 (Volltext `LICENSE-bricolage-grotesque-OFL.txt`) |
| Verändert | **ja** — auf Latein beschnitten, Breitenachse fest auf 100, Gewichtsachse auf 400–800 und Größenachse auf 14–48 begrenzt, als WOFF2 gespeichert (variable Schrift, ≈ 72 KB). Übernommen aus `bokajsukriz/choirapp`. |
| Namensnennung in der App | Startscreen → „Über“ → „Lizenzen und Dank“ |

## Klick und Melodiestimme

Synthetisch erzeugt (Web Audio), keine Samples.
