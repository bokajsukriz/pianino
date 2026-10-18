/* drill.js — REIN: „Folgen üben“. Die Abschnitte des Leadsheets werden in
   kurze Folgen zu je 2 Takten geschnitten; jede kommt mit einem Takt Vorlauf
   (Folge schon sichtbar, Klick zählt ein), dann spielt man sie zum Klick.
   Danach der nächste Vorlauf mit der nächsten Folge — oder, mit
   „Wiederholen“, dieselbe noch einmal. Kein DOM, keine Zeit, kein Zufall. */

import { sectionList, sectionGrid } from './leadsheet.js';

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
