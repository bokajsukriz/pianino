/* mix.js — REIN: der 5-Minuten-Mix (7.4), Wochenziel und Fortschritt.
   Kein DOM, kein Date.now(), kein Math.random(). */

import { daysBetween, weekOf } from './dates.js';
import { LEVEL_CHORDS, cardId } from './leitner.js';

export const MAX_LEVELS = Object.freeze({ blitz: 4, wege: 6, groove: 4 });
export const EXERCISE_NAMES = Object.freeze({
  blitz: 'Akkord-Blitz', wege: 'Kurze Wege', groove: 'Groove', playalong: 'Play-Along',
});
export const WEEK_GOAL = 3;
export const DAY_MIN_SECONDS = 60;
const ORDER = ['blitz', 'wege', 'groove'];

/** Fortschrittswert einer Übung: aktuelle Stufe / höchste Stufe. */
export const progressOf = (levels, ex) => (levels[ex] || 1) / MAX_LEVELS[ex];

/** Schwächste Übung: kleinster Fortschrittswert; bei Gleichstand die am
 *  längsten nicht geübte (nie geübt = am längsten), dann feste Reihenfolge. */
export function weakestExercise(levels, lastPlayed = {}) {
  const age = (ex) => (lastPlayed[ex] ? lastPlayed[ex] : '');
  return ORDER.slice().sort((a, b) => {
    const d = progressOf(levels, a) - progressOf(levels, b);
    if (Math.abs(d) > 1e-9) return d;
    if (age(a) !== age(b)) return age(a) < age(b) ? -1 : 1;
    return ORDER.indexOf(a) - ORDER.indexOf(b);
  })[0];
}

/** Karten fürs Aufwärmen: Fach ≥ 2; gibt es weniger als 3 davon, die
 *  Stufe-1-Karten in Grundstellung. */
export function warmupPool(cards) {
  const strong = cards.filter((c) => c.seen > 0 && c.box >= 2).map((c) => c.id);
  return strong.length >= 3 ? strong : LEVEL_CHORDS[1].map(cardId);
}

/** buildMix(state, today) → [{ exercise, seconds, … }], Summe 300 s.
 *  state: { levels: { blitz, wege, groove }, lastPlayed: { … }, cards: [],
 *           verseBpm } */
export function buildMix(state, today) {
  void today; // Der Mix hängt nur vom Zustand ab; today bleibt für spätere Regeln.
  const weakest = weakestExercise(state.levels, state.lastPlayed);
  return [
    { exercise: 'blitz', seconds: 60, warmup: true, pool: warmupPool(state.cards || []) },
    { exercise: weakest, seconds: 180 },
    { exercise: 'playalong', seconds: 60, bpm: Math.max(50, state.verseBpm ?? 55), melody: true },
  ];
}

/** Unterzeile auf dem Startscreen. */
export function mixLabel(mix) {
  return mix.map((m) => {
    const min = Math.round(m.seconds / 60);
    return `${min} min ${m.warmup ? 'Aufwärmen' : EXERCISE_NAMES[m.exercise]}`;
  }).join(' · ');
}

/** Wochenpunkte Mo–So. days: { 'YYYY-MM-DD': { seconds } }.
 *  → [{ date, practiced, today, future }] — verpasste Tage sind nicht anders
 *  markiert als zukünftige (nur „geübt“ oder nicht). */
export function weekDots(days, today) {
  return weekOf(today).map((date) => ({
    date,
    practiced: (days[date]?.seconds || 0) >= DAY_MIN_SECONDS,
    today: date === today,
    future: daysBetween(today, date) > 0,
  }));
}

/** Geübte Tage dieser Woche. */
export const practicedThisWeek = (days, today) => weekDots(days, today).filter((d) => d.practiced).length;

/** Song-Fortschritt: Anteil erreichter Stufen über alle Übungen (0..1). */
export function songProgress(levels) {
  const got = ORDER.reduce((s, ex) => s + (levels[ex] || 1), 0);
  const all = ORDER.reduce((s, ex) => s + MAX_LEVELS[ex], 0);
  return got / all;
}
