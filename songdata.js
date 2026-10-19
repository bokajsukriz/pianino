/* songdata.js — REIN: Song-JSON prüfen, normalisieren, exportieren und
   bearbeiten. Kein DOM, keine Zeit, kein Zufall. Schema: docs/song-schema.md.

   Ein Song ist Nutzerdaten. Unbekannte Felder bleiben erhalten (spätere
   Schemaversionen), auch beatTimes (für schwankende Zeitleisten vorgesehen,
   in Version 1 nicht ausgewertet). Liedtext (lyrics) kommt nur vom Nutzer
   und bleibt auf dem Gerät; beim Export ist „ohne Text“ voreingestellt. */

import { upgradeVoicing, validateVoicing } from './voicing.js';

export const SCHEMA = 1;
export const GRIDS = Object.freeze([0.5, 0.25]);
const EPS = 1e-9;
const ID_RE = /^[a-z0-9-]+$/;
const YT_ID_RE = /^[A-Za-z0-9_-]{11}$/;

const isObj = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
const isNum = (x) => typeof x === 'number' && Number.isFinite(x);
const onGrid = (x, g) => Math.abs(x / g - Math.round(x / g)) < 1e-6;
const clone = (x) => JSON.parse(JSON.stringify(x));
const fmt = (x) => String(x).replace('.', ',');

/** Raster des Songs: 0,5 (Achtel) oder 0,25 (Sechzehntel, im Editor umgeschaltet). */
export const gridOf = (song) => (GRIDS.includes(song?.grid) ? song.grid : 0.5);

/** Normalisieren: Standardwerte, Griffe ins neue Format, gleiche
 *  Nachbar-Ereignisse zusammengefasst, Abschnitte nach Takt sortiert und mit
 *  id. Unbekannte Felder bleiben. Gibt eine Kopie zurück. */
export function normalizeSong(json) {
  const s = clone(json);
  s.schema ??= SCHEMA;
  if (typeof s.title === 'string') s.title = s.title.trim();
  s.artist ??= '';
  s.key ??= '';
  s.bpm ??= null;
  s.verified = s.verified === true;
  s.chords = Array.isArray(s.chords) ? s.chords.map((c) => String(c).trim()) : [];
  s.sources = Array.isArray(s.sources) ? s.sources : [];
  for (const src of s.sources) if (isObj(src) && src.type === 'youtube') src.offsetSec ??= null;
  s.sections = Array.isArray(s.sections) ? s.sections.map((x) => ({ ...x })) : [];
  s.sections.sort((a, b) => a.bar - b.bar);
  const used = new Set(s.sections.map((x) => x.id).filter(Boolean));
  let n = 1;
  for (const sec of s.sections) {
    if (!sec.id) { while (used.has(`s${n}`)) n++; sec.id = `s${n}`; used.add(sec.id); }
  }
  const ev = Array.isArray(s.events) ? s.events : [];
  s.events = [];
  for (const e of ev) {
    const prev = s.events[s.events.length - 1];
    const same = prev && prev.chord === e.chord;
    if (same && e.again !== true) continue;
    const { again, ...rest } = e;
    // again: derselbe Akkord wird hier neu angeschlagen; nur sinnvoll, wenn der Vorgänger gleich ist.
    s.events.push(same ? { ...rest, again: true } : rest);
  }
  if (isObj(s.voicings)) {
    for (const k of Object.keys(s.voicings)) s.voicings[k] = upgradeVoicing(s.voicings[k]);
  } else s.voicings = {};
  if (s.lyrics !== undefined && !Array.isArray(s.lyrics)) delete s.lyrics;
  s.notes ??= '';
  return s;
}

/** Prüfen. → { ok, song (normalisiert, nur bei ok), errors: [deutsch] } */
export function validateSong(json) {
  const errors = [];
  const err = (m) => errors.push(m);
  if (!isObj(json)) return { ok: false, song: null, errors: ['Kein Song-Objekt (erwartet: { … }).'] };
  const j = json;

  if (j.schema === undefined) err('Pflichtfeld „schema“ fehlt.');
  else if (j.schema !== SCHEMA) err(isNum(j.schema) && j.schema > SCHEMA
    ? `Schema ${j.schema} ist neuer als diese App (kennt ${SCHEMA}).` : `„schema“ muss ${SCHEMA} sein.`);
  if (j.id === undefined) err('Pflichtfeld „id“ fehlt.');
  else if (typeof j.id !== 'string' || !ID_RE.test(j.id)) err('„id“ nur aus Kleinbuchstaben, Ziffern und „-“.');
  if (j.title === undefined) err('Pflichtfeld „title“ fehlt.');
  else if (typeof j.title !== 'string' || !j.title.trim()) err('„title“ darf nicht leer sein.');
  if (j.beatsPerBar === undefined) err('Pflichtfeld „beatsPerBar“ fehlt.');
  else if (!Number.isInteger(j.beatsPerBar) || j.beatsPerBar < 1 || j.beatsPerBar > 12) err('„beatsPerBar“: ganze Zahl von 1 bis 12.');
  if (j.bpm !== undefined && j.bpm !== null && (!isNum(j.bpm) || j.bpm < 30 || j.bpm > 220)) err('„bpm“: 30 bis 220 oder null.');
  if (j.grid !== undefined && !GRIDS.includes(j.grid)) err('„grid“: 0.5 oder 0.25.');
  if (j.verified !== undefined && typeof j.verified !== 'boolean') err('„verified“: true oder false.');

  let chords = [];
  if (j.chords === undefined) err('Pflichtfeld „chords“ fehlt.');
  else if (!Array.isArray(j.chords)) err('„chords“ muss eine Liste sein (darf leer sein).');
  else {
    chords = j.chords.map((c) => (typeof c === 'string' ? c.trim() : c));
    if (!chords.every((c) => typeof c === 'string' && c)) err('„chords“: Akkordsymbole als Text.');
    const dup = chords.filter((c, i) => chords.indexOf(c) !== i);
    if (dup.length) err(`„chords“: doppelt: ${[...new Set(dup)].join(', ')}.`);
  }

  if (j.sources !== undefined) {
    if (!Array.isArray(j.sources)) err('„sources“ muss eine Liste sein.');
    else j.sources.forEach((s, i) => {
      if (!isObj(s) || typeof s.type !== 'string') { err(`Quelle ${i + 1}: „type“ fehlt.`); return; }
      if (s.type !== 'youtube') return; // andere Arten bleiben erhalten, ungeprüft
      if (typeof s.videoId !== 'string' || !YT_ID_RE.test(s.videoId)) err(`Quelle ${i + 1}: „videoId“ ist keine YouTube-ID (11 Zeichen).`);
      if (s.offsetSec !== undefined && s.offsetSec !== null && (!isNum(s.offsetSec) || s.offsetSec < 0)) err(`Quelle ${i + 1}: „offsetSec“ ≥ 0 oder null.`);
      if (s.durationSec !== undefined && s.durationSec !== null && (!isNum(s.durationSec) || s.durationSec < 0)) err(`Quelle ${i + 1}: „durationSec“ ≥ 0.`);
    });
  }

  if (j.sections === undefined) err('Pflichtfeld „sections“ fehlt (darf leer sein: []).');
  else if (!Array.isArray(j.sections)) err('„sections“ muss eine Liste sein.');
  else {
    const ok = [];
    j.sections.forEach((s, i) => {
      const label = `Abschnitt ${i + 1}${isObj(s) && s.name ? ` („${s.name}“)` : ''}`;
      if (!isObj(s)) { err(`${label}: kein Objekt.`); return; }
      if (typeof s.name !== 'string' || !s.name.trim()) err(`${label}: „name“ fehlt.`);
      if (s.id !== undefined && typeof s.id !== 'string') err(`${label}: „id“ als Text.`);
      if (!Number.isInteger(s.bar) || s.bar < 1) err(`${label}: „bar“ ab 1 (Takte sind 1-basiert).`);
      else if (!Number.isInteger(s.bars) || s.bars < 1) err(`${label}: „bars“ mindestens 1.`);
      else ok.push({ ...s, label });
    });
    ok.sort((a, b) => a.bar - b.bar);
    for (let i = 1; i < ok.length; i++) {
      if (ok[i].bar < ok[i - 1].bar + ok[i - 1].bars) err(`${ok[i].label} überlappt mit ${ok[i - 1].label}.`);
    }
    const ids = j.sections.map((s) => s?.id).filter(Boolean);
    if (new Set(ids).size !== ids.length) err('Abschnitte: eine „id“ doppelt.');
  }

  const grid = GRIDS.includes(j.grid) ? j.grid : 0.5;
  if (j.events === undefined) err('Pflichtfeld „events“ fehlt (darf leer sein: []).');
  else if (!Array.isArray(j.events)) err('„events“ muss eine Liste sein.');
  else {
    let prev = -Infinity;
    j.events.forEach((e, i) => {
      const label = `Ereignis ${i + 1}`;
      if (!isObj(e) || !isNum(e.at)) { err(`${label}: „at“ fehlt.`); return; }
      if (e.at < 0) err(`${label}: „at“ ist negativ.`);
      else if (!onGrid(e.at, grid)) err(`${label}: „at“ ${fmt(e.at)} liegt nicht auf dem Raster (${grid === 0.5 ? 'halbe' : 'Viertel-'}Schläge).`);
      if (e.at === prev) err(`${label}: Schlag ${fmt(e.at)} doppelt.`);
      else if (e.at < prev) err(`${label}: nicht aufsteigend sortiert (${fmt(e.at)} nach ${fmt(prev)}).`);
      prev = Math.max(prev, e.at);
      if (typeof e.chord !== 'string') err(`${label}: „chord“ fehlt.`);
      else if (chords.length && !chords.includes(e.chord.trim())) err(`${label}: Akkord „${e.chord}“ steht nicht in „chords“.`);
    });
  }

  if (j.voicings !== undefined) {
    if (!isObj(j.voicings)) err('„voicings“ muss ein Objekt sein.');
    else for (const [sym, v] of Object.entries(j.voicings)) {
      if (chords.length && !chords.includes(sym)) err(`Griff „${sym}“: Akkord steht nicht in „chords“.`);
      const r = validateVoicing(upgradeVoicing(v));
      for (const m of r.errors) err(`Griff „${sym}“: ${m}`);
    }
  }

  if (j.lyrics !== undefined) {
    if (!Array.isArray(j.lyrics)) err('„lyrics“ muss eine Liste sein.');
    else {
      let prev = -Infinity;
      j.lyrics.forEach((l, i) => {
        if (!isObj(l) || typeof l.line !== 'string') { err(`Textzeile ${i + 1}: „line“ fehlt.`); return; }
        if (l.at === null || l.at === undefined) return; // noch nicht getippt
        if (!isNum(l.at) || l.at < 0) err(`Textzeile ${i + 1}: „at“ ≥ 0.`);
        else if (l.at < prev) err(`Textzeile ${i + 1}: nicht aufsteigend sortiert.`);
        else prev = l.at;
      });
    }
  }
  if (j.notes !== undefined && typeof j.notes !== 'string') err('„notes“ als Text.');

  return errors.length ? { ok: false, song: null, errors } : { ok: true, song: normalizeSong(j), errors };
}

/** Text (Datei oder eingefügt) lesen und prüfen. → wie validateSong */
export function parseSongText(text) {
  let json;
  try { json = JSON.parse(String(text ?? '').replace(/^﻿/, '')); } catch (e) {
    return { ok: false, song: null, errors: [`Kein gültiges JSON: ${String(e?.message || e)}`] };
  }
  return validateSong(json);
}

/** Song als JSON-Text. Ohne Text ist voreingestellt (lyrics fallen weg). */
export function exportSong(song, { lyrics = false } = {}) {
  const s = clone(song);
  // Text und Tabs stammen vom Nutzer und bleiben ohne ausdrücklichen Wunsch auf dem Gerät.
  if (!lyrics) { delete s.lyrics; delete s.tabText; }
  return `${JSON.stringify(s, null, 2)}\n`;
}

/** Neuer, leerer Song (Liedseite). id frei aus dem Titel. */
export function newSong(title, takenIds = []) {
  let id = idFromTitle(title);
  if (takenIds.includes(id)) id = copyId(id, takenIds);
  return normalizeSong({ schema: SCHEMA, id, title: String(title).trim(), beatsPerBar: 4, chords: [], sections: [], events: [], marks: [] });
}

/** Kurze Vorschau für den Import. */
export function songSummary(song) {
  return { title: song.title, artist: song.artist || '', chords: [...song.chords], events: song.events.length, sections: song.sections.length };
}

/** Freie id für eine Kopie: perfect-ruin → perfect-ruin-2, -3, … */
export function copyId(id, taken) {
  const base = id.replace(/-\d+$/, '');
  for (let n = 2; ; n++) if (!taken.includes(`${base}-${n}`)) return `${base}-${n}`;
}

/** id aus einem Titel: „Perfect Ruin“ → „perfect-ruin“. */
export function idFromTitle(title) {
  const id = String(title || '').toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return id || 'song';
}

/* ---------- Bearbeiten (Editor, Griff-Editor) ---------------------------
   Alle Funktionen geben einen neuen Song zurück; der alte bleibt. */

/** Beim Bearbeiten entstandene gleiche Nachbarn (z. B. Am gesetzt, im
 *  nächsten Takt steht schon Am; oder der Akkord dazwischen entfällt) bleiben
 *  als Neuanschlag (`again`) erhalten, statt von der Normalisierung
 *  verschluckt zu werden. Nur für Änderungen von Hand: Beim Import fasst
 *  normalizeSong gleiche Nachbarn weiter zusammen. */
export function keepRepeats(events) {
  return events.map((e, i, all) => (i && all[i - 1].chord === e.chord && e.again !== true ? { ...e, again: true } : e));
}

/** Ereignis setzen: liegt bei `at` schon eines, wird es ersetzt. Danach
 *  sortiert und gleiche Nachbarn zusammengefasst — außer mit again: true
 *  (Neuanschlag desselben Akkords). */
export function setEvent(song, at, chord, again = false) {
  const events = song.events.filter((e) => Math.abs(e.at - at) > EPS);
  events.push(again ? { at, chord, again: true } : { at, chord });
  events.sort((a, b) => a.at - b.at);
  // Ein schon vorhandener gleicher Akkord direkt danach geht nicht verloren.
  const i = events.findIndex((e) => Math.abs(e.at - at) < EPS);
  const next = events[i + 1];
  if (next && next.chord === chord && next.again !== true) events[i + 1] = { ...next, again: true };
  return normalizeSong({ ...song, events });
}

/** Ereignis bei `at` entfernen. */
export function removeEvent(song, at) {
  return normalizeSong({ ...song, events: keepRepeats(song.events.filter((e) => Math.abs(e.at - at) > EPS)) });
}

/** Ereignis bei `at` um `by` Schläge verschieben (nicht über Nachbarn oder
 *  unter 0). → { song, at } (neue Lage; bei Blockade die alte) */
export function moveEvent(song, at, by) {
  const i = song.events.findIndex((e) => Math.abs(e.at - at) < EPS);
  if (i < 0) return { song, at };
  const to = Math.round((at + by) * 1e6) / 1e6;
  const prev = song.events[i - 1], next = song.events[i + 1];
  if (to < 0 || (prev && to <= prev.at + EPS) || (next && to >= next.at - EPS)) return { song, at };
  const events = song.events.map((e, k) => (k === i ? { ...e, at: to } : e));
  return { song: normalizeSong({ ...song, events: keepRepeats(events) }), at: to };
}

/** Akkord an `at` ändern. */
export function changeEvent(song, at, chord) {
  return normalizeSong({ ...song, events: keepRepeats(song.events.map((e) => (Math.abs(e.at - at) < EPS ? { ...e, chord } : e))) });
}

/** Akkord ans Ende von chords anhängen (wenn neu). */
export function addChord(song, symbol) {
  if (song.chords.includes(symbol)) return song;
  return { ...song, chords: [...song.chords, symbol] };
}

/** Akkord umbenennen: chords, Griff und Ereignisse ziehen mit. Gibt es den
 *  neuen Namen schon, bleibt alles, wie es ist (→ null). */
export function renameChord(song, from, to) {
  if (from === to) return song;
  if (song.chords.includes(to)) return null;
  const voicings = {};
  for (const [k, v] of Object.entries(song.voicings || {})) voicings[k === from ? to : k] = v;
  return normalizeSong({
    ...song,
    chords: song.chords.map((c) => (c === from ? to : c)),
    voicings,
    events: song.events.map((e) => (e.chord === from ? { ...e, chord: to } : e)),
  });
}

/** Akkord löschen — nicht, solange Ereignisse ihn verwenden (→ null). */
export function deleteChord(song, symbol) {
  if (song.events.some((e) => e.chord === symbol) || song.chords.length <= 1) return null;
  const voicings = { ...(song.voicings || {}) };
  delete voicings[symbol];
  return { ...song, chords: song.chords.filter((c) => c !== symbol), voicings };
}

/** Griff setzen (null = zurück zur Standardlage). */
export function setVoicing(song, symbol, v) {
  const voicings = { ...(song.voicings || {}) };
  if (v) {
    const { std, ...rest } = v;
    void std;
    voicings[symbol] = rest;
  } else delete voicings[symbol];
  return { ...song, voicings };
}

/** Abschnitt beginnt ab Takt `bar` (ersetzt einen dort beginnenden). Die
 *  Längen ergeben sich: jeder Abschnitt reicht bis zum nächsten, der letzte
 *  bis `endBar` (einschließlich). */
export function setSectionStart(song, bar, name, endBar) {
  const others = song.sections.filter((s) => s.bar !== bar);
  const existing = song.sections.find((s) => s.bar === bar);
  const taken = new Set(others.map((s) => s.id));
  let id = existing?.id;
  for (let n = 1; !id; n++) if (!taken.has(`s${n}`)) id = `s${n}`;
  return relayoutSections({ ...song, sections: [...others, { ...(existing || {}), id, name, bar, bars: 1 }] }, endBar);
}

/** Abschnitt entfernen; der davor reicht dann weiter. */
export function removeSection(song, id, endBar) {
  return relayoutSections({ ...song, sections: song.sections.filter((s) => s.id !== id) }, endBar);
}

/** Längen neu: bis zum nächsten Abschnitt, der letzte bis endBar. */
export function relayoutSections(song, endBar) {
  const secs = [...song.sections].sort((a, b) => a.bar - b.bar).map((s) => ({ ...s }));
  secs.forEach((s, i) => {
    const next = secs[i + 1];
    s.bars = Math.max(1, next ? next.bar - s.bar : (endBar ?? s.bar + s.bars - 1) - s.bar + 1);
  });
  return { ...song, sections: secs };
}

/** Nächster Name mit Nummer: „Strophe“ → „Strophe 2“, wenn „Strophe 1“ schon da ist. */
export function nextSectionName(song, base) {
  const nums = song.sections.map((s) => new RegExp(`^${base}(?:\\s+(\\d+))?$`).exec(s.name)).filter(Boolean)
    .map((m) => Number(m[1] || 1));
  return `${base} ${nums.length ? Math.max(...nums) + 1 : 1}`;
}

/** YouTube-Quelle setzen bzw. ändern (felder werden übernommen). */
export function setYoutube(song, fields) {
  const sources = [...(song.sources || [])];
  const i = sources.findIndex((s) => s?.type === 'youtube');
  const cur = i >= 0 ? sources[i] : { type: 'youtube', videoId: '', kind: 'official', durationSec: 0, offsetSec: null };
  const next = { ...cur, ...fields };
  if (i >= 0) sources[i] = next; else sources.unshift(next);
  return { ...song, sources };
}

/** Titel und Interpret aus den Angaben eines YouTube-Videos (Titel, Kanal).
 *  ANNAHME: „Interpret - Titel“ im Videotitel ist die übliche Form; Zusätze
 *  wie „(Official Video)“, „[Lyrics]“, „(Audio)“ sind keine Titelteile.
 *  Sonst gilt der Kanalname (ohne „- Topic“ und „VEVO“) als Interpret.
 *  Nur ein Vorschlag, im Menü „Mehr“ änderbar.
 *  → { title, artist } (artist darf leer sein) */
export function songFromVideo(videoTitle, channel = '') {
  const noise = /\s*[([{][^)\]}]*(official|video|audio|lyric|visuali[sz]er|hd|4k|remaster|live|clip|musikvideo)[^)\]}]*[)\]}]\s*/gi;
  const clean = (x) => String(x || '').replace(noise, ' ').replace(/\s{2,}/g, ' ').trim();
  const chan = String(channel || '').replace(/\s*-\s*Topic$/i, '').replace(/\s*VEVO$/i, '').trim();
  const t = clean(videoTitle);
  const parts = t.split(/\s+[-–—]\s+/);
  if (parts.length >= 2 && parts[0] && parts[1]) return { title: parts.slice(1).join(' - ').trim(), artist: parts[0].trim() };
  return { title: t || String(videoTitle || '').trim(), artist: chan };
}
