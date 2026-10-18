/* exercises/griffe.js — Griff-Editor (Arbeitsanweisung Transkription, 8):
   die Tasten eines Akkords auf einer Klaviatur eintragen, wie im Unterricht
   gespielt — antippen schaltet eine Taste an oder aus. Hände und Finger
   trägt man nicht ein (voicing.js voicingFromKeys teilt nach Tonhöhe). Funktioniert ohne Netz und ohne
   Transkription. Gespeichert wird bei jeder Änderung (song:<id>).

   Oben die Akkorde des Songs (langes Drücken: umbenennen, Standardlage,
   löschen), in der Mitte die Klaviatur C2–C6 (seitlich verschiebbar), unten
   Anhören, Gebrochen, Rückgängig, Notiz und die
   Wechsel-Ansicht „Mit Vorgänger“. „Alle Griffe“ zeigt den Spickzettel.
   Regeln rein in voicing.js, Namen in chordsym.js. */

import * as audio from '../audio.js';
import { S, putSong } from '../store.js';
import { voicingFor, validateVoicing, allKeys, voicingFromKeys, NOTE_MAX } from '../voicing.js';
import { parseChord, nameFromKeys, sameChord, prettyChord } from '../chordsym.js';
import { setVoicing, addChord, renameChord, deleteChord } from '../songdata.js';
import { predecessors } from '../timeline.js';
import { moveText, noteName } from '../chords.js';
import { renderKeyboard, voicingMarks, diffMarks, rangeFor, renderGrip } from '../keyboard.js';
import { createClock } from '../clock.js';
import { $, $$, showScreen, modal, ask, onLongPress } from '../ui.js';

const LO = 36, HI = 84; // C2–C6
const WW = 30;          // weiße Taste, CSS-Pixel (≥ 28)

let st = null;          // Zustand der offenen Sitzung
let wired = false;

const song = () => S.songs.get(st.songId);
const own = (sym) => song().voicings?.[sym] || null;
/** Griff, der gerade gezeigt wird: Entwurf (leer gelassen), eigener oder Standardlage. */
const shown = (sym) => st.drafts.get(sym) || voicingFor(song(), sym);

function wire() {
  if (wired) return;
  wired = true;
  $('#gr-back').addEventListener('click', () => close());
  $('#gr-add').addEventListener('click', addSymbol);
  $('#gr-sheet').addEventListener('click', openSheet);
  $('#sheet-back').addEventListener('click', () => { showScreen('griffe'); paint(); });
  $('#gr-play').addEventListener('click', listen);
  $('#gr-arp').addEventListener('click', arpeggio);
  $('#gr-undo').addEventListener('click', undo);
  $('#gr-prev').addEventListener('click', () => { st.prevMode = !st.prevMode; paint(); });
  $('#gr-prevnext').addEventListener('click', () => { st.prevIdx++; paint(); });
  $('#gr-kb').addEventListener('click', (e) => {
    const g = e.target.closest('[data-midi]');
    if (g) tapKey(Number(g.dataset.midi));
  });
  let noteTimer = null;
  $('#gr-note').addEventListener('input', () => {
    clearTimeout(noteTimer);
    noteTimer = setTimeout(() => saveNote($('#gr-note').value), 400);
  });
  $('#gr-note').addEventListener('change', () => { clearTimeout(noteTimer); saveNote($('#gr-note').value); });
}

/** Editor öffnen. → Promise, erfüllt mit „Zurück“. */
export function openGriffe(songId, symbol = null) {
  wire();
  const s = S.songs.get(songId);
  if (!s) return Promise.resolve();
  if (!s.chords.length) {
    return modal('Noch keine Akkorde', 'Füg auf der Liedseite die Tabs ein – die Akkorde daraus landen hier. Oder leg einen Akkord an.',
      [{ label: 'Später', value: 'no' }, { label: 'Akkord anlegen', value: 'add', primary: true }]).then(async (a) => {
      if (a !== 'add') return;
      const t = await ask('Neuer Akkord', 'Symbol wie Am, D/F#, F6/9.', { placeholder: 'z. B. Am', ok: 'Anlegen' });
      if (!t || !parseChord(t)) return;
      await putSong(addChord(S.songs.get(songId), t));
      await openGriffe(songId, t);
    });
  }
  return new Promise((resolve) => {
    st = {
      songId, sym: symbol && s.chords.includes(symbol) ? symbol : s.chords[0],
      prevMode: false, prevIdx: 0, undo: [], drafts: new Map(), resolve, center: true,
    };
    $('#gr-song').textContent = s.title;
    $('#gr-note').maxLength = NOTE_MAX;
    showScreen('griffe');
    paint();
    audio.preloadPiano();
  });
}

function close() {
  const r = st?.resolve;
  st = null;
  r?.();
}

/* ---------- Zeichnen --------------------------------------------------- */

function paint() {
  if (!st) return;
  paintChords();
  paintKeyboard();
  paintTools();
  const v = shown(st.sym);
  if (document.activeElement !== $('#gr-note')) $('#gr-note').value = own(st.sym)?.note || '';
  $('#gr-note').placeholder = `Notiz zu ${prettyChord(st.sym)}, z. B. „Daumen bleibt auf A“`;
  void v;
}

function paintChords() {
  const s = song();
  $('#gr-chords').replaceChildren(...s.chords.map((sym) => {
    const li = document.createElement('li');
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `gr-chip${sym === st.sym ? ' on' : ''}`;
    b.setAttribute('aria-pressed', sym === st.sym ? 'true' : 'false');
    const name = document.createElement('b');
    name.textContent = prettyChord(sym);
    b.append(name);
    if (!own(sym)) { const sm = document.createElement('small'); sm.textContent = 'Standardlage'; b.append(sm); }
    b.addEventListener('click', () => select(sym));
    onLongPress(b, () => chordMenu(sym));
    li.append(b);
    return li;
  }));
}

/** Vorgänger in der Wechsel-Ansicht (durchschaltbar) oder null. */
function prevSymbol() {
  const list = predecessors(song(), st.sym).filter((p) => p !== st.sym);
  if (!list.length) return { list, sym: null };
  return { list, sym: list[st.prevIdx % list.length] };
}

function paintKeyboard() {
  const wrap = $('#gr-kbwrap');
  const v = shown(st.sym);
  const p = st.prevMode ? prevSymbol() : { sym: null, list: [] };
  const pv = p.sym ? voicingFor(song(), p.sym) : null;
  const { marks, arrows } = pv && v ? diffMarks(pv, v) : { marks: plainMarks(v), arrows: [] };
  // Höhe aus dem Platz (ohne Pfeilband und Rollbalken); Pfeilband immer frei
  // halten, damit die Tasten beim Umschalten nicht springen.
  const top = Math.round(WW * 1.25);
  const wh = Math.max(100, Math.min(200, (wrap.clientHeight || 160) - top - 14));
  const kb = renderKeyboard($('#gr-kb'), {
    lo: LO, hi: HI, marks, arrows, ww: WW, wh: arrows.length ? wh : wh + top, px: true,
    title: `Klaviatur C2 bis C6, ${prettyChord(st.sym)}: ${allKeys(v).map(noteName).join(', ') || 'keine Taste'}`,
  });
  if (st.center) {
    st.center = false;
    const keys = allKeys(v);
    const mid = keys.length ? (keys[0] + keys[keys.length - 1]) / 2 : 60;
    const m = Math.round(mid);
    const x = kb.center(Math.max(LO, Math.min(HI, m)));
    wrap.scrollLeft = Math.max(0, x - wrap.clientWidth / 2);
  }
  // Zeilen unter der Klaviatur: Wechsel-Satz, Warnungen, Namensvorschlag.
  $('#gr-move').hidden = !st.prevMode;
  $('#gr-prevnext').hidden = !st.prevMode || p.list.length < 2;
  if (st.prevMode) {
    $('#gr-move').textContent = p.sym ? `Von ${prettyChord(p.sym)}: ${moveText(pv, v)}` : 'Kein Vorgänger – der Akkord kommt in den Wechseln nicht nach einem anderen.';
    $('#gr-prevnext').textContent = p.sym ? `Vorgänger: ${prettyChord(p.sym)} ▸` : '';
  }
  paintHint(v);
}

/** Alle Tasten gleich markiert: ohne Finger, ohne Farbe je Hand. */
function plainMarks(v) {
  const marks = voicingMarks(v);
  for (const [m, x] of marks) marks.set(m, { ...x, hand: 'rh', finger: null });
  return marks;
}

function paintHint(v) {
  const hint = $('#gr-hint');
  hint.replaceChildren();
  const lines = [];
  if (v?.std) lines.push(`Standardlage: ${allKeys(v).map(noteName).join(' ')}. Tippe Tasten an, um den Griff aus dem Unterricht einzutragen.`);
  else if (v) lines.push(...validateVoicing(v).warnings);
  if (!v && !st.drafts.has(st.sym)) lines.push(`${prettyChord(st.sym)} kennt die App nicht – trag den Griff selbst ein.`);
  if (lines.length) hint.append(document.createTextNode(lines.join(' ')));
  // Passt der Name zu den Tasten?
  const keys = allKeys(v);
  if (v && !v.std && keys.length >= 2) {
    const names = nameFromKeys(keys);
    if (names.length && !names.some((n) => sameChord(n, st.sym))) {
      const span = document.createElement('span');
      span.className = 'gr-namehint';
      span.textContent = ` Klingt wie ${names.slice(0, 2).map(prettyChord).join(' oder ')}. Umbenennen?`;
      hint.append(span);
      for (const n of names.slice(0, 2)) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'btn btn-ghost btn-xs';
        b.textContent = prettyChord(n);
        b.addEventListener('click', () => rename(st.sym, n));
        hint.append(b);
      }
    }
  }
}

function paintTools() {
  $('#gr-undo').disabled = !st.undo.length;
  $('#gr-prev').setAttribute('aria-pressed', st.prevMode ? 'true' : 'false');
}

/* ---------- Bearbeiten ------------------------------------------------- */

function select(sym) {
  st.sym = sym;
  st.prevIdx = 0;
  st.center = true;
  paint();
}

/** Griff speichern (mit Rückgängig-Schritt). Ohne Tasten: zurück zur
 *  Standardlage, der leere Entwurf bleibt sichtbar, bis man wechselt. */
async function save(sym, v) {
  st.undo.push({ sym, before: own(sym) ? JSON.parse(JSON.stringify(own(sym))) : null });
  if (allKeys(v).length) {
    st.drafts.delete(sym);
    await putSong(setVoicing(song(), sym, { ...v, std: undefined }));
  } else {
    st.drafts.set(sym, { rh: [], rhFingers: [], lh: [], lhFingers: [], std: false });
    await putSong(setVoicing(song(), sym, null));
  }
  paint();
}

function say(text) {
  $('#gr-hint').textContent = text;
}

/** Taste antippen: an bzw. aus. Hände teilt voicingFromKeys nach Tonhöhe. */
async function tapKey(m) {
  const keys = allKeys(shown(st.sym));
  const next = keys.includes(m) ? keys.filter((k) => k !== m) : [...keys, m];
  const v = voicingFromKeys(next, own(st.sym)?.note);
  if (v.rh.length > 5 || v.lh.length > 5) { say('Höchstens 5 Tasten über und 5 unter G3.'); return; }
  await save(st.sym, v);
}

async function saveNote(text) {
  if (!st) return;
  const t = String(text || '').slice(0, NOTE_MAX).trim();
  const v = shown(st.sym);
  if (!v || !allKeys(v).length) return;
  if ((own(st.sym)?.note || '') === t) return;
  const next = { ...v, std: undefined };
  if (t) next.note = t; else delete next.note;
  await save(st.sym, next);
}

async function undo() {
  const u = st.undo.pop();
  if (!u) return;
  st.drafts.delete(u.sym);
  await putSong(setVoicing(song(), u.sym, u.before));
  st.sym = song().chords.includes(u.sym) ? u.sym : st.sym;
  paint();
}

/* ---------- Akkorde der Leiste ----------------------------------------- */

async function addSymbol() {
  const t = await ask('Neuer Akkord', 'Symbol wie Am, D/F#, F6/9, Csus4.', { placeholder: 'z. B. G/B', ok: 'Anlegen' });
  if (!t) return;
  if (!parseChord(t)) {
    await modal('Unbekanntes Symbol', `„${t}“ kann die App nicht lesen. Beispiele: Am, D/F#, F6/9, Bb, C7, Dsus4.`, [{ label: 'OK', value: 'ok', primary: true }]);
    return;
  }
  const exists = song().chords.find((c) => sameChord(c, t));
  if (!exists) await putSong(addChord(song(), t));
  select(exists || t);
}

async function chordMenu(sym) {
  const hasOwn = !!own(sym);
  const used = song().events.some((e) => e.chord === sym);
  const buttons = [{ label: 'Abbrechen', value: 'no' }];
  if (hasOwn) buttons.push({ label: 'Standardlage', value: 'std' });
  buttons.push({ label: 'Löschen', value: 'del' }, { label: 'Umbenennen', value: 'ren', primary: true });
  const a = await modal(prettyChord(sym), used ? 'Wird in den Wechseln verwendet – löschen geht erst, wenn kein Wechsel mehr darauf zeigt.' : '', buttons);
  if (a === 'ren') {
    const t = await ask(`${prettyChord(sym)} umbenennen`, 'Wechsel und Griff ziehen mit.', { value: sym, ok: 'Umbenennen' });
    if (t) await rename(sym, t);
  } else if (a === 'std') {
    await save(sym, { rh: [], lh: [] });
    st.drafts.delete(sym);
    paint();
  } else if (a === 'del') {
    if (used) { await modal('Geht nicht', `${prettyChord(sym)} kommt in den Wechseln vor.`, [{ label: 'OK', value: 'ok', primary: true }]); return; }
    const yes = await modal(`${prettyChord(sym)} löschen?`, 'Der Griff geht verloren.', [{ label: 'Abbrechen', value: 'no' }, { label: 'Löschen', value: 'yes', primary: true }]);
    if (yes !== 'yes') return;
    const next = deleteChord(song(), sym);
    if (!next) { await modal('Geht nicht', 'Der letzte Akkord bleibt.', [{ label: 'OK', value: 'ok', primary: true }]); return; }
    await putSong(next);
    select(next.chords[0]);
  }
}

async function rename(from, to) {
  if (!parseChord(to)) {
    await modal('Unbekanntes Symbol', `„${to}“ kann die App nicht lesen.`, [{ label: 'OK', value: 'ok', primary: true }]);
    return;
  }
  const next = renameChord(song(), from, to);
  if (!next) {
    await modal('Gibt es schon', `${prettyChord(to)} steht schon in der Liste.`, [{ label: 'OK', value: 'ok', primary: true }]);
    return;
  }
  st.undo = st.undo.map((u) => (u.sym === from ? { ...u, sym: to } : u));
  if (st.drafts.has(from)) { st.drafts.set(to, st.drafts.get(from)); st.drafts.delete(from); }
  await putSong(next);
  select(to);
}

/* ---------- Anhören ---------------------------------------------------- */

async function listen() {
  await audio.unlock();
  const v = shown(st.sym);
  if (v) audio.chord(v, audio.now() + 0.05, { dur: 1.5 });
}

/** Gebrochen: links von unten nach oben, dann rechts, Achtel bei 90 BPM. */
async function arpeggio() {
  await audio.unlock();
  const v = shown(st.sym);
  const notes = [...(v?.lh || []), ...(v?.rh || [])];
  if (!notes.length) return;
  const ctx = audio.getCtx();
  const clock = createClock(ctx, {
    bpm: 90, totalSteps: notes.length,
    onStep: (s) => audio.note(notes[s.index], s.time, { dur: (notes.length - s.index) * clock.stepDur + 0.4 }),
  });
  clock.start(ctx.currentTime + 0.08);
}

/* ---------- Spickzettel ------------------------------------------------ */

function openSheet() {
  const s = song();
  $('#sheet-title').textContent = `Alle Griffe – ${s.title}`;
  $('#sheet-list').replaceChildren(...s.chords.map((sym) => {
    const v = voicingFor(s, sym);
    const li = document.createElement('li');
    li.className = 'card sheet-item';
    const head = document.createElement('div');
    head.className = 'sheet-head';
    const b = document.createElement('b');
    b.className = 'sheet-sym';
    b.textContent = prettyChord(sym);
    head.append(b);
    if (v?.std) { const sm = document.createElement('span'); sm.className = 'badge muted-badge'; sm.textContent = 'Standardlage'; head.append(sm); }
    const kb = document.createElement('div');
    kb.className = 'sheet-kb';
    const p = document.createElement('p');
    p.className = 'small sheet-text';
    if (v) {
      renderGrip(kb, { next: v, range: rangeFor(allKeys(v), { min: 10 }), title: `${prettyChord(sym)}: ${allKeys(v).map(noteName).join(', ')}` });
      p.textContent = [v.note, allKeys(v).map(noteName).join(' ')].filter(Boolean).join(' · ');
    } else p.textContent = 'Noch kein Griff.';
    li.append(head, kb, p);
    return li;
  }));
  showScreen('sheet');
}
