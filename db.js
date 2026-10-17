/* db.js — IndexedDB: eine DB `pianino`, ein Store `meta`, Datensätze mit
   Schlüssel `id`. Vereinfacht nach dem Muster DB.metaGet/metaPut der Choirapp.

   Datensätze:
     settings          { plan, onboarded, click, melody, melodyLow, mic, essentia }
     progress          { levels: { blitz, wege, groove }, lastPlayed: {…},
                         lastExercise, asked: { blitz, wege, groove } }
     card:<Akkord-id>  Leitner-Karte (leitner.js)
     loop:<Loop-id>    Kurze-Wege-Loop (tempo.js)
     phrase:<id>       Phrase für „Geführt“ (phrases.js)
     groove            { bpm }
     day:<YYYY-MM-DD>  { seconds, exercises: [] }
     dataVersion       { v } — Stand der gespeicherten Daten

   Ändert sich die Bedeutung gespeicherter Felder: DATA_VERSION erhöhen und
   unter MIGRATIONS[neue Version] eine idempotente Umstellung eintragen
   (unbekannte Felder erhalten). */

import { logError } from './log.js';

const DB_NAME = 'pianino';
const DB_VERSION = 1; // Schema der IndexedDB (Stores), nicht der Daten
export const DATA_VERSION = 1;

/** MIGRATIONS[n](records) → geänderte Datensätze, um von n−1 auf n zu kommen. */
const MIGRATIONS = {};

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
  async putMany(records) {
    if (!records.length) return;
    try {
      const db = await open();
      await new Promise((resolve, reject) => {
        const tx = db.transaction('meta', 'readwrite');
        const s = tx.objectStore('meta');
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
  let v = meta?.v ?? 0;
  if (v === 0) {
    // Frische Installation oder Stand vor der Versionsnummer: nichts umzustellen.
    v = DATA_VERSION;
  }
  while (v < DATA_VERSION) {
    v++;
    const fn = MIGRATIONS[v];
    if (fn) await DB.putMany(fn(await DB.getAll()) || []);
  }
  if (meta?.v !== v) await DB.put({ id: 'dataVersion', v });
}
