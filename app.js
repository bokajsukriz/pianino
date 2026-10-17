/* app.js — Einstieg: Laden, Routing zwischen den Screens, Verdrahtung.
   Die Übungen selbst liegen in exercises/, der Ablauf einer Session in
   session.js, die Regeln rein in leitner.js, tempo.js und mix.js. */

import * as audio from './audio.js';
import { S, loadAll, today, saveSettings } from './store.js';
import { buildMix, mixLabel, weekDots, songProgress, practicedThisWeek, WEEK_GOAL, MAX_LEVELS, DAY_MIN_SECONDS } from './mix.js';
import { hasMelody } from './melody.js';
import { SONG } from './song-perfect-ruin.js';
import { runSession, pause, resume, end, sessionRunning } from './session.js';
import { $, $$, showScreen } from './ui.js';
import { logError } from './log.js';

const WEEKDAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
let lastOut = null;

/* ---------- S1 Erster Start / Plan ----------------------------------- */
const planSentence = (plan) => `${plan} setze ich mich für 5 Minuten ans Klavier.`;

function currentPlanChoice() {
  const free = $('#plan-free').value.trim();
  if (free) return free;
  return $('.chip[aria-pressed="true"]')?.dataset.plan || '';
}

function paintPlanPreview() {
  const p = currentPlanChoice();
  $('#plan-preview').textContent = p ? planSentence(p) : 'Wähl einen Moment aus oder schreib deinen eigenen.';
}

function showPlan() {
  const plan = S.settings.plan || '';
  const chip = $$('.chip').find((c) => c.dataset.plan === plan);
  for (const c of $$('.chip')) c.setAttribute('aria-pressed', c === chip ? 'true' : 'false');
  $('#plan-free').value = chip ? '' : plan;
  paintPlanPreview();
  showScreen('plan');
}

async function savePlan(plan) {
  S.settings.plan = plan;
  S.settings.onboarded = true;
  await saveSettings();
  showStart();
}

/* ---------- S2 Start --------------------------------------------------- */
function mixState() {
  return {
    levels: S.progress.levels,
    lastPlayed: S.progress.lastPlayed,
    cards: [...S.cards.values()],
    verseBpm: S.loops.verse?.bpm ?? 55,
  };
}

function showStart() {
  const d = today();
  const planEl = $('#start-plan');
  planEl.hidden = !S.settings.plan;
  planEl.textContent = S.settings.plan ? `Dein Plan: ${planSentence(S.settings.plan)}` : '';
  // Geschützte Leerzeichen: umbrochen wird nur an den Trennpunkten.
  $('#mix-label').textContent = mixLabel(buildMix(mixState(), d)).split(' · ').map((x) => x.replace(/ /g, '\u00a0')).join(' · ');

  $('#week-dots').replaceChildren(...weekDots(S.days, d).map((dot, i) => {
    const li = document.createElement('li');
    const span = document.createElement('span');
    span.className = `dot${dot.practiced ? ' done' : ''}${dot.today ? ' today' : ''}`;
    li.append(span, document.createTextNode(WEEKDAYS[i]));
    li.setAttribute('aria-label', `${WEEKDAYS[i]}${dot.today ? ', heute' : ''}${dot.practiced ? ', geübt' : ''}`);
    return li;
  }));

  const lv = S.progress.levels;
  const pct = Math.round(songProgress(lv) * 100);
  $('#song-bar .bar-fill').style.width = `${pct}%`;
  $('#song-bar').setAttribute('aria-valuenow', String(pct));
  $('#song-percent').textContent = `${pct} %`;
  const verseBpm = S.loops.verse?.bpm;
  $('#song-status').textContent = `Blitz Stufe ${lv.blitz}/${MAX_LEVELS.blitz} · Wege Stufe ${lv.wege}/${MAX_LEVELS.wege}`
    + ` · Groove Stufe ${lv.groove}/${MAX_LEVELS.groove}${verseBpm ? ` · Strophe ${verseBpm} BPM` : ''}`;
  showScreen('start');
  audio.preloadPiano();
}

/* ---------- S8 Abschluss ---------------------------------------------- */
function tempoLine(r, verb) {
  const ok = `${r.ok}/${r.blocks} ${verb}`;
  return r.down ? `${ok} – Tempo angepasst` : `${ok} – nächstes Mal ${r.bpmEnd} BPM`;
}

/** Geübte Zeit, neutral formuliert. */
function timeLine(sec) {
  const s = Math.round(sec || 0);
  if (s < 60) return `${s} Sekunden am Klavier`;
  const m = Math.round(s / 60);
  return m === 1 ? '1 Minute am Klavier' : `${m} Minuten am Klavier`;
}

/** Drei Zeilen, nur positiv oder neutral: bis zu zwei aus den Übungen
 *  (sonst die geübte Zeit), dann die Woche. */
function doneLines(out) {
  const { results } = out;
  const lines = [];
  const b = results.blitz, w = results.wege, g = results.groove, p = results.playalong;
  if (w?.blocks) lines.push(tempoLine(w, 'drangeblieben'));
  if (g?.blocks) lines.push(tempoLine(g, 'groovt'));
  if (b?.cards) {
    lines.push(b.sass.size ? `+${b.sass.size} ${b.sass.size === 1 ? 'Karte' : 'Karten'} sicher gegriffen`
      : `${b.cards} ${b.cards === 1 ? 'Karte' : 'Karten'} geübt`);
  }
  if (p?.bars) lines.push(`${p.bars} Takte mitgespielt`);
  const top = lines.slice(0, 2);
  if (top.length < 2) top.push(timeLine(out.seconds));
  const d = today();
  const days = practicedThisWeek(S.days, d);
  const counted = (S.days[d]?.seconds || 0) >= DAY_MIN_SECONDS;
  const week = !counted ? 'Ab 1 Minute zählt der Tag fürs Wochenziel'
    : days >= WEEK_GOAL ? `Wochenziel geschafft: ${days} Tage diese Woche`
      : `${days} von ${WEEK_GOAL} Tagen diese Woche`;
  return [...top, week];
}

function showDone(out) {
  $('#done-lines').replaceChildren(...doneLines(out).map((t) => {
    const li = document.createElement('li'); li.textContent = t; return li;
  }));
  $('#reward-note').textContent = hasMelody(SONG)
    ? 'Die Strophe mit Melodie zum Mitsummen.'
    : 'Die Strophe zum Mitspielen. (Melodie noch nicht erfasst.)';
  showScreen('done');
}

/* ---------- Sessions --------------------------------------------------- */
async function start(plan, { keepDone = false } = {}) {
  if (sessionRunning()) return;
  await audio.unlock();
  audio.preloadPiano();
  const out = await runSession(plan);
  if (!keepDone) lastOut = out;
  showDone(keepDone && lastOut ? lastOut : out);
}

function moreExercise() {
  const last = lastOut?.lastExercise;
  if (last && last !== 'playalong') return last;
  return S.progress.lastExercise || 'blitz';
}

/* ---------- Verdrahtung ------------------------------------------------ */
function wire() {
  // S1
  for (const c of $$('.chip')) {
    c.addEventListener('click', () => {
      for (const o of $$('.chip')) o.setAttribute('aria-pressed', o === c ? 'true' : 'false');
      $('#plan-free').value = '';
      paintPlanPreview();
    });
  }
  $('#plan-free').addEventListener('input', () => {
    if ($('#plan-free').value.trim()) for (const o of $$('.chip')) o.setAttribute('aria-pressed', 'false');
    paintPlanPreview();
  });
  $('#plan-ok').addEventListener('click', () => savePlan(currentPlanChoice()));
  $('#plan-skip').addEventListener('click', () => savePlan(S.settings.plan && S.settings.onboarded ? S.settings.plan : ''));

  // S2
  $('#start-plan').addEventListener('click', showPlan);
  $('#go-mix').addEventListener('click', () => start(buildMix(mixState(), today())));
  $('#go-one').addEventListener('click', () => start([{ exercise: 'blitz', cards: 6 }]));
  for (const b of $$('[data-direct]')) b.addEventListener('click', () => start([{ exercise: b.dataset.direct, seconds: 180 }]));
  $('#go-about').addEventListener('click', () => showScreen('about'));

  // S8
  $('#go-reward').addEventListener('click', () => start([{ exercise: 'playalong', bars: 8, melody: true }], { keepDone: true }));
  $('#go-more').addEventListener('click', () => start([{ exercise: moreExercise(), seconds: 60 }]));
  $('#go-home').addEventListener('click', showStart);

  // Über
  $('[data-back]').addEventListener('click', showStart);
  $('#about-plan').addEventListener('click', showPlan);
  $('#about-selftest').addEventListener('click', async () => {
    const out = $('#selftest-out');
    out.hidden = false;
    out.textContent = 'Läuft …';
    const { runSelfTests } = await import('./selftest.js');
    const r = await runSelfTests();
    out.textContent = `${r.passed} von ${r.results.length} grün\n\n`
      + r.results.map((x) => `${x.ok ? (x.skipped ? '–' : '✓') : '✗'} ${x.name}${x.detail ? ` (${x.detail})` : ''}`).join('\n');
  });

  // Pause / Beenden
  for (const b of $$('[data-pause]')) b.addEventListener('click', pause);
  $('#pause-go').addEventListener('click', resume);
  $('#pause-end').addEventListener('click', end);

  // Schalter Klick / Melodie / tiefer: gelten sofort (die Uhr liest sie je Schritt).
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-toggle]');
    if (!b || b.disabled) return;
    const key = b.dataset.toggle;
    S.settings[key] = b.getAttribute('aria-pressed') !== 'true';
    for (const o of $$(`[data-toggle="${key}"]`)) if (!o.disabled) o.setAttribute('aria-pressed', S.settings[key] ? 'true' : 'false');
    saveSettings();
  });

  // iOS: AudioContext erst im ersten Tipp anlegen und entsperren.
  document.addEventListener('pointerdown', () => audio.unlock(), { once: true, capture: true });
  // Escape = Pause während einer Übung.
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && sessionRunning() && $('#pause').hidden) pause();
  });
}

async function boot() {
  window.runSelfTests = (...a) => import('./selftest.js').then((m) => m.runSelfTests(...a));
  wire();
  try { await loadAll(); } catch (e) { logError('boot:load', e); }
  if (!S.settings.onboarded) showPlan(); else showStart();
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch((e) => logError('sw', e));
  }
}

window.addEventListener('error', (e) => logError('window', e.error || e.message));
window.addEventListener('unhandledrejection', (e) => logError('promise', e.reason));
boot();
