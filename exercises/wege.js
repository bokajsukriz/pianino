/* exercises/wege.js — Kurze Wege (S5; 7.2).
   4 Klicks Einzähler → 8 Takte Loop (Stufe 6: die Akkordfolge des Songs am
   Stück) mit Klick. Die Loops sind die häufigsten Übergänge des aktuellen
   Songs, je Paar ein Pendel (tempo.js wegeStages). Auf jeder Eins schaltet
   die Anzeige weiter, ab Schlag 3 ist der nächste Akkord als „gleich“
   markiert und die Tastatur zeigt den Wechsel (Wechsel-Ansicht: was bleibt,
   loslassen, dazukommt, wandert). Danach „Drangeblieben“ / „Rausgefallen“.
   Regeln rein in tempo.js. */

import * as audio from '../audio.js';
import { prettyChord } from '../chordsym.js';
import { voicingFor, allKeys } from '../voicing.js';
import { WEGE, wegeStages, blockChords, blockBpm, applyWege, nextLoop, stageSolid } from '../tempo.js';
import { S, today, getLoop, putLoop, levelUp, askedLater, mayAsk, currentSong } from '../store.js';
import { field, showScreen, waitChoice, makeDots, setDots, frameLoop, modal, rand, pick } from '../ui.js';
import { createClock } from '../clock.js';
import { renderGrip, rangeFor } from '../keyboard.js';

const TIPS = [
  'Die Eins wartet nicht. Lieber nur den Bass pünktlich.',
  'Was liegen bleiben kann, bleibt liegen.',
  'Schau auf den nächsten Akkord, nicht auf die Hände.',
];

const LEVEL_NEWS = {
  2: 'Neu: die nächsten zwei Wechsel des Songs.',
  3: 'Neu: die linke Hand spielt dazu.',
  4: 'Neu: weitere Wechsel des Songs, mit beiden Händen.',
  5: 'Neu: alle häufigen Wechsel im Wechsel.',
  6: 'Neu: die Akkordfolge des Songs am Stück.',
};

let song = null;
const grip = (c) => voicingFor(song, c);

/** Akkordleiste: Loop einmal; bei der Form ein Fenster von 8 Takten. */
function paintStrip(strip, def, chords, i, showNext) {
  let items, cur, nxt;
  if (def.once) {
    const from = Math.max(0, Math.min(i - 1, chords.length - 8));
    items = chords.slice(from, from + 8);
    cur = i - from; nxt = showNext ? cur + 1 : -1;
  } else {
    items = def.chords;
    cur = i < 0 ? -1 : i % items.length;
    nxt = showNext ? (cur + 1) % items.length : -1;
  }
  strip.replaceChildren(...items.map((id, k) => {
    const li = document.createElement('li');
    li.className = k === cur ? 'now' : k === nxt ? 'next' : '';
    const b = document.createElement('b'); b.textContent = prettyChord(id);
    li.append(b);
    return li;
  }));
}

/** Ein Block: Einzähler + Loop. → true bei „Drangeblieben“. */
async function playBlock(api, scr, { def, chords, bpm, range }) {
  const ctx = audio.getCtx();
  const n = chords.length;
  const strip = field(scr, 'strip'), dots = field(scr, 'dots'), kb = field(scr, 'kb');
  const nowEl = field(scr, 'now'), nextEl = field(scr, 'next'), count = field(scr, 'count');
  const ask = field(scr, 'ask'), foot = scr.querySelector('.ex-foot');
  ask.hidden = true; foot.hidden = false;
  field(scr, 'tip').textContent = pick(TIPS);
  makeDots(dots, 4);

  const show = (i, beat) => {
    const cur = chords[Math.max(0, i)];
    const nxt = i < 0 ? null : chords[i + 1] ?? null;
    const showNext = beat >= 2 && !!nxt;
    nowEl.textContent = prettyChord(cur);
    nextEl.textContent = showNext ? prettyChord(nxt) : '';
    paintStrip(strip, def, chords, i, showNext);
    const a = grip(cur), b = showNext ? grip(nxt) : null;
    if (a) renderGrip(kb, { prev: b ? a : null, next: b || a, range, lh: def.lh, title: `Tastatur: ${prettyChord(showNext ? nxt : cur)}` });
    else kb.replaceChildren();
  };
  count.textContent = 'Einzählen';
  show(-1, 0);

  const clock = createClock(ctx, {
    bpm, totalSteps: (1 + n) * 8,
    onStep: (s) => { if (s.eighth % 2 === 0) audio.click(s.time, s.beat === 0, s.bar === 0 ? 0.8 : 0.6); },
  });
  clock.start(ctx.currentTime + 0.2);
  let last = '';
  const stop = frameLoop(() => {
    const pos = clock.position(audio.audibleNow());
    if (pos < 0) return;
    const step = Math.floor(pos), bar = Math.floor(step / 8), beat = Math.floor((step % 8) / 2);
    const key = `${bar}:${beat}`;
    if (key === last || bar > n) return;
    last = key;
    setDots(dots, beat);
    const i = bar - 1;
    count.textContent = i < 0 ? 'Einzählen' : `Takt ${i + 1} von ${n}`;
    if (i < 0) {
      // Im Einzähler ab Schlag 3: der erste Akkord kommt „gleich“.
      if (beat >= 2) nextEl.textContent = prettyChord(chords[0]);
      return;
    }
    if (i < n) show(i, beat);
  });
  try {
    await api.wait(clock.done);
  } finally {
    clock.stop();
    stop();
  }
  foot.hidden = true;
  ask.hidden = false;
  ask.querySelector('[data-answer="ok"]').focus({ preventScroll: true });
  const a = await api.wait(waitChoice(ask, 'answer'));
  ask.hidden = true; foot.hidden = false;
  return a === 'ok';
}

/** Runde Kurze Wege. item: { seconds }. */
export async function runWege(api, item) {
  void item;
  const scr = showScreen('wege');
  const level = S.progress.levels.wege;
  song = currentSong();
  const defs = wegeStages(song)[level].filter((d) => d.chords.length);
  if (!defs.length) {
    await modal('Kurze Wege', 'Der Song hat noch keine zwei Akkorde, zwischen denen es zu wechseln gäbe.', [{ label: 'OK', value: 'ok', primary: true }]);
    return;
  }
  const d = today();
  const res = api.result('wege', { blocks: 0, ok: 0, bpmEnd: null, down: false });
  field(scr, 'level').textContent = `· Stufe ${level}`;
  const notes = defs.flatMap((df) => df.chords.flatMap((c) => {
    const v = grip(c);
    return df.lh ? allKeys(v) : [...(v?.rh || [])];
  }));
  const range = rangeFor(notes);
  const roundBlocks = {};
  let lastId = null;

  do {
    const id = nextLoop(defs, S.loops, { lastId, today: d, rand, roundBlocks });
    const def = defs.find((x) => x.id === id);
    const loop = getLoop(id);
    const bpm = blockBpm(loop, d);
    field(scr, 'bpm').textContent = `${bpm} BPM · Ziel ${WEGE.target}${bpm < loop.bpm ? ' · Aufwärmen' : ''}`;
    const ok = await playBlock(api, scr, { def, chords: blockChords(def), bpm, range });
    const updated = applyWege(loop, ok, d);
    await putLoop(updated);
    res.blocks++;
    if (ok) res.ok++;
    if (updated.bpm < loop.bpm) res.down = true;
    res.bpmEnd = updated.bpm;
    roundBlocks[id] = (roundBlocks[id] || 0) + 1;
    lastId = id;
  } while (api.timeLeft() > 0);

  if (level < WEGE.maxLevel && stageSolid(defs, S.loops) && mayAsk('wege')) {
    const yes = await modal(`Bereit für Stufe ${level + 1}?`, `Alle Loops dieser Stufe sitzen. ${LEVEL_NEWS[level + 1]}`,
      [{ label: 'Später', value: 'no' }, { label: 'Ja', value: 'yes', primary: true }]);
    if (yes === 'yes') await levelUp('wege', WEGE.maxLevel); else await askedLater('wege');
  }
}
