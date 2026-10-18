/* voicing.js — REIN: Griffe (Tasten und Fingersätze beider Hände).
   Kein DOM, keine Zeit, kein Zufall. MIDI 60 = C4.

   Ein Griff:
     { rh: [57, 60, 62, 67], rhFingers: [1, 2, 3, 5],
       lh: [41, 48],         lhFingers: [5, 1],
       note: 'Daumen bleibt auf A' }
   rh/lh aufsteigend, je Hand 0–5 Töne, zusammen mindestens einer, keine
   Taste in beiden Händen. Finger 1–5 oder null (unbekannt), keiner doppelt
   in einer Hand. note höchstens 140 Zeichen. */

import { parseChord, qualityIntervals } from './chordsym.js';

export const HANDS = Object.freeze(['rh', 'lh']);
export const NOTE_MAX = 140;
/** Größte Spanne einer Hand ohne Warnung: Oktave plus große Terz. */
export const SPAN_MAX = 16;

const isInt = (x) => Number.isInteger(x);

/** Alten Griff (lh als Zahl, fingers für rechts) ins neue Format bringen.
 *  Idempotent: ein Griff im neuen Format kommt unverändert (als Kopie) zurück. */
export function upgradeVoicing(v) {
  if (!v || typeof v !== 'object') return v;
  const out = { ...v };
  if (typeof out.lh === 'number') { out.lh = [out.lh]; out.lhFingers = [null]; }
  if ('fingers' in out) {
    if (!('rhFingers' in out)) out.rhFingers = out.fingers;
    delete out.fingers;
  }
  out.rh = Array.isArray(out.rh) ? [...out.rh] : [];
  out.lh = Array.isArray(out.lh) ? [...out.lh] : [];
  out.rhFingers = Array.isArray(out.rhFingers) ? [...out.rhFingers] : out.rh.map(() => null);
  out.lhFingers = Array.isArray(out.lhFingers) ? [...out.lhFingers] : out.lh.map(() => null);
  return out;
}

/** Prüfen. → { ok, errors: [deutsch], warnings: [deutsch] } */
export function validateVoicing(v) {
  const errors = [], warnings = [];
  if (!v || typeof v !== 'object') return { ok: false, errors: ['Kein Griff.'], warnings };
  const name = { rh: 'Rechts', lh: 'Links' };
  let total = 0;
  for (const h of HANDS) {
    const keys = v[h] ?? [], fingers = v[`${h}Fingers`] ?? keys.map(() => null);
    if (!Array.isArray(keys)) { errors.push(`${name[h]}: Tasten müssen eine Liste sein.`); continue; }
    total += keys.length;
    if (keys.length > 5) errors.push(`${name[h]}: höchstens 5 Tasten.`);
    if (!keys.every((m) => isInt(m) && m >= 0 && m <= 127)) errors.push(`${name[h]}: Tasten als MIDI-Nummern 0–127.`);
    if (keys.some((m, i) => i > 0 && m <= keys[i - 1])) errors.push(`${name[h]}: Tasten aufsteigend und ohne Doppelte.`);
    if (!Array.isArray(fingers) || fingers.length !== keys.length) {
      errors.push(`${name[h]}: so viele Finger wie Tasten.`);
      continue;
    }
    if (!fingers.every((f) => f === null || (isInt(f) && f >= 1 && f <= 5))) errors.push(`${name[h]}: Finger 1–5 oder leer.`);
    const known = fingers.filter((f) => f !== null);
    if (new Set(known).size !== known.length) errors.push(`${name[h]}: ein Finger doppelt.`);
    // Warnungen: Fingerfolge gegen Tonfolge, Spanne.
    const pairs = keys.map((m, i) => [m, fingers[i]]).filter(([, f]) => f !== null);
    const rising = h === 'rh';
    if (pairs.some(([, f], i) => i > 0 && (rising ? f < pairs[i - 1][1] : f > pairs[i - 1][1]))) {
      warnings.push(`${name[h]}: Fingerfolge passt nicht zur Tonfolge (${rising ? 'rechts steigen' : 'links fallen'} die Finger mit der Tonhöhe) – Untersatz?`);
    }
    if (keys.length > 1 && isInt(keys[0]) && keys[keys.length - 1] - keys[0] > SPAN_MAX) {
      warnings.push(`${name[h]}: Spanne größer als Oktave plus Terz.`);
    }
  }
  if (total < 1) errors.push('Mindestens eine Taste.');
  const both = (v.rh || []).filter((m) => (v.lh || []).includes(m));
  if (both.length) errors.push('Eine Taste kann nicht in beiden Händen liegen.');
  if (v.note != null && (typeof v.note !== 'string' || v.note.length > NOTE_MAX)) errors.push(`Notiz höchstens ${NOTE_MAX} Zeichen.`);
  return { ok: errors.length === 0, errors, warnings };
}

/** Standardlage zu einem Symbol oder null (Symbol unbekannt).
 *  Dreiklang in Grundstellung um C4, Bass eine Oktave unter dem Grundton
 *  (bei Slash-Akkord der Basston darunter), rechts 1-3-5, links 5.
 *  ANNAHME: Bei Vier- und Mehrklängen fällt die Quinte weg (die lässt eine
 *  Begleitung am ehesten weg); vier Töne rechts dann mit 1-2-3-5.
 *  ANNAHME: „um C4“ = die Lage, deren Mitte am nächsten an C4 liegt. */
export function defaultVoicing(symbol) {
  const c = parseChord(symbol);
  if (!c) return null;
  let iv = qualityIntervals(c.quality);
  if (iv.length > 3 && iv.includes(7)) iv = iv.filter((x) => x !== 7);
  iv.sort((a, b) => a - b);
  let best = null;
  for (let r = 48; r <= 71; r++) {
    if (r % 12 !== c.root) continue;
    const keys = iv.map((x) => r + x);
    const dist = Math.abs((keys[0] + keys[keys.length - 1]) / 2 - 60);
    if (!best || dist < best.dist) best = { keys, dist, r };
  }
  const rh = best.keys;
  let bass = best.r - 12;
  if (c.bass !== null && c.bass !== c.root) {
    bass = best.r - 12 + ((c.bass - c.root + 12) % 12);
    while (bass >= rh[0]) bass -= 12;
  }
  const rhFingers = rh.length === 1 ? [1] : rh.length === 2 ? [1, 5] : rh.length === 3 ? [1, 3, 5] : rh.length === 4 ? [1, 2, 3, 5] : [1, 2, 3, 4, 5];
  return { rh, rhFingers, lh: [bass], lhFingers: [5] };
}

/** Griff eines Akkords im Song: eigener Griff oder Standardlage.
 *  → Griff mit std: true für die Standardlage, oder null (unbekanntes Symbol
 *  ohne eigenen Griff). */
export function voicingFor(song, symbol) {
  const own = song?.voicings?.[symbol];
  if (own) return { ...upgradeVoicing(own), std: false };
  const d = defaultVoicing(symbol);
  return d ? { ...d, std: true } : null;
}

/** ANNAHME: Ohne Hand-Angabe spielt die Tasten unter G3 (MIDI 55) die linke
 *  Hand, den Rest die rechte. So bleibt der Bass für Anzeige und Erkenner
 *  erkennbar, ohne dass man Hände und Finger eintragen muss. */
export const LH_BELOW = 55;

/** Griff aus einer Tastenliste (ohne Finger). → Griff */
export function voicingFromKeys(keys, note = '') {
  const ks = [...new Set(keys.filter(isInt))].sort((a, b) => a - b);
  const lh = ks.filter((m) => m < LH_BELOW), rh = ks.filter((m) => m >= LH_BELOW);
  const v = { rh, rhFingers: rh.map(() => null), lh, lhFingers: lh.map(() => null) };
  if (note) v.note = note;
  return v;
}

/** Alle Tasten eines Griffs, aufsteigend. */
export const allKeys = (v) => (v ? [...(v.lh || []), ...(v.rh || [])].sort((a, b) => a - b) : []);

/** Gleicher Griff (Tasten und Finger)? */
export function sameVoicing(a, b) {
  if (!a || !b) return false;
  return HANDS.every((h) => JSON.stringify(a[h] || []) === JSON.stringify(b[h] || [])
    && JSON.stringify(a[`${h}Fingers`] || []) === JSON.stringify(b[`${h}Fingers`] || []));
}

/** Unterschied zweier Griffe je Hand.
 *  → { rh: { keep, release, add, move }, lh: … }
 *  keep/release/add: [{ key, finger }], move: [{ finger, from, to, semis }].
 *  Mit vollständigen Fingersätzen (beide Griffe, diese Hand) wird über die
 *  Finger verglichen: gleicher Finger, gleiche Taste = keep; gleicher Finger,
 *  andere Taste = move. Sonst über die Töne (keine moves). */
export function voicingDiff(prev, next) {
  const out = {};
  for (const h of HANDS) {
    const a = prev?.[h] || [], b = next?.[h] || [];
    const fa = prev?.[`${h}Fingers`] || a.map(() => null), fb = next?.[`${h}Fingers`] || b.map(() => null);
    const d = { keep: [], release: [], add: [], move: [] };
    const byFinger = a.length && b.length && fa.every((f) => f !== null) && fb.every((f) => f !== null);
    if (byFinger) {
      const ka = new Map(fa.map((f, i) => [f, a[i]])), kb = new Map(fb.map((f, i) => [f, b[i]]));
      for (const [f, key] of ka) {
        if (!kb.has(f)) d.release.push({ key, finger: f });
        else if (kb.get(f) === key) d.keep.push({ key, finger: f });
        else d.move.push({ finger: f, from: key, to: kb.get(f), semis: kb.get(f) - key });
      }
      for (const [f, key] of kb) if (!ka.has(f)) d.add.push({ key, finger: f });
    } else {
      a.forEach((key, i) => {
        if (b.includes(key)) d.keep.push({ key, finger: fb[b.indexOf(key)] ?? fa[i] ?? null });
        else d.release.push({ key, finger: fa[i] ?? null });
      });
      b.forEach((key, i) => { if (!a.includes(key)) d.add.push({ key, finger: fb[i] ?? null }); });
    }
    for (const k of ['keep', 'release', 'add']) d[k].sort((x, y) => x.key - y.key);
    d.move.sort((x, y) => x.to - y.to);
    out[h] = d;
  }
  return out;
}

/** Ändert sich in dieser Hand nichts? */
export const handStill = (d) => !d.release.length && !d.add.length && !d.move.length;

/** Für den Erkenner (hear.js, ear-worker.js): { name, rh, lh, pcs }.
 *  Ohne rechte Hand prüft er die linke wie eine rechte. null, wenn es nichts
 *  zu prüfen gibt. */
export function hearTarget(symbol, v) {
  const c = parseChord(symbol);
  const rh = v?.rh?.length ? [...v.rh] : v?.lh?.length ? [...v.lh] : [];
  const lh = v?.rh?.length ? [...(v.lh || [])] : [];
  if (!rh.length) return null;
  const pcs = c ? c.pcs : [...new Set(allKeys(v).map((m) => m % 12))].sort((x, y) => x - y);
  return { name: symbol, rh, lh, pcs };
}
