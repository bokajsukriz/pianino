# Arbeitsanweisung: Songs selbst transkribieren, mit YouTube üben

Diese Anweisung baut auf dem bestehenden Stand von `pianino` auf (Branch
`claude/new-session-85wxbd`). Lies vor dem Start `README.md`, `CLAUDE.md`,
`song-perfect-ruin.js`, `phrases.js`, `exercises/guided.js`,
`exercises/playalong.js`, `exercises/groove.js`, `hear.js`, `mic.js` und
`db.js`. Was hier nicht geregelt ist, folgt den Regeln in `CLAUDE.md`.

Lege diese Datei als `docs/ARBEITSANWEISUNG-TRANSKRIPTION.md` ins Repo und
führe eine Fortschrittsliste `docs/FORTSCHRITT-TRANSKRIPTION.md` wie beim MVP.

---

## 1. Auftrag in einem Absatz

Bisher steckt ein Song fest im Code, mit der Annahme „ein Akkord pro Takt“.
Das ist für „Perfect Ruin“ falsch: Der Song lebt von vorgezogenen Wechseln und
wechselndem harmonischem Rhythmus. Künftig ist ein Song **importierte Daten**
(JSON) mit Akkordwechseln auf halbe Schläge genau. Der Nutzer hört die Wechsel
**selbst heraus**, mit dem eingebetteten YouTube-Video, verlangsamt und im
Loop, und tippt sie in einem Editor ein. Danach übt er mit genau diesen Daten:
„Geführt“ und „Groove“ laufen auf der echten Zeitleiste, und ein neues
Play-Along spielt das YouTube-Video mit mitlaufendem Akkordband. Die Griffe (Tasten und Fingersätze, wie im Unterricht gespielt)
gibt der Nutzer in einem **Griff-Editor** auf einer Klaviatur ein, und die App
zeigt bei jedem Wechsel, welche Finger liegen bleiben, loslassen oder
dazukommen. Eine automatische Akkorderkennung aus Audio ist ausdrücklich
**nicht** Teil des Auftrags.

## 2. Feste Rahmenbedingungen

1. Alles aus `CLAUDE.md` gilt weiter: kein Build, keine npm-Abhängigkeiten,
   reine Module bleiben rein, Audio-Timing nur über `clock.js`,
   `SW_VERSION` bei jeder Shell-Änderung erhöhen.
2. **Ausnahme von „keine externen Requests“: nur YouTube**, nur für das
   Abspielen des Videos (Abschnitt 6). Keine anderen Dienste, kein Analytics.
   Ohne Netz läuft alles außer dem YouTube-Play-Along und dem Editor weiter.
3. **Liedtext:** Die App darf vom Nutzer *selbst eingegebenen* Text lokal in
   IndexedDB speichern und anzeigen. **Im Repo steht nie Liedtext**, auch nicht
   in Tests, Beispielen oder Kommentaren. Tests verwenden Platzhalter wie
   `"Zeile A"`. Du schreibst oder ergänzt nie Liedtext, auch nicht auf Bitte.
   Passe `CLAUDE.md` entsprechend an („Kein Liedtext im Repo“ statt „Kein
   Liedtext in der App“).
4. Songdaten sind Nutzerdaten. Außer der Übernahme von „Perfect Ruin“
   (Abschnitt 4.4) kommt **kein neuer Song ins Repo**.
5. Musikalische Annahmen im Code weiter mit `// ANNAHME:` markieren.

## 3. Begriffe

- **Schlag (beat):** Zählzeit. Schlag 0 ist die Eins von Takt 1.
- **Zeitleiste:** Umrechnung zwischen Schlägen und Sekunden im Video,
  festgelegt durch `bpm` und `offsetSec` (Sekunde im Video, an der Schlag 0
  liegt).
- **Ereignis (event):** `{ at, chord }`. Ab Schlag `at` klingt `chord`, bis
  zum nächsten Ereignis. `at` ist ein Vielfaches von 0,5 (Raster: Achtel).
- **Abschnitt (section):** benannter Taktbereich, z. B. „Strophe 1“.
- **Phrase:** Übe-Einheit in „Geführt“. Standardmäßig ein Abschnitt (4.3).

## 4. Datenmodell

### 4.1 Song-JSON (Import und Export)

Neues reines Modul `songdata.js` mit `validateSong(json)` →
`{ ok, song, errors: [deutsche Meldungen] }` und `normalizeSong(json)`.
Schema, Version 1:

```json
{
  "schema": 1,
  "id": "perfect-ruin",
  "title": "Perfect Ruin",
  "artist": "Kwabs",
  "key": "a-Moll",
  "beatsPerBar": 4,
  "bpm": 77,
  "verified": false,
  "chords": ["Am", "D/F#", "F6/9", "Dm", "C"],
  "voicings": {
    "D/F#": {
      "rh": [57, 62], "rhFingers": [1, 3],
      "lh": [42, 50], "lhFingers": [5, 1],
      "note": "Fis nur im Bass"
    }
  },
  "sources": [
    { "type": "youtube", "videoId": "XXXXXXXXXXX", "kind": "official",
      "durationSec": 0, "offsetSec": null }
  ],
  "sections": [
    { "id": "v1", "name": "Strophe 1", "bar": 1, "bars": 16 }
  ],
  "events": [
    { "at": 0, "chord": "Am" },
    { "at": 3.5, "chord": "D" }
  ],
  "lyrics": [
    { "at": 0, "line": "…" }
  ],
  "notes": "Freitext, z. B. Quellen und Unsicherheiten"
}
```

Regeln für die Validierung:

- Pflicht: `schema`, `id` (Kleinbuchstaben, Ziffern, `-`), `title`,
  `beatsPerBar`, `chords` (mind. 1), `sections` (darf leer sein),
  `events` (darf leer sein).
- `bpm` 30–220 oder `null` (noch nicht bestimmt). `offsetSec` ≥ 0 oder `null`.
- `events`: aufsteigend nach `at`, kein `at` doppelt, `at` ≥ 0 und auf 0,5
  gerundet, jedes `chord` steht in `chords`. Zwei aufeinanderfolgende
  Ereignisse mit gleichem Akkord werden beim Normalisieren zusammengefasst.
- `sections` dürfen sich nicht überlappen, Takte sind 1-basiert.
- `voicings` ist optional, je Akkordsymbol aus `chords`. Regeln in 4.5.
- `lyrics` ist optional. Beim **Export** ist „ohne Text“ voreingestellt.
- Unbekannte Felder bleiben erhalten (für spätere Schemaversionen).

Leg das Schema zusätzlich als `docs/song-schema.md` ab, kurz und mit einem
Beispiel ohne Liedtext. Das Dokument dient auch dazu, Song-JSONs außerhalb
der App (z. B. im Chat) vorzubereiten.

### 4.2 Akkordsymbole und Griffe

Neues reines Modul `chordsym.js`:

- `parseChord(symbol)` → `{ root, quality, bass, pcs }` für mindestens
  `X`, `Xm`, `X6`, `Xm6`, `X6/9`, `Xadd9`, `X7`, `Xm7`, `Xmaj7`, `Xsus2`,
  `Xsus4`, `Xdim`, `Xaug` und Slash-Akkorde `X/Y`. Achtung: In `F6/9` ist
  der Schrägstrich Teil des Typs, kein Basston; `F6/9/A` ist F6/9 mit A im
  Bass. `pcs` sind die Tonstufen (0–11).
  Unbekannte Symbole → `null`, die App zeigt dann nur den Namen.
- `defaultVoicing(symbol)` (in `voicing.js`, 4.5): Dreiklang in
  Grundstellung um C4, Bass eine Oktave tiefer (bei Slash-Akkord der
  Basston), Fingersätze rechts 1-3-5, links 5. Bei Vier- und Mehrklängen
  den Ton weglassen, den eine Begleitung am ehesten weglässt (Quinte).
  `// ANNAHME:` kennzeichnen. Der Griff gilt als „Standardlage“ und wird in
  der App so beschriftet.
- Ein Song verwendet `song.voicings[symbol]`, sonst `defaultVoicing`.
- `nameFromKeys(midiNotes)` → Liste passender Akkordsymbole (Basston =
  tiefster Ton), für den Namensvorschlag im Griff-Editor. Bei mehreren
  Möglichkeiten die gebräuchlichste zuerst (`// ANNAHME:`).

`chords.js` bleibt, wird aber so umgebaut, dass `transition()`,
`moveText()` und `bassText()` mit Griff-Objekten statt mit festen ids
arbeiten. `moveText()` baut seine Sätze künftig aus `voicingDiff` (4.5),
z. B. „Daumen bleibt auf A. C und E loslassen, 3 auf D.“ Ohne Fingersätze
nennt er nur Töne. Die festen `:root`-Griffe bleiben für den Akkord-Blitz erhalten.

`hear.js` und `ear-worker.js`: Lies zuerst, wie sie heute den erwarteten
Akkord bekommen. Falls sie an ids aus `chords.js` hängen, stelle auf
Tonstufen (`pcs`) bzw. Griff-Objekte um. **Ändere an der Erkennung selbst
nichts** und prüfe gegen `docs/archiv/mikro-sim/`, dass die Ergebnisse
unverändert sind.

### 4.3 Zeitleiste

Neues reines Modul `timeline.js`:

- `beatToSec(song, beat)`, `secToBeat(song, sec)` über `bpm` und `offsetSec`.
- `chordAt(song, beat)` → Akkordsymbol oder `null` (vor dem ersten Ereignis).
- `eventsIn(song, fromBeat, toBeat)` → Ereignisse im Bereich; das am Anfang
  klingende Ereignis wird als Ereignis bei `fromBeat` mitgeliefert.
- `quantize(beat, grid = 0.5)`.
- `sectionRange(song, section)` → `{ fromBeat, toBeat }`.
- `phrasesOf(song)`: Standard: je Abschnitt eine Phrase. Abschnitte mit
  identischer Ereignisfolge (relativ zum Abschnittsanfang) werden zu einer
  Phrase zusammengefasst; der Name nennt alle („Strophe 1/2“).
- `chordSequence(song, fromBeat, toBeat)` → Akkordfolge ohne Zeiten, gleiche
  Nachbarn zusammengefasst (für den Warten-Modus).

Die Zeitleiste ist für Version 1 **gleichmäßig** (ein festes Tempo). Schwankt
eine Aufnahme hörbar, zeigt der Raster-Check (7.2) das. Eine Liste einzelner
Schlagzeiten ist für später vorgesehen; lass im Schema Platz dafür
(`beatTimes` optional, wird in Version 1 ignoriert, aber erhalten).

### 4.4 Speicher und Übernahme von „Perfect Ruin“

- Neue Datensätze in IndexedDB: `song:<id>` (normalisierter Song inklusive
  Text) und in `settings` das Feld `currentSong`.
- `DATA_VERSION` → 2. Migration 2:
  1. Aus `song-perfect-ruin.js` einen Song `perfect-ruin` erzeugen:
     Titel, Tonart, `beatsPerBar` und `chords` übernehmen. **Keine Griffe
     übernehmen:** Die `:song`-Griffe der alten Version stimmen nicht mit
     dem Unterricht überein; der Nutzer gibt sie im Griff-Editor neu ein.
     Bis dahin gilt die Standardlage. `bpm: null`, `sources: []`, **`events: []`,
     `sections: []`**. Die bisherige Taktfolge ist bekanntlich falsch und wird
     nicht übernommen. In `notes`: „Akkorde aus Tabs; Wechsel noch nicht
     transkribiert.“
  2. Alte `phrase:*`-Datensätze unter `archiv:phrase:*` ablegen, nicht
     löschen. Der Fortschritt in „Geführt“ beginnt für den Song neu.
     (Entscheidung: Die alten Phrasen beruhten auf falschen Daten.)
  3. `card:*` (Akkord-Blitz) und `loop:*` bleiben unverändert.
- `song-perfect-ruin.js` bleibt nur als Quelle der Migration bestehen. Danach
  liest keine Übung mehr daraus. Kommentar entsprechend anpassen.
- Neue Datensätze für den Fortschritt je Song: `phrase:<songId>:<phraseId>`.
  Die Übergangs-Schlüssel in `phrases.js` werden Symbolpaare (`"Am>D"`).

### 4.5 Griffe

Neues reines Modul `voicing.js`. Ein Griff:

```json
{
  "rh": [57, 60, 62, 67], "rhFingers": [1, 2, 3, 5],
  "lh": [41, 48],         "lhFingers": [5, 1],
  "note": "Daumen bleibt auf A"
}
```

- `rh`, `lh`: MIDI-Nummern, aufsteigend, je Hand 0–5 Töne, zusammen
  mindestens 1. Keine Taste in beiden Händen.
- `rhFingers`, `lhFingers`: gleich lang wie die Tasten, Werte 1–5 oder
  `null` (Finger unbekannt). Kein Finger doppelt in einer Hand.
- `note`: optional, höchstens 140 Zeichen.
- `validateVoicing(v)` → `{ ok, errors, warnings }`. **Warnung** (kein
  Fehler), wenn die Fingerfolge nicht zur Tonfolge passt (rechts sollten
  Finger mit der Tonhöhe steigen, links fallen) oder eine Hand mehr als
  eine Oktave plus Terz greift. Untersatz und Spreizung sind erlaubt.
- `voicingDiff(prev, next)` → je Hand Listen `keep`, `release`, `add`,
  `move` (gleicher Finger, andere Taste, mit Abstand in Halbtönen). Ohne
  Fingersätze wird über Töne verglichen.
- Migration der Griff-Felder: ein alter Griff mit `lh` als Zahl und
  `fingers` wird zu `lh: [n]`, `lhFingers: [null]`, `rhFingers: fingers`.

## 5. Bildschirme (Überblick)

Neu oder geändert, jeweils als `<section>` in `index.html`:

| Screen | Format | Inhalt |
|---|---|---|
| Songs | Hochformat | Liste der Songs, aktueller Song markiert, „Importieren“, je Song: „Üben“, „Griffe“, „Transkribieren“, „Exportieren“, „Löschen“ (mit Rückfrage) |
| Import | Hochformat | Datei wählen oder JSON einfügen, Fehlerliste auf Deutsch, Vorschau (Titel, Akkorde, Zahl der Ereignisse), „Übernehmen“. Gleiche `id` vorhanden → Rückfrage „Ersetzen“ / „Als Kopie“ |
| Griffe | Querformat | Abschnitt 8 |
| Transkribieren | Querformat | Abschnitt 7 |
| Play-Along | Querformat | wird auf YouTube umgestellt, Abschnitt 6.3 |
| Start | Hochformat | zeigt den aktuellen Song; Wechsel über „Songs“ |

Ohne Ereignisse kann ein Song nicht in „Geführt“ geübt werden. Der
Startscreen führt dann sichtbar zu „Transkribieren“.

## 6. YouTube

### 6.1 Einbindung

- Modul `yt.js` (nicht rein) kapselt die IFrame-Player-API: laden,
  `create(host, videoId)`, `play()`, `pause()`, `seek(sec)`,
  `setRate(r)`, `rates()`, `now()`, Ereignisse `ready`, `state`, `error`.
- Einbetten über `www.youtube-nocookie.com`.
- CSP in `index.html` minimal erweitern. Ausgangspunkt:
  `script-src 'self' https://www.youtube.com https://s.ytimg.com;`
  `frame-src https://www.youtube-nocookie.com https://www.youtube.com;`.
  Prüfe im Browser (Konsole, CSP-Verstöße), welche Quellen wirklich nötig
  sind, und trage nur diese ein. **Kein** `unsafe-eval`, kein `unsafe-inline`.
- `sw.js` darf YouTube-Anfragen nicht cachen und nicht abfangen
  (nur gleiche Herkunft bearbeiten).
- Der Player bleibt **immer sichtbar**, mindestens 200 × 200 CSS-Pixel
  (Nutzungsbedingungen von YouTube), und wird nicht überdeckt. Im
  Querformat: Video links oben, 16:9, mindestens 356 × 200.
- Fehlerfälle mit verständlicher Meldung: kein Netz, Video nicht
  einbettbar, Video gelöscht, Werbung läuft (Zeitleiste pausiert, solange
  der Player nicht im Zustand „spielt“ ist).

### 6.2 Zeit und Synchronisation

- `getCurrentTime()` ist grob. Nimm in `requestAnimationFrame` die zuletzt
  gemeldete Zeit und rechne mit `performance.now()` und der Abspielrate
  weiter. Weicht ein neuer Messwert um mehr als 0,25 s ab, neu ansetzen.
- Einstellung **„Anzeige-Vorlauf“** (0–300 ms, Standard 80 ms) in
  `settings`, damit das Akkordband nicht hinter dem Ton herläuft.
- Kein eigener Klick zum YouTube-Video. Das Original ist das Metronom.
  Optional ein sichtbarer Schlag-Punkt.
- **Loop A–B:** Bereich in Takten oder ein Abschnitt. Erreicht die Zeit
  B, `seek(A − Vorlauf)`, wobei Vorlauf ein Takt ist, damit man
  hineinkommt. Der Loop läuft, bis der Nutzer ihn beendet.
- **Tempo:** die von `rates()` gemeldeten Raten anbieten, mindestens
  0,5 / 0,75 / 1, soweit verfügbar.
- Mikrofon während YouTube: standardmäßig **aus**. Wird es eingeschaltet,
  Hinweis „Mit Kopfhörern, sonst hört das Mikrofon den Song mit.“

### 6.3 Play-Along mit YouTube

`exercises/playalong.js` neu:

- Querformat: Video links, rechts das **Akkordband**: der aktuelle Akkord
  groß, der nächste mit Countdown in Schlägen („D in 1½“), darunter eine
  Zeile mit den Takten des Abschnitts. Ein vorgezogener Wechsel wird im Band
  sichtbar vor dem Taktstrich gezeichnet.
- Ist Text vorhanden, die aktuelle Zeile darunter, die nächste blass.
- Auswahl: ganzer Song, ein Abschnitt oder Loop über die gerade geübte
  Phrase. Tempo-Auswahl wie in 6.1.
- Keine Bewertung. Ergebnis für die Sitzung: gespielte Sekunden.
- Hat der Song keine YouTube-Quelle oder kein `offsetSec`, fällt das
  Play-Along auf die bisherige Variante mit eigener Klavierbegleitung zurück,
  aber mit der Zeitleiste statt „ein Akkord pro Takt“.

## 7. Transkribieren (Editor)

Neuer Screen, Modul `exercises/transcribe.js`, reine Logik in `tap.js`.
Der Editor führt in vier Schritten, jeder jederzeit wieder erreichbar.

### 7.1 Schritt 1: Video und Tempo

- Video-ID oder YouTube-Link eingeben (aus dem Link die ID ziehen,
  `tap.js: parseYouTubeId`). `durationSec` aus dem Player übernehmen.
- **Tempo:** aus dem JSON übernehmen oder per Tipp-Tempo bestimmen
  (mindestens 8 Tipps, Mittelwert der Abstände ohne Ausreißer,
  `tap.js: tapTempo`). Auf ganze BPM runden, ±1 per Knopf.

### 7.2 Schritt 2: Die Eins finden

- Nutzer spielt bis zum ersten Taktanfang und tippt „Hier ist Takt 1“.
  Daraus `offsetSec` (Tippzeit minus Anzeige-Vorlauf).
- Feinjustieren per ±20 ms und ±1 Schlag.
- **Raster-Check:** Video läuft, die App zeigt die Schläge als Punkte und
  spielt auf Wunsch einen leisen Klick dazu. Hinweistext: „Läuft der Klick
  am Ende noch mit? Wenn nicht: Tempo um 1 ändern.“ Hier ist der Klick
  erlaubt, weil er nur zur Kontrolle dient. Nutze die Zeitumrechnung aus
  6.2, nicht `clock.js`; die Genauigkeit reicht für die Kontrolle.

### 7.3 Schritt 3: Wechsel tippen

- Das Video läuft (Rate wählbar, Standard 0,75), optional im Loop über
  einen Bereich.
- Unten große Knöpfe, einer je Akkord aus `chords`, in der Reihenfolge der
  Liste, dazu „+ Akkord“ (Symbol eingeben, wird geprüft und an `chords`
  angehängt).
- Tippt der Nutzer einen Akkordknopf, entsteht ein Ereignis bei der
  aktuellen Zeit, **auf halbe Schläge gerastert** (`quantize`). Raster
  umschaltbar ½ / ¼ (bei ¼ dürfen `at`-Werte Viertel von Schlägen sein;
  dann die Validierung in 4.1 entsprechend erweitern).
- Ein Ereignis an einer Stelle, an der schon eines liegt, ersetzt es.
- „Rückgängig“ für den letzten Tipp, mehrstufig.
- Tastatur und Bluetooth-Pedal: Zifferntasten 1–9 für die Akkordknöpfe,
  Leertaste für Pause.

### 7.4 Schritt 4: Prüfen und Abschnitte

- Das Akkordband aus 6.3 läuft mit dem Video. Antippen eines Ereignisses
  wählt es aus: verschieben um ±½ Schlag, Akkord ändern, löschen.
- Optional: „Klavier dazu“ spielt die Griffe leise zum Video, damit falsche
  Akkorde auffallen. (Hier über `clock.js`, synchron zur Zeitleiste
  gestartet; leichte Abweichungen sind hinnehmbar.)
- **Abschnitte:** Takt markieren, „Abschnitt beginnt hier“, Namen wählen
  (Vorschläge: Intro, Strophe, Pre-Chorus, Refrain, Bridge, Outro, mit
  automatischer Nummer).
- **Text (optional):** Zeilen einfügen (ein Textfeld, eine Zeile pro
  Zeile), dann beim Abspielen pro Zeile einmal tippen. Rasterung auf ganze
  Schläge. Hinweis neben dem Feld: „Text bleibt nur auf diesem Gerät.“
- „Fertig gehört“ setzt `verified: true` erst nach Rückfrage
  („Mit der Aufnahme gegengehört?“).

Alles wird laufend in `song:<id>` gespeichert, kein „Speichern“-Knopf.

## 8. Griff-Editor

Neuer Screen, Modul `exercises/griffe.js`, reine Logik in `voicing.js`.
Erreichbar über „Songs“ → „Griffe“ und aus „Geführt“ über ein kleines
Stift-Symbol am aktuellen Akkord. Er funktioniert ohne Netz und ohne
Transkription, damit der Nutzer die Griffe direkt nach der Stunde
eintragen kann.

### 8.1 Aufbau

- Oben eine Leiste mit allen Akkorden des Songs in der Reihenfolge von
  `chords`; der gewählte ist hervorgehoben, Akkorde ohne eigenen Griff
  tragen den Hinweis „Standardlage“. „+ Akkord“ legt ein neues Symbol an
  (Prüfung über `parseChord`). Langes Drücken: umbenennen, löschen (mit
  Rückfrage; nicht möglich, solange Ereignisse das Symbol verwenden).
- In der Mitte die Klaviatur über `keyboard.js`, Umfang C2–C6, seitlich
  verschiebbar, beim Öffnen auf den Griff zentriert. Tasten mindestens
  44 px hoch nutzbar; weiße Tasten im Querformat mindestens 28 px breit,
  dafür lieber verschieben als stauchen.
- Darunter: Umschalter **Links / Rechts**, Fingerknöpfe **1–5** und
  **„–“** (Finger löschen), Knöpfe **„Anhören“**, **„Gebrochen“**,
  **„Rückgängig“**, Notizfeld.

### 8.2 Eingabe

- Tippen auf eine Taste schaltet sie für die gewählte Hand an oder aus.
  Gehört sie schon zur anderen Hand, wechselt sie die Hand.
- Ist ein Fingerknopf gewählt, setzt Tippen auf eine angeschaltete Taste
  den Finger (ein Finger, der in dieser Hand schon vergeben ist, wandert
  mit). Danach springt die Auswahl auf den nächsten Finger, damit man
  1-2-3-5 zügig durchtippt.
- Farben: linke und rechte Hand deutlich verschieden (Farbtokens in
  `style.css`), Fingerzahl auf der Taste. Nicht allein über Farbe
  unterscheiden: die linke Hand zusätzlich mit „L“ im Tastenrand.
- Gespeichert wird bei jeder Änderung in `song:<id>`. „Rückgängig“ wirkt
  mehrstufig innerhalb der Sitzung.
- Passt der Name nicht zu den Tasten (`nameFromKeys` liefert das Symbol
  nicht), dezenter Hinweis mit Vorschlägen, z. B. „Klingt wie D/F#.
  Umbenennen?“ Nie automatisch umbenennen.
- Warnungen aus `validateVoicing` erscheinen als eine Zeile unter der
  Klaviatur, ohne die Eingabe zu blockieren.

### 8.3 Anhören

- „Anhören“: beide Hände gleichzeitig über die vorhandenen
  Klaviersamples, Lautstärke wie im Warten-Modus.
- „Gebrochen“: links von unten nach oben, dann rechts, Achtel bei 90 BPM
  über `clock.js`.

### 8.4 Wechsel-Ansicht

Für den Wiedereinstieg das Wichtigste. Umschalter **„Mit Vorgänger“**:

- Der Griff des vorherigen Akkords erscheint blass auf derselben
  Klaviatur. Vorgänger ist der Akkord davor in der Ereignisfolge des Songs;
  ohne Ereignisse der davor in `chords`. Gibt es mehrere Vorgänger, kann
  man durchschalten.
- Markierung aus `voicingDiff`: bleibt liegen (Punkt), loslassen
  (durchgestrichen, blass), dazu (Ring), Finger wandert (Pfeil von alter zu
  neuer Taste mit Fingerzahl).
- Darunter ein Satz aus `moveText`, z. B. „Rechts: Daumen bleibt auf A,
  2 auf C und 5 auf G dazu. Links: eine Stufe tiefer.“
- Dieselbe Ansicht ersetzt in „Geführt“ das bisherige Tastenbild der
  Hilfe-Stufe 1 und in „Kurze Wege“ die Übergangsanzeige.

### 8.5 Spickzettel

Ein Knopf „Alle Griffe“ zeigt alle Akkorde des Songs untereinander als
kleine Tastenbilder mit Fingern und Notiz, ohne Bedienelemente, im
Hochformat lesbar. Das ist die Ansicht „Wie haben wir das gespielt?“ für den
Moment, in dem man sich nach Wochen ans Klavier setzt.

## 9. Üben auf der Zeitleiste

### 9.1 Geführt

- Phrasen aus `timeline.phrasesOf(song)` statt `phraseDefs(SONG)`.
  Lernreihenfolge: wie im Song, außer dass Phrasen mit den wenigsten
  verschiedenen Übergängen zuerst kommen (bei Gleichstand Reihenfolge im
  Song). `// ANNAHME:` kennzeichnen.
- **Warten-Modus** unverändert, mit `chordSequence` als Folge. Hilfe-Stufen,
  Auf- und Abstieg wie bisher in `phrases.js`.
- **Tempo-Modus** spielt die Ereignisse der Phrase im echten Rhythmus,
  mit Einzähler und Klick über `clock.js` (Schritte sind Achtel, `at` auf
  halben Schlägen passt direkt darauf). Ankündigung des nächsten Akkords
  rechnet vom Ereignis aus, nicht von der Eins.
- **Begleitmuster im Tempo-Modus:** Sind alle Übergänge der Phrase in
  Stufe 3, läuft der Tempo-Modus mit dem Muster der aktuellen
  Groove-Stufe statt mit ganzen Noten. Je Achtel wird der Akkord gespielt
  bzw. angezeigt, der laut `chordAt` gerade gilt. Ein vorgezogener Wechsel
  ergibt sich dadurch von selbst.
- Bewertung im Tempo-Modus (mit Mikrofon): je Ereignis ein Fenster von
  `EARLY` vor bis 1 Schlag nach `at`, statt je Takt. `repairPairs` arbeitet
  mit Ereignissen statt Takten.
- Ziel-Tempo „sitzt“: das Song-`bpm` statt fest 60. `GUIDE.target` wird
  zum Mindestwert, falls `bpm` fehlt.

### 9.2 Neue Übung „Wann“ (Rhythmus der Wechsel)

Übt nur den Zeitpunkt, ohne Griffe. Modul `exercises/wann.js`, reine
Auswertung in `tap.js: scoreTaps`.

- Läuft mit YouTube (Loop über eine Phrase) oder, ohne Video, mit Klick und
  leiser Klavierbegleitung über `clock.js`.
- Der Nutzer tippt bei jedem Akkordwechsel (Bildschirm, Leertaste, Pedal)
  oder spielt am Klavier irgendeinen Ton (Mikrofon, Anschlagserkennung aus
  `mic.js`).
- Auswertung je Ereignis: getroffen (innerhalb ±¼ Schlag), zu früh, zu
  spät, verpasst. Danach eine Zeile wie „7 von 9 Wechseln getroffen.
  Wechsel zu D kam zweimal zu spät.“
- Stufen: 1 mit Akkordband und Countdown, 2 nur Akkordband, 3 ohne
  Anzeige. Auf- und Abstieg wie bei den Übergängen in `phrases.js`
  (3× sauber hoch, 2× schlecht runter). Zustand in `wann:<songId>:<phraseId>`.

### 9.3 Groove, Kurze Wege, Akkord-Blitz

- **Groove:** spielt das Muster über die Ereignisse einer Phrase des
  aktuellen Songs statt über feste Loops.
- **Kurze Wege:** Loops werden aus den häufigsten Übergängen des Songs
  gebildet (je Paar ein Loop), statt aus `SONG.loops`.
- **Akkord-Blitz:** Karten für alle Akkorde des aktuellen Songs, Griffe
  aus 4.2. Vorhandene Karten der fünf bisherigen Akkorde bleiben bestehen.

### 9.4 Fünf-Minuten-Mix

`mix.js` neu, abhängig davon, was der Song hat:

- Hat er keine Ereignisse: kein Mix, stattdessen Hinweis auf „Transkribieren“.
- Sonst: 30 s „Wann“ für die aktuelle Phrase, 2½ min „Geführt“, 2 min
  Play-Along (YouTube, falls Quelle und Offset vorhanden, sonst mit eigener
  Begleitung). Die fällige Wiederholung einer sitzenden Phrase bleibt wie
  bisher am Anfang von „Geführt“.

## 10. Reihenfolge der Arbeit

Jede Stufe ist ein eigener Commit (oder mehrere), lauffähig, mit grünen
Selbsttests und erhöhter `SW_VERSION`.

1. **Datenmodell:** `songdata.js`, `chordsym.js`, `timeline.js`, `tap.js`
   (rein) mit Selbsttests. Migration 2. Songs-Screen und Import/Export.
   Die Übungen laufen noch auf den alten Daten weiter, aber aus dem
   migrierten Song gelesen.
2. **Griff-Editor** (Abschnitt 8) mit `voicing.js`, Wechsel-Ansicht und
   Spickzettel. Kommt bewusst vor YouTube, weil der Nutzer damit sofort
   die Griffe aus der letzten Stunde eintragen kann.
3. **YouTube:** `yt.js`, CSP, Play-Along mit Akkordband (6.3).
4. **Editor:** Transkribieren, Schritte 1–4.
5. **Üben auf der Zeitleiste:** Geführt, Groove, Kurze Wege, Akkord-Blitz
   umstellen; „Wann“ neu; Mix.
6. **Aufräumen:** README (Übungen, Datenmodell, Dateiübersicht),
   `CLAUDE.md`, `docs/song-schema.md`, Fortschrittsliste abschließen.

## 11. Selbsttests (Node, rein)

Mindestens:

- `validateSong`: gültiges Beispiel ok; jeder Pflichtfeldfehler einzeln
  erkannt; unsortierte Ereignisse, `at` nicht auf Raster, unbekannter
  Akkord, überlappende Abschnitte werden gemeldet; unbekannte Felder bleiben
  nach `normalizeSong` erhalten; gleiche Nachbar-Ereignisse zusammengefasst.
- `parseChord`: alle Typen aus 4.2, inklusive Slash und Kreuz/b
  (`F#m`, `Bb/D`), `F6/9` (kein Basston) und `F6/9/A` (Basston A);
  Unsinn → `null`.
- `nameFromKeys`: F2 C3 | A3 C4 D4 G4 → enthält `F6/9`;
  Fis2 D3 | A3 D4 → enthält `D/F#`; A2 E3 | A3 C4 E4 → `Am` zuerst.
- `validateVoicing`: doppelter Finger, Taste in beiden Händen, falsche
  Länge der Fingerliste sind Fehler; rechts 3-2-1 aufsteigend ist eine
  Warnung, kein Fehler; `null`-Finger erlaubt.
- `voicingDiff` mit diesen Griffen (die Griffe aus dem Unterricht):
  Am = L A2 E3 (5,1) | R A3 C4 E4 (1,2,4);
  D/F# = L Fis2 D3 (5,1) | R A3 D4 (1,3);
  F6/9 = L F2 C3 (5,1) | R A3 C4 D4 G4 (1,2,3,5).
  Am → D/F#: rechts `keep` 1 auf A3, `release` 2 und 4, `add` 3 auf D4.
  D/F# → F6/9: rechts `keep` 1 und 3, `add` 2 auf C4 und 5 auf G4;
  links `move` 5 von Fis2 nach F2 (−1) und 1 von D3 nach C3 (−2).
- Griff-Migration: altes Format mit `lh` als Zahl wird korrekt umgestellt,
  zweiter Lauf ändert nichts.
- `timeline`: `beatToSec`/`secToBeat` umkehrbar; `chordAt` vor dem ersten,
  genau auf und zwischen Ereignissen; `eventsIn` liefert das am Anfang
  klingende Ereignis mit; `phrasesOf` fasst gleiche Abschnitte zusammen.
- `tap`: `tapTempo` mit Ausreißer; `quantize` bei ½ und ¼;
  `parseYouTubeId` für `watch?v=`, `youtu.be/`, `shorts/`, `embed/`,
  nackte ID; `scoreTaps` für getroffen / früh / spät / verpasst.
- Migration 2 auf einem Datenstand von Version 1: Song entsteht, alte
  Phrasen liegen unter `archiv:`, Karten unverändert, zweiter Lauf ändert
  nichts (idempotent).
- Testdaten ohne Liedtext (Platzhalter).

Im Browser zusätzlich: Ein Tempo-Durchgang in „Geführt“ mit einem
vorgezogenen Wechsel auf „4 und“ plant den Akkord in einem
`OfflineAudioContext` auf dem richtigen Achtel (nachmessen wie beim
bestehenden Takt-Scheduler-Test).

## 12. Abnahme

- „Perfect Ruin“ ist nach dem Update vorhanden, ohne Ereignisse, und der
  Startscreen führt zu „Transkribieren“.
- Im Griff-Editor lassen sich die drei Griffe aus dem Selbsttest in unter
  zwei Minuten eingeben, sie klingen beim Anhören richtig, die
  Wechsel-Ansicht zeigt die erwarteten Markierungen, und der Spickzettel
  zeigt alle Griffe auf einen Blick. Ohne Netz funktioniert alles davon.
- In „Transkribieren“ lassen sich ein YouTube-Video laden, Tempo und Eins
  festlegen, Wechsel auf halbe Schläge tippen, korrigieren, Abschnitte
  setzen. Nach Neuladen der App ist alles noch da.
- Ein exportiertes JSON lässt sich wieder importieren und ist danach
  gleich (ohne Text, sofern nicht anders gewählt).
- Das Play-Along zeigt einen vorgezogenen Wechsel vor dem Taktstrich an,
  der Loop über einen Abschnitt läuft, die Rate lässt sich ändern.
- „Geführt“ spielt im Tempo-Modus den echten Rhythmus, „Wann“ wertet
  Tipps korrekt aus.
- Ohne Netz: Start, Griffe, Geführt, Wann (ohne Video), Groove, Kurze Wege,
  Akkord-Blitz laufen; YouTube-Teile melden verständlich, dass Netz fehlt.
- Läuft auf Safari unter iOS und Chrome unter Android, Quer- und
  Hochformat wie bisher.

## 13. Nicht in diesem Auftrag

- Automatische Akkord- oder Schlagerkennung aus Audio oder Video.
- Griffe per Web-MIDI vom Digitalpiano übernehmen (läuft nicht in Safari
  unter iOS; später als Zusatz denkbar).
- Unterrichtsvideos in der App (Import, Marker). Eigene Anweisung.
- Lokale Audiodateien als Quelle (das Schema lässt mit `sources[].type`
  Platz dafür).
- Schwankende Zeitleisten (`beatTimes`).
- Lagen-Übung (Umkehrungen), Song-Karte für den Wiedereinstieg,
  wachsende Wiederholungsabstände. Das kommt in einer eigenen Anweisung.
