/* leadsheet.js — REIN: die Liedseite als Leadsheet. Abschnitte sind
   Taktbereiche (song.sections: { id, name, bar, bars, startSec }), lückenlos
   hintereinander ab Takt 1; startSec ist die Sekunde im Video, an der der
   Abschnitt beginnt (gesetzt mit „Start hier“). Akkorde sind die Ereignisse
   des Songs (song.events, Schläge ab der Eins von Takt 1) — dieselben Daten,
   mit denen „Geführt“, „Wann“ und die Akkordübungen arbeiten. Eine Zelle im
   Raster ist ein Schlag (4/4: Viertel, 6/8: Achtel). Kein DOM, keine Zeit,
   kein Zufall. */

import { normalizeSong, setEvent, removeEvent, moveEvent } from './songdata.js';
import { eventIndexAt } from './timeline.js';
import { classifyLine, stripMarkup } from './tabtext.js';
import { sortMarks } from './marks.js';

const EPS = 1e-6;
export const METERS = Object.freeze([4, 3, 6, 2]);
/** ANNAHME: ein neuer Abschnitt hat 8 Takte, bis man es ändert. */
export const DEFAULT_BARS = 8;
export const MAX_BARS = 64;

const sorted = (song) => [...(song.sections || [])].sort((a, b) => a.bar - b.bar);

/** Abschnitte mit Schlagbereich: [{ …section, fromBeat, toBeat }]. */
export function sectionList(song) {
  const bpb = song.beatsPerBar;
  return sorted(song).map((s) => ({ ...s, fromBeat: (s.bar - 1) * bpb, toBeat: (s.bar - 1 + s.bars) * bpb }));
}

/** Freie id: s1, s2, … */
function freeId(song) {
  const taken = new Set((song.sections || []).map((s) => s.id));
  let n = 1;
  while (taken.has(`s${n}`)) n++;
  return `s${n}`;
}

/** Abschnitt hinten anfügen. */
export function addSection(song, { name, bars = DEFAULT_BARS, startSec = null }) {
  const list = sorted(song);
  const last = list[list.length - 1];
  const bar = last ? last.bar + last.bars : 1;
  const sec = { id: freeId(song), name, bar, bars: clampBars(bars) };
  if (startSec != null) sec.startSec = Math.round(startSec * 100) / 100;
  return { ...song, sections: [...list, sec] };
}

const clampBars = (n) => Math.max(1, Math.min(MAX_BARS, Math.round(n)));

/** Ereignisse/Textzeilen ab `fromBeat` um `by` Schläge verschieben; was in
 *  [cutFrom, cutTo) liegt, fällt weg. */
function shiftTimeline(song, fromBeat, by, cutFrom = null, cutTo = null) {
  const inCut = (at) => cutFrom != null && at >= cutFrom - EPS && at < cutTo - EPS;
  const move = (at) => (at >= fromBeat - EPS ? at + by : at);
  const events = (song.events || []).filter((e) => !inCut(e.at)).map((e) => ({ ...e, at: move(e.at) }));
  const out = { ...song, events };
  if (Array.isArray(song.lyrics)) {
    out.lyrics = song.lyrics.map((l) => (l.at == null ? l : inCut(l.at) ? { ...l, at: null } : { ...l, at: move(l.at) }));
  }
  return out;
}

/** Taktzahl eines Abschnitts ändern. Spätere Abschnitte und ihre Akkorde
 *  rücken mit; beim Kürzen fallen die Akkorde der weggefallenen Takte weg. */
export function resizeSection(song, id, bars) {
  const list = sectionList(song);
  const s = list.find((x) => x.id === id);
  if (!s) return song;
  const n = clampBars(bars), delta = n - s.bars;
  if (!delta) return song;
  const bpb = song.beatsPerBar;
  const oldEnd = s.toBeat, newEnd = s.fromBeat + n * bpb;
  const shifted = delta < 0 ? shiftTimeline(song, oldEnd, delta * bpb, newEnd, oldEnd) : shiftTimeline(song, oldEnd, delta * bpb);
  const sections = list.map(({ fromBeat, toBeat, ...x }) => {
    void fromBeat; void toBeat;
    if (x.id === id) return { ...x, bars: n };
    return x.bar > s.bar ? { ...x, bar: x.bar + delta } : x;
  });
  return normalizeSong({ ...shifted, sections });
}

/** Abschnitt löschen; seine Akkorde fallen weg, die späteren rücken auf. */
export function deleteSection(song, id) {
  const list = sectionList(song);
  const s = list.find((x) => x.id === id);
  if (!s) return song;
  const bpb = song.beatsPerBar;
  const shifted = shiftTimeline(song, s.toBeat, -s.bars * bpb, s.fromBeat, s.toBeat);
  const sections = list.filter((x) => x.id !== id).map(({ fromBeat, toBeat, ...x }) => {
    void fromBeat; void toBeat;
    return x.bar > s.bar ? { ...x, bar: x.bar - s.bars } : x;
  });
  return normalizeSong({ ...shifted, sections });
}

/** Abschnitt ändern (Name, startSec). */
export function updateSection(song, id, patch) {
  return { ...song, sections: (song.sections || []).map((s) => (s.id === id ? { ...s, ...patch } : s)) };
}

/** Taktart ändern. Akkorde behalten Takt und Zählzeit; was über den neuen
 *  Takt hinausgeht (z. B. Schlag 4 bei 3/4), fällt weg. */
export function setBeatsPerBar(song, n) {
  const old = song.beatsPerBar;
  if (n === old) return song;
  const conv = (at) => {
    const bar = Math.floor(at / old + EPS), inBar = at - bar * old;
    return inBar >= n - EPS ? null : bar * n + inBar;
  };
  const events = [];
  for (const e of song.events || []) {
    const at = conv(e.at);
    if (at != null) events.push({ ...e, at });
  }
  const out = { ...song, beatsPerBar: n, events };
  if (Array.isArray(song.lyrics)) out.lyrics = song.lyrics.map((l) => (l.at == null ? l : { ...l, at: conv(l.at) }));
  return normalizeSong(out);
}

/** Akkord ab Schlag `beat` setzen (null: kein Wechsel hier). */
export function setChordAt(song, beat, chord) {
  return chord ? setEvent(song, beat, chord) : removeEvent(song, beat);
}

/** Wechsel bei `beat` um einen Schlag verschieben. → { song, at } */
export const shiftChordAt = (song, beat, dir) => moveEvent(song, beat, dir);

/** Zellen eines Abschnitts: Takte mit je beatsPerBar Zellen.
 *  → [{ bar (absolut, 1-basiert), cells: [{ beat, chord, half, early }] }]
 *  chord: Akkord, der auf diesem Schlag wechselt (null = keiner); half:
 *  der Wechsel liegt auf „und“ (zwischen zwei Schlägen); early: Wechsel auf
 *  dem letzten Schlag vor dem Taktstrich (vorgezogen). Am Anfang des
 *  Abschnitts zeigt die erste Zelle den Akkord, der dort schon klingt. */
export function sectionGrid(song, section) {
  const bpb = song.beatsPerBar;
  const ev = song.events || [];
  const out = [];
  for (let b = 0; b < section.bars; b++) {
    const bar = section.bar + b, start = (bar - 1) * bpb;
    const cells = [];
    for (let k = 0; k < bpb; k++) {
      const beat = start + k;
      const hits = ev.filter((e) => e.at >= beat - EPS && e.at < beat + 1 - EPS);
      let chord = hits.length ? hits[hits.length - 1].chord : null;
      const half = hits.length > 0 && hits.every((e) => Math.abs(e.at - beat) > EPS);
      if (!chord && b === 0 && k === 0) {
        const i = eventIndexAt(song, beat);
        if (i >= 0) chord = ev[i].chord;
      }
      cells.push({ beat, chord, half, early: !!chord && k === bpb - 1 && bpb > 2, carried: !hits.length && !!chord });
    }
    out.push({ bar, cells });
  }
  return out;
}

/** Wo beginnen und enden die Abschnitte im Video? startSec, wenn gesetzt;
 *  sonst aus dem Ende des vorigen (mit Tempo) bzw. unbekannt.
 *  → [{ id, start: Sekunde | null, end: Sekunde | null }] */
export function sectionTimes(song, durationSec = 0) {
  const list = sectionList(song);
  const beat = song.bpm ? 60 / song.bpm : null;
  const offset = (song.sources || []).find((s) => s?.type === 'youtube')?.offsetSec;
  const out = [];
  for (let i = 0; i < list.length; i++) {
    const s = list[i];
    let start = s.startSec ?? null;
    if (start == null && beat && offset != null) start = offset + s.fromBeat * beat;
    if (start == null && beat && i > 0 && out[i - 1].start != null) start = out[i - 1].start + list[i - 1].bars * song.beatsPerBar * beat;
    out.push({ id: s.id, start, end: null });
  }
  for (let i = 0; i < out.length; i++) {
    const next = out.slice(i + 1).find((x) => x.start != null)?.start ?? null;
    const own = out[i].start != null && beat ? out[i].start + list[i].bars * song.beatsPerBar * beat : null;
    out[i].end = own != null && next != null ? Math.min(own, next) : own ?? next ?? (durationSec > 0 && out[i].start != null ? durationSec : null);
  }
  return out;
}

/** Stelle im Leadsheet zur Video-Sekunde t: der Abschnitt mit der letzten
 *  Startzeit ≤ t und der Schlag darin — mit Tempo genau, ohne Tempo
 *  ungefähr (die Zeit bis zum Start des nächsten Abschnitts gleichmäßig auf
 *  seine Takte verteilt).
 *  → { id, beat (absolut) | null } oder null */
export function playPos(song, t, durationSec = 0) {
  const list = sectionList(song);
  const times = sectionTimes(song, durationSec);
  let k = -1;
  times.forEach((x, i) => { if (x.start != null && x.start <= t + EPS && (k < 0 || x.start >= times[k].start)) k = i; });
  if (k < 0) return null;
  const s = list[k];
  const bd = barDur(song, list, times, k);
  if (bd == null) return { id: s.id, beat: null };
  const rel = ((t - times[k].start) / bd) * song.beatsPerBar;
  if (rel >= s.bars * song.beatsPerBar) return { id: s.id, beat: null };
  return { id: s.id, beat: s.fromBeat + rel };
}

/** Dauer eines Takts im Abschnitt k (Sekunden): aus dem Tempo, sonst aus
 *  dem Abstand zum nächsten Start geteilt durch die Takte; sonst null. */
function barDur(song, list, times, k) {
  if (song.bpm) return (song.beatsPerBar * 60) / song.bpm;
  const start = times[k].start;
  const next = times.slice(k + 1).find((x) => x.start != null && x.start > start)?.start;
  return start != null && next != null ? (next - start) / list[k].bars : null;
}

/** Wo die Takte fromBar…toBar (absolut, einschließlich) eines Abschnitts im
 *  Video liegen. → { start, end } oder null */
export function barsTime(song, id, fromBar, toBar, durationSec = 0) {
  const list = sectionList(song);
  const times = sectionTimes(song, durationSec);
  const k = list.findIndex((x) => x.id === id);
  if (k < 0 || times[k].start == null) return null;
  const s = list[k];
  const a = Math.max(s.bar, Math.min(fromBar, toBar)), b = Math.min(s.bar + s.bars - 1, Math.max(fromBar, toBar));
  if (a > b) return null;
  const bd = barDur(song, list, times, k);
  if (bd == null) return null;
  return { start: times[k].start + (a - s.bar) * bd, end: times[k].start + (b - s.bar + 1) * bd };
}

/** Takt-Auswahl für den Loop: Antippen eines Takts. sel = null (ganzer
 *  Abschnitt) oder { from, to }. Ist ein einzelner Takt gewählt, macht ein
 *  zweiter Takt daraus einen Bereich, derselbe noch einmal hebt die Auswahl
 *  auf; sonst wird der getippte Takt allein gewählt. → neue Auswahl */
export function nextBarSelection(sel, bar) {
  if (sel && sel.from === sel.to) {
    if (sel.from === bar) return null;
    return { from: Math.min(sel.from, bar), to: Math.max(sel.from, bar) };
  }
  return { from: bar, to: bar };
}

/** Vorlauf vor dem Loop und zwischen den Durchgängen: der Takt davor im
 *  Video (Sekunden Videozeit), damit man den Einsatz findet.
 *  ANNAHME: ohne Tempo 2 Sekunden. */
export const loopLead = (song) => (song.bpm ? (song.beatsPerBar * 60) / song.bpm : 2);

/* ---------- Tabs auf die Abschnitte aufteilen -------------------------- */

/** Tab-Text in Blöcke an den Überschriften: [{ header, lines: [{kind,text}] }].
 *  Text vor der ersten Überschrift wird ein Block ohne header. */
export function tabBlocks(text, lines = null) {
  const ls = lines || stripMarkup(text).split('\n').map((l) => ({ kind: classifyLine(l), text: l.replace(/\s+$/, '') }));
  const out = [];
  let cur = null;
  for (const l of ls) {
    if (l.kind === 'header') { cur = { header: l.text.trim().replace(/^\[|\]$/g, ''), lines: [] }; out.push(cur); continue; }
    if (!cur) { cur = { header: null, lines: [] }; out.push(cur); }
    cur.lines.push(l);
  }
  for (const b of out) {
    while (b.lines.length && b.lines[b.lines.length - 1].kind === 'blank') b.lines.pop();
    while (b.lines.length && b.lines[0].kind === 'blank') b.lines.shift();
  }
  return out.filter((b) => b.header || b.lines.length);
}

/** Tab-Blöcke den Abschnitten zuordnen: der Reihe nach (ein Block mit
 *  Überschrift je Abschnitt). → { [sectionId]: block, rest: [blocks] } */
export function blocksForSections(song, blocks) {
  const withHeader = blocks.filter((b) => b.header);
  const list = sectionList(song);
  const map = {};
  list.forEach((s, i) => { if (withHeader[i]) map[s.id] = withHeader[i]; });
  return { map, rest: withHeader.slice(list.length), intro: blocks.filter((b) => !b.header) };
}

const NAME_MAP = [
  [/^intro/i, 'Intro'], [/^(verse|strophe|vers)/i, 'Strophe'], [/^pre-?chorus/i, 'Pre-Chorus'],
  [/^(chorus|refrain)/i, 'Refrain'], [/^bridge/i, 'Bridge'], [/^(outro|ending|coda)/i, 'Outro'],
  [/^(solo|instrumental|interlude|zwischenspiel)/i, 'Zwischenspiel'],
];

/** Abschnitte (und einen Vorschlag für die Akkorde) aus den Überschriften
 *  und Akkordzeilen der Tabs.
 *  ANNAHME: Eine Akkordzeile im Tab sind 2 Takte; ihre Akkorde verteilen
 *  sich darauf: 1 → ganze 2 Takte, 2 → je ein Takt, 3 → ein Takt, dann
 *  zwei halbe, 4 → je ein halber Takt, mehr → je ein halber Takt, bis die
 *  2 Takte voll sind. Nur ein Vorschlag zum Anhören und Korrigieren.
 *  → neuer Song (Abschnitte und Ereignisse ersetzt) */
export function sectionsFromTabs(song, text) {
  const blocks = tabBlocks(text).filter((b) => b.header);
  const bpb = song.beatsPerBar;
  let s = { ...song, sections: [], events: [] };
  const events = [];
  const counts = {};
  for (const b of blocks) {
    const base = (NAME_MAP.find(([re]) => re.test(b.header)) || [null, b.header])[1];
    const numbered = ['Strophe', 'Refrain', 'Pre-Chorus', 'Bridge', 'Zwischenspiel'].includes(base);
    counts[base] = (counts[base] || 0) + 1;
    const name = numbered ? `${base} ${counts[base]}` : base;
    const chordLines = b.lines.filter((l) => l.kind === 'chords');
    const bars = Math.max(1, chordLines.length * 2);
    const startBeat = (s.sections.reduce((a, x) => a + x.bars, 0)) * bpb;
    s = addSection(s, { name, bars });
    chordLines.forEach((l, li) => {
      const chords = l.text.trim().split(/\s+/).filter((x) => /^[A-H]/.test(x)).map((x) => x.replace(/^\(+|\)+$/g, ''));
      const lineStart = startBeat + li * 2 * bpb;
      const half = bpb / 2, slots = chords.length === 1 ? [0] : chords.length === 2 ? [0, bpb]
        : chords.length === 3 ? [0, bpb, bpb + half] : chords.map((_, i) => i * half);
      chords.forEach((c, i) => { if (slots[i] != null && slots[i] < 2 * bpb) events.push({ at: lineStart + slots[i], chord: c }); });
    });
  }
  const chords = [...(song.chords || [])];
  for (const e of events) if (!chords.includes(e.chord)) chords.push(e.chord);
  return normalizeSong({ ...s, chords, events: events.sort((a, b) => a.at - b.at) });
}

/** Alte Abschnitts-Marken (Sekunden) in Abschnitte mit Startzeit umwandeln.
 *  ANNAHME: je 8 Takte (DEFAULT_BARS), bis man es ändert. */
export function marksToSections(song) {
  if (!(song.marks || []).length || (song.sections || []).length) return song;
  let s = { ...song };
  for (const m of sortMarks(song.marks)) s = addSection(s, { name: m.name, startSec: m.sec });
  delete s.marks;
  return normalizeSong(s);
}

/** Abschnitte nach ihrer Startzeit im Video ordnen (aufsteigend). Abschnitte
 *  ohne bekannte Startzeit bleiben hinter ihrem Vorgänger. Jeder Abschnitt
 *  nimmt seine Akkorde (und Textzeilen) mit; der Akkord, der an seinem
 *  Anfang klingt, wird dort als Wechsel festgehalten, damit er nach dem
 *  Umstellen derselbe bleibt. Schon geordnet → derselbe Song zurück. */
export function orderByStart(song) {
  const list = sectionList(song);
  if (list.length < 2) return song;
  const times = sectionTimes(song);
  let key = -Infinity;
  const keyed = list.map((s, i) => {
    if (times[i].start != null) key = times[i].start;
    return { s, key, i };
  });
  const order = [...keyed].sort((a, b) => a.key - b.key || a.i - b.i);
  if (order.every((x, k) => x.i === k)) return song;
  const bpb = song.beatsPerBar;
  // Klingenden Akkord am Abschnittsanfang festhalten.
  let base = song;
  for (const s of list) {
    if ((base.events || []).some((e) => Math.abs(e.at - s.fromBeat) < EPS)) continue;
    const i = eventIndexAt(base, s.fromBeat);
    if (i >= 0) base = { ...base, events: [...base.events, { at: s.fromBeat, chord: base.events[i].chord }].sort((a, b) => a.at - b.at) };
  }
  const end = list[list.length - 1].toBeat;
  let bar = 1;
  const moved = new Map(); // id → Verschiebung in Schlägen
  const sections = order.map(({ s }) => {
    const { fromBeat, toBeat, ...x } = s;
    void toBeat;
    moved.set(s.id, (bar - 1) * bpb - fromBeat);
    const out = { ...x, bar };
    bar += s.bars;
    return out;
  });
  const shift = (at) => {
    if (at < list[0].fromBeat - EPS || at >= end - EPS) return at;
    const s = list.find((x) => at >= x.fromBeat - EPS && at < x.toBeat - EPS);
    return s ? at + moved.get(s.id) : at;
  };
  const out = { ...base, sections, events: (base.events || []).map((e) => ({ ...e, at: shift(e.at) })).sort((a, b) => a.at - b.at) };
  if (Array.isArray(song.lyrics)) out.lyrics = song.lyrics.map((l) => (l.at == null ? l : { ...l, at: shift(l.at) }));
  return normalizeSong(out);
}

/** Taktzahlen aus der Zeit: Ist das Tempo bekannt, bekommt jeder Abschnitt,
 *  dessen Takte nicht von Hand gesetzt sind (barsSet), so viele Takte, wie
 *  bis zum Start des nächsten Abschnitts (mit eigener Startzeit) passen.
 *  ANNAHME: auf ganze Takte gerundet, mindestens 1. Der letzte Abschnitt
 *  behält seine Takte (sein Ende ist noch offen). Würde das Kürzen Akkorde
 *  wegnehmen, bleibt der Abschnitt, wie er ist. */
export function fitBars(song) {
  if (!song.bpm) return song;
  const bpb = song.beatsPerBar;
  let s = song;
  for (const id of sectionList(song).map((x) => x.id)) {
    const list = sectionList(s);
    const i = list.findIndex((x) => x.id === id);
    const sec = list[i], next = list[i + 1];
    if (!next || sec.barsSet || next.startSec == null) continue;
    const start = sectionTimes(s)[i].start;
    if (start == null || next.startSec <= start) continue;
    const n = Math.max(1, Math.min(MAX_BARS, Math.round(((next.startSec - start) * s.bpm) / 60 / bpb)));
    if (n === sec.bars) continue;
    const cutFrom = sec.fromBeat + n * bpb;
    if (n < sec.bars && (s.events || []).some((e) => e.at >= cutFrom - EPS && e.at < sec.toBeat - EPS)) continue;
    s = resizeSection(s, id, n);
  }
  return s;
}

/** Akkord „jetzt“ tippen (Assistent): Videozeit t → Schlag im Leadsheet
 *  (Startzeit und Tempo nötig — ohne Tempo wäre es zu ungenau), auf die
 *  nächste Zelle gerundet, dort setzen.
 *  ANNAHME: auf ganze Schläge gerundet; feiner im Raster nachschieben.
 *  → { song, at } oder null (Stelle nicht im Leadsheet) */
export function tapChordAt(song, t, chord) {
  if (!song.bpm) return null;
  const pos = playPos(song, t);
  if (!pos || pos.beat == null) return null;
  const sec = sectionList(song).find((x) => x.id === pos.id);
  const at = Math.min(Math.round(pos.beat), sec.toBeat - 1);
  return { song: setChordAt(song, at, chord), at };
}
