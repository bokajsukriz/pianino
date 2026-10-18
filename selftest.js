/* selftest.js — runSelfTests(): reine Module (1–4, 6–8, auch in Node) und im
   Browser zusätzlich der Takt-Scheduler (5) und ein Audio-Smoke-Test.

   Node:  node --input-type=module -e "import { runSelfTests } from './selftest.js'; const r = await runSelfTests(); process.exit(r.failed ? 1 : 0)"
   Browser: Konsole runSelfTests() oder „Über“ → „Selbsttest“. */

import { CHORDS, chordById, transition, noteName, moveText, bassText } from './chords.js';
import {
  review, buildRound, startRound, nextEntry, afterReview, newCard, levelReady,
  countdownBeats, unlockedCardIds, postponeOverflow,
} from './leitner.js';
import { applyWege, blockBpm, newLoop, nextLoop, wegeStages, applyGroove, blockChords } from './tempo.js';
import { buildMix, mixLabel, weekDots } from './mix.js';
import { semitoneLevels, followOnset, checkChord, checkChordAny, voicings, peakNotes } from './hear.js';
import {
  GUIDE, phraseDefs, newPhrase, waitSequence, tempoBars, applyWait, applyTempo, repairPairs, nextPhrase,
  guideProgress, unlocked, transitionKeys, stageOf, applyChange,
} from './phrases.js';
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
  // Lange Runde mit echten Bewertungen: die Füllkarten kreisen über alle Karten.
  let live = unlockedCardIds(1).map((id) => ({ ...newCard(id, d1), seen: 1 }));
  round = startRound(buildRound({ cards: live, today: d1, rand: seeded(4) }));
  const tail = [];
  for (let k = 0; k < 24; k++) {
    const n = nextEntry(round, live);
    round = n.round;
    live = live.map((x) => (x.id === n.entry.id ? review(x, 'sass', d1) : x));
    if (k >= 8) tail.push(n.entry.id);
  }
  check('2 Lange Runde: alle Karten kommen dran', new Set(tail).size === 4, tail.map((x) => x.slice(5)).join(' '));
  // Aufwärmen ganz am Anfang (nichts gesehen, keine neuen erlaubt): kein Hängenbleiben auf einer Karte.
  let warm = unlockedCardIds(1).map((id) => newCard(id, d1));
  round = startRound(buildRound({ cards: warm, today: d1, rand: seeded(5), allowNew: false }));
  const wseq = [];
  for (let k = 0; k < 8; k++) {
    const n = nextEntry(round, warm);
    round = n.round;
    warm = warm.map((x) => (x.id === n.entry.id ? review(x, 'sass', d1) : x));
    wseq.push(n.entry.id);
  }
  check('2 Füllkarten: nie dieselbe direkt hintereinander, mindestens 3 im Wechsel',
    wseq.every((id, i) => i === 0 || id !== wseq[i - 1]) && new Set(wseq).size >= 3, wseq.map((x) => x.slice(5)).join(' '));
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
  const mix = buildMix({ verseBpm: 58 }, d1);
  check('4 Mix: Summe 300 s', mix.reduce((s, m) => s + m.seconds, 0) === 300);
  check('4 Mix: 4 min Geführt, kein Akkord-Aufwärmen', mix[0].exercise === 'guided' && mix[0].seconds === 240 && !mix.some((m) => m.exercise === 'blitz'));
  check('4 Mix: Play-Along mit Strophen-Tempo', mix[1].exercise === 'playalong' && mix[1].bpm === 58);
  check('4 Mix: Unterzeile', mixLabel(mix) === '4 min Geführt · 1 min Play-Along', mixLabel(mix));
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
  /* 7 — hear.js (eigener Erkenner): künstliche Spektren (Teiltöne 1–6, je −4,4 dB), 48 kHz */
  const SR = 48000, NF = 16384;
  const spectrum = (parts) => {
    const pw = new Float64Array(NF / 2).fill(1e-11); // Grundrauschen −110 dB
    for (const [midi, gainDb] of parts) {
      for (let k = 1; k <= 6; k++) {
        const bin = Math.round(440 * Math.pow(2, (midi - 69) / 12) * k / (SR / NF));
        if (bin < pw.length) pw[bin] += Math.pow(10, (gainDb - 30 - 4.4 * (k - 1)) / 10);
      }
    }
    return semitoneLevels(Float32Array.from(pw, (p) => 10 * Math.log10(p)), SR, NF);
  };
  const play = (notes, gain = 0) => notes.map((m) => [m, gain]);
  const song = ['Am', 'D', 'F', 'Dm', 'C'].map((x) => chordById(`${x}:song`));
  const hears = (chord, parts, opts = {}) => checkChord(spectrum(parts), null, chord, opts);
  check('7 Hören: jeder Song-Akkord erkannt, mit und ohne Bass',
    song.every((c) => hears(c, play(c.rh)).ok && hears(c, play([...c.rh, c.lh])).ok));
  check('7 Hören: kein Song-Akkord als ein anderer durchgelassen',
    song.every((c) => song.every((o) => o === c || !hears(c, play(o.rh)).ok)));
  const off = [];
  for (const c of song) {
    for (let i = 0; i < 3; i++) {
      for (const dd of [-1, 1]) {
        const w = c.rh.map((m, j) => (j === i ? m + dd : m));
        if (new Set(w).size === 3 && hears(c, play(w)).ok) off.push(`${c.symbol}:${i}${dd}`);
      }
    }
  }
  check('7 Hören: Ton einen Halbton daneben → nicht erkannt', off.length === 0, off.join(' '));
  check('7 Hören: fehlender Ton → nicht erkannt', song.every((c) => !hears(c, play(c.rh.slice(0, 2))).ok && !hears(c, play(c.rh.slice(1))).ok));
  check('7 Hören: Stille → nicht erkannt, nicht laut', !hears(song[0], []).ok && !hears(song[0], []).loud);
  check('7 Hören: ungleich laut (ein Ton 15 dB leiser) → noch erkannt', hears(song[0], [[69, 0], [72, -15], [76, -3]]).ok);
  const [, cD, cF] = song;
  // F nach D mit Pedal: F♯5 klingt nach. Schon vorher gleich laut → Nachklang;
  // vorher still, jetzt da → neu angeschlagen, also fremd.
  const ringNow = spectrum([...play(cF.rh), [78, -8]]);
  const ringing = followOnset(null, ringNow, 0.1, spectrum(play([78], -8)));
  const struck = followOnset(null, ringNow, 0.1, spectrum([]));
  check('7 Hören: Nachklang des Vorakkords stört nicht, neu angeschlagener Fremdton schon',
    checkChord(ringNow, ringing, cF, { prev: cD }).ok && !checkChord(ringNow, struck, cF, { prev: cD }).ok);
  // Fremdton, der bis jetzt verklungen ist, bleibt im Spitzenpegel seit dem Anschlag.
  let mem = followOnset(null, spectrum([...play(cF.rh), [79, 0]]), 0.5, spectrum([]));
  const later = spectrum(play(cF.rh));
  mem = followOnset(mem, later, 0.8);
  check('7 Hören: verklungener Fremdton zählt weiter (Gedächtnis seit dem Anschlag)',
    checkChord(later, null, cF).ok && !checkChord(later, mem, cF).ok);

  check('7 Lagen: Am eng in jeder Oktave, Song-Lage dabei',
    voicings(song[0]).some((v) => v.join() === '57,60,64') && voicings(song[0]).some((v) => v.join() === '69,72,76'));
  check('7 Lagen: Am eine Oktave tiefer → nur der lagenunabhängige Erkenner sagt ja',
    checkChordAny(spectrum(play([57, 60, 64])), null, song[0]).ok && !checkChord(spectrum(play([57, 60, 64])), null, song[0]).ok);
  check('7 Lagen: Am in Grundstellung um C4 und 1. Umkehrung erkannt',
    checkChordAny(spectrum(play([57, 60, 64])), null, song[0]).ok && checkChordAny(spectrum(play([60, 64, 69])), null, song[0]).ok);
  check('7 Lagen: andere Song-Akkorde in fremder Lage nicht als Am',
    ['C', 'F', 'Dm', 'D'].every((x) => { const c = chordById(`${x}:song`); return voicings(c).every((v) => !checkChordAny(spectrum(play(v)), null, song[0]).ok); }));
  {
    // Gehörte Töne: Am in Song-Lage, das A4 um 30 Cent zu hoch.
    const pw = new Float64Array(NF / 2).fill(1e-11);
    for (const [f, g] of [[440 * Math.pow(2, 30 / 1200), 0], [523.25, -3], [659.26, -5]]) {
      for (let k = 1; k <= 4; k++) { const bin = Math.round(f * k / (SR / NF)); if (bin < pw.length) pw[bin] += Math.pow(10, (g - 30 - 6 * (k - 1)) / 10); }
    }
    const pn = peakNotes(Float32Array.from(pw, (p) => 10 * Math.log10(p)), SR, NF);
    const a4 = pn.find((n) => n.midi === 69);
    check('7 Gehörte Töne: A4 C5 E5 dabei, A4 mit +30 ct (±8)',
      [69, 72, 76].every((m) => pn.some((n) => n.midi === m)) && a4 && Math.abs(a4.cents - 30) <= 8,
      pn.map((n) => `${n.midi}${n.cents >= 0 ? '+' : ''}${n.cents}`).join(' '));
  }

  /* 8 — phrases.js */
  const pd = phraseDefs(SONG);
  const z1 = pd.find((x) => x.id === 'z1'), ref = pd.find((x) => x.id === 'ref');
  check('8 Phrasen: Zeile 1 im Warten Am D F Am, weiter ohne Am', eq(waitSequence(z1), ['Am:song', 'D:song', 'F:song', 'Am:song'])
    && eq(waitSequence(z1, { continued: true }), ['D:song', 'F:song', 'Am:song']));
  check('8 Phrasen: Refrain endet auf C (übt F → C)', waitSequence(ref).at(-1) === 'C:song' && waitSequence(ref).length === 9);
  check('8 Phrasen: Tempo 4-Takt-Zeile zweimal, Strophe einmal', tempoBars(z1).length === 8 && tempoBars(pd.find((x) => x.id === 'strophe')).length === 16);
  const keys = transitionKeys(z1);
  const pass = (secs, extra = {}) => keys.map((k, i) => { const [from, to] = k.split('>'); return { from, to, sec: secs[i % secs.length], ...extra }; });
  const first = applyWait(newPhrase('z1'), { changes: pass([0.6, 0.9, 1.0]), keys, today: d1 });
  check('8 Wer es kann: erster Durchgang ohne Hilfe, alle Wechsel ≤ 2 s → alle Übergänge Stufe 3, sofort Tempo 56',
    first.fast && first.toTempo && first.state.bpm === 56 && keys.every((k) => first.state.trans[k].stage === 3), JSON.stringify(first.state.trans));
  check('8 Startempo aus langsamstem Wechsel (1,2 s → 50)',
    applyWait(newPhrase('x'), { changes: pass([0.5, 1.2]), keys, today: d1 }).state.bpm === 50);
  let wp = applyWait(newPhrase('z1'), { changes: pass([5]), keys, today: d1 }).state;
  check('8 Stufen: langsamer erster Durchgang → Stufe 1, kein Tempo', wp.mode === 'wait' && stageOf(wp, 'Am:song', 'D:song', d1) === 1);
  wp = applyWait(wp, { changes: pass([1]), keys, today: d1 }).state;
  wp = applyWait(wp, { changes: pass([1], { self: true }), keys, today: d1 }).state;
  for (let i = 0; i < 2; i++) wp = applyWait(wp, { changes: pass([1]), keys, today: d1 }).state;
  check('8 Stufen: Hilfe selbst holen unterbricht die Serie (kein Fehler, aber kein Aufstieg)', stageOf(wp, 'Am:song', 'D:song', d1) === 1);
  wp = applyWait(wp, { changes: pass([1]), keys, today: d1 }).state;
  check('8 Stufen: 3× sauber in 3 s → Stufe 2', stageOf(wp, 'Am:song', 'D:song', d1) === 2 && wp.mode === 'wait');
  for (let i = 0; i < 2; i++) wp = applyWait(wp, { changes: pass([2.5]), keys, today: d1 }).state;
  check('8 Stufen: in Stufe 2 zählen nur Wechsel ≤ 2 s', stageOf(wp, 'Am:song', 'D:song', d1) === 2 && wp.trans['Am:song>D:song'].up === 0);
  let tw;
  for (let i = 0; i < 3; i++) { tw = applyWait(wp, { changes: pass([1.5]), keys, today: d1 }); wp = tw.state; }
  check('8 Stufen: alle Übergänge Stufe 3 → Tempo', tw.toTempo && wp.mode === 'tempo');
  const tr3 = { stage: 3, up: 0, down: 0, okDay: d1 };
  check('8 Stufen: neuer Übetag eine Stufe tiefer, nach einem sauberen Wechsel wieder voll',
    stageOf({ trans: { 'a>b': tr3 } }, 'a', 'b', d2) === 2
    && stageOf({ trans: { 'a>b': applyChange(tr3, { sec: 1, from: 'a', to: 'b' }, d2) } }, 'a', 'b', d2) === 3);
  const down1 = applyChange({ ...tr3, okDay: d2 }, { sec: 9 }, d2);
  const down2 = applyChange(down1, { sec: 3, auto: true }, d2);
  check('8 Stufen: 2× Hilfe nötig oder > 8 s → eine Stufe tiefer, nur dieser Übergang', down1.stage === 3 && down2.stage === 2);
  check('8 Bewegungssätze: Am → D, D → F (F mit 1-3-5), Dm → C',
    moveText('Am:song', 'D:song') === 'Daumen bleibt auf dem A. Finger 3 und 5 rutschen hoch: aufs D und F♯.'
    && moveText('D:song', 'F:song') === 'Daumen bleibt auf dem A. Finger 3 und 5 rutschen runter: aufs C und F.'
    && moveText('Dm:song', 'C:song') === 'Die ganze Hand rutscht runter: aufs G, C und E.',
    moveText('D:song', 'F:song'));
  check('8 Bass-Hinweis: Am → D hoch, D → F runter', bassText('Am:song', 'D:song') === 'Bass: hoch zum D' && bassText('D:song', 'F:song') === 'Bass: runter zum F');
  let tp = { ...newPhrase('z1'), mode: 'tempo', bpm: 52 };
  tp = applyTempo(tp, { errors: 0, today: d1 }).state;
  check('8 Tempo: Schnellspur — sauber ohne je einen Fehler → gleich +4', tp.bpm === 56);
  tp = applyTempo(tp, { errors: 1, today: d1 }).state;
  check('8 Tempo: ein Fehler → Tempo bleibt', tp.bpm === 56 && tp.tempoErrors === 1);
  tp = applyTempo(tp, { errors: 0, today: d1 }).state;
  const tp2 = applyTempo(tp, { errors: 0, today: d1 });
  check('8 Tempo: nach einem Fehler erst nach 2 sauberen +4', tp.bpm === 56 && tp2.state.bpm === 60 && tp2.up);
  const so = applyTempo(tp2.state, { errors: 0, today: d1 });
  check('8 Tempo: sauber bei 60 BPM → sitzt', so.nowSolid && so.state.solid);
  let bd = { ...newPhrase('x'), mode: 'tempo', bpm: 50 };
  bd = applyTempo(bd, { errors: 2, today: d1 }).state;
  const bd2 = applyTempo(bd, { errors: 3, today: d1 });
  check('8 Tempo: 2× mehr als ein Fehler → −5', bd2.down && bd2.state.bpm === 45);
  const bd3 = applyTempo(applyTempo(bd2.state, { errors: 2, today: d1 }).state, { errors: 2, today: d1 });
  check('8 Tempo: unter 44 BPM → zurück ins Warten', bd3.toWait && bd3.state.mode === 'wait' && bd3.state.bpm === 45);
  check('8 Reparatur: häufigster hakender Übergang zuerst, F → F zählt nicht',
    eq(repairPairs(['Am', 'D', 'F', 'F', 'Am', 'D', 'F', 'F'], [1, 3, 5, 6]), [['Am', 'D'], ['D', 'F']]));
  const solidZ1 = { z1: { ...newPhrase('z1'), solid: true, lastPlayed: addDays(d1, -3) } };
  check('8 Reihenfolge: Zeile 1 zuerst, sitzt sie → Zeile 4 frei',
    nextPhrase(pd, {}, { today: d1 }).id === 'z1' && eq(unlocked(pd, solidZ1), ['z1', 'z4']));
  check('8 Sitzende Phrase nach ≥ 2 Tagen: einmal zu Beginn wiederholen',
    eq(nextPhrase(pd, solidZ1, { today: d1 }), { id: 'z1', review: true })
    && nextPhrase(pd, solidZ1, { today: d1, roundPasses: { z1: 1 } }).id === 'z4');
  check('8 Höchstens 8 Durchgänge je Phrase, dann eine andere',
    nextPhrase(pd, solidZ1, { today: d1, roundPasses: { z1: 1, z4: GUIDE.maxPasses } }).id === 'z1');
  check('8 Fortschritt: nichts 0, alles sitzt 1',
    guideProgress(pd, {}) === 0 && guideProgress(pd, Object.fromEntries(pd.map((x) => [x.id, { solid: true }]))) === 1);
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

/** Test 5b (auch in Node): über 2 Minuten bei 50 und 65 BPM liegt jeder
 *  geplante Schlag exakt auf Start + n × Schlagdauer — die Zeiten werden
 *  nicht aufaddiert, also driftet nichts. */
async function clockDriftTest() {
  const { createClock } = await import('./clock.js');
  const out = [];
  for (const bpm of [50, 65]) {
    const times = [];
    const clock = createClock({ currentTime: 0 }, { bpm, onStep: (s) => { if (s.eighth % 2 === 0) times.push(s.time); } });
    clock.start(0.1, { timer: false });
    clock.fill(0.1 + 120);
    const beat = 60 / bpm;
    const worst = Math.max(...times.map((t, n) => Math.abs(t - (0.1 + n * beat))));
    out.push({ name: `5 Takt: 2 Minuten bei ${bpm} BPM ohne Drift`, ok: times.length === Math.ceil(120 / beat) && worst < 1e-6, detail: `${times.length} Schläge, max. ${(worst * 1e3).toExponential(1)} ms` });
  }
  return out;
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

/** Test 7 (nur Browser): essentia.js erkennt jeden der fünf Song-Akkorde in
 *  künstlichen Fenstern (Teiltöne 1–5, mit Bass) — und nur ihn. */
async function earTest() {
  const { loadEar, checkFrame } = await import('./ear.js');
  await loadEar();
  const sr = 48000, n = 8192;
  const frame = (notes) => {
    const x = new Float32Array(n);
    for (const m of notes) {
      const f = 440 * Math.pow(2, (m - 69) / 12);
      for (let k = 1; k <= 5; k++) for (let i = 0; i < n; i++) x[i] += 0.1 * Math.pow(0.55, k - 1) * Math.sin(2 * Math.PI * f * k * i / sr);
    }
    return x;
  };
  const got = [];
  for (const sym of ['Am', 'D', 'F', 'Dm', 'C']) {
    const c = chordById(`${sym}:song`);
    const { results } = await checkFrame(frame([c.lh, ...c.rh]), sr, ['Am', 'D', 'F', 'Dm', 'C']);
    const yes = Object.entries(results).filter(([, r]) => r.ok).map(([k]) => k);
    got.push({ sym, yes, ok: yes.length === 1 && yes[0] === sym });
  }
  return [{ name: '7 Hören (essentia): Am, D, F, Dm, C erkannt', ok: got.every((g) => g.ok),
    detail: got.map((g) => `${g.sym}→${g.yes.join('/') || '–'}`).join(', ') }];
}

/** Alle Tests. → { passed, failed, results } (und Konsole). */
export async function runSelfTests({ log = true } = {}) {
  const results = pureTests();
  try { results.push(...await clockDriftTest()); } catch (e) { results.push({ name: 'clockDriftTest', ok: false, detail: String(e?.message || e) }); }
  if (typeof OfflineAudioContext !== 'undefined') {
    for (const fn of [clockTest, audioSmoke, earTest]) {
      try { results.push(...await fn()); } catch (e) { results.push({ name: fn.name, ok: false, detail: String(e?.message || e) }); }
    }
  } else {
    results.push({ name: '5/7/A Browser-Tests übersprungen (kein OfflineAudioContext)', ok: true, skipped: true, detail: '' });
  }
  const failed = results.filter((r) => !r.ok).length;
  if (log) {
    for (const r of results) console.log(`${r.ok ? (r.skipped ? '–' : '✓') : '✗'} ${r.name}${r.detail && !r.ok ? ` — ${r.detail}` : ''}`);
    console.log(`${results.length - failed} von ${results.length} grün${failed ? `, ${failed} rot` : ''}.`);
  }
  return { passed: results.length - failed, failed, results };
}
