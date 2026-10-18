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

/* ---------- Gespeicherte Loops ------------------------------------------
   Ein Loop: { id, name, start, end, pre } — Sekunden im Video; pre: Vorlauf
   in Sekunden (so viel früher einsteigen, damit man hineinkommt). Gespeichert
   im Song als song.loops (nach start sortiert). */

const r2 = (x) => Math.round(x * 100) / 100;
export const sortLoops = (loops) => [...(loops || [])].sort((a, b) => a.start - b.start || a.end - b.end);

/** Loop hinzufügen (start < end, mindestens 0,5 s lang). → { loops, id } */
export function addLoop(loops, { name, start, end, pre = 0 }) {
  const taken = new Set((loops || []).map((l) => l.id));
  let n = 1;
  while (taken.has(`l${n}`)) n++;
  const s = Math.max(0, Math.min(start, end)), e = Math.max(start, end, s + 0.5);
  const id = `l${n}`;
  return { loops: sortLoops([...(loops || []), { id, name, start: r2(s), end: r2(e), pre }]), id };
}

/** Loop ändern; Start und Ende bleiben in der richtigen Reihenfolge. */
export function updateLoop(loops, id, patch) {
  return sortLoops((loops || []).map((l) => {
    if (l.id !== id) return l;
    const next = { ...l, ...patch };
    next.start = r2(Math.max(0, next.start));
    next.end = r2(next.end);
    if (next.end < next.start + 0.5) {
      if ('start' in patch && !('end' in patch)) next.start = r2(Math.max(0, next.end - 0.5));
      else next.end = r2(next.start + 0.5);
    }
    return next;
  }));
}

export const removeLoop = (loops, id) => sortLoops((loops || []).filter((l) => l.id !== id));
