# Pianino

Kleine, private Web-App für eine Person, die Klavier lernt, um Menschen beim
Singen zu begleiten. Geübt wird in 5-Minuten-Einheiten, das Handy steht quer
am Notenpult. Version 1 kennt einen Song: „Perfect Ruin“ (Kwabs) in a-Moll mit
den Akkorden **Am, D, F, Dm, C**.

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

## Übungen

| Übung | Was passiert | Regeln |
|---|---|---|
| Geführt | Phrasen des Songs (Zeile 1, 4, 3, Refrain, dann Strophe und ganzer Song). **Warten:** Akkord zeigen, weiter sobald er gehört wird; nach 4 s Tastenbild, nach 8 s Vorspielen. **Tempo:** Einzähler, Klick, ein Akkord pro Takt, Fehler stoppen nicht; danach wird der hakende Übergang kurz gependelt. Wer den ersten Durchgang sauber schafft, kommt sofort ins Tempo. | `phrases.js` |
| Akkord-Blitz | Akkordsymbol, Countdown mit leisem Klick, dann Auflösung mit Klang und Tastatur. Selbsteinschätzung „Saß“ / „Wackelig“ / „Nochmal“. | Leitner-Karteikasten, 5 Fächer, 4 Stufen (`leitner.js`) |
| Kurze Wege | Akkordwechsel im Loop mit Klick. Die Tastatur zeigt, welche Finger liegen bleiben und welche wandern. „Drangeblieben“ / „Rausgefallen“. | Tempo 50–60 BPM, 6 Stufen (`tempo.js`) |
| Groove | Begleitmuster im Achtelraster: Vorspiel, Einzähler, 4 Takte mitspielen. „Groovt“ / „Wackelt“. | Tempo je Stufe, 4 Stufen (`tempo.js`) |
| Play-Along | Die Strophe mit Klavierbegleitung, Klick und (sobald erfasst) Melodie. Keine Bewertung. | — |

„5 Minuten“ startet den Mix aus `mix.js`: 4 min Geführt (zu Beginn kurz eine
sitzende Phrase, die ≥ 2 Tage nicht dran war), 1 min Play-Along. Kein
eigenes Akkord-Aufwärmen mehr. „Nur 1 Minute“ ist 1 min Geführt. Akkord-Blitz,
Kurze Wege und Groove gibt es weiter einzeln auf dem Startscreen. Ein Tag zählt fürs Wochenziel (3 von 7 Tagen) ab 60 s.

## Mikrofon: drei Arten zu hören

Knopf „Hören: …“ in Geführt bzw. unter „Über“ wechselt eigen → essentia →
beide (Einstellung `ear`).
Beide prüfen nur den *erwarteten* Akkord und urteilen nur bis 1 s nach einem
Anschlag (im Ausklang sähe ein Fehlgriff irgendwann richtig aus).

- **eigen** (`hear.js`, rein): Klingen die drei Töne der rechten Hand, und
  klingt nichts Fremdes (auch nicht seit dem Anschlag)? Simulation: rechte
  Hand 100 % erkannt / 0,4 % Fehlgriffe durchgelassen, mit Bass 97,5 % / 6 %.
- **essentia** (`ear.js`, `ear-worker.js`, essentia.js im Worker): Chroma
  (HPCP) gegen das Muster des erwarteten Akkords und seiner Fehlgriff-
  Varianten. Simulation: 96 % / 0 %, mit Bass 84 % / 5 %.
- **beide**: eigen sagt ja und essentia hält den erwarteten Akkord für den
  wahrscheinlichsten. Simulation: 97,5 % / 0,4 %, mit Bass 95 % / 3,8 %.
  (Gemessen auch: „beide müssen voll zustimmen“ 75 % / 0,4 % mit Bass —
  zu streng; essentia nur als Veto gegen einen anderen Song-Akkord — bringt
  nichts.)

Die Simulation (Salamander-Samples, Raum, Handy-Mikro, Rauschen) liegt in
`docs/archiv/mikro-sim/`, ein früherer Zwischenstand auf dem Branch
`archiv/eigene-akkorderkennung`. Mit echtem Handy am echten Klavier
ist noch nichts gemessen.

## Songdaten

`song-perfect-ruin.js` — **nicht verifiziert** (`verified: false`). Die
Akkordfolge stammt aus Nutzer-Tabs, ein Akkord pro Takt ist eine Annahme.
Die Melodie ist leer (`melody: []`); ihr Format steht im Kommentar dort. Ist sie
gefüllt, spielt die App sie mit einer weichen Sinusstimme. Ändern lässt sich
das alles in dieser einen Datei, ohne Code anzufassen. Kein Liedtext in der App.

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

## Dateiübersicht

| Datei | Inhalt |
|---|---|
| `index.html` | alle Screens (S1–S8, Über, Pause, Frage-Dialog), CSP |
| `style.css` | Gestaltung, Farben, Quer-/Hochformat |
| `app.js` | Einstieg: Laden, Start, Abschluss, Über, Verdrahtung |
| `session.js` | führt einen Übungsplan aus: weiche Zeitlimits, Pause, Beenden, Wake Lock, Fortschrittsbalken, Übungszeit pro Tag |
| `store.js` | Zustand im Speicher, schreibt nach IndexedDB durch |
| `db.js` | IndexedDB, `DATA_VERSION` und Migrationen |
| `audio.js` | AudioContext, Klavier, Synth-Ersatz, Klick, Melodiestimme |
| `clock.js` | Lookahead-Scheduler |
| `keyboard.js` | Tastatur als SVG mit Markierungen und Fingerzahlen |
| `ui.js`, `log.js` | DOM-Helfer, Fehlerprotokoll |
| `exercises/*.js` | die fünf Übungen |
| `mic.js` | Mikrofon, Anschlag erkennen, Erkenner wählen |
| `hear.js` | REIN: eigener Erkenner |
| `ear.js`, `ear-worker.js` | Erkenner mit essentia.js (Worker) |
| `vendor/essentia/` | essentia.js 0.1.3 (AGPL-3.0) |
| `phrases.js` | REIN: Phrasen und Regeln für Geführt |
| `chords.js` | REIN: Akkord-Bibliothek, `transition()` |
| `leitner.js` | REIN: Karteikasten |
| `tempo.js` | REIN: Stufen und Tempo-Regeln für Kurze Wege und Groove |
| `mix.js` | REIN: 5-Minuten-Mix, Wochenziel, Song-Fortschritt |
| `melody.js` | REIN: Melodie-Ausschnitte |
| `dates.js` | REIN: Kalenderrechnung |
| `song-perfect-ruin.js` | REIN: Songdaten |
| `test-melody.js` | REIN: Testmelodie (nur Selbsttest) |
| `selftest.js` | `runSelfTests()` |
| `piano-samples.js`, `samples/salamander/` | Klavier aus der Choirapp |
| `fonts/` | Bricolage Grotesque |
| `sw.js`, `manifest.json`, `icon*` | Offline und Home-Bildschirm |

## Testen

Reine Module (Akkorde, Leitner, Tempo, Mix, Songdaten) in Node, ohne Browser:

```
node --input-type=module -e "import { runSelfTests } from './selftest.js'; const r = await runSelfTests(); process.exit(r.failed ? 1 : 0)"
```

Im Browser zusätzlich der Takt-Scheduler (8 Takte bei 60 BPM in einem
`OfflineAudioContext` gerendert und im Signal nachgemessen: 32 Schläge,
Abstand 1,000 s ± 1 ms) und ein Audio-Smoke-Test: in der Konsole
`runSelfTests()` oder Startscreen → „Über“ → „Selbsttest“.

## Lizenzen

Klaviersamples: Salamander Grand Piano (Alexander Holm), CC BY 3.0.
Schrift: Bricolage Grotesque, SIL OFL 1.1. Akkorderkennung (wahlweise):
essentia.js, AGPL-3.0. Details in `THIRD-PARTY.md`, in der
App unter „Über“.
