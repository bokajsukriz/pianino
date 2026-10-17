/* mix.js — REIN: der 5-Minuten-Mix und das Wochenziel.
   Kein DOM, kein Date.now(), kein Math.random(). */

import { daysBetween, weekOf } from './dates.js';

export const EXERCISE_NAMES = Object.freeze({
  guided: 'Geführt', blitz: 'Akkord-Blitz', wege: 'Kurze Wege', groove: 'Groove', playalong: 'Play-Along',
});
export const WEEK_GOAL = 3;
export const DAY_MIN_SECONDS = 60;

/** buildMix(state, today) → [{ exercise, seconds, … }], Summe 300 s:
 *  4 min Geführt (die Phrasen des Songs, inklusive kurzer Wiederholung des
 *  Sitzenden), 1 min Play-Along zum Schluss. Kein eigenes Akkord-Aufwärmen
 *  mehr — wer die Akkorde kann, übt sie nicht jedes Mal wieder einzeln.
 *  state: { verseBpm } */
export function buildMix(state, today) {
  void today; // Der Mix hängt nur vom Zustand ab; today bleibt für spätere Regeln.
  return [
    { exercise: 'guided', seconds: 240 },
    { exercise: 'playalong', seconds: 60, bpm: Math.max(50, state.verseBpm ?? 55), melody: true },
  ];
}

/** Unterzeile auf dem Startscreen. */
export function mixLabel(mix) {
  return mix.map((m) => `${Math.round(m.seconds / 60)} min ${EXERCISE_NAMES[m.exercise]}`).join(' · ');
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
