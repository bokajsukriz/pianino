/* tabtext.js — REIN: eingefügten Tab-Text (z. B. von Ultimate Guitar kopiert)
   in Zeilen zerlegen: Akkordzeilen, Abschnittsüberschriften, Gitarren-Tab,
   Text. Kein DOM, keine Zeit, kein Zufall. Der Text selbst ist Nutzerdaten
   und bleibt auf dem Gerät — nie im Repo, auch nicht in Tests. */

import { parseChord } from './chordsym.js';

/** Zeichen, die in Akkordzeilen zwischen den Akkorden stehen dürfen. */
const FILLER = /^(\||\/|-+|\.+|x\d+|\d+x|\(|\)|N\.?C\.?|%|:|\*+)$/i;
const HEADER_WORDS = /^(intro|verse|strophe|vers|chorus|refrain|pre-?chorus|bridge|outro|interlude|zwischenspiel|solo|instrumental|coda|ending|hook|tag|break)\b/i;

/** UG-Auszeichnung entfernen ([ch]…[/ch], [tab]…[/tab]). */
export function stripMarkup(text) {
  return String(text ?? '').replace(/\[\/?(ch|tab)\]/g, '').replace(/\r\n?/g, '\n');
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
