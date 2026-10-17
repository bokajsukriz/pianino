import fs from 'node:fs';
const { semitoneLevels, followOnset, checkChord, checkChordAny } = await import('../../../hear.js');
const CHECK = process.env.MODE === 'any' ? checkChordAny : checkChord; const DATA = process.env.DATA || 'tail';
const { songChord } = await import('../../../chords.js');
const meta = JSON.parse(fs.readFileSync(DATA + '.json')); const b = fs.readFileSync(DATA + '.f32'); const all = new Float32Array(b.buffer, b.byteOffset, b.length / 4);
const SR = meta.sr, N = 8192, LEN = meta.len;
const W = Float64Array.from({ length: N }, (_, i) => 0.42 - 0.5 * Math.cos(2 * Math.PI * i / N) + 0.08 * Math.cos(4 * Math.PI * i / N));
function fftDb(seg) { const re = new Float64Array(N), im = new Float64Array(N); for (let i = 0; i < N; i++) re[i] = (seg[i] || 0) * W[i];
  for (let i = 1, j = 0; i < N; i++) { let bit = N >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { const t = re[i]; re[i] = re[j]; re[j] = t; } }
  for (let len = 2; len <= N; len <<= 1) { const ang = -2 * Math.PI / len; for (let i = 0; i < N; i += len) for (let k = 0; k < len / 2; k++) { const c = Math.cos(ang * k), s = Math.sin(ang * k); const a = i + k + len / 2; const xr = re[a] * c - im[a] * s, xi = re[a] * s + im[a] * c; re[a] = re[i + k] - xr; im[a] = im[i + k] - xi; re[i + k] += xr; im[i + k] += xi; } }
  return Float32Array.from({ length: N / 2 }, (_, k) => 20 * Math.log10(Math.hypot(re[k], im[k]) / N + 1e-12)); }
const stats = {}, bad = [];
meta.scenes.forEach((s, i) => {
  const x = all.subarray(i * LEN, (i + 1) * LEN);
  const lv = (t) => semitoneLevels(fftDb(x.subarray(Math.round((t - N / SR) * SR))), SR, N);
  let first = null, oks = 0, prevOk = false, stable = null, since = null, before = null;
  const hist = [];
  for (let t = meta.on - 0.4; t <= meta.on + 3.4; t += 0.05) {
    const now = lv(t); hist.push(now);
    // Anschlag bei meta.on: letztes Fenster, das davor endet = before
    if (t < meta.on + 0.025) { before = now; continue; }
    since = followOnset(since, now, t - meta.on, before);
    if (t < meta.on + 0.1) continue;
    const ok = CHECK(now, since, songChord(s.expected), { prev: songChord(s.prev), ...JSON.parse(process.env.TUNE || "{}") }).ok;
    if (ok && first === null) first = t - meta.on;
    if (ok && prevOk && stable === null) stable = t - meta.on;
    prevOk = ok;
  }
  const key = `${process.env.BYSTYLE && s.style ? s.style.padEnd(8) : ''}${s.bass ? 'mit Bass' : 'nur RH '} ${s.correct ? 'richtig' : s.label.includes('->') ? 'anderer Akkord' : 'Ton daneben'}`;
  const WIN = +(process.env.WIN || 99); const v = s.correct ? stable !== null && stable <= 1.0 : stable !== null && stable <= WIN;
  (stats[key] ||= [0, 0]); stats[key][0] += v ? 1 : 0; stats[key][1]++;
  if (!s.correct && v) bad.push(`${s.label}${s.bass ? '(B)' : ''}@${stable.toFixed(2)}s`);
});
for (const [k, [a, n]] of Object.entries(stats)) console.log(k.padEnd(26), k.includes('richtig') ? 'binnen 1 s erkannt' : 'irgendwann durchgelassen', `${(100 * a / n).toFixed(1)} % (${a}/${n})`);
console.log(bad.join(' '));
