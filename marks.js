/* marks.js — REIN: Abschnitte der Liedseite als Marken in Sekunden im Video.
   Kein DOM, keine Zeit, kein Zufall.

   Eine Marke: { id, name, sec } — „ab hier beginnt <name>“. Ein Abschnitt
   reicht bis zur nächsten Marke bzw. bis zum Ende des Videos. Gespeichert
   im Song als song.marks (sortiert nach sec). */

const EPS = 1e-6;

/** Sortierte Kopie. */
export const sortMarks = (marks) => [...(marks || [])].sort((a, b) => a.sec - b.sec);

/** Marke hinzufügen; liegt schon eine näher als 0,3 s, wird sie ersetzt. */
export function addMark(marks, sec, name) {
  const list = sortMarks(marks).filter((m) => Math.abs(m.sec - sec) >= 0.3);
  const taken = new Set(list.map((m) => m.id));
  let n = 1;
  while (taken.has(`m${n}`)) n++;
  return sortMarks([...list, { id: `m${n}`, name, sec: Math.max(0, Math.round(sec * 100) / 100) }]);
}

export const removeMark = (marks, id) => sortMarks(marks).filter((m) => m.id !== id);
export const renameMark = (marks, id, name) => sortMarks(marks).map((m) => (m.id === id ? { ...m, name } : m));
export const moveMark = (marks, id, sec) => sortMarks(marks.map((m) => (m.id === id ? { ...m, sec: Math.max(0, Math.round(sec * 100) / 100) } : m)));

/** Abschnitt einer Marke: { start, end } (end = nächste Marke bzw. Ende). */
export function markRange(marks, id, duration) {
  const list = sortMarks(marks);
  const i = list.findIndex((m) => m.id === id);
  if (i < 0) return null;
  const end = list[i + 1]?.sec ?? (duration > 0 ? duration : Infinity);
  return { start: list[i].sec, end };
}

/** Marke, in deren Abschnitt `sec` liegt, oder null (vor der ersten). */
export function markAt(marks, sec) {
  let cur = null;
  for (const m of sortMarks(marks)) if (m.sec <= sec + EPS) cur = m;
  return cur;
}

/** Nächster Name mit Nummer: „Strophe“ → „Strophe 2“, wenn „Strophe 1“ da ist. */
export function nextMarkName(marks, base) {
  const re = new RegExp(`^${base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:\\s+(\\d+))?$`);
  const nums = (marks || []).map((m) => re.exec(m.name)).filter(Boolean).map((x) => Number(x[1] || 1));
  return `${base} ${nums.length ? Math.max(...nums) + 1 : 1}`;
}

/** Sekunden als „1:05“ bzw. „1:05,3“ (tenths). */
export function fmtClock(sec, { tenths = false } = {}) {
  const s = Math.max(0, sec || 0);
  const m = Math.floor(s / 60);
  const r = s - m * 60;
  const whole = Math.floor(r);
  const base = `${m}:${String(whole).padStart(2, '0')}`;
  return tenths ? `${base},${Math.floor((r - whole) * 10)}` : base;
}
