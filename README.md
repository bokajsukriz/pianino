# Pianino

Kleine, private Web-App für eine Person, die Klavier lernt, um Menschen beim
Singen zu begleiten. Geübt wird in 5-Minuten-Einheiten, das Handy steht quer
am Notenpult.

Songs sind **Daten**: JSON mit Akkorden, Griffen, Abschnitten und
Akkordwechseln auf halbe Schläge genau (Schema: `docs/song-schema.md`). Die
Wechsel hört man selbst heraus — im Editor „Transkribieren“ mit dem
eingebetteten YouTube-Video, verlangsamt und im Loop. Die Griffe aus dem
Unterricht (Tasten und Fingersätze) kommen in den Griff-Editor; die App zeigt
bei jedem Wechsel, welche Finger liegen bleiben, loslassen, dazukommen oder
wandern. Mitgeliefert ist nur „Perfect Ruin“ (Kwabs) mit seinen Akkorden,
noch ohne Wechsel.

Im Mittelpunkt steht „Geführt“: Phrasen aus dem Song am Stück, ohne aufs
Handy zu tippen. Auf Wunsch hört die App übers Mikrofon, ob der erwartete
Akkord liegt, und geht dann von selbst weiter (kein MIDI; nichts wird
aufgenommen oder gespeichert). Ohne Mikrofon wird getippt bzw. selbst
eingeschätzt.

## Starten

Kein Build. Irgendein statischer Webserver über das Verzeichnis genügt, z. B.

```
python3 -m http.server 8000
```

und dann `http://localhost:8000/` öffnen. (`file://` geht nicht: ES-Module,
IndexedDB und Service Worker brauchen eine echte Herkunft.) Für GitHub Pages
reicht es, den Branch zu veröffentlichen — alle Pfade sind relativ.

## Übungen und Werkzeuge

| | Was passiert | Regeln |
|---|---|---|
| Geführt | Phrasen des Songs (je Abschnitt eine, gleiche Abschnitte zusammengefasst, die mit den wenigsten verschiedenen Übergängen zuerst) in einem Gerüst: links der Akkord groß und „dann …“, rechts die Hilfe. **Warten:** weiter, sobald der Akkord gehört wird; Hilfe je Übergang in drei Stufen (1 Wechsel-Ansicht + Bewegungssatz + Bass, 2 Bewegungssatz, 3 nur der Name); Stift am Akkord öffnet den Griff-Editor. **Tempo:** Einzähler, Klick, die Wechsel im echten Rhythmus (vorgezogene Wechsel inklusive), Ankündigung vom Ereignis aus; ohne Mikrofon spielt die App leise mit (ganze Noten bzw. das Groove-Muster, sobald alle Übergänge in Stufe 3 sind). Sitzt beim Song-Tempo. | `phrases.js`, `timeline.js`, `accomp.js` |
| Wann | Nur der Zeitpunkt der Wechsel: tippen (Bildschirm, Leertaste, Pedal) oder irgendeinen Ton spielen (Mikrofon). Mit YouTube im Loop über die Phrase, sonst mit Klick und leiser Begleitung. Stufen: mit Countdown, nur Band, ohne Anzeige. | `tap.js` |
| Play-Along | YouTube-Video links, Akkordband rechts (aktueller Akkord, nächster mit Countdown „D in 1½“, Takte mit vorgezogenen Wechseln vor dem Taktstrich, Text falls eingegeben). Ganzer Song, Abschnitt oder Loop über die Phrase; Rate 0,5 / 0,75 / 1. Ohne Video/Netz: eigene Klavierbegleitung auf der Zeitleiste. | — |
| Akkord-Blitz | Akkordsymbol, Countdown, Auflösung mit Klang und Tastatur. Ab Stufe 3 die Akkorde des aktuellen Songs in seinen Griffen. | `leitner.js` |
| Kurze Wege | Pendel zwischen den häufigsten Übergängen des Songs mit Klick, die Tastatur zeigt den Wechsel. | `tempo.js` |
| Groove | Begleitmuster im Achtelraster über die Wechsel einer Phrase (4-Takt-Ausschnitte). | `tempo.js`, `accomp.js` |
| Songs | Liste, aktueller Song, Importieren (Datei oder eingefügt, Fehler auf Deutsch, Vorschau, „Ersetzen“ / „Als Kopie“), Exportieren (ohne Text voreingestellt), Löschen. | `songdata.js` |
| Griffe | Klaviatur C2–C6, Links/Rechts, Finger 1–5, Anhören, Gebrochen, Rückgängig, Notiz, Namensvorschlag („Klingt wie D/F#“), Wechsel-Ansicht „Mit Vorgänger“, Spickzettel „Alle Griffe“. Ohne Netz. | `voicing.js`, `chordsym.js` |
| Transkribieren | 1 Video und Tempo (Tipp-Tempo), 2 die Eins (±20 ms, ±1 Schlag, Raster-Check mit Klick), 3 Wechsel tippen (Knöpfe bzw. Tasten 1–9, Raster ½/¼, Rückgängig), 4 Prüfen (Band antippen: verschieben, ändern, löschen; Klavier dazu; Abschnitte; Text; „Fertig gehört“). Speichert laufend. | `tap.js`, `songdata.js` |

„5 Minuten“ startet den Mix aus `mix.js`: 30 s Wann für die aktuelle Phrase,
2½ min Geführt (zu Beginn kurz eine sitzende Phrase, die ≥ 2 Tage nicht dran
war), 2 min Play-Along (mit Video, falls Quelle und Takt 1 gesetzt). Hat der
Song noch keine Wechsel, gibt es keinen Mix: der Startscreen führt dann zu
„Transkribieren“ und „Griffe“. „Nur 1 Minute“ ist 1 min Geführt. Ein Tag
zählt fürs Wochenziel (3 von 7 Tagen) ab 60 s.

## YouTube

Einzige Ausnahme von „keine externen Requests“: das Video im Play-Along,
in „Wann“ und im Editor (`yt.js`, IFrame-API, eingebettet über
`www.youtube-nocookie.com`). Kein Analytics, kein anderer Dienst; der Service
Worker fasst fremde Herkünfte nicht an. Der Player bleibt sichtbar
(≥ 356 × 200 im Querformat) und wird nie überdeckt. `getCurrentTime()` wird
mit `performance.now()` und der Rate weitergerechnet (neu angesetzt ab 0,25 s
Abweichung); das Akkordband läuft um den Anzeige-Vorlauf (Standard 80 ms,
Schritt 2 im Editor) voraus. Kein eigener Klick zum Video. Fehler (kein Netz,
nicht einbettbar, gelöscht) werden gemeldet; ohne Netz geht es mit eigener
Begleitung weiter. Das Mikrofon ist während YouTube aus, solange man es nicht
einschaltet (dann: Kopfhörer).

## Mikrofon: drei Arten zu hören

Knopf „Hören: …“ in Geführt bzw. unter „Über“ wechselt eigen → essentia →
beide (Einstellung `ear`).
Beide prüfen nur den *erwarteten* Akkord — in dem Griff, den der Song dafür
hat (`voicing.js hearTarget`: Töne beider Hände, Tonstufen) — und urteilen
nur bis 1 s nach einem Anschlag (im Ausklang sähe ein Fehlgriff irgendwann
richtig aus). essentia vergleicht mit den übrigen Akkorden des Songs.

- **eigen** (`hear.js`, rein): Klingen die drei Töne des Akkords — in
  irgendeiner engen Lage, jede Oktave, Grundstellung oder Umkehrung
  (`checkChordAny`) — und klingt nichts Fremdes (auch nicht seit dem
  Anschlag)? Simulation: rechte Hand 98–100 % erkannt / 0,4 % Fehlgriffe
  durchgelassen; mit Bass 97 % / 4 % in anderen Lagen, 12 % in der Song-Lage
  (Bass-Obertöne ergänzen eine Nachbarlage). Für Übungen, die genau eine Lage
  verlangen: `is(id, prevId, { exact: true })` (nur die Lage aus chords.js).
- **essentia** (`ear.js`, `ear-worker.js`, essentia.js im Worker): Chroma
  (HPCP) gegen das Muster des erwarteten Akkords und seiner Fehlgriff-
  Varianten. Simulation: 96 % / 0 %, mit Bass 84 % / 5 %.
- **beide**: eigen sagt ja und essentia hält den erwarteten Akkord für den
  wahrscheinlichsten. Simulation: 97,5 % / 0,4 %, mit Bass 95 % / 3,8 %.
  (Gemessen auch: „beide müssen voll zustimmen“ 75 % / 0,4 % mit Bass —
  zu streng; essentia nur als Veto gegen einen anderen Song-Akkord — bringt
  nichts.)

Zum Ausprobieren und Fehlersuchen: „Über“ → „Mikrofon testen“ zeigt Pegel,
Anschlag, die gehörten Töne mit Oktave und Abweichung in Cent, die Tonnamen,
die essentia hört, und das Urteil beider Erkenner für alle Akkorde des
aktuellen Songs (`mictest.js`). In Geführt zeigt eine kleine Zeile unten Pegel und Töne.

Die Simulation (Salamander-Samples, Raum, Handy-Mikro, Rauschen) liegt in
`docs/archiv/mikro-sim/`, ein früherer Zwischenstand auf dem Branch
`archiv/eigene-akkorderkennung`. Mit echtem Handy am echten Klavier
ist noch nichts gemessen.

## Songdaten

Nutzerdaten in IndexedDB (`song:<id>`), Schema in `docs/song-schema.md`.
Beim Update auf Datenstand 2 legt die Migration „Perfect Ruin“ aus
`song-perfect-ruin.js` an — Titel, Tonart, Takt, Akkorde, **ohne** Griffe
(die alten stimmten nicht mit dem Unterricht), **ohne** Wechsel und Abschnitte
(„ein Akkord pro Takt“ war falsch). Alte Phrasen liegen unter
`archiv:phrase:*`; Karten und Loops bleiben. Liedtext nur vom Nutzer, nur
auf dem Gerät, nie im Repo.

## Architektur

- Eine Seite (`index.html`), Screens als `<section>`, Umschalten per JS
  (`ui.js` → `showScreen`).
- **Reine Module** ohne DOM, ohne `Date.now()`, ohne `Math.random()` — Zeit
  und Zufall kommen als Parameter. Sie enthalten alle Regeln und laufen in Node.
- **Audio:** ein `AudioContext` (`audio.js`), beim ersten Tipp entsperrt.
  Klaviersamples (Salamander) werden auf dem Startscreen im Hintergrund
  geladen; bis dahin klingt ein einfacher Synth. Alles wird über `clock.js` auf
  der Audio-Uhr geplant (Lookahead 150 ms, Timer 25 ms). Die Anzeige folgt per
  `requestAnimationFrame` der Audio-Uhr (minus Ausgabelatenz).
- **Pause** friert den `AudioContext` ein (`ctx.suspend()`): Uhr, Countdown
  und Anzeige stehen, geplante Töne bleiben geplant. Wird die Seite verborgen,
  pausiert die Session von selbst.
- **Speicher:** IndexedDB `pianino`, Store `meta`, Schlüssel `id` (`db.js`,
  Übersicht der Datensätze dort). `localStorage` nur fürs Fehlerprotokoll
  (`log.js`).
- **Offline:** `sw.js` hält die Shell im Cache (`SW_VERSION`) und die Samples
  in einem eigenen Cache.
- **Update:** Unter „Über“ stehen die Version (`SW_VERSION`, vom Service
  Worker erfragt) und „Nach Update suchen“. Hat eine neue Version übernommen,
  lädt die App neu — nie mitten in einer Übung, dann beim nächsten Startscreen.

## Dateiübersicht

| Datei | Inhalt |
|---|---|
| `index.html` | alle Screens, CSP |
| `style.css` | Gestaltung, Farben (auch `--kb-rh`/`--kb-lh`), Quer-/Hochformat |
| `app.js` | Einstieg: Laden, Start, Abschluss, Über, Verdrahtung |
| `songs.js` | Screens „Songs“ und „Import“, Export |
| `session.js` | führt einen Übungsplan aus: weiche Zeitlimits, Pause, Beenden, Wake Lock, Fortschrittsbalken, Übungszeit pro Tag |
| `store.js` | Zustand im Speicher (Songs, Fortschritt je Song), schreibt nach IndexedDB durch |
| `db.js` | IndexedDB, `DATA_VERSION`, wendet Migrationen an |
| `migrations.js` | REIN: Migrationen (`{ put, del }`, idempotent) |
| `audio.js` | AudioContext, Klavier, Synth-Ersatz, Klick, Melodiestimme, Anschläge planen |
| `clock.js` | Lookahead-Scheduler |
| `yt.js` | YouTube-Player, geglättete Videozeit |
| `band.js` | Akkordband (Play-Along, Wann, Editor) |
| `keyboard.js` | Tastatur als SVG: Griffe, Wechsel-Ansicht, Eingabe |
| `ui.js`, `log.js` | DOM-Helfer, Fehlerprotokoll |
| `exercises/*.js` | Geführt, Wann, Play-Along, Akkord-Blitz, Kurze Wege, Groove; Griff-Editor (`griffe.js`), Transkribieren (`transcribe.js`) |
| `mic.js` | Mikrofon, Anschlag erkennen, Erkenner wählen |
| `mictest.js` | Mikrofon-Test (Pegel, Töne, Urteile) |
| `hear.js` | REIN: eigener Erkenner |
| `ear.js`, `ear-worker.js` | Erkenner mit essentia.js (Worker) |
| `vendor/essentia/` | essentia.js 0.1.3 (AGPL-3.0) |
| `songdata.js` | REIN: Song-JSON prüfen, normalisieren, exportieren, bearbeiten |
| `chordsym.js` | REIN: Akkordsymbole lesen, Namen aus Tasten |
| `voicing.js` | REIN: Griffe, Standardlage, `voicingDiff` |
| `timeline.js` | REIN: Schläge ↔ Sekunden, Akkord zur Zeit, Phrasen |
| `tap.js` | REIN: YouTube-ID, Tipp-Tempo, Tipps werten, Stufen für Wann |
| `accomp.js` | REIN: Begleitung je Achtel auf der Zeitleiste |
| `phrases.js` | REIN: Phrasen und Regeln für Geführt |
| `chords.js` | REIN: feste Akkorde (Akkord-Blitz), Tonnamen, Bewegungssätze |
| `leitner.js` | REIN: Karteikasten |
| `tempo.js` | REIN: Stufen und Tempo für Kurze Wege und Groove |
| `mix.js` | REIN: 5-Minuten-Mix, Wochenziel |
| `melody.js` | REIN: Melodiestimme eines Songs |
| `dates.js` | REIN: Kalenderrechnung |
| `song-perfect-ruin.js` | REIN: alte Songdaten, nur noch Quelle der Migration |
| `test-melody.js` | REIN: Testmelodie (nur Selbsttest) |
| `selftest.js` | `runSelfTests()` |
| `piano-samples.js`, `samples/salamander/` | Klavier aus der Choirapp |
| `fonts/` | Bricolage Grotesque |
| `sw.js`, `manifest.json`, `icon*` | Offline und Home-Bildschirm |
| `docs/song-schema.md` | Schema der Song-JSONs |

## Testen

Reine Module (Akkorde, Leitner, Tempo, Mix, Song-JSON, Akkordsymbole,
Griffe, Zeitleiste, Tippen, Migration) in Node, ohne Browser:

```
node --input-type=module -e "import { runSelfTests } from './selftest.js'; const r = await runSelfTests(); process.exit(r.failed ? 1 : 0)"
```

Im Browser zusätzlich der Takt-Scheduler (8 Takte bei 60 BPM in einem
`OfflineAudioContext` gerendert und im Signal nachgemessen: 32 Schläge,
Abstand 1,000 s ± 1 ms; dazu ein Tempo-Durchgang von „Geführt“ mit einem
Wechsel auf „4 und“, nachgemessen auf dem richtigen Achtel) und ein
Audio-Smoke-Test: in der Konsole
`runSelfTests()` oder Startscreen → „Über“ → „Selbsttest“.

## Lizenzen

Klaviersamples: Salamander Grand Piano (Alexander Holm), CC BY 3.0.
Schrift: Bricolage Grotesque, SIL OFL 1.1. Akkorderkennung (wahlweise):
essentia.js, AGPL-3.0. Details in `THIRD-PARTY.md`, in der
App unter „Über“.
