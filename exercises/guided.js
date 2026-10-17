/* exercises/guided.js — Geführt (S9): der Song in Phrasen, am Stück gelernt.
   Warten  Akkord zeigen, das Mikrofon hört zu, weiter sobald er liegt —
           kein Tippen. Nach 4 s zeigt die Tastatur den Griff, nach 8 s
           klingt er.
   Tempo   Einzähler und Klick, ein Akkord pro Takt; das Mikrofon hakt die
           Takte ab. Fehler stoppen nicht. Danach wird der Übergang, der
           hakte, kurz gependelt (wieder im Warten-Modus).
   Ohne Mikrofon: im Warten-Modus tippen (oder Leertaste, Pfeil, Pedal mit
   Bluetooth), im Tempo-Modus am Ende „Drangeblieben“ / „Rausgefallen“.
   Regeln rein in phrases.js; gehört wird über mic.js (eigener Erkenner
   hear.js, essentia.js oder beide, umschaltbar). */

import * as audio from '../audio.js';
import * as mic from '../mic.js';
import { chordById } from '../chords.js';
import { EAR } from '../ear.js';
import { SONG } from '../song-perfect-ruin.js';
import {
  GUIDE, phraseDefs, waitSequence, tempoBars, applyWait, applyTempo, repairPairs, nextPhrase, beatSec,
} from '../phrases.js';
import { S, today, getPhrase, putPhrase, saveSettings } from '../store.js';
import { $, field, showScreen, waitChoice, makeDots, setDots, frameLoop, modal, setToggle } from '../ui.js';
import { createClock } from '../clock.js';
import { renderKeyboard, rangeFor, chordMarks, transitionMarks } from '../keyboard.js';

const ADVANCE_KEYS = new Set([' ', 'Enter', 'ArrowRight', 'ArrowDown', 'PageDown']);
/** Eingang hinkt der Audiouhr hinterher (Mikro-Latenz, Fenstermitte). */
const INPUT_LAG = 0.12;
/** So früh vor der Eins darf der Akkord schon liegen (Tempo-Modus). */
const EARLY = 0.5;

const sym = (id) => chordById(id).symbol;

/** Bis die Audiouhr `sec` weiter ist (steht in der Pause mit). */
function waitAudio(api, sec) {
  const end = audio.now() + sec;
  let stop = () => {};
  const p = new Promise((res) => { stop = frameLoop(() => { if (audio.now() >= end) res(); }); });
  return api.wait(p).finally(stop);
}

/** Das Mikrofon einmal je Frame lesen. → { levels, fresh } oder null. */
const hearNow = (want) => mic.sample(audio.now(), want);

/** Gilt nur kurz nach einem Anschlag: im Ausklang verschieben sich die
 *  Anteile, und ein falscher Griff sähe irgendwann richtig aus. */
const judging = (smp) => !!smp && smp.sinceOnset <= EAR.judge;
const matches = (smp, id, prevId) => judging(smp) && smp.is(id, prevId);

function makeUi(scr, range) {
  const els = {
    level: field(scr, 'level'), count: field(scr, 'count'), bpm: field(scr, 'bpm'),
    strip: field(scr, 'strip'), now: field(scr, 'now'), next: field(scr, 'next'),
    kb: field(scr, 'kb'), dots: field(scr, 'dots'), status: field(scr, 'status'), ask: field(scr, 'ask'),
    micBtn: scr.querySelector('[data-toggle="mic"]'),
  };
  let kbKey = '';
  return {
    ...els,
    say(text, good = false) {
      els.status.textContent = text;
      els.status.classList.toggle('good', good);
    },
    /** Akkordleiste: höchstens 9 Felder rund um den aktuellen. marks[i]: 'hit' | 'miss'. */
    strip(items, cur, marks = []) {
      const from = Math.max(0, Math.min(cur - 2, items.length - 9));
      els.strip.replaceChildren(...items.slice(from, from + 9).map((id, k) => {
        const i = from + k;
        const li = document.createElement('li');
        li.className = [i === cur ? 'now' : i === cur + 1 ? 'next' : '', marks[i] || ''].join(' ').trim();
        const b = document.createElement('b'); b.textContent = sym(id);
        li.append(b);
        return li;
      }));
    },
    chords(cur, nxt) {
      els.now.textContent = cur ? sym(cur) : '';
      els.now.classList.remove('got');
      els.next.textContent = nxt ? sym(nxt) : '';
    },
    got() { els.now.classList.add('got'); },
    /** Tastatur nur neu zeichnen, wenn sich etwas ändert. */
    kb(what) {
      const key = what ? what.join('>') : '-';
      if (key === kbKey) return;
      kbKey = key;
      let marks = new Map();
      if (what?.length === 1) marks = chordMarks(chordById(what[0]), { lh: false });
      else if (what?.length === 2) marks = transitionMarks(what[0], what[1], { lh: false });
      const title = what ? `Tastatur: ${sym(what[what.length - 1])}` : 'Tastatur';
      renderKeyboard(els.kb, { lo: range[0], hi: range[1], marks, title });
    },
  };
}

/* ---------- Mikrofon --------------------------------------------------- */

/** Beim ersten Mal fragen; dann öffnen oder still ohne weiter. */
async function ensureMic(ui) {
  if (!mic.supported()) {
    setToggle(ui.micBtn, false, true);
    return;
  }
  if (S.settings.mic == null) {
    const a = await modal('Mit Mikrofon üben?',
      'Pianino hört zu, ob der Akkord liegt, und geht dann von selbst weiter – du musst nicht aufs Handy tippen. '
      + 'Es wird nichts aufgenommen oder gespeichert.',
      [{ label: 'Ohne', value: 'no' }, { label: 'Mikrofon an', value: 'yes', primary: true }]);
    S.settings.mic = a === 'yes';
    await saveSettings();
  }
  await syncMic(ui);
}

/** Schalter „Mikro“ umsetzen (gilt ab dem nächsten Durchgang). */
async function syncMic(ui) {
  if (S.settings.mic && !mic.isOpen()) ui.say('Mikrofon und Hörer werden vorbereitet …');
  if (S.settings.mic && !mic.isOpen() && !(await mic.open())) {
    S.settings.mic = false;
    await saveSettings();
    ui.say('Kein Mikrofon erreichbar – dann tippen zum Weitergehen.');
  }
  if (!S.settings.mic && mic.isOpen()) mic.close();
  setToggle(ui.micBtn, !!S.settings.mic, !mic.supported());
  for (const b of document.querySelectorAll('[data-ear]')) b.textContent = `Hören: ${mic.earMode()}`;
}

/* ---------- Warten ----------------------------------------------------- */

/** Warten, bis `id` liegt (oder getippt wird). → { sec, helped } */
async function waitFor(api, scr, ui, { id, prevId, showKb }) {
  const t0 = audio.now();
  const listening = mic.isOpen();
  let okRun = 0, hinted = showKb, played = 0, helped = false, shown = '', warned = false, stop = () => {};
  ui.say(listening ? `${sym(id)} – ich höre zu.` : `${sym(id)} – dann tippen (oder Leertaste).`);
  const ac = new AbortController();
  const p = new Promise((resolve) => {
    const finish = (tap) => resolve({ sec: audio.now() - t0, helped: helped || (tap && listening) });
    scr.addEventListener('click', (e) => { if (!e.target.closest('button')) finish(true); }, { signal: ac.signal });
    document.addEventListener('keydown', (e) => {
      if (ADVANCE_KEYS.has(e.key) && $('#pause').hidden && $('#modal').hidden && !e.target.closest?.('button')) {
        e.preventDefault();
        finish(true);
      }
    }, { signal: ac.signal });
    stop = frameLoop(() => {
      const t = audio.now(), waited = t - t0;
      if (!hinted && waited >= GUIDE.hintAfter) hinted = true;
      if (waited >= GUIDE.playAfter * (played + 1)) {
        played++;
        helped = true;
        audio.chord(chordById(id), t + 0.05, { dur: 1.5, lh: false });
        mic.ignoreUntil(t + 2.2);
        ui.say(listening ? `So klingt ${sym(id)}. Spiel ihn nach.` : `So klingt ${sym(id)}.`);
      }
      const smp = listening ? hearNow([id]) : null;
      if (listening && mic.earMode() !== 'eigen' && !warned && mic.earStatus() === 'failed') {
        warned = true;
        ui.say(mic.earMode() === 'beide' ? 'essentia.js ließ sich nicht laden – es hört nur der eigene Erkenner.'
          : 'essentia.js ließ sich nicht laden. „Hören“ auf „eigen“ stellen.');
      }
      if (smp?.fresh && matches(smp, id, prevId)) {
        if (++okRun >= 2) finish(false); // zwei Auswertungen in Folge
      } else if (smp?.fresh) {
        okRun = 0;
        // Neutral sagen, was ankommt — nie „falsch“.
        if (smp?.fresh && judging(smp) && smp.chord && smp.chord !== shown) { shown = smp.chord; ui.say(`Ich höre ${smp.chord} – gesucht ist ${sym(id)}.`); }
      }
      ui.kb(hinted ? (prevId && prevId !== id ? [prevId, id] : [id]) : null);
    });
  });
  try {
    return await api.wait(p);
  } finally {
    stop();
    ac.abort();
  }
}

/** Ein Durchgang im Warten-Modus. → { changes, helped, lastId } */
async function waitPass(api, scr, ui, def, state, { continued, prevId }) {
  const seq = waitSequence(def, { continued });
  const changes = [];
  let helped = false, prev = prevId;
  // Hilfen ausblenden: Tastenbild sofort nur in den ersten Durchgängen.
  const showKb = (state.passes || 0) < GUIDE.cleanToTempo || !mic.isOpen();
  makeDots(ui.dots, 0);
  for (let i = 0; i < seq.length; i++) {
    ui.count.textContent = `Akkord ${i + 1} von ${seq.length}`;
    ui.strip(seq, i);
    ui.chords(seq[i], seq[i + 1]);
    const r = await waitFor(api, scr, ui, { id: seq[i], prevId: prev, showKb });
    ui.got();
    if (prev) changes.push({ from: prev, to: seq[i], sec: r.sec });
    helped ||= r.helped;
    prev = seq[i];
  }
  return { changes, helped, lastId: prev };
}

/** Kurz pendeln: a ↔ b im Warten-Modus, bis 4 Wechsel in einem Schlag
 *  sitzen oder 30 s um sind. */
async function repair(api, scr, ui, [a, b], bpm) {
  const t0 = audio.now();
  const limit = beatSec(bpm);
  let clean = 0, prev = null, target = a;
  ui.level.textContent = `· Übergang ${sym(a)} → ${sym(b)}`;
  ui.count.textContent = 'kurz pendeln';
  while (clean < GUIDE.repairChanges && audio.now() - t0 < GUIDE.repairSeconds) {
    ui.strip([a, b], target === a ? 0 : 1);
    ui.chords(target, target === a ? b : a);
    const r = await waitFor(api, scr, ui, { id: target, prevId: prev, showKb: true });
    ui.got();
    if (prev && r.sec <= limit && !r.helped) clean++;
    prev = target;
    target = target === a ? b : a;
  }
  ui.say(clean >= GUIDE.repairChanges ? `${sym(a)} → ${sym(b)} sitzt besser.` : 'Gut, weiter im Stück.', clean >= GUIDE.repairChanges);
  await waitAudio(api, 1.2);
}

/* ---------- Tempo ------------------------------------------------------ */

/** Ein Durchgang im Tempo. → { errors, missed, bars } */
async function tempoPass(api, scr, ui, def, bpm, help) {
  const bars = tempoBars(def), n = bars.length;
  const listening = mic.isOpen();
  const ctx = audio.getCtx();
  const barDur = (60 / bpm) * 4;
  const hit = new Array(n).fill(false), streak = new Array(n).fill(0);
  makeDots(ui.dots, 4);
  ui.count.textContent = 'Einzählen';
  ui.strip(bars, -1);
  ui.chords(null, bars[0]);
  ui.kb(null);
  ui.say(listening ? 'Ein Akkord pro Takt. Ich höre mit – nicht anhalten.' : 'Ein Akkord pro Takt. Nicht anhalten.');

  const clock = createClock(ctx, {
    bpm, totalSteps: (1 + n) * 8,
    onStep: (s) => {
      if (s.eighth % 2 === 0 && (s.bar === 0 || S.settings.click)) audio.click(s.time, s.beat === 0, s.bar === 0 ? 0.8 : 0.6, true);
    },
  });
  clock.start(ctx.currentTime + 0.2);
  let last = '', kbWhat = null;
  const stop = frameLoop(() => {
    // Hören: Takt k zählt, sobald sein Akkord erkannt ist — ab EARLY s vor
    // seiner Eins bis zum Taktende.
    const rel0 = audio.now() - INPUT_LAG - clock.t0 - barDur, kk = Math.floor(rel0 / barDur);
    const smp = listening ? hearNow([bars[Math.max(0, Math.min(n - 1, kk))], bars[Math.max(0, Math.min(n - 1, kk + 1))]]) : null;
    if (smp?.fresh) {
      const rel = audio.now() - INPUT_LAG - clock.t0 - barDur;
      const k0 = Math.floor(rel / barDur);
      for (const k of [k0, k0 + 1]) {
        if (k < 0 || k >= n || hit[k] || rel < k * barDur - EARLY) continue;
        // Gleicher Akkord wie im Takt davor: darf liegen bleiben.
        if (k > 0 && bars[k] === bars[k - 1] && hit[k - 1] && rel >= k * barDur) { hit[k] = true; continue; }
        streak[k] = matches(smp, bars[k], k > 0 ? bars[k - 1] : null) ? streak[k] + 1 : 0;
        if (streak[k] >= 2) hit[k] = true;
      }
    }
    ui.kb(kbWhat);
    // Anzeige folgt dem, was gerade zu hören ist.
    const pos = clock.position(audio.audibleNow());
    if (pos < 0) return;
    const step = Math.floor(pos), bar = Math.floor(step / 8), beat = Math.floor((step % 8) / 2);
    const key = `${bar}:${beat}:${hit.join()}`;
    if (key === last || bar > n) return;
    last = key;
    setDots(ui.dots, beat);
    const i = bar - 1;
    if (i < 0) { ui.count.textContent = 'Einzählen'; return; }
    if (i >= n) return;
    ui.count.textContent = `Takt ${i + 1} von ${n}`;
    ui.chords(bars[i], beat >= 2 ? bars[i + 1] : null);
    // Tastenbild nur, solange die Phrase noch nicht sitzt; ab Schlag 3 der Weg.
    kbWhat = !help ? null : beat >= 2 && bars[i + 1] && bars[i + 1] !== bars[i] ? [bars[i], bars[i + 1]] : [bars[i]];
    if (hit[i]) ui.got();
    ui.strip(bars, i, hit.map((h, k) => (h ? 'hit' : listening && k < i ? 'miss' : '')));
  });
  try {
    await api.wait(clock.done);
  } finally {
    clock.stop();
    stop();
  }
  if (!listening) {
    ui.ask.hidden = false;
    ui.ask.querySelector('[data-answer="ok"]').focus({ preventScroll: true });
    const a = await api.wait(waitChoice(ui.ask, 'answer'));
    ui.ask.hidden = true;
    return { errors: a === 'ok' ? 0 : 2, missed: [], bars };
  }
  const missed = hit.map((h, k) => (h ? -1 : k)).filter((k) => k >= 0);
  ui.strip(bars, -1, hit.map((h) => (h ? 'hit' : 'miss')));
  return { errors: missed.length, missed, bars };
}

/* ---------- Runde ------------------------------------------------------ */

function tempoNews(name, out, bpm) {
  if (out.nowSolid) return [`${name} sitzt!`, true];
  if (out.clean && out.up) return [`Sauber! Nächstes Mal ${bpm} BPM.`, true];
  if (out.clean) return ['Sauber!', true];
  if (out.toWait) return ['Wir nehmen das Tempo raus und gehen es ohne Klick durch.', false];
  if (out.down) return [`Etwas langsamer: ${bpm} BPM.`, false];
  return ['Fast. Gleich noch einmal.', false];
}

function waitNews(out, state, changes) {
  if (out.toTempo) return [`Sitzt ohne Tempo – jetzt mit Klick (${state.bpm} BPM).`, true];
  if (out.clean) return [`Sauber! Noch ${GUIDE.cleanToTempo - state.streak}× ohne Hilfe, dann mit Klick.`, true];
  const slow = changes.reduce((a, c) => (!a || c.sec > a.sec ? c : a), null);
  return [slow ? `Langsamster Wechsel: ${sym(slow.from)} → ${sym(slow.to)}. Noch einmal.` : 'Noch einmal.', false];
}

/** Runde Geführt. item: { seconds }. */
export async function runGuided(api, item) {
  void item;
  const scr = showScreen('guided');
  const defs = phraseDefs(SONG);
  const range = rangeFor(defs.flatMap((d) => d.chords.flatMap((id) => chordById(id).rh)));
  const ui = makeUi(scr, range);
  ui.ask.hidden = true;
  const d = today();
  const res = api.result('guided', { passes: 0, clean: 0, solid: [], last: null, bpm: null, mode: null });
  ui.kb(null);
  ui.chords(null, null);
  await ensureMic(ui);

  const roundPasses = {};
  let prevId = null, lastPhrase = null;
  try {
    do {
      await syncMic(ui);
      const pick = nextPhrase(defs, S.phrases, { today: d, roundPasses });
      const def = defs.find((x) => x.id === pick.id);
      const state = getPhrase(def.id);
      ui.level.textContent = `· ${def.name}${pick.review ? ' (Wiederholung)' : ''}`;
      let clean, news, after;
      if (state.mode === 'tempo') {
        ui.bpm.textContent = `${state.bpm} BPM`;
        const r = await tempoPass(api, scr, ui, def, state.bpm, !state.solid);
        const out = applyTempo(state, { errors: r.errors, today: d });
        await putPhrase(out.state);
        clean = out.clean;
        if (out.nowSolid) res.solid.push(def.name);
        news = tempoNews(def.name, out, out.state.bpm);
        after = r.errors && mic.isOpen() && !out.toWait ? repairPairs(r.bars, r.missed)[0] : null;
        prevId = null;
        res.bpm = out.state.bpm;
        res.mode = out.state.mode;
      } else {
        ui.bpm.textContent = 'ohne Tempo';
        const continued = lastPhrase === def.id && prevId === waitSequence(def)[0];
        const r = await waitPass(api, scr, ui, def, state, { continued, prevId });
        const out = applyWait(state, { changes: r.changes, helped: r.helped, today: d });
        await putPhrase(out.state);
        clean = out.clean;
        news = waitNews(out, out.state, r.changes);
        prevId = r.lastId;
        res.bpm = out.state.bpm;
        res.mode = out.state.mode;
      }
      ui.say(news[0], news[1]);
      roundPasses[def.id] = (roundPasses[def.id] || 0) + 1;
      res.passes++;
      if (clean) res.clean++;
      res.last = def.name;
      lastPhrase = def.id;
      api.countUp();
      await waitAudio(api, 1.8);
      if (after && api.timeLeft() > 0) await repair(api, scr, ui, after, getPhrase(def.id).bpm || GUIDE.changeBpm);
    } while (api.timeLeft() > 0);
  } finally {
    mic.close();
  }
}
