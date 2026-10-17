# Machbarkeit 2: Erkennung mit Onset-Differenz und Kandidaten-Vergleich.
import sys, wave, numpy as np
D = '../wav'; SR = 22050
rng = np.random.default_rng(7)
def load(m):
    w = wave.open(f'{D}/{m}.wav'); return np.frombuffer(w.readframes(w.getnframes()), np.int16) / 32768
S = {m: load(m) for m in range(24, 97, 3)}
def note(m, dur, cents):
    base = min(S, key=lambda k: abs(k - m)); r = 2 ** ((m - base + cents/100) / 12)
    src = S[base]; t = np.arange(int(dur * SR)) * r; t = t[t < len(src) - 1]
    return np.interp(t, np.arange(len(src)), src)
SONG = {'Am': ([69,72,76],45), 'D': ([69,74,78],50), 'F': ([69,72,77],41), 'Dm': ([69,74,77],50), 'C': ([67,72,76],48)}
def chord_sig(rh, lh, dur, cents, spread=0.08, vel_db=8):
    out = np.zeros(int(dur*SR))
    for m in rh + ([lh] if lh else []):
        d = int(rng.uniform(0, spread)*SR); g = 10**(rng.uniform(-vel_db, 0)/20)
        x = note(m, dur, cents)[:len(out)-d]; out[d:d+len(x)] += g*x
    return out
def room_ir(drr_db):
    n = int(0.6*SR); ir = rng.standard_normal(n)*np.exp(-6.9*np.arange(n)/n)
    ir *= 1/np.sqrt((ir**2).sum()); ir[0] += 10**(drr_db/20); return ir
def phone(x):
    X = np.fft.rfft(x); f = np.fft.rfftfreq(len(x), 1/SR); X *= 1/(1+(150/np.maximum(f,1))**4); return np.fft.irfft(X, len(x))
def clicks(n):
    c = np.zeros(n); L = int(0.01*SR); k = rng.standard_normal(L)*np.exp(-np.arange(L)/30)
    for t in range(int(rng.uniform(0,1)*SR), n-L, int(SR*60/55)): c[t:t+L] += k
    return c
MIDIS = np.arange(40, 101)
def semis(x):
    N = 8192; seg = x[:N]; X = np.abs(np.fft.rfft(seg*np.hanning(len(seg)), N))**2; f = np.fft.rfftfreq(N, 1/SR)
    v = []
    for m in MIDIS:
        fc = 440*2**((m-69)/12); b = (f > fc*2**(-.4/12)) & (f < fc*2**(.4/12)); v.append(X[b].max())
    return np.array(v)
def template(rh, lh, with_bass):  # generisches Obertonmodell, NICHT aus den Samples
    v = np.zeros(len(MIDIS))
    for m, w in [(n, 1.0) for n in rh] + ([(lh, 0.5)] if with_bass and lh else []):
        for k in range(1, 7):
            mm = m + 12*np.log2(k); i = int(round(mm)) - 55
            if 0 <= i < len(v) and abs(mm-round(mm)) < .3: v[i] += w*0.55**(k-1)
    return v
def sim_score(obs, t):
    a = np.sqrt(obs); b = t; return a@b/np.linalg.norm(a)/np.linalg.norm(b)
def variants(name):
    rh, lh = SONG[name]; out = []
    for i in range(3):
        for d in (-2, -1, 1, 2):
            w = sorted(rh[:i]+[rh[i]+d]+rh[i+1:])
            if w != rh and len(set(w)) == 3: out.append((f'{name}:Ton{i+1}{d:+d}', w, lh))
        out.append((f'{name}:ohne Ton{i+1}', rh[:i]+rh[i+1:], lh))
    for o,(orh,olh) in SONG.items():
        if o != name: out.append((f'{name}->{o}', orh, olh))
    return out
def detect(x, onset, expected, with_bass):
    pre = semis(x[int((onset-0.3)*SR):]); post = semis(x[int((onset+0.12)*SR):])
    obs = np.maximum(post - 0.8*pre, 0)  # nur Neues zählt (Nachklang abziehen)
    rh, lh = SONG[expected]
    se = sim_score(obs, template(rh, lh, with_bass))
    so = max(sim_score(obs, template(w, wl, with_bass)) for _, w, wl in variants(expected))
    return se - so
def scene(play_rh, play_lh, prev, pedal, drr, noise_db, cents, click):
    on = 1.5; dur = 3.0; x = np.zeros(int(dur*SR))
    p = chord_sig(*SONG[prev], dur, cents)
    if not pedal:  # Dämpfer: Vorakkord verklingt beim Umgreifen in ~80 ms
        env = np.ones(len(x)); t = np.arange(len(x))/SR; env[t > on-0.05] = np.exp(-(t[t > on-0.05]-(on-0.05))/0.08); p *= env
    x += p
    c = chord_sig(play_rh, play_lh, dur-on, cents); x[int(on*SR):] += c
    x = np.convolve(x, room_ir(drr))[:len(x)]; x /= np.abs(x).max()
    if click: x += 0.25*clicks(len(x))
    x += 10**(noise_db/20)*rng.standard_normal(len(x))
    return phone(x), on
def cond():
    return dict(pedal=rng.random()<.5, drr=rng.uniform(-3, 8), noise_db=rng.uniform(-50,-30), cents=rng.uniform(-20,20), click=rng.random()<.7)

CAND = np.arange(36, 90)  # mögliche Töne (Bass bis Melodie)
W = np.zeros((len(MIDIS), len(CAND)))
for j, n in enumerate(CAND):
    for k in range(1, 9):
        mm = n + 12*np.log2(k); i = int(round(mm)) - MIDIS[0]
        if 0 <= i < len(MIDIS) and abs(mm-round(mm)) < .35: W[i, j] += 0.7**(k-1)
    # Handy-Hochpass: Grundton tiefer Töne kaum hörbar
    f0 = 440*2**((n-69)/12); W[n-MIDIS[0], j] *= 1/(1+(150/f0)**4) if n >= MIDIS[0] else 1
def nnls(v, it=300):
    a = np.full(len(CAND), 1e-3); WtV = W.T@v; WtW = W.T@W
    for _ in range(it): a *= WtV/(WtW@a + 1e-12)
    return a
def norm(a): return a / (a[(CAND >= 55)].max() + 1e-12)
def notes_of(x, onset):
    pre = semis(x[int((onset-0.3)*SR):]); post = semis(x[int((onset+0.12)*SR):])
    v = np.sqrt(post); d = np.sqrt(np.maximum(post - 0.8*pre, 0))
    return norm(nnls(v/v.max())), norm(nnls(d/(d.max()+1e-12)))
