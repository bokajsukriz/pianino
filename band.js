/* band.js — Akkordband (Play-Along, Transkribieren, Wann): der aktuelle
   Akkord groß, der nächste mit Countdown in Schlägen („D in 1½“), darunter
   eine Zeile Takte mit den Wechseln an ihrer Stelle — ein vorgezogener
   Wechsel steht sichtbar vor dem Taktstrich —, ein Strich für „jetzt“ und,
   falls vorhanden, die aktuelle Textzeile (die nächste blass).
   Die Logik dahinter steht rein in timeline.js. */

import { chordAt, eventsIn, sectionRange, beatsText, barOf } from './timeline.js';
import { prettyChord } from './chordsym.js';

const EPS = 1e-6;
const PAGE = 4; // Takte je Zeile

/** Fenster der Taktzeile um `beat`: innerhalb des Abschnitts in Seiten zu 4
 *  Takten, ohne Abschnitt in festen 4-Takt-Seiten. → { fromBeat, toBeat, label } */
export function bandWindow(song, beat) {
  const bpb = song.beatsPerBar;
  const b = Math.max(0, beat);
  const sec = (song.sections || []).find((s) => {
    const r = sectionRange(song, s);
    return b >= r.fromBeat - EPS && b < r.toBeat - EPS;
  });
  if (sec) {
    const r = sectionRange(song, sec);
    const page = Math.floor((b - r.fromBeat) / (PAGE * bpb) + EPS);
    const from = r.fromBeat + page * PAGE * bpb;
    return { fromBeat: from, toBeat: Math.min(r.toBeat, from + PAGE * bpb), label: sec.name };
  }
  const page = Math.floor(b / (PAGE * bpb) + EPS);
  return { fromBeat: page * PAGE * bpb, toBeat: (page + 1) * PAGE * bpb, label: '' };
}

/** Band in `host` anlegen. onPick(at): Ereignis angetippt (Editor).
 *  → { update(song, beat, opts), el } */
export function createBand(host, { onPick = null } = {}) {
  const mk = (tag, cls, parent) => { const e = document.createElement(tag); if (cls) e.className = cls; parent?.append(e); return e; };
  const root = mk('div', 'band');
  const top = mk('div', 'band-top', root);
  const now = mk('span', 'band-now', top);
  const next = mk('span', 'band-next', top);
  const nextSym = mk('span', 'band-next-sym', next);
  const count = mk('span', 'band-count', next);
  const barsWrap = mk('div', 'band-bars', root);
  const label = mk('span', 'band-label', barsWrap);
  const row = mk('div', 'band-row', barsWrap);
  const head = mk('div', 'band-head', row);
  const lyric = mk('p', 'band-lyric', root);
  const lyricNext = mk('p', 'band-lyric next', root);
  host.replaceChildren(root);
  if (onPick) {
    row.addEventListener('click', (e) => {
      const b = e.target.closest('[data-at]');
      if (b) onPick(Number(b.dataset.at));
    });
  }
  let key = '';
  let win = null;

  function paintRow(song, w, selected) {
    const bpb = song.beatsPerBar;
    const bars = Math.round((w.toBeat - w.fromBeat) / bpb);
    const cells = [];
    for (let i = 0; i < bars; i++) {
      const from = w.fromBeat + i * bpb;
      const cell = document.createElement('div');
      cell.className = 'band-bar';
      const num = document.createElement('small');
      num.className = 'band-num';
      num.textContent = String(barOf(song, from));
      cell.append(num);
      for (const e of eventsIn(song, from, from + bpb)) {
        const carried = !song.events.some((x) => Math.abs(x.at - e.at) < EPS);
        if (carried && i > 0) continue; // klingt nur weiter: nur am Zeilenanfang zeigen
        const seg = document.createElement(onPick && !carried ? 'button' : 'span');
        if (onPick && !carried) { seg.type = 'button'; seg.dataset.at = String(e.at); }
        const frac = (e.at - from) / bpb;
        seg.className = `band-ev${carried ? ' carried' : ''}${frac > EPS ? ' early' : ''}${selected != null && Math.abs(selected - e.at) < EPS ? ' sel' : ''}`;
        seg.style.left = `${frac * 100}%`;
        seg.textContent = prettyChord(e.chord);
        cell.append(seg);
      }
      cells.push(cell);
    }
    row.replaceChildren(...cells, head);
    label.textContent = w.label;
    label.hidden = !w.label;
  }

  /** opts: { lead: s Countdown erst ab hier sichtbar, showNext, showBars,
   *  showNow, selected: at, version: Änderungszähler des Songs } */
  function update(song, beat, { showNow = true, showNext = true, showBars = true, selected = null, version = 0 } = {}) {
    const w = bandWindow(song, beat);
    const k = `${song.id}|${version}|${w.fromBeat}|${w.toBeat}|${selected}|${song.events.length}`;
    if (k !== key) { key = k; win = w; paintRow(song, w, selected); }
    barsWrap.hidden = !showBars;
    const cur = beat >= 0 ? chordAt(song, beat) : null;
    now.textContent = showNow && cur ? prettyChord(cur) : '';
    now.classList.toggle('pre', beat < 0);
    const nx = song.events.find((e) => e.at > beat + EPS && e.chord !== cur);
    if (showNext && nx) {
      nextSym.textContent = prettyChord(nx.chord);
      const left = Math.ceil((nx.at - beat) * 2 - EPS) / 2;
      count.textContent = `in ${beatsText(Math.max(0.5, left))}`;
      next.hidden = false;
      next.classList.toggle('soon', nx.at - beat <= 2);
    } else next.hidden = true;
    const pos = (beat - win.fromBeat) / (win.toBeat - win.fromBeat);
    head.style.left = `${Math.max(0, Math.min(1, pos)) * 100}%`;
    head.hidden = pos < 0 || pos > 1;
    // Text: die Zeile, die gerade dran ist, die nächste blass.
    const lines = (song.lyrics || []).filter((l) => Number.isFinite(l.at));
    let li = -1;
    for (let i = 0; i < lines.length; i++) if (lines[i].at <= beat + EPS) li = i;
    lyric.textContent = li >= 0 ? lines[li].line : '';
    lyricNext.textContent = lines[li + 1]?.line ?? '';
    lyric.hidden = !lines.length;
    lyricNext.hidden = !lines.length;
  }
  return { update, el: root, reset() { key = ''; } };
}
