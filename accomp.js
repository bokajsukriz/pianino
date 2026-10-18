/* accomp.js — REIN: Begleitung auf der Zeitleiste, je Achtel.
   Kein DOM, keine Zeit, kein Zufall. Genutzt von Geführt (Tempo-Modus),
   Groove, Play-Along (eigene Begleitung), Wann und „Klavier dazu“ im Editor.

   Ganze Noten (pattern = null): der Akkord klingt ab jedem Ereignis bis zum
   nächsten (höchstens einen Takt lang, dann neu angeschlagen).
   Muster (pattern = Groove-Stufe, tempo.js GROOVE_STAGES): je Achtel spielt
   die Hand, deren Feld gesetzt ist, den Akkord, der laut chordAt gerade gilt.
   Ein vorgezogener Wechsel ergibt sich so von selbst. */

import { chordAt, eventIndexAt } from './timeline.js';

const EPS = 1e-6;

/** Länge eines Anschlags in Achteln: bis zum nächsten aktiven Feld oder
 *  bis zum Taktende. */
export function hitLength(pattern, e) {
  let k = e + 1;
  while (k < pattern.length && !pattern[k]) k++;
  return k - e;
}

/** Schläge bis zum nächsten Ereignis nach `beat` (Infinity, wenn keins). */
function untilNext(song, beat) {
  const ev = song.events || [];
  const i = eventIndexAt(song, beat);
  const n = ev[i + 1];
  return n ? n.at - beat : Infinity;
}

/** Beginnt bei `beat` ein Ereignis (oder der Bereich, from)? */
const startsAt = (song, beat, from) => Math.abs(beat - from) < EPS
  || (song.events || []).some((e) => Math.abs(e.at - beat) < EPS);

/** Anschläge für das Achtel bei `beat` (Vielfaches von 0,5).
 *  → [{ hand: 'lh'|'rh', chord, beats, gain }] — beats: Dauer in Schlägen.
 *  from: Anfang des gespielten Bereichs (dort wird neu angeschlagen).
 *  ANNAHME: Im Muster wird bei einem Wechsel, der auf ein leeres Feld fällt,
 *  trotzdem angeschlagen (beide Hände), sonst hörte man ihn erst später. */
export function stepHits(song, beat, { pattern = null, from = 0 } = {}) {
  const chord = chordAt(song, beat);
  if (!chord) return [];
  const bpb = song.beatsPerBar;
  const inBar = ((beat % bpb) + bpb) % bpb;
  const left = Math.min(untilNext(song, beat), bpb - inBar);
  const start = startsAt(song, beat, from);
  if (!pattern) {
    const barStart = inBar < EPS;
    if (!start && !barStart) return [];
    return [
      { hand: 'lh', chord, beats: left, gain: 1.1 },
      { hand: 'rh', chord, beats: left, gain: 1 },
    ];
  }
  const e = Math.round(inBar * 2) % pattern.rh.length;
  const out = [];
  const len = (pat) => Math.min(hitLength(pat, e) / 2, left);
  if (pattern.lh[e]) out.push({ hand: 'lh', chord, beats: len(pattern.lh), gain: 1.1 });
  else if (start) out.push({ hand: 'lh', chord, beats: left, gain: 1.1 });
  const straight = pattern.rh.every(Boolean);
  if (pattern.rh[e]) out.push({ hand: 'rh', chord, beats: len(pattern.rh) * 0.95, gain: (straight ? 0.55 : 1) * (e % 2 ? 0.5 : 1) });
  else if (start) out.push({ hand: 'rh', chord, beats: left * 0.95, gain: 0.8 });
  return out;
}
