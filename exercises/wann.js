/* exercises/wann.js — Wann (Arbeitsanweisung Transkription 9.2): übt nur den
   Zeitpunkt der Wechsel, ohne Griffe. Mit YouTube (Loop über die Phrase)
   oder ohne Video mit Klick und leiser Klavierbegleitung über clock.js.
   Getippt wird bei jedem Wechsel (Bildschirm, Leertaste, Pedal) oder am
   Klavier irgendein Ton (Mikrofon, Anschlagserkennung aus mic.js).
   Stufen: 1 Akkordband mit Countdown, 2 nur Akkordband, 3 ohne Anzeige.
   Auswertung und Stufen rein in tap.js (scoreTaps, applyWann). */

import * as audio from '../audio.js';
import * as mic from '../mic.js';
import * as yt from '../yt.js';
import { createBand } from '../band.js';
import { S, today, currentSong, phraseStates, getWann, putWann, saveSettings } from '../store.js';
import { voicingFor } from '../voicing.js';
import { prettyChord } from '../chordsym.js';
import { youtubeSource, beatToSec, secToBeat } from '../timeline.js';
import { phraseDefs, focusPhrase } from '../phrases.js';
import { scoreTaps, tapSummary, applyWann } from '../tap.js';
import { stepHits } from '../accomp.js';
import { tempoText } from '../tempo.js';
import { createClock } from '../clock.js';
import { $, field, showScreen, frameLoop, makeDots, setDots, setToggle, modal } from '../ui.js';

const TAP_KEYS = new Set([' ', 'Enter', 'ArrowRight', 'ArrowDown', 'PageDown']);
/** Anschlag → Tippzeit: so viel früher lag der Ton (Fenster, Messung). */
const MIC_LAG = 0.04;
/** ANNAHME: Ohne Video läuft „Wann“ etwas ruhiger als das Original
 *  (85 % des Song-Tempos, 50–72 BPM; ohne bpm 60). */
export const wannBpm = (song) => Math.max(50, Math.min(72, Math.round((song.bpm || 70) * 0.85)));
const STAGE_TEXT = { 1: 'mit Countdown', 2: 'ohne Countdown', 3: 'ohne Anzeige' };

const leadSec = () => Math.max(0, Math.min(300, S.settings.leadMs ?? 80)) / 1000;

/** Echte Wechsel einer Phrase relativ zu ihrem Anfang. */
export function phraseChanges(song, def) {
  return song.events.filter((e) => e.at >= def.fromBeat - 1e-6 && e.at < def.toBeat - 1e-6)
    .map((e) => ({ at: e.at - def.fromBeat, chord: e.chord }));
}

/** Runde Wann. item: { seconds, phraseId? }. */
export async function runWann(api, item) {
  const song = currentSong();
  const scr = showScreen('wann');
  const f = (n) => field(scr, n);
  const res = api.result('wann', { passes: 0, hits: 0, total: 0, last: '' });
  const defs = phraseDefs(song);
  const def = defs.find((d) => d.id === item.phraseId) || focusPhrase(defs, phraseStates(song.id));
  const changes = def ? phraseChanges(song, def) : [];
  if (!def || !changes.length) {
    await modal('Wann', 'Diese Phrase hat keinen Akkordwechsel – erst in „Transkribieren“ die Wechsel eintippen.', [{ label: 'OK', value: 'ok', primary: true }]);
    return;
  }
  let state = getWann(song.id, def.id);
  const bpb = song.beatsPerBar;
  const len = def.beats;
  const band = createBand(f('band'));
  makeDots(f('dots'), bpb);
  f('result').textContent = '';
  f('vnote').textContent = '';
  const paintLevel = () => { f('level').textContent = `${def.name} · Stufe ${state.stage} (${STAGE_TEXT[state.stage]})`; };
  paintLevel();

  // Mikrofon: aus, solange nicht eingeschaltet (mit Video: Kopfhörer-Hinweis).
  const micBtn = f('mic');
  let useMic = !!S.settings.ytMic && mic.supported();
  setToggle(micBtn, useMic, !mic.supported());
  const ac = new AbortController();
  const syncMic = async () => {
    if (useMic && !mic.isOpen() && !(await mic.open())) { useMic = false; f('result').textContent = 'Kein Mikrofon erreichbar – dann tippen.'; }
    if (!useMic && mic.isOpen()) mic.close();
    setToggle(micBtn, useMic, !mic.supported());
  };
  micBtn.addEventListener('click', async () => {
    useMic = !useMic;
    S.settings.ytMic = useMic;
    saveSettings();
    if (useMic) f('result').textContent = 'Mit Kopfhörern, sonst hört das Mikrofon den Song mit.';
    await syncMic();
  }, { signal: ac.signal });
  await syncMic();

  // Tippen: Bildschirm, Leertaste, Pedal. tapNow() liefert { k, r }: Durchgang
  // und gehörte Stelle in Schlägen ab Phrasenanfang (Quelle setzt sie unten).
  let tapNow = () => null, onsetToBeat = () => null;
  const taps = [];
  const tap = () => { const b = tapNow(); if (b != null) { taps.push(b); f('pad').classList.remove('tapped'); void f('pad').offsetWidth; f('pad').classList.add('tapped'); } };
  f('pad').addEventListener('pointerdown', (e) => { e.preventDefault(); tap(); }, { signal: ac.signal });
  document.addEventListener('keydown', (e) => {
    if (TAP_KEYS.has(e.key) && $('#pause').hidden && $('#modal').hidden) { e.preventDefault(); tap(); }
  }, { signal: ac.signal });

  /** Durchgang k werten. */
  const scorePass = async (k) => {
    const mine = taps.filter((t) => t.k === k).map((t) => t.r);
    const sc = scoreTaps(changes, mine);
    const out = applyWann(state, sc, today());
    state = out.state;
    await putWann(song.id, state);
    res.passes++; res.hits += sc.hits; res.total += sc.total;
    res.last = def.name;
    f('result').textContent = tapSummary(sc, prettyChord) + (out.up ? ` Stufe ${state.stage}: ${STAGE_TEXT[state.stage]}.` : out.down ? ` Zurück auf Stufe ${state.stage}.` : '');
    paintLevel();
    api.countUp();
  };
  const show = (beat) => {
    band.update(song, beat, { showNow: state.stage < 3, showNext: state.stage === 1, showBars: state.stage < 3 });
    f('band').hidden = state.stage >= 3;
    const inBar = ((beat % bpb) + bpb) % bpb;
    setDots(f('dots'), beat < -bpb ? -1 : Math.floor(inBar));
  };

  const src = youtubeSource(song);
  let micSeen = mic.onsetTime?.() ?? -Infinity;
  const pollMic = () => {
    if (!useMic || !mic.isOpen()) return;
    mic.sample(audio.now());
    const t = mic.onsetTime();
    if (t > micSeen) { micSeen = t; const b = onsetToBeat(t - MIC_LAG); if (b != null) taps.push(b); }
  };

  try {
    let videoOk = false;
    if (src?.videoId && src.offsetSec != null && song.bpm && !item.noVideo) {
      videoOk = await videoLoop();
    }
    if (!videoOk) await ownLoop();
  } finally {
    ac.abort();
    mic.close();
  }

  /* ---------- mit YouTube: Loop über die Phrase ------------------------ */
  async function videoLoop() {
    f('video').hidden = false;
    f('yt').hidden = false;
    let player;
    try {
      player = await api.wait(yt.create(f('yt'), src.videoId, { onError: (code) => { f('vnote').textContent = yt.errorText(code); } }));
    } catch (e) {
      if (api.ended) throw e;
      f('vnote').textContent = e?.message === 'offline' ? 'Kein Netz – ohne Video mit eigener Begleitung.' : yt.errorText(e?.message);
      return false;
    }
    const lead = leadSec();
    const startSec = () => beatToSec(song, def.fromBeat - bpb) - lead;
    f('meta').textContent = tempoText(song.bpm, song.bpm);
    const unPause = api.onPause((p) => (p ? player.pause() : player.play()));
    let k = 0;
    tapNow = () => ({ k, r: secToBeat(song, player.now() - lead) - def.fromBeat });
    onsetToBeat = (t) => ({ k, r: secToBeat(song, player.now() - (audio.now() - t) * player.rate()) - def.fromBeat });
    player.seek(startSec());
    player.play();
    try {
      await api.wait(new Promise((resolve) => {
        let busy = false, waited = performance.now();
        const stop = frameLoop(() => {
          pollMic();
          const playing = player.playing();
          if (playing) waited = performance.now();
          else if (performance.now() - waited > 2500 && !f('vnote').textContent) f('vnote').textContent = 'Startet nicht? Einmal direkt aufs Video tippen.';
          const heard = secToBeat(song, player.now());
          show(secToBeat(song, player.now() + lead));
          f('count').textContent = heard < def.fromBeat ? 'gleich geht es los' : `Durchgang ${k + 1}`;
          if (playing && !busy && heard >= def.toBeat + 0.5) {
            busy = true;
            const done = k;
            k++; // Tipps ab jetzt gehören zum nächsten Durchgang
            player.seek(startSec());
            scorePass(done).then(() => {
              if (api.timeLeft() <= 0) { stop(); resolve(); return; }
              busy = false;
            });
          }
        });
        ac.signal.addEventListener('abort', stop);
      }));
    } finally {
      unPause();
      player.destroy();
    }
    return true;
  }

  /* ---------- ohne Video: Klick und leise Begleitung ------------------- */
  async function ownLoop() {
    f('video').hidden = !f('vnote').textContent;
    f('yt').hidden = true;
    const bpm = wannBpm(song);
    f('meta').textContent = tempoText(bpm, song.bpm);
    const ctx = audio.getCtx();
    const countIn = 1;
    const grip = (sym) => voicingFor(song, sym);
    const songBeat = (b) => def.fromBeat + (((b % len) + len) % len);
    const clock = createClock(ctx, {
      bpm, beatsPerBar: bpb,
      onStep: (s) => {
        const b = s.index / 2 - countIn * bpb;
        const beatStart = s.index % 2 === 0;
        if (beatStart) audio.click(s.time, ((s.index / 2) % bpb) === 0, b < 0 ? 0.7 : 0.4);
        if (b < 0) return;
        const sb = songBeat(b);
        audio.playHits(stepHits(song, sb, { from: Math.abs(b % len) < 1e-6 ? sb : -1 }), s.time, clock.stepDur * 2, grip, { gain: 0.3 });
      },
    });
    clock.start(ctx.currentTime + 0.25);
    // Tipp → Schlag seit Beginn des ersten Durchgangs (gehörte Zeit).
    const beatAt = (t) => (t - clock.t0) / (clock.stepDur * 2) - countIn * bpb;
    // Durchgang: ½ Schlag vor seinem Anfang zählt schon dazu.
    const tagged = (g) => { const k = Math.floor((g + 0.5) / len); return { k, r: g - k * len }; };
    tapNow = () => tagged(beatAt(audio.audibleNow()));
    onsetToBeat = (t) => tagged(beatAt(t - (audio.now() - audio.audibleNow())));
    let k = 0;
    try {
      await api.wait(new Promise((resolve) => {
        let busy = false;
        const stop = frameLoop(() => {
          pollMic();
          const b = beatAt(audio.audibleNow());
          show(b < 0 ? def.fromBeat + b : songBeat(b));
          f('count').textContent = b < 0 ? 'Einzählen' : `Durchgang ${Math.floor(b / len) + 1}`;
          if (!busy && b >= (k + 1) * len + 0.5) {
            busy = true;
            scorePass(k).then(() => {
              k++;
              busy = false;
              if (api.timeLeft() <= 0) { stop(); resolve(); }
            });
          }
        });
        ac.signal.addEventListener('abort', stop);
      }));
    } finally {
      clock.stop();
    }
  }
}
