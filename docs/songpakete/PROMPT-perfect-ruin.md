# Prompt: Songpaket „Perfect Ruin“ (Kwabs)

Alles unterhalb der Linie in einen neuen Chat/Agenten kopieren und die Quellen
(Noten-PDF/Fotos, Tabs, Audiodatei) anhängen.

---

Du erstellst ein **Songpaket** für „Pianino“, eine private Übe-App fürs
Klavier. Die Nutzerin/der Nutzer lernt Klavier, um Gesang zu begleiten: rechte
Hand Dreiklänge, linke Hand ein Basston. Das Paket ist eine einzige JSON-Datei,
die in der App importiert wird. Es geht um **„Perfect Ruin“ von Kwabs**.

## Harte Regeln

1. **Nichts erfinden.** Jede Angabe stammt aus einer angehängten Quelle. Was
   du nicht aus einer Quelle ablesen oder hören kannst, bleibt weg oder kommt
   unter `uncertain`. Insbesondere: **Melodie nie aus dem Gedächtnis.** Ohne
   Noten oder Audioanalyse ist `melody` leer (`{}`).
2. **Kein Liedtext.** Kein Wort des Songtexts im Paket, auch nicht in
   `tip`, `name` oder `note`. Zeilen heißen „Zeile 1“, „Strophe 2, Zeile 3“ usw.
3. **Unsicherheit markieren.** Jede Melodienote hat `conf`
   (`"sicher"` | `"wahrscheinlich"` | `"geraten"`). Jede Annahme zu Akkorden,
   Form oder Rhythmus steht in `uncertain` mit Ort und Grund.
   `verified` bleibt überall `false` – das setzt nur der Mensch.
4. **Tonart a-Moll** (Aufnahmetonart). Stehen die Noten in einer anderen
   Tonart, transponiere nach a-Moll und vermerke das in `sources[].note`.
5. **Bestehende ids beibehalten** (siehe unten), damit Übe-Fortschritt
   erhalten bleibt.

## Vorgehen

1. **Quellen sichten.** Liste, was angehängt ist und was davon taugt. Fehlen
   Noten und Audio: sag das, und liefere ein Paket nur mit Akkorden.
2. **Form bestimmen**: Intro, Strophen, Pre-Chorus, Refrain, Bridge, Outro –
   mit Taktzahlen. Wiederholungen ausschreiben (`form` darf Abschnitte mehrfach
   nennen). Zwei Strophen mit gleichen Akkorden, aber anderer Melodie →
   zwei Abschnitte.
3. **Akkorde und harmonischer Rhythmus** je Takt. Mehrere Akkorde pro Takt
   mit Schlägen angeben. Slash-Akkorde (z. B. F/A) als eigener Griff mit
   passendem `lh`.
4. **Griffe** für alle vorkommenden Akkorde (Regeln unten).
5. **Melodie** je Abschnitt, Takt für Takt, in notierter Höhe.
6. **Phrasen** für die Übung „Geführt“ in sinnvoller Lernreihenfolge
   (leichteste, häufigste Stelle zuerst; ganzer Song zuletzt).
7. **Selbstprüfung** (Liste unten). Wenn du Code ausführen kannst: schreib ein
   kleines Skript, das die Datei gegen die Liste prüft, und führe es aus.
8. **Ausgabe**: die Datei `perfect-ruin.pianino.json` (als Datei/Anhang, wenn
   möglich, sonst ein einziger ```json-Block), danach ein kurzer Bericht auf
   Deutsch: Quellen, Form in einer Zeile, Zahl der Takte und Melodienoten,
   die wichtigsten unsicheren Stellen.

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
    { "kind": "noten", "ref": "Musicnotes MN0148299", "note": "Tonart der Noten; ggf. „nach a-Moll transponiert“" }
  ],
  "key": { "tonic": "A", "mode": "minor", "label": "a-Moll" },
  "meter": { "beatsPerBar": 4, "beatUnit": 4 },
  "tempo": {
    "original": 78,
    "sheet": 72,
    "feel": "Freely",
    "practice": { "start": 55, "min": 50, "target": 60 }
  },

  "chords": {
    "Am": { "symbol": "Am", "rh": [69, 72, 76], "lh": 45, "fingers": [1, 3, 5],
            "tip": "Daumen auf dem A, darüber C und E." }
  },

  "sections": [
    { "id": "intro", "name": "Intro", "bars": ["Am", "Am"] },
    { "id": "verse1", "name": "Strophe 1",
      "bars": ["Am", "D", [{ "chord": "F", "beats": 2 }, { "chord": "C", "beats": 2 }], "F"] }
  ],
  "form": ["intro", "verse1", "chorus", "verse2", "chorus", "outro"],

  "melody": {
    "verse1": [
      { "bar": 1, "beat": 2.5, "dur": 0.5, "midi": 72, "conf": "sicher" }
    ]
  },

  "phrases": [
    { "id": "z1", "name": "Zeile 1", "section": "verse1", "from": 1, "to": 4,
      "tip": "Daumen bleibt auf dem A." },
    { "id": "form", "name": "Ganzer Song", "whole": true, "tip": "Einmal durch." }
  ],
  "loops": {
    "verse": ["Am", "D", "F"],
    "chorus": ["C", "F", "Dm", "C", "F"]
  },

  "uncertain": [
    { "where": "Strophe 1, Takt 3", "what": "F oder F/C – Bass in den Noten unklar" }
  ],
  "verified": { "chords": false, "rhythm": false, "melody": false }
}
```

Feldregeln:

- **Takte** (`sections[].bars[]`): entweder ein Akkordschlüssel (ganzer Takt)
  oder eine Liste `{ chord, beats }`, deren `beats` zusammen `beatsPerBar`
  ergeben. `"-"` = kein Akkord (N.C.). Ein Auftakt-/Sondertakt darf
  `{ "beats": 2, "chords": [...] }` sein und muss in `uncertain` oder `note`
  erklärt werden.
- **Melodie**: `bar` ab 1 innerhalb des Abschnitts, `beat` ab 1 in Vierteln
  (`1.5` = „1 und“, Triolen als Dezimalzahl auf 3 Stellen), `dur` in
  Vierteln, `midi` 60 = C4, notiert im Violinschlüssel (nicht oktavieren).
  Pausen nicht eintragen. Überbindungen über den Taktstrich: Note im ersten
  Takt mit voller Dauer, nicht doppelt. Auftakt-Töne vor Takt 1 gehören ans
  Ende des vorigen Abschnitts.
- **Phrasen**: `section` + `from`/`to` (Takte des Abschnitts) oder
  `sections: [...]` für mehrere ganze Abschnitte oder `whole: true`.
  Maximal 8 Takte für Lernphrasen, dazu am Ende größere Einheiten.
- Unbekannte Felder werden von der App ignoriert; erfinde keine neuen, die
  Inhalte tragen.

## Griffe (rechte Hand, linke Hand)

- Rechte Hand: **genau 3 Töne**, aufsteigend, Dreiklang des Akkords in enger
  Lage, möglichst nah an der Lage „Daumen auf A4 (MIDI 69)“, mit möglichst
  wenig Bewegung zum Nachbarakkord. Gemeinsame Töne liegen bleiben lassen.
  Bereich `rh` 60–81.
- Linke Hand: ein Ton, der Grundton (bei Slash-Akkord der Basston),
  Bereich 36–52.
- `fingers`: Fingersatz der rechten Hand (1 = Daumen) passend zu `rh`.
- `tip`: ein kurzer deutscher Satz, wie man vom bisher Gelernten hinkommt.
- Septakkorde, sus usw.: als Dreiklang reduzieren, der den Klang trägt, und
  in `uncertain` vermerken (z. B. „Am7 als Am gegriffen“).

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

Aus Nutzer-Tabs, ein Akkord pro Takt angenommen. **Durch die Quellen
ersetzen**, wo sie etwas anderes sagen, und Abweichungen im Bericht nennen.

- Tonart a-Moll, Original etwa 76–79 BPM, in den Noten „Freely“, Viertel = 72.
- Strophe (16 Takte): Am D F F | Am D F F | Am Dm C F | Am Dm F F
  (die Tabs nennen „Am – D – F (zweimal), dann Am – Dm – C – F, Am – Dm – F“;
  die Takte 4, 8, 16 sind aufgefüllt).
- Refrain (8 Takte): C F Dm C | F Dm C F, danach 1 Takt Am als Auflösung.

Diese Phrasen-ids gibt es schon. Verwende sie für die entsprechenden Stellen
der **ersten Strophe** bzw. des **ersten Refrains**, in dieser
Lernreihenfolge, und hänge weitere Phrasen mit neuen ids dahinter oder
dazwischen:

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

- [ ] Gültiges JSON, `format`/`formatVersion`/`id` wie oben.
- [ ] Jeder Takt: Summe `beats` = `beatsPerBar` (oder begründeter Sondertakt).
- [ ] Jeder Akkordschlüssel in `sections`, `loops` ist in `chords` definiert.
- [ ] Jeder Griff: 3 aufsteigende `rh`-Töne in 60–81, Töne passen zum
      Symbol, `lh` in 36–52, `fingers` 3 Zahlen 1–5 aufsteigend.
- [ ] Jede Abschnitt-id in `form`, `melody`, `phrases` existiert.
- [ ] Melodie: `bar` im Abschnitt vorhanden, `beat + dur` ≤ `beatsPerBar + 1`
      (sonst Überbindung prüfen), `midi` 48–84, keine Überlappung in einer
      Stimme, Noten nach `bar`, `beat` sortiert, jede hat `conf`.
- [ ] Phrasen-ids eindeutig, `from` ≤ `to`, innerhalb des Abschnitts.
- [ ] Kein Liedtext irgendwo. Kein Wort, das aus dem Text stammt.
- [ ] `verified` alles `false`; jede Annahme steht in `uncertain`.
