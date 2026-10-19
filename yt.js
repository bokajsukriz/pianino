/* yt.js — YouTube-IFrame-Player (Ausnahme von „keine externen Requests“:
   nur zum Abspielen des Videos). Eingebettet über www.youtube-nocookie.com.
   Der Player bleibt immer sichtbar (mindestens 200 × 200 CSS-Pixel, im
   Querformat 356 × 200, siehe style.css) und wird nie überdeckt.

   Zeit (Arbeitsanweisung Transkription 6.2): getCurrentTime() ist grob. now()
   nimmt die zuletzt gemeldete Zeit und rechnet mit performance.now() und der
   Abspielrate weiter; weicht ein neuer Messwert um mehr als 0,25 s ab, wird
   neu angesetzt. Solange der Player nicht „spielt“ (Pause, Puffern, Werbung),
   steht die Zeit.
   Nach seek() meldet YouTube noch eine Weile die alte Zeit. Bis der
   Messwert beim Sprungziel angekommen ist (höchstens SEEK_HOLD ms), gilt das
   Sprungziel — sonst sähe ein Loop „noch hinter B“ und spränge in jedem Bild
   erneut; jeder dieser Sprünge lässt den Player neu puffern, und er landet
   Sekunden zu spät.

   create(host, videoId, { onReady, onState, onError }) → Player:
     play(), pause(), seek(sec), setRate(r), rates(), rate(), now(),
     duration(), meta() → { title, author } | null, state() ('unstarted'|'ended'|'playing'|'paused'|'buffering'|'cued'),
     playing(), destroy() */

import { logError } from './log.js';

const API = 'https://www.youtube.com/iframe_api';
const HOST = 'https://www.youtube-nocookie.com';
const RESYNC = 0.25;
const SEEK_HOLD = 2500; // ms: so lange höchstens dem Sprungziel statt dem Messwert glauben
const SEEK_NEAR = 1;    // s: Messwert so nah am Ziel → angekommen
const LOAD_TIMEOUT = 12000;

let apiPromise = null;

/** Fehlertexte für Nutzer:innen. */
export const YT_ERRORS = Object.freeze({
  offline: 'Kein Netz – das Video lässt sich gerade nicht laden. Ohne Video geht es mit eigener Begleitung.',
  2: 'Die Video-ID stimmt nicht.',
  5: 'Das Video lässt sich in diesem Browser nicht abspielen.',
  100: 'Das Video gibt es nicht mehr (gelöscht oder privat).',
  101: 'Das Video darf nicht eingebettet werden. Ein anderes Video derselben Aufnahme probieren.',
  150: 'Das Video darf nicht eingebettet werden. Ein anderes Video derselben Aufnahme probieren.',
});
export const errorText = (code) => YT_ERRORS[code] || `YouTube meldet einen Fehler (${code}).`;

/** IFrame-API laden (einmal). → Promise<YT> */
export function loadApi() {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (apiPromise) return apiPromise;
  apiPromise = new Promise((resolve, reject) => {
    if (navigator.onLine === false) { reject(new Error('offline')); return; }
    const timer = setTimeout(() => reject(new Error('offline')), LOAD_TIMEOUT);
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      clearTimeout(timer);
      try { prev?.(); } catch { /* egal */ }
      resolve(window.YT);
    };
    const s = document.createElement('script');
    s.src = API;
    s.async = true;
    s.onerror = () => { clearTimeout(timer); reject(new Error('offline')); };
    document.head.append(s);
  }).catch((e) => { apiPromise = null; throw e; });
  return apiPromise;
}

const STATES = { '-1': 'unstarted', 0: 'ended', 1: 'playing', 2: 'paused', 3: 'buffering', 5: 'cued' };

/** Player in `host` anlegen. → Promise<Player> (abgelehnt mit Error('offline')
 *  oder Error(<YouTube-Fehlercode>)). */
export async function create(host, videoId, { onReady = null, onState = null, onError = null } = {}) {
  const YT = await loadApi();
  const slot = document.createElement('div');
  host.replaceChildren(slot);
  let player = null, ready = false, state = 'unstarted', rate = 1;
  let anchorT = 0, anchorP = 0; // zuletzt gesetzter Ankerpunkt: Video-Sekunde, performance.now()
  let seeking = null;           // { target, until } nach seek(), bis YouTube dort ist

  const reported = () => { try { return player.getCurrentTime() || 0; } catch { return 0; } };
  const reanchor = (t = reported()) => { anchorT = t; anchorP = performance.now(); };

  const api = {
    get raw() { return player; },
    ready: () => ready,
    state: () => state,
    playing: () => state === 'playing',
    play() { try { player?.playVideo(); } catch (e) { logError('yt:play', e); } },
    pause() { try { player?.pauseVideo(); } catch (e) { logError('yt:pause', e); } },
    seek(sec) {
      const t = Math.max(0, sec);
      try {
        player?.seekTo(t, true);
        reanchor(t);
        seeking = { target: t, until: performance.now() + SEEK_HOLD };
      } catch (e) { logError('yt:seek', e); }
    },
    /** Ein Sprung ist unterwegs (YouTube meldet noch nicht das Ziel). */
    seeking: () => !!seeking && performance.now() < seeking.until,
    setRate(r) {
      try { player?.setPlaybackRate(r); } catch (e) { logError('yt:rate', e); }
    },
    rate: () => rate,
    /** Verfügbare Raten, aufsteigend. */
    rates() {
      try { return (player?.getAvailablePlaybackRates() || [1]).slice().sort((a, b) => a - b); } catch { return [1]; }
    },
    duration() { try { return player?.getDuration() || 0; } catch { return 0; } },
    /** Titel und Kanal des Videos, soweit der Player sie schon kennt (kommt
     *  manchmal erst nach dem Laden); sonst null. Keine eigene Netzanfrage. */
    meta() {
      try {
        const v = player?.getVideoData?.();
        return v?.title ? { title: String(v.title), author: String(v.author || '') } : null;
      } catch { return null; }
    },
    /** Geglättete Zeit im Video (s). */
    now() {
      if (!ready) return 0;
      const rep = reported();
      if (seeking) {
        if (Math.abs(rep - seeking.target) <= SEEK_NEAR || performance.now() >= seeking.until) seeking = null;
        else if (state !== 'playing') { reanchor(seeking.target); return seeking.target; }
        else return anchorT + ((performance.now() - anchorP) / 1000) * rate;
      }
      if (state !== 'playing') { reanchor(rep); return rep; }
      const est = anchorT + ((performance.now() - anchorP) / 1000) * rate;
      if (Math.abs(rep - est) > RESYNC) { reanchor(rep); return rep; }
      return est;
    },
    destroy() {
      try { player?.destroy(); } catch { /* egal */ }
      player = null; ready = false;
      host.replaceChildren();
    },
  };

  await new Promise((resolve, reject) => {
    let settled = false;
    player = new YT.Player(slot, {
      host: HOST,
      videoId,
      width: '100%',
      height: '100%',
      playerVars: { playsinline: 1, rel: 0, modestbranding: 1, origin: location.origin },
      events: {
        onReady: () => {
          ready = true;
          try { rate = player.getPlaybackRate() || 1; } catch { rate = 1; }
          reanchor();
          settled = true;
          resolve();
          onReady?.(api);
        },
        onStateChange: (e) => {
          state = STATES[e.data] || 'unstarted';
          // Während eines Sprungs nicht auf die veraltete Zeit setzen.
          if (seeking) reanchor(seeking.target); else reanchor();
          onState?.(state, api);
        },
        onPlaybackRateChange: (e) => { rate = e.data || 1; reanchor(seeking ? anchorT + ((performance.now() - anchorP) / 1000) * rate : undefined); },
        onError: (e) => {
          logError('yt:error', e.data);
          if (!settled) { settled = true; reject(new Error(String(e.data))); }
          onError?.(e.data, api);
        },
      },
    });
  });
  return api;
}
