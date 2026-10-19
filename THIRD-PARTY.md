# Fremde Bestandteile

Pianino lädt zur Laufzeit nichts von fremden Servern. Alle Bestandteile Dritter
liegen im Repo.

## Klavier: Salamander Grand Piano

| Feld | Wert |
|---|---|
| Komponente | Salamander Grand Piano V3 (Yamaha C5) |
| Urheber | Alexander Holm |
| Fassung | Tone Piano, https://github.com/tambien/Piano, Ordner `audio/` (16 Anschlagstärken je Ton; Code MIT, Aufnahmen Salamander, CC BY 3.0). Der Vorgänger dieser Dateien war die Fassung von Tone.js, https://github.com/Tonejs/audio, Ordner `salamander/` (eine Anschlagstärke) |
| Dateien | `samples/salamander/{soft,mid,loud}/<MIDI>.mp3` — drei Anschlagstärken (Stufen 4, 8 und 12 von 16), je 25 Dateien, C1–C7 = MIDI 24–96, ein Ton alle drei Halbtöne; mono, 44,1 kHz, 96 kbit/s; zusammen ≈ 3,8 MB |
| Lizenz | Creative Commons Namensnennung 3.0 (CC BY 3.0), https://creativecommons.org/licenses/by/3.0/ |
| Namensnennung in der App | Startscreen → „Über und Einstellungen“ → „Lizenzen und Dank“ |
| Verändert | **ja** — Dateien umbenannt auf die MIDI-Tonhöhe (`C4v8.mp3` → `mid/60.mp3`, `Ds4` → `63`, `Fs4` → `66`, `A4` → `69`), auf 5 s (bis MIDI 48), 4 s (bis 72) bzw. 2,5 s gekürzt, zu Mono gemischt und mit 96 kbit/s neu kodiert (ffmpeg, libmp3lame). Beim Laden in der App (`piano-samples.js`): Stille am Anfang entfernt, ausgeblendet, Pegel angeglichen (alle Stufen auf denselben Pegel, die Stufe ändert nur den Klang) und gleichstufig umgestimmt (gemessene Abweichung je Datei, `TUNE`; für die drei Stufen nachgemessen, Abweichung ≤ 1 Cent bis auf eine leise Datei mit 4 Cent). |
| Herkunft im Projekt | zuerst aus der Schwester-App `bokajsukriz/choirapp` übernommen (`samples/salamander/`, Abschnitt „Klavier“ in `samples/LIZENZ.md`), dann durch die drei Stufen ersetzt |

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

## Akkorderkennung (wahlweise): essentia.js

| Feld | Wert |
|---|---|
| Komponente | essentia.js 0.1.3 (Essentia 2.1-beta6-dev als WebAssembly) |
| Urheber | Music Technology Group, Universitat Pompeu Fabra |
| Quelle | npm-Paket `essentia.js@0.1.3`, https://mtg.github.io/essentia.js/ |
| Dateien | `vendor/essentia/essentia-wasm.es.js` (SHA-256 `8eab136617f42ae7a63bbd24acf69f878e6bbe29a094c510b4ac1db9ce1ea927`, WebAssembly eingebettet, ≈ 2,6 MB), `vendor/essentia/essentia.js-core.es.min.js` (SHA-256 `66d1fbad7ff55b2d5e33f147ef357019adb8a1e93f56c615e2443e554ad28c1c`) |
| Lizenz | GNU Affero General Public License 3.0 (Volltext `vendor/essentia/LICENSE-AGPL-3.0.txt`). Die App wird mit offenem Quelltext ausgeliefert; wer sie weitergibt oder als Dienst anbietet, muss das auch tun. |
| Verändert | nein |
| Geladen | nur in `ear-worker.js` (eigener Worker, weil Embind `new Function` braucht und die CSP der Seite das verbietet), erst wenn Mikrofon und Schalter „essentia“ an sind |
| Namensnennung in der App | Startscreen → „Über“ → „Lizenzen und Dank“ |

## Klick und Melodiestimme

Synthetisch erzeugt (Web Audio), keine Samples.
