# Simulation für die Mikrofon-Erkenner

Prüfstand für `hear.js` (eigen) und `ear-worker.js` (essentia.js): echte
Klaviersamples (`samples/salamander/`) mit Raumhall, Handy-Mikro (Hochpass
150 Hz), Rauschen, Klick, ungleichem Anschlag, ±20 Cent und Nachklang des
Vorakkords mit/ohne Pedal. Python 3 mit numpy, ffmpeg, Node.

1. Samples als WAV (22,05 kHz mono) nach `../wav/` (relativ zu hier):
   `for f in ../../../samples/salamander/*.mp3; do ffmpeg -i $f -ac 1 -ar 22050 -t 4 ../wav/$(basename ${f%.mp3}).wav; done`
2. `python3 gentail.py 16` → `tail.json` + `tail.f32` (800 Ausklänge, ≈ 300 MB, nicht einchecken).
3. Eigener Erkenner: `WIN=1.0 node tail-eigen.mjs` (Urteil bis 1 s nach dem Anschlag).
4. essentia: npm-Paket `essentia.js@0.1.3` entpacken, `ESSENTIA=<Pfad zu package> node tail-essentia.cjs <von> <bis> 8192`
   (Szenen-Bereich; mehrere Prozesse parallel; `chordcheck.cjs` = Prüfung aus `ear-worker.js`).
5. Im Browser mit Fake-Mikrofon: `perf2.py` erzeugt Aufnahmen (`fast`, `tempo`),
   `run.cjs` / `run2.cjs` steuern die App per Playwright
   (`--use-file-for-fake-audio-capture`, Server auf Port 8765).

Messwerte stehen in den Kopfkommentaren von `hear.js` und `ear-worker.js`.
