# Song-JSON (Schema 1)

Ein Song ist eine JSON-Datei. Die App importiert sie unter „Songs“ →
„Importieren“ (Datei oder eingefügt), prüft sie (`songdata.js validateSong`,
Fehler auf Deutsch) und speichert sie in IndexedDB. Exportieren liefert
dasselbe Format; **ohne Liedtext** ist voreingestellt.

Dieses Dokument dient auch dazu, Song-JSONs außerhalb der App vorzubereiten
(z. B. im Chat): Akkorde, Griffe, Abschnitte. Die Wechsel (`events`) hört man
am besten in der App selbst heraus („Transkribieren“).

## Beispiel (ohne Liedtext)

```json
{
  "schema": 1,
  "id": "mein-song",
  "title": "Mein Song",
  "artist": "Jemand",
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
    { "id": "v1", "name": "Strophe 1", "bar": 1, "bars": 8 },
    { "id": "r1", "name": "Refrain 1", "bar": 9, "bars": 8 }
  ],
  "events": [
    { "at": 0, "chord": "Am" },
    { "at": 3.5, "chord": "D/F#" },
    { "at": 8, "chord": "F6/9" }
  ],
  "notes": "Quelle, Unsicherheiten"
}
```

## Felder

| Feld | Pflicht | Bedeutung |
|---|---|---|
| `schema` | ja | `1` |
| `id` | ja | Kleinbuchstaben, Ziffern, `-` |
| `title` | ja | Titel |
| `artist`, `key`, `notes` | nein | Text |
| `beatsPerBar` | ja | Schläge je Takt (1–12) |
| `bpm` | nein | 30–220 oder `null` (noch nicht bestimmt). Ein festes Tempo |
| `verified` | nein | `true`, wenn mit der Aufnahme gegengehört |
| `chords` | ja | mindestens ein Akkordsymbol, keins doppelt |
| `voicings` | nein | Griff je Symbol aus `chords` (unten); sonst gilt die Standardlage |
| `sources` | nein | Quellen; `youtube` mit `videoId` (11 Zeichen), `offsetSec` (Sekunde im Video, an der Schlag 0 liegt, ≥ 0 oder `null`), `durationSec` |
| `sections` | ja (darf `[]` sein) | `{ id, name, bar, bars }`, Takte 1-basiert, ohne Überlappung |
| `events` | ja (darf `[]` sein) | `{ at, chord }`: ab Schlag `at` klingt `chord` |
| `grid` | nein | `0.5` (Standard) oder `0.25`, wenn Wechsel auf Sechzehnteln liegen |
| `lyrics` | nein | `{ at, line }` — nur vom Nutzer selbst eingegeben, bleibt auf dem Gerät |
| `melody` | nein | `{ at, dur, midi }` in Schlägen (Groove ab Stufe 2) |
| `beatTimes` | nein | für schwankendes Tempo vorgesehen, in Version 1 ignoriert, aber erhalten |

Unbekannte Felder bleiben beim Import und Export erhalten.

## Zeit

- **Schlag 0** ist die Eins von Takt 1. `at` zählt Schläge (Viertel bei 4/4).
- `at` liegt auf halben Schlägen (`3.5` = „4 und“ in Takt 1), mit
  `"grid": 0.25` auch auf Vierteln von Schlägen. Aufsteigend, keins doppelt.
- Zwei aufeinanderfolgende Ereignisse mit gleichem Akkord werden beim
  Import zu einem zusammengefasst.
- Sekunde im Video = `offsetSec + at × 60 / bpm`.

## Akkordsymbole

`X`, `Xm`, `X6`, `Xm6`, `X6/9`, `Xadd9`, `Xmadd9`, `X7`, `Xm7`, `Xmaj7`,
`X9`, `Xm9`, `Xsus2`, `Xsus4`, `X7sus4`, `Xdim`, `Xdim7`, `Xm7b5`, `Xaug`,
`X5`; Grundton mit `#` oder `b` (`F#m`, `Bb`), `H` = `B`. Slash-Akkorde
`X/Y` (Basston Y). In `F6/9` gehört der Schrägstrich zum Typ; `F6/9/A` ist
F6/9 mit A im Bass. Unbekannte Symbole sind erlaubt — die App zeigt dann nur
den Namen und braucht einen eigenen Griff.

## Griffe

```json
{ "rh": [57, 60, 62, 67], "rhFingers": [1, 2, 3, 5],
  "lh": [41, 48], "lhFingers": [5, 1], "note": "Daumen bleibt auf A" }
```

- `rh`, `lh`: MIDI-Nummern (60 = C4), aufsteigend, je Hand 0–5, zusammen
  mindestens eine; keine Taste in beiden Händen.
- `rhFingers`, `lhFingers`: gleich lang wie die Tasten, 1–5 oder `null`,
  kein Finger doppelt in einer Hand.
- `note`: höchstens 140 Zeichen.
- Ohne eigenen Griff gilt die **Standardlage**: Dreiklang in Grundstellung um
  C4 (bei Vier- und Mehrklängen ohne Quinte), Bass eine Oktave tiefer bzw.
  der Basston des Slash-Akkords.
- Altes Format (`lh` als Zahl, `fingers` für rechts) wird beim Import
  umgestellt.
