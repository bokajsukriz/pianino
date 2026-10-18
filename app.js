/* app.js — Einstieg: Laden, Routing zwischen den Screens, Verdrahtung.
   Die Übungen selbst liegen in exercises/, der Ablauf einer Session in
   session.js, die Regeln rein in leitner.js, tempo.js und mix.js. */

import * as audio from './audio.js';
import { S, loadAll, today, saveSettings, currentSong, phraseStates, putSong, setCurrentSong } from './store.js';
import { buildMix, mixLabel, weekDots, practicedThisWeek, WEEK_GOAL, DAY_MIN_SECONDS } from './mix.js';
import { phraseDefs, guideProgress, unlocked, newPhrase } from './phrases.js';
import { youtubeSource } from './timeline.js';
import { runSession, pause, resume, end, sessionRunning } from './session.js';
import { initSongs, showSongs as paintSongs, songFacts, exportOne, removeSong } from './songs.js';
import { initSongPage, openSongPage, refreshSongPage, openMeterSheet, fromTabs, tabsHaveHeaders, openWizard } from './songpage.js';
import { openGriffe } from './exercises/griffe.js';
import { openTranscribe } from './exercises/transcribe.js';
import { $, $$, showScreen, setToggle, onScreen, screenName, modal, ask } from './ui.js';
import { supported as micSupported, EARS, earMode } from './mic.js';
import { openMicTest, closeMicTest } from './mictest.js';
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
  showSongs();
}

/* ---------- S2 Start --------------------------------------------------- */
function mixState() {
  const song = currentSong();
  const src = youtubeSource(song);
  return { hasEvents: !!song?.events.length, video: !!(src?.videoId && src.offsetSec != null && song.bpm) };
}

/** Stand je freigeschalteter Phrase, z. B. „Strophe 1/2 sitzt · Refrain 52 BPM“. */
function phraseStatus(defs, states) {
  return unlocked(defs, states).map((id) => {
    const d = defs.find((x) => x.id === id);
    const p = states[id] || newPhrase(id);
    if (p.solid) return `${d.name} sitzt`;
    if (p.mode === 'tempo') return `${d.name} ${p.bpm} BPM`;
    return p.passes ? `${d.name} ohne Tempo` : `${d.name} neu`;
  }).join(' · ');
}

let reloadPending = false;

/** Startpunkt: die Songliste. */
function showSongs() {
  if (reloadPending) { location.reload(); return; }
  paintSongs();
}

/* ---------- Liedseite --------------------------------------------------- */
let afterSong = null; // was nach „Zurück“ von der Liedseite kommt (Menü „Mehr“)

async function toSongPage(id, opts = {}) {
  afterSong = null;
  await openSongPage(id, opts);
  const next = afterSong || showSongs;
  afterSong = null;
  next();
}

/** Menü „Mehr“ der Liedseite. */
async function songMenu(id) {
  const song = S.songs.get(id);
  if (!song) return;
  const a = await modal(song.title, '', [
    { label: 'Takt und Tempo', value: 'meter' },
    { label: 'Assistent', value: 'wizard' },
    ...(tabsHaveHeaders(song) ? [{ label: 'Abschnitte aus den Tabs', value: 'fromtabs' }] : []),
    { label: 'Titel und Interpret', value: 'name' },
    { label: 'Video ändern', value: 'video' },
    { label: 'Griffe', value: 'griffe' },
    { label: 'Damit üben', value: 'practice' },
    { label: 'Exportieren', value: 'export' },
    { label: 'Löschen', value: 'delete' },
    { label: 'Schließen', value: '', primary: true },
  ]);
  const leave = (fn) => { afterSong = fn; $('#sp-back').click(); };
  if (a === 'meter') {
    openMeterSheet();
  } else if (a === 'wizard') {
    openWizard();
  } else if (a === 'fromtabs') {
    await fromTabs();
  } else if (a === 'name') {
    const t = await ask('Titel', '', { value: song.title, ok: 'Weiter' });
    if (t == null) return;
    const ar = await ask('Interpret', '', { value: song.artist || '', ok: 'Speichern' });
    await putSong({ ...S.songs.get(id), title: t || song.title, artist: ar ?? song.artist });
    refreshSongPage();
  } else if (a === 'video') {
    $('#sp-novideo').hidden = false;
    $('#sp-url').focus();
  } else if (a === 'griffe') {
    leave(() => toGriffe(id, () => toSongPage(id)));
  } else if (a === 'practice') {
    await setCurrentSong(id);
    leave(showStart);
  } else if (a === 'export') {
    await exportOne(S.songs.get(id));
  } else if (a === 'delete') {
    if (await removeSong(S.songs.get(id))) leave(showSongs);
  }
}

function showStart() {
  if (reloadPending) { location.reload(); return; }
  const d = today();
  const planEl = $('#start-plan');
  planEl.hidden = !S.settings.plan;
  planEl.textContent = S.settings.plan ? `Dein Plan: ${planSentence(S.settings.plan)}` : '';
  // Geschützte Leerzeichen: umbrochen wird nur an den Trennpunkten.
  $('#mix-label').textContent = mixLabel(buildMix(mixState(), d)).split(' · ').map((x) => x.replace(/ /g, '\u00a0')).join(' · ');
  const song = currentSong();
  const ready = !!song?.events.length;
  // Ohne Ereignisse kein Geführt: der Startscreen führt zu „Transkribieren“.
  $('#start-go').hidden = !ready;
  $('#start-todo').hidden = ready;
  $('#todo-title').textContent = song ? `„${song.title}“` : 'Der Song';
  for (const b of $$('[data-needs="events"]')) b.hidden = !ready;

  $('#week-dots').replaceChildren(...weekDots(S.days, d).map((dot, i) => {
    const li = document.createElement('li');
    const span = document.createElement('span');
    span.className = `dot${dot.practiced ? ' done' : ''}${dot.today ? ' today' : ''}`;
    li.append(span, document.createTextNode(WEEKDAYS[i]));
    li.setAttribute('aria-label', `${WEEKDAYS[i]}${dot.today ? ', heute' : ''}${dot.practiced ? ', geübt' : ''}`);
    return li;
  }));

  const defs = song ? phraseDefs(song) : [];
  const states = song ? phraseStates(song.id) : {};
  const pct = Math.round(guideProgress(defs, states) * 100);
  $('#song-title').textContent = song?.title || 'Kein Song';
  $('#song-by').textContent = song ? [song.artist, songFacts(song)].filter(Boolean).join(' · ') : '';
  $('#song-bar .bar-fill').style.width = `${pct}%`;
  $('#song-bar').setAttribute('aria-valuenow', String(pct));
  $('#song-percent').textContent = ready ? `${pct} %` : '';
  $('#song-bar').hidden = !ready;
  $('#song-status').textContent = ready ? phraseStatus(defs, states) : '';
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
  const b = results.blitz, w = results.wege, g = results.groove, p = results.playalong, gd = results.guided;
  if (gd?.solid.length) lines.push(`${gd.solid.join(' und ')} ${gd.solid.length === 1 ? 'sitzt' : 'sitzen'} jetzt`);
  if (gd?.passes) {
    const where = gd.mode === 'tempo' ? ` – ${gd.last} jetzt bei ${gd.bpm} BPM` : ` – ${gd.last} noch ohne Tempo`;
    lines.push(`${gd.clean} von ${gd.passes} ${gd.passes === 1 ? 'Durchgang' : 'Durchgängen'} sauber${gd.solid.length ? '' : where}`);
  }
  if (w?.blocks) lines.push(tempoLine(w, 'drangeblieben'));
  if (g?.blocks) lines.push(tempoLine(g, 'groovt'));
  if (b?.cards) {
    lines.push(b.sass.size ? `+${b.sass.size} ${b.sass.size === 1 ? 'Karte' : 'Karten'} sicher gegriffen`
      : `${b.cards} ${b.cards === 1 ? 'Karte' : 'Karten'} geübt`);
  }
  if (p?.seconds >= 5) lines.push(`${timeLine(p.seconds).replace(' am Klavier', '')} mitgespielt`);
  const wn = results.wann;
  if (wn?.passes) lines.push(`${wn.hits} von ${wn.total} Wechseln pünktlich getroffen`);
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
  const song = currentSong();
  const ready = !!song?.events.length;
  $('#reward').hidden = !ready;
  const src = youtubeSource(song);
  $('#reward-note').textContent = src?.videoId && src.offsetSec != null ? 'Mit dem Video, das Akkordband läuft mit.' : 'Mit eigener Klavierbegleitung.';
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
  return S.progress.lastExercise || 'guided';
}

/** Beschriftung der Erkenner-Knöpfe. */
function paintEar() {
  for (const b of $$('[data-ear]')) b.textContent = `Hören: ${earMode()}`;
}

/* ---------- Werkzeuge: Griffe, Transkribieren --------------------------- */
/** Griff-Editor bzw. Editor öffnen; nach „Zurück“ then(). */
async function toGriffe(id, then, symbol = null) {
  if (!id || sessionRunning()) return;
  await openGriffe(id, symbol);
  then();
}
async function toTranscribe(id, then) {
  if (!id || sessionRunning()) return;
  await openTranscribe(id);
  then();
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
  $('#go-mix').addEventListener('click', () => { const m = buildMix(mixState(), today()); if (m.length) start(m); });
  $('#go-songs').addEventListener('click', showSongs);
  $('#go-griffe').addEventListener('click', () => toGriffe(currentSong()?.id, showStart));
  $('#go-griffe-todo').addEventListener('click', () => toGriffe(currentSong()?.id, showStart));
  $('#go-tr').addEventListener('click', () => toTranscribe(currentSong()?.id, showStart));
  $('#go-transcribe').addEventListener('click', () => toTranscribe(currentSong()?.id, showStart));
  for (const b of $$('[data-home]')) b.addEventListener('click', showStart);
  initSongs({ open: toSongPage, practice: showStart });
  initSongPage({
    menu: songMenu,
    // Assistent, Schritt „Griffe“: Editor für den Akkord, danach zurück in den Assistenten.
    griffe: (id, sym) => { afterSong = () => toGriffe(id, () => toSongPage(id, { wizard: 'grips' }), sym); $('#sp-back').click(); },
  });
  $('#go-one').addEventListener('click', () => start([{ exercise: 'guided', seconds: 60 }]));
  for (const b of $$('[data-direct]')) b.addEventListener('click', () => start([{ exercise: b.dataset.direct, seconds: 180 }]));
  // „Über und Einstellungen“ von der Songliste und vom Übe-Start; „Zurück“ führt dorthin zurück.
  let aboutBack = showStart;
  const openAbout = (back) => {
    aboutBack = back;
    for (const b of $$('#s-about [data-toggle="mic"]')) setToggle(b, !!S.settings.mic, !micSupported());
    paintEar();
    askVersion();
    $('#about-update-note').textContent = '';
    showScreen('about');
  };
  $('#go-about').addEventListener('click', () => openAbout(showStart));
  $('#songs-about').addEventListener('click', () => openAbout(showSongs));

  // S8
  $('#go-reward').addEventListener('click', () => start([{ exercise: 'playalong', bars: 8, range: 'song' }], { keepDone: true }));
  $('#go-more').addEventListener('click', () => start([{ exercise: moreExercise(), seconds: 60 }]));
  $('#go-home').addEventListener('click', showStart);

  // Über
  $('[data-back]').addEventListener('click', () => aboutBack());
  $('#about-plan').addEventListener('click', showPlan);
  $('#about-update').addEventListener('click', checkUpdate);
  $('#about-mictest').addEventListener('click', () => { if (!sessionRunning()) openMicTest(); });
  $('#mt-back').addEventListener('click', () => { closeMicTest(); showScreen('about'); });
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

  // Erkenner: eigen → essentia → beide (gilt ab der nächsten Auswertung).
  document.addEventListener('click', (e) => {
    if (!e.target.closest('[data-ear]')) return;
    S.settings.ear = EARS[(EARS.indexOf(earMode()) + 1) % EARS.length];
    paintEar();
    saveSettings();
  });

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

/* ---------- Zurück (Android-Taste, Wischgeste) --------------------------
   Die Screens wechseln ohne Seitenwechsel. Damit „Zurück“ nicht die App
   verlässt, liegt außerhalb des Startscreens ein Eintrag im Verlauf; ihn
   zurückzunehmen heißt: Übung pausieren, Mikrofon-Test → Über, sonst
   Startscreen. Auf dem Startscreen verlässt „Zurück“ die App wie gewohnt. */
let ignorePop = 0;
const guard = () => { if (!history.state?.pianino) history.pushState({ pianino: 1 }, ''); };
const unguard = () => { if (history.state?.pianino) { ignorePop++; history.back(); } };

function onBack() {
  if (ignorePop) { ignorePop--; return; }
  const name = screenName();
  if (name === 'songs') return;
  if (sessionRunning()) { guard(); if ($('#pause').hidden) pause(); return; }
  if (!$('#modal').hidden || (name === 'plan' && !S.settings.onboarded)) { guard(); return; }
  if (name === 'mictest') { closeMicTest(); showScreen('about'); return; }
  if (name === 'griffe') { guard(); $('#gr-back').click(); return; }
  if (name === 'sheet') { guard(); $('#sheet-back').click(); return; }
  if (name === 'tr') { guard(); $('#tr-back').click(); return; }
  if (name === 'import' || name === 'start') { showSongs(); return; }
  if (name === 'song') { guard(); $('#sp-back').click(); return; }
  showStart();
}

/* ---------- Version und Update ---------------------------------------- */
let swReg = null;

/** Version vom aktiven Service Worker erfragen (= SW_VERSION in sw.js). */
function askVersion() {
  const el = $('#about-version');
  const ctl = navigator.serviceWorker?.controller;
  el.textContent = ctl ? 'Version …' : 'Version: ohne Offline-Speicher';
  ctl?.postMessage({ type: 'version' });
}

/** Neue Version holen. sw.js übernimmt sofort (skipWaiting + claim); die
 *  Seite lädt dann bei „controllerchange“ neu (siehe boot). */
async function checkUpdate() {
  const note = $('#about-update-note');
  if (!swReg) { note.textContent = 'Updates gehen hier nicht (kein Service Worker).'; return; }
  note.textContent = 'Suche …';
  try {
    await swReg.update();
    note.textContent = swReg.installing || swReg.waiting
      ? 'Neue Version wird geladen – die App startet gleich neu.'
      : 'Du hast die neueste Version.';
  } catch (e) {
    logError('sw:update', e);
    note.textContent = 'Keine Verbindung – später noch einmal versuchen.';
  }
}

async function boot() {
  onScreen((name) => (name === 'songs' ? unguard() : guard()));
  window.addEventListener('popstate', onBack);
  window.runSelfTests = (...a) => import('./selftest.js').then((m) => m.runSelfTests(...a));
  wire();
  try { await loadAll(); } catch (e) { logError('boot:load', e); }
  if (!S.settings.onboarded) showPlan(); else showSongs();
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').then((r) => { swReg = r; }).catch((e) => logError('sw', e));
    navigator.serviceWorker.addEventListener('message', (e) => {
      if (e.data?.type === 'version') $('#about-version').textContent = `Version ${e.data.version}`;
    });
    // Neue Version hat übernommen: neu laden, aber nie mitten in einer Übung
    // (dann beim nächsten Startscreen). Beim allerersten Einrichten nicht.
    let hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!hadController) { hadController = true; askVersion(); return; }
      if (sessionRunning()) reloadPending = true; else location.reload();
    });
  }
}

window.addEventListener('error', (e) => logError('window', e.error || e.message));
window.addEventListener('unhandledrejection', (e) => logError('promise', e.reason));
boot();
