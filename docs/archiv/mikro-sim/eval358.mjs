// Form 3158 (Übung Voicings): node eval358.mjs C G F D Bb (nach python3 gen358.py <Tonart> 3)
import fs from 'node:fs';
const H = await import('../../../hear.js');
const N = 8192, WIN = 1.0;
const W = Float64Array.from({ length: N }, (_, i) => 0.42 - 0.5 * Math.cos(2 * Math.PI * i / N) + 0.08 * Math.cos(4 * Math.PI * i / N));
function fftDb(seg) { const re = new Float64Array(N), im = new Float64Array(N); for (let i = 0; i < N; i++) re[i] = (seg[i] || 0) * W[i];
  for (let i = 1, j = 0; i < N; i++) { let bit = N >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { const t = re[i]; re[i] = re[j]; re[j] = t; } }
  for (let len = 2; len <= N; len <<= 1) { const ang = -2 * Math.PI / len; for (let i = 0; i < N; i += len) for (let k = 0; k < len / 2; k++) { const c = Math.cos(ang * k), s = Math.sin(ang * k); const a = i + k + len / 2; const xr = re[a] * c - im[a] * s, xi = re[a] * s + im[a] * c; re[a] = re[i + k] - xr; im[a] = im[i + k] - xi; re[i + k] += xr; im[i + k] += xi; } }
  return Float32Array.from({ length: N / 2 }, (_, k) => 20 * Math.log10(Math.hypot(re[k], im[k]) / N + 1e-12)); }
const pcsOf = (v) => [...new Set(v.map((m) => m % 12))];
const oct = (v) => [...v.map((m) => m - 12), ...v, ...v.map((m) => m + 12)];
const VARIANTS = {
  exakt: (now, mem, s) => H.checkChord(now, mem, { rh: s.tv, lh: [] }, { prev: { rh: s.pv, lh: [] }, lowBass: 60, lowPresence: 30 }),
  checkTones: (now, mem, s) => H.checkTones(now, mem, { rh: s.tv, lh: [], pcs: pcsOf(s.tv) }, { prev: { rh: s.pv, lh: [], pcs: pcsOf(s.pv) } }),
};
const stats = {}, fails = {};
for (const key of process.argv.slice(2)) {
  const meta = JSON.parse(fs.readFileSync(`v_${key}.json`)); const b = fs.readFileSync(`v_${key}.f32`);
  const all = new Float32Array(b.buffer, b.byteOffset, b.length / 4); const SR = meta.sr, LEN = meta.len;
  meta.scenes.forEach((s, i) => {
    const x = all.subarray(i * LEN, (i + 1) * LEN);
    const lv = (t) => H.semitoneLevels(fftDb(x.subarray(Math.round((t - N / SR) * SR))), SR, N);
    const frames = []; let since = null, before = null;
    for (let t = meta.on - 0.4; t <= meta.on + WIN + 0.001; t += 0.05) {
      const now = lv(t);
      if (t < meta.on + 0.025) { before = now; continue; }
      since = H.followOnset(since, now, t - meta.on, before);
      if (t < meta.on + 0.1) continue;
      frames.push([now, since]);
    }
    const kind = s.kind + (s.extra === 'beide' ? ' (Vorakk. auch)' : '');
    for (const [vn, check] of Object.entries(VARIANTS)) {
      let prevOk = false, stable = false, lastF = null;
      for (const [now, mem] of frames) { const r = check(now, mem, s); if (r.ok && prevOk) { stable = true; break; } prevOk = r.ok; lastF = r; }
      const k = `${vn}|${kind}`; (stats[k] ||= [0, 0]); stats[k][0] += stable; stats[k][1]++;
      if (vn === 'checkTones' && (kind.startsWith('richtig') || kind.startsWith('tiefer') || kind.startsWith('höher')) && !stable) (fails[kind] ||= []).push(`${key}:${s.target} ${s.play} foreign=${lastF?.foreign} heard=${lastF?.heard}`);
    }
  });
}
const kinds = [...new Set(Object.keys(stats).map((k) => k.split('|')[1]))];
for (const k of kinds) console.log(k.padEnd(26), ...Object.keys(VARIANTS).map((vn) => { const [a, n] = stats[`${vn}|${k}`]; return `${(100 * a / n).toFixed(1)}%`.padStart(14); }), ` n=${stats[`exakt|${k}`][1]}`);
console.log(''.padEnd(26), ...Object.keys(VARIANTS).map((v) => v.padStart(14)));

