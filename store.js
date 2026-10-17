/* store.js — Zustand der App im Speicher, gespiegelt in IndexedDB (db.js).
   Beim Start einmal loadAll(), danach schreibt jede Änderung sofort durch. */

import { DB, migrate } from './db.js';
import { localIso } from './dates.js';
import { newCard } from './leitner.js';
import { newLoop } from './tempo.js';
import { newPhrase } from './phrases.js';

export const S = {
  // mic: null = noch nicht gefragt, sonst true/false; essentia: Erkenner
  // essentia.js statt des eigenen (hear.js)
  settings: { id: 'settings', plan: '', onboarded: false, click: true, melody: true, melodyLow: false, mic: null, essentia: false },
  progress: {
    id: 'progress',
    levels: { blitz: 1, wege: 1, groove: 1 },
    lastPlayed: {},           // { blitz: 'YYYY-MM-DD', … }
    lastExercise: null,       // zuletzt geübte Übung (für „Noch 1 Minute“)
    asked: {},                // { blitz: 'YYYY-MM-DD' } Stufenfrage mit „Später“ beantwortet
  },
  cards: new Map(),           // 'card:Am:root' → Karte
  loops: {},                  // 'am-f' → Loop-Zustand (gespeichert als 'loop:am-f')
  phrases: {},                // 'z1' → Phrasen-Zustand für „Geführt“ ('phrase:z1')
  groove: { id: 'groove', bpm: null },
  days: {},                   // 'YYYY-MM-DD' → { seconds, exercises }
};

/** Heute als lokales Datum. Nur hier wird die Uhr gelesen. */
export const today = () => localIso(new Date());

export async function loadAll() {
  await migrate();
  const all = await DB.getAll();
  for (const r of all) {
    const id = String(r.id);
    if (id === 'settings') Object.assign(S.settings, r);
    else if (id === 'progress') {
      Object.assign(S.progress, r);
      S.progress.levels = { blitz: 1, wege: 1, groove: 1, ...r.levels };
      S.progress.lastPlayed = { ...r.lastPlayed };
      S.progress.asked = { ...r.asked };
    } else if (id.startsWith('card:')) S.cards.set(id, r);
    else if (id.startsWith('loop:')) S.loops[id.slice(5)] = { ...r, id: id.slice(5) };
    else if (id.startsWith('phrase:')) S.phrases[id.slice(7)] = { ...r, id: id.slice(7) };
    else if (id === 'groove') Object.assign(S.groove, r);
    else if (id.startsWith('day:')) S.days[id.slice(4)] = r;
  }
}

export const saveSettings = () => DB.put({ ...S.settings });
export const saveProgress = () => DB.put(JSON.parse(JSON.stringify(S.progress)));
export const saveGroove = () => DB.put({ ...S.groove });

export function getCard(id) {
  return S.cards.get(id) || newCard(id, today());
}
export async function putCards(cards) {
  for (const c of cards) S.cards.set(c.id, c);
  await DB.putMany(cards.map((c) => ({ ...c })));
}

export function getLoop(id) {
  return S.loops[id] || newLoop(id);
}
export async function putLoop(loop) {
  S.loops[loop.id] = loop;
  await DB.put({ ...loop, id: `loop:${loop.id}` });
}

export function getPhrase(id) {
  return S.phrases[id] || newPhrase(id);
}
export async function putPhrase(p) {
  S.phrases[p.id] = p;
  await DB.put({ ...p, id: `phrase:${p.id}` });
}

/** Geübte Sekunden zum heutigen Tag addieren. */
export async function addDaySeconds(seconds, exercise) {
  if (!(seconds > 0)) return;
  const d = today();
  const rec = S.days[d] || { id: `day:${d}`, seconds: 0, exercises: [] };
  rec.seconds = Math.round((rec.seconds + seconds) * 10) / 10;
  if (exercise && !rec.exercises.includes(exercise)) rec.exercises.push(exercise);
  S.days[d] = rec;
  await DB.put({ ...rec, exercises: [...rec.exercises] });
}

/** Übung als geübt vermerken. */
export async function markPlayed(exercise) {
  S.progress.lastPlayed[exercise] = today();
  if (exercise !== 'playalong') S.progress.lastExercise = exercise;
  await saveProgress();
}

/** Stufe erhöhen. */
export async function levelUp(exercise, max) {
  S.progress.levels[exercise] = Math.min(max, (S.progress.levels[exercise] || 1) + 1);
  delete S.progress.asked[exercise];
  await saveProgress();
}

/** Stufenfrage mit „Später“ beantwortet: heute nicht noch einmal fragen. */
export async function askedLater(exercise) {
  S.progress.asked[exercise] = today();
  await saveProgress();
}
export const mayAsk = (exercise) => S.progress.asked[exercise] !== today();
