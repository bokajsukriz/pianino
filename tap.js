/* tap.js — REIN: Tippen auswerten (Editor „Transkribieren“, Übung „Wann“).
   Kein DOM, keine Zeit, kein Zufall: Tippzeiten kommen als Parameter. */

/** YouTube-Link oder nackte ID → 11-stellige ID oder null.
 *  watch?v=, youtu.be/, shorts/, embed/, live/, youtube-nocookie.com. */
export function parseYouTubeId(input) {
  const s = String(input ?? '').trim();
  if (/^[A-Za-z0-9_-]{11}$/.test(s)) return s;
  let url;
  try { url = new URL(/^[a-z]+:\/\//i.test(s) ? s : `https://${s}`); } catch { return null; }
  const host = url.hostname.replace(/^(www\.|m\.|music\.)/, '');
  const ok = (id) => (id && /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null);
  if (host === 'youtu.be') return ok(url.pathname.split('/')[1]);
  if (host !== 'youtube.com' && host !== 'youtube-nocookie.com') return null;
  const v = url.searchParams.get('v');
  if (v) return ok(v);
  const m = /^\/(?:shorts|embed|live|v)\/([^/?#]+)/.exec(url.pathname);
  return m ? ok(m[1]) : null;
}

export const TAP = Object.freeze({
  minTaps: 8,       // Tipp-Tempo: so viele Tipps mindestens
  outlier: 0.25,    // Abstand weicht mehr als 25 % vom Median ab → Ausreißer
  hit: 0.25,        // Wann: getroffen innerhalb ±¼ Schlag
  reach: 1,         // … ein Tipp zählt für ein Ereignis höchstens 1 Schlag daneben
});

function median(xs) {
  const s = [...xs].sort((a, b) => a - b);
  const n = s.length;
  return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
}

/** Tipp-Tempo aus Tippzeiten (s). Mittelwert der Abstände ohne Ausreißer.
 *  → { bpm (ganze Zahl) | null, taps, need } — need: noch so viele Tipps nötig. */
export function tapTempo(times, { minTaps = TAP.minTaps } = {}) {
  const t = (times || []).filter(Number.isFinite);
  if (t.length < minTaps) return { bpm: null, taps: t.length, need: minTaps - t.length };
  const gaps = t.slice(1).map((x, i) => x - t[i]).filter((g) => g > 0);
  const med = median(gaps);
  const kept = gaps.filter((g) => Math.abs(g - med) <= med * TAP.outlier);
  const mean = kept.reduce((a, b) => a + b, 0) / kept.length;
  const bpm = Math.round(60 / mean);
  return { bpm: bpm >= 30 && bpm <= 220 ? bpm : null, taps: t.length, need: 0 };
}

/** Tipps gegen Ereignisse werten (alles in Schlägen).
 *  Jeder Tipp gehört zum nächstgelegenen Ereignis (höchstens 1 Schlag
 *  daneben); je Ereignis zählt der nächste seiner Tipps.
 *  → { results: [{ at, chord, result: 'hit'|'early'|'late'|'missed', delta }],
 *      hits, total, extra } */
export function scoreTaps(events, taps, { hit = TAP.hit, reach = TAP.reach } = {}) {
  const best = events.map(() => null);
  let extra = 0;
  for (const tp of taps) {
    let k = -1, dk = Infinity;
    events.forEach((e, i) => { const d = Math.abs(tp - e.at); if (d < dk) { dk = d; k = i; } });
    if (k < 0 || dk > reach) { extra++; continue; }
    const d = tp - events[k].at;
    if (best[k] === null) best[k] = d;
    else { extra++; if (Math.abs(d) < Math.abs(best[k])) best[k] = d; }
  }
  const results = events.map((e, i) => {
    const d = best[i];
    const result = d === null ? 'missed' : Math.abs(d) <= hit + 1e-9 ? 'hit' : d < 0 ? 'early' : 'late';
    return { at: e.at, chord: e.chord, result, delta: d };
  });
  return { results, hits: results.filter((r) => r.result === 'hit').length, total: results.length, extra };
}

const TIMES = ['', 'einmal', 'zweimal', 'dreimal', 'viermal', 'fünfmal'];
const times = (n) => TIMES[n] || `${n}-mal`;

/** Eine Zeile zur Auswertung: „7 von 9 Wechseln getroffen. Wechsel zu D kam
 *  zweimal zu spät.“ pretty: Anzeige eines Symbols. */
export function tapSummary(score, pretty = (s) => s) {
  const head = `${score.hits} von ${score.total} ${score.total === 1 ? 'Wechsel' : 'Wechseln'} getroffen.`;
  const miss = new Map();
  for (const r of score.results) {
    if (r.result === 'hit') continue;
    const k = `${r.chord}|${r.result}`;
    miss.set(k, (miss.get(k) || 0) + 1);
  }
  if (!miss.size) return score.total ? `${head} Alle pünktlich.` : head;
  const [k, n] = [...miss.entries()].sort((a, b) => b[1] - a[1])[0];
  const [chord, result] = k.split('|');
  const what = { early: 'zu früh', late: 'zu spät', missed: 'gar nicht' }[result];
  return `${head} Wechsel zu ${pretty(chord)} kam ${times(n)} ${what}.`;
}

/* ---------- Stufen für „Wann“ ----------------------------------------- */

export const WANN = Object.freeze({
  upRun: 3,     // so oft hintereinander sauber → eine Stufe höher
  downRun: 2,   // so oft hintereinander schlecht → eine Stufe tiefer
  // ANNAHME: „sauber“ = jeder Wechsel getroffen, „schlecht“ = weniger als
  // 60 % getroffen. Dazwischen zählt der Durchgang weder auf- noch abwärts.
  badBelow: 0.6,
  maxStage: 3,
});

export const newWann = (id) => ({ id, stage: 1, up: 0, down: 0, passes: 0, lastPlayed: null });

/** Durchgang anwenden. → { state, clean, bad, up, down } */
export function applyWann(state, score, today) {
  const s = { ...newWann(state?.id), ...state, passes: (state?.passes || 0) + 1, lastPlayed: today };
  const clean = score.total > 0 && score.hits === score.total;
  const bad = score.total > 0 && score.hits / score.total < WANN.badBelow;
  const out = { clean, bad, up: false, down: false };
  if (clean) {
    s.down = 0;
    s.up += 1;
    if (s.up >= WANN.upRun && s.stage < WANN.maxStage) { s.stage += 1; s.up = 0; out.up = true; }
  } else if (bad) {
    s.up = 0;
    s.down += 1;
    if (s.down >= WANN.downRun && s.stage > 1) { s.stage -= 1; s.down = 0; out.down = true; }
  } else {
    s.up = 0;
    s.down = 0;
  }
  return { state: s, ...out };
}
