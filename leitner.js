/* leitner.js — REIN: Karteikasten für den Akkord-Blitz (Arbeitsanweisung 7.1).
   Kein DOM, kein Date.now(), kein Math.random(): `today` ('YYYY-MM-DD') und
   `rand` (() => Zahl in [0, 1)) kommen als Parameter.

   Karte (meta-Datensatz):
   { id: 'card:<Akkord-id>', box: 1..5, due: 'YYYY-MM-DD',
     pendingPromotion: 'YYYY-MM-DD' | null, beats, seen, lastResult }
   Die Funktionen behandeln `id` als undurchsichtigen Schlüssel. */

import { addDays } from './dates.js';

export const INTERVALS = Object.freeze({ 1: 1, 2: 2, 3: 4, 4: 8, 5: 16 });
export const MAX_BOX = 5;
export const MAX_LEVEL = 4;
export const MAX_DUE = 12;
export const MAX_NEW = 3;
export const INTRO_REPEATS = 3;

const ROOT_1 = ['Am:root', 'F:root', 'C:root', 'Dm:root'];

/** Freigeschaltete feste Akkorde je Stufe (chords.js); ab Stufe 3 kommen
 *  die Akkorde des aktuellen Songs in seinen Griffen dazu (songCardIds).
 *  Karten der früheren :song-Griffe bleiben gespeichert, werden aber nicht
 *  mehr gezeigt. */
export const LEVEL_CHORDS = Object.freeze({
  1: Object.freeze([...ROOT_1]),
  2: Object.freeze([...ROOT_1, 'D:root']),
  3: Object.freeze([...ROOT_1, 'D:root']),
  4: Object.freeze([...ROOT_1, 'D:root']),
});
export const SONG_LEVEL = 3;

export const cardId = (chordId) => `card:${chordId}`;
export const chordOfCard = (id) => id.replace(/^card:/, '');
/** Karte eines Song-Akkords: card:song:<songId>:<Symbol>. */
export const songCardId = (songId, symbol) => `card:song:${songId}:${symbol}`;
/** → { songId, symbol } oder null (feste Karte). */
export function songOfCard(id) {
  const m = /^card:song:([a-z0-9-]+):(.+)$/.exec(id);
  return m ? { songId: m[1], symbol: m[2] } : null;
}

/** Karten-ids der Stufe; songCards: Karten der Song-Akkorde (ab Stufe 3). */
export function unlockedCardIds(level, songCards = []) {
  const l = Math.min(MAX_LEVEL, Math.max(1, level));
  return [...LEVEL_CHORDS[l].map(cardId), ...(l >= SONG_LEVEL ? songCards : [])];
}

/** Neue, noch nie gesehene Karte. */
export function newCard(id, today) {
  return { id, box: 1, due: today, pendingPromotion: null, beats: 4, seen: 0, lastResult: null };
}

/** Countdown in Schlägen (bei 60 BPM). intro = geblockter Einstieg einer
 *  neuen Karte; ab Stufe 4 zählt das gespeicherte `beats` (min. 2). */
export function countdownBeats(card, level, intro = false) {
  if (intro || card.seen === 0) return 6;
  if (level < 4) return 4;
  return Math.max(2, card.beats ?? 4);
}

/** Selbsteinschätzung anwenden. result: 'sass' | 'wackelig' | 'nochmal'.
 *  Gibt eine neue Karte zurück (die alte bleibt unverändert). */
export function review(card, result, today, level = 1) {
  const c = { ...card, seen: (card.seen || 0) + 1, lastResult: result };
  if (result === 'sass') {
    if (card.pendingPromotion && card.pendingPromotion !== today) {
      c.box = Math.min(MAX_BOX, card.box + 1);
      c.pendingPromotion = null;
    } else {
      c.pendingPromotion = today;
    }
    c.due = addDays(today, INTERVALS[c.box]);
    if (level >= 4) c.beats = Math.max(2, (card.beats ?? 4) - 1);
  } else if (result === 'wackelig') {
    c.pendingPromotion = null;
    // Die Anweisung legt hier nur „Fach bleibt“ fest. Wackelige Karten kommen
    // morgen wieder, damit sie nicht tagelang liegen bleiben.
    c.due = addDays(today, 1);
  } else if (result === 'nochmal') {
    c.box = 1;
    c.pendingPromotion = null;
    c.due = today;
  } else {
    throw new Error(`Unbekanntes Ergebnis: ${result}`);
  }
  return c;
}

/** Kommt die Karte in dieser Runde noch einmal? */
export const needsRepeat = (result) => result === 'wackelig' || result === 'nochmal';

/** Abstand für die Wiederholung in der Runde: nach 3–5 anderen Karten. */
export const repeatGap = (rand) => 3 + Math.min(2, Math.floor(rand() * 3));

function byDue(a, b) {
  return a.due < b.due ? -1 : a.due > b.due ? 1 : 0;
}

/** Fisher-Yates mit übergebenem Zufall (deterministisch bei gleichem rand). */
function shuffled(list, rand) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Runde zusammenstellen.
 *  cards: alle freigeschalteten Karten (seen === 0 = neu).
 *  → { queue: [{ id, intro }], due: [ids], fresh: [ids], lead: id|null,
 *      overflow: [ids] }
 *  queue: zuerst fällige Karten (höchstens maxDue, die erste aus Fach ≥ 3,
 *  wenn es eine gibt), dann bis zu maxNew neue Karten, jede dreimal
 *  hintereinander. Was danach noch Zeit hat, füllt nextFiller(). overflow:
 *  fällige Karten ohne Platz — still auf die nächsten Tage verschieben
 *  (postponeOverflow), nie als Zahl anzeigen. */
export function buildRound({ cards, rand, maxDue = MAX_DUE, maxNew = MAX_NEW, allowNew = true, today }) {
  const seen = cards.filter((c) => c.seen > 0);
  const fresh = allowNew ? cards.filter((c) => !(c.seen > 0)).slice(0, maxNew) : [];
  // Zufällige Reihenfolge bei gleichem Datum, sonst die ältesten zuerst
  // (Array.prototype.sort ist stabil).
  const dueAll = shuffled(seen.filter((c) => c.due <= today), rand).sort(byDue);
  const due = dueAll.slice(0, maxDue);
  const overflow = dueAll.slice(maxDue).map((c) => c.id);

  // Mit Erfolg beginnen: die erste Karte aus Fach ≥ 3, wenn es eine gibt.
  let lead = null;
  const strongDue = due.findIndex((c) => c.box >= 3);
  if (strongDue > 0) due.unshift(...due.splice(strongDue, 1));
  else if (strongDue < 0) {
    const strong = seen.filter((c) => c.box >= 3 && !due.includes(c)).sort(byDue)[0];
    if (strong) lead = strong.id;
  }

  const queue = [
    ...(lead ? [{ id: lead, intro: false }] : []),
    ...due.map((c) => ({ id: c.id, intro: false })),
    ...fresh.flatMap((c) => Array.from({ length: INTRO_REPEATS }, () => ({ id: c.id, intro: true }))),
  ];
  return { queue, due: due.map((c) => c.id), fresh: fresh.map((c) => c.id), lead, overflow };
}

/** Füllkarte, wenn die Runde noch Zeit hat: die Karte mit dem ältesten
 *  `due`, nie dieselbe wie die letzte (außer es gibt nur eine).
 *  Gleichstand: die in dieser Runde seltener gezeigte (shown: id → Anzahl),
 *  sonst kreisten lange Runden nur um zwei Karten. */
export function nextFiller(cards, lastId, shown = {}) {
  const n = (c) => shown[c.id] || 0;
  const order = (list) => list.slice().sort((a, b) => byDue(a, b) || n(a) - n(b) || a.box - b.box);
  // Nur gesehene Karten (neue kommen über den geblockten Einstieg) — außer es
  // gibt weniger als 3 davon, dann alle, damit die Runde nicht auf einer oder
  // zwei Karten hängen bleibt.
  const seen = cards.filter((c) => c.seen > 0);
  const pool = order((seen.length >= 3 ? seen : cards).filter((c) => c.id !== lastId));
  return (pool[0] || cards.find((c) => c.id === lastId) || null)?.id ?? null;
}

/** Laufende Runde: queue aus buildRound, pending = Wiederholungen. */
export function startRound(built) {
  return { queue: built.queue.slice(), pending: [], lastId: null, shown: 0, counts: {} };
}

/** Nächster Eintrag der Runde: { entry: { id, intro }, round }.
 *  Reihenfolge: fällige Wiederholung → queue → Füllkarte. Dieselbe Karte nie
 *  zweimal direkt hintereinander, außer beim geblockten Einstieg. */
export function nextEntry(round, cards) {
  const r = { ...round, queue: round.queue.slice(), pending: round.pending.map((p) => ({ ...p })) };
  let entry = null;
  const ready = r.pending.findIndex((p) => p.after <= 0 && p.id !== r.lastId);
  const head = r.queue[0];
  const blocked = head && head.intro && head.id === r.lastId;
  if (ready >= 0 && !blocked) {
    entry = { id: r.pending.splice(ready, 1)[0].id, intro: false };
  } else if (head && (head.intro || head.id !== r.lastId)) {
    entry = r.queue.shift();
  } else if (head) {
    // Kopf wäre eine direkte Wiederholung: den nächsten anderen vorziehen.
    const i = r.queue.findIndex((e) => e.id !== r.lastId);
    entry = i >= 0 ? r.queue.splice(i, 1)[0] : null;
  }
  if (!entry) {
    const id = nextFiller(cards, r.lastId, r.counts);
    entry = id ? { id, intro: false } : null;
  }
  if (!entry) return { entry: null, round: r };
  for (const p of r.pending) p.after--;
  r.lastId = entry.id;
  r.shown++;
  r.counts = { ...r.counts, [entry.id]: (r.counts?.[entry.id] || 0) + 1 };
  return { entry, round: r };
}

/** Nach der Selbsteinschätzung: Wackelig/Nochmal → nach 3–5 Karten erneut. */
export function afterReview(round, id, result, rand) {
  if (!needsRepeat(result)) return round;
  const pending = round.pending.filter((p) => p.id !== id);
  pending.push({ id, after: repeatGap(rand) });
  // Eine noch ausstehende Einstiegs-Wiederholung derselben Karte bleibt.
  return { ...round, pending };
}

/** Geplante Länge der Runde für „Karte n von m“. */
export function plannedLength(round) {
  return round.shown + round.queue.length + round.pending.length;
}

/** Fällige Karten ohne Platz still verschieben: je 12 auf einen Tag ab morgen.
 *  Gibt nur die geänderten Karten zurück. */
export function postponeOverflow(cards, overflowIds, reviewedIds, today, perDay = MAX_DUE) {
  const left = overflowIds.filter((id) => !reviewedIds.includes(id));
  const byId = new Map(cards.map((c) => [c.id, c]));
  return left.map((id, k) => ({ ...byId.get(id), due: addDays(today, 1 + Math.floor(k / perDay)) }))
    .filter((c) => c.id);
}

/** Stufenvorschlag: ≥ 80 % der Karten der aktuellen Stufe in Fach ≥ 3. */
export function levelReady(cards, level, songCards = []) {
  if (level >= MAX_LEVEL) return false;
  const ids = unlockedCardIds(level, songCards);
  const byId = new Map(cards.map((c) => [c.id, c]));
  const strong = ids.filter((id) => (byId.get(id)?.box ?? 0) >= 3).length;
  return strong / ids.length >= 0.8;
}
