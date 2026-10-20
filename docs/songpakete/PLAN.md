# Plan: Songs als Pakete statt im Git

Stand: Entwurf, noch nichts umgesetzt.

## Ziel

- Im Repository liegt **kein Song** mehr. Die App ist ein leerer Übe-Rahmen.
- Ein Song kommt als **eine Datei** (`<id>.pianino.json`) in die App: „Über“ →
  „Song hinzufügen“ → Datei wählen. Gespeichert wird er in IndexedDB, also nur
  auf dem Gerät.
- Die Datei erstellt Claude mit einem festen Prompt
  (`PROMPT-perfect-ruin.md` als erstes Beispiel; später als Skill). Grundlage
  sind Quellen, die der Nutzer mitgibt (Noten, Tabs, Audio).
- Bestehender Übe-Fortschritt für „Perfect Ruin“ bleibt erhalten.

## Was Claude dabei kann und was nicht

Ehrlich vorweg, weil das den ganzen Ablauf bestimmt:

- **Aus Noten (PDF/Foto) abschreiben**: geht gut. Akkorde, Takte, Melodie
  lassen sich ablesen; Fehler einzelner Noten sind möglich, darum Kennzeichnung
  pro Stelle (`conf`).
- **Aus Tabs/Akkordblättern**: Akkorde ja, Melodie nein, harmonischer Rhythmus
  oft nur geraten.
- **Aus einer Audiodatei**: nur mit Code-Umgebung (Claude Code in der Cloud):
  Stimme abtrennen (z. B. demucs), Tonhöhe verfolgen (z. B. basic-pitch,
  essentia), Takt finden. Brauchbar als Rohfassung, nicht als fertige Melodie.
- **Aus dem Gedächtnis**: nicht verlässlich. Eine so erzeugte Melodie wäre
  erfunden. Der Prompt verbietet das ausdrücklich; ohne Quelle bleibt die
  Melodie leer.
- **Liedtext**: Claude gibt keinen vollständigen fremden Liedtext wieder, und
  die App soll ohnehin keinen enthalten. Das Paket hat stattdessen Zeilen-
  bezeichnungen („Strophe 1, Zeile 2“). Eigene Stichworte kann der Nutzer
  später in der App eintragen (bleiben lokal, Phase 4).

Entscheidung für Perfect Ruin: nur Akkord-Tabs, die der Nutzer selbst
öffnet und in den Claude-Chat einfügt (Ultimate Guitar u. ä. lassen sich von
Claude nicht verlässlich abrufen). Websuche nur für Tonart und Tempo. Melodie
bleibt leer. Kein YouTube-Audio (Herunterladen
verstößt gegen die YouTube-Bedingungen, Claude kann Videos nicht anhören).
Das Format behält das Feld `melody`, damit eine Melodie später aus Noten
ergänzt werden kann.

## Paketformat `pianino-song`, Version 1

Volle Beschreibung mit Beispiel steht im Prompt (der muss für sich allein
stehen). Kurzfassung:

| Feld | Inhalt |
|---|---|
| `format`, `formatVersion` | `"pianino-song"`, `1` |
| `id` | stabiler Schlüssel, `[a-z0-9-]+`; bestimmt, wo Fortschritt gespeichert wird |
| `title`, `artist`, `createdAt` | Anzeige |
| `sources[]` | woraus transkribiert wurde |
| `key`, `meter`, `tempo` | Tonart, Takt, Tempi (Original, Noten, Übetempo) |
| `chords{}` | Griffe: `symbol`, `rh` (3 MIDI-Töne), `lh`, `fingers`, `tip` |
| `sections[]` | `id`, `name`, `bars[]`; ein Takt ist `"Am"` oder `[{chord, beats}]` |
| `form[]` | Reihenfolge der Abschnitt-ids |
| `melody{}` | je Abschnitt `[{bar, beat, dur, midi, conf}]` |
| `phrases[]` | Lernreihenfolge für „Geführt“: `id`, `name`, `section`/`from`–`to`, `tip` |
| `loops{}` | Loops für Kurze Wege / Groove |
| `uncertain[]` | Stellen, die geprüft werden müssen |
| `verified{}` | `chords`, `rhythm`, `melody` – je `true/false` |

Wichtige Entscheidungen:

- **Griffe stehen im Paket**, nicht in `chords.js`. Nur so gehen andere Songs
  mit anderen Akkorden. `chords.js` behält die Grundstellungen (`:root`) für
  Akkord-Blitz.
- **Mehrere Akkorde pro Takt** sind im Format erlaubt. Die Übungen gehen heute
  von einem Akkord pro Takt aus; Phase 2 muss das lösen (Warten-Modus ist
  ohnehin ohne Rhythmus, Tempo-Modus und Play-Along brauchen `beats`).
- **Abschnitte statt einer flachen Strophe/Refrain-Liste**: Strophe 1 und 2
  sind eigene Abschnitte, wenn sich Melodie oder Akkorde unterscheiden.
- **Melodie in notierter Höhe** (Violinschlüssel). Eine Männerstimme klingt
  eine Oktave tiefer; dafür gibt es schon die Einstellung `melodyLow`.

## Umsetzung in Phasen

### Phase 0 – Format und Prüfer (rein)

- `songpack.js` (REIN): `parseSongPack(json) → { song, errors, warnings }`.
  Prüft alles, was im Prompt unter „Selbstprüfung“ steht, und baut daraus das
  interne Song-Objekt (`songForm`, Akkord-Lookup, Takte mit Schlägen).
- `test-song.js` (REIN): frei erfundener Testsong als Paket, ersetzt
  `song-perfect-ruin.js` in den Selbsttests.
- Selbsttest 6 neu: gültiges Paket, Pakete mit typischen Fehlern
  (Taktlänge falsch, Akkord fehlt, Melodie außerhalb des Takts, Liedtext-
  ähnliche Felder) werden abgelehnt.

### Phase 1 – Speichern und Importieren

- IndexedDB: `song:<id>` = das Paket, `settings.activeSong` = id.
- „Über“ → „Song hinzufügen“: `<input type="file" accept=".json,application/json">`,
  Datei lesen, `parseSongPack`, Vorschau (Titel, Form, Takte, Warnungen,
  „unverifiziert“), dann übernehmen. Gleiche id → ersetzen, Fortschritt bleibt.
- „Song exportieren“ (Backup) und „Song entfernen“.
- Keine Netzwerkzugriffe, CSP bleibt wie sie ist.
- `DATA_VERSION` 2 mit Migration:
  `phrase:<id>` → `phrase:<songId>:<id>`, `card:<X>:song` → `card:<songId>:<X>`,
  `loop:<id>` für Song-Loops entsprechend. Für Altdaten ist `songId`
  `perfect-ruin`. Idempotent: schon umgestellte Schlüssel bleiben.

### Phase 2 – Code vom festen Song lösen

Heute hängt der Song an vielen Stellen fest:
`exercises/{guided,playalong,groove,wege}.js`, `app.js`, `phrases.js`,
`melody.js`, `tempo.js` importieren `song-perfect-ruin.js`; `leitner.js` und
`mic.js` haben die fünf Song-Akkorde hart drin; `chords.js` hat die
`:song`-Griffe.

- Aktiver Song kommt aus dem Store und wird als Parameter durchgereicht
  (reine Module bleiben rein).
- `phraseDefs(song)` liest `song.phrases` statt fester Indizes.
- `wegeStages(song)`: Pendel-Paare aus den häufigsten Übergängen des Songs
  statt fest Am–F usw.
- `leitner.js`: Stufen 3–4 aus den Song-Akkorden des aktiven Pakets.
- `mic.js`: Diagnose über die Akkorde des aktiven Pakets.
- Tempo-Modus/Play-Along: Takte mit mehreren Akkorden nach `beats` planen
  (über `clock.js`).

### Phase 3 – Song aus dem Repo nehmen

- `song-perfect-ruin.js` löschen, aus `SHELL` in `sw.js` streichen,
  `SW_VERSION` erhöhen.
- Leerzustand ohne Song: Startscreen bietet Akkord-Blitz (Grundstellungen) und
  „Song hinzufügen“; Geführt/Play-Along ausgegraut.
- `CLAUDE.md` und `README.md` anpassen (Abschnitt „Songdaten“ → Paketformat,
  Verweis auf diesen Ordner).
- Hinweis: In der Git-Historie bleibt die alte Datei sichtbar. Sie enthält
  nur Akkorde, keinen Text – unproblematisch.

### Phase 4 – später, wenn es sich bewährt

- Datei direkt aus „Dateien“/Teilen öffnen (`file_handlers`/`share_target`
  im Manifest).
- Mehrere Songs mit Auswahl auf dem Startscreen.
- „Prüfen“-Modus: Abschnitt vorspielen, Nutzer hakt ab → `verified` pro
  Abschnitt in der App setzen.
- Eigene Stichworte je Phrase (lokal, nie im Paket von Claude).
- Prompt als Skill (`.claude/skills/song-paket/SKILL.md`) inkl. kleinem
  Prüfskript, sobald der Prompt sich im Test bewährt hat.

## Offene Fragen an den Nutzer

1. Mehrere Songs gleichzeitig nötig, oder reicht vorerst „ein aktiver Song“?
