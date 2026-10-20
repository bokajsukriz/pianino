/* drill.js — REIN: „Folgen üben“. Die Abschnitte des Leadsheets werden in
   kurze Folgen zu je 2 Takten geschnitten; jede kommt mit einem Takt Vorlauf
   (Folge schon sichtbar, Klick zählt ein), dann spielt man sie zum Klick.
   Danach der nächste Vorlauf mit der nächsten Folge — oder, mit
   „Wiederholen“, dieselbe noch einmal.

   Modus „Nur Akkorde“ (unten, SWAP): kein Takt, kein Klick, geübt werden
   einzelne Griffwechsel A → B. Je Übergang ein Kästchen (box 1–5), erst die
   echten Wechsel des Stücks, die schwachen öfter; sitzen alle, kommen
   Zufallswechsel zwischen den Akkorden des Songs dazu.
   Kein DOM, keine Zeit, kein Zufall (rand und today kommen als Parameter). */

import { sectionList, sectionGrid } from './leadsheet.js';
import { chordSequence, chordAt } from './timeline.js';

const EPS = 1e-6;

/** ANNAHME: 2 Takte je Folge, 1 Takt Vorlauf, Start bei 70 Schlägen pro
 *  Minute (wenn der Song kein Tempo hat), Tempo in Fünferschritten. */
export const DRILL = Object.freeze({ size: 2, lead: 1, start: 70, step: 5, min: 30, max: 220 });

/** Folgen aus den Abschnitten (nur `sectionIds`, wenn angegeben). Gleiche
 *  Folgen (gleiche Länge, gleiche Akkorde auf denselben Schlägen) kommen nur
 *  einmal; Folgen ganz ohne Akkord fallen weg.
 *  → [{ key, name, sectionId, bar, bars, fromBeat, toBeat, grid }]
 *  grid wie leadsheet.sectionGrid (am Anfang steht der klingende Akkord). */
export function drillChunks(song, { sectionIds = null, size = DRILL.size } = {}) {
  const bpb = song.beatsPerBar;
  const out = [];
  const seen = new Set();
  for (const sec of sectionList(song)) {
    if (sectionIds && !sectionIds.includes(sec.id)) continue;
    for (let i = 0; i < sec.bars; i += size) {
      const bars = Math.min(size, sec.bars - i);
      const bar = sec.bar + i;
      const grid = sectionGrid(song, { bar, bars });
      const cells = grid.flatMap((b) => b.cells);
      if (!cells.some((c) => c.chord)) continue;
      const key = `${bars}|${cells.map((c) => (c.chord ? `${c.half ? '&' : ''}${c.chord}` : '')).join(',')}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        key,
        name: `${sec.name} · ${bars === 1 ? `Takt ${i + 1}` : `Takt ${i + 1}–${i + bars}`}`,
        sectionId: sec.id, bar, bars,
        fromBeat: (bar - 1) * bpb, toBeat: (bar - 1 + bars) * bpb,
        grid,
      });
    }
  }
  return out;
}

/** Schläge eines Durchgangs: Vorlauf plus Folge. */
export const cycleBeats = (chunk, bpb, lead = DRILL.lead) => (lead + chunk.bars) * bpb;

/** Stelle im Durchgang; `beat` zählt Schläge ab Beginn des Vorlaufs.
 *  → { lead: true, count (1…bpb), left (Schläge bis zur Folge) }
 *    | { lead: false, cell (Index in der Folge), chord (klingt gerade), next (nächster Wechsel oder null) }
 *    | null (davor oder vorbei) */
export function cyclePhase(chunk, bpb, beat, lead = DRILL.lead) {
  if (beat < -EPS) return null;
  const k = Math.floor(beat + EPS);
  const leadBeats = lead * bpb;
  if (k < leadBeats) return { lead: true, count: (k % bpb) + 1, left: leadBeats - k };
  const cell = k - leadBeats;
  const cells = chunk.grid.flatMap((b) => b.cells);
  if (cell >= cells.length) return null;
  return { lead: false, cell, chord: chordAtCell(cells, cell), next: cells.slice(cell + 1).find((c) => c.chord)?.chord ?? null };
}

/** Akkord, der in Zelle `i` klingt (letzter Wechsel davor, sonst null). */
export function chordAtCell(cells, i) {
  for (let k = Math.min(i, cells.length - 1); k >= 0; k--) if (cells[k].chord) return cells[k].chord;
  return null;
}

/** Welche Folge kommt danach? Mit `repeat` dieselbe, sonst die nächste
 *  (nach der letzten wieder die erste). */
export const nextChunk = (i, n, repeat = false) => (n ? (repeat ? i : (i + 1) % n) : -1);

/** Tempo um einen Schritt (±5) ändern, in den Grenzen. */
export const stepBpm = (bpm, dir) => Math.max(DRILL.min, Math.min(DRILL.max, Math.round(bpm) + dir * DRILL.step));

/** Anfangstempo: zuletzt geübtes, sonst das des Songs, sonst DRILL.start. */
export const startBpm = (song, saved = null) => saved ?? song.bpm ?? DRILL.start;

/* ---------- Nur Akkorde ------------------------------------------------- */

/** ANNAHME (nach Einschätzung eines Musikpädagogik-Subagenten): gemessen wird vom
 *  Anschlag des alten bis zum Anschlag des neuen Akkords (die Hörlatenz
 *  steckt in beiden und fällt heraus). Flüssig: höchstens ein Schlag im
 *  Song-Tempo, mindestens 0,8 s; zögerlich bis 2,5 s; darüber oder mit
 *  Fehlgriff hakt es. Griff aufgedeckt: höchstens zögerlich (kein Fehler,
 *  zählt aber nicht für den Aufstieg). Nichts klingt von selbst vor.
 *  3× flüssig in Folge → ein Kästchen höher, höchstens einmal am Tag (so
 *  sitzt ein Übergang frühestens am zweiten Tag); hakt es → zurück auf 1.
 *  Gewicht beim Ziehen: Kästchen 1 = 4, 2 = 2, ab 3 = 1; Wechsel, die beim
 *  gerade liegenden Akkord anfangen, dreifach (Ketten statt Umsetzen).
 *  Neue oder zuletzt hakende Übergänge kommen erst kurz geblockt
 *  (A → B → A → B), danach gemischt, nie zweimal derselbe direkt hinterein-
 *  ander. Sitzen alle echten Übergänge (Kästchen ≥ 3), ist jeder zweite
 *  ein Zufallswechsel zwischen zwei Akkorden des Songs. Eine Runde: 30
 *  Wechsel oder 3 Minuten. */
export const SWAP = Object.freeze({
  fluentMin: 0.8, slowSec: 2.5, upRun: 3, solidBox: 3, maxBox: 5,
  weight: Object.freeze({ 1: 4, 2: 2, 3: 1 }), chainBoost: 3, randomShare: 0.5,
  roundChanges: 30, roundSec: 180,
});

export const swapKey = (from, to) => `${from}>${to}`;

/** Echte Griffwechsel der Abschnitte (nur `sectionIds`, wenn angegeben), in
 *  Song-Reihenfolge; über die Grenze zweier direkt aufeinander folgender
 *  Abschnitte hinweg zählt der Wechsel mit.
 *  → { chords: [Symbol], pairs: [{ key, from, to, count }] } */
export function swapPairs(song, { sectionIds = null } = {}) {
  const runs = [];
  let prevTo = null;
  for (const sec of sectionList(song)) {
    if (sectionIds && !sectionIds.includes(sec.id)) { prevTo = null; continue; }
    if (prevTo !== sec.fromBeat || !runs.length) runs.push([]);
    const run = runs[runs.length - 1];
    for (const c of chordSequence(song, sec.fromBeat, sec.toBeat)) if (run[run.length - 1] !== c) run.push(c);
    prevTo = sec.toBeat;
  }
  const map = new Map();
  const chords = [];
  for (const run of runs) {
    for (let i = 0; i < run.length; i++) {
      if (!chords.includes(run[i])) chords.push(run[i]);
      if (!i) continue;
      const key = swapKey(run[i - 1], run[i]);
      if (!map.has(key)) map.set(key, { key, from: run[i - 1], to: run[i], count: 0 });
      map.get(key).count++;
    }
  }
  return { chords, pairs: [...map.values()] };
}

/** Wie lief ein Wechsel? sec: Anschlag zu Anschlag; missed: Fehlgriff
 *  gehört; peeked: Griff aufgedeckt. → 'fluent' | 'slow' | 'stuck' */
export function rateSwap(sec, { bpm = null, missed = false, peeked = false } = {}) {
  if (missed || !(sec >= 0)) return 'stuck';
  if (sec <= Math.max(SWAP.fluentMin, bpm ? 60 / bpm : 0)) return peeked ? 'slow' : 'fluent';
  return sec <= SWAP.slowSec ? 'slow' : 'stuck';
}

/** Neuer Zustand eines Übergangs nach einem Wechsel.
 *  Zustand: { box, run, day (Tag des letzten Aufstiegs), best (s), n, last } */
export function applySwap(t0, rating, sec, today) {
  const t = { box: 1, run: 0, day: null, best: null, n: 0, last: null, ...t0 };
  t.n += 1;
  t.last = rating;
  if (rating === 'fluent') {
    t.run += 1;
    if (t.run >= SWAP.upRun && t.day !== today && t.box < SWAP.maxBox) { t.box += 1; t.run = 0; t.day = today; }
  } else {
    t.run = 0;
    if (rating === 'stuck') t.box = 1;
  }
  if (rating !== 'stuck' && (t.best == null || sec < t.best)) t.best = sec;
  return t;
}

export const swapBox = (states, key) => states?.[key]?.box ?? 1;
/** Sitzen alle echten Übergänge? */
export const allSolid = (pairs, states) => pairs.length > 0 && pairs.every((p) => swapBox(states, p.key) >= SWAP.solidBox);

/** Nächsten Wechsel ziehen. current: liegender Akkord (oder null), lastKey:
 *  der zuletzt geübte Übergang. → { key, from, to, random } oder null */
export function pickSwap({ pairs, chords, states = {}, current = null, lastKey = null, rand }) {
  let pool = pairs, random = false;
  if (allSolid(pairs, states) && chords.length > 1 && rand() < SWAP.randomShare) {
    random = true;
    pool = chords.flatMap((a) => chords.filter((b) => b !== a).map((b) => ({ key: swapKey(a, b), from: a, to: b })));
  }
  if (pool.length > 1) pool = pool.filter((p) => p.key !== lastKey);
  if (!pool.length) return null;
  const w = pool.map((p) => SWAP.weight[Math.min(3, swapBox(states, p.key))] * (p.from === current ? SWAP.chainBoost : 1));
  let r = rand() * w.reduce((a, b) => a + b, 0);
  for (let i = 0; i < pool.length; i++) {
    r -= w[i];
    if (r < 0) return { key: pool[i].key, from: pool[i].from, to: pool[i].to, random };
  }
  const p = pool[pool.length - 1];
  return { key: p.key, from: p.from, to: p.to, random };
}

/** Wechsel, die für einen gezogenen Übergang anstehen: neu oder zuletzt
 *  hakend erst kurz geblockt (A → B → A → B), sonst einmal.
 *  → [{ from, to }] */
export function swapQueue(pick, states = {}) {
  const t = states[pick.key];
  const one = { from: pick.from, to: pick.to };
  if (t && t.last !== 'stuck') return [one];
  return [one, { from: pick.to, to: pick.from }, one];
}

/** Runde vorbei? */
export const roundOver = (changes, sec) => changes >= SWAP.roundChanges || sec >= SWAP.roundSec;

/** Schwächster Übergang einer Runde: die meisten „hakt“, dann der
 *  langsamste Median. results: [{ key, from, to, rating, sec }] → Eintrag oder null */
export function weakestSwap(results) {
  const by = new Map();
  for (const r of results) {
    if (!by.has(r.key)) by.set(r.key, { key: r.key, from: r.from, to: r.to, stuck: 0, secs: [] });
    const b = by.get(r.key);
    if (r.rating === 'stuck') b.stuck++;
    b.secs.push(r.sec);
  }
  const median = (xs) => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor((s.length - 1) / 2)]; };
  const list = [...by.values()].filter((b) => b.stuck || results.some((r) => r.key === b.key && r.rating !== 'fluent'));
  list.sort((a, b) => b.stuck - a.stuck || median(b.secs) - median(a.secs));
  return list[0] || null;
}

/** Folge (drillChunks), in der `from` → `to` vorkommt — am liebsten
 *  mittendrin, sonst eine, die mit `to` beginnt, während davor `from`
 *  klang (Wechsel genau auf der Eins der Folge). → Index oder -1 */
export function chunkWith(song, chunks, from, to) {
  const seqOf = (c) => {
    const seq = [];
    for (const cell of c.grid.flatMap((b) => b.cells)) if (cell.chord && seq[seq.length - 1] !== cell.chord) seq.push(cell.chord);
    return seq;
  };
  const seqs = chunks.map(seqOf);
  const inside = seqs.findIndex((seq) => seq.some((x, i) => i > 0 && seq[i - 1] === from && x === to));
  if (inside >= 0) return inside;
  return chunks.findIndex((c, i) => seqs[i][0] === to && c.fromBeat > 0 && chordAt(song, c.fromBeat - 0.5) === from);
}
