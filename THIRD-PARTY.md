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
| Loslass-Geräusche | `samples/salamander/rel/<MIDI>.mp3` — je Taste (C1–C7, 73 Dateien) das Dämpfer-Geräusch `rel<Nr>` aus Tone Piano (`audio/rel1.mp3` …), auf 0,45 s gekürzt, mit kurzer Ausblendung, mono, 64 kbit/s; zusammen ≈ 0,3 MB. Gleiche Quelle und Lizenz wie oben. |
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

## Videos verkleinern: Mediabunny

| Feld | Wert |
|---|---|
| Komponente | Mediabunny 1.62.1 (Medien lesen, umwandeln, schreiben über WebCodecs) |
| Urheber | Vanilagy und Mitwirkende |
| Quelle | npm-Paket `mediabunny@1.62.1`, https://mediabunny.dev/ |
| Dateien | `vendor/mediabunny/mediabunny.min.mjs` (aus `dist/bundles/`, SHA-256 `b365395e7cd4b130553a1203fc23c52c035aedf6d1e07d6fedb4663745b5c790`, ≈ 0,7 MB) |
| Lizenz | Mozilla Public License 2.0 (Volltext `vendor/mediabunny/LICENSE-MPL-2.0.txt`) |
| Verändert | nein |
| Geladen | nur in `vidshrink.js` per `import()`, erst wenn ein Video hinzugefügt oder verkleinert wird. Startet für Zeitgeber eigene Worker aus `blob:`-Adressen, daher `worker-src 'self' blob:` in der CSP |
| Namensnennung in der App | Startscreen → „Über“ → „Lizenzen und Dank“ |

## Videos verkleinern ohne WebCodecs: ffmpeg.wasm

| Feld | Wert |
|---|---|
| Komponente | ffmpeg.wasm 0.12.15 (`@ffmpeg/ffmpeg`) mit Kern 0.12.10 (`@ffmpeg/core`, FFmpeg mit libx264 als WebAssembly, ein Thread) |
| Urheber | Jerome Wu und Mitwirkende; FFmpeg-Projekt; x264-Projekt |
| Quelle | npm-Pakete `@ffmpeg/ffmpeg@0.12.15`, `@ffmpeg/core@0.12.10`, https://github.com/ffmpegwasm/ffmpeg.wasm |
| Dateien | `vendor/ffmpeg/*.js` (aus `dist/esm/`), `vendor/ffmpeg/core/ffmpeg-core.js` (SHA-256 `67a48f11645f85439f3fde4f2119042c16b374b910206b7a7a24f342e28dcae3`), `vendor/ffmpeg/core/ffmpeg-core.wasm` (SHA-256 `9f57947a5bd530d8f00c5b3f2cb2a3492faa7e5d823315342d6a8656d0a6b7b7`, ≈ 31 MB) |
| Lizenz | Wrapper: MIT (`vendor/ffmpeg/LICENSE-MIT.txt`); Kern: GNU General Public License 2.0 oder später, weil mit libx264 gebaut (`vendor/ffmpeg/core/LICENSE-GPL-2.0.txt`). Quelltext: https://github.com/ffmpegwasm/ffmpeg.wasm, https://ffmpeg.org, https://code.videolan.org/videolan/x264 |
| Verändert | nein |
| Geladen | nur in `vidshrink.js` per `import()`, wenn WebCodecs fehlt oder das Video nicht lesen kann; läuft im eigenen Worker. Nicht in der Shell, eigener Cache `FFMPEG_CACHE` im Service Worker |
| Namensnennung in der App | Startscreen → „Über“ → „Lizenzen und Dank“ |

## Klick und Melodiestimme

Synthetisch erzeugt (Web Audio), keine Samples.
