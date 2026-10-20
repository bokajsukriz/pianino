# Prompt: Songpaket „Perfect Ruin“ (Kwabs) – für Claude-Chat

So benutzen:

1. Tab(s) im Browser öffnen (z. B. Ultimate Guitar) und den Text kopieren
   oder die Seite als PDF speichern. Gern 2–3 verschiedene Versionen.
2. Neuen Claude-Chat öffnen, Websuche und Code-Ausführung einschalten.
3. Alles unterhalb der Linie einfügen und darunter bei „TABS“ die kopierten
   Tabs einfügen bzw. die PDFs anhängen.

Ergebnis: `perfect-ruin.pianino.json` zum Herunterladen und ein kurzer
Bericht.

---

Du erstellst ein **Songpaket** für „Pianino“, eine private Übe-App fürs
Klavier. Ich lerne Klavier, um Gesang zu begleiten: rechte Hand Dreiklänge,
linke Hand ein Basston. Das Paket ist eine einzige JSON-Datei, die ich in der
App importiere. Es geht um **„Perfect Ruin“ von Kwabs**.

**Quelle sind Akkord-Tabs.** Hole sie zuerst selbst: such per Websuche nach
„Perfect Ruin Kwabs chords“ (Ultimate Guitar, Chordify, chordu, AZChords,
Chordie u. ä.) und öffne 2–3 Versionen. Sag mir, welche Seiten du wirklich
lesen konntest und welche blockiert waren. Konntest du keine lesen, stopp und
bitte mich, die Tabs einzufügen – nicht aus dem Gedächtnis weitermachen.
Tabs, die ich unten einfüge oder anhänge, haben Vorrang. Tonart und Tempo
außerdem aus Tunebat, SongBPM oder Musicnotes (MN0148299).

## Was du aus den Tabs herausziehst

| Was | Wohin im Paket | Wie |
|---|---|---|
| Kapo, Stimmung, Tonart der Tabs | `sources[].note` | nach a-Moll umrechnen (Kapo 3 + Em-Griffe = Gm usw.) |
| Abschnitte (Intro, Strophe, Pre-Chorus, Refrain, Bridge, Outro) | `sections[]` | gleiche Akkordfolge = ein Abschnitt; abweichende Wiederholung = eigener |
| Reihenfolge der Abschnitte im Song | `form[]` | Wiederholungen ausschreiben („Refrain ×2“ → zweimal) |
| Akkordfolge je Abschnitt | `sections[].bars[]` | siehe Takte unten |
| Zeilen je Abschnitt | Grundlage für `phrases[]` | Zeile = Textzeile im Tab, ohne den Text |
| Wann der Akkord wechselt | `bars[]` mit `beats` | Taktstriche (`|`) oder Notation wie „Am . . .“ nutzen; sonst Annahme |
| Alle vorkommenden Akkordsymbole | `chords{}` | als Klaviergriffe (Regeln unten) |
| Riffs, Einzeltöne, Gitarrenmuster | – | weglassen, höchstens in `uncertain` erwähnen |
| Liedtext | – | **nie** übernehmen |
| Tonart, Tempo der Aufnahme | `key`, `tempo` | aus Websuche, mit URL in `sources` |

Mehrere Tab-Versionen: Abschnitt für Abschnitt vergleichen. Stimmen sie
überein, übernehmen. Weichen sie ab, die plausiblere/besser bewertete Version
nehmen und die andere in `uncertain` nennen.

## Harte Regeln

1. **Nichts erfinden.** Jede Angabe stammt aus den Tabs oder einer
   Webquelle mit URL. Was keine Quelle hergibt, bleibt weg oder kommt unter
   `uncertain`.
2. **Keine Melodie.** `melody` ist `{}`.
3. **Kein Liedtext.** Kein Wort des Songtexts im Paket (auch nicht in
   `tip`, `name`, `note`) und nicht im Bericht. Zeilen heißen „Zeile 1“,
   „Strophe 2, Zeile 3“ usw.
4. **Unsicherheit markieren.** Jede Annahme zu Akkorden, Form oder Rhythmus
   steht in `uncertain` mit Ort und Grund. `verified` bleibt überall `false` –
   das setze ich selbst nach dem Nachspielen.
5. **Tonart a-Moll** (Aufnahmetonart, laut Musicnotes „Original Published
   Key“). Tabs in anderer Tonart oder mit Kapo umrechnen.
6. **Bestehende ids beibehalten** (siehe unten), damit mein Übe-Fortschritt
   erhalten bleibt.

## Takte

Tabs zeigen selten, wie lange ein Akkord dauert. Reihenfolge der Quellen:

1. Taktstriche oder Schlagnotation im Tab → übernehmen.
2. Sonst: **ein Akkord pro Takt**, als Annahme in `uncertain`.
3. Zeilen auf eine gerade Taktzahl (meist 4) auffüllen, indem der letzte
   Akkord verlängert wird – ebenfalls in `uncertain`.

## Ablauf

1. Tabs lesen, Kapo/Tonart bestimmen, Websuche nach Tonart und Tempo.
2. Tabelle oben abarbeiten.
3. Griffe für alle Akkorde (Regeln unten).
4. Phrasen für die Übung „Geführt“ in sinnvoller Lernreihenfolge
   (leichteste, häufigste Stelle zuerst; ganzer Song zuletzt).
5. Selbstprüfung (Liste unten) **per Skript** mit der Code-Ausführung.
6. Datei `perfect-ruin.pianino.json` zum Herunterladen erzeugen.
7. Bericht auf Deutsch, kurz:
   - Quellen (welcher Tab, Kapo; URLs für Tonart/Tempo)
   - Form in einer Zeile mit Taktzahlen, z. B. „Intro 4 · Strophe 16 · …“
   - Akkordfolge je Abschnitt als Zeile (nur Akkorde)
   - Abweichungen zum „bisher Bekannten“ (unten)
   - die wichtigsten unsicheren Stellen
   - Ergebnis der Skript-Prüfung

## Format `pianino-song`, Version 1

```json
{
  "format": "pianino-song",
  "formatVersion": 1,
  "id": "perfect-ruin",
  "title": "Perfect Ruin",
  "artist": "Kwabs",
  "createdAt": "YYYY-MM-DD",
  "sources": [
    { "kind": "tab", "ref": "Ultimate Guitar, Version 1 (vom Nutzer eingefügt)", "note": "Akkorde aller Abschnitte, Kapo 0" },
    { "kind": "web", "ref": "https://…", "note": "Tempo" }
  ],
  "key": { "tonic": "A", "mode": "minor", "label": "a-Moll" },
  "meter": { "beatsPerBar": 4, "beatUnit": 4 },
  "tempo": {
    "original": 78,
    "sheet": 72,
    "practice": { "start": 55, "min": 50, "target": 60 }
  },

  "chords": {
    "Am": { "symbol": "Am", "rh": [69, 72, 76], "lh": 45, "fingers": [1, 3, 5],
            "tip": "Daumen auf dem A, darüber C und E." }
  },

  "sections": [
    { "id": "intro", "name": "Intro", "bars": ["Am", "Am"] },
    { "id": "verse", "name": "Strophe",
      "bars": ["Am", "D", [{ "chord": "F", "beats": 2 }, { "chord": "C", "beats": 2 }], "F"] }
  ],
  "form": ["intro", "verse", "chorus", "verse", "chorus", "outro"],

  "melody": {},

  "phrases": [
    { "id": "z1", "name": "Zeile 1", "section": "verse", "from": 1, "to": 4,
      "tip": "Daumen bleibt auf dem A." },
    { "id": "form", "name": "Ganzer Song", "whole": true, "tip": "Einmal durch." }
  ],
  "loops": {
    "verse": ["Am", "D", "F"],
    "chorus": ["C", "F", "Dm", "C", "F"]
  },

  "uncertain": [
    { "where": "Strophe, Takt 4", "what": "aufgefüllt: F verlängert, Tabs zeigen keine Dauer" }
  ],
  "verified": { "chords": false, "rhythm": false, "melody": false }
}
```

Feldregeln:

- **`tempo`**: `original` = Tempo der Aufnahme (BPM, ganze Zahl), `sheet` =
  Tempo der Noten, falls bekannt, sonst weglassen. `practice` so lassen.
- **Takte** (`sections[].bars[]`): entweder ein Akkordschlüssel (ganzer Takt)
  oder eine Liste `{ chord, beats }`, deren `beats` zusammen `beatsPerBar`
  ergeben. `"-"` = kein Akkord (N.C.). Ein Sondertakt darf
  `{ "beats": 2, "chords": [...] }` sein und muss in `uncertain` erklärt
  werden.
- **Phrasen**: `section` + `from`/`to` (Takte des Abschnitts) oder
  `sections: [...]` für mehrere ganze Abschnitte oder `whole: true`.
  Maximal 8 Takte für Lernphrasen, dazu am Ende größere Einheiten.
- **Loops**: kurze Akkordfolgen, die im Song wörtlich vorkommen und sich zum
  Kreisen eignen (ein Akkord je Eintrag).
- Unbekannte Felder werden von der App ignoriert; erfinde keine neuen, die
  Inhalte tragen.

## Griffe (rechte Hand, linke Hand)

- Rechte Hand: **genau 3 Töne**, aufsteigend, Dreiklang des Akkords in enger
  Lage, möglichst nah an der Lage „Daumen auf A4 (MIDI 69)“, mit möglichst
  wenig Bewegung zum Nachbarakkord. Gemeinsame Töne liegen bleiben lassen.
  Bereich `rh` 60–81. MIDI 60 = C4.
- Linke Hand: ein Ton, der Grundton (bei Slash-Akkord der Basston),
  Bereich 36–52.
- `fingers`: Fingersatz der rechten Hand (1 = Daumen) passend zu `rh`.
- `tip`: ein kurzer deutscher Satz, wie man vom bisher Gelernten hinkommt.
- Septakkorde, sus usw.: als Dreiklang reduzieren, der den Klang trägt, und
  in `uncertain` vermerken (z. B. „Am7 als Am gegriffen“). Slash-Akkorde
  (z. B. F/A) als eigener Schlüssel mit passendem `lh`.

**Diese Griffe gibt es schon – unverändert übernehmen**, falls der Akkord
vorkommt (Schlüssel = Symbol):

| Schlüssel | rh | lh | fingers | tip |
|---|---|---|---|---|
| `Am` | 69, 72, 76 | 45 | 1, 3, 5 | Daumen auf dem A, darüber C und E. |
| `D`  | 69, 74, 78 | 50 | 1, 3, 5 | Daumen bleibt auf dem A, darüber D und F♯ (schwarz). |
| `F`  | 69, 72, 77 | 41 | 1, 2, 5 | Daumen auf dem A, Zeigefinger auf dem C, kleiner Finger auf dem F. |
| `Dm` | 69, 74, 77 | 50 | 1, 3, 5 | Daumen bleibt auf dem A, darüber D und F. |
| `C`  | 67, 72, 76 | 48 | 1, 3, 5 | Der Daumen rutscht vom A aufs G, darüber C und E. |

## Was bisher bekannt ist (unverifiziert, nur als Ausgangspunkt)

Aus Nutzer-Tabs, ein Akkord pro Takt angenommen. **Durch die eingefügten
Tabs ersetzen**, wo sie etwas anderes sagt, und Abweichungen im Bericht nennen.

- Tonart a-Moll, Original etwa 76–79 BPM, Musicnotes: Viertel = 72.
- Strophe (16 Takte): Am D F F | Am D F F | Am Dm C F | Am Dm F F
  (die Tabs nennen „Am – D – F (zweimal), dann Am – Dm – C – F, Am – Dm – F“;
  die Takte 4, 8, 16 sind aufgefüllt).
- Refrain (8 Takte): C F Dm C | F Dm C F, danach 1 Takt Am als Auflösung.

Diese Phrasen-ids gibt es schon. Verwende sie für die entsprechenden Stellen
der **Strophe** bzw. des **Refrains**, in dieser Lernreihenfolge, und hänge
weitere Phrasen mit neuen ids dahinter oder dazwischen:

| id | Bedeutung |
|---|---|
| `z1` | Strophe, Zeile 1 (Takte 1–4) |
| `z4` | Strophe, Zeile 4 (Takte 13–16) |
| `z3` | Strophe, Zeile 3 (Takte 9–12) |
| `ref` | Refrain |
| `strophe` | ganze Strophe |
| `form` | ganzer Song (`whole: true`) |

Passt die echte Form nicht dazu (z. B. Strophe hat 8 statt 16 Takte), nimm
die naheliegendste Entsprechung und erkläre es im Bericht.

## Selbstprüfung vor der Ausgabe

- [ ] Gültiges JSON, `format`/`formatVersion`/`id` wie oben, `melody` ist `{}`.
- [ ] Jeder Takt: Summe `beats` = `beatsPerBar` (oder begründeter Sondertakt).
- [ ] Jeder Akkordschlüssel in `sections` und `loops` ist in `chords`
      definiert; jeder Griff in `chords` wird auch benutzt.
- [ ] Jeder Griff: 3 aufsteigende `rh`-Töne in 60–81, Töne passen zum
      Symbol, `lh` in 36–52 und passend zum Grund-/Basston, `fingers`
      3 Zahlen 1–5 aufsteigend; die fünf bestehenden Griffe unverändert.
- [ ] Jede Abschnitt-id in `form` und `phrases` existiert.
- [ ] Phrasen-ids eindeutig, `from` ≤ `to`, innerhalb des Abschnitts;
      `z1`, `z4`, `z3`, `ref`, `strophe`, `form` vorhanden.
- [ ] Jede Loop-Folge kommt im Song so vor.
- [ ] Jede Quelle mit URL in `sources`; jede Annahme in `uncertain`.
- [ ] Kein Liedtext irgendwo, auch nicht im Bericht.
- [ ] `verified` alles `false`.

---

TABS:

(optional: hier einfügen oder als PDF anhängen)
