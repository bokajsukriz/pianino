/* migrations.js — REIN: Umstellungen gespeicherter Daten (db.js wendet sie an).
   MIGRATIONS[n](records) → { put: [Datensätze], del: [ids] }, um von Stand
   n−1 auf n zu kommen. Jede Umstellung ist idempotent: ein zweiter Lauf auf
   ihrem eigenen Ergebnis ändert nichts. Unbekannte Felder bleiben erhalten. */

import { SONG as OLD_SONG, songForm } from './song-perfect-ruin.js';
import { chordById } from './chords.js';
import { normalizeSong } from './songdata.js';
import { marksToSections } from './leadsheet.js';

/** Der Song „Perfect Ruin“ aus der alten Datei: Titel, Tonart, Takt und
 *  Akkorde — keine Griffe (die alten :song-Lagen stimmten nicht mit dem
 *  Unterricht), keine Ereignisse und Abschnitte (die Taktfolge „ein Akkord
 *  pro Takt“ war falsch). */
export function perfectRuinSeed() {
  const chords = [];
  for (const id of songForm(OLD_SONG)) {
    const sym = chordById(id).symbol;
    if (!chords.includes(sym)) chords.push(sym);
  }
  return normalizeSong({
    schema: 1,
    id: OLD_SONG.id,
    title: OLD_SONG.title,
    artist: OLD_SONG.artist,
    key: OLD_SONG.key,
    beatsPerBar: OLD_SONG.beatsPerBar,
    bpm: null,
    verified: false,
    chords,
    voicings: {},
    sources: [],
    sections: [],
    events: [],
    notes: 'Akkorde aus Tabs; Wechsel noch nicht transkribiert.',
  });
}

export const MIGRATIONS = Object.freeze({
  /** 2: Songs als Daten. Perfect Ruin anlegen (falls nicht da), als aktuellen
   *  Song setzen, alte Phrasen (phrase:<id> ohne Song) nach archiv:phrase:<id>
   *  verschieben. Karten (card:*) und Loops (loop:*) bleiben. */
  2(records) {
    const put = [], del = [];
    const byId = new Map(records.map((r) => [String(r.id), r]));
    const seed = perfectRuinSeed();
    if (!byId.has(`song:${seed.id}`)) put.push({ id: `song:${seed.id}`, song: seed });
    const settings = byId.get('settings');
    if (!settings?.currentSong) put.push({ ...(settings || {}), id: 'settings', currentSong: seed.id });
    for (const r of records) {
      const id = String(r.id);
      if (!id.startsWith('phrase:') || id.slice(7).includes(':')) continue;
      if (!byId.has(`archiv:${id}`)) put.push({ ...r, id: `archiv:${id}` });
      del.push(id);
    }
    return { put, del };
  },
  /** 3: Liedseite als Leadsheet. Die Abschnitts-Marken (song.marks, Sekunden)
   *  werden Abschnitte mit Startzeit (song.sections, je 8 Takte); Songs, die
   *  schon Abschnitte haben, bleiben, wie sie sind. */
  3(records) {
    const put = [];
    for (const r of records) {
      if (!String(r.id).startsWith('song:') || !r.song?.marks?.length || r.song.sections?.length) continue;
      put.push({ ...r, song: marksToSections(r.song) });
    }
    return { put, del: [] };
  },
});

/** Umstellungen von Stand `from` bis `to` auf einer Liste von Datensätzen
 *  ausführen (für Tests und db.js). → { records, steps: [{ v, put, del }] } */
export function runMigrations(records, from, to) {
  let cur = records.map((r) => ({ ...r }));
  const steps = [];
  for (let v = from + 1; v <= to; v++) {
    const fn = MIGRATIONS[v];
    if (!fn) continue;
    const { put = [], del = [] } = fn(cur) || {};
    const map = new Map(cur.map((r) => [String(r.id), r]));
    for (const id of del) map.delete(id);
    for (const r of put) map.set(String(r.id), r);
    cur = [...map.values()];
    steps.push({ v, put, del });
  }
  return { records: cur, steps };
}
