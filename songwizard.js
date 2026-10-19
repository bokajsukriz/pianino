/* songwizard.js — Assistent für einen neuen Song, als Leiste auf der
   Liedseite (unter Player und Loop, bleibt beim Scrollen stehen). Er führt
   durch vier Schritte und benutzt dabei die Liedseite selbst:
     1 Video     YouTube-Link oben einfügen (oder ohne Video weiter)
     2 Teile     beim Abspielen am Anfang jedes Teils seinen Namen tippen,
                 einmal das Tempo mittippen (dann ergeben sich die Takte)
     3 Wechsel   Akkorde anlegen („+ Akkord“), dann beim
                 Abspielen den Akkord tippen, sobald er wechselt (Tasten 1–9)
     4 Griffe    je Akkord die Tasten im Griff-Editor eintragen
   Die Liedseite gibt die Aktionen als api (initWizard). */

import { tapTempo } from './tap.js';
import { fmtClock } from './marks.js';
import { $, screenName } from './ui.js';

const STEPS = Object.freeze([
  { id: 'video', title: 'Video' },
  { id: 'parts', title: 'Teile und Tempo' },
  { id: 'chords', title: 'Akkordwechsel' },
  { id: 'grips', title: 'Griffe' },
]);
const PARTS = ['Intro', 'Strophe', 'Pre-Chorus', 'Refrain', 'Bridge', 'Solo', 'Outro'];

let api = null;
let st = null;   // { i, added: [ids], tapped: [at], taps: [Sekunden] }
let wired = false;

/** api: song(), now() (Videozeit oder null), hasVideo(), addSection(base) → id,
 *  deleteSection(id), setBpm(bpm), tapChord(sym) → at | null,
 *  clearChord(at), newChord() → Symbol | null, griffe(sym). */
export function initWizard(a) {
  api = a;
  if (wired) return;
  wired = true;
  $('#sp-wiz-x').addEventListener('click', stopWizard);
  $('#sp-wiz-back').addEventListener('click', () => go(-1));
  $('#sp-wiz-next').addEventListener('click', () => go(1));
  document.addEventListener('keydown', onKey);
}

/** Assistent starten (Schritt per id, Standard: der erste). */
export function startWizard(step = 'video') {
  st = { i: Math.max(0, STEPS.findIndex((x) => x.id === step)), added: [], tapped: [], taps: [] };
  $('#sp-wiz').hidden = false;
  paintWizard();
}

export function stopWizard() {
  st = null;
  $('#sp-wiz').hidden = true;
}

export const wizardOn = () => !!st;

function go(dir) {
  const i = st.i + dir;
  if (i >= STEPS.length) { stopWizard(); return; }
  st.i = Math.max(0, i);
  st.taps = [];
  note('');
  paintWizard();
}

const note = (text) => { $('#sp-wiz-note').textContent = text; };

function btn(text, onClick, cls = 'btn btn-secondary btn-sm', label = null) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = cls;
  b.textContent = text;
  if (label) b.setAttribute('aria-label', label);
  b.addEventListener('click', onClick);
  return b;
}

function row(...nodes) {
  const d = document.createElement('div');
  d.className = 'sp-wiz-row';
  d.append(...nodes);
  return d;
}

/** Leiste neu zeichnen (die Liedseite ruft das nach jeder Änderung). */
export function paintWizard() {
  if (!st) return;
  const step = STEPS[st.i];
  $('#sp-wiz-step').textContent = `Schritt ${st.i + 1} von ${STEPS.length}: ${step.title}`;
  $('#sp-wiz-back').disabled = st.i === 0;
  const s = api.song();
  let text = '', body = [], next = 'Weiter';
  if (step.id === 'video') {
    text = api.hasVideo()
      ? 'Video ist da. Weiter zu den Teilen.'
      : 'Füg oben den YouTube-Link ein und tippe „Laden“. Ohne Video geht es auch: dann Teile und Akkorde von Hand.';
    if (!api.hasVideo()) next = 'Ohne Video weiter';
  } else if (step.id === 'parts') {
    text = api.hasVideo()
      ? 'Spiel das Video ab und tippe am Anfang jedes Teils auf seinen Namen. Dazu einmal etwa 8× im Takt auf „Tempo tippen“ – dann ergeben sich die Takte.'
      : 'Tippe die Teile in ihrer Reihenfolge an. Takte stellst du an jeder Karte unter ⋯ ein.';
    body = [
      row(...PARTS.map((n) => btn(n, () => addPart(n)))),
      row(
        btn('↶ Letzten Teil weg', undoPart, 'btn btn-ghost btn-sm'),
        btn('Tempo tippen', tapBeat, 'btn btn-secondary btn-sm', 'Tempo: im Takt tippen'),
        textSpan(s.bpm ? `${s.bpm} BPM` : 'Tempo noch offen', 'sp-wiz-bpm'),
      ),
    ];
    body[1].firstChild.disabled = !st.added.length;
  } else if (step.id === 'chords') {
    const timed = !!s.bpm && s.sections.some((x) => x.startSec != null);
    text = !s.chords.length
      ? 'Welche Akkorde kommen vor? Leg sie mit „+ Akkord“ an.'
      : timed
        ? 'Spiel einen Teil ab und tippe den Akkord, sobald er wechselt (am Rechner: Tasten 1–9). Feinheiten danach im Raster: Zelle antippen.'
        : 'Ohne Tempo und Startzeit: im Raster die Viertel antippen und den Akkord wählen.';
    body = [
      row(...s.chords.map((c, k) => btn(c, () => tapChord(c), 'btn btn-secondary sp-wiz-chord', `${c}${k < 9 ? ` (Taste ${k + 1})` : ''}`)),
        btn('+ Akkord', newChord, 'btn btn-ghost btn-sm')),
      row(btn('↶ Letzten Wechsel weg', undoChord, 'btn btn-ghost btn-sm')),
    ];
    for (const b of body[0].querySelectorAll('.sp-wiz-chord')) b.disabled = !timed;
    body[1].firstChild.disabled = !st.tapped.length;
  } else if (step.id === 'grips') {
    text = s.chords.length
      ? 'Wie spielst du die Akkorde? Tippe einen an und trag die Tasten auf der Klaviatur ein (✓ = eigener Griff).'
      : 'Noch keine Akkorde – zurück zu Schritt 3.';
    body = [row(...s.chords.map((c) => btn(`${s.voicings?.[c] ? '✓ ' : ''}${c}`, () => api.griffe(c))))];
    next = 'Fertig';
  }
  $('#sp-wiz-text').textContent = text;
  $('#sp-wiz-body').replaceChildren(...body);
  $('#sp-wiz-next').textContent = next;
}

function textSpan(text, cls) {
  const sp = document.createElement('span');
  sp.className = cls;
  sp.textContent = text;
  return sp;
}

/* ---------- Schritt 2: Teile und Tempo -------------------------------- */

async function addPart(base) {
  const t = api.now();
  const id = await api.addSection(base);
  if (!id || !st) return;
  st.added.push(id);
  const sec = api.song().sections.find((x) => x.id === id);
  note(`${sec.name}${t != null ? ` ab ${fmtClock(t, { tenths: true })}` : ''} angelegt.`);
  paintWizard();
}

async function undoPart() {
  const id = st.added.pop();
  if (!id) return;
  const name = api.song().sections.find((x) => x.id === id)?.name;
  await api.deleteSection(id);
  note(name ? `${name} entfernt.` : '');
  paintWizard();
}

/** Tempo mittippen; nach 2 s Pause beginnt es neu. */
async function tapBeat() {
  const now = performance.now() / 1000;
  if (st.taps.length && now - st.taps[st.taps.length - 1] > 2) st.taps = [];
  st.taps.push(now);
  const r = tapTempo(st.taps);
  if (r.bpm) { await api.setBpm(r.bpm); note(`Tempo ${r.bpm} BPM – weiter tippen macht es genauer.`); }
  else note(`Weiter tippen (noch ${r.need}×) …`);
}

/* ---------- Schritt 3: Akkordwechsel ----------------------------------- */

async function tapChord(sym) {
  const at = await api.tapChord(sym);
  if (!st) return;
  if (at == null) { note('Die Stelle liegt in keinem Teil – erst den Teil abspielen.'); return; }
  st.tapped.push(at);
  const bpb = api.song().beatsPerBar;
  note(`${sym} ab Takt ${Math.floor(at / bpb) + 1}, Schlag ${(at % bpb) + 1}.`);
  paintWizard();
}

async function undoChord() {
  const at = st.tapped.pop();
  if (at == null) return;
  await api.clearChord(at);
  note('Letzten Wechsel entfernt.');
  paintWizard();
}

async function newChord() {
  const c = await api.newChord();
  if (c) { note(`${c} angelegt.`); paintWizard(); }
}

function onKey(e) {
  if (!st || screenName() !== 'song' || STEPS[st.i].id !== 'chords' || !$('#modal').hidden) return;
  if (e.target.closest?.('input, textarea, select')) return;
  if (!/^[1-9]$/.test(e.key)) return;
  const c = api.song().chords[Number(e.key) - 1];
  if (!c) return;
  e.preventDefault();
  tapChord(c);
}
