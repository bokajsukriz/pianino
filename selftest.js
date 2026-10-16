/* selftest.js — runSelfTests(): reine Module (1–4, 6, auch in Node) und im
   Browser zusätzlich der Takt-Scheduler (5) und ein Audio-Smoke-Test.

   Node:  node --input-type=module -e "import { runSelfTests } from './selftest.js'; const r = await runSelfTests(); process.exit(r.failed ? 1 : 0)"
   Browser: Konsole runSelfTests() oder „Über“ → „Selbsttest“. */

import { CHORDS, chordById, transition, noteName } from './chords.js';
import {
  review, buildRound, startRound, nextEntry, afterReview, newCard, levelReady,
  countdownBeats, unlockedCardIds, postponeOverflow,
} from './leitner.js';
import { applyWege, blockBpm, newLoop, nextLoop, wegeStages, applyGroove, blockChords } from './tempo.js';
import { buildMix, weakestExercise, mixLabel, weekDots } from './mix.js';
import { SONG, songForm } from './song-perfect-ruin.js';
import { TEST_MELODY } from './test-melody.js';
import { melodySlice, melodyStartFor } from './melody.js';
import { addDays } from './dates.js';

/** Deterministischer Zufall für Tests (mulberry32). */
export function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

function pureTests() {
  const T = [];
  const check = (name, ok, detail = '') => T.push({ name, ok: !!ok, detail });

  /* 1 — chords.js */
  check('1 Akkorde: 10 Einträge', CHORDS.length === 10);
  const ids = ['Am:root', 'F:root', 'C:root', 'Dm:root', 'D:root', 'Am:song', 'D:song', 'F:song', 'Dm:song', 'C:song'];
  check('1 Akkorde: alle ids vorhanden', ids.every((id) => chordById(id)));
  check('1 Akkorde: RH genau 3 Töne, aufsteigend',
    CHORDS.every((c) => c.rh.length === 3 && c.rh[0] < c.rh[1] && c.rh[1] < c.rh[2] && c.fingers.length === 3));
  check('1 Tonnamen: Kreuz als ♯', noteName(66) === 'F♯4' && noteName(60) === 'C4' && noteName(45) === 'A2');
  const t1 = transition('Am:song', 'F:song');
  check('1 transition Am→F', eq(t1.stay, [69, 72]) && eq(t1.moves.map((m) => [m.from, m.to]), [[76, 77]]), JSON.stringify(t1));
  const t2 = transition('F:song', 'Dm:song');
  check('1 transition F→Dm', eq(t2.stay, [69, 77]) && eq(t2.moves.map((m) => [m.from, m.to]), [[72, 74]]), JSON.stringify(t2));
  const t3 = transition('Am:song', 'D:song');
  check('1 transition Am→D', eq(t3.stay, [69]) && eq(t3.moves.map((m) => [m.from, m.to]), [[72, 74], [76, 78]]), JSON.stringify(t3));

  /* 2 — leitner.js */
  const d1 = '2026-10-17', d2 = '2026-10-18';
  let c = { ...newCard('card:Am:root', d1), seen: 1, box: 2 };
  c = review(c, 'sass', d1);
  c = review(c, 'sass', d1);
  check('2 Saß zweimal am selben Tag → kein Aufstieg', c.box === 2 && c.pendingPromotion === d1);
  c = review(c, 'sass', d2);
  check('2 Saß an zwei Tagen → Aufstieg', c.box === 3 && c.pendingPromotion === null && c.due === addDays(d2, 4));
  c = review(c, 'nochmal', d2);
  check('2 Nochmal → Fach 1, heute fällig', c.box === 1 && c.due === d2 && c.pendingPromotion === null);
  const w = review({ ...c, box: 4, pendingPromotion: d1 }, 'wackelig', d2);
  check('2 Wackelig → Fach bleibt, keine Vormerkung', w.box === 4 && w.pendingPromotion === null);
  check('2 Countdown: neu 6, sonst 4, Stufe 4 sinkt bis 2',
    countdownBeats(newCard('x', d1), 1) === 6 && countdownBeats({ seen: 1 }, 2) === 4
    && review({ ...c, beats: 2, seen: 3 }, 'sass', d2, 4).beats === 2
    && review({ ...c, beats: 4, seen: 3 }, 'sass', d2, 4).beats === 3);

  const many = Array.from({ length: 20 }, (_, i) => ({
    ...newCard(`card:due${i}`, d1), seen: 2, box: 1 + (i % 2), due: addDays(d1, -(i % 5)),
  }));
  const fresh = Array.from({ length: 5 }, (_, i) => newCard(`card:new${i}`, d1));
  const strong = { ...newCard('card:strong', d1), seen: 5, box: 3, due: addDays(d1, 3) };
  const pool = [...many, ...fresh, strong];
  const r1 = buildRound({ cards: pool, today: d1, rand: seeded(7) });
  check('2 Runde: höchstens 12 fällige + 3 neue', r1.due.length === 12 && r1.fresh.length === 3 && r1.overflow.length === 8,
    `${r1.due.length}+${r1.fresh.length}`);
  check('2 Runde: neue Karte dreimal hintereinander',
    r1.queue.filter((e) => e.id === 'card:new0').length === 3
    && r1.queue.findIndex((e) => e.id === 'card:new0') + 2 === r1.queue.map((e) => e.id).lastIndexOf('card:new0'));
  check('2 Runde: erste Karte aus Fach ≥ 3', pool.find((x) => x.id === r1.queue[0].id).box >= 3, r1.queue[0].id);
  const dueStrong = [...many.slice(0, 3), { ...strong, due: d1 }];
  const r1b = buildRound({ cards: dueStrong, today: d1, rand: seeded(3) });
  check('2 Runde: fällige Fach-≥-3-Karte zuerst', r1b.queue[0].id === 'card:strong');
  const r2 = buildRound({ cards: pool, today: d1, rand: seeded(7) });
  const r3 = buildRound({ cards: pool, today: d1, rand: seeded(8) });
  check('2 Runde: deterministisch bei gleichem rand', eq(r1, r2) && !eq(r1.queue, r3.queue));
  const moved = postponeOverflow(pool, r1.overflow, [], d1);
  check('2 Kein Rückstau: Überhang still auf morgen verschoben', moved.length === 8 && moved.every((x) => x.due === addDays(d1, 1)));

  // Runde durchspielen: nie dieselbe Karte direkt hintereinander (außer Einstieg).
  const small = unlockedCardIds(1).map((id, i) => ({ ...newCard(id, d1), seen: i < 2 ? 3 : 0, box: i === 0 ? 3 : 1 }));
  let round = startRound(buildRound({ cards: small, today: d1, rand: seeded(1) }));
  const rand = seeded(2);
  const seq = [];
  let doubles = 0;
  for (let k = 0; k < 30; k++) {
    const n = nextEntry(round, small);
    round = n.round;
    if (seq.length && seq[seq.length - 1].id === n.entry.id && !n.entry.intro) doubles++;
    seq.push(n.entry);
    round = afterReview(round, n.entry.id, k % 3 === 0 ? 'nochmal' : 'sass', rand);
  }
  check('2 Runde: keine direkte Wiederholung außer beim Einstieg', doubles === 0, seq.map((e) => e.id.slice(5)).join(' '));
  check('2 Stufenvorschlag ab 80 % in Fach ≥ 3',
    levelReady(unlockedCardIds(1).map((id) => ({ id, box: 3 })), 1)
    && !levelReady(unlockedCardIds(2).map((id, i) => ({ id, box: i < 3 ? 3 : 1 })), 2));

  /* 3 — tempo.js */
  let l = newLoop('am-f', 55);
  l = applyWege(l, true, d1); l = applyWege(l, true, d1);
  check('3 Zweimal drangeblieben → noch kein Schritt', l.bpm === 55 && l.cleanStreak === 2);
  l = applyWege(l, true, d1);
  check('3 3× drangeblieben → +4', l.bpm === 59 && l.cleanStreak === 0);
  const l52 = applyWege({ ...newLoop('x', 52), cleanStreak: 2 }, false, d1);
  check('3 Rausgefallen bei 52 → 50 (nicht 46)', l52.bpm === 50 && l52.cleanStreak === 0);
  const old = { ...newLoop('x', 58), lastPlayed: addDays(d1, -7), blocks: 4 };
  check('3 7 Tage Pause → −6 als Aufwärmen, gespeichertes Tempo bleibt', blockBpm(old, d1) === 52 && old.bpm === 58
    && blockBpm({ ...old, lastPlayed: addDays(d1, -6) }, d1) === 58);
  let top = { ...newLoop('x', 60), blocks: 5 };
  for (let i = 0; i < 3; i++) top = applyWege(top, true, d1);
  check('3 Bei 60 BPM und 3× drangeblieben → sitzt', top.solid && top.bpm === 60);
  const defs = wegeStages(SONG)[1];
  const st = { 'am-f': { ...newLoop('am-f'), blocks: 1 } };
  check('3 Neuer Loop läuft 2 Blöcke geblockt',
    nextLoop(defs, st, { lastId: 'am-f', today: d1, rand: seeded(1) }) === 'am-f'
    && nextLoop(defs, { 'am-f': { ...newLoop('am-f'), blocks: 2 } }, { lastId: 'am-f', today: d1, rand: seeded(1) }) === 'f-dm');
  check('3 Strophen-Loop 8 Takte', eq(blockChords(wegeStages(SONG)[4][0]), ['Am:song', 'D:song', 'F:song', 'Am:song', 'D:song', 'F:song', 'Am:song', 'D:song']));
  let g = { bpm: 55, roundOk: 0 };
  for (let i = 0; i < 3; i++) g = applyGroove(2, g, true);
  check('3 Groove: 3× groovt → +4 bis Obergrenze', g.bpm === 59);
  check('3 Groove: wackelt → −4, nie unter Untergrenze', applyGroove(2, { bpm: 57 }, false).bpm === 55);

  /* 4 — mix.js */
  const state = { levels: { blitz: 2, wege: 3, groove: 2 }, lastPlayed: { blitz: d1, wege: addDays(d1, -1), groove: addDays(d1, -2) }, cards: [], verseBpm: 58 };
  const mix = buildMix(state, d1);
  check('4 Mix: Summe 300 s', mix.reduce((s, m) => s + m.seconds, 0) === 300);
  check('4 Mix: Gleichstand → die am längsten nicht geübte', mix[1].exercise === 'groove', mix[1].exercise);
  check('4 Mix: nie geübt gilt als am längsten her',
    weakestExercise({ blitz: 1, wege: 3, groove: 1 }, { blitz: d1 }) === 'groove');
  check('4 Mix: Aufwärmen mit Stufe-1-Karten bei < 3 Karten in Fach ≥ 2', mix[0].pool.length === 4 && mix[0].warmup);
  check('4 Mix: Play-Along mit Strophen-Tempo', mix[2].exercise === 'playalong' && mix[2].bpm === 58);
  check('4 Mix: Unterzeile', mixLabel(mix) === '1 min Aufwärmen · 3 min Groove · 1 min Play-Along', mixLabel(mix));
  const dots = weekDots({ '2026-10-12': { seconds: 61 }, '2026-10-13': { seconds: 30 } }, '2026-10-16');
  check('4 Woche beginnt am Montag, ab 60 s gezählt', dots[0].date === '2026-10-12' && dots[0].practiced && !dots[1].practiced && dots[4].today);

  /* 6 — Songdaten */
  check('6 Strophe 16 Takte', SONG.verse.length === 16);
  check('6 Refrain 8 Takte', SONG.chorus.length === 8);
  check('6 Alle Akkord-ids existieren', [...songForm(SONG), ...SONG.loops.verse, ...SONG.loops.chorus].every((id) => chordById(id)));
  check('6 Unverifiziert markiert, Melodie leer', SONG.verified === false && Array.isArray(SONG.melody) && SONG.melody.length === 0);
  check('6 Testmelodie 4 Takte im Format', TEST_MELODY.length === 16 && melodySlice(TEST_MELODY, 3, 2).length === 8
    && TEST_MELODY.every((n) => n.bar >= 1 && n.beat >= 1 && n.dur > 0 && Number.isInteger(n.midi)));
  check('6 Melodie passt zum Strophen-Loop, nicht zum Pendel',
    melodyStartFor(SONG, SONG.loops.verse) === 1 && melodyStartFor(SONG, ['Am:song', 'F:song']) === null);
  return T;
}

/** Test 5 — 8 Takte bei 60 BPM ergeben 32 Schläge mit 1,000 s Abstand
 *  (±1 ms), gerendert in einem OfflineAudioContext und im Signal gemessen. */
async function clockTest() {
  const { createClock } = await import('./clock.js');
  const sr = 44100;
  const ctx = new OfflineAudioContext(1, sr * 34, sr);
  const planned = [];
  const clock = createClock(ctx, {
    bpm: 60, totalSteps: 8 * 8,
    onStep(s) {
      if (s.eighth % 2) return;
      planned.push(s.time);
      const o = ctx.createOscillator(), gn = ctx.createGain();
      o.frequency.value = s.beat === 0 ? 1500 : 1000;
      gn.gain.setValueAtTime(0.5, s.time);
      gn.gain.setValueAtTime(0, s.time + 0.03);
      o.connect(gn).connect(ctx.destination);
      o.start(s.time); o.stop(s.time + 0.03);
    },
  });
  clock.start(0.5, { timer: false });
  clock.fill(40); // ohne Timer: alles bis 40 s planen
  const buf = await ctx.startRendering();
  const d = buf.getChannelData(0);
  const onsets = [];
  let quietUntil = 0;
  for (let i = 0; i < d.length; i++) {
    if (i >= quietUntil && Math.abs(d[i]) > 0.001) { onsets.push(i / sr); quietUntil = i + sr * 0.5; }
  }
  const gaps = onsets.slice(1).map((t, i) => t - onsets[i]);
  const worst = Math.max(...gaps.map((x) => Math.abs(x - 1)));
  const plannedWorst = Math.max(...planned.slice(1).map((t, i) => Math.abs(t - planned[i] - 1)));
  return [
    { name: '5 Takt: 32 Schläge geplant', ok: planned.length === 32 && onsets.length === 32, detail: `${planned.length}/${onsets.length}` },
    { name: '5 Takt: Abstand 1,000 s ±1 ms', ok: gaps.length === 31 && worst <= 0.001 && plannedWorst <= 0.001, detail: `max. Abweichung ${(worst * 1000).toFixed(3)} ms` },
  ];
}

/** Audio-Smoke-Test: Kontext, Synth-Fallback, Klick und Melodiestimme planen
 *  ohne Fehler (gerendert in einem OfflineAudioContext). */
async function audioSmoke() {
  const audio = await import('./audio.js');
  const ctx = new OfflineAudioContext(1, 44100 * 2, 44100);
  const out = audio.renderSmoke(ctx, TEST_MELODY);
  const buf = await ctx.startRendering();
  const d = buf.getChannelData(0);
  let peak = 0;
  for (let i = 0; i < d.length; i++) peak = Math.max(peak, Math.abs(d[i]));
  return [{ name: 'A Audio: Klick, Akkord und Melodie hörbar, nicht übersteuert', ok: out && peak > 0.01 && peak <= 1, detail: `Spitze ${peak.toFixed(2)}` }];
}

/** Alle Tests. → { passed, failed, results } (und Konsole). */
export async function runSelfTests({ log = true } = {}) {
  const results = pureTests();
  if (typeof OfflineAudioContext !== 'undefined') {
    for (const fn of [clockTest, audioSmoke]) {
      try { results.push(...await fn()); } catch (e) { results.push({ name: fn.name, ok: false, detail: String(e?.message || e) }); }
    }
  } else {
    results.push({ name: '5/A Browser-Tests übersprungen (kein OfflineAudioContext)', ok: true, skipped: true, detail: '' });
  }
  const failed = results.filter((r) => !r.ok).length;
  if (log) {
    for (const r of results) console.log(`${r.ok ? (r.skipped ? '–' : '✓') : '✗'} ${r.name}${r.detail && !r.ok ? ` — ${r.detail}` : ''}`);
    console.log(`${results.length - failed} von ${results.length} grün${failed ? `, ${failed} rot` : ''}.`);
  }
  return { passed: results.length - failed, failed, results };
}
