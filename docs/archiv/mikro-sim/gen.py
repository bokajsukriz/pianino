# Szenen für den Node-Test von hear.js: je Szene 2 Fenster (vorher/jetzt).
import json, sys
from lib import *
N = 8192; frames = []; meta = []
def add(x, on, expected, prev, label, correct, with_bass):
    post = x[int((on+0.12)*SR):][:N]; pre = x[int((on+0.12-0.35)*SR):][:N]
    frames.extend([pre.astype(np.float32), post.astype(np.float32)])
    meta.append(dict(expected=expected, prev=prev, label=label, correct=correct, bass=with_bass))
T = int(sys.argv[1])
for with_bass in (False, True):
    for name,(rh,lh) in SONG.items():
        prevs = [p for p in SONG if p != name]
        for k in range(T):
            p = prevs[k%4]; x,on = scene(rh, lh if with_bass else None, p, **cond()); add(x,on,name,p,name,True,with_bass)
        for label,w,wl in variants(name):
            for k in range(max(1,T//4)):
                p = prevs[k%4]; x,on = scene(w, wl if with_bass else None, p, **cond()); add(x,on,name,p,label,False,with_bass)
np.concatenate(frames).tofile('scenes.f32'); json.dump(dict(sr=SR, n=N, scenes=meta), open('scenes.json','w'))
print(len(meta))
