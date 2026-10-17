// Prüft /home/user/pianino/hear.js gegen die simulierten Szenen.
// Spektrum wie AnalyserNode: Blackman-Fenster, |FFT|/N, 20·log10.
import fs from 'node:fs';
const { semitoneLevels, freshLevels, checkChord } = await import('/home/user/pianino/hear.js');
const { songChord } = await import('/home/user/pianino/chords.js');
const meta = JSON.parse(fs.readFileSync('scenes.json'));
const buf = fs.readFileSync('scenes.f32'); const all = new Float32Array(buf.buffer, buf.byteOffset, buf.length / 4);
const N = meta.n, SR = meta.sr;
function fftDb(x) {
  const re = new Float64Array(N), im = new Float64Array(N);
  for (let i = 0; i < N; i++) { const a = 0.16, w = (1 - a) / 2 - 0.5 * Math.cos(2 * Math.PI * i / N) + a / 2 * Math.cos(4 * Math.PI * i / N); re[i] = (x[i] || 0) * w; }
  for (let i = 1, j = 0; i < N; i++) { let bit = N >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; } }
  for (let len = 2; len <= N; len <<= 1) { const ang = -2 * Math.PI / len; for (let i = 0; i < N; i += len) for (let k = 0; k < len / 2; k++) { const c = Math.cos(ang * k), s = Math.sin(ang * k); const xr = re[i + k + len / 2] * c - im[i + k + len / 2] * s, xi = re[i + k + len / 2] * s + im[i + k + len / 2] * c; re[i + k + len / 2] = re[i + k] - xr; im[i + k + len / 2] = im[i + k] - xi; re[i + k] += xr; im[i + k] += xi; } }
  const out = new Float32Array(N / 2); for (let k = 0; k < N / 2; k++) out[k] = 20 * Math.log10(Math.hypot(re[k], im[k]) / N + 1e-12); return out;
}
const stats = {};
const add = (key, v) => { (stats[key] ||= [0, 0]); stats[key][0] += v ? 1 : 0; stats[key][1]++; };
const missed = [], passed = [];
meta.scenes.forEach((s, i) => {
  const pre = semitoneLevels(fftDb(all.subarray((2 * i) * N, (2 * i + 1) * N)), SR, N);
  const now = semitoneLevels(fftDb(all.subarray((2 * i + 1) * N, (2 * i + 2) * N)), SR, N);
  const r = checkChord(now, freshLevels(now, pre), songChord(s.expected), { prev: songChord(s.prev), ...JSON.parse(process.env.TUNE || "{}") });
  const cat = s.correct ? 'richtig' : s.label.includes('ohne') ? 'ohne Ton' : s.label.includes('->') ? 'anderer Akkord' : 'Ton daneben';
  add(`${s.bass ? 'mit Bass' : 'nur RH '} ${cat}`, r.ok);
  if (s.correct && !r.ok) missed.push(`${s.label}(${s.bass ? 'B' : ''}) miss ${r.missing} fremd ${r.foreign} laut ${r.loud}`);
  if (!s.correct && r.ok) passed.push(`${s.label}(${s.bass ? 'B' : ''})`);
});
for (const [k, [a, n]] of Object.entries(stats)) console.log(k.padEnd(28), `${(100 * a / n).toFixed(1)} % als richtig (${a}/${n})`);
console.log('verpasst:', missed.slice(0, 12).join(' | '));
console.log('durchgelassen:', passed.slice(0, 12).join(' | '));
