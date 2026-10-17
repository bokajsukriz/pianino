/* clock.js — Lookahead-Scheduler auf der AudioContext-Uhr (Prinzip aus
   metronom.html der Choirapp: setTimeout(…, 25) plant alles, was in den
   nächsten ≥ 100 ms fällig wird, mit exakter Audiozeit). Kein setInterval.

   Schritte sind Achtel (stepsPerBeat = 2). Die Zeit eines Schritts wird aus
   Startzeit + Index × Dauer berechnet, nicht aufaddiert — so driftet nichts.
   Pause: der Aufrufer friert den AudioContext ein (ctx.suspend()); die Uhr
   steht dann mit, geplante Töne bleiben geplant.

   Die Anzeige folgt per requestAnimationFrame: drain(audioTime) liefert die
   Schritte, deren Zeit erreicht ist. */

export const LOOKAHEAD = 0.15;
export const TIMER_MS = 25;

/** createClock(ctx, { bpm, totalSteps, onStep, … }) → Uhr.
 *  onStep({ index, time, bar, eighth, beat }) plant Audio für diesen Schritt.
 *  totalSteps = Infinity läuft, bis stop() kommt. */
export function createClock(ctx, {
  bpm, totalSteps = Infinity, stepsPerBeat = 2, beatsPerBar = 4,
  lookahead = LOOKAHEAD, interval = TIMER_MS, onStep = null,
}) {
  const stepDur = 60 / bpm / stepsPerBeat;
  const perBar = stepsPerBeat * beatsPerBar;
  const queue = [];
  let t0 = 0, next = 0, timer = null, running = false;
  let resolveDone;
  const done = new Promise((r) => { resolveDone = r; });

  const endTime = () => t0 + totalSteps * stepDur;

  /** Alle Schritte mit Zeit < until planen. */
  function fill(until) {
    while (next < totalSteps) {
      const time = t0 + next * stepDur;
      if (time >= until) break;
      const eighth = next % perBar;
      const step = { index: next, time, bar: Math.floor(next / perBar), eighth, beat: Math.floor(eighth / stepsPerBeat) };
      next++;
      queue.push(step);
      if (onStep) onStep(step);
    }
  }

  function tick() {
    if (!running) return;
    fill(ctx.currentTime + lookahead);
    if (next >= totalSteps && ctx.currentTime >= endTime()) {
      running = false;
      resolveDone(endTime());
      return;
    }
    timer = setTimeout(tick, interval);
  }

  return {
    stepDur,
    get t0() { return t0; },
    get endTime() { return endTime(); },
    get running() { return running; },
    /** Ende aller Schritte erreicht (Audiozeit). */
    done,
    /** Start zur Audiozeit `at` (Standard: gleich, mit etwas Vorlauf).
     *  timer: false → nur per fill() treiben (Tests, OfflineAudioContext). */
    start(at = ctx.currentTime + 0.1, { timer: useTimer = true } = {}) {
      t0 = at;
      next = 0;
      running = true;
      if (useTimer) tick();
      return this;
    },
    fill,
    /** Anhalten; done bleibt offen. */
    stop() {
      running = false;
      clearTimeout(timer);
      timer = null;
    },
    /** Schritte, deren Zeit erreicht ist (für die Anzeige). */
    drain(now) {
      const out = [];
      while (queue.length && queue[0].time <= now) out.push(queue.shift());
      return out;
    },
    /** Position zur Audiozeit `now` in Schritten (Bruchteil, für Cursor). */
    position(now) {
      return (now - t0) / stepDur;
    },
  };
}
