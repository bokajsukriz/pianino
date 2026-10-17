/* exercises/playalong.js — Play-Along (S7; 7.5). Keine Bewertung.
   Begleitung: Klavier mit :song-Voicings im Muster der Groove-Stufe 3 (LH auf
   der 1, RH leise Achtel), Klick und Melodie wahlweise. Läuft die Strophe ab
   Takt 1; mit `seconds` bis zum Ende der 4-Takt-Phrase, in der die Zeit
   abläuft, mit `bars` genau so viele Takte (Belohnung: 8). */

import * as audio from '../audio.js';
import { chordById } from '../chords.js';
import { SONG } from '../song-perfect-ruin.js';
import { GROOVE_STAGES } from '../tempo.js';
import { hasMelody, melodySlice } from '../melody.js';
import { S, getLoop } from '../store.js';
import { field, showScreen, frameLoop, setToggle } from '../ui.js';
import { createClock } from '../clock.js';
import { playPatternStep, playMelodyBar } from './groove.js';

const PATTERN = GROOVE_STAGES[3];

/** Wie viele Takte für `seconds` Sekunden? Auf ganze 4-Takt-Phrasen
 *  aufgerundet (weiches Zeitlimit). */
export function barsFor(seconds, bpm) {
  const barSec = (60 / bpm) * 4;
  return Math.max(4, Math.ceil(seconds / barSec / 4) * 4);
}

function paintBars(host) {
  host.replaceChildren(...SONG.verse.map((id, i) => {
    const li = document.createElement('li');
    li.textContent = chordById(id).symbol;
    const s = document.createElement('small'); s.textContent = String(i + 1);
    li.append(s);
    return li;
  }));
}

/** item: { seconds, bpm } oder { bars } (Belohnung). */
export async function runPlayalong(api, item) {
  const scr = showScreen('play');
  const verse = SONG.verse;
  const bpm = item.bpm ?? Math.max(50, getLoop('verse').bpm);
  const bars = item.bars || barsFor(item.seconds || 60, bpm);
  const nowEl = field(scr, 'now'), nextEl = field(scr, 'next'), count = field(scr, 'count'), barsEl = field(scr, 'bars');
  field(scr, 'bpm').textContent = `${bpm} BPM`;
  paintBars(barsEl);
  const melodyOk = hasMelody(SONG);
  setToggle(scr.querySelector('[data-toggle="melody"]'), melodyOk && S.settings.melody, !melodyOk);
  setToggle(scr.querySelector('[data-toggle="melodyLow"]'), melodyOk && S.settings.melodyLow, !melodyOk);
  setToggle(scr.querySelector('[data-toggle="click"]'), S.settings.click);
  field(scr, 'melody-note').textContent = melodyOk ? '' : 'Melodie noch nicht erfasst';

  const ctx = audio.getCtx();
  const clock = createClock(ctx, {
    bpm, totalSteps: (1 + bars) * 8,
    onStep: (s) => {
      const beatStart = s.eighth % 2 === 0;
      if (s.bar === 0) { if (beatStart) audio.click(s.time, s.beat === 0, 0.7); return; }
      const i = s.bar - 1;
      playPatternStep(PATTERN, chordById(verse[i % verse.length]), s.eighth, s.time, clock.stepDur, 0.5);
      if (beatStart && S.settings.click) audio.click(s.time, s.beat === 0, 0.45);
      if (s.eighth === 0 && melodyOk && S.settings.melody) {
        playMelodyBar(melodySlice(SONG.melody, (i % verse.length) + 1, 1), s.time, clock.stepDur * 2);
      }
    },
  });
  count.textContent = 'Einzählen';
  nowEl.textContent = '';
  nextEl.textContent = chordById(verse[0]).symbol;
  clock.start(ctx.currentTime + 0.2);
  let last = -1;
  const stop = frameLoop(() => {
    const pos = clock.position(audio.audibleNow());
    if (pos < 0) return;
    const step = Math.floor(pos), bar = Math.floor(step / 8), beat = Math.floor((step % 8) / 2);
    const key = bar * 4 + beat;
    if (key === last || bar > bars) return;
    last = key;
    const i = bar - 1;
    if (i < 0) { count.textContent = 'Einzählen'; return; }
    const k = i % verse.length;
    count.textContent = `Takt ${k + 1} von ${verse.length}`;
    nowEl.textContent = chordById(verse[k]).symbol;
    nextEl.textContent = i + 1 < bars ? chordById(verse[(k + 1) % verse.length]).symbol : '';
    [...barsEl.children].forEach((li, j) => li.classList.toggle('now', j === k));
  });
  const res = api.result('playalong', { bars: 0 });
  try {
    await api.wait(clock.done);
    res.bars += bars;
  } finally {
    clock.stop();
    stop();
  }
}
