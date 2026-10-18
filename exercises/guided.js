/* exercises/guided.js — Geführt (S9): der Song in Phrasen, am Stück gelernt.
   Ein Gerüst für alles (Design „kombiniert“, mit einer Klavierlehrerin
   abgestimmt): oben die Phrase als Pillen, links der Akkord groß und „dann …“
   halb so groß, rechts so viel Hilfe, wie der Übergang gerade braucht.
   Warten  Das Mikrofon hört zu, weiter sobald der Akkord liegt. Hilfe je
           Übergang in drei Stufen (phrases.js): 1 Tastenbild + Bewegungssatz
           + Bass, 2 Bewegungssatz (Tastenbild nach 4 s), 3 nur der Name
           (Hilfe nach 6 s). Vorspielen nach 8 bzw. 12 s. Hilfe selbst holen
           geht jederzeit und ist kein Fehler.
   Tempo   Einzähler und Klick, ein Akkord pro Takt, KEINE Bewertung im Lauf:
           der aktuelle Akkord gedämpft, der nächste wird angekündigt (sanft
           ab 2 Schlägen bzw. 4 s, deutlich ab 1 Schlag bzw. 2 s vor der Eins).
           Danach: hakte etwas → Angebot, den Übergang zu pendeln; sauber →
           kurz „Schön ruhig.“, schneller nur als Angebot.
   Ohne Mikrofon: im Warten-Modus tippen (oder Leertaste, Pfeil, Pedal mit
   Bluetooth), im Tempo-Modus am Ende „Drangeblieben“ / „Rausgefallen“.
   Regeln rein in phrases.js; gehört wird über mic.js. */

import * as audio from '../audio.js';
import * as mic from '../mic.js';
import { chordById, moveText, bassText } from '../chords.js';
import { EAR } from '../ear.js';
import { SONG } from '../song-perfect-ruin.js';
import {
  GUIDE, phraseDefs, waitSequence, tempoBars, applyWait, applyTempo, applyChanges, repairPairs, nextPhrase,
  beatSec, stageOf, transitionKeys,
} from '../phrases.js';
import { S, today, getPhrase, putPhrase, saveSettings } from '../store.js';
import { $, field, showScreen, waitChoice, frameLoop, modal, setToggle } from '../ui.js';
import { createClock } from '../clock.js';
import { renderKeyboard, rangeFor, chordMarks, transitionMarks } from '../keyboard.js';

const ADVANCE_KEYS = new Set([' ', 'Enter', 'ArrowRight', 'ArrowDown', 'PageDown']);
/** Eingang hinkt der Audiouhr hinterher (Mikro-Latenz, Fenstermitte). */
const INPUT_LAG = 0.12;
/** So früh vor der Eins darf der Akkord schon liegen (Tempo-Modus). */
const EARLY = 0.5;
/** Nach dem Durchgang geht es nach so vielen Sekunden von selbst weiter. */
const AFTER_AUTO = 6;

const sym = (id) => chordById(id).symbol;

/** Bis die Audiouhr `sec` weiter ist (steht in der Pause mit). */
function waitAudio(api, sec) {
  const end = audio.now() + sec;
  let stop = () => {};
  const p = new Promise((res) => { stop = frameLoop(() => { if (audio.now() >= end) res(); }); });
  return api.wait(p).finally(stop);
}

/** Das Mikrofon einmal je Frame lesen. */
const hearNow = (want) => mic.sample(audio.now(), want);

/** Gilt nur kurz nach einem Anschlag: im Ausklang verschieben sich die
 *  Anteile, und ein falscher Griff sähe irgendwann richtig aus. */
const judging = (smp) => !!smp && smp.sinceOnset <= EAR.judge;
const matches = (smp, id, prevId) => judging(smp) && smp.is(id, prevId);

function makeUi(scr, range) {
  const f = (n) => field(scr, n);
  const els = {
    level: f('level'), bpm: f('bpm'), strip: f('strip'), main: f('main'), now: f('now'), next: f('next'),
    help: scr.querySelector('.g-help'), kb: f('kb'), move: f('move'), bass: f('bass'), helpBtn: f('helpbtn'),
    tempo: f('tempo'), tNow: f('t-now'), tCard: f('t-card'), tLabel: f('t-label'), tNext: f('t-next'),
    after: f('after'), afterTitle: f('after-title'), afterText: f('after-text'), afterButtons: f('after-buttons'),
    afterAuto: f('after-auto'), progress: f('progress'), status: f('status'), ask: f('ask'),
    micBtn: scr.querySelector('[data-toggle="mic"]'),
  };
  let kbKey = '';
  return {
    ...els,
    say(text) { els.status.textContent = text; },
    /** Welche Ansicht: 'wait' | 'tempo' | 'after'. */
    view(v) {
      els.main.hidden = v !== 'wait';
      els.tempo.hidden = v !== 'tempo';
      els.after.hidden = v !== 'after';
    },
    /** Phrase als Pillen, höchstens 8 rund um den aktuellen. */
    strip(items, cur) {
      const from = Math.max(0, Math.min(cur - 2, items.length - 8));
      els.strip.replaceChildren(...items.slice(from, from + 8).map((id, k) => {
        const i = from + k;
        const li = document.createElement('li');
        li.className = i === cur ? 'now' : i === cur + 1 ? 'next' : '';
        li.textContent = sym(id);
        return li;
      }));
    },
    progress(frac) { els.progress.style.width = `${Math.max(0, Math.min(1, frac)) * 100}%`; },
    chords(cur, nxt) {
      els.now.textContent = cur ? sym(cur) : '';
      els.now.classList.remove('got');
      els.next.textContent = nxt ? sym(nxt) : '';
      els.next.parentElement.style.visibility = nxt ? 'visible' : 'hidden';
    },
    /** Erkannt: der Akkord leuchtet kurz warm auf (kein Ton, kein Text). */
    got() { els.now.classList.add('got'); },
    /** Hilfe rechts: kb / move / bass zeigen, Knopf mit Text oder ohne. */
    help({ from, to, kb = false, move = false, bass = false, button = '' }) {
      if (kb) {
        const key = from && from !== to ? `${from}>${to}` : to;
        if (key !== kbKey) {
          kbKey = key;
          const marks = from && from !== to ? transitionMarks(from, to, { lh: false }) : chordMarks(chordById(to), { lh: false });
          renderKeyboard(els.kb, { lo: range[0], hi: range[1], marks, title: `Tastatur: ${sym(to)}` });
        }
      }
      els.kb.hidden = !kb;
      els.move.hidden = !move;
      if (move) els.move.textContent = moveText(from, to);
      els.bass.hidden = !bass;
      if (bass) els.bass.textContent = bassText(from, to);
      els.help.classList.toggle('big', move && !kb);
      els.helpBtn.hidden = !button;
      if (button) els.helpBtn.textContent = button;
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
}

/* ---------- Warten ----------------------------------------------------- */

/** Warten, bis `id` liegt (oder getippt wird), mit der Hilfe der Stufe.
 *  → { sec, auto, self } — auto: Hilfe kam von selbst, self: selbst geholt. */
async function waitFor(api, scr, ui, { id, prevId, stage }) {
  const t0 = audio.now();
  const listening = mic.isOpen();
  const plan = GUIDE.help[stage];
  let okRun = 0, kbShown = stage === 1, played = 0, auto = false, self = false, shown = '', warned = false, stop = () => {};
  const paint = () => ui.help({
    from: prevId, to: id, kb: kbShown,
    move: stage <= 2 || kbShown, bass: stage <= 2 || kbShown,
    button: kbShown ? '' : stage === 2 ? 'Tastenbild zeigen' : 'Hilfe',
  });
  paint();
  ui.say(listening ? 'Ich höre zu.' : 'Spielen, dann tippen (oder Leertaste).');
  const ac = new AbortController();
  const p = new Promise((resolve) => {
    const finish = (tap) => resolve({ sec: audio.now() - t0, auto, self: self || (tap && listening) });
    ui.helpBtn.addEventListener('click', () => { self = true; kbShown = true; paint(); }, { signal: ac.signal });
    scr.addEventListener('click', (e) => { if (!e.target.closest('button')) finish(true); }, { signal: ac.signal });
    document.addEventListener('keydown', (e) => {
      if (ADVANCE_KEYS.has(e.key) && $('#pause').hidden && $('#modal').hidden && !e.target.closest?.('button')) {
        e.preventDefault();
        finish(true);
      }
    }, { signal: ac.signal });
    stop = frameLoop(() => {
      const t = audio.now(), waited = t - t0;
      if (!kbShown && waited >= plan.kb) { kbShown = true; auto = true; paint(); }
      if (waited >= plan.play * (played + 1)) {
        played++;
        auto = true;
        audio.chord(chordById(id), t + 0.05, { dur: 1.5, lh: false });
        mic.ignoreUntil(t + 2.2);
        ui.say(listening ? `So klingt ${sym(id)}. Spiel ihn nach.` : `So klingt ${sym(id)}.`);
      }
      const smp = listening ? hearNow([id]) : null;
      if (listening && mic.earMode() !== 'eigen' && !warned && mic.earStatus() === 'failed') {
        warned = true;
        ui.say(mic.earMode() === 'beide' ? 'essentia.js ließ sich nicht laden – es hört nur der eigene Erkenner.'
          : 'essentia.js ließ sich nicht laden. Unter „Über“ „Hören“ auf „eigen“ stellen.');
      }
      if (smp?.fresh && matches(smp, id, prevId)) {
        if (++okRun >= 2) finish(false); // zwei Auswertungen in Folge
      } else if (smp?.fresh) {
        okRun = 0;
        // Neutral sagen, was ankommt — nie „falsch“.
        if (judging(smp) && smp.chord && smp.chord !== shown) { shown = smp.chord; ui.say(`Ich höre ${smp.chord} – noch nicht ${sym(id)}.`); }
      }
    });
  });
  try {
    return await api.wait(p);
  } finally {
    stop();
    ac.abort();
  }
}

/** Ein Durchgang im Warten-Modus. → { changes, lastId } */
async function waitPass(api, scr, ui, def, state, { continued, prevId, d }) {
  const seq = waitSequence(def, { continued });
  const full = waitSequence(def);
  const changes = [];
  let prev = prevId;
  ui.view('wait');
  for (let i = 0; i < seq.length; i++) {
    const at = full.length - seq.length + i;
    ui.strip(full, at);
    ui.progress(at / Math.max(1, full.length - 1));
    ui.chords(seq[i], seq[i + 1]);
    // Erster Akkord ohne Vorgänger: so viel Hilfe wie der schwächste
    // Übergang der Phrase (dann steht der Griff dabei, solange etwas hakt).
    const stage = prev ? stageOf(state, prev, seq[i], d) : Math.min(...transitionKeys(def).map((k) => stageOf(state, ...k.split('>'), d)));
    const r = await waitFor(api, scr, ui, { id: seq[i], prevId: prev, stage });
    ui.got();
    if (prev) changes.push({ from: prev, to: seq[i], ...r });
    prev = seq[i];
  }
  return { changes, lastId: prev };
}

/** Kurz pendeln: a ↔ b, bis 4 Wechsel in einem Schlag sitzen oder 30 s um
 *  sind. → die Wechsel (zählen für die Stufen dieser Übergänge). */
async function repair(api, scr, ui, [a, b], bpm, state, d) {
  const t0 = audio.now();
  const limit = beatSec(bpm);
  const changes = [];
  let clean = 0, prev = null, target = a;
  ui.view('wait');
  ui.level.textContent = `${sym(a)} ↔ ${sym(b)}`;
  ui.bpm.textContent = 'pendeln';
  while (clean < GUIDE.repairChanges && audio.now() - t0 < GUIDE.repairSeconds) {
    ui.strip([a, b], target === a ? 0 : 1);
    ui.progress(Math.min(1, (audio.now() - t0) / GUIDE.repairSeconds));
    ui.chords(target, target === a ? b : a);
    const stage = prev ? stageOf(applyChanges(state, changes, d), prev, target, d) : 1;
    const r = await waitFor(api, scr, ui, { id: target, prevId: prev, stage });
    ui.got();
    if (prev) {
      changes.push({ from: prev, to: target, ...r });
      if (r.sec <= limit && !r.auto && !r.self) clean++;
    }
    prev = target;
    target = target === a ? b : a;
  }
  ui.say(clean >= GUIDE.repairChanges ? `${sym(a)} → ${sym(b)} sitzt besser.` : 'Gut, weiter im Stück.');
  await waitAudio(api, 1.2);
  return changes;
}

/* ---------- Tempo ------------------------------------------------------ */

/** Ein Durchgang im Tempo, ohne Bewertung im Lauf. → { errors, missed, bars } */
async function tempoPass(api, ui, def, bpm) {
  const bars = tempoBars(def), n = bars.length;
  const listening = mic.isOpen();
  const ctx = audio.getCtx();
  const beat = 60 / bpm, barDur = beat * 4;
  // Ankündigung zeitbasiert, damit sie bei jedem Tempo passt.
  const strongLead = Math.max(beat, 2), softLead = Math.max(2 * beat, 4);
  const hit = new Array(n).fill(false), streak = new Array(n).fill(0);
  ui.view('tempo');
  ui.strip(bars, -1);
  ui.progress(0);
  ui.tNow.textContent = '';
  ui.say(listening ? 'Ein Akkord pro Takt. Einfach weiterspielen.' : 'Ein Akkord pro Takt. Nicht anhalten.');

  const clock = createClock(ctx, {
    bpm, totalSteps: (1 + n) * 8,
    onStep: (s) => {
      if (s.eighth % 2 === 0 && (s.bar === 0 || S.settings.click)) audio.click(s.time, s.beat === 0, s.bar === 0 ? 0.8 : 0.6, true);
    },
  });
  clock.start(ctx.currentTime + 0.2);
  let last = '';
  const stop = frameLoop(() => {
    // Hören (nur für die Auswertung danach): Takt k zählt, sobald sein Akkord
    // erkannt ist — ab EARLY s vor seiner Eins bis zum Taktende.
    const rel = audio.now() - INPUT_LAG - clock.t0 - barDur, k0 = Math.floor(rel / barDur);
    const smp = listening ? hearNow([bars[Math.max(0, Math.min(n - 1, k0))], bars[Math.max(0, Math.min(n - 1, k0 + 1))]]) : null;
    if (smp?.fresh) {
      for (const k of [k0, k0 + 1]) {
        if (k < 0 || k >= n || hit[k] || rel < k * barDur - EARLY) continue;
        // Gleicher Akkord wie im Takt davor: darf liegen bleiben.
        if (k > 0 && bars[k] === bars[k - 1] && hit[k - 1] && rel >= k * barDur) { hit[k] = true; continue; }
        streak[k] = matches(smp, bars[k], k > 0 ? bars[k - 1] : null) ? streak[k] + 1 : 0;
        if (streak[k] >= 2) hit[k] = true;
      }
    }
    // Anzeige folgt dem, was gerade zu hören ist.
    const tPos = audio.audibleNow() - clock.t0;
    if (tPos < 0) return;
    const bar = Math.floor(tPos / barDur), i = bar - 1;
    if (bar > n) return;
    const left = (bar + 1) * barDur - tPos; // bis zur nächsten Eins
    const nextId = i < 0 ? bars[0] : bars[i + 1];
    const same = i >= 0 && nextId === bars[i]; // gleicher Akkord: nur liegen lassen
    const phase = !nextId || same ? '' : left <= strongLead ? 'now' : left <= softLead ? 'soon' : '';
    const key = `${bar}:${phase}`;
    ui.progress(Math.max(0, tPos - barDur) / (n * barDur));
    if (key === last) return;
    last = key;
    ui.strip(bars, i);
    ui.tNow.textContent = i < 0 ? '' : sym(bars[i]);
    ui.tCard.className = `g-card ${phase}`;
    ui.tLabel.textContent = same ? 'liegen lassen' : phase === 'now' ? 'gleich – auf der Eins' : 'dann';
    ui.tNext.textContent = nextId && !same ? sym(nextId) : '';
    if (i < 0) ui.say('Einzählen …');
    else if (i === 0) ui.say(listening ? 'Ein Akkord pro Takt. Einfach weiterspielen.' : 'Ein Akkord pro Takt. Nicht anhalten.');
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
  return { errors: missed.length, missed, bars };
}

/* ---------- Nach dem Durchgang ----------------------------------------- */

/** Rückblick nach einem Tempo-Durchgang: Titel, Satz, Knöpfe; der erste
 *  Knopf gilt nach AFTER_AUTO s von selbst (kein Tippen nötig). → value */
async function afterPass(api, ui, { title, text = '', buttons }) {
  ui.view('after');
  ui.afterTitle.textContent = title;
  ui.afterText.textContent = text;
  ui.afterText.hidden = !text;
  ui.afterButtons.replaceChildren(...buttons.map((b, k) => {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = `btn ${k === 0 ? 'btn-primary' : 'btn-secondary'}`;
    el.textContent = b.label;
    el.dataset.after = b.value;
    return el;
  }));
  ui.afterAuto.textContent = `Geht in ${AFTER_AUTO} Sekunden von selbst mit „${buttons[0].label}“ weiter.`;
  ui.say('');
  return api.wait(Promise.race([
    waitChoice(ui.afterButtons, 'after'),
    waitAudio(api, AFTER_AUTO).then(() => buttons[0].value),
  ]));
}

/* ---------- Runde ------------------------------------------------------ */

/** Runde Geführt. item: { seconds }. */
export async function runGuided(api, item) {
  void item;
  const scr = showScreen('guided');
  const defs = phraseDefs(SONG);
  const range = rangeFor(defs.flatMap((df) => df.chords.flatMap((id) => chordById(id).rh)));
  const ui = makeUi(scr, range);
  ui.ask.hidden = true;
  ui.view('wait');
  const d = today();
  const res = api.result('guided', { passes: 0, clean: 0, solid: [], last: null, bpm: null, mode: null });
  ui.chords(null, null);
  ui.help({ to: defs[0].chords[0] });
  await ensureMic(ui);

  const roundPasses = {};
  let prevId = null, lastPhrase = null;
  try {
    do {
      await syncMic(ui);
      const pick = nextPhrase(defs, S.phrases, { today: d, roundPasses });
      const def = defs.find((x) => x.id === pick.id);
      let state = getPhrase(def.id);
      ui.level.textContent = `${def.name}${pick.review ? ' · Wiederholung' : ''}`;
      let clean;
      if (state.mode === 'tempo') {
        ui.bpm.textContent = `${state.bpm} BPM`;
        const r = await tempoPass(api, ui, def, state.bpm);
        const out = applyTempo(state, { errors: r.errors, today: d });
        state = out.state;
        clean = out.clean;
        if (out.nowSolid) res.solid.push(def.name);
        prevId = null;
        const pair = r.errors && mic.isOpen() && !out.toWait ? repairPairs(r.bars, r.missed)[0] : null;
        if (pair) {
          const v = await afterPass(api, ui, {
            title: 'Phrase geschafft.',
            text: `${sym(pair[0])} → ${sym(pair[1])} üben wir kurz – 30 Sekunden, ohne Klick.`,
            buttons: [{ label: `${sym(pair[0])} → ${sym(pair[1])} pendeln`, value: 'repair' }, { label: 'Lieber gleich weiter', value: 'go' }],
          });
          if (v === 'repair') state = applyChanges(state, await repair(api, scr, ui, pair, state.bpm || GUIDE.changeBpm, state, d), d);
        } else if (out.toWait) {
          await afterPass(api, ui, { title: 'Wir nehmen das Tempo raus.', text: 'Erst noch einmal ohne Klick, in Ruhe.', buttons: [{ label: 'Weiter', value: 'go' }] });
        } else if (out.up) {
          const v = await afterPass(api, ui, {
            title: out.nowSolid ? `${def.name} sitzt!` : 'Schön ruhig.',
            text: `Magst du es mit ${state.bpm} BPM probieren?`,
            buttons: [{ label: `Weiter mit ${state.bpm}`, value: 'up' }, { label: `Bei ${state.bpm - GUIDE.up} bleiben`, value: 'stay' }],
          });
          if (v === 'stay') state = { ...state, bpm: state.bpm - GUIDE.up };
        } else {
          await afterPass(api, ui, {
            title: out.nowSolid ? `${def.name} sitzt!` : out.clean ? 'Schön ruhig.' : 'Gut drangeblieben.',
            buttons: [{ label: 'Weiter', value: 'go' }],
          });
        }
        await putPhrase(state);
      } else {
        ui.bpm.textContent = 'ohne Tempo';
        const continued = lastPhrase === def.id && prevId === waitSequence(def)[0];
        const r = await waitPass(api, scr, ui, def, state, { continued, prevId, d });
        const out = applyWait(state, { changes: r.changes, keys: transitionKeys(def), today: d });
        state = out.state;
        await putPhrase(state);
        clean = out.clean;
        prevId = r.lastId;
        if (out.toTempo) {
          ui.say(out.fast ? `Das sitzt schon – gleich mit Klick (${state.bpm} BPM).` : `Alle Wechsel sitzen – jetzt mit Klick (${state.bpm} BPM).`);
          await waitAudio(api, 1.8);
        } else {
          await waitAudio(api, 0.8);
        }
      }
      res.bpm = state.bpm;
      res.mode = state.mode;
      roundPasses[def.id] = (roundPasses[def.id] || 0) + 1;
      res.passes++;
      if (clean) res.clean++;
      res.last = def.name;
      lastPhrase = def.id;
      api.countUp();
    } while (api.timeLeft() > 0);
  } finally {
    mic.close();
  }
}
