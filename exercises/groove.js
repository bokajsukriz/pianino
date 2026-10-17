/* exercises/groove.js — Groove (Ballade) (S6; 7.3).
   Die App spielt das Muster einen Durchgang vor (Klavier, :song-Voicings mit
   LH-Ton, RH-Offbeats halb so laut), dann Einzähler, dann 4 Takte mitspielen
   = 1 Block → „Groovt“ / „Wackelt“. Ab Stufe 2 läuft die Melodiestimme mit,
   falls vorhanden und passend (melody.js). Regeln rein in tempo.js. */

import * as audio from '../audio.js';
import { chordById } from '../chords.js';
import { SONG } from '../song-perfect-ruin.js';
import { GROOVE, GROOVE_STAGES, GROOVE_MAX_LEVEL, grooveBpm, applyGroove, grooveLoopChords } from '../tempo.js';
import { hasMelody, melodySlice, melodyStartFor } from '../melody.js';
import { S, saveGroove, levelUp, askedLater, mayAsk } from '../store.js';
import { field, showScreen, waitChoice, frameLoop, modal, pick, setToggle } from '../ui.js';
import { createClock } from '../clock.js';

const TIPS = [
  'Bass kräftig, Achtel leise – die Stimme ist die Hauptsache.',
  'Nicht schneller werden, hör auf den Klick.',
];
const TIP_HUM = 'Summ die Melodie dazu.';
const COUNTS = ['1', '+', '2', '+', '3', '+', '4', '+'];

const LEVEL_NEWS = {
  2: 'Neu: die rechte Hand spielt auf 1 und 3.',
  3: 'Neu: gerade Achtel in der rechten Hand, leise.',
  4: 'Neu: Strophen- und Refrain-Loop im Groove.',
};

/** Länge eines Anschlags in Achteln: bis zum nächsten aktiven Feld oder
 *  bis zum Taktende. */
export function hitLength(pattern, e) {
  let k = e + 1;
  while (k < pattern.length && !pattern[k]) k++;
  return k - e;
}

/** Begleitung eines Achtels planen (Vorspiel, Play-Along).
 *  rhLevel: Lautstärke der RH auf den Zählzeiten (Offbeats die Hälfte). */
export function playPatternStep(stage, chord, eighth, time, stepDur, rhLevel = 1) {
  if (stage.lh[eighth]) audio.note(chord.lh, time, { dur: hitLength(stage.lh, eighth) * stepDur, gain: 1.1 });
  if (stage.rh[eighth]) {
    const g = rhLevel * (eighth % 2 ? 0.5 : 1);
    for (const m of chord.rh) audio.note(m, time, { dur: hitLength(stage.rh, eighth) * stepDur * 0.95, gain: g });
  }
}

/** Melodie eines Takts planen. events: melodySlice(…, 1) des Takts. */
export function playMelodyBar(events, barStart, beatDur) {
  for (const ev of events) {
    audio.melody(ev.midi, barStart + (ev.beat - 1) * beatDur, ev.dur * beatDur, { octaveDown: S.settings.melodyLow });
  }
}

function buildGrid(host, stage) {
  const cells = [];
  const mk = (cls, text = '') => { const d = document.createElement('div'); d.className = cls; d.textContent = text; return d; };
  const head = [mk('lab'), ...COUNTS.map((c, i) => mk(`hd${i % 2 ? ' off' : ''}`, c))];
  const row = (name, pat, kind) => [mk('lab', name), ...pat.map((on, i) => {
    const c = mk(`cell${on ? ` ${kind}` : ''}${on && i % 2 ? ' off' : ''}`);
    return c;
  })];
  const rh = row('RH', stage.rh, 'rh'), lh = row('LH', stage.lh, 'lh');
  host.replaceChildren(...head, ...rh, ...lh);
  for (let i = 0; i < 8; i++) cells.push([head[i + 1], rh[i + 1], lh[i + 1]]);
  return cells;
}

/** Ein Block. → true bei „Groovt“. */
async function playBlock(api, scr, { stage, level, chords, bpm, demo }) {
  const ctx = audio.getCtx();
  const passBars = demo ? chords.length : 0;
  const total = (passBars + 1 + GROOVE.barsPerBlock) * 8;
  const nowEl = field(scr, 'now'), nextEl = field(scr, 'next'), count = field(scr, 'count');
  const ask = field(scr, 'ask'), foot = scr.querySelector('.ex-foot');
  ask.hidden = true; foot.hidden = false;
  const cells = buildGrid(field(scr, 'grid'), stage);

  const mStart = melodyStartFor(SONG, chords);
  const melodyOk = hasMelody(SONG) && level >= 2 && mStart !== null;
  const melBtn = scr.querySelector('[data-toggle="melody"]');
  setToggle(melBtn, melodyOk && S.settings.melody, !melodyOk);
  field(scr, 'melody-note').textContent = !hasMelody(SONG) ? 'Melodie noch nicht erfasst'
    : level < 2 ? 'Melodie ab Stufe 2' : mStart === null ? 'Melodie passt nicht zu diesem Loop' : '';
  setToggle(scr.querySelector('[data-toggle="click"]'), S.settings.click);
  field(scr, 'tip').textContent = pick(level >= 2 ? [...TIPS, TIP_HUM] : TIPS);

  const phase = (bar) => (bar < passBars ? 'demo' : bar === passBars ? 'count' : 'play');
  const chordAt = (bar) => chordById(chords[(phase(bar) === 'demo' ? bar : Math.max(0, bar - passBars - 1)) % chords.length]);
  const rhLevel = stage.rh.every(Boolean) ? 0.55 : 1; // gerade Achtel leise

  const clock = createClock(ctx, {
    bpm, totalSteps: total,
    onStep: (s) => {
      const ph = phase(s.bar), beatStart = s.eighth % 2 === 0;
      if (ph === 'demo') {
        playPatternStep(stage, chordAt(s.bar), s.eighth, s.time, clock.stepDur, rhLevel);
        if (beatStart && S.settings.click) audio.click(s.time, s.beat === 0, 0.45);
      } else if (ph === 'count') {
        if (beatStart) audio.click(s.time, s.beat === 0, 0.8);
      } else {
        if (beatStart && S.settings.click) audio.click(s.time, s.beat === 0, 0.6);
        if (s.eighth === 0 && melodyOk && S.settings.melody) {
          const i = s.bar - passBars - 1;
          playMelodyBar(melodySlice(SONG.melody, mStart + (i % chords.length), 1), s.time, clock.stepDur * 2);
        }
      }
    },
  });
  clock.start(ctx.currentTime + 0.2);
  let last = -1;
  const stop = frameLoop(() => {
    const pos = clock.position(audio.audibleNow());
    if (pos < 0) return;
    const step = Math.floor(pos);
    if (step === last || step >= total) return;
    last = step;
    const bar = Math.floor(step / 8), e = step % 8, ph = phase(bar);
    cells.forEach((col, i) => col.forEach((c) => c.classList.toggle('cur', i === e)));
    if (ph === 'demo') count.textContent = 'Vorspiel – zuhören';
    else if (ph === 'count') count.textContent = 'Einzählen';
    else count.textContent = `Mitspielen · Takt ${bar - passBars} von ${GROOVE.barsPerBlock}`;
    const cur = ph === 'count' ? null : chordAt(bar);
    const nb = bar + 1 < total / 8 ? chordAt(bar + 1) : null;
    nowEl.textContent = cur ? cur.symbol : '';
    nextEl.textContent = nb && (ph === 'count' || e >= 4) ? nb.symbol : '';
  });
  nowEl.textContent = '';
  nextEl.textContent = chordAt(0).symbol;
  count.textContent = demo ? 'Vorspiel – zuhören' : 'Einzählen';
  try {
    await api.wait(clock.done);
  } finally {
    clock.stop();
    stop();
  }
  cells.forEach((col) => col.forEach((c) => c.classList.remove('cur')));
  foot.hidden = true;
  ask.hidden = false;
  ask.querySelector('[data-answer="ok"]').focus({ preventScroll: true });
  const a = await api.wait(waitChoice(ask, 'answer'));
  ask.hidden = true; foot.hidden = false;
  return a === 'ok';
}

/** Runde Groove. item: { seconds }. */
export async function runGroove(api, item) {
  void item;
  const scr = showScreen('groove');
  const level = S.progress.levels.groove;
  const stage = GROOVE_STAGES[level];
  const [lo, hi] = stage.bpm;
  let state = { bpm: grooveBpm(level, S.groove.bpm), roundOk: 0 };
  const res = api.result('groove', { blocks: 0, ok: 0, bpmEnd: state.bpm, down: false });
  field(scr, 'level').textContent = `· Stufe ${level}`;
  let suggest = false, block = 0, prev = null;

  do {
    // ANNAHME: Stufe 4 „Strophen-Loop, dann Refrain-Loop“ = je 2 Blöcke im Wechsel.
    const name = stage.loops[Math.floor(block / 2) % stage.loops.length];
    const chords = grooveLoopChords(name, SONG);
    field(scr, 'bpm').textContent = `${state.bpm} BPM${lo === hi ? '' : ` (${lo}–${hi})`}`;
    const ok = await playBlock(api, scr, { stage, level, chords, bpm: state.bpm, demo: name !== prev });
    const out = applyGroove(level, state, ok);
    if (out.bpm < state.bpm) res.down = true;
    suggest = suggest || out.suggest;
    state = out;
    S.groove.bpm = out.bpm;
    await saveGroove();
    res.blocks++;
    if (ok) res.ok++;
    res.bpmEnd = out.bpm;
    prev = name;
    block++;
  } while (api.timeLeft() > 0);

  if (suggest && level < GROOVE_MAX_LEVEL && mayAsk('groove')) {
    const yes = await modal(`Bereit für Stufe ${level + 1}?`, LEVEL_NEWS[level + 1],
      [{ label: 'Später', value: 'no' }, { label: 'Ja', value: 'yes', primary: true }]);
    if (yes === 'yes') {
      await levelUp('groove', GROOVE_MAX_LEVEL);
      S.groove.bpm = grooveBpm(level + 1, S.groove.bpm);
      await saveGroove();
    } else await askedLater('groove');
  }
}
