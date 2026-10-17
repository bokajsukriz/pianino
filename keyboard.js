/* keyboard.js — Tastatur-Anzeige als SVG: Markierungen und Fingerzahlen.
   Arten (kind) und Farben (Arbeitsanweisung 8):
     rh    RH-Ton          #F868B0, Schrift #241b3d
     lh    LH-Ton          #f5b942, Schrift #241b3d
     to    Zielton         wie rh
     stay  bleibt liegen   #6f6585, Schrift weiß, Beschriftung „bleibt“
     from  Start eines wandernden Fingers  #fde3f0 mit Rand #db0a73
   Die Füllungen unterscheiden sich auch in der Helligkeit (stay dunkel,
   rh mittel, lh hell, from sehr hell mit kräftigem Rand). */

import { isBlack, transition, chordById } from './chords.js';

const NS = 'http://www.w3.org/2000/svg';
const WW = 24, WH = 118, BW = 15, BH = 74, LABEL = 16;
const FILL = { rh: '#F868B0', to: '#F868B0', lh: '#f5b942', stay: '#6f6585', from: '#fde3f0' };
const HEARD_HIT = '#1f8a5b';
const INK = { rh: '#241b3d', to: '#241b3d', lh: '#241b3d', stay: '#ffffff', from: '#241b3d' };

function el(name, attrs = {}, text = null) {
  const n = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
  if (text !== null) n.textContent = text;
  return n;
}

/** Bereich: nächste weiße Taste unter min−1 bis nächste weiße über max+1. */
export function rangeFor(notes) {
  let lo = Math.min(...notes) - 1, hi = Math.max(...notes) + 1;
  while (isBlack(lo)) lo--;
  while (isBlack(hi)) hi++;
  return [lo, hi];
}

/** Tastatur in `host` zeichnen. marks: Map(midi → { kind, finger?, label? }).
 *  heard: Map(midi → 'hit' | 'extra') — vom Mikrofon gehört: Punkt auf der
 *  Taste, grün für Akkordtöne, grau für andere (nie rot). */
export function renderKeyboard(host, { lo, hi, marks = new Map(), title = 'Tastatur', heard = null }) {
  const whites = [];
  for (let m = lo; m <= hi; m++) if (!isBlack(m)) whites.push(m);
  const W = whites.length * WW;
  const svg = el('svg', { viewBox: `0 0 ${W} ${WH + LABEL}`, role: 'img', 'aria-label': title, class: 'kb' });
  const xOf = new Map();
  whites.forEach((m, i) => xOf.set(m, i * WW));

  const drawKey = (m, black) => {
    const mk = marks.get(m);
    const x = black ? xOf.get(m - 1) + WW - BW / 2 : xOf.get(m);
    const w = black ? BW : WW, h = black ? BH : WH;
    const fill = mk ? FILL[mk.kind] : (black ? '#241b3d' : '#ffffff');
    const stroke = mk?.kind === 'from' ? '#db0a73' : (black ? '#241b3d' : '#cbb8aa');
    const sw = mk?.kind === 'from' ? 2.5 : 1;
    svg.append(el('rect', {
      x: x + (mk?.kind === 'from' ? 1.25 : 0.5), y: 0.5,
      width: w - (mk?.kind === 'from' ? 2.5 : 1), height: h - 1,
      rx: black ? 2 : 3, fill, stroke, 'stroke-width': sw,
    }));
    if (mk?.finger) {
      svg.append(el('text', {
        x: x + w / 2, y: h - (black ? 10 : 12), 'text-anchor': 'middle',
        'font-size': black ? 12 : 15, 'font-weight': 800, fill: INK[mk.kind],
      }, String(mk.finger)));
    }
    if (mk?.label) {
      svg.append(el('text', {
        x: x + w / 2, y: WH + LABEL - 4, 'text-anchor': 'middle', 'font-size': 10,
        'font-weight': 700, fill: '#6b5f86',
      }, mk.label));
    }
  };
  for (const m of whites) drawKey(m, false);
  for (let m = lo; m <= hi; m++) if (isBlack(m) && xOf.has(m - 1)) drawKey(m, true);
  for (const [m, how] of heard || []) {
    if (m < lo || m > hi || (isBlack(m) && !xOf.has(m - 1))) continue;
    const black = isBlack(m);
    const x = black ? xOf.get(m - 1) + WW : xOf.get(m) + WW / 2;
    svg.append(el('circle', {
      cx: x, cy: black ? BH - 30 : WH - 36, r: black ? 5 : 6,
      fill: how === 'hit' ? HEARD_HIT : '#9a8fb3', stroke: '#ffffff', 'stroke-width': 1.5,
    }));
  }
  host.replaceChildren(svg);
  return svg;
}

/** Markierungen für einen Akkord: RH pink mit Fingern, LH gelb. */
export function chordMarks(chord, { lh = true } = {}) {
  const marks = new Map();
  chord.rh.forEach((m, i) => marks.set(m, { kind: 'rh', finger: chord.fingers[i] }));
  // ANNAHME: Der Basston der linken Hand wird mit dem kleinen Finger (5) gespielt.
  if (lh) marks.set(chord.lh, { kind: 'lh', finger: 5 });
  return marks;
}

/** Markierungen für den Übergang von → nach (Kurze Wege): bleibt grau mit
 *  „bleibt“, Start umrandet, Ziel pink; Fingerzahl auf Start und Ziel.
 *  LH: Zielton gelb. */
export function transitionMarks(fromId, toId, { lh = true } = {}) {
  const a = chordById(fromId), b = chordById(toId);
  const t = transition(fromId, toId);
  const marks = new Map();
  // ANNAHME: Liegen bleibende Töne behalten ihren Finger aus dem Ausgangsakkord
  // (bei Am → F also 3 auf dem C, obwohl F:song dort 2 vorschlägt).
  for (const m of t.stay) marks.set(m, { kind: 'stay', finger: a.fingers[a.rh.indexOf(m)], label: 'bleibt' });
  for (const mv of t.moves) {
    marks.set(mv.from, { kind: 'from', finger: a.fingers[a.rh.indexOf(mv.from)] });
    marks.set(mv.to, { kind: 'to', finger: mv.finger });
  }
  if (lh) marks.set(b.lh, { kind: 'lh', finger: 5 });
  return marks;
}
