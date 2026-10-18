/* store.js — Zustand der App im Speicher, gespiegelt in IndexedDB (db.js).
   Beim Start einmal loadAll(), danach schreibt jede Änderung sofort durch. */

import { DB, migrate } from './db.js';
import { localIso } from './dates.js';
import { newCard } from './leitner.js';
import { newLoop } from './tempo.js';
import { newPhrase } from './phrases.js';
import { newWann } from './tap.js';

export const S = {
  // mic: null = noch nicht gefragt, sonst true/false; ear: wie gehört wird
  // ('eigen' | 'essentia' | 'beide', mic.js EARS); currentSong: id des
  // aktuellen Songs; leadMs: Anzeige-Vorlauf zum YouTube-Video (0–300 ms);
  // ytMic: Mikrofon während YouTube (standardmäßig aus)
  settings: {
    id: 'settings', plan: '', onboarded: false, click: true, melody: true, melodyLow: false, mic: null, ear: 'eigen',
    currentSong: null, leadMs: 80, ytMic: false,
  },
  progress: {
    id: 'progress',
    levels: { blitz: 1, wege: 1, groove: 1 },
    lastPlayed: {},           // { blitz: 'YYYY-MM-DD', … }
    lastExercise: null,       // zuletzt geübte Übung (für „Noch 1 Minute“)
    asked: {},                // { blitz: 'YYYY-MM-DD' } Stufenfrage mit „Später“ beantwortet
  },
  cards: new Map(),           // 'card:Am:root' → Karte
  loops: {},                  // 'am-f' → Loop-Zustand (gespeichert als 'loop:am-f')
  songs: new Map(),           // 'perfect-ruin' → Song (gespeichert als 'song:perfect-ruin')
  phrases: {},                // '<songId>:<phraseId>' → Phrasen-Zustand für „Geführt“ ('phrase:…')
  wann: {},                   // '<songId>:<phraseId>' → Stufe für „Wann“ ('wann:…')
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
    else if (id.startsWith('song:') && r.song) S.songs.set(r.song.id, r.song);
    else if (id.startsWith('phrase:')) S.phrases[id.slice(7)] = { ...r, id: id.slice(7) };
    else if (id.startsWith('wann:')) S.wann[id.slice(5)] = { ...r, id: id.slice(5) };
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

/* ---------- Songs ------------------------------------------------------ */

/** Der aktuelle Song (oder der erste, falls der gespeicherte fehlt). */
export function currentSong() {
  return S.songs.get(S.settings.currentSong) || S.songs.values().next().value || null;
}
export async function setCurrentSong(id) {
  S.settings.currentSong = id;
  await saveSettings();
}
export const songList = () => [...S.songs.values()].sort((a, b) => a.title.localeCompare(b.title, 'de'));

/** Song speichern (normalisiert, inklusive Text). */
export async function putSong(song) {
  S.songs.set(song.id, song);
  await DB.put({ id: `song:${song.id}`, song: JSON.parse(JSON.stringify(song)) });
}

/** Song löschen, mit seinem Fortschritt in „Geführt“ und „Wann“. */
export async function deleteSong(id) {
  S.songs.delete(id);
  const dels = [`song:${id}`, `pdf:${id}`];
  for (const k of Object.keys(S.phrases)) if (k.startsWith(`${id}:`)) { delete S.phrases[k]; dels.push(`phrase:${k}`); }
  for (const k of Object.keys(S.wann)) if (k.startsWith(`${id}:`)) { delete S.wann[k]; dels.push(`wann:${k}`); }
  await DB.putMany([], dels);
  if (S.settings.currentSong === id) await setCurrentSong(songList()[0]?.id ?? null);
}

/* ---------- PDF der Tabs (Liedseite) ------------------------------------
   Eigener Datensatz pdf:<songId> { id, name, blob }, damit der Song klein
   bleibt; wird erst beim Öffnen der Liedseite gelesen, nie exportiert. */
export const getPdf = (songId) => DB.get(`pdf:${songId}`);
export const putPdf = (songId, name, blob) => DB.put({ id: `pdf:${songId}`, name, blob });
export const deletePdf = (songId) => DB.del(`pdf:${songId}`);

/* ---------- Fortschritt je Song ---------------------------------------- */

/** Phrasen-Zustände eines Songs: { phraseId → Zustand }. */
export function phraseStates(songId) {
  const out = {};
  for (const [k, v] of Object.entries(S.phrases)) if (k.startsWith(`${songId}:`)) out[k.slice(songId.length + 1)] = { ...v, id: k.slice(songId.length + 1) };
  return out;
}
export function getPhrase(songId, phraseId) {
  const p = S.phrases[`${songId}:${phraseId}`];
  return p ? { ...p, id: phraseId } : newPhrase(phraseId);
}
export async function putPhrase(songId, p) {
  const key = `${songId}:${p.id}`;
  S.phrases[key] = { ...p, id: key };
  await DB.put({ ...p, id: `phrase:${key}` });
}

export function getWann(songId, phraseId) {
  const w = S.wann[`${songId}:${phraseId}`];
  return w ? { ...w, id: phraseId } : newWann(phraseId);
}
export async function putWann(songId, w) {
  const key = `${songId}:${w.id}`;
  S.wann[key] = { ...w, id: key };
  await DB.put({ ...w, id: `wann:${key}` });
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
