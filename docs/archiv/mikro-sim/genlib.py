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
