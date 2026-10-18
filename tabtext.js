/* tabtext.js — REIN: eingefügten Tab-Text (z. B. von Ultimate Guitar kopiert)
   in Zeilen zerlegen: Akkordzeilen, Abschnittsüberschriften, Gitarren-Tab,
   Text. Kein DOM, keine Zeit, kein Zufall. Der Text selbst ist Nutzerdaten
   und bleibt auf dem Gerät — nie im Repo, auch nicht in Tests. */

import { parseChord } from './chordsym.js';

/** Zeichen, die in Akkordzeilen zwischen den Akkorden stehen dürfen. */
const FILLER = /^(\||\/|-+|\.+|x\d+|\d+x|\(|\)|N\.?C\.?|%|:|\*+)$/i;
const HEADER_WORDS = /^(intro|verse|strophe|vers|chorus|refrain|pre-?chorus|bridge|outro|interlude|zwischenspiel|solo|instrumental|coda|ending|hook|tag|break)\b/i;

/** UG-Auszeichnung entfernen ([ch]…[/ch], [tab]…[/tab]), Markdown-Reste
 *  aus dem Kopieren (``` und [Name](Link)), zusammengeklebte Zeilen trennen. */
export function stripMarkup(text) {
  const t = String(text ?? '').replace(/\r\n?/g, '\n')
    .replace(/\[\/?(ch|tab)\]/g, '')
    .replace(/^\s*```\w*\s*$/gm, '')
    .replace(/\[([^\]\n]+)\]\((https?:[^)\s]+)\)/g, '$1');
  return t.split('\n').map((l) => (l.length > LONG ? restoreLines(l) : l)).join('\n');
}

/* ---------- Zusammengeklebte Zeilen ------------------------------------
   Beim Kopieren (z. B. Ultimate Guitar auf dem Handy) gehen manchmal alle
   Zeilenumbrüche verloren: „[Verse]Am  D/F#  F    Zeile …Am …“. Die
   Leerzeichen bleiben aber, also auch die Spalten. Getrennt wird vor und
   nach Überschriften in eckigen Klammern und zwischen Akkordzeile und
   Textzeile. Eine Akkordzeile sind Akkorde mit Leerzeichen dazwischen;
   danach kommt das Zeilenende, ein großer Buchstabe (Text ohne Einzug) oder
   Leerzeichen (Einzug des Texts). Leerraum gehört zur folgenden Zeile (ihr
   Einzug), ein einzelnes Leerzeichen nach Text zur Textzeile davor.
   ANNAHME: Nur Zeilen über LONG Zeichen werden so behandelt; ein einzelnes
   „A“ mitten im Text („… a A thing“) gilt nicht als Akkord, wenn danach ein
   Leerzeichen und ein kleiner Buchstabe kommen. */

const LONG = 160;
const ACC = '(?:#|b|♯|♭)?';
const QUAL = '(?:maj7|maj9|madd9|m7b5|m6\\/9|m9|m7|m6|m|add9|add2|sus2|sus4|7sus4|dim7|dim|aug|6\\/9|69|9|7|6|5)?';
const CHORD = new RegExp(`^[A-H]${ACC}${QUAL}(?:\\/[A-H]${ACC})?`);

/** Akkord bei i (ganzes Token)? → Ende oder −1. */
function chordEnd(s, i) {
  const m = CHORD.exec(s.slice(i));
  if (!m) return -1;
  const e = i + m[0].length, c = s[e];
  // Danach: Ende, Leerraum oder angeklebter Text, der groß beginnt.
  if (c === undefined || /\s/.test(c) || /[A-ZÄÖÜ"'“„‘(\[]/.test(c)) return parseChord(chordToken(m[0])) ? e : -1;
  return -1;
}

/** Beginnt bei i (nach Leerraum) eine Akkordzeile? → Ende oder −1. */
function chordLineEnd(s, i) {
  let j = i;
  while (j < s.length && s[j] === ' ') j++;
  let e = chordEnd(s, j), last = -1, n = 0;
  while (e >= 0) {
    last = e; n++;
    let k = e;
    while (k < s.length && s[k] === ' ') k++;
    if (k === e) break;
    e = chordEnd(s, k);
    if (e < 0) break;
  }
  if (last < 0) return -1;
  const rest = s.slice(last);
  if (n === 1 && /^ [a-zäöüß]/.test(rest)) return -1; // „A long …“
  if (/^ \S/.test(rest) && !/^ [A-ZÄÖÜ]/.test(rest) && n === 1) return -1;
  return last;
}

/** Eine zusammengeklebte Zeile in Zeilen trennen. */
export function restoreLines(line) {
  const out = [];
  for (const part of line.split(/(\[[^\]\n]{1,40}\])/)) {
    if (!part) continue;
    if (/^\[[^\]]+\]$/.test(part)) { out.push(part); continue; }
    let pos = 0;
    const s = part;
    while (pos < s.length) {
      const ce = chordLineEnd(s, pos);
      if (ce >= 0) { out.push(s.slice(pos, ce)); pos = ce; continue; }
      // Textzeile bis zur nächsten Akkordzeile.
      let q = pos + 1, cut = -1;
      for (; q < s.length; q++) {
        const prev = s[q - 1], c = s[q];
        if (c === ' ' && prev !== ' ') {
          // Leerraum nach Text: ein einzelnes Leerzeichen bleibt beim Text.
          let k = q; while (k < s.length && s[k] === ' ') k++;
          const from = k - q === 1 ? k : q;
          if (k < s.length && chordLineEnd(s, from) >= 0) { cut = from; break; }
        } else if (/[A-H]/.test(c) && /[a-zäöüß.,!?;:'’")]/.test(prev) && chordLineEnd(s, q) >= 0) { cut = q; break; }
      }
      const end = cut < 0 ? s.length : cut;
      out.push(s.slice(pos, end));
      pos = end;
    }
  }
  // Leerzeile vor jeder Überschrift (außer ganz oben), sonst keine leeren Zeilen.
  const lines = out.map((l) => l.replace(/\s+$/, '')).filter((l) => l.trim());
  return lines.flatMap((l, i) => (i > 0 && /^\[[^\]]+\]$/.test(l) ? ['', l] : [l])).join('\n');
}

/** Akkord-Token: Klammern weg, z. B. „(Am)“ → „Am“. */
const chordToken = (t) => t.replace(/^\(+|\)+$/g, '');

/** Art einer Zeile: 'blank' | 'header' | 'chords' | 'tab' | 'text'. */
export function classifyLine(line) {
  const t = line.trim();
  if (!t) return 'blank';
  if (/^\[[^\]]+\]$/.test(t) || (HEADER_WORDS.test(t) && t.length <= 30 && /:$|^\S+(\s+\d+)?:?$/.test(t))) return 'header';
  if (/^[eBGDAEbgda]\s*[|:]/.test(t) && /-{3,}/.test(t)) return 'tab';
  const tokens = t.split(/\s+/).filter((x) => !FILLER.test(x));
  if (tokens.length && tokens.every((x) => parseChord(chordToken(x)))) return 'chords';
  return 'text';
}

/** Text in Zeilen: [{ kind, text }]. */
export function parseTabText(text) {
  return stripMarkup(text).split('\n').map((line) => ({ kind: classifyLine(line), text: line.replace(/\s+$/, '') }));
}

/** Akkordsymbole in Reihenfolge des ersten Auftretens. */
export function chordsInText(text) {
  const out = [];
  for (const l of parseTabText(text)) {
    if (l.kind !== 'chords') continue;
    for (const x of l.text.trim().split(/\s+/)) {
      const c = chordToken(x);
      if (!FILLER.test(x) && parseChord(c) && !out.includes(c)) out.push(c);
    }
  }
  return out;
}
