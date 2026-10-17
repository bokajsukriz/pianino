# Pianino — Hinweise für Claude Code

Kleine private Übe-App fürs Klavier (Begleiten von Gesang). Statische PWA,
**kein Build-Schritt**: kein Bundler, kein `package.json`, keine
npm-Abhängigkeiten, kein Framework. Plain HTML, CSS und JavaScript als
ES-Module. Architektur und Dateiübersicht: `README.md`.

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

`chords.js`, `leitner.js`, `tempo.js`, `mix.js`, `phrases.js`, `hear.js`,
`song-perfect-ruin.js`,
`test-melody.js` und `selftest.js` (bis auf die Browser-Tests, die erst bei
Bedarf per `import()` geladen werden): kein DOM, kein `Date.now()`, kein
`Math.random()`. Zeit und Zufall kommen als Parameter (`today: 'YYYY-MM-DD'`,
`rand: () => number`). Nur so laufen die Tests in Node.

## Songdaten sind unverifiziert

`song-perfect-ruin.js` hat `verified: false`. Die Akkordfolge stammt aus
Nutzer-Tabs, der harmonische Rhythmus (ein Akkord pro Takt) ist eine Annahme.
Nichts dazuerfinden, keine Melodie transkribieren, **kein Liedtext** in der
App. Musikalische Annahmen im Code mit `// ANNAHME:` markieren.

## Testen

```
node --input-type=module -e "import { runSelfTests } from './selftest.js'; const r = await runSelfTests(); process.exit(r.failed ? 1 : 0)"
```

prüft die reinen Module (Tests 1–4, 6). Im Browser zusätzlich Takt-Scheduler
(Test 5, `OfflineAudioContext`) und einen Audio-Smoke-Test: Konsole
`runSelfTests()` oder „Über“ → „Selbsttest“.

## Sonst

- Speicher: IndexedDB `pianino`, Store `meta`, Schlüssel `id` (`db.js`).
  `localStorage` nur für das Fehlerprotokoll.
- Ändert sich die Bedeutung gespeicherter Felder: `DATA_VERSION` in `db.js`
  erhöhen und unter `MIGRATIONS[neue Version]` eine idempotente Umstellung
  eintragen.
- Audio-Timing nur über `clock.js` (Lookahead auf der `AudioContext`-Uhr),
  nie `setInterval`. Die Anzeige folgt der Audio-Uhr per
  `requestAnimationFrame`.
- Keine externen Requests zur Laufzeit; die Content-Security-Policy in
  `index.html` erlaubt nur die eigene Herkunft.
- Einzige fremde Bibliothek: essentia.js in `vendor/essentia/` (AGPL-3.0,
  ausdrücklich gewünscht), nur im Worker `ear-worker.js` — dort, weil
  Embind `new Function` braucht und die CSP der Seite das verbietet. Nicht
  in die Seite holen und die CSP nicht um `unsafe-eval` erweitern.
- Mikrofon-Erkenner: Änderungen an `hear.js` oder `ear-worker.js` gegen die
  Simulation in `docs/archiv/mikro-sim/` prüfen, nicht nur gegen die
  Selbsttests.
- Oberfläche nur Deutsch, keine i18n-Infrastruktur.
- Abgearbeitete Arbeitsanweisungen und Fortschrittsdateien liegen in
  `docs/archiv/`.
