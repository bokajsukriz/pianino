/* ==========================================================================
   piano-samples.js — Klavier der App: Salamander Grand Piano (Yamaha C5,
   Alexander Holm, CC BY 3.0) in der Fassung von Tone.js (github.com/Tonejs/audio,
   Ordner salamander/). Die Dateien liegen unverändert in samples/salamander/
   (MIDI-Nummer als Name), Herkunft und Lizenz in THIRD-PARTY.md.
   Zuerst aus der Schwester-App bokajsukriz/choirapp übernommen (Namespace
   ChorPiano bleibt); klassisches Skript, kein ES-Modul. Inzwischen drei
   Anschlagstärken (soft/mid/loud = Stufen 4, 8, 12 von 16 aus Tone Piano,
   github.com/tambien/Piano, gleiche Aufnahmen), vorab gekürzt, zu Mono
   gemischt und mit 96 kbit/s neu kodiert (THIRD-PARTY.md).

   Ein Ton alle drei Halbtöne (C1–C7 = MIDI 24–96), dazwischen umgestimmt
   (höchstens ±1,5 Halbtöne). Die Quelle klingt voll aus (bis 24 s, stereo) –
   dekodiert wären das über 100 MB. load() kürzt deshalb beim Laden auf die
   Länge, die die App braucht (keepSec), mischt zu Mono und blendet aus
   (die Dateien sind schon auf diese Längen gekürzt);
   dekodiert wird höchstens zu dritt gleichzeitig.

   Stimmung: Salamander ist konzertmäßig gespreizt gestimmt (tief bis −24,
   hoch bis +24 Cent). Fürs Mitsingen zählt der gleichstufige Ton – play()
   rechnet die gemessene Abweichung je Datei heraus (TUNE).

   Diese Datei steht in sw.js unter SHELL — jede Änderung braucht eine neue
   SW_VERSION.
   ========================================================================== */
(function () {
  'use strict';

  const NOTES = [];
  for (let m = 24; m <= 96; m += 3) NOTES.push(m);
  /** Gemessene Abweichung des Grundtons je Datei in Cent gegenüber gleichstufig
   *  (a′ = 440 Hz): fein gerasterte DFT um den Sollton, Hann-Fenster, 0,12–1,12 s
   *  nach dem Anschlag; bis 36 am 2. Teilton (der Grundton ist dort zu schwach),
   *  39 Mittel aus Grundton (−11) und 2. Teilton (−6). */
  const TUNE = {
    24: -24, 27: -17.2, 30: -10.5, 33: -7.3, 36: -9.5, 39: -8.5, 42: -5.4, 45: -5.6, 48: -6.1,
    51: -1.9, 54: -5.9, 57: .8, 60: -1.4, 63: 1.2, 66: -2.9, 69: .7, 72: 4.9, 75: 3.3, 78: 4.4,
    81: 7.1, 84: 8.6, 87: 6.8, 90: 12.1, 93: 14.7, 96: 23.6,
  };
  /** Drei Anschlagstärken desselben Flügels (Ordner samples/salamander/<Stufe>/). */
  const LAYERS = ['soft', 'mid', 'loud'];
  const BASE = './samples/salamander/mid/';
  const baseOf = (layer) => `./samples/salamander/${layer}/`;

  /** Rohdatei → Mono-Puffer: Stille am Anfang weg (MP3-Vorlauf, sonst kommt der
   *  Anschlag spät), auf keepSec gekürzt, am Ende ausgeblendet. */
  function prepare(raw, keepSec) {
    const sr = raw.sampleRate, chs = raw.numberOfChannels, len = raw.length;
    const mono = new Float32Array(len);
    for (let c = 0; c < chs; c++) { const d = raw.getChannelData(c); for (let i = 0; i < len; i++) mono[i] += d[i] / chs; }
    let peak = 0;
    for (let i = 0; i < len; i++) peak = Math.max(peak, Math.abs(mono[i]));
    let i0 = 0;
    while (i0 < len && Math.abs(mono[i0]) < peak * .02) i0++;
    i0 = Math.max(0, i0 - Math.round(sr * .001));
    const n = Math.min(len - i0, Math.round(keepSec * sr));
    // Leere/stumme Datei: AudioBuffer der Länge 0 wäre ein NotSupportedError.
    if (!(n > 0) || !(peak > 0)) throw new Error('Klavier: leere Datei');
    const out = mono.slice(i0, i0 + n);
    const fade = Math.min(n >> 2, Math.round(Math.min(.8, keepSec * .25) * sr));
    for (let i = 0; i < fade; i++) out[n - 1 - i] *= i / fade;
    const b = new AudioBuffer({ length: n, numberOfChannels: 1, sampleRate: sr });
    b.copyToChannel(out, 0);
    return b;
  }
  /** Lautstärke je Datei angleichen: Effektivwert 0,02–0,4 s nach dem Anschlag
   *  auf den Median des Satzes (die Aufnahmen sind je Ton verschieden laut). */
  function levels(bufs) {
    const rms = {};
    for (const [n, b] of Object.entries(bufs)) {
      const d = b.getChannelData(0), a = Math.round(.02 * b.sampleRate), z = Math.min(d.length, Math.round(.4 * b.sampleRate));
      let e = 0; for (let i = a; i < z; i++) e += d[i] * d[i];
      rms[n] = Math.sqrt(e / Math.max(1, z - a));
    }
    const sorted = Object.values(rms).sort((x, y) => x - y), med = sorted[sorted.length >> 1];
    return { ref: med, gain: Object.fromEntries(Object.entries(rms).map(([n, v]) => [n, v > 0 ? Math.min(6, Math.max(.25, med / v)) : 1])) };
  }

  const sets = new Map(); // Schlüssel aus Tönen und Länge → Promise eines Satzes
  /** Satz laden: { notes, bufs, gain, ref } (ref: Effektivwert, auf den die
   *  Datei-Pegel angeglichen sind — damit lassen sich Sätze untereinander ausgleichen). notes: welche Dateien (Teilmenge von
   *  NOTES), keepSec(midi): Länge je Ton in s. Einmal je Schlüssel; nach einem
   *  Fehler (offline) beim nächsten Aufruf erneut. */
  function load({ notes = NOTES, keepSec = () => 4, base = BASE } = {}) {
    const key = `${base}|${notes.map((n) => `${n}:${keepSec(n)}`).join(',')}`;
    if (sets.has(key)) return sets.get(key);
    const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    if (!OAC) return Promise.reject(new Error('Kein Web Audio'));
    const dec = new OAC(1, 1, 44100); // AudioBuffer gehören keinem Kontext
    const bufs = {};
    const queue = [...notes];
    let failed = false; // ein Fehler (offline) → die übrigen Worker hören auf
    const worker = async () => {
      try {
        while (queue.length && !failed) {
          const n = queue.shift();
          const r = await fetch(`${base}${n}.mp3`);
          if (!r.ok) throw new Error(`Klavier ${n}: ${r.status}`);
          bufs[n] = prepare(await dec.decodeAudioData(await r.arrayBuffer()), keepSec(n));
        }
      } catch (err) { failed = true; throw err; }
    };
    const p = Promise.all([worker(), worker(), worker()]).then(() => Object.freeze({ notes: [...notes], bufs, ...levels(bufs) }));
    sets.set(key, p);
    p.catch(() => { if (sets.get(key) === p) sets.delete(key); });
    return p;
  }
  /** Nächste geladene Datei zu einem Ton. */
  const nearest = (set, midi) => set.notes.reduce((b, x) => (Math.abs(x - midi) < Math.abs(b - midi) ? x : b), set.notes[0]);
  /** Abspielrate inkl. Stimmungskorrektur der Datei. */
  const rateFor = (midi, n) => Math.pow(2, (midi - n - (TUNE[n] || 0) / 100) / 12);

  /** Ton spielen. gain: absolut (× Ausgleich der Datei); dur: Note endet und
   *  klingt in `release` s aus (null = bis zum Ende der Datei); cutoff: Tiefpass
   *  (Anschlagstärke). dest fehlt → `out` unverbunden zurück, die
   *  Seite verbindet selbst. Rückgabe { src, out }. */
  function play(ctx, set, midi, time, { dur = null, gain = 1, release = .15, cutoff = null, dest = null } = {}) {
    const n = nearest(set, midi), b = set.bufs[n];
    const src = ctx.createBufferSource();
    src.buffer = b;
    src.playbackRate.value = rateFor(midi, n);
    const out = ctx.createGain();
    const g = gain * (set.gain[n] || 1);
    out.gain.setValueAtTime(g, time);
    let node = src;
    if (cutoff) {
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass'; lp.Q.value = .4; lp.frequency.value = cutoff;
      node = node.connect(lp);
    }
    node.connect(out);
    const len = b.duration / src.playbackRate.value;
    if (dur !== null && dur + release < len) {
      out.gain.setValueAtTime(g, time + dur);
      out.gain.linearRampToValueAtTime(.0001, time + dur + release);
      src.start(time); src.stop(time + dur + release + .02);
    } else src.start(time);
    if (dest) out.connect(dest);
    return { src, out };
  }

  window.ChorPiano = { NOTES, LAYERS, TUNE, BASE, baseOf, load, play, nearest, rateFor };
})();
