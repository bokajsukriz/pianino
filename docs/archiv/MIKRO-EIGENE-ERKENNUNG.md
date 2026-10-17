# Mikrofon: eigene Akkorderkennung (archiviert)

Stand 2026-10-17, zugunsten von essentia.js zurückgestellt. Der Code liegt
vollständig auf dem Branch `archiv/eigene-akkorderkennung` (`hear.js`,
`mic.js`, Übung „Geführt“), die Simulationsskripte in `docs/archiv/mikro-sim/`
auf demselben Branch.

## Ansatz

Keine freie Transkription, sondern Verifikation des *erwarteten* Akkords:
Pegel je Halbton aus dem AnalyserNode-Spektrum (FFT 16384, ≈ ⅓ s), dann
„klingen die drei Töne der rechten Hand, und klingt nichts Fremdes?“. Fremd =
weder Akkordton noch Teilton 1–8 eines Akkordtons oder des Basses. Nachklang
des Vorakkords (Pedal) zählt nur, wenn neu angeschlagen (Vergleich mit dem
Spektrum von 0,35 s vorher).

## Simulation

Salamander-Samples aus `samples/`, Raumhall (Direktschall −3…+8 dB),
Handy-Mikro (Hochpass 150 Hz), Rauschen −50…−30 dB, Klick, Anschlag je Ton
0…−8 dB, Arpeggio bis 80 ms, Verstimmung ±20 Cent, Vorakkord mit/ohne Pedal.
`gen.py` + `harness.mjs`: einzelne Fenster kurz nach dem Anschlag.
`gentail.py` + `tail.mjs`: ganze Ausklänge, alle 50 ms ausgewertet (so hört
die App wirklich zu).

| | richtig erkannt | Ton daneben durchgelassen | anderer Akkord durchgelassen |
|---|---|---|---|
| Einzelfenster, nur RH | 99 % | 0,7 % | 0 % |
| Einzelfenster, mit Bass | 98 % | 3,8 % | 0,5 % |
| Ausklang, beliebiges Fenster, nur RH | 100 % | 12 % | 4 % |
| Ausklang, beliebiges Fenster, mit Bass | 98 % | 55 % | 6 % |
| Ausklang, Urteil nur ≤ 1 s nach Anschlag, nur RH | 100 % | 0,8 % | 0 % |
| Ausklang, Urteil nur ≤ 1 s nach Anschlag, mit Bass | 98 % | 20 % | 1 % |

## Offene Punkte

- Im Ausklang täuschen Obertöne des Basses Akkordtöne vor (Dm mit Bass D3:
  der 5. Teilton ist F♯5 → sieht aus wie D). Mit Bass werden Ganzton-
  Fehlgriffe der rechten Hand oft nicht bemerkt.
- Urteil nur kurz nach einem Anschlag (Onset-Erkennung) hilft deutlich, ist
  in `mic.js` aber noch nicht umgesetzt. Spitzenpegel seit dem Anschlag
  (`holdLevels`) war schlechter: hält Anschlagsgeräusche als Fremdtöne fest.
- Nur simuliert, nie mit echtem Handy am echten Klavier gemessen.
