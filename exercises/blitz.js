/* exercises/blitz.js — Akkord-Blitz (S3 Karte, S4 Auflösung; 7.1).
   Symbol zeigen → leiser Klick zählt den Countdown (60 BPM) → nach dem
   letzten Schlag oder bei Tipp: Auflösung mit Vorspiel → Saß / Wackelig /
   Nochmal. Die Regeln selbst stehen rein in leitner.js. */

import * as audio from '../audio.js';
import { chordById, chordNoteNames } from '../chords.js';
import {
  buildRound, startRound, nextEntry, afterReview, review, countdownBeats, unlockedCardIds,
  chordOfCard, postponeOverflow, levelReady, plannedLength, MAX_LEVEL,
} from '../leitner.js';
import { S, today, getCard, putCards, levelUp, askedLater, mayAsk } from '../store.js';
import { field, showScreen, waitChoice, makeDots, setDots, frameLoop, fmtTime, modal, rand, pick } from '../ui.js';
import { createClock } from '../clock.js';
import { renderKeyboard, rangeFor, chordMarks } from '../keyboard.js';

const RING = 578.05; // Umfang des Countdown-Rings (r = 92)

const TIPS = {
  thumb: 'Der Daumen bleibt auf dem A, nur bei C rutscht er aufs G.',
  d: 'D-Dur ist Dm mit F♯ statt F: eine schwarze Taste höher.',
  wrong: 'Lieber falsch greifen und hören als gar nicht.',
  minor: 'Moll: der mittlere Ton liegt einen Halbton tiefer als bei Dur.',
};

const LEVEL_NEWS = {
  2: 'Neu dazu: D-Dur in Grundstellung.',
  3: 'Neu dazu: alle fünf Akkorde in der Lage des Songs, rund um das A.',
  4: 'Neu: Bei sicheren Karten wird der Countdown kürzer.',
};

/** Ein Tipp pro Runde, passend zu den Karten der Runde. */
function roundTip(ids) {
  const chords = ids.map(chordOfCard);
  const pool = [TIPS.wrong, TIPS.minor];
  if (chords.some((c) => c.endsWith(':song'))) pool.push(TIPS.thumb, TIPS.thumb);
  if (chords.some((c) => c.startsWith('D:'))) pool.push(TIPS.d, TIPS.d);
  return pick(pool);
}

/** S3: Karte mit Countdown. Endet nach dem letzten Schlag oder bei Tipp. */
async function showCard(api, scr, chord, beats, item, hint) {
  const card = field(scr, 'card'), ring = field(scr, 'ring'), dots = field(scr, 'dots');
  field(scr, 'reveal').hidden = true;
  card.hidden = false;
  field(scr, 'symbol').textContent = chord.symbol;
  field(scr, 'degree').textContent = chord.degree;
  scr.querySelector('.blitz-hint').textContent = hint;
  makeDots(dots, beats);
  ring.style.strokeDashoffset = '0';

  const ctx = audio.getCtx();
  const clock = createClock(ctx, {
    bpm: 60, stepsPerBeat: 1, totalSteps: beats,
    onStep: (s) => audio.click(s.time, s.index === 0, 0.3),
  });
  clock.start(ctx.currentTime + 0.25);
  const timeEl = field(scr, 'time');
  const stopFrame = frameLoop(() => {
    const t = audio.audibleNow() - clock.t0;
    const p = Math.min(1, Math.max(0, t / beats));
    ring.style.strokeDashoffset = String(RING * p);
    setDots(dots, t < 0 ? -1 : Math.floor(t));
    if (item.seconds) timeEl.textContent = fmtTime(api.timeLeft());
  });
  const ac = new AbortController();
  const tap = new Promise((res) => card.addEventListener('click', res, { signal: ac.signal }));
  card.focus({ preventScroll: true });
  try {
    await api.wait(Promise.race([clock.done, tap]));
  } finally {
    clock.stop();
    stopFrame();
    ac.abort();
  }
}

/** S4: Auflösung mit Klang, Tastatur und drei Knöpfen. → Ergebnis. */
async function reveal(api, scr, chord) {
  field(scr, 'card').hidden = true;
  const box = field(scr, 'reveal');
  box.hidden = false;
  const names = chordNoteNames(chord);
  field(scr, 'r-symbol').textContent = chord.symbol;
  field(scr, 'r-degree').textContent = chord.degree;
  field(scr, 'r-notes').textContent = `${names.rh.join(' · ')}  –  Bass ${names.lh}`;
  field(scr, 'r-tip').textContent = chord.tip;
  const [lo, hi] = rangeFor([chord.lh, ...chord.rh]);
  renderKeyboard(field(scr, 'r-kb'), { lo, hi, marks: chordMarks(chord), title: `${chord.symbol}: ${names.rh.join(', ')}, Bass ${names.lh}` });
  audio.chord(chord, audio.now() + 0.05, { dur: 1.5 });
  return api.wait(waitChoice(box.querySelector('.answer-row'), 'answer'));
}

/** Runde Akkord-Blitz. item: { seconds } oder { cards } (Nur 1 Minute);
 *  warmup + pool: Aufwärmen nur mit diesen Karten, keine neuen. */
export async function runBlitz(api, item) {
  const scr = showScreen('blitz');
  const level = S.progress.levels.blitz;
  const d = today();
  const ids = item.pool || unlockedCardIds(level);
  const cardsNow = () => ids.map(getCard);
  // Aufwärmen ohne neue Karten — außer ganz am Anfang, wenn es noch keine
  // gesehenen gibt: dann gilt auch hier der geblockte Einstieg.
  const allowNew = !item.warmup || cardsNow().every((c) => !(c.seen > 0));
  const built = buildRound({ cards: cardsNow(), today: d, rand, allowNew });
  let round = startRound(built);
  const reviewed = [];
  const res = api.result('blitz', { cards: 0, sass: new Set(), up: 0 });
  field(scr, 'level').textContent = item.warmup ? '· Aufwärmen' : `· Stufe ${level}`;
  field(scr, 'time').textContent = item.seconds ? fmtTime(item.seconds) : '';
  const tip = `Tipp: ${roundTip(ids)}`;

  let n = 0;
  try {
    for (;;) {
      if (item.cards ? n >= item.cards : n > 0 && api.timeLeft() <= 0) break;
      const next = nextEntry(round, cardsNow());
      round = next.round;
      if (!next.entry) break;
      const card = getCard(next.entry.id);
      const chord = chordById(chordOfCard(card.id));
      n++;
      field(scr, 'count').textContent = `Karte ${n} von ${item.cards || Math.max(n, plannedLength(round))}`;
      await showCard(api, scr, chord, countdownBeats(card, level, next.entry.intro), item,
        n === 1 ? 'Greif den Akkord. Tippen zeigt die Lösung.' : tip);
      const result = await reveal(api, scr, chord);
      const updated = review(card, result, d, level);
      if (updated.box > card.box) res.up++;
      await putCards([updated]);
      reviewed.push(card.id);
      res.cards++;
      if (result === 'sass') res.sass.add(card.id);
      round = afterReview(round, card.id, result, rand);
      api.countUp();
    }
  } finally {
    // Kein Rückstau: Fällige ohne Platz still auf die nächsten Tage.
    const moved = postponeOverflow(cardsNow(), built.overflow, reviewed, d);
    if (moved.length) await putCards(moved);
  }

  const levelCards = unlockedCardIds(level).map(getCard);
  if (!item.warmup && level < MAX_LEVEL && levelReady(levelCards, level) && mayAsk('blitz')) {
    const yes = await modal(`Bereit für Stufe ${level + 1}?`, LEVEL_NEWS[level + 1],
      [{ label: 'Später', value: 'no' }, { label: 'Ja', value: 'yes', primary: true }]);
    if (yes === 'yes') await levelUp('blitz', MAX_LEVEL); else await askedLater('blitz');
  }
}
