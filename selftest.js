/* selftest.js — runSelfTests(): reine Module (1–4, 6–8, auch in Node) und im
   Browser zusätzlich der Takt-Scheduler (5) und ein Audio-Smoke-Test.

   Node:  node --input-type=module -e "import { runSelfTests } from './selftest.js'; const r = await runSelfTests(); process.exit(r.failed ? 1 : 0)"
   Browser: Konsole runSelfTests() oder „Über“ → „Selbsttest“. */

import { CHORDS, chordById, transition, noteName, moveText, bassText, gripOf } from './chords.js';
import { parseChord, nameFromKeys, sameChord, prettyChord } from './chordsym.js';
import { validateVoicing, voicingDiff, upgradeVoicing, defaultVoicing, voicingFor, voicingFromKeys } from './voicing.js';
import {
  validateSong, normalizeSong, parseSongText, exportSong, setEvent, renameChord, deleteChord, addChord,
  setSectionStart, nextSectionName, songFromVideo,
} from './songdata.js';
import {
  beatToSec, secToBeat, chordAt, eventsIn, quantize, phrasesOf, sectionRange, chordSequence, countLabel, beatsText, predecessors,
} from './timeline.js';
import { tapTempo, parseYouTubeId, scoreTaps, tapSummary, applyWann, newWann } from './tap.js';
import { runMigrations } from './migrations.js';
import {
  sectionList, addSection, resizeSection, deleteSection, setBeatsPerBar, setChordAt, sectionGrid, sectionTimes, playPos,
  tabBlocks, blocksForSections, sectionsFromTabs, marksToSections,
  orderByStart, fitBars, updateSection, tapChordAt, barsTime, barSpan, loopLead,
} from './leadsheet.js';
import { drillChunks, cycleBeats, cyclePhase, nextChunk, stepBpm, startBpm, DRILL, SWAP, swapPairs, rateSwap, applySwap, pickSwap, swapQueue, roundOver, weakestSwap, chunkWith, allSolid } from './drill.js';
import { addMark, removeMark, markRange, markAt, nextMarkName, fmtClock, addLoop, updateLoop, removeLoop } from './marks.js';
import { classifyLine, parseTabText, chordsInText, stripMarkup } from './tabtext.js';
import {
  review, buildRound, startRound, nextEntry, afterReview, newCard, levelReady,
  countdownBeats, unlockedCardIds, postponeOverflow,
} from './leitner.js';
import {
  applyWege, blockBpm, newLoop, nextLoop, wegeStages, applyGroove, blockChords, songPairs, grooveWindows, GROOVE_STAGES,
} from './tempo.js';
import { stepHits } from './accomp.js';
import { buildMix, mixLabel, weekDots } from './mix.js';
import { semitoneLevels, followOnset, checkChord, checkChordAny, voicings, peakNotes } from './hear.js';
import {
  GUIDE, phraseDefs, newPhrase, waitSequence, tempoEvents, applyWait, applyTempo, repairPairs, nextPhrase,
  guideProgress, unlocked, transitionKeys, stageOf, applyChange, targetBpm, focusPhrase,
} from './phrases.js';
import { SONG, songForm } from './song-perfect-ruin.js';
import { TEST_MELODY } from './test-melody.js';
import { melodyIn, hasMelody } from './melody.js';
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

/** Testsong ohne Liedtext: Strophe 1 und 2 gleich (je 4 Takte), Refrain
 *  mit nur zwei verschiedenen Übergängen. D/F# kommt vorgezogen auf „4 und“. */
export function testSong() {
  return normalizeSong({
    schema: 1, id: 'test-song', title: 'Testsong', beatsPerBar: 4, bpm: 77, chords: ['Am', 'D/F#', 'F6/9', 'Dm', 'C'],
    sources: [], sections: [
      { id: 'v1', name: 'Strophe 1', bar: 1, bars: 4 }, { id: 'v2', name: 'Strophe 2', bar: 5, bars: 4 },
      { id: 'r', name: 'Refrain', bar: 9, bars: 4 },
    ],
    events: [
      { at: 0, chord: 'Am' }, { at: 3.5, chord: 'D/F#' }, { at: 8, chord: 'F6/9' }, { at: 12, chord: 'Am' },
      { at: 19.5, chord: 'D/F#' }, { at: 24, chord: 'F6/9' }, { at: 28, chord: 'Am' },
      { at: 32, chord: 'C' }, { at: 36, chord: 'F6/9' }, { at: 40, chord: 'C' }, { at: 44, chord: 'F6/9' },
    ],
  });
}

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
  const gr = (id) => gripOf(chordById(id));
  const t1 = transition(gr('Am:song'), gr('F:song'));
  check('1 transition Am→F', eq(t1.stay, [69, 72]) && eq(t1.moves.map((m) => [m.from, m.to]), [[76, 77]]), JSON.stringify(t1));
  const t2 = transition(gr('F:song'), gr('Dm:song'));
  check('1 transition F→Dm', eq(t2.stay, [69, 77]) && eq(t2.moves.map((m) => [m.from, m.to]), [[72, 74]]), JSON.stringify(t2));
  const t3 = transition(gr('Am:song'), gr('D:song'));
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
  const TS = testSong();
  check('3 Kurze Wege: Paare aus den häufigsten Übergängen des Songs', eq(songPairs(TS).slice(0, 3), [['C', 'F6/9'], ['Am', 'D/F#'], ['D/F#', 'F6/9']]),
    JSON.stringify(songPairs(TS)));
  const ws = wegeStages(TS);
  const defs = ws[1];
  const [w1, w2] = defs.map((x) => x.id);
  const st = { [w1]: { ...newLoop(w1), blocks: 1 } };
  check('3 Neuer Loop läuft 2 Blöcke geblockt',
    nextLoop(defs, st, { lastId: w1, today: d1, rand: seeded(1) }) === w1
    && nextLoop(defs, { [w1]: { ...newLoop(w1), blocks: 2 } }, { lastId: w1, today: d1, rand: seeded(1) }) === w2);
  check('3 Pendel 8 Takte, Stufe 3 mit linker Hand, Stufe 6 die Folge am Stück',
    eq(blockChords(defs[0]), ['C', 'F6/9', 'C', 'F6/9', 'C', 'F6/9', 'C', 'F6/9']) && ws[3].every((x) => x.lh) && ws[3].length === 4
    && ws[6][0].once && eq(ws[6][0].chords.slice(0, 4), ['Am', 'D/F#', 'F6/9', 'Am']));
  check('3 Kurze Wege ohne Ereignisse: Nachbarn in chords', eq(songPairs({ ...TS, events: [] }).slice(0, 2), [['Am', 'D/F#'], ['D/F#', 'F6/9']]));
  const gw = grooveWindows(TS, phraseDefs(TS));
  check('3 Groove: Ausschnitte zu 4 Takten aus den Phrasen', gw.length === 2 && gw[0].bars === 4 && gw[0].phrase === 'r'
    && grooveWindows({ ...TS, events: [] }, [])[0].tl.events.length === 4);
  // Begleitung je Achtel: ganze Noten an jedem Wechsel, Muster mit vorgezogenem Wechsel.
  const hitsAt = (b, pattern) => stepHits(TS, b, { pattern, from: 0 }).map((h) => `${h.hand}:${h.chord}:${h.beats}`).join(' ');
  check('3 Begleitung: ganze Noten — Anschlag am Wechsel auf „4 und“, dazwischen nichts',
    hitsAt(0) === 'lh:Am:3.5 rh:Am:3.5' && hitsAt(3.5) === 'lh:D/F#:0.5 rh:D/F#:0.5' && hitsAt(1) === '' && hitsAt(4) === 'lh:D/F#:4 rh:D/F#:4', hitsAt(3.5));
  check('3 Begleitung: Muster Stufe 3 — das Achtel auf „4 und“ spielt schon D/F#',
    hitsAt(3, GROOVE_STAGES[3]).startsWith('rh:Am') && hitsAt(3.5, GROOVE_STAGES[3]).includes('rh:D/F#') && hitsAt(3.5, GROOVE_STAGES[1]).includes('lh:D/F#'));
  let g = { bpm: 55, roundOk: 0 };
  for (let i = 0; i < 3; i++) g = applyGroove(2, g, true);
  check('3 Groove: 3× groovt → +4 bis Obergrenze', g.bpm === 59);
  check('3 Groove: wackelt → −4, nie unter Untergrenze', applyGroove(2, { bpm: 57 }, false).bpm === 55);

  /* 4 — mix.js */
  const mix = buildMix({ hasEvents: true, video: true }, d1);
  check('4 Mix: ohne Ereignisse kein Mix', buildMix({ hasEvents: false }, d1).length === 0);
  check('4 Mix: Summe 300 s', mix.reduce((s, m) => s + m.seconds, 0) === 300);
  check('4 Mix: 30 s Wann, 2½ min Geführt, 2 min Play-Along (Loop über die Phrase)',
    eq(mix.map((m) => [m.exercise, m.seconds]), [['wann', 30], ['guided', 150], ['playalong', 120]]) && mix[2].range === 'phrase');
  check('4 Mix: Unterzeile', mixLabel(mix) === '½ min Wann · 2½ min Geführt · 2 min Play-Along', mixLabel(mix));
  const dots = weekDots({ '2026-10-12': { seconds: 61 }, '2026-10-13': { seconds: 30 } }, '2026-10-16');
  check('4 Woche beginnt am Montag, ab 60 s gezählt', dots[0].date === '2026-10-12' && dots[0].practiced && !dots[1].practiced && dots[4].today);

  /* 6 — Songdaten: alte Datei (nur noch Quelle der Migration), Testsong, Melodie */
  check('6 Alte Datei: Akkord-ids existieren, unverifiziert', songForm(SONG).every((id) => chordById(id)) && SONG.verified === false);
  check('6 Testsong gültig, ohne Liedtext', validateSong(TS).ok && !('lyrics' in TS));
  check('6 Testmelodie 4 Takte im Format', TEST_MELODY.length === 16 && melodyIn({ melody: TEST_MELODY }, 8, 12).length === 4
    && TEST_MELODY.every((n) => n.at >= 0 && n.dur > 0 && Number.isInteger(n.midi)) && !hasMelody(TS));
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
  const pd = phraseDefs(TS);
  const z1 = pd.find((x) => x.id === 'v1'), ref = pd.find((x) => x.id === 'r');
  check('8 Phrasen aus den Abschnitten: Strophe 1/2 zusammengefasst, wenigste Übergänge zuerst (Refrain)',
    eq(pd.map((x) => x.name), ['Refrain', 'Strophe 1/2']) && eq(z1.sections, ['v1', 'v2']));
  check('8 Phrasen: Strophe im Warten Am D/F# F6/9 Am, weiter ohne Am', eq(waitSequence(z1), ['Am', 'D/F#', 'F6/9', 'Am'])
    && eq(waitSequence(z1, { continued: true }), ['D/F#', 'F6/9', 'Am']));
  check('8 Phrasen: Refrain endet auf C (übt F6/9 → C)', waitSequence(ref).at(-1) === 'C' && waitSequence(ref).length === 5);
  const te = tempoEvents(z1, 4);
  check('8 Phrasen: Tempo im echten Rhythmus, 4-Takt-Phrase zweimal', te.beats === 32 && te.events.length === 8
    && eq(te.events.slice(0, 2), [{ at: 0, chord: 'Am' }, { at: 3.5, chord: 'D/F#' }]) && te.events[4].at === 16);
  const keys = transitionKeys(z1);
  const pass = (secs, extra = {}) => keys.map((k, i) => { const [from, to] = k.split('>'); return { from, to, sec: secs[i % secs.length], ...extra }; });
  const first = applyWait(newPhrase('v1'), { changes: pass([0.6, 0.9, 1.0]), keys, today: d1 });
  check('8 Wer es kann: erster Durchgang ohne Hilfe, alle Wechsel ≤ 2 s → alle Übergänge Stufe 3, sofort Tempo 56',
    first.fast && first.toTempo && first.state.bpm === 56 && keys.every((k) => first.state.trans[k].stage === 3), JSON.stringify(first.state.trans));
  check('8 Startempo aus langsamstem Wechsel (1,2 s → 50)',
    applyWait(newPhrase('x'), { changes: pass([0.5, 1.2]), keys, today: d1 }).state.bpm === 50);
  let wp = applyWait(newPhrase('v1'), { changes: pass([5]), keys, today: d1 }).state;
  check('8 Stufen: langsamer erster Durchgang → Stufe 1, kein Tempo', wp.mode === 'wait' && stageOf(wp, 'Am', 'D/F#', d1) === 1);
  wp = applyWait(wp, { changes: pass([1]), keys, today: d1 }).state;
  wp = applyWait(wp, { changes: pass([1], { self: true }), keys, today: d1 }).state;
  for (let i = 0; i < 2; i++) wp = applyWait(wp, { changes: pass([1]), keys, today: d1 }).state;
  check('8 Stufen: Hilfe selbst holen unterbricht die Serie (kein Fehler, aber kein Aufstieg)', stageOf(wp, 'Am', 'D/F#', d1) === 1);
  wp = applyWait(wp, { changes: pass([1]), keys, today: d1 }).state;
  check('8 Stufen: 3× sauber in 3 s → Stufe 2', stageOf(wp, 'Am', 'D/F#', d1) === 2 && wp.mode === 'wait');
  for (let i = 0; i < 2; i++) wp = applyWait(wp, { changes: pass([2.5]), keys, today: d1 }).state;
  check('8 Stufen: in Stufe 2 zählen nur Wechsel ≤ 2 s, Schlüssel sind Symbolpaare', stageOf(wp, 'Am', 'D/F#', d1) === 2 && wp.trans['Am>D/F#'].up === 0);
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
  check('8 Bass-Hinweis: Am → D hoch, D → F runter', bassText(gr('Am:song'), gr('D:song')) === 'Bass: hoch zum D' && bassText(gr('D:song'), gr('F:song')) === 'Bass: runter zum F');
  let tp = { ...newPhrase('v1'), mode: 'tempo', bpm: 52 };
  tp = applyTempo(tp, { errors: 0, today: d1 }).state;
  check('8 Tempo: Schnellspur — sauber ohne je einen Fehler → gleich +4', tp.bpm === 56);
  tp = applyTempo(tp, { errors: 1, today: d1 }).state;
  check('8 Tempo: ein Fehler → Tempo bleibt', tp.bpm === 56 && tp.tempoErrors === 1);
  tp = applyTempo(tp, { errors: 0, today: d1 }).state;
  const tp2 = applyTempo(tp, { errors: 0, today: d1 });
  check('8 Tempo: nach einem Fehler erst nach 2 sauberen +4', tp.bpm === 56 && tp2.state.bpm === 60 && tp2.up);
  const so = applyTempo(tp2.state, { errors: 0, today: d1 });
  check('8 Tempo: sauber bei 60 BPM → sitzt (Song ohne bpm)', so.nowSolid && so.state.solid && targetBpm({ bpm: null }) === 60);
  const t76 = applyTempo({ ...newPhrase('v1'), mode: 'tempo', bpm: 76 }, { errors: 0, today: d1, target: targetBpm(TS) });
  const t77 = applyTempo(t76.state, { errors: 0, today: d1, target: targetBpm(TS) });
  check('8 Tempo: Ziel ist das Song-Tempo (77) — bei 76 noch nicht, bei 77 sitzt es', !t76.nowSolid && t76.state.bpm === 77 && t77.nowSolid);
  let bd = { ...newPhrase('x'), mode: 'tempo', bpm: 50 };
  bd = applyTempo(bd, { errors: 2, today: d1 }).state;
  const bd2 = applyTempo(bd, { errors: 3, today: d1 });
  check('8 Tempo: 2× mehr als ein Fehler → −5', bd2.down && bd2.state.bpm === 45);
  const bd3 = applyTempo(applyTempo(bd2.state, { errors: 2, today: d1 }).state, { errors: 2, today: d1 });
  check('8 Tempo: unter 44 BPM → zurück ins Warten', bd3.toWait && bd3.state.mode === 'wait' && bd3.state.bpm === 45);
  check('8 Reparatur: häufigster hakender Übergang zuerst, F → F zählt nicht',
    eq(repairPairs(['Am', 'D', 'F', 'F', 'Am', 'D', 'F', 'F'], [1, 3, 5, 6]), [['Am', 'D'], ['D', 'F']]));
  const solidZ1 = { r: { ...newPhrase('r'), solid: true, lastPlayed: addDays(d1, -3) } };
  check('8 Reihenfolge: Refrain zuerst, sitzt er → Strophe frei',
    nextPhrase(pd, {}, { today: d1 }).id === 'r' && eq(unlocked(pd, solidZ1), ['r', 'v1']) && focusPhrase(pd, solidZ1).id === 'v1');
  check('8 Sitzende Phrase nach ≥ 2 Tagen: einmal zu Beginn wiederholen',
    eq(nextPhrase(pd, solidZ1, { today: d1 }), { id: 'r', review: true })
    && nextPhrase(pd, solidZ1, { today: d1, roundPasses: { r: 1 } }).id === 'v1');
  check('8 Höchstens 8 Durchgänge je Phrase, dann eine andere',
    nextPhrase(pd, solidZ1, { today: d1, roundPasses: { r: 1, v1: GUIDE.maxPasses } }).id === 'r');
  check('8 Ohne Ereignisse keine Phrase', phraseDefs({ ...TS, events: [] }).length === 0 && guideProgress([], {}) === 0);
  check('8 Fortschritt: nichts 0, alles sitzt 1',
    guideProgress(pd, {}) === 0 && guideProgress(pd, Object.fromEntries(pd.map((x) => [x.id, { solid: true }]))) === 1);

  {
  /* 9 — songdata.js (Song-JSON) */
  const base = () => ({
    schema: 1, id: 'test-song', title: 'Testsong', beatsPerBar: 4, bpm: 80, chords: ['Am', 'D/F#', 'F6/9'],
    sources: [{ type: 'youtube', videoId: 'abcdefghijk', offsetSec: 1.5 }],
    sections: [{ id: 'v1', name: 'Strophe 1', bar: 1, bars: 2 }, { id: 'v2', name: 'Strophe 2', bar: 3, bars: 2 }],
    events: [{ at: 0, chord: 'Am' }, { at: 3.5, chord: 'D/F#' }, { at: 6, chord: 'F6/9' }],
    lyrics: [{ at: 0, line: 'Zeile A' }],
  });
  const vs = (j) => validateSong(j);
  check('9 Song: gültiges Beispiel ok', vs(base()).ok, vs(base()).errors.join(' | '));
  const without = (k) => { const j = base(); delete j[k]; return j; };
  const req = ['schema', 'id', 'title', 'beatsPerBar', 'chords', 'sections', 'events'];
  const missed = req.filter((k) => { const r = vs(without(k)); return r.ok || r.errors.length !== 1 || !r.errors[0].includes(`„${k}“`); });
  check('9 Song: jedes fehlende Pflichtfeld einzeln erkannt', missed.length === 0, missed.join(' '));
  const bad = (patch) => vs({ ...base(), ...patch }).errors.join(' | ');
  check('9 Song: unsortierte Ereignisse gemeldet', /nicht aufsteigend/.test(bad({ events: [{ at: 2, chord: 'Am' }, { at: 1, chord: 'D/F#' }] })));
  check('9 Song: at nicht auf Raster gemeldet, bei ¼-Raster erlaubt', /Raster/.test(bad({ events: [{ at: 0.25, chord: 'Am' }] }))
    && vs({ ...base(), grid: 0.25, events: [{ at: 0.25, chord: 'Am' }] }).ok);
  check('9 Song: unbekannter Akkord gemeldet', /„G“ steht nicht/.test(bad({ events: [{ at: 0, chord: 'G' }] })));
  check('9 Song: überlappende Abschnitte gemeldet', /überlappt/.test(bad({ sections: [{ name: 'A', bar: 1, bars: 4 }, { name: 'B', bar: 3, bars: 2 }] })));
  check('9 Song: doppeltes at, bpm außerhalb, falsche id gemeldet',
    /doppelt/.test(bad({ events: [{ at: 1, chord: 'Am' }, { at: 1, chord: 'D/F#' }] })) && /bpm/.test(bad({ bpm: 300 })) && /id/.test(bad({ id: 'Test Song' })));
  const extra = vs({ ...base(), futureField: { x: 1 }, beatTimes: [0, 0.8] });
  check('9 Song: unbekannte Felder und beatTimes bleiben erhalten', extra.ok && eq(extra.song.futureField, { x: 1 }) && eq(extra.song.beatTimes, [0, 0.8]));
  const merged = normalizeSong({ ...base(), events: [{ at: 0, chord: 'Am' }, { at: 2, chord: 'Am' }, { at: 4, chord: 'F6/9' }] });
  check('9 Song: gleiche Nachbar-Ereignisse zusammengefasst', eq(merged.events, [{ at: 0, chord: 'Am' }, { at: 4, chord: 'F6/9' }]));
  const round = parseSongText(exportSong(vs(base()).song));
  check('9 Export ohne Text, Import danach gleich', round.ok && !('lyrics' in round.song)
    && eq(round.song, (() => { const s = vs(base()).song; delete s.lyrics; return s; })()));
  check('9 Export mit Text auf Wunsch', parseSongText(exportSong(vs(base()).song, { lyrics: true })).song.lyrics[0].line === 'Zeile A');
  check('9 Import: kein JSON → deutsche Meldung', /Kein gültiges JSON/.test(parseSongText('{ nein').errors[0]));
  const ed = setEvent(vs(base()).song, 3.5, 'Am');
  const rs = setEvent(vs(base()).song, 2, 'Am', true);
  check('9 Bearbeiten: gleicher Akkord mit again bleibt als Neuanschlag, ohne again wird er zusammengefasst',
    eq(rs.events.map((e) => e.again === true), [false, true, false, false]) && setEvent(vs(base()).song, 2, 'Am').events.length === 3);
  check('9 Bearbeiten: Ereignis an belegter Stelle ersetzt, gleiche Nachbarn zusammengefasst',
    eq(ed.events, [{ at: 0, chord: 'Am' }, { at: 6, chord: 'F6/9' }]));
  const ren = renameChord(vs(base()).song, 'D/F#', 'D');
  check('9 Bearbeiten: Umbenennen zieht Ereignisse mit; Löschen nur ohne Ereignisse',
    ren.chords[1] === 'D' && ren.events[1].chord === 'D' && deleteChord(ren, 'D') === null && deleteChord(addChord(ren, 'G'), 'G').chords.length === 3);
  const secd = setSectionStart({ ...vs(base()).song, sections: [] }, 1, 'Intro 1', 8);
  const secd2 = setSectionStart(secd, 5, 'Strophe 1', 8);
  check('9 Abschnitte: beginnt hier → Längen bis zum nächsten', eq(secd2.sections.map((s) => [s.name, s.bar, s.bars]), [['Intro 1', 1, 4], ['Strophe 1', 5, 4]])
    && nextSectionName(secd2, 'Strophe') === 'Strophe 2');

  /* 10 — chordsym.js */
  const pc = (s) => parseChord(s);
  const types = { X: [0, 4, 7], Xm: [0, 3, 7], X6: [0, 4, 7, 9], Xm6: [0, 3, 7, 9], 'X6/9': [0, 2, 4, 7, 9], Xadd9: [0, 2, 4, 7],
    X7: [0, 4, 7, 10], Xm7: [0, 3, 7, 10], Xmaj7: [0, 4, 7, 11], Xsus2: [0, 2, 7], Xsus4: [0, 5, 7], Xdim: [0, 3, 6], Xaug: [0, 4, 8] };
  const wrong = Object.entries(types).filter(([t, iv]) => { const c = pc(t.replace('X', 'C')); return !c || c.bass !== null || !eq(c.pcs, [...iv].sort((a, b) => a - b)); });
  check('10 Akkordsymbole: alle Typen auf C', wrong.length === 0, wrong.map(([t]) => t).join(' '));
  check('10 Akkordsymbole: Kreuz und b (F#m, Bb/D)', eq(pc('F#m').pcs, [1, 6, 9]) && pc('F#m').root === 6
    && pc('Bb/D').root === 10 && pc('Bb/D').bass === 2 && eq(pc('Bb/D').pcs, [2, 5, 10]));
  check('10 Akkordsymbole: F6/9 ohne Basston, F6/9/A mit A im Bass', pc('F6/9').bass === null && pc('F6/9').quality === '6/9'
    && pc('F6/9/A').bass === 9 && pc('F6/9/A').quality === '6/9' && eq(pc('D/F#').pcs, [2, 6, 9]) && pc('D/F#').bass === 6);
  check('10 Akkordsymbole: Unsinn → null', ['', 'X', 'Am/', 'Hallo', 'C/Q', 'Cxyz', null].every((s) => pc(s) === null));
  const k = (...ns) => ns;
  check('10 Name aus Tasten: F2 C3 | A3 C4 D4 G4 → F6/9', nameFromKeys(k(41, 48, 57, 60, 62, 67)).includes('F6/9'), nameFromKeys(k(41, 48, 57, 60, 62, 67)).slice(0, 4).join(' '));
  check('10 Name aus Tasten: Fis2 D3 | A3 D4 → D/F#', nameFromKeys(k(42, 50, 57, 62)).includes('D/F#'), nameFromKeys(k(42, 50, 57, 62)).slice(0, 4).join(' '));
  check('10 Name aus Tasten: A2 E3 | A3 C4 E4 → Am zuerst', nameFromKeys(k(45, 52, 57, 60, 64))[0] === 'Am', nameFromKeys(k(45, 52, 57, 60, 64)).slice(0, 4).join(' '));
  check('10 Gleicher Akkord trotz Schreibweise', sameChord('D/F#', 'D/Gb') && !sameChord('D', 'D/F#') && prettyChord('Bb/F#') === 'B♭/F♯');

  /* 11 — voicing.js */
  const AM = { lh: [45, 52], lhFingers: [5, 1], rh: [57, 60, 64], rhFingers: [1, 2, 4] };
  const DF = { lh: [42, 50], lhFingers: [5, 1], rh: [57, 62], rhFingers: [1, 3] };
  const F69 = { lh: [41, 48], lhFingers: [5, 1], rh: [57, 60, 62, 67], rhFingers: [1, 2, 3, 5] };
  check('11 Griffe aus dem Unterricht gültig, ohne Warnung', [AM, DF, F69].every((v) => { const r = validateVoicing(v); return r.ok && !r.warnings.length; }));
  const vv = (patch) => validateVoicing({ ...AM, ...patch });
  check('11 Griff: doppelter Finger, Taste in beiden Händen, falsche Fingerzahl sind Fehler',
    !vv({ rhFingers: [1, 2, 2] }).ok && !vv({ lh: [45, 57], lhFingers: [5, 1] }).ok && !vv({ rhFingers: [1, 2] }).ok);
  const w321 = vv({ rhFingers: [3, 2, 1] });
  check('11 Griff: rechts 3-2-1 aufsteigend → Warnung, kein Fehler; null-Finger erlaubt',
    w321.ok && w321.warnings.length === 1 && vv({ rhFingers: [1, null, 5] }).ok && !vv({ rh: [], lh: [] }).ok);
  check('11 Griff: Spanne über Oktave plus Terz → Warnung', vv({ rh: [57, 60, 74], rhFingers: [1, 2, 5] }).warnings.some((x) => /Spanne/.test(x)));
  const d1x = voicingDiff(AM, DF);
  check('11 Wechsel Am → D/F#: rechts 1 bleibt auf A3, 2 und 4 los, 3 auf D4 dazu',
    eq(d1x.rh.keep, [{ key: 57, finger: 1 }]) && eq(d1x.rh.release.map((x) => x.finger), [2, 4]) && eq(d1x.rh.add, [{ key: 62, finger: 3 }]) && !d1x.rh.move.length, JSON.stringify(d1x.rh));
  const d2x = voicingDiff(DF, F69);
  check('11 Wechsel D/F# → F6/9: rechts 1 und 3 bleiben, 2 auf C4 und 5 auf G4 dazu; links 5 Fis2→F2 (−1), 1 D3→C3 (−2)',
    eq(d2x.rh.keep.map((x) => x.finger), [1, 3]) && eq(d2x.rh.add, [{ key: 60, finger: 2 }, { key: 67, finger: 5 }])
    && eq(d2x.lh.move, [{ finger: 5, from: 42, to: 41, semis: -1 }, { finger: 1, from: 50, to: 48, semis: -2 }]) && !d2x.lh.keep.length, JSON.stringify(d2x.lh));
  const d3x = voicingDiff({ rh: [57, 60, 64] }, { rh: [57, 62] });
  check('11 Wechsel ohne Fingersätze: über Töne', eq(d3x.rh.keep.map((x) => x.key), [57]) && eq(d3x.rh.release.map((x) => x.key), [60, 64]) && eq(d3x.rh.add.map((x) => x.key), [62]));
  const oldV = { rh: [69, 72, 76], fingers: [1, 3, 5], lh: 45 };
  const up1 = upgradeVoicing(oldV), up2 = upgradeVoicing(up1);
  check('11 Griff-Migration: lh als Zahl → Liste, fingers → rhFingers; zweiter Lauf ändert nichts',
    eq(up1, { rh: [69, 72, 76], lh: [45], lhFingers: [null], rhFingers: [1, 3, 5] }) && eq(up2, up1) && validateVoicing(up1).ok, JSON.stringify(up1));
  const dv = (s) => defaultVoicing(s);
  check('11 Standardlage: Am um C4 mit Bass A2, D/F# mit F♯ im Bass, F6/9 ohne Quinte 1-2-3-5',
    eq(dv('Am'), { rh: [57, 60, 64], rhFingers: [1, 3, 5], lh: [45], lhFingers: [5] })
    && dv('D/F#').lh[0] % 12 === 6 && dv('D/F#').lh[0] < dv('D/F#').rh[0]
    && eq(dv('F6/9').rh.map((m) => m % 12), [5, 7, 9, 2]) && !dv('F6/9').rh.some((m) => m % 12 === 0)
    && eq(dv('F6/9').rhFingers, [1, 2, 3, 5]) && dv('Quatsch') === null, JSON.stringify(dv('F6/9')));
  const song9 = { voicings: { Am: AM } };
  check('11 Griff im Song: eigener, sonst Standardlage (std)', voicingFor(song9, 'Am').std === false && voicingFor(song9, 'Dm').std === true);
  check('11 Bewegungssatz: Am → D/F#, D/F# → F6/9 (beide Hände), ohne Finger nur Töne',
    moveText(AM, DF, { lh: false }) === 'Daumen bleibt auf A. C und E loslassen, 3 auf D.'
    && moveText(DF, F69) === 'Rechts: Daumen und 3 bleiben auf A und D, 2 auf C und 5 auf G dazu. Links: eine Stufe tiefer.'
    && moveText({ rh: [57, 60, 64] }, { rh: [57, 62] }) === 'A bleibt. C und E loslassen, D dazu.',
    `${moveText(AM, DF, { lh: false })} | ${moveText(DF, F69)} | ${moveText({ rh: [57, 60, 64] }, { rh: [57, 62] })}`);
  check('11 Bass-Hinweis mit Griffen', bassText(AM, DF) === 'Bass: runter zum F♯' && bassText(DF, F69) === 'Bass: runter zum F' && bassText(null, AM) === 'Bass: A');

  /* 12 — timeline.js */
  const ts = vs(base()).song;
  check('12 Zeitleiste: Schlag ↔ Sekunde umkehrbar (Offset 1,5 s, 80 BPM)',
    beatToSec(ts, 0) === 1.5 && beatToSec(ts, 4) === 4.5 && [0, 1.25, 7.5, 33].every((b) => Math.abs(secToBeat(ts, beatToSec(ts, b)) - b) < 1e-9));
  check('12 chordAt: vor dem ersten null, genau auf und zwischen Ereignissen',
    chordAt({ events: [{ at: 1, chord: 'Am' }, { at: 3.5, chord: 'D' }] }, 0.5) === null && chordAt(ts, 3.5) === 'D/F#' && chordAt(ts, 3.49) === 'Am' && chordAt(ts, 100) === 'F6/9');
  check('12 eventsIn: das am Anfang klingende Ereignis kommt bei fromBeat mit',
    eq(eventsIn(ts, 2, 7), [{ at: 2, chord: 'Am' }, { at: 3.5, chord: 'D/F#' }, { at: 6, chord: 'F6/9' }]) && eq(eventsIn(ts, 0, 3.5), [{ at: 0, chord: 'Am' }]));
  check('12 quantize ½ und ¼', quantize(3.3) === 3.5 && quantize(3.2) === 3 && quantize(3.2, 0.25) === 3.25 && quantize(-0.1) === 0 && Object.is(quantize(-0.1), 0));
  const tw2 = normalizeSong({ ...base(), events: [{ at: 0, chord: 'Am' }, { at: 3.5, chord: 'D/F#' }, { at: 8, chord: 'Am' }, { at: 11.5, chord: 'D/F#' }],
    sections: [{ id: 'v1', name: 'Strophe 1', bar: 1, bars: 2 }, { id: 'v2', name: 'Strophe 2', bar: 3, bars: 2 }, { id: 'r', name: 'Refrain', bar: 5, bars: 1 }] });
  const ph = phrasesOf({ ...tw2, events: [...tw2.events, { at: 16, chord: 'F6/9' }] });
  check('12 phrasesOf: gleiche Abschnitte zu einer Phrase („Strophe 1/2“)', ph.length === 2 && ph[0].name === 'Strophe 1/2' && eq(ph[0].sections, ['v1', 'v2'])
    && eq(ph[0].events, [{ at: 0, chord: 'Am' }, { at: 3.5, chord: 'D/F#' }]) && ph[1].name === 'Refrain', JSON.stringify(ph.map((x) => x.name)));
  check('12 sectionRange, chordSequence, Zählzeit', eq(sectionRange(ts, { bar: 3, bars: 2 }), { fromBeat: 8, toBeat: 16 })
    && eq(chordSequence(tw2, 0, 16), ['Am', 'D/F#', 'Am', 'D/F#']) && countLabel(ts, 3.5) === '4 und' && countLabel(ts, 4) === '1' && beatsText(1.5) === '1½');
  check('12 Vorgänger: aus der Ereignisfolge, ohne Ereignisse der davor in chords',
    eq(predecessors(tw2, 'Am'), ['D/F#']) && eq(predecessors({ chords: ['Am', 'D', 'F'], events: [] }, 'Am'), ['F']));

  /* 13 — tap.js */
  const taps = [0, 0.75, 1.5, 2.25, 3.0, 3.75, 5.2, 5.95, 6.7];
  const tt = tapTempo(taps);
  check('13 Tipp-Tempo: 80 BPM mit einem Ausreißer, unter 8 Tipps noch keins', tt.bpm === 80 && tapTempo(taps.slice(0, 7)).bpm === null && tapTempo(taps.slice(0, 7)).need === 1, JSON.stringify(tt));
  const ids = ['dQw4w9WgXcQ'];
  check('13 YouTube-ID aus Link', [
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10s', 'youtu.be/dQw4w9WgXcQ?si=x', 'https://youtube.com/shorts/dQw4w9WgXcQ',
    'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ', 'dQw4w9WgXcQ', 'm.youtube.com/watch?v=dQw4w9WgXcQ',
  ].every((u) => parseYouTubeId(u) === ids[0]) && parseYouTubeId('https://example.com/watch?v=dQw4w9WgXcQ') === null && parseYouTubeId('kurz') === null);
  const sc = scoreTaps([{ at: 0, chord: 'Am' }, { at: 3.5, chord: 'D' }, { at: 6, chord: 'F' }, { at: 8, chord: 'Am' }], [0.1, 3.0, 6.4, 20]);
  check('13 Wann: getroffen / zu früh / zu spät / verpasst', eq(sc.results.map((r) => r.result), ['hit', 'early', 'late', 'missed']) && sc.hits === 1 && sc.extra === 1);
  check('13 Wann: Auswertungszeile', tapSummary(scoreTaps([{ at: 0, chord: 'Am' }, { at: 2, chord: 'D' }, { at: 4, chord: 'Am' }, { at: 6, chord: 'D' }], [0, 2.5, 4, 6.5])) === '2 von 4 Wechseln getroffen. Wechsel zu D kam zweimal zu spät.');
  let wn = newWann('x');
  const allHit = { hits: 4, total: 4 }, poor = { hits: 1, total: 4 };
  for (let i = 0; i < 3; i++) wn = applyWann(wn, allHit, d1).state;
  const wnDown = applyWann(applyWann(wn, poor, d1).state, poor, d1);
  check('13 Wann-Stufen: 3× sauber hoch, 2× schlecht runter', wn.stage === 2 && wnDown.state.stage === 1 && wnDown.down);

  /* 14 — Migration 2 */
  const v1 = [
    { id: 'settings', plan: 'Abends', mic: true }, { id: 'dataVersion', v: 1 },
    { id: 'phrase:z1', solid: true, bpm: 60 }, { id: 'phrase:ref', bpm: 52 },
    { id: 'card:Am:song', box: 3 }, { id: 'loop:am-f', bpm: 58 },
  ];
  const m1 = runMigrations(v1, 1, 2), m2 = runMigrations(m1.records, 1, 2);
  const rec = (rs, id) => rs.find((r) => r.id === id);
  const prSong = rec(m1.records, 'song:perfect-ruin')?.song;
  check('14 Migration 2: Song Perfect Ruin ohne Ereignisse, Abschnitte und Griffe, aktuell',
    prSong && prSong.title === 'Perfect Ruin' && eq(prSong.chords, ['Am', 'D', 'F', 'Dm', 'C']) && prSong.events.length === 0
    && prSong.sections.length === 0 && Object.keys(prSong.voicings).length === 0 && prSong.bpm === null && validateSong(prSong).ok
    && rec(m1.records, 'settings').currentSong === 'perfect-ruin' && rec(m1.records, 'settings').plan === 'Abends');
  check('14 Migration 2: alte Phrasen unter archiv:, Karten und Loops unverändert',
    eq(rec(m1.records, 'archiv:phrase:z1'), { id: 'archiv:phrase:z1', solid: true, bpm: 60 }) && !rec(m1.records, 'phrase:z1')
    && eq(rec(m1.records, 'card:Am:song'), v1[4]) && eq(rec(m1.records, 'loop:am-f'), v1[5]));
  /* 15 — Liedseite: Abschnitte (marks.js), Tab-Text (tabtext.js), Platzhalter statt Liedtext */
  let mk = addMark([], 30.123, 'Strophe 1');
  mk = addMark(mk, 10, 'Intro 1');
  mk = addMark(mk, 30.2, 'Strophe X');
  check('15 Abschnitte: sortiert, nahe Marke ersetzt, Name mit Nummer', mk.length === 2 && mk[0].name === 'Intro 1' && mk[1].name === 'Strophe X' && mk[1].sec === 30.2
    && nextMarkName([{ name: 'Strophe 1' }, { name: 'Strophe 2' }], 'Strophe') === 'Strophe 3' && nextMarkName(mk, 'Refrain') === 'Refrain 1');
  check('15 Abschnitte: Bereich bis zur nächsten Marke bzw. zum Ende, Marke zur Zeit',
    eq(markRange(mk, mk[0].id, 200), { start: 10, end: 30.2 }) && eq(markRange(mk, mk[1].id, 200), { start: 30.2, end: 200 })
    && markAt(mk, 5) === null && markAt(mk, 31).name === 'Strophe X' && removeMark(mk, mk[0].id).length === 1);
  const lp = addLoop([], { name: 'Loop 1', start: 12.345, end: 20 });
  const lp2 = addLoop(lp.loops, { name: 'Übergang', start: 30, end: 28 });
  check('15 Loops: speichern (Start vor Ende, gerundet), ändern, löschen',
    lp.id === 'l1' && lp.loops[0].start === 12.35 && lp2.id === 'l2' && lp2.loops[1].start === 28 && lp2.loops[1].end === 30
    && updateLoop(lp.loops, 'l1', { end: 10 })[0].end === 12.85 && updateLoop(lp.loops, 'l1', { start: 25 })[0].start === 19.5
    && updateLoop(lp.loops, 'l1', { pre: 2 })[0].pre === 2 && removeLoop(lp2.loops, 'l1').length === 1);
  check('15 Uhrzeit', fmtClock(65.37) === '1:05' && fmtClock(65.37, { tenths: true }) === '1:05,3');
  check('15 Tab-Text: Akkordzeilen, Überschriften, Gitarren-Tab, Text',
    classifyLine('Am      D/F#   F6/9') === 'chords' && classifyLine('[Chorus]') === 'header' && classifyLine('Strophe 2:') === 'header'
    && classifyLine('e|---0---3---|') === 'tab' && classifyLine('Zeile A') === 'text' && classifyLine('| Am | F | x2') === 'chords'
    && classifyLine('A long line') === 'text' && classifyLine('   ') === 'blank');
  const tabT = '[Verse]\n[ch]Am[/ch]   [ch]D/F#[/ch]\nZeile A\nF6/9  Am  C\nZeile B';
  check('15 Tab-Text: UG-Auszeichnung entfernt, Akkorde in Reihenfolge',
    parseTabText(tabT)[1].text === 'Am   D/F#' && eq(chordsInText(tabT), ['Am', 'D/F#', 'F6/9', 'C']));
  // Beim Kopieren verlorene Zeilenumbrüche (Platzhalter statt Liedtext).
  const glued = '```\n[Intro]Am D/F# F [Verse]Am  D/F#  F    Zeile eins mit Text Am      Dm   F    Zeile zwei endet hier?     Am     Dm       FZeile drei ohne Einzug'
    + ' [Chorus]                C    FZeile vier ist auch da            AmZeile fuenf ganz am Ende A long line [Outro]Am D/F# FDm Dm F\n```';
  const back = stripMarkup(glued).split('\n');
  check('15 Tab-Text: zusammengeklebte Zeilen getrennt, Spalten bleiben',
    eq(back.slice(0, 8), ['', '[Intro]', 'Am D/F# F', '', '[Verse]', 'Am  D/F#  F', '    Zeile eins mit Text', 'Am      Dm   F'])
    && back.includes('     Am     Dm       F') && back.includes('Zeile drei ohne Einzug') && back.includes('                C    F')
    && back.includes('Zeile fuenf ganz am Ende A long line') && back.includes('Dm Dm F')
    && eq(chordsInText(glued), ['Am', 'D/F#', 'F', 'Dm', 'C']), JSON.stringify(back));
  const head = parseTabText('X\nTestsong Chords\n by Test\n\n[Intro]\nAm F', { title: 'Testsong', artist: 'Test' });
  check('15 Tab-Text: kopierte Kopfzeilen (Titel, „by …“, „X“) fallen weg', head[0].text === '[Intro]'
    && parseTabText('Zeile A\n[Intro]', { title: 'Testsong' })[0].text === 'Zeile A');
  check('15 Export ohne Tabs und Text, auf Wunsch mit', !('tabText' in JSON.parse(exportSong({ ...TS, tabText: 'Zeile A' })))
    && JSON.parse(exportSong({ ...TS, tabText: 'Zeile A' }, { lyrics: true })).tabText === 'Zeile A' && validateSong({ ...TS, chords: [], events: [] }).ok);

  /* 16 — Leadsheet: Abschnitte als Takte, Akkorde auf Schlägen */
  let ls = { ...TS, sections: [], events: [] };
  ls = addSection(ls, { name: 'Intro', bars: 2, startSec: 4 });
  ls = addSection(ls, { name: 'Strophe 1', bars: 4, startSec: 11 });
  ls = setChordAt(setChordAt(setChordAt(ls, 0, 'Am'), 3, 'D/F#'), 8, 'F6/9');
  ls = setChordAt(ls, 12, 'C');
  check('16 Abschnitte lückenlos ab Takt 1', eq(sectionList(ls).map((x) => [x.name, x.bar, x.fromBeat, x.toBeat]), [['Intro', 1, 0, 8], ['Strophe 1', 3, 8, 24]]));
  const g = sectionGrid(ls, sectionList(ls)[0]);
  check('16 Raster: je Takt 4 Schläge, vorgezogener Wechsel auf 4 erkannt', g.length === 2 && g[0].cells.length === 4
    && g[0].cells[0].chord === 'Am' && g[0].cells[3].chord === 'D/F#' && g[0].cells[3].early && g[1].cells.every((c) => !c.chord));
  check('16 Raster: am Abschnittsanfang klingt der Akkord weiter (Zelle 1)', sectionGrid(setChordAt(ls, 8, null), sectionList(ls)[1])[0].cells[0].chord === 'D/F#');
  const big = resizeSection(ls, sectionList(ls)[0].id, 3);
  check('16 Takte ändern: spätere Abschnitte und Akkorde rücken mit', sectionList(big)[1].bar === 4
    && big.events.find((e) => e.chord === 'F6/9').at === 12 && big.events.find((e) => e.chord === 'C').at === 16);
  const small = resizeSection(setChordAt(ls, 20, 'Dm'), sectionList(ls)[1].id, 2);
  check('16 Takte kürzen: Akkorde der weggefallenen Takte fallen weg', !small.events.some((e) => e.chord === 'Dm') && small.events.some((e) => e.chord === 'C')
    && sectionList(small)[1].bars === 2);
  const del = deleteSection(ls, sectionList(ls)[0].id);
  check('16 Abschnitt löschen: Rest rückt auf Takt 1', sectionList(del)[0].bar === 1 && del.events[0].at === 0 && del.events[0].chord === 'F6/9');
  const m34 = setBeatsPerBar(ls, 3);
  check('16 Taktart 3/4: Takt und Zählzeit bleiben, Schlag 4 fällt weg', m34.beatsPerBar === 3 && !m34.events.some((e) => e.chord === 'D/F#')
    && m34.events.find((e) => e.chord === 'F6/9').at === 6);
  const tm = sectionTimes({ ...ls, bpm: 60 }, 200);
  check('16 Zeiten: Start aus „Start hier“, Ende aus Tempo bzw. nächstem Abschnitt', tm[0].start === 4 && tm[0].end === 11 && tm[1].start === 11 && tm[1].end === 27);
  const pp = playPos({ ...ls, bpm: 60 }, 13.5, 200);
  check('16 Stelle zur Videozeit: Abschnitt und Schlag', pp.id === sectionList(ls)[1].id && Math.abs(pp.beat - 10.5) < 1e-9 && playPos({ ...ls, bpm: null }, 13.5).beat === null && playPos(ls, 2) === null);
  const tb = tabBlocks('X\n[Intro]\nAm F\n\n[Verse]\nAm  D/F#  F\nZeile A\nAm  Dm  C  F\nZeile B\n[Chorus]\nC F');
  check('16 Tabs in Blöcke an den Überschriften', eq(tb.map((b) => b.header), [null, 'Intro', 'Verse', 'Chorus']) && tb[2].lines.length === 4
    && blocksForSections(ls, tb).map[sectionList(ls)[1].id].header === 'Verse');
  const ft = sectionsFromTabs({ ...TS, chords: [] }, '[Intro]\nAm D/F# F\n[Verse]\nAm  D/F#  F\nZeile A\nAm  Dm  C  F\nZeile B\n[Chorus]\nC  F\n[Verse]\nAm F');
  check('16 Abschnitte aus Tabs: Namen, 2 Takte je Akkordzeile, Akkorde als Vorschlag',
    eq(sectionList(ft).map((x) => [x.name, x.bars]), [['Intro', 2], ['Strophe 1', 4], ['Refrain 1', 2], ['Strophe 2', 2]])
    && eq(ft.events.slice(0, 5), [{ at: 0, chord: 'Am' }, { at: 4, chord: 'D/F#' }, { at: 6, chord: 'F' }, { at: 8, chord: 'Am' }, { at: 12, chord: 'D/F#' }])
    && ft.chords.includes('Dm') && validateSong(ft).ok, JSON.stringify(ft.events.slice(0, 6)));
  const mk3 = marksToSections({ ...TS, sections: [], marks: [{ id: 'm1', name: 'Strophe 1', sec: 11 }, { id: 'm2', name: 'Intro', sec: 2 }] });
  check('16 Alte Marken werden Abschnitte mit Startzeit', eq(sectionList(mk3).map((x) => [x.name, x.startSec, x.bars]), [['Intro', 2, 8], ['Strophe 1', 11, 8]]) && !('marks' in mk3));
  const v2rec = [{ id: 'dataVersion', v: 2 }, { id: 'song:a', song: { ...TS, id: 'a', sections: [], marks: [{ id: 'm1', name: 'Intro', sec: 1 }] } }, { id: 'song:b', song: TS }];
  const mig3 = runMigrations(v2rec, 2, 3), mig3b = runMigrations(mig3.records, 2, 3);
  check('16 Migration 3: Marken → Abschnitte, Songs mit Abschnitten bleiben, zweiter Lauf ändert nichts',
    mig3.records.find((r) => r.id === 'song:a').song.sections[0].startSec === 1 && eq(mig3.records.find((r) => r.id === 'song:b'), v2rec[2])
    && mig3b.steps[0].put.length === 0);

  let ob = { ...TS, sections: [], events: [] };
  ob = addSection(ob, { name: 'Intro', bars: 2, startSec: 0 });
  ob = addSection(ob, { name: 'Refrain 1', bars: 2, startSec: 40 });
  ob = addSection(ob, { name: 'Strophe 1', bars: 4, startSec: 10 });
  ob = setChordAt(setChordAt(setChordAt(ob, 0, 'Am'), 8, 'F'), 10, 'C');
  ob = setChordAt(ob, 16, 'Dm');
  const ob2 = orderByStart(ob);
  check('16 Nach Startzeit ordnen: Abschnitte nehmen ihre Akkorde mit, klingender Akkord bleibt',
    eq(sectionList(ob2).map((x) => [x.name, x.bar]), [['Intro', 1], ['Strophe 1', 3], ['Refrain 1', 7]])
    && eq(ob2.events, [{ at: 0, chord: 'Am' }, { at: 8, chord: 'Dm' }, { at: 24, chord: 'F' }, { at: 26, chord: 'C' }])
    && orderByStart(ob2) === ob2, JSON.stringify(ob2.events));
  const pp2 = playPos({ ...ob2, bpm: null }, 25);
  check('16 Ohne Tempo: Stelle ungefähr aus dem Abstand zum nächsten Start', pp2.id === sectionList(ob2)[1].id && Math.abs(pp2.beat - (8 + 8)) < 1e-9);
  const bt = barsTime({ ...ob2, bpm: 60 }, sectionList(ob2)[1].id, 4, 5);
  check('16 Takte im Video: mit Tempo je 4 s, außerhalb des Abschnitts begrenzt', bt.start === 14 && bt.end === 22
    && barsTime({ ...ob2, bpm: 60 }, sectionList(ob2)[1].id, 1, 3).end === 14 && barsTime({ ...ob2, bpm: null }, sectionList(ob2)[1].id, 3, 3).end === 17.5);
  check('16 Takt-Auswahl: ein Takt, Bereich in beiden Richtungen; Vorlauf = ein Takt', eq(barSpan(5, 5), { from: 5, to: 5 }) && eq(barSpan(3, 6), { from: 3, to: 6 }) && eq(barSpan(6, 3), { from: 3, to: 6 })
    && loopLead({ bpm: 120, beatsPerBar: 4 }) === 2 && loopLead({ bpm: null }) === 2 && loopLead({ bpm: 60, beatsPerBar: 3 }) === 3);

  let fb = { ...TS, bpm: 80, sections: [], events: [] };
  fb = addSection(fb, { name: 'Intro', startSec: 0 });
  fb = addSection(fb, { name: 'Strophe 1', startSec: 12 });
  fb = addSection(fb, { name: 'Refrain 1', startSec: 36 });
  fb = setChordAt(fb, sectionList(fb)[2].fromBeat, 'F');
  const fb2 = fitBars(fb);
  check('16 Takte aus der Zeit: 12 s bei 80 BPM = 4 Takte, 24 s = 8, letzter bleibt; Akkorde rücken mit',
    eq(sectionList(fb2).map((x) => x.bars), [4, 8, 8]) && fb2.events[0].at === sectionList(fb2)[2].fromBeat && fitBars(fb2) === fb2
    && eq(sectionList(fitBars({ ...fb, bpm: null })).map((x) => x.bars), [8, 8, 8]));
  const fb3 = fitBars(updateSection(fb, sectionList(fb)[0].id, { barsSet: true }));
  check('16 Takte von Hand bleiben', eq(sectionList(fb3).map((x) => x.bars), [8, 8, 8]));

  const tc = tapChordAt({ ...fb2, bpm: 80 }, 12 + 4 * 0.75 + 0.3, 'Dm');
  check('16 Akkord tippen: Videozeit → nächster Schlag im Abschnitt', tc.at === sectionList(fb2)[1].fromBeat + 4 && tc.song.events.some((e) => e.at === tc.at && e.chord === 'Dm')
    && tapChordAt({ ...fb2, bpm: null }, 13, 'Dm') === null);
  const vk = voicingFromKeys([62, 50, 65, 69, 62]);
  check('16 Griff aus Tasten: unter G3 links, sonst rechts, ohne Finger', eq(vk.lh, [50]) && eq(vk.rh, [62, 65, 69]) && vk.rhFingers.every((f) => f === null) && validateVoicing(vk).ok);

  const sv1 = songFromVideo('Interpret A - Titel B (Official Music Video)', 'Interpret A VEVO');
  const sv2 = songFromVideo('Titel B [Official Audio]', 'Interpret A - Topic');
  const sv3 = songFromVideo('Interpret A – Titel B – Teil 2 (Live)', '');
  check('16 Titel und Interpret aus dem Video: „A - B“, Zusätze weg, sonst Kanal', eq(sv1, { title: 'Titel B', artist: 'Interpret A' })
    && eq(sv2, { title: 'Titel B', artist: 'Interpret A' }) && eq(sv3, { title: 'Titel B - Teil 2', artist: 'Interpret A' })
    && songFromVideo('', '').title === '', JSON.stringify([sv1, sv2, sv3]));

  let ag = { ...TS, bpm: 80, sections: [], events: [] };
  ag = addSection(ag, { name: 'Intro', bars: 2, startSec: 0 });
  ag = tapChordAt(tapChordAt(ag, 0, 'Am').song, 3, 'Am').song; // Beat 0, dann Beat 4 (3 s bei 80 BPM)
  check('16 Derselbe Akkord noch einmal geht nicht verloren (Tippen, Raster, Tabs)', eq(ag.events, [{ at: 0, chord: 'Am' }, { at: 4, chord: 'Am', again: true }])
    && setChordAt(setChordAt(ag, 6, 'F'), 7, 'F').events.length === 4
    && sectionsFromTabs({ ...TS, chords: [] }, '[Intro]\nAm Am F').events.length === 3, JSON.stringify(ag.events));

  let kr = { ...TS, bpm: 80, sections: [], events: [] };
  kr = addSection(kr, { name: 'Intro', bars: 4, startSec: 0 });
  kr = setChordAt(setChordAt(setChordAt(kr, 0, 'F'), 4, 'Am'), 8, 'C');
  const kr1 = setChordAt(kr, 0, 'Am');     // Am setzen, im nächsten Takt steht schon Am
  const kr2 = setChordAt(setChordAt(kr, 8, 'Am'), 4, null); // Mittleren Wechsel entfernen: Am … Am bleibt
  check('16 Gleicher Akkord im Nachbartakt wird nicht verschluckt (Setzen, Entfernen)',
    eq(kr1.events.map((e) => [e.at, e.chord]), [[0, 'Am'], [4, 'Am'], [8, 'C']]) && kr1.events[1].again === true
    && eq(kr2.events.map((e) => [e.at, e.chord]), [[0, 'F'], [8, 'Am']]) === true
    && eq(setChordAt(setChordAt(setChordAt(kr, 0, 'Am'), 4, 'Am'), 8, 'Am').events.length, 3), JSON.stringify([kr1.events, kr2.events]));

  const fl = fitBars(fb, 60); // letzter Abschnitt (Start 36 s) reicht bis zum Videoende (60 s): 24 s bei 80 BPM = 8 Takte
  const fl2 = fitBars({ ...fb, bpm: 80, sections: sectionList(fb).map(({ fromBeat, toBeat, ...x }) => (void fromBeat, void toBeat, x)).map((x, i, a) => (i === a.length - 1 ? { ...x, startSec: 12 } : x)) }, 100);
  check('16 Letzter Abschnitt reicht bis zum Videoende (Takte laufen mit), von Hand gesetzte bleiben',
    sectionList(fl)[2].bars === 8 && sectionList(fl2)[2].bars === 29 && fitBars(updateSection(fb, sectionList(fb)[2].id, { barsSet: true }), 100) === updateSection(fb, sectionList(fb)[2].id, { barsSet: true }) === false
    && sectionList(fitBars(updateSection(fb, sectionList(fb)[2].id, { barsSet: true }), 100))[2].bars === 8 && sectionList(fitBars(fb, 0))[2].bars === 8, JSON.stringify([sectionList(fl2).map((x) => x.bars)]));

  /* 17 — Folgen üben: 2-Takt-Folgen, Vorlauf, Wiederholen, Tempo */
  let dr = { ...TS, sections: [], events: [] };
  dr = addSection(dr, { name: 'Strophe 1', bars: 5 });
  dr = addSection(dr, { name: 'Strophe 2', bars: 2 });
  dr = setChordAt(setChordAt(setChordAt(dr, 0, 'Am'), 7, 'F'), 8, 'C');
  dr = setChordAt(setChordAt(dr, 20, 'Am'), 27, 'F');
  const ch = drillChunks(dr);
  check('17 Folgen: je 2 Takte, Rest als 1 Takt, gleiche Folge nur einmal', eq(ch.map((c) => [c.name, c.bar, c.bars]),
    [['Strophe 1 · Takt 1–2', 1, 2], ['Strophe 1 · Takt 3–4', 3, 2], ['Strophe 1 · Takt 5', 5, 1]]), JSON.stringify(ch.map((c) => c.name)));
  check('17 Folge beginnt mit dem klingenden Akkord', ch[2].grid[0].cells[0].chord === 'C' && ch[2].grid[0].cells[0].carried);
  check('17 Nur gewählte Abschnitte', eq(drillChunks(dr, { sectionIds: [sectionList(dr)[1].id] }).map((c) => c.name), ['Strophe 2 · Takt 1–2']));
  check('17 Durchgang: 1 Takt Vorlauf plus Folge', cycleBeats(ch[0], 4) === 12 && cycleBeats(ch[2], 4) === 8);
  const ph0 = cyclePhase(ch[0], 4, 2.5), ph1 = cyclePhase(ch[0], 4, 4), ph2 = cyclePhase(ch[0], 4, 11.9);
  check('17 Phase: Einzählen, dann Zelle mit klingendem und nächstem Akkord, danach vorbei',
    ph0.lead && ph0.count === 3 && ph0.left === 2 && !ph1.lead && ph1.cell === 0 && ph1.chord === 'Am' && ph1.next === 'F'
    && ph2.cell === 7 && ph2.chord === 'F' && ph2.next === null && cyclePhase(ch[0], 4, 12) === null);
  check('17 Weiter, Wiederholen, Tempo ±5 in Grenzen', nextChunk(2, 3) === 0 && nextChunk(1, 3, true) === 1 && nextChunk(0, 0) === -1
    && stepBpm(77, 1) === 82 && stepBpm(DRILL.min + 2, -1) === DRILL.min && startBpm({ bpm: null }) === DRILL.start && startBpm({ bpm: 90 }, 65) === 65);

  /* 17 — Nur Akkorde: echte Wechsel, Bewertung, Kästchen, Auswahl */
  const sp = swapPairs(dr);
  check('17 Wechsel: echte Übergänge in Song-Reihenfolge, über direkt folgende Abschnitte hinweg',
    eq(sp.pairs.map((p) => [p.key, p.count]), [['Am>F', 2], ['F>C', 1], ['C>Am', 1]]) && eq(sp.chords, ['Am', 'F', 'C'])
    && eq(swapPairs(dr, { sectionIds: [sectionList(dr)[1].id] }).pairs.map((p) => p.key), ['Am>F']), JSON.stringify(sp));
  let gap = addSection({ ...TS, sections: [], events: [] }, { name: 'A', bars: 1 });
  gap = addSection(addSection(gap, { name: 'B', bars: 1 }), { name: 'C', bars: 1 });
  gap = setChordAt(setChordAt(setChordAt(gap, 0, 'Am'), 4, 'F'), 8, 'C');
  check('17 Wechsel: nicht gewählter Abschnitt dazwischen erfindet keinen Übergang',
    swapPairs(gap, { sectionIds: [sectionList(gap)[0].id, sectionList(gap)[2].id] }).pairs.length === 0);
  check('17 Bewertung: flüssig ≤ 1 Schlag (mind. 0,8 s), zögerlich ≤ 2,5 s, sonst bzw. mit Fehlgriff hakt; aufgedeckt höchstens zögerlich',
    rateSwap(0.8) === 'fluent' && rateSwap(0.9, { bpm: 60 }) === 'fluent' && rateSwap(0.9, { bpm: 120 }) === 'slow'
    && rateSwap(2.5) === 'slow' && rateSwap(2.6) === 'stuck' && rateSwap(0.5, { missed: true }) === 'stuck'
    && rateSwap(0.5, { peeked: true }) === 'slow' && rateSwap(2, { peeked: true }) === 'slow');
  let sw = undefined;
  for (let i = 0; i < 3; i++) sw = applySwap(sw, 'fluent', 0.7 + i / 10, '2026-01-01');
  const sw2 = [1, 2, 3].reduce((t) => applySwap(t, 'fluent', 0.6, '2026-01-01'), sw);
  const sw3 = [1, 2, 3].reduce((t) => applySwap(t, 'fluent', 0.6, '2026-01-02'), sw2);
  check('17 Kästchen: 3× flüssig → +1, höchstens einmal am Tag; hakt → 1; Bestwert',
    sw.box === 2 && sw.best === 0.7 && sw2.box === 2 && sw3.box === 3 && sw3.best === 0.6
    && applySwap(sw3, 'stuck', 9, '2026-01-02').box === 1 && applySwap(sw3, 'stuck', 0.1, '2026-01-02').best === 0.6
    && applySwap(sw3, 'slow', 2, '2026-01-02').box === 3, JSON.stringify([sw, sw2, sw3]));
  const seq = (xs) => { let i = 0; return () => xs[i++ % xs.length]; };
  const solid = Object.fromEntries(sp.pairs.map((p) => [p.key, { box: 3, last: 'fluent' }]));
  const picks = Array.from({ length: 200 }, (_, i) => pickSwap({ ...sp, states: { 'Am>F': { box: 3 } }, lastKey: 'F>C', rand: seq([(i * 0.618) % 1]) }));
  check('17 Auswahl: nie derselbe direkt, schwache öfter, Zufall erst wenn alle sitzen',
    picks.every((p) => p.key !== 'F>C' && !p.random) && picks.filter((p) => p.key === 'C>Am').length > picks.filter((p) => p.key === 'Am>F').length * 2
    && !allSolid(sp.pairs, {}) && allSolid(sp.pairs, solid)
    && pickSwap({ ...sp, states: solid, rand: seq([0.1, 0.5]) }).random === true && pickSwap({ ...sp, states: solid, rand: seq([0.9, 0.5]) }).random === false
    && pickSwap({ ...sp, states: solid, rand: seq([0.1, 0.99]) }).from !== pickSwap({ ...sp, states: solid, rand: seq([0.1, 0.99]) }).to
    && pickSwap({ pairs: [], chords: [], rand: Math.random }) === null);
  const chainy = Array.from({ length: 100 }, (_, i) => pickSwap({ ...sp, states: solid, current: 'C', rand: seq([0.9, (i + 0.5) / 100]) }));
  check('17 Auswahl: Wechsel vom liegenden Akkord aus bevorzugt', chainy.filter((p) => p.from === 'C').length >= 50);
  check('17 Neu oder hakend: erst geblockt A → B → A → B, sonst einmal',
    eq(swapQueue({ key: 'Am>F', from: 'Am', to: 'F' }, {}).map((x) => `${x.from}>${x.to}`), ['Am>F', 'F>Am', 'Am>F'])
    && swapQueue({ key: 'Am>F', from: 'Am', to: 'F' }, { 'Am>F': { last: 'slow' } }).length === 1
    && swapQueue({ key: 'Am>F', from: 'Am', to: 'F' }, { 'Am>F': { last: 'stuck' } }).length === 3);
  const wk = weakestSwap([{ key: 'Am>F', from: 'Am', to: 'F', rating: 'slow', sec: 2 }, { key: 'F>C', from: 'F', to: 'C', rating: 'stuck', sec: 3 },
    { key: 'C>Am', from: 'C', to: 'Am', rating: 'fluent', sec: 0.5 }]);
  check('17 Runde: 30 Wechsel oder 3 min; schwächster Wechsel und seine Folge im Takt',
    roundOver(SWAP.roundChanges, 0) && roundOver(0, SWAP.roundSec) && !roundOver(29, 179) && wk.key === 'F>C'
    && weakestSwap([{ key: 'C>Am', from: 'C', to: 'Am', rating: 'fluent', sec: 0.5 }]) === null
    && chunkWith(dr, ch, 'F', 'C') === 1 && chunkWith(dr, ch, 'Am', 'F') === 0 && chunkWith(dr, ch, 'C', 'F') === -1, JSON.stringify(wk));

  check('14 Migration 2: zweiter Lauf ändert nichts', m2.steps[0].put.length === 0 && m2.steps[0].del.length === 0 && eq(m2.records, m1.records));
  }
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

/** Test 5c (nur Browser): ein Tempo-Durchgang in „Geführt“ mit einem
 *  vorgezogenen Wechsel auf „4 und“ plant den Akkord auf dem richtigen Achtel.
 *  Geplant wie in exercises/guided.js tempoPass (Einzähler 1 Takt, ganze
 *  Noten über accomp.js stepHits), bei 60 BPM gerendert und im Signal
 *  nachgemessen: Anschläge bei 0, 3,5, 4 (ganze Note: neuer Takt) und 8
 *  Schlägen nach der Eins. */
async function tempoPlanTest() {
  const { createClock } = await import('./clock.js');
  const sr = 44100, bpb = 4, bpm = 60, beat = 60 / bpm;
  const def = phraseDefs(testSong()).find((x) => x.id === 'v1');
  const { events, beats } = tempoEvents(def, bpb);
  const tl = { events, beatsPerBar: bpb };
  const ctx = new OfflineAudioContext(1, sr * 14, sr);
  const planned = [];
  const clock = createClock(ctx, {
    bpm, beatsPerBar: bpb, totalSteps: (bpb + 10) * 2,
    onStep(s) {
      const b = s.index / 2 - bpb;
      if (b < 0 || b >= beats) return;
      for (const h of stepHits(tl, b, { from: 0 })) {
        if (h.hand !== 'rh') continue;
        planned.push({ b, chord: h.chord });
        const o = ctx.createOscillator(), gn = ctx.createGain();
        gn.gain.setValueAtTime(0.5, s.time);
        gn.gain.setValueAtTime(0, s.time + 0.03);
        o.connect(gn).connect(ctx.destination);
        o.start(s.time); o.stop(s.time + 0.03);
      }
    },
  });
  clock.start(0.5, { timer: false });
  clock.fill(14);
  const d = (await ctx.startRendering()).getChannelData(0);
  const onsets = [];
  let quiet = 0;
  for (let i = 0; i < d.length; i++) if (i >= quiet && Math.abs(d[i]) > 0.001) { onsets.push(i / sr); quiet = i + sr * 0.2; }
  const one = 0.5 + bpb * beat; // Eins nach dem Einzähler
  const want = [0, 3.5, 4, 8].map((b) => one + b * beat);
  const worst = Math.max(...want.map((t, k) => Math.abs((onsets[k] ?? -9) - t)));
  return [{ name: '5 Takt: Wechsel auf „4 und“ im Tempo-Modus auf dem richtigen Achtel', ok: onsets.length === 4 && worst <= 0.001
    && eq(planned.map((x) => `${x.b}:${x.chord}`), ['0:Am', '3.5:D/F#', '4:D/F#', '8:F6/9']),
    detail: `${planned.map((x) => `${x.b}:${x.chord}`).join(' ')}; max. Abweichung ${(worst * 1000).toFixed(3)} ms` }];
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
    const pcs = Object.fromEntries(['Am', 'D', 'F', 'Dm', 'C'].map((x) => [x, parseChord(x).pcs]));
    const { results } = await checkFrame(frame([c.lh, ...c.rh]), sr, ['Am', 'D', 'F', 'Dm', 'C'], pcs);
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
    for (const fn of [clockTest, tempoPlanTest, audioSmoke, earTest]) {
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
