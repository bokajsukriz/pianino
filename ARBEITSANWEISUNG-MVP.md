# Arbeitsanweisung: Pianino MVP (Version 1.0, Song „Perfect Ruin“)

Diese Anweisung ist vollständig. Alles, was du zum Bauen brauchst, steht hier.
Die verlinkten Dokumente sind Hintergrund und privat. Kannst du sie nicht öffnen,
fehlt dir nichts.

- Konzept (Version 2): https://claude.ai/code/artifact/4c3370ab-759c-45eb-8e4e-ef9f562df1f9
- Artboard (8 Screens): https://claude.ai/artifact/AaShuMu6TJiueBER7JcH2u
- Fachliche Bewertung: https://claude.ai/artifact/YNALswLdpLCn7yQAihr4xV

---

## 1. Auftrag in einem Absatz

Baue im Repo `bokajsukriz/pianino` eine kleine, private Web-App für eine Person, die
Klavier lernt. Sie soll ihr helfen, in 5-Minuten-Einheiten zu üben, damit sie
Menschen beim Singen begleiten kann. Version 1 enthält drei Übungen und ein
Play-Along, alles nur mit den fünf Akkorden von „Perfect Ruin“ (Kwabs) in a-Moll:
**Am, D, F, Dm, C**. Die App prüft nicht, was gespielt wird (kein MIDI, kein
Mikrofon). Sie zeigt an, spielt vor, gibt den Takt vor und lässt die Person sich
selbst einschätzen. Das Handy steht dabei quer am Notenpult.

## 2. Feste Rahmenbedingungen

1. **Kein Build-Schritt.** Statische Dateien, kein Bundler, kein `package.json`,
   keine npm-Abhängigkeiten, kein Framework. Plain HTML, CSS und JavaScript als
   ES-Module. Die Schwester-App `bokajsukriz/choirapp` ist genauso gebaut, nimm sie
   als Vorbild.
2. **Keine externen Requests zur Laufzeit.** Schrift und Samples liegen im Repo.
3. **Speicher:** alles in IndexedDB (eine DB `pianino`, ein Store `meta`,
   Datensätze mit Schlüssel `id`). `localStorage` nur für ein Fehlerprotokoll.
4. **Sprache der Oberfläche:** Deutsch. Keine i18n-Infrastruktur.
5. **Zielgeräte:** Handy im Querformat (Übungsscreens, ab 844 × 390 px) und
   Hochformat (Start, Abschluss, ab 390 × 844 px). Muss in Safari unter iOS und in
   Chrome unter Android laufen. Touch-Ziele mindestens 44 × 44 px.
6. **Kein Liedtext** in der App, auch nicht auszugsweise.
7. **Der Service Worker (Offline-Betrieb) ist optional.** Baust du ihn, dann mit
   Versionskonstante wie in der Choirapp (`SW_VERSION` in `sw.js`) und mit einem
   Hinweis in der `CLAUDE.md`, dass sie bei jeder Shell-Änderung erhöht werden
   muss.

## 3. Was du aus der Choirapp übernimmst

Klone `bokajsukriz/choirapp` nur zum Lesen. Kopiere diese Teile:

| Was | Quelle in choirapp | Ziel in pianino | Hinweis |
|---|---|---|---|
| Klaviersamples | `samples/salamander/*.mp3` (25 Dateien, MIDI 24–96 in Dreierschritten, 1,8 MB) | `samples/salamander/` | unverändert kopieren |
| Lizenz der Samples | Abschnitt „Klavier“ in `samples/LIZENZ.md` | `THIRD-PARTY.md` | Salamander Grand Piano, Alexander Holm, CC BY 3.0, Fassung Tone.js. Die Namensnennung ist Pflicht und gehört auch in einen „Über“-Bereich der App. |
| Klavier-Player | `piano-samples.js` (stellt `window.ChorPiano = { load, play, nearest, rateFor, … }` bereit) | `piano-samples.js` | übernehmen, Namespace darf bleiben. Kopfkommentar anpassen (Bezug auf Choirapp-Seiten entfernen). |
| Takt-Scheduler | `metronom.html`, Funktionen `scheduleTick()`/`scheduleAhead()` (Lookahead per `setTimeout(…, 25)` auf der `AudioContext`-Uhr) | `clock.js` | als eigenes Modul neu schreiben, Prinzip übernehmen. Kein `setInterval` für Audio-Timing. |
| Schrift | `fonts/bricolage-grotesque-latin.woff2` + `LICENSE-bricolage-grotesque-OFL.txt` | `fonts/`, Lizenz ins Root | per `@font-face` lokal laden |
| Farben | `piano.html`, `:root` | `style.css` | siehe Abschnitt 8 |
| IndexedDB-Muster | `app.js`, `DB.metaGet`/`DB.metaPut` (ab ca. Zeile 965) | `db.js` | vereinfacht nachbauen, kein Code-Monolith |

Übernimm **nicht**: `app.js` als Ganzes, `strings.js`, Groove Lab, Lichtshow,
Chor-Logik, Bass-, Gitarren- und Chor-Samples. Ein Click-Sample darfst du aus
`samples/drums/` nehmen (z. B. `rim`, VCSL, CC0). Sonst synthetisierst du den Klick
(kurzer Sinus 1500 Hz auf der Eins, 1000 Hz sonst, 30 ms).

## 4. Dateistruktur (Vorschlag)

```
index.html          einzige Seite, Screens als <section>, Umschalten per JS
style.css
app.js              Einstieg: Routing zwischen Screens, Verdrahtung
db.js               IndexedDB: get/put/getAll, Migrationsnummer DATA_VERSION
audio.js            AudioContext, Entsperren beim ersten Tipp, Klavier, Klick, Melodiestimme
clock.js            Lookahead-Scheduler (Takte, Schläge, Callbacks)
chords.js           REIN: Akkord-Bibliothek (Tabelle 6.2), keine DOM-Zugriffe
leitner.js          REIN: Karteikasten-Logik (Abschnitt 7.1)
tempo.js            REIN: Tempo-Regeln (Abschnitt 7.2, 7.3)
mix.js              REIN: Zusammenstellung des 5-Minuten-Mix (Abschnitt 7.4)
song-perfect-ruin.js  REIN: Songdaten (Abschnitt 6), austauschbar
keyboard.js         Tastatur-Anzeige (SVG oder DOM), Markierungen, Fingerzahlen
exercises/blitz.js
exercises/wege.js
exercises/groove.js
exercises/playalong.js
selftest.js         runSelfTests(): reine Module + ein Audio-Smoke-Test
piano-samples.js    aus Choirapp
samples/salamander/ aus Choirapp
fonts/              aus Choirapp
README.md, CLAUDE.md, THIRD-PARTY.md, LICENSE-bricolage-grotesque-OFL.txt
```

Die als **REIN** markierten Module dürfen weder DOM noch `Date.now()` noch
`Math.random()` direkt benutzen. Zeit und Zufall werden als Parameter übergeben
(z. B. `today: '2026-10-17'`, `rand: () => number`). Dann lassen sie sich ohne
Browser prüfen:

```
node --input-type=module -e "import { review } from './leitner.js'; …"
```

## 5. Screens (siehe Artboard)

Farben, Abstände und Texte im Artboard sind die Vorlage. Abweichen ist erlaubt,
wenn es besser bedienbar ist. Dann aber in der PR begründen.

| # | Screen | Ausrichtung | Inhalt und Verhalten |
|---|---|---|---|
| S1 | Erster Start | hoch | Nur beim allerersten Öffnen. Frage „Wann gehst du am Klavier vorbei?“, drei Vorschläge („Nach dem Frühstück“, „Nach dem Abendessen“, „Wenn ich nach Hause komme“) plus ein freies Textfeld. Vorschau „Dein Plan: Nach dem Abendessen setze ich mich für 5 Minuten ans Klavier.“ Knöpfe „Passt so“ und „Überspringen“. Gespeichert als `settings.plan` (Text oder leer). |
| S2 | Start | hoch | Titel „Kurz ans Klavier?“, darunter der Plan (wenn vorhanden). Großer Knopf **„5 Minuten“** (startet den Mix, Abschnitt 7.4) mit Unterzeile der heutigen Aufteilung. Knopf **„Nur 1 Minute“** (6 Karten Akkord-Blitz). Wochenkarte mit 7 Punkten Mo–So, Ziel „3 von 7 Tagen“; heute = Ring, geübt = gefüllt, sonst leer. Verpasste Tage werden **nicht** anders markiert als zukünftige. Song-Karte „Perfect Ruin · Strophe“ mit Fortschrittsbalken (Anteil erreichter Stufen über alle Übungen) und einer Zeile mit dem aktuellen Stand. Drei kleine Direkteinstiege: Akkord-Blitz, Kurze Wege, Groove. Klein unten: „Über“ (Lizenzen). |
| S3 | Akkord-Blitz: Karte | quer | Abschnitt 7.1. Großes Symbol (≥ 120 px) mit Stufe darunter (z. B. „VI“), Countdown-Ring und Schlagpunkte. Ganze Fläche tippbar zum Auflösen. Kopfzeile: Übung und Stufe, „Karte n von m“, Restzeit der Runde, Pause-Knopf. |
| S4 | Akkord-Blitz: Auflösung | quer | Klang wird abgespielt (Akkord: LH-Ton + RH-Dreiklang gleichzeitig, 1,5 s). Links Symbol, Stufe, Tonnamen, ein Merksatz. Rechts Tastatur mit RH-Tönen pink und Fingerzahlen, LH-Ton gelb. Unten drei Knöpfe **mit Kriterium**: „Saß · im Takt, ohne Korrektur“, „Wackelig · richtig, aber spät oder korrigiert“, „Nochmal · falsch gegriffen“. |
| S5 | Kurze Wege | quer | Abschnitt 7.2. **Eine** Tastatur: Töne, die liegen bleiben, grau mit „bleibt“; Starttöne der wandernden Finger umrandet; Zieltöne pink, Fingerzahl auf beiden. Akkordleiste des Loops mit Stufen, aktueller Akkord hervorgehoben, nächster mit Rahmen. Schlagpunkte, „Takt n von 8“, BPM mit Ziel. Tipp-Kasten. Nach 8 Takten Abfrage **„Drangeblieben“ / „Rausgefallen“**. |
| S6 | Groove (Ballade) | quer | Abschnitt 7.3. Achtelraster `1 + 2 + 3 + 4 +` in zwei Zeilen (RH oben, LH unten), aktive Felder gefüllt (Offbeats heller), laufender Cursor. Aktueller und nächster Akkord groß. Schalter „Klick“ und „Melodie“. BPM mit Bereich, Tipp-Kasten. Nach jedem Block **„Groovt“ / „Wackelt“**. |
| S7 | Play-Along | quer, dunkel | Abschnitt 7.5. „jetzt“ (groß) und „gleich“, Taktfelder der Strophe mit aktuellem Takt pink, Pause, BPM, Schalter Melodie und Klick, Hinweis „Summ mit. Wenn du rausfällst: nur den Bass, und bei der nächsten Eins wieder rein.“ Keine Bewertung. |
| S8 | Abschluss | hoch, dunkel | „Das war's schon.“ Drei Zeilen Fortschritt aus der Runde, nur positiv oder neutral formuliert (z. B. „+3 Karten sicher gegriffen“, „3/3 drangeblieben – nächstes Mal 60 BPM“, „2 von 3 Tagen diese Woche“). Ein Tempo-Rückgang heißt „Tempo angepasst“. Belohnungskarte: 8 Takte Play-Along mit Melodie, startet per Knopf. Knöpfe „Noch 1 Minute“ (eine weitere Minute der letzten Übung) und „Fertig“. |

Querformat-Screens zeigen im Hochformat einen freundlichen Hinweis „Dreh das Handy
quer“, sperren aber nichts. Während einer Übung hält die App den Bildschirm wach
(`navigator.wakeLock.request('screen')`, Fehler still ignorieren).

## 6. Songdaten „Perfect Ruin“

**Wichtig:** Die Akkordfolge stammt aus Nutzer-Tabs und ist **nicht verifiziert**.
Lege alle Songdaten in `song-perfect-ruin.js` ab, mit `verified: false`, damit sie
sich später ohne Codeänderung austauschen lassen. Erfinde nichts dazu. Die
Melodiestimme wird **nicht** von dir transkribiert (siehe 7.5).

### 6.1 Eckdaten

- Tonart a-Moll, Original etwa 76–79 BPM (Noten: „Freely“, Viertel = 72), 4/4.
- Übetempo: Einstieg 55 BPM, Untergrenze 50, Ziel 60 BPM.
- Annahme bis zur Prüfung: **ein Akkord pro Takt**.
- Strophe (16 Takte): `Am D F F | Am D F F | Am Dm C F | Am Dm F F`
  (aus „Am – D – F (zweimal), dann Am – Dm – C – F, Am – Dm – F“; die
  aufgefüllten Takte sind Annahme).
- Refrain (8 Takte): `C F Dm C | F Dm C F`, danach Auflösung auf `Am` (1 Takt).
- Loops für die Übungen: **Strophen-Loop** `Am D F` (je 1 Takt, wiederholt);
  **Refrain-Loop** `C F Dm C F` (je 1 Takt, wiederholt).

### 6.2 Akkord-Bibliothek (`chords.js`)

MIDI-Nummern: 60 = C4 (eingestrichenes c). Fingersätze sind Vorschläge; sie
stehen in den Daten und lassen sich ändern.

| id | Symbol | Stufe | RH (MIDI) | RH-Töne | Finger RH | LH (MIDI) |
|---|---|---|---|---|---|---|
| `Am:root` | Am | i | 57 60 64 | A3 C4 E4 | 1-3-5 | 45 (A2) |
| `F:root` | F | VI | 53 57 60 | F3 A3 C4 | 1-3-5 | 41 (F2) |
| `C:root` | C | III | 48 52 55 | C3 E3 G3 | 1-3-5 | 36 (C2) |
| `Dm:root` | Dm | iv | 50 53 57 | D3 F3 A3 | 1-3-5 | 38 (D2) |
| `D:root` | D | IV | 50 54 57 | D3 F♯3 A3 | 1-3-5 | 38 (D2) |
| `Am:song` | Am | i | 69 72 76 | A4 C5 E5 | 1-3-5 | 45 (A2) |
| `D:song` | D | IV | 69 74 78 | A4 D5 F♯5 | 1-3-5 | 50 (D3) |
| `F:song` | F | VI | 69 72 77 | A4 C5 F5 | 1-2-5 | 41 (F2) |
| `Dm:song` | Dm | iv | 69 74 77 | A4 D5 F5 | 1-3-5 | 50 (D3) |
| `C:song` | C | III | 67 72 76 | G4 C5 E5 | 1-3-5 | 48 (C3) |

Die Song-Voicings halten die rechte Hand um das A. Für **Kurze Wege**, **Groove**
und **Play-Along** werden immer die `:song`-Voicings benutzt. Schreibe eine reine
Funktion `transition(fromId, toId)`, die `{ stay: [...], moves: [{from, to, finger}] }`
liefert (gleiche MIDI-Töne bleiben, die übrigen werden nach Fingerposition
zugeordnet). Prüfe sie im Selbsttest:

- `Am:song → F:song`: bleibt 69, 72; 76 → 77
- `F:song → Dm:song`: bleibt 69, 77; 72 → 74
- `Am:song → D:song`: bleibt 69; 72 → 74, 76 → 78

Tonnamen: Kreuz als `♯` (F♯). Im Akkord-Blitz unter dem Symbol die Stufe klein
(„i“, „IV“, „VI“, „iv“, „III“).

## 7. Logik im Detail

### 7.1 Akkord-Blitz (Leitner-Karteikasten)

**Karten:** die 10 Einträge aus 6.2, freigeschaltet nach Stufe:

| Stufe | Karten | Countdown (Schläge bei 60 BPM) |
|---|---|---|
| 1 | `Am:root`, `F:root`, `C:root`, `Dm:root` | neu 6, sonst 4 |
| 2 | + `D:root` | neu 6, sonst 4 |
| 3 | + alle `:song` | neu 6, sonst 4 |
| 4 | alle | wie oben, aber nach jedem „Saß“ dieser Karte −1 Schlag, minimal 2 |

**Ablauf einer Karte:** Symbol zeigen → Klick zählt die Schläge des Countdowns
hörbar mit (leise) → nach dem letzten Schlag oder bei Tipp: Auflösung (S4) mit
Vorspiel → Person wählt Saß / Wackelig / Nochmal.

**Gespeicherter Zustand je Karte** (`meta`-Datensatz `card:<id>`):
`{ id, box: 1..5, due: 'YYYY-MM-DD', pendingPromotion: 'YYYY-MM-DD' | null, beats, seen: number, lastResult }`

**Regeln (rein, in `leitner.js`):**

- Intervalle je Fach: 1 → 1 Tag, 2 → 2, 3 → 4, 4 → 8, 5 → 16.
- **Saß:** Liegt schon ein `pendingPromotion` von einem *anderen* Tag vor, steigt
  die Karte ein Fach (max. 5) und `pendingPromotion` wird `null`. Sonst wird
  `pendingPromotion = today` gesetzt und das Fach bleibt. In beiden Fällen gilt
  `due = today + Intervall(box)`.
- **Wackelig:** Fach bleibt, `pendingPromotion = null`, die Karte kommt in dieser
  Runde nach 3–5 anderen Karten noch einmal (falls die Runde dann noch läuft).
- **Nochmal:** Fach 1, `pendingPromotion = null`, `due = today`, Wiederholung in
  dieser Runde nach 3–5 Karten.
- **Neue Karte** (`seen === 0`): erscheint beim ersten Mal **dreimal
  hintereinander** (geblockt), danach normal. Höchstens 3 neue Karten pro Runde.
- **Rundenaufbau:** zuerst fällige Karten (`due <= today`), höchstens 12; dann bis
  zu 3 neue Karten der aktuellen Stufe; dann, falls die Runde noch Zeit hat,
  beliebige freigeschaltete Karten mit dem ältesten `due`. Die erste Karte jeder
  Runde ist eine aus Fach ≥ 3, wenn es eine gibt („mit Erfolg beginnen“). Gleiche
  Karte nie zweimal direkt hintereinander, außer beim geblockten Einstieg.
- **Kein Rückstau:** Mehr fällige Karten als Platz werden still auf die nächsten
  Tage verschoben. Die App zeigt nie eine Zahl überfälliger Karten.
- **Stufenvorschlag:** Wenn ≥ 80 % der Karten der aktuellen Stufe in Fach ≥ 3
  liegen, fragt die App nach der Runde einmal: „Bereit für Stufe n+1?“ (Ja /
  Später). Nie automatisch.

Tipps (zufällig einer pro Runde, nach Kontext): „Der Daumen bleibt auf dem A, nur
bei C rutscht er aufs G.“ · „D-Dur ist Dm mit F♯ statt F: eine schwarze Taste
höher.“ · „Lieber falsch greifen und hören als gar nicht.“ · „Moll: der mittlere
Ton liegt einen Halbton tiefer als bei Dur.“

### 7.2 Kurze Wege

**Stufen:**

| Stufe | Loop (je Akkord 1 Takt = 4 Schläge, Ganze) | Hände | Start-BPM |
|---|---|---|---|
| 1 | Pendel `Am F` und `F Dm` (je ein eigener Loop) | RH | 55 |
| 2 | Pendel `Am Dm` und `Am D` | RH | 55 |
| 3 | alle Pendel aus 1–2 | RH + LH-Grundton | 55 |
| 4 | Strophen-Loop `Am D F` | beide | 55 |
| 5 | Refrain-Loop `C F Dm C F` | beide | 55 |
| 6 | Strophe (16 Takte) → Refrain (8) → `Am` am Stück | beide | 55, Ziel 60 |

**Ablauf:** 4 Klicks Einzähler → Loop läuft 8 Takte (bei Stufe 6 die ganze Form)
mit Klick; auf jeder Eins schaltet die Anzeige weiter, auf Schlag 3 wird der
nächste Akkord schon als „gleich“ markiert → Abfrage „Drangeblieben“ /
„Rausgefallen“. Ein Durchgang ist ein Block. Neue Loops (nie geübt) laufen die
ersten 2 Blöcke **geblockt**, also ohne Wechsel zu anderen Loops. Danach wechselt
die Runde zwischen den Loops der Stufe.

**Gespeichert je Loop** (`loop:<id>`): `{ id, bpm, bestBpm, cleanStreak, lastPlayed }`

**Tempo-Regeln (rein, in `tempo.js`):**

- 3× hintereinander „Drangeblieben“ → `bpm += 4` (Streak auf 0).
- 1× „Rausgefallen“ → `bpm -= 6`, nie unter 50 (Streak auf 0).
- Obergrenze: Zieltempo 60 (Stufe 1–6). Erreicht ein Loop 60 BPM und danach noch
  3× „Drangeblieben“, gilt er als „sitzt“.
- Stufenvorschlag, wenn alle Loops der Stufe „sitzen“ (wie 7.1: fragen, nie
  automatisch).
- Wurde ein Loop ≥ 7 Tage nicht geübt, wird er bevorzugt gewählt und startet mit
  `bpm − 6` (min. 50) zum Aufwärmen. Das zählt nicht als Rückschritt.

Tipps: „Die Eins wartet nicht. Lieber nur den Bass pünktlich.“ · „Das A bleibt
liegen.“ · „Schau auf den nächsten Akkord, nicht auf die Hände.“

### 7.3 Groove (Ballade)

Raster: 8 Achtel pro Takt. Die Muster sind als Daten hinterlegt
(`rh: [0|1 × 8], lh: [0|1 × 8]`):

| Stufe | RH | LH | Akkorde | BPM-Bereich |
|---|---|---|---|---|
| 1 | `10000000` (Ganze) | `10000000` | `Am F` | 55–55 |
| 2 | `10001000` (1 und 3) | `10000000` | `Am F` | 55–60 |
| 3 | `11111111` (gerade Achtel, leise) | `10000000` | `Am F` | 55–65 |
| 4 | wie 3 | wie 3 | Strophen-Loop, dann Refrain-Loop | 60 bis 65 |

**Ablauf:** Die App spielt das Muster 1 Durchgang vor (Klavier, mit den
`:song`-Voicings und LH-Ton, RH-Offbeats mit halber Lautstärke), dann
Einzähler, dann 4 Takte mitspielen = 1 Block → Abfrage „Groovt“ / „Wackelt“. Ab
Stufe 2 läuft die Melodiestimme mit, falls vorhanden (7.5).

**Tempo:** 3 Blöcke „Groovt“ in einer Runde → `+4 BPM` bis zur Obergrenze des
Bereichs. „Wackelt“ → `−4 BPM`, nie unter die Untergrenze. Stufenvorschlag am
oberen Ende des Bereichs nach 3× „Groovt“.

Tipps: „Bass kräftig, Achtel leise – die Stimme ist die Hauptsache.“ · „Nicht
schneller werden, hör auf den Klick.“ · ab Stufe 2: „Summ die Melodie dazu.“

### 7.4 Der 5-Minuten-Mix (rein, in `mix.js`)

`buildMix(state, today) → [{ exercise, seconds }]`:

1. **60 s Aufwärmen:** Akkord-Blitz nur mit Karten aus Fach ≥ 2 (gibt es weniger
   als 3 solcher Karten: Stufe-1-Karten in Grundstellung).
2. **180 s die schwächste Übung** aus {Akkord-Blitz, Kurze Wege, Groove}.
   Schwächste = kleinster Fortschrittswert `aktuelleStufe / maxStufe` (Blitz 4,
   Wege 6, Groove 4); bei Gleichstand die am längsten nicht geübte.
3. **60 s Play-Along:** Strophe ab Takt 1, Tempo = aktuelles BPM des
   Strophen-Loops aus Kurze Wege (min. 50), Melodie an, ohne Abfrage.

Der Startscreen zeigt die heutige Aufteilung als Unterzeile, z. B.
„1 min Aufwärmen · 3 min Kurze Wege · 1 min Play-Along“.

- Zeitlimits sind weich: Eine laufende Karte oder ein laufender Block wird zu Ende
  gespielt, dann geht es weiter.
- Oben läuft ein dezenter Fortschrittsbalken über die ganze Session.
- Pause friert alles ein, „Beenden“ führt zum Abschluss-Screen mit dem bisher
  Erreichten.
- **„Nur 1 Minute“:** 6 Karten Akkord-Blitz (Regeln 7.1), dann Abschluss.
- **„Noch 1 Minute“** auf dem Abschluss: 60 s der zuletzt geübten Übung.
- Ein Tag zählt fürs Wochenziel, sobald mindestens 60 s geübt wurden. Gespeichert
  als `day:<YYYY-MM-DD>` mit `{ seconds, exercises }`. Die Woche beginnt am Montag.

### 7.5 Play-Along und Melodiestimme

- Begleitung: Klavier mit `:song`-Voicings, Muster aus Groove-Stufe 3 (LH auf 1,
  RH leise Achtel), Klick optional.
- **Melodiestimme:** Die Melodie wird **nicht** von dir erstellt. Lege in
  `song-perfect-ruin.js` ein leeres Feld `melody: []` mit dokumentiertem Format an:
  `[{ bar, beat, dur, midi }]` (bar ab 1, beat ab 1 in Vierteln, dur in Vierteln).
  Ist es leer, ist der Schalter „Melodie“ ausgegraut und zeigt „Melodie noch nicht
  erfasst“. Ist es gefüllt, wird die Melodie mit einer weichen synthetischen
  Stimme gespielt (Sinus + leichtes Vibrato 5 Hz, Hüllkurve 40 ms Attack, eine
  Oktave tiefer wählbar), lauter als die Begleitung. Liefere zum Testen eine
  **separate** Testmelodie `test-melody.js` (z. B. Tonleiter A-Moll über
  4 Takte), die nur im Selbsttest benutzt wird.
- „Summ mit“-Hinweis immer sichtbar.

## 8. Gestaltung

- Farben (aus der Choirapp): Grund `#fff7ec`, Fläche `#ffffff`, Fläche 2
  `#fff1e2`, Linie `#f1ddd0`, Text `#241b3d`, gedämpft `#6b5f86`, Akzent
  `#F868B0` (Text darauf `#241b3d`), Akzent als Text `#db0a73`. Dunkle Screens:
  Grund `#241b3d`, Karten `#33285a`, Text `#fff7ec`.
- Tastatur: RH-Töne `#F868B0`, LH-Ton `#f5b942`, „bleibt liegen“ `#6f6585` mit
  weißer Schrift, Start eines wandernden Fingers `#fde3f0` mit Rand `#db0a73`.
  Fingerzahlen auf den Tasten. Die Farben müssen sich auch in der **Helligkeit**
  unterscheiden, nicht nur im Farbton.
- Schrift: Bricolage Grotesque, lokal. Akkordsymbole sehr groß (≥ 72 px auf
  Übungsscreens, ≥ 120 px auf der Blitz-Karte).
- Keine Emojis, keine Verläufe. Icons als Inline-SVG mit `aria-hidden`, Knöpfe als
  echte `<button>`.
- Kontrast für Text mindestens 4,5:1.
- Kein Streak, kein „verloren“, keine roten Fehlerfarben bei Selbsteinschätzung.

## 9. Audio-Details

- Ein `AudioContext`, beim ersten Tipp per `resume()` entsperrt (iOS). Bis die
  Samples geladen sind, Fallback auf einen einfachen Synth-Ton. Kein Fehler
  blockiert die Übung.
- Samples mit `ChorPiano.load({ keepSec: () => 3 })` vorladen (Startscreen,
  im Hintergrund).
- Akkord vorspielen: alle Töne gleichzeitig, LH 10 % lauter als RH.
- Alle Ereignisse werden über `clock.js` auf der Audio-Uhr geplant (Lookahead
  ≥ 100 ms, Timer 25 ms). Die Anzeige folgt per `requestAnimationFrame` der
  Audio-Uhr, nicht umgekehrt.

## 10. Selbsttests und Abnahme

Lege `runSelfTests()` in `selftest.js` an (Aufruf über die Konsole und über einen
versteckten Link „Selbsttest“ im Über-Bereich). Mindestens:

1. `chords.js`: alle 10 Akkorde vorhanden; RH genau 3 Töne, aufsteigend sortiert;
   `transition()` liefert die drei Fälle aus 6.2 exakt.
2. `leitner.js`: Saß am selben Tag zweimal → kein Aufstieg; Saß an zwei
   verschiedenen Tagen → Aufstieg; Nochmal → Fach 1; Rundenaufbau mit 20 fälligen
   Karten liefert höchstens 12 fällige + 3 neue; die erste Karte kommt aus Fach ≥ 3,
   falls vorhanden; Determinismus bei gleichem `rand`.
3. `tempo.js`: 3× drangeblieben → +4; rausgefallen bei 52 → 50 (nicht 46); 7 Tage
   Pause → −6 als Aufwärmen, gespeichertes Tempo bleibt.
4. `mix.js`: Summe 300 s; schwächste Übung korrekt bei Gleichstand.
5. `clock.js`: 8 Takte bei 60 BPM planen 32 Schläge mit 1,000 s Abstand
   (±1 ms, in einem `OfflineAudioContext`).
6. Songdaten: Strophe 16, Refrain 8 Takte, alle Akkord-ids existieren.

Die reinen Tests (1–4, 6) müssen auch per `node --input-type=module -e …` laufen.
Beschreibe den Befehl in der README.

**Abnahmekriterien (alle müssen erfüllt sein):**

- [ ] Vom Startscreen aus startet „5 Minuten“ mit einem Tipp. Die Session läuft
      ohne weiteres Tippen außer den Selbsteinschätzungen und endet auf dem
      Abschluss-Screen.
- [ ] „Nur 1 Minute“ spielt 6 Karten und endet auf dem Abschluss-Screen.
- [ ] Neu laden mitten im Tag behält Fächer, BPM, Wochenpunkte und Plan.
- [ ] Im Querformat auf 844 × 390 px ist nichts abgeschnitten, ohne Scrollen.
- [ ] Der Klick bleibt bei 50–65 BPM über 2 Minuten stabil (kein hörbares Driften).
- [ ] Alle Selbsttests grün, im Browser und (reine Teile) mit Node.
- [ ] Lizenzhinweise für Salamander (CC BY 3.0) und Bricolage Grotesque (OFL) sind
      in der App („Über“) und in `THIRD-PARTY.md` vorhanden.
- [ ] Keine Netzwerkanfrage außer an die eigene Herkunft (prüfen im
      Netzwerk-Tab).
- [ ] Screenshots aller 8 Screens (Playwright, Chromium ist vorinstalliert unter
      `/opt/pw-browsers`, kein `playwright install`) liegen der PR bei oder sind
      beschrieben.

## 11. Arbeitsweise

1. Arbeite auf dem Branch, den dir die Sitzung nennt. Das Repo ist leer. Der erste
   Commit legt `README.md`, `CLAUDE.md` und diese Anweisung an. Mach kleine,
   sinnvolle Commits: Gerüst → reine Module + Tests → Audio/Clock → Akkord-Blitz →
   Kurze Wege → Groove → Play-Along → Mix/Start/Abschluss → Feinschliff.
2. `CLAUDE.md` erklärt kurz: kein Build, reine Module bleiben rein, Songdaten
   unverifiziert, wie man testet, ggf. `SW_VERSION`-Regel.
3. Halte eine Fortschrittsdatei `FORTSCHRITT-MVP.md` mit Häkchenliste der
   Abschnitte 5–10. Sie wird nach Abschluss zusammen mit dieser Anweisung nach
   `docs/archiv/` verschoben.
4. Bei Unklarheiten **nicht raten, wo es um Musik geht** (Akkorde, Takte, Melodie):
   Annahme als Konstante mit Kommentar `// ANNAHME:` markieren und in der PR
   auflisten. Bei reinen Gestaltungs- oder Technikfragen selbst entscheiden und
   begründen.
5. Nicht bauen (kommt später): Band-Playback, Song-Landkarte, weitere Songs,
   7er- und Slash-Akkorde, Web MIDI, „Melodie-Ohr“, „Neue Tonart“, Konten,
   Synchronisierung, Push-Benachrichtigungen.
6. Am Ende: PR mit Zusammenfassung, Liste aller `ANNAHME:`-Stellen, Screenshots,
   Ergebnis der Selbsttests und ehrlicher Liste dessen, was nicht geklappt hat.

## 12. Offene Punkte beim Auftraggeber (nicht von dir zu lösen)

- Akkorde und harmonischer Rhythmus von Perfect Ruin prüfen (Musicnotes
  MN0148299 oder mit der Lehrkraft).
- Melodie für Strophe und Refrain als Tonfolge erfassen.
- Stimmlage testen; falls zu hoch, später Variante in e-Moll (Em, A, C, Am, G).
- Gerät: iPhone oder Android, akustisches oder Digitalpiano.
