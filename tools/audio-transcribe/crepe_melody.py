"""Melody from the vocals stem with CREPE (GPU): a pitch every 10 ms, then cut into notes.

usage: crepe_melody.py <song dir> [--conf 0.5] [--min-ms 100]
writes <song dir>/midi/melody_crepe.mid and <song dir>/pitch.npz (time, f0, confidence)
"""
import argparse, pathlib, numpy as np, torch, torchcrepe, librosa, pretty_midi
ap = argparse.ArgumentParser(); ap.add_argument('dir'); ap.add_argument('--conf', type=float, default=0.5); ap.add_argument('--min-ms', type=float, default=100)
a = ap.parse_args(); d = pathlib.Path(a.dir)
y, sr = librosa.load(d / 'stems/htdemucs/source/vocals.wav', sr=16000, mono=True)
hop = 160  # 10 ms
f0, conf = torchcrepe.predict(torch.tensor(y)[None], sr, hop, 65, 1000, 'full', batch_size=2048, device='cuda', return_periodicity=True)
conf = torchcrepe.filter.median(conf, 5); f0 = torchcrepe.filter.mean(f0, 5)
f0, conf = f0[0].cpu().numpy(), conf[0].cpu().numpy()
t = np.arange(len(f0)) * hop / sr
np.savez(d / 'pitch.npz', t=t, f0=f0, conf=conf)
# energy gate too: silence between phrases
rms = librosa.feature.rms(y=y, frame_length=1024, hop_length=hop)[0][:len(f0)]
voiced = (conf >= a.conf) & (rms >= 0.1 * np.percentile(rms, 95))
# notes: runs of voiced frames (a break in the voice, even 20 ms, is a new note: a consonant or a breath); inside a
# run the pitch is smoothed (vibrato, scoops) and cut where it settles on another semitone for 70 ms or more
from scipy.ndimage import median_filter
mf = librosa.hz_to_midi(np.maximum(f0, 1))
notes, i, n = [], 0, len(voiced)
while i < n:
    if not voiced[i]: i += 1; continue
    j = i
    while j < n and voiced[j]: j += 1          # run i..j
    seg = np.round(median_filter(mf[i:j], size=min(9, j - i) | 1, mode='nearest')).astype(int)
    parts = []                                  # [start, end, semitone] within the run
    for k, p in enumerate(seg):
        if parts and parts[-1][2] == p: parts[-1][1] = k + 1
        else: parts.append([k, k + 1, int(p)])
    changed = True
    while changed and len(parts) > 1:           # a part under 70 ms joins its neighbour (closest pitch)
        changed = False
        k = min(range(len(parts)), key=lambda x: parts[x][1] - parts[x][0])
        if parts[k][1] - parts[k][0] < 7:
            nb = [x for x in (k - 1, k + 1) if 0 <= x < len(parts)]
            m = min(nb, key=lambda x: abs(parts[x][2] - parts[k][2]))
            lo, hi = min(k, m), max(k, m)
            keep = parts[m][2]
            parts[lo:hi + 1] = [[parts[lo][0], parts[hi][1], keep]]
            # neighbours on the same pitch now touch: join them
            merged = []
            for q in parts:
                if merged and merged[-1][2] == q[2]: merged[-1][1] = q[1]
                else: merged.append(q)
            parts = merged; changed = True
    for s_, e_, p in parts:
        if (e_ - s_) * 10 >= a.min_ms:
            notes.append([t[i + s_], t[i + e_ - 1] + 0.01, p, float(conf[i + s_:i + e_].mean())])
    i = j
pm = pretty_midi.PrettyMIDI(); inst = pretty_midi.Instrument(0, name='Melody (CREPE)')
inst.notes = [pretty_midi.Note(velocity=int(40 + 80 * c), pitch=p, start=s, end=e) for s, e, p, c in notes]
(d / 'midi').mkdir(exist_ok=True)
pm.instruments.append(inst); pm.write(str(d / 'midi/melody_crepe.mid'))
print(len(notes), 'notes; voiced', round(voiced.mean() * 100), '% of frames')
