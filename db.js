/* db.js — IndexedDB: eine DB `pianino`, ein Store `meta`, Datensätze mit
   Schlüssel `id`. Vereinfacht nach dem Muster DB.metaGet/metaPut der Choirapp.

   Datensätze:
     settings          { plan, onboarded, click, melody, melodyLow, mic, ear,
                         currentSong, leadMs, ytMic }
     progress          { levels: { blitz, wege, groove }, lastPlayed: {…},
                         lastExercise, asked: { blitz, wege, groove } }
     card:<Akkord-id>  Leitner-Karte (leitner.js)
     loop:<Loop-id>    Kurze-Wege-Loop (tempo.js)
     song:<id>         { id, song } — Song (songdata.js), inklusive Liedtext,
                       den der Nutzer selbst eingegeben hat
     phrase:<songId>:<phraseId>  Phrase für „Geführt“ (phrases.js)
     wann:<songId>:<phraseId>    Stufe für „Wann“ (tap.js)
     archiv:phrase:<id>          alte Phrasen vor Stand 2 (nicht mehr gelesen)
     groove            { bpm }
     day:<YYYY-MM-DD>  { seconds, exercises: [] }
     dataVersion       { v } — Stand der gespeicherten Daten

   Ändert sich die Bedeutung gespeicherter Felder: DATA_VERSION erhöhen und
   unter MIGRATIONS[neue Version] (migrations.js, rein) eine idempotente
   Umstellung eintragen (unbekannte Felder erhalten). */

import { logError } from './log.js';
import { MIGRATIONS } from './migrations.js';

const DB_NAME = 'pianino';
const DB_VERSION = 1; // Schema der IndexedDB (Stores), nicht der Daten
export const DATA_VERSION = 3;

let dbPromise = null;

function open() {
  if (dbPromise) return dbPromise;
  const p = new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) { reject(new Error('Kein IndexedDB')); return; }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'id' });
    };
    req.onsuccess = () => {
      const db = req.result;
      // Andere Verbindung will upgraden oder WebKit schließt von sich aus:
      // beim nächsten Zugriff neu öffnen.
      db.onversionchange = () => { db.close(); if (dbPromise === p) dbPromise = null; };
      db.onclose = () => { if (dbPromise === p) dbPromise = null; };
      resolve(db);
    };
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('IndexedDB blockiert'));
  });
  dbPromise = p;
  p.catch(() => { if (dbPromise === p) dbPromise = null; });
  return p;
}

const done = (req) => new Promise((resolve, reject) => {
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error);
});

async function store(mode) {
  const db = await open();
  return db.transaction('meta', mode).objectStore('meta');
}

export const DB = {
  async get(id) {
    try { return (await done((await store('readonly')).get(id))) ?? null; } catch (e) { logError('db:get', e); return null; }
  },
  /** Alle Datensätze, deren id mit `prefix` beginnt. */
  async getAll(prefix = '') {
    try {
      const all = await done((await store('readonly')).getAll());
      return prefix ? all.filter((r) => String(r.id).startsWith(prefix)) : all;
    } catch (e) { logError('db:getAll', e); return []; }
  },
  async put(record) {
    try { await done((await store('readwrite')).put(record)); } catch (e) { logError('db:put', e); }
    return record;
  },
  async del(id) {
    try { await done((await store('readwrite')).delete(id)); } catch (e) { logError('db:del', e); }
  },
  /** Schreiben und Löschen in einer Transaktion. */
  async putMany(records, dels = []) {
    if (!records.length && !dels.length) return;
    try {
      const db = await open();
      await new Promise((resolve, reject) => {
        const tx = db.transaction('meta', 'readwrite');
        const s = tx.objectStore('meta');
        for (const id of dels) s.delete(id);
        for (const r of records) s.put(r);
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      });
    } catch (e) { logError('db:putMany', e); }
  },
};

/** Beim Start: Daten auf DATA_VERSION bringen. */
export async function migrate() {
  const meta = await DB.get('dataVersion');
  // Frische Installation oder Stand vor der Versionsnummer: wie Stand 1
  // (Migration 2 legt dann auch den ersten Song an).
  let v = meta?.v ?? 1;
  while (v < DATA_VERSION) {
    v++;
    const fn = MIGRATIONS[v];
    if (fn) {
      const { put = [], del = [] } = fn(await DB.getAll()) || {};
      await DB.putMany(put, del);
    }
  }
  if (meta?.v !== v) await DB.put({ id: 'dataVersion', v });
}
