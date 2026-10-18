/* keyboard.js — Tastatur als SVG: Griffe beider Hände mit Fingern, die
   Wechsel-Ansicht (voicingDiff) und Eingabe für den Griff-Editor.

   Markierungen (marks: Map midi → { hand, finger, state, ghost }):
     hand   'rh' | 'lh' — Farbe aus style.css (--kb-rh, --kb-lh); die linke
            Hand trägt zusätzlich ein „L“ oben auf der Taste (nicht allein
            über Farbe unterscheiden)
     finger 1–5 oder null, als Zahl auf der Taste
     state  'keep'    bleibt liegen     Punkt über der Fingerzahl
            'add'     kommt dazu        Ring um die Fingerzahl
            'move'    Finger wandert hierher (Pfeil von der alten Taste)
            'from'    Finger wandert von hier weg (blass)
            'release' loslassen         blass und durchgestrichen
     ghost  blass (Griff des Vorgängers)
   arrows: [{ from, to, finger, hand }] — Pfeil über den Tasten mit Fingerzahl. */

import { isBlack } from './chords.js';
import { voicingDiff } from './voicing.js';

const NS = 'http://www.w3.org/2000/svg';

function el(name, attrs = {}, text = null) {
  const n = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
  if (text !== null) n.textContent = text;
  return n;
}

/** Bereich: nächste weiße Taste unter min−1 bis nächste weiße über max+1. */
export function rangeFor(notes, { min = 0 } = {}) {
  const ns = notes.filter(Number.isFinite);
  if (!ns.length) return [57, 76];
  let lo = Math.min(...ns) - 1, hi = Math.max(...ns) + 1;
  while (isBlack(lo)) lo--;
  while (isBlack(hi)) hi++;
  // Mindestens `min` weiße Tasten (gleichmäßig verbreitert).
  const whites = () => { let n = 0; for (let m = lo; m <= hi; m++) if (!isBlack(m)) n++; return n; };
  while (whites() < min) { lo--; while (isBlack(lo)) lo--; if (whites() < min) { hi++; while (isBlack(hi)) hi++; } }
  return [lo, hi];
}

/** Weiße Tasten im Bereich. */
export function whiteKeys(lo, hi) {
  const w = [];
  for (let m = lo; m <= hi; m++) if (!isBlack(m)) w.push(m);
  return w;
}

/** Tastatur in `host` zeichnen.
 *  ww/wh: Breite und Höhe einer weißen Taste (Einheiten der viewBox; mit
 *  px: true in CSS-Pixeln, dann hat das SVG feste Größe — Griff-Editor).
 *  → { svg, xOf(midi) } */
export function renderKeyboard(host, { lo, hi, marks = new Map(), arrows = [], title = 'Tastatur', ww = 24, wh = 118, px = false }) {
  const whites = whiteKeys(lo, hi);
  const bw = ww * 0.62, bh = wh * 0.63;
  const top = arrows.length ? Math.round(ww * 1.25) : 0;
  const W = whites.length * ww, H = top + wh;
  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': title, class: `kb${px ? ' kb-px' : ''}` });
  if (px) { svg.setAttribute('width', W); svg.setAttribute('height', H); }
  const xOf = new Map();
  whites.forEach((m, i) => xOf.set(m, i * ww));
  const left = (m) => (isBlack(m) ? xOf.get(m - 1) + ww - bw / 2 : xOf.get(m));
  const center = (m) => left(m) + (isBlack(m) ? bw : ww) / 2;
  const fs = Math.max(11, Math.round(ww * 0.6));

  const drawKey = (m, black) => {
    const mk = marks.get(m);
    const x = left(m), w = black ? bw : ww, h = black ? bh : wh;
    const ghost = mk && (mk.ghost || mk.state === 'release' || mk.state === 'from');
    const g = el('g', { 'data-midi': m, class: `kb-key${ghost ? ' kb-ghost' : ''}` });
    const cls = ['kb-base', black ? 'kb-black' : 'kb-white'];
    if (mk) cls.push(`kb-${mk.hand}`);
    g.append(el('rect', { x: x + 0.5, y: top + 0.5, width: w - 1, height: h - 1, rx: black ? 2 : 3, class: cls.join(' ') }));
    if (mk) {
      const ink = mk.hand === 'lh' ? 'kb-ink-lh' : 'kb-ink-rh';
      const cx = x + w / 2, fy = top + h - (black ? bw * 0.55 : ww * 0.55);
      if (mk.hand === 'lh') g.append(el('text', { x: cx, y: top + (black ? fs * 0.95 : fs * 1.05), class: `kb-l ${ink}`, 'font-size': Math.round(fs * 0.72), 'text-anchor': 'middle' }, 'L'));
      if (mk.finger) g.append(el('text', { x: cx, y: fy + fs * 0.36, class: `kb-f ${ink}`, 'font-size': black ? Math.round(fs * 0.85) : fs, 'text-anchor': 'middle' }, String(mk.finger)));
      if (mk.state === 'keep') g.append(el('circle', { cx, cy: fy - fs * 0.95, r: Math.max(3, ww * 0.14), class: `kb-dot ${ink}` }));
      if (mk.state === 'add') g.append(el('circle', { cx, cy: fy, r: Math.min(w / 2 - 1.5, fs * 0.78), class: 'kb-ring' }));
      if (mk.state === 'release') g.append(el('line', { x1: x + 3, y1: top + h * 0.2, x2: x + w - 3, y2: top + h - 4, class: 'kb-strike' }));
    }
    svg.append(g);
  };
  for (const m of whites) drawKey(m, false);
  for (let m = lo; m <= hi; m++) if (isBlack(m) && xOf.has(m - 1)) drawKey(m, true);

  for (const a of arrows) {
    if ([a.from, a.to].some((m) => m < lo || m > hi)) continue;
    const x1 = center(a.from), x2 = center(a.to);
    const head = Math.max(4, ww * 0.22), lift = top * 0.85;
    const g = el('g', { class: `kb-arrow kb-arrow-${a.hand}` });
    g.append(el('path', { d: `M ${x1} ${top} C ${x1} ${top - lift}, ${x2} ${top - lift}, ${x2} ${top - head}`, class: 'kb-arrow-line' }));
    g.append(el('path', { d: `M ${x2} ${top} L ${x2 - head * 0.7} ${top - head} L ${x2 + head * 0.7} ${top - head} Z`, class: 'kb-arrow-head' }));
    if (a.finger) g.append(el('text', { x: (x1 + x2) / 2, y: top - lift * 0.6, 'font-size': Math.round(fs * 0.7), 'text-anchor': 'middle', class: 'kb-arrow-f' }, String(a.finger)));
    svg.append(g);
  }
  host.replaceChildren(svg);
  return { svg, xOf, center };
}

/** Markierungen eines Griffs: beide Hände mit Fingern (lh: false → nur rechts). */
export function voicingMarks(v, { lh = true, ghost = false } = {}) {
  const marks = new Map();
  if (!v) return marks;
  for (const h of lh ? ['lh', 'rh'] : ['rh']) {
    (v[h] || []).forEach((m, i) => marks.set(m, { hand: h, finger: v[`${h}Fingers`]?.[i] ?? null, state: null, ghost }));
  }
  return marks;
}

/** Wechsel-Ansicht: Vorgänger blass, Markierungen aus voicingDiff.
 *  → { marks, arrows } */
export function diffMarks(prev, next, { lh = true } = {}) {
  const d = voicingDiff(prev, next);
  const marks = new Map(), arrows = [];
  for (const h of lh ? ['lh', 'rh'] : ['rh']) {
    for (const x of d[h].release) marks.set(x.key, { hand: h, finger: x.finger, state: 'release', ghost: true });
    for (const m of d[h].move) marks.set(m.from, { hand: h, finger: m.finger, state: 'from', ghost: true });
  }
  for (const h of lh ? ['lh', 'rh'] : ['rh']) {
    for (const x of d[h].keep) marks.set(x.key, { hand: h, finger: x.finger, state: 'keep' });
    for (const x of d[h].add) marks.set(x.key, { hand: h, finger: x.finger, state: 'add' });
    for (const m of d[h].move) {
      marks.set(m.to, { hand: h, finger: m.finger, state: 'move' });
      arrows.push({ from: m.from, to: m.to, finger: m.finger, hand: h });
    }
  }
  return { marks, arrows };
}

/** Griff oder Wechsel in `host` zeichnen (Geführt, Kurze Wege, Akkord-Blitz).
 *  range: [lo, hi]; ohne prev nur der Griff. */
export function renderGrip(host, { prev = null, next, range, lh = true, title }) {
  const { marks, arrows } = prev ? diffMarks(prev, next, { lh }) : { marks: voicingMarks(next, { lh }), arrows: [] };
  return renderKeyboard(host, { lo: range[0], hi: range[1], marks, arrows, title });
}
