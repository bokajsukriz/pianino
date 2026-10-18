/* exercises/playalong.js — Play-Along (Arbeitsanweisung Transkription 6.3).
   Keine Bewertung; Ergebnis: gespielte Sekunden.

   Mit YouTube (Quelle mit offsetSec und bpm im Song): Video links, rechts das
   Akkordband — der aktuelle Akkord groß, der nächste mit Countdown in
   Schlägen, darunter die Takte des Abschnitts mit vorgezogenen Wechseln vor
   dem Taktstrich und, falls vorhanden, der Text. Kein eigener Klick: das
   Original ist das Metronom. Auswahl ganzer Song / Abschnitt / Loop über die
   gerade geübte Phrase, Rate wie YouTube sie anbietet (0,5 / 0,75 / 1).

   Ohne Quelle, ohne Offset oder ohne Netz: eigene Klavierbegleitung über
   clock.js auf der Zeitleiste (Muster der Groove-Stufe 3), Klick wahlweise.

   item: { seconds } (weiches Zeitlimit: bis zum nächsten Taktstrich),
   { bars } (Belohnung: so viele Takte), range: 'song' | 'phrase' | <Abschnitt-id>. */

import * as audio from '../audio.js';
import * as yt from '../yt.js';
import { createBand } from '../band.js';
import { S, currentSong, phraseStates } from '../store.js';
import { voicingFor } from '../voicing.js';
import { youtubeSource, beatToSec, secToBeat, sectionRange, songEndBeat, barOf } from '../timeline.js';
import { phraseDefs, focusPhrase } from '../phrases.js';
import { stepHits } from '../accomp.js';
import { GROOVE_STAGES } from '../tempo.js';
import { field, showScreen, frameLoop, setToggle } from '../ui.js';
import { createClock } from '../clock.js';

const PATTERN = GROOVE_STAGES[3];
/** ANNAHME: Ohne bpm im Song begleitet die App mit 72 BPM (Mitte des Übebereichs). */
export const FALLBACK_BPM = 72;
const RATES = [0.5, 0.75, 1];

/** Bereiche zur Auswahl: ganzer Song, jede Phrase (Loop), jeder Abschnitt. */
export function rangesOf(song, states = {}) {
  const end = songEndBeat(song);
  const out = [{ id: 'song', label: 'Ganzer Song', fromBeat: 0, toBeat: end, loop: false }];
  const focus = focusPhrase(phraseDefs(song), states);
  if (focus) out.push({ id: 'phrase', label: `Loop: ${focus.name}`, fromBeat: focus.fromBeat, toBeat: focus.toBeat, loop: true });
  for (const s of song.sections) {
    const r = sectionRange(song, s);
    out.push({ id: s.id, label: s.name, fromBeat: r.fromBeat, toBeat: r.toBeat, loop: true });
  }
  return out;
}

const leadSec = () => Math.max(0, Math.min(300, S.settings.leadMs ?? 80)) / 1000;

function paintRanges(sel, ranges, cur) {
  sel.replaceChildren(...ranges.map((r) => {
    const o = document.createElement('option');
    o.value = r.id;
    o.textContent = r.label;
    o.selected = r.id === cur;
    return o;
  }));
}

function paintRates(host, rates, cur, onPick) {
  host.replaceChildren(...rates.map((r) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'seg-btn';
    b.textContent = `${String(r).replace('.', ',')}×`;
    b.setAttribute('aria-pressed', r === cur ? 'true' : 'false');
    b.addEventListener('click', () => onPick(r));
    return b;
  }));
}

/** Runde Play-Along. */
export async function runPlayalong(api, item) {
  const song = currentSong();
  const scr = showScreen('play');
  const f = (n) => field(scr, n);
  const res = api.result('playalong', { seconds: 0 });
  const ranges = rangesOf(song, phraseStates(song.id));
  let range = ranges.find((r) => r.id === item.range) || ranges.find((r) => r.id === (item.bars ? 'song' : 'phrase')) || ranges[0];
  const src = youtubeSource(song);
  const band = createBand(f('band'));
  f('vnote').textContent = '';
  const ctx = { api, item, song, scr, f, res, band, ranges, get range() { return range; }, set range(r) { range = r; } };
  if (src?.videoId && src.offsetSec != null && song.bpm && !item.noVideo) {
    const ok = await videoMode(ctx);
    if (ok) return;
  }
  await ownMode(ctx);
}

/* ---------- Mit YouTube ------------------------------------------------ */

/** → true, wenn gespielt; false → eigene Begleitung (kein Netz, Fehler). */
async function videoMode(c) {
  const { api, item, song, f, res, band, ranges } = c;
  const bpb = song.beatsPerBar;
  f('video').hidden = false;
  f('yt').hidden = false;
  f('own').hidden = true;
  f('range-label').textContent = c.range.label;
  f('meta').textContent = `${song.bpm} BPM`;
  f('tip').textContent = 'Das Video gibt den Takt. Wenn du rausfällst: nur den Bass, und bei der nächsten Eins wieder rein.';
  f('count').textContent = 'Video lädt …';
  let player;
  try {
    player = await api.wait(yt.create(f('yt'), youtubeSource(song).videoId, {
      onError: (code) => { f('vnote').textContent = yt.errorText(code); },
    }));
  } catch (e) {
    if (api.ended) throw e;
    f('vnote').textContent = e?.message === 'offline' ? yt.YT_ERRORS.offline : yt.errorText(e?.message);
    f('video').hidden = true;
    return false;
  }
  const lead = leadSec();
  const startOf = (r) => beatToSec(song, r.fromBeat - bpb) - lead;
  const rates = player.rates().filter((r) => RATES.includes(r));
  let rate = rates.includes(0.75) && c.range.loop ? 0.75 : 1;
  if (!rates.length) rates.push(1);
  const setRate = (r) => { rate = r; player.setRate(r); paintRates(f('rates'), rates, rate, setRate); };
  setRate(rates.includes(rate) ? rate : rates[rates.length - 1]);
  paintRanges(f('range'), ranges, c.range.id);
  const ac = new AbortController();
  f('range').addEventListener('change', () => {
    c.range = ranges.find((r) => r.id === f('range').value) || ranges[0];
    f('range-label').textContent = c.range.label;
    player.seek(startOf(c.range));
  }, { signal: ac.signal });
  const startBtn = f('start');
  startBtn.hidden = false;
  startBtn.textContent = 'Abspielen';
  startBtn.addEventListener('click', () => {
    if (player.playing()) player.pause(); else player.play();
  }, { signal: ac.signal });
  const unPause = api.onPause((paused) => { if (paused) player.pause(); else player.play(); });
  player.seek(startOf(c.range));
  player.play(); // klappt auf dem Handy oft erst nach einem Tipp aufs Video

  const startBeat = c.range.fromBeat;
  let lastP = performance.now(), played = 0, timeUp = false, lastBeat = -Infinity, waitedSince = performance.now();
  try {
    await api.wait(new Promise((resolve) => {
      const stop = frameLoop(() => {
        const p = performance.now(), dt = (p - lastP) / 1000;
        lastP = p;
        const playing = player.playing();
        startBtn.textContent = playing ? 'Anhalten' : 'Abspielen';
        if (playing) { played += dt; waitedSince = p; }
        if (!playing && p - waitedSince > 2500 && !f('vnote').textContent) {
          f('vnote').textContent = 'Startet nicht? Einmal direkt aufs Video tippen. Läuft Werbung, wartet das Band.';
        }
        if (playing && f('vnote').textContent.startsWith('Startet nicht')) f('vnote').textContent = '';
        const beat = secToBeat(song, player.now() + lead);
        band.update(song, beat);
        f('count').textContent = beat < 0 ? 'gleich geht es los' : `Takt ${barOf(song, beat)}${playing ? '' : ' · angehalten'}`;
        const r = c.range;
        if (item.seconds && played >= item.seconds) timeUp = true;
        const crossedBar = Math.floor(beat / bpb) > Math.floor(lastBeat / bpb);
        lastBeat = beat;
        if (playing && timeUp && crossedBar) { stop(); resolve(); return; }
        if (item.bars && beat >= startBeat + item.bars * bpb) { stop(); resolve(); return; }
        if (playing && beat >= r.toBeat) {
          if (r.loop) player.seek(startOf(r));
          else { stop(); resolve(); }
        }
        if (player.state() === 'ended') { stop(); resolve(); }
      });
      ac.signal.addEventListener('abort', stop);
    }));
  } finally {
    ac.abort();
    unPause();
    res.seconds += played;
    player.destroy();
  }
  return true;
}

/* ---------- Eigene Begleitung ----------------------------------------- */

async function ownMode(c) {
  const { api, item, song, f, res, band, ranges } = c;
  const bpb = song.beatsPerBar;
  const base = song.bpm || FALLBACK_BPM;
  // Ohne Video: nur der Hinweis, warum (kein leerer Videorahmen).
  f('video').hidden = !f('vnote').textContent;
  f('yt').replaceChildren();
  f('yt').hidden = true;
  f('own').hidden = false;
  f('start').hidden = true;
  setToggle(f('own').querySelector('[data-toggle="click"]'), S.settings.click);
  f('tip').textContent = 'Summ mit. Wenn du rausfällst: nur den Bass, und bei der nächsten Eins wieder rein.';
  let rate = item.bars ? 0.75 : (c.range.loop ? 0.75 : 1);
  const grip = (sym) => voicingFor(song, sym);
  const ctx = audio.getCtx();
  const ac = new AbortController();
  let clock = null, played = 0, stopAt = Infinity;
  const countIn = 1;
  const bpmNow = () => Math.round(base * rate);

  /** Begleitung ab `atBeat` (Taktanfang; null = Anfang des Bereichs) starten,
   *  mit einem Takt Einzähler. Loop: am Ende des Bereichs wieder an den Anfang. */
  const start = (atBeat) => {
    clock?.stop();
    const r = c.range;
    let from = r.fromBeat;
    if (atBeat != null && atBeat > r.fromBeat && atBeat < r.toBeat) from = r.fromBeat + Math.floor((atBeat - r.fromBeat) / bpb) * bpb;
    const songBeat = (b) => {
      if (b < 0 || !r.loop || from + b < r.toBeat) return from + b;
      return r.fromBeat + ((from + b - r.fromBeat) % (r.toBeat - r.fromBeat));
    };
    const bpm = bpmNow();
    f('meta').textContent = `${bpm} BPM`;
    const total = item.bars ? (countIn + item.bars) * bpb * 2 : r.loop ? Infinity : (countIn * bpb + r.toBeat - from) * 2;
    const cl = createClock(ctx, {
      bpm, totalSteps: total, beatsPerBar: bpb,
      onStep: (s) => {
        const b = s.index / 2 - countIn * bpb;
        const beatStart = s.index % 2 === 0;
        if (b < 0) { if (beatStart) audio.click(s.time, s.index % (bpb * 2) === 0, 0.7); return; }
        if (s.time >= stopAt) return;
        const sb = songBeat(b);
        const restart = b === 0 || Math.abs(sb - r.fromBeat) < 1e-6;
        audio.playHits(stepHits(song, sb, { pattern: PATTERN, from: restart ? sb : -1 }), s.time, cl.stepDur * 2, grip, { gain: 0.5 });
        if (beatStart && S.settings.click) audio.click(s.time, Math.abs(sb % bpb) < 1e-6, 0.45);
      },
    });
    cl.songBeat = (pos) => songBeat(pos / 2 - countIn * bpb);
    clock = cl;
    stopAt = Infinity;
    cl.start(ctx.currentTime + 0.2);
  };
  const rates = [...RATES];
  const setRate = (r) => {
    rate = r;
    paintRates(f('rates'), rates, rate, (x) => { setRate(x); start(clock ? clock.songBeat(clock.position(audio.audibleNow())) : null); });
  };
  setRate(rate);
  paintRanges(f('range'), ranges, c.range.id);
  f('range-label').textContent = c.range.label;
  f('range').addEventListener('change', () => {
    c.range = ranges.find((r) => r.id === f('range').value) || ranges[0];
    f('range-label').textContent = c.range.label;
    start(null);
  }, { signal: ac.signal });

  start(null);
  let last = audio.now();
  try {
    await api.wait(new Promise((resolve) => {
      const stop = frameLoop(() => {
        const t = audio.now();
        if (audio.isRunning()) played += Math.max(0, t - last);
        last = t;
        const pos = clock.position(audio.audibleNow());
        const beat = clock.songBeat(pos);
        band.update(song, beat);
        f('count').textContent = pos < countIn * bpb * 2 ? 'Einzählen' : `Takt ${barOf(song, beat)}`;
        if (item.seconds && played >= item.seconds && stopAt === Infinity) {
          // Weiches Ende: am nächsten Taktstrich.
          const stepNow = Math.max(0, Math.ceil(clock.position(audio.now())));
          const barSteps = bpb * 2;
          const endStep = Math.ceil(stepNow / barSteps) * barSteps;
          stopAt = clock.t0 + endStep * clock.stepDur;
        }
        if (audio.now() >= stopAt + 0.3 || (!clock.running && audio.now() >= clock.endTime)) { stop(); resolve(); }
      });
      ac.signal.addEventListener('abort', stop);
    }));
  } finally {
    ac.abort();
    clock?.stop();
    res.seconds += played;
  }
}
