/* log.js — Fehlerprotokoll in localStorage (der einzige erlaubte Gebrauch).
   Höchstens 50 Einträge; jeder Zugriff darf scheitern (privates Fenster). */

const KEY = 'pianino-log';
const MAX = 50;

export function logError(where, err) {
  const entry = { at: new Date().toISOString(), where, msg: String(err?.message || err) };
  try { console.warn(`[pianino] ${where}:`, err); } catch { /* egal */ }
  try {
    const list = JSON.parse(localStorage.getItem(KEY) || '[]');
    list.push(entry);
    localStorage.setItem(KEY, JSON.stringify(list.slice(-MAX)));
  } catch { /* Speicher gesperrt — still weiter */ }
}

export function readLog() {
  try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; }
}
