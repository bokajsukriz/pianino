# Pianino — Hinweise für Claude Code

Kleine private Übe-App fürs Klavier (Begleiten von Gesang). Statische PWA,
**kein Build-Schritt**: kein Bundler, kein `package.json`, kein Framework.
Plain HTML, CSS und JavaScript als ES-Module. Architektur und Dateiübersicht:
`README.md`.

**Fremde Bibliotheken sind erlaubt.** Die App ist privat, nur für eine
Person — eine passende Bibliothek ist hier kein Problem und meist besser als
viel eigener Code. Bedingungen: fertige Datei (ES-Modul) nach `vendor/<name>/`
kopieren, mit Lizenztext, Eintrag in `THIRD-PARTY.md` (Version, SHA-256) und
unter „Lizenzen und Dank“ in `index.html`, in `SHELL` aufnehmen (offline) und
möglichst erst bei Bedarf per `import()` laden. Zur Laufzeit wird nichts
von fremden Servern geladen (siehe unten). Lieber eine kleine, gepflegte
Bibliothek als eine große.

## Failsafe: SW_VERSION bumpen

Vor jedem Commit prüfen, ob eine Datei aus `SHELL` in `sw.js` geändert wurde
(alle `.html`, `.css`, `.js` im Hauptverzeichnis und in `exercises/`, dazu
`manifest.json`, `icon.svg`, `icon-192.png`, die Schrift und `sw.js` selbst).
Falls ja: `SW_VERSION` in `sw.js` in derselben Änderung erhöhen (`v3` → `v4`).
Sonst liefert der Service Worker weiter den alten Shell-Cache aus und niemand
bekommt das Update. Maßgeblich ist immer die Liste `SHELL` in `sw.js`.
`git diff --cached --stat` vor `git commit` dagegen prüfen.

Die Klaviersamples (`samples/`) liegen in einem eigenen Cache
(`SAMPLES_CACHE`), der **nicht** an `SW_VERSION` hängt. Ändern sich die
Dateien dort, dessen Nummer erhöhen.

## Reine Module bleiben rein

`chords.js`, `chordsym.js`, `voicing.js`, `songdata.js`, `timeline.js`,
`tap.js`, `accomp.js`, `migrations.js`, `leitner.js`, `tempo.js`, `mix.js`,
`phrases.js`, `melody.js`, `hear.js`, `leadsheet.js`, `drill.js`, `song-perfect-ruin.js`,
`test-melody.js` und `selftest.js` (bis auf die Browser-Tests, die erst bei
Bedarf per `import()` geladen werden): kein DOM, kein `Date.now()`, kein
`Math.random()`. Zeit und Zufall kommen als Parameter (`today: 'YYYY-MM-DD'`,
`rand: () => number`). Nur so laufen die Tests in Node.

## Songs sind Nutzerdaten

Ein Song ist importiertes bzw. im Editor eingetipptes JSON (Schema:
`docs/song-schema.md`, Prüfung in `songdata.js`), gespeichert in IndexedDB
(`song:<id>`). Außer der Übernahme von „Perfect Ruin“ (Migration 2 aus
`song-perfect-ruin.js`, das nur noch dafür da ist) kommt **kein Song ins
Repo**. Nichts dazuerfinden, keine Melodie und keine Wechsel transkribieren.

**Kein Liedtext im Repo** — auch nicht in Tests, Beispielen oder Kommentaren
(Platzhalter wie `"Zeile A"`). Die App darf vom Nutzer selbst eingegebenen
Text lokal speichern und anzeigen; Export ist ohne Text voreingestellt.
Liedtext nie schreiben oder ergänzen, auch nicht auf Bitte.

Musikalische Annahmen im Code mit `// ANNAHME:` markieren.

## Testen

```
node --input-type=module -e "import { runSelfTests } from './selftest.js'; const r = await runSelfTests(); process.exit(r.failed ? 1 : 0)"
```

prüft die reinen Module (Tests 1–4, 6–14). Im Browser zusätzlich Takt-Scheduler
und vorgezogenen Wechsel im Tempo-Modus (Test 5, `OfflineAudioContext`) und einen Audio-Smoke-Test: Konsole
`runSelfTests()` oder „Über“ → „Selbsttest“.

## Sonst

- Speicher: IndexedDB `pianino`, Store `meta`, Schlüssel `id` (`db.js`).
  `localStorage` nur für das Fehlerprotokoll.
- Ändert sich die Bedeutung gespeicherter Felder: `DATA_VERSION` in `db.js`
  erhöhen und unter `MIGRATIONS[neue Version]` in `migrations.js` (rein,
  `{ put, del }`) eine idempotente Umstellung eintragen und testen.
- Audio-Timing nur über `clock.js` (Lookahead auf der `AudioContext`-Uhr),
  nie `setInterval`. Die Anzeige folgt der Audio-Uhr per
  `requestAnimationFrame`. Zum YouTube-Video folgt sie der geglätteten
  Videozeit (`yt.js now()`) plus Anzeige-Vorlauf (`settings.leadMs`).
- Keine externen Requests zur Laufzeit — einzige Ausnahme: YouTube, nur zum
  Abspielen des Videos (`yt.js`, eingebettet über `www.youtube-nocookie.com`).
  Die CSP in `index.html` erlaubt dafür `script-src https://www.youtube.com
  https://s.ytimg.com` und `frame-src` für YouTube, sonst nur die eigene
  Herkunft. `sw.js` fasst fremde Herkünfte nicht an. Der Player bleibt immer
  sichtbar (mindestens 200 × 200, auf der Liedseite genau das, in der Leiste unten bzw. links; sonst im Querformat 356 × 200) und wird nie
  überdeckt. Ohne Netz muss alles außer Video-Play-Along und Editor laufen.
- Fremde Bibliotheken bisher: Mediabunny in `vendor/mediabunny/` (MPL-2.0,
  Videos verkleinern und umpacken, `vidshrink.js`, `vidrec.js`), ffmpeg.wasm
  in `vendor/ffmpeg/` (MIT, Kern GPL-2.0-or-later, ≈ 31 MB; Videos
  verkleinern ohne WebCodecs, z. B. Firefox auf Android) — **nicht** in
  `SHELL`, sondern im eigenen Cache `FFMPEG_CACHE` in `sw.js`, beim ersten
  Gebrauch gefüllt; ändern sich Dateien dort, `FFMPEG_CACHE` erhöhen — und essentia.js in
  `vendor/essentia/` (AGPL-3.0, ausdrücklich gewünscht), nur im Worker
  `ear-worker.js` — dort, weil
  Embind `new Function` braucht und die CSP der Seite das verbietet. Nicht
  in die Seite holen und die CSP nicht um `unsafe-eval` erweitern.
- Mikrofon-Erkenner: Änderungen an `hear.js` oder `ear-worker.js` gegen die
  Simulation in `docs/archiv/mikro-sim/` prüfen, nicht nur gegen die
  Selbsttests. Die Erkenner bekommen Ziele aus `voicing.js hearTarget`
  (`{ name, rh, lh, pcs }`), keine ids aus `chords.js`; die `:song`-Griffe
  dort sind nur noch für Tests und Simulation da.
- Oberfläche nur Deutsch, keine i18n-Infrastruktur.
- Abgearbeitete Arbeitsanweisungen und Fortschrittsdateien liegen in
  `docs/archiv/`.
