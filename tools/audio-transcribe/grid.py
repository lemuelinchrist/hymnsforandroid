"""usage: grid.py <song dir> <seconds> [<seconds> ...] [--bars 12]
The raw sung pitch per eighth note, for each pass of the tune (a stanza, a repeat) side by side with the others.
<seconds> = where each pass has the same sung beat (e.g. the first syllable that falls on a beat, from syllables.json
or lyrics.txt); the nearest tracked beat (beats.npy) is the anchor and the grid runs from one half bar before it.
Per eighth: CREPE's pitch (pitch.npz; "B4/A" = B mostly, A for over 40 % as long) | the three strongest pitches of the
vocals stem (a CQT, A#3..G#5), which shows a second voice or the real octave: a sung B3 has F#5 (its 3rd harmonic)
with it, a sung B4 has not.
It does not use the words or their alignment, so it checks the sheet independently: passes must agree, and the sheet
(show.py) must say what the grid says, octaves included."""
import sys, numpy as np, librosa
from pathlib import Path
args = sys.argv[1:]; bars = 12
if '--bars' in args: i = args.index('--bars'); bars = int(args[i + 1]); del args[i:i + 2]
d = Path(args[0]); anchors = [float(a) for a in args[1:]]
P = np.load(d / 'pitch.npz'); t, f, c = P['t'], P['f0'], P['conf']; tun = float(P['tuning']) if 'tuning' in P.files else 0.0
b = np.load(d / 'beats.npy')
NAMES = 'C C# D D# E F F# G G# A A# B'.split()
nm = lambda m: NAMES[m % 12] + str(m // 12 - 1)
y, sr = librosa.load(d / 'stems/htdemucs/source/vocals.wav', sr=22050); HOP = 256
C = np.abs(librosa.cqt(y, sr=sr, hop_length=HOP, n_bins=36 * 4, bins_per_octave=36, fmin=librosa.note_to_hz('C3'), tuning=tun / 100))
S = np.array([C[max(0, 3 * i - 1):3 * i + 2].sum(0) for i in range(48)])   # a row per semitone from C3
ct = librosa.frames_to_time(np.arange(C.shape[1]), sr=sr, hop_length=HOP)

def crepe(a, e):
    m = (t >= a) & (t < e) & (c > 0.5) & (f > 0)
    if m.sum() < 4: return '.'
    v, n = np.unique(np.round(69 + 12 * np.log2(f[m] / 440) - tun / 100).astype(int), return_counts=True); k = np.argsort(-n)
    return nm(v[k[0]]) + ('/' + NAMES[v[k[1]] % 12] if len(k) > 1 and n[k[1]] > 0.4 * n[k[0]] else '')

def cqt(a, e):
    seg = S[10:33, (ct >= a) & (ct < e)].mean(1)
    return ','.join(nm(58 + i) for i in np.argsort(-seg)[:3])

for n, on in enumerate(anchors, 1):
    i0 = int(np.argmin(abs(b - on)))
    print(f'\npass {n}: beat {i0} at {b[i0]:.2f} s')
    for hb in range(-1, bars * 2):   # half bars of two beats (4/4)
        row, rowq = [], []
        for e in range(4):
            bi = i0 + hb * 2 + e // 2
            if bi < 0 or bi + 1 >= len(b): break
            a = b[bi] + (b[bi + 1] - b[bi]) * (e % 2) / 2; z = a + (b[bi + 1] - b[bi]) / 2
            row.append(f'{crepe(a, z):<7}'); rowq.append(f'{cqt(a, z):<12}')
        if row: print(f'{hb:3d} {b[i0 + hb * 2]:6.1f}  {" ".join(row)} | {" ".join(rowq)}')
