# Voicing 3-1-5-8 (Terz unten, Grundton, Quinte, Oktave) mit Fehlgriffen.
# Aufruf: python3 gen358.py <Tonart> <richtige je Übergang>  → v_<Tonart>.json/.f32 (≈ 65 MB, nicht einchecken)
import json, sys
import numpy as np
import lib
from lib import note, room_ir, phone, clicks, SR

KEY = sys.argv[1]; NC = int(sys.argv[2])
PC = {'C': 0, 'D': 2, 'Eb': 3, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'Bb': 10, 'B': 11}
NAME = {0: 'C', 1: 'Db', 2: 'D', 3: 'Eb', 4: 'E', 5: 'F', 6: 'Gb', 7: 'G', 8: 'Ab', 9: 'A', 10: 'Bb', 11: 'B'}
rng = np.random.default_rng(1000 + PC[KEY]); lib.rng = rng
# Stufen: (Halbtöne über Tonika, moll?)
DEG = {'I': (0, 0), 'ii': (2, 1), 'iii': (4, 1), 'IV': (5, 0), 'V': (7, 0), 'vi': (9, 1)}
PROGS = [['I', 'vi', 'IV', 'V', 'I'], ['I', 'V', 'vi', 'IV', 'I'], ['vi', 'IV', 'I', 'V', 'vi'], ['I', 'vi', 'ii', 'V', 'I']]
k0 = PC[KEY]
def sym(root, minor): return NAME[root % 12] + ('m' if minor else '')
def v3158(root, minor, near):  # Terz unten (47..59, am nächsten an near), dann 1-5-8
    t = (root + (3 if minor else 4)) % 12
    b = min((m for m in range(48, 60) if m % 12 == t), key=lambda m: (abs(m - near), m))
    r = b + 1
    while r % 12 != root % 12: r += 1
    return [b, r, r + 7, r + 12]
def chord_sig(notes, dur, cents, spread=0.08, vel_db=8):
    out = np.zeros(int(dur * SR))
    for m in notes:
        d = int(rng.uniform(0, spread) * SR); g = 10 ** (rng.uniform(-vel_db, 0) / 20)
        x = note(m, dur, cents)[:len(out) - d]; out[d:d + len(x)] += g * x
    return out
def conv(x, h):
    n = len(x) + len(h); N = 1 << (n - 1).bit_length()
    return np.fft.irfft(np.fft.rfft(x, N) * np.fft.rfft(h, N), N)[:len(x)]
ON, DUR = 1.0, 2.3
def scene(play, prev, pedal, drr, noise_db, cents, click):
    x = np.zeros(int(DUR * SR))
    p = chord_sig(prev, DUR, cents)
    if not pedal:
        env = np.ones(len(x)); t = np.arange(len(x)) / SR; m = t > ON - 0.05; env[m] = np.exp(-(t[m] - (ON - 0.05)) / 0.08); p *= env
    x += p; c = chord_sig(play, DUR - ON, cents); x[int(ON * SR):] += c
    x = conv(x, room_ir(drr)); x /= np.abs(x).max()
    if click: x += 0.25 * clicks(len(x))
    x += 10 ** (noise_db / 20) * rng.standard_normal(len(x))
    return phone(x).astype(np.float32)
def cond():
    return dict(pedal=bool(rng.random() < .5), drr=float(rng.uniform(-3, 8)), noise_db=float(rng.uniform(-50, -30)), cents=float(rng.uniform(-20, 20)), click=bool(rng.random() < .7))

sig, meta = [], []
def add(kind, play, tgt, prev, extra=''):
    c = cond(); sig.append(scene(sorted(play), prev['v'], **c))
    meta.append(dict(kind=kind, extra=extra, key=KEY, play=sorted(play), target=tgt['sym'], tv=tgt['v'], prevSym=prev['sym'], pv=prev['v'], **c))
for pi, prog in enumerate(PROGS):
    near = 52; seq = []
    for d in prog:
        o, mi = DEG[d]; v = v3158(k0 + o, mi, near); near = v[0]
        seq.append(dict(sym=sym(k0 + o, mi), root=(k0 + o) % 12, minor=mi, v=v))
    for i in range(1, 5):
        tg, pv = seq[i], seq[i - 1]; V = tg['v']; b, r, f, o8 = V
        for _ in range(NC): add('richtig', V, tg, pv)
        add('tiefer', [m - 12 for m in V], tg, pv)
        add('höher', [m + 12 for m in V], tg, pv)
        add('tiefer', [m - 12 for m in V], tg, {'sym': pv['sym'], 'v': [m - 12 for m in pv['v']]}, 'beide')
        # falsche Terz: Dur↔Moll
        add('Terz falsch', [b + (1 if tg['minor'] else -1), r, f, o8], tg, pv)
        # Nachbarakkorde (zwei gemeinsame Töne), selbes Voicing, Lage nah am Ziel
        nbs = [(tg['root'] + 3, 0), (tg['root'] - 4, 0)] if tg['minor'] else [(tg['root'] - 3, 1), (tg['root'] + 4, 1)]
        for nr, nm in nbs: add('Nachbarakkord', v3158(nr, nm, b), tg, pv, sym(nr, nm))
        # ein Ton daneben (±1/±2), ohne Ergebnisse, die nur Dur↔Moll sind oder die Tonklassen nicht ändern
        cand = []
        for j in range(4):
            for dd in (-2, -1, 1, 2):
                w = V[:j] + [V[j] + dd] + V[j + 1:]
                if len(set(w)) < 4: continue
                pcs = set(m % 12 for m in w)
                if pcs == set(m % 12 for m in V): continue
                if j == 0 and dd == (1 if tg['minor'] else -1): continue
                cand.append((w, f"{['Bass/Terz','Grundton','Quinte','Oktave'][j]}{dd:+d}"))
        for ci in rng.choice(len(cand), 4, replace=False): add('Ton daneben', cand[ci][0], tg, pv, cand[ci][1])
        # Grundstellung statt Terz unten: 1-3-5-8 mit gleicher Oberstimme
        add('Grundstellung', [o8 - 12, o8 - 8 if not tg['minor'] else o8 - 9, o8 - 5, o8], tg, pv)
        # ein Ton fehlt
        add('Terz fehlt', [r, f, o8], tg, pv); add('Grundton fehlt', [b, f, o8], tg, pv)
        add('Quinte fehlt', [b, r, o8], tg, pv); add('Oktave fehlt', [b, r, f], tg, pv)
        # fremder Zusatzton (Tonklasse nicht im Akkord), zwischen tiefstem und höchstem Ton
        chordpcs = set(m % 12 for m in V)
        opts = [m for m in range(b + 1, o8 + 3) if m % 12 not in chordpcs and m not in V]
        for m in rng.choice(opts, 2, replace=False): add('Zusatzton', V + [int(m)], tg, pv, f'+{NAME[int(m) % 12]}{int(m) // 12 - 1}')
np.concatenate(sig).tofile(f'v_{KEY}.f32')
json.dump(dict(sr=SR, len=len(sig[0]), on=ON, scenes=meta), open(f'v_{KEY}.json', 'w'))
print(KEY, len(meta))
