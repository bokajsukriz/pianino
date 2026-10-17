/* dates.js — REIN: Kalenderrechnung auf 'YYYY-MM-DD' (UTC, ohne Uhrzeit).
   Das heutige Datum kommt immer als Parameter herein. */

const MS_DAY = 86400000;

function parse(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

function format(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}

/** iso + n Tage. */
export function addDays(iso, n) {
  return format(parse(iso) + n * MS_DAY);
}

/** Ganze Tage von a nach b (b − a). */
export function daysBetween(a, b) {
  return Math.round((parse(b) - parse(a)) / MS_DAY);
}

/** Wochentag mit Montag = 0 … Sonntag = 6. */
export function weekdayMon0(iso) {
  return (new Date(parse(iso)).getUTCDay() + 6) % 7;
}

/** Die sieben Tage der Woche (Montag zuerst), in der `iso` liegt. */
export function weekOf(iso) {
  const monday = addDays(iso, -weekdayMon0(iso));
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

/** Lokales Datum eines Date-Objekts als 'YYYY-MM-DD' (nur außerhalb der
 *  reinen Module aufrufen, mit new Date()). */
export function localIso(date) {
  const p = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
}
