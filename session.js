/* session.js — führt einen Übungsplan aus ([{ exercise, seconds | cards | bars }]).
   Zeitlimits sind weich: die Übung fragt timeLeft() erst nach einer Karte oder
   einem Block. Pause friert den AudioContext und die Sessionzeit ein,
   „Beenden“ bricht ab und führt zum Abschluss. */

import * as audio from './audio.js';
import { $ } from './ui.js';
import { addDaySeconds, markPlayed } from './store.js';
import { logError } from './log.js';
import { runBlitz } from './exercises/blitz.js';
import { runWege } from './exercises/wege.js';
import { runGroove } from './exercises/groove.js';
import { runPlayalong } from './exercises/playalong.js';

const EXERCISES = { blitz: runBlitz, wege: runWege, groove: runGroove, playalong: runPlayalong };

export class Aborted extends Error {}

let current = null;
export const sessionRunning = () => !!current;

function elapsed(s) {
  return (s.activeMs + (s.paused ? 0 : performance.now() - s.since)) / 1000;
}

/* ---------- Bildschirm wach halten ------------------------------------ */
let wakeLock = null;
async function keepAwake() {
  try {
    if ('wakeLock' in navigator && document.visibilityState === 'visible') {
      wakeLock = await navigator.wakeLock.request('screen');
    }
  } catch { /* still ignorieren */ }
}
function releaseAwake() {
  try { wakeLock?.release(); } catch { /* egal */ }
  wakeLock = null;
}

/* ---------- Fortschrittsbalken ---------------------------------------- */
function paintBar(s) {
  const fill = $('#session-bar .session-bar-fill');
  if (!fill) return;
  let f;
  if (s.countTotal) f = s.countDone / s.countTotal;
  else f = elapsed(s) / s.total;
  fill.style.width = `${Math.min(100, Math.max(0, f * 100)).toFixed(1)}%`;
}

/* ---------- Pause / Beenden ------------------------------------------- */
export async function pause() {
  const s = current;
  if (!s || s.paused || s.ended) return;
  s.activeMs += performance.now() - s.since;
  s.paused = true;
  await audio.suspend();
  $('#pause').hidden = false;
  $('#pause-go').focus();
}

export async function resume() {
  const s = current;
  if (!s || !s.paused) return;
  $('#pause').hidden = true;
  await audio.resume();
  s.since = performance.now();
  s.paused = false;
}

export async function end() {
  const s = current;
  if (!s || s.ended) return;
  // Pausenzeit ist schon verbucht; ab jetzt zählt nichts mehr dazu.
  if (s.paused) { s.since = performance.now(); s.paused = false; }
  s.ended = true;
  $('#pause').hidden = true;
  s.rejectAbort(new Aborted());
  await audio.resume();
}

/** Plan ausführen. → { results, lastExercise, aborted } */
export async function runSession(plan) {
  const s = {
    plan, ended: false, paused: false, activeMs: 0, since: performance.now(), recorded: 0,
    results: {}, total: plan.reduce((a, p) => a + (p.seconds || 0), 0) || 1,
    countTotal: plan.every((p) => p.cards) ? plan.reduce((a, p) => a + p.cards, 0) : 0,
    countDone: 0, lastExercise: null,
  };
  s.abortP = new Promise((_, rej) => { s.rejectAbort = rej; });
  s.abortP.catch(() => {});
  current = s;
  $('#session-bar').hidden = false;
  keepAwake();
  const barTimer = setInterval(() => paintBar(s), 250);

  const record = async (exercise) => {
    const now = elapsed(s);
    const sec = now - s.recorded;
    s.recorded = now;
    await addDaySeconds(sec, exercise);
  };

  let item = null;
  try {
    for (item of plan) {
      if (s.ended) break;
      const itemStart = elapsed(s);
      const api = {
        item,
        timeLeft: () => (item.seconds ? item.seconds - (elapsed(s) - itemStart) : Infinity),
        wait: (p) => Promise.race([p, s.abortP]),
        get ended() { return s.ended; },
        result: (ex, init) => (s.results[ex] ||= init),
        countUp: () => { s.countDone++; paintBar(s); },
      };
      await EXERCISES[item.exercise](api, item);
      await record(item.exercise);
      await markPlayed(item.exercise);
      if (item.exercise !== 'playalong' || !s.lastExercise) s.lastExercise = item.exercise;
    }
  } catch (e) {
    if (!(e instanceof Aborted)) logError('session', e);
    if (item) {
      await record(item.exercise);
      if (s.results[item.exercise]) await markPlayed(item.exercise);
      if (item.exercise !== 'playalong' || !s.lastExercise) s.lastExercise = item.exercise;
    }
  } finally {
    clearInterval(barTimer);
    $('#session-bar').hidden = true;
    $('#pause').hidden = true;
    releaseAwake();
    current = null;
  }
  return { results: s.results, lastExercise: s.lastExercise, aborted: s.ended, seconds: s.recorded };
}

/* Seite verborgen (Anruf, App gewechselt): automatisch pausieren.
   Wieder sichtbar: Wake Lock neu anfordern (der Browser gibt ihn frei). */
document.addEventListener('visibilitychange', () => {
  if (!current) return;
  if (document.visibilityState === 'hidden') pause();
  else keepAwake();
});
