import sys, wave
from lib import *
mode = sys.argv[1]
if mode == 'fast':   # Warten: Am D F im Kreis, je 0,8 s
    lead, seq, dur = 1.0, ['Am','D','F'] * 10, 0.8
else:                # Tempo 56 BPM: Einzähler (1 Takt) still, dann Am D F F Am D F F
    bar = 4*60/56; lead, seq, dur = float(sys.argv[2]) + bar, ['Am','D','F','F']*2 + [None]*3, bar
x = np.zeros(int(SR * (lead + dur*len(seq) + 1)))
t = int(lead*SR)
for name in seq:
    if name:
        rh, lh = SONG[name]; c = chord_sig(rh, lh, dur + 0.1, 5)
        env = np.ones(len(c)); k = int((dur-0.03)*SR); env[k:] = np.exp(-np.arange(len(c)-k)/SR/0.05)
        x[t:t+len(c)] += c*env
    t += int(dur*SR)
x = np.convolve(x, room_ir(5))[:len(x)]; x /= np.abs(x).max()*1.3
x += 10**(-45/20)*rng.standard_normal(len(x))
w = wave.open(f'p_{mode}.wav','wb'); w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes((np.clip(x,-1,1)*32767).astype(np.int16).tobytes()); w.close()
