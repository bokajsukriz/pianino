/* exercises/groove.js — Groove (Ballade) (S6; 7.3).
   Das Muster der Stufe über die Ereignisse einer Phrase des aktuellen Songs:
   die App spielt den Ausschnitt (höchstens 4 Takte) einmal vor (Griffe aus
   dem Song, LH auf der Eins, RH-Offbeats halb so laut; ein Wechsel mitten im
   Takt kommt an seiner Stelle), dann Einzähler, dann 4 Takte mitspielen
   = 1 Block → „Groovt“ / „Wackelt“. Stufen 1–3: die Phrase, an der in
   „Geführt“ gerade gearbeitet wird; Stufe 4: alle Phrasen im Wechsel. Ab
   Stufe 2 läuft die Melodiestimme mit, falls der Song eine hat (melody.js).
   Regeln rein in tempo.js, Begleitung in accomp.js. */

import * as audio from '../audio.js';
import { prettyChord } from '../chordsym.js';
import { voicingFor } from '../voicing.js';
import { chordAt } from '../timeline.js';
import { stepHits } from '../accomp.js';
import { phraseDefs, focusPhrase } from '../phrases.js';
import { GROOVE, GROOVE_STAGES, GROOVE_MAX_LEVEL, grooveBpm, applyGroove, grooveWindows } from '../tempo.js';
import { hasMelody, melodyIn } from '../melody.js';
import { S, saveGroove, levelUp, askedLater, mayAsk, currentSong, phraseStates } from '../store.js';
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
  4: 'Neu: alle Phrasen des Songs im Groove.',
};

/** Melodie eines Schlags planen (Töne, die in [beat, beat + 1) beginnen). */
export function playMelodyBeat(song, beat, time, beatDur) {
  for (const n of melodyIn(song, beat, beat + 1)) {
    audio.melody(n.midi, time + (n.at - beat) * beatDur, n.dur * beatDur, { octaveDown: S.settings.melodyLow });
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

/** Ein Block. → true bei „Groovt“. win: grooveWindows-Eintrag. */
async function playBlock(api, scr, { song, stage, level, win, bpm, demo }) {
  const ctx = audio.getCtx();
  const bpb = song.beatsPerBar;
  const winBars = win.bars, winBeats = winBars * bpb;
  const passBars = demo ? winBars : 0;
  const total = (passBars + 1 + GROOVE.barsPerBlock) * bpb * 2;
  const nowEl = field(scr, 'now'), nextEl = field(scr, 'next'), count = field(scr, 'count');
  const ask = field(scr, 'ask'), foot = scr.querySelector('.ex-foot');
  ask.hidden = true; foot.hidden = false;
  const cells = buildGrid(field(scr, 'grid'), stage);
  field(scr, 'title').textContent = win.name;

  const melodyOk = hasMelody(song) && level >= 2;
  const melBtn = scr.querySelector('[data-toggle="melody"]');
  setToggle(melBtn, melodyOk && S.settings.melody, !melodyOk);
  field(scr, 'melody-note').textContent = !hasMelody(song) ? 'Melodie noch nicht erfasst' : level < 2 ? 'Melodie ab Stufe 2' : '';
  setToggle(scr.querySelector('[data-toggle="click"]'), S.settings.click);
  field(scr, 'tip').textContent = pick(level >= 2 ? [...TIPS, TIP_HUM] : TIPS);

  const grip = (c) => voicingFor(song, c);
  const phase = (bar) => (bar < passBars ? 'demo' : bar === passBars ? 'count' : 'play');
  /** Schlag im Song zu einem Schlag seit Blockbeginn (Ausschnitt im Loop). */
  const songBeat = (b) => {
    const r = b < passBars * bpb ? b : b - (passBars + 1) * bpb;
    return win.fromBeat + (((r % winBeats) + winBeats) % winBeats);
  };

  const clock = createClock(ctx, {
    bpm, totalSteps: total, beatsPerBar: bpb,
    onStep: (s) => {
      const ph = phase(s.bar), beatStart = s.eighth % 2 === 0, b = s.index / 2;
      if (ph === 'demo') {
        const sb = songBeat(b);
        audio.playHits(stepHits(win.tl, sb, { pattern: stage, from: Math.abs(sb - win.fromBeat) < 1e-6 ? sb : -1 }), s.time, clock.stepDur * 2, grip);
        if (beatStart && S.settings.click) audio.click(s.time, s.beat === 0, 0.45);
      } else if (ph === 'count') {
        if (beatStart) audio.click(s.time, s.beat === 0, 0.8);
      } else {
        if (beatStart && S.settings.click) audio.click(s.time, s.beat === 0, 0.6);
        if (beatStart && melodyOk && S.settings.melody) playMelodyBeat(song, songBeat(b), s.time, clock.stepDur * 2);
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
    const bar = Math.floor(step / (bpb * 2)), e = step % (bpb * 2), ph = phase(bar);
    cells.forEach((col, i) => col.forEach((c) => c.classList.toggle('cur', i === e % 8)));
    if (ph === 'demo') count.textContent = 'Vorspiel – zuhören';
    else if (ph === 'count') count.textContent = 'Einzählen';
    else count.textContent = `Mitspielen · Takt ${bar - passBars} von ${GROOVE.barsPerBlock}`;
    const sb = songBeat(step / 2);
    const cur = ph === 'count' ? null : chordAt(win.tl, sb);
    // Nächster Wechsel innerhalb von 2 Schlägen (im Ausschnitt, mit Loop).
    let nb = null;
    for (let k = 1; k <= 4; k++) {
      const c = chordAt(win.tl, songBeat(step / 2 + k / 2));
      if (c && c !== cur) { nb = c; break; }
    }
    if (ph === 'count') nb = chordAt(win.tl, win.fromBeat);
    nowEl.textContent = cur ? prettyChord(cur) : '';
    nextEl.textContent = nb ? prettyChord(nb) : '';
  });
  nowEl.textContent = '';
  nextEl.textContent = prettyChord(chordAt(win.tl, win.fromBeat) || '');
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

  const song = currentSong();
  const defs = phraseDefs(song);
  const focus = focusPhrase(defs, phraseStates(song.id));
  const all = grooveWindows(song, defs);
  const wins = stage.phrases === 'focus' && focus ? all.filter((w) => w.phrase === focus.id) : all;
  if (!wins.length) {
    await modal('Groove', 'Der Song hat noch keine Akkorde.', [{ label: 'OK', value: 'ok', primary: true }]);
    return;
  }

  do {
    // ANNAHME: je Ausschnitt 2 Blöcke, dann der nächste (wie früher die Loops).
    const win = wins[Math.floor(block / 2) % wins.length];
    field(scr, 'bpm').textContent = `${state.bpm} BPM${lo === hi ? '' : ` (${lo}–${hi})`}`;
    const ok = await playBlock(api, scr, { song, stage, level, win, bpm: state.bpm, demo: win.id !== prev });
    const out = applyGroove(level, state, ok);
    if (out.bpm < state.bpm) res.down = true;
    suggest = suggest || out.suggest;
    state = out;
    S.groove.bpm = out.bpm;
    await saveGroove();
    res.blocks++;
    if (ok) res.ok++;
    res.bpmEnd = out.bpm;
    prev = win.id;
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
