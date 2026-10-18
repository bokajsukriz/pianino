/* mix.js — REIN: der 5-Minuten-Mix und das Wochenziel.
   Kein DOM, kein Date.now(), kein Math.random(). */

import { daysBetween, weekOf } from './dates.js';

export const EXERCISE_NAMES = Object.freeze({
  guided: 'Geführt', blitz: 'Akkord-Blitz', wege: 'Kurze Wege', groove: 'Groove', playalong: 'Play-Along', wann: 'Wann',
});
export const WEEK_GOAL = 3;
export const DAY_MIN_SECONDS = 60;

/** buildMix(state, today) → [{ exercise, seconds, … }], Summe 300 s, oder []
 *  (kein Mix: der Song hat noch keine Ereignisse → Hinweis auf
 *  „Transkribieren“). state: { hasEvents, video }
 *  30 s „Wann“ für die aktuelle Phrase, 2½ min „Geführt“ (die fällige
 *  Wiederholung einer sitzenden Phrase bleibt an seinem Anfang), 2 min
 *  Play-Along — mit YouTube, falls Quelle und Offset vorhanden, sonst mit
 *  eigener Begleitung (playalong.js entscheidet). */
export function buildMix(state, today) {
  void today; // Der Mix hängt nur vom Zustand ab; today bleibt für spätere Regeln.
  if (!state.hasEvents) return [];
  return [
    { exercise: 'wann', seconds: 30 },
    { exercise: 'guided', seconds: 150 },
    { exercise: 'playalong', seconds: 120, range: 'phrase', video: !!state.video },
  ];
}

/** „½“, „2½“, „2“: Minuten kurz. */
export function minutesText(sec) {
  const halves = Math.round(sec / 30);
  const whole = Math.floor(halves / 2);
  return halves % 2 ? (whole ? `${whole}½` : '½') : String(whole);
}

/** Unterzeile auf dem Startscreen. */
export function mixLabel(mix) {
  return mix.map((m) => `${minutesText(m.seconds)} min ${EXERCISE_NAMES[m.exercise]}`).join(' · ');
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
