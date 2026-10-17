# Ganze Ausklänge (3 s nach dem Anschlag) für die Prüfung „irgendein Fenster“.
import json, sys
import lib
from lib import *
def scene_long(play_rh, play_lh, prev, pedal, drr, noise_db, cents, click):
    on = 1.0; dur = 4.5; x = np.zeros(int(dur*SR))
    p = chord_sig(*SONG[prev], dur, cents)
    if not pedal:
        env = np.ones(len(x)); t = np.arange(len(x))/SR; env[t > on-0.05] = np.exp(-(t[t > on-0.05]-(on-0.05))/0.08); p *= env
    x += p; c = chord_sig(play_rh, play_lh, dur-on, cents); x[int(on*SR):] += c
    x = np.convolve(x, room_ir(drr))[:len(x)]; x /= np.abs(x).max()
    if click: x += 0.25*clicks(len(x))
    x += 10**(noise_db/20)*rng.standard_normal(len(x))
    return phone(x).astype(np.float32)
T = int(sys.argv[1]); sig = []; meta = []
for bass in (False, True):
    for name,(rh,lh) in SONG.items():
        prevs = [p for p in SONG if p != name]
        for k in range(T):
            sig.append(scene_long(rh, lh if bass else None, prevs[k%4], **cond())); meta.append(dict(expected=name, prev=prevs[k%4], label=name, correct=True, bass=bass))
        for label,w,wl in variants(name):
            if 'ohne' in label: continue
            for k in range(max(1,T//4)):
                sig.append(scene_long(w, wl if bass else None, prevs[k%4], **cond())); meta.append(dict(expected=name, prev=prevs[k%4], label=label, correct=False, bass=bass))
np.concatenate(sig).tofile('tail.f32'); json.dump(dict(sr=SR, len=len(sig[0]), on=1.0, scenes=meta), open('tail.json','w')); print(len(meta))
