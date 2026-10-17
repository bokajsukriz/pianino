# Ausklänge in ANDEREN Lagen als der Song-Lage (für den lagenunabhängigen Erkenner).
import json, sys
from lib import *
from genlib import scene_long
PCS = {k: sorted(set(m % 12 for m in v[0])) for k, v in SONG.items()}
def close(name, low):  # enge Lage, tiefster Ton = erste Tonklasse ≥ low aus der Liste
    pcs = PCS[name]; b = low
    while b % 12 not in pcs: b += 1
    v = [b]
    for p in pcs:
        if p == b % 12: continue
        m = b + 1
        while m % 12 != p: m += 1
        v.append(m)
    return sorted(v)
STYLES = {'song-12': lambda n: [m - 12 for m in SONG[n][0]], 'tief55': lambda n: close(n, 55), 'mitte60': lambda n: close(n, 60), 'hoch64': lambda n: close(n, 64)}
T = int(sys.argv[1]); sig = []; meta = []
for bass in (False, True):
    for style, f in STYLES.items():
        for name, (rh, lh) in SONG.items():
            v = f(name); prevs = [p for p in SONG if p != name]
            for k in range(T):
                sig.append(scene_long(v, lh if bass else None, prevs[k % 4], **cond())); meta.append(dict(expected=name, prev=prevs[k % 4], label=f'{name}/{style}', correct=True, bass=bass, style=style))
            for i in range(3):
                for d in (-2, -1, 1, 2):
                    w = sorted(v[:i] + [v[i] + d] + v[i+1:])
                    if len(set(w)) < 3 or set(m % 12 for m in w) == set(PCS[name]): continue
                    sig.append(scene_long(w, lh if bass else None, prevs[i % 4], **cond())); meta.append(dict(expected=name, prev=prevs[i % 4], label=f'{name}/{style}:Ton{i+1}{d:+d}', correct=False, bass=bass, style=style))
            for o in SONG:
                if o == name: continue
                sig.append(scene_long(f(o), SONG[o][1] if bass else None, prevs[0], **cond())); meta.append(dict(expected=name, prev=prevs[0], label=f'{name}/{style}->{o}', correct=False, bass=bass, style=style))
np.concatenate(sig).tofile('voc.f32'); json.dump(dict(sr=SR, len=len(sig[0]), on=1.0, scenes=meta), open('voc.json', 'w')); print(len(meta))
