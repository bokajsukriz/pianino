/* exercises/griffe.js — Griff-Editor (Arbeitsanweisung Transkription, 8):
   Tasten und Fingersätze beider Hände eines Songs auf einer Klaviatur
   eintragen, wie im Unterricht gespielt. Funktioniert ohne Netz und ohne
   Transkription. Gespeichert wird bei jeder Änderung (song:<id>).

   Oben die Akkorde des Songs (langes Drücken: umbenennen, Standardlage,
   löschen), in der Mitte die Klaviatur C2–C6 (seitlich verschiebbar), unten
   Hand, Finger, Anhören, Gebrochen, Rückgängig, Notiz und die
   Wechsel-Ansicht „Mit Vorgänger“. „Alle Griffe“ zeigt den Spickzettel.
   Regeln rein in voicing.js, Namen in chordsym.js. */

import * as audio from '../audio.js';
import { S, putSong } from '../store.js';
import { voicingFor, validateVoicing, allKeys, NOTE_MAX } from '../voicing.js';
import { parseChord, nameFromKeys, sameChord, prettyChord } from '../chordsym.js';
import { setVoicing, addChord, renameChord, deleteChord } from '../songdata.js';
import { predecessors } from '../timeline.js';
import { moveText, gripText, noteName } from '../chords.js';
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
  // Handwechsel beginnt die Fingerfolge neu (kein Finger gewählt).
  for (const b of $$('#s-griffe [data-hand]')) b.addEventListener('click', () => { st.hand = b.dataset.hand; st.finger = null; paintTools(); });
  for (const b of $$('#s-griffe [data-finger]')) {
    b.addEventListener('click', () => {
      const f = Number(b.dataset.finger);
      st.finger = st.finger === f ? null : f;
      paintTools();
    });
  }
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
  return new Promise((resolve) => {
    st = {
      songId, sym: symbol && s.chords.includes(symbol) ? symbol : s.chords[0],
      hand: 'rh', finger: null, prevMode: false, prevIdx: 0, undo: [], drafts: new Map(), resolve, center: true,
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
  const { marks, arrows } = pv && v ? diffMarks(pv, v) : { marks: voicingMarks(v), arrows: [] };
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

function paintHint(v) {
  const hint = $('#gr-hint');
  hint.replaceChildren();
  const lines = [];
  if (v?.std) lines.push(`Standardlage – ${gripText(v)} Tippe Tasten an, um den Griff aus dem Unterricht einzutragen.`);
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
  for (const b of $$('#s-griffe [data-hand]')) b.setAttribute('aria-pressed', b.dataset.hand === st.hand ? 'true' : 'false');
  for (const b of $$('#s-griffe [data-finger]')) b.setAttribute('aria-pressed', Number(b.dataset.finger) === st.finger ? 'true' : 'false');
  $('#gr-undo').disabled = !st.undo.length;
  $('#gr-prev').setAttribute('aria-pressed', st.prevMode ? 'true' : 'false');
}

/* ---------- Bearbeiten ------------------------------------------------- */

function select(sym) {
  st.sym = sym;
  st.prevIdx = 0;
  st.finger = null;
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

/** Hand als Liste [{ key, finger }]. */
const handList = (v, h) => (v?.[h] || []).map((key, i) => ({ key, finger: v[`${h}Fingers`]?.[i] ?? null }));
const fromLists = (rh, lh, note) => {
  const sort = (xs) => [...xs].sort((a, b) => a.key - b.key);
  const r = sort(rh), l = sort(lh);
  const v = { rh: r.map((x) => x.key), rhFingers: r.map((x) => x.finger), lh: l.map((x) => x.key), lhFingers: l.map((x) => x.finger) };
  if (note) v.note = note;
  return v;
};

function say(text) {
  $('#gr-hint').textContent = text;
}

/** Taste antippen: an/aus für die gewählte Hand, Handwechsel, Finger setzen. */
async function tapKey(m) {
  const v = shown(st.sym);
  const lists = { rh: handList(v, 'rh'), lh: handList(v, 'lh') };
  const h = st.hand, other = h === 'rh' ? 'lh' : 'rh';
  const inHand = lists[h].find((x) => x.key === m), inOther = lists[other].find((x) => x.key === m);
  const full = () => { say('Höchstens 5 Tasten je Hand.'); };
  if (st.finger !== null) {
    let entry = inHand;
    if (!entry) {
      if (lists[h].length >= 5) return full();
      if (inOther) lists[other] = lists[other].filter((x) => x.key !== m);
      entry = { key: m, finger: null };
      lists[h].push(entry);
    }
    const f = st.finger === 0 ? null : st.finger;
    if (f !== null) for (const x of lists[h]) if (x.finger === f) x.finger = null; // Finger wandert mit
    entry.finger = f;
    if (st.finger > 0) st.finger = st.finger < 5 ? st.finger + 1 : null;
  } else if (inHand) {
    lists[h] = lists[h].filter((x) => x.key !== m);
  } else {
    if (lists[h].length >= 5) return full();
    if (inOther) lists[other] = lists[other].filter((x) => x.key !== m);
    lists[h].push({ key: m, finger: null });
  }
  await save(st.sym, fromLists(lists.rh, lists.lh, own(st.sym)?.note));
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
      p.textContent = [v.note, v.note ? gripText({ ...v, note: '' }) : gripText(v)].filter(Boolean).join(' · ');
    } else p.textContent = 'Noch kein Griff.';
    li.append(head, kb, p);
    return li;
  }));
  showScreen('sheet');
}
