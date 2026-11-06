"""Mixes a melody MIDI (as a plain tone, right channel) with the vocals stem (left channel) to check it by ear.
usage: check_by_ear.py <song dir> <midi name>  -> <song dir>/check_<midi name>.wav"""
import sys, pathlib, numpy as np, librosa, soundfile as sf, pretty_midi
d, name = pathlib.Path(sys.argv[1]), sys.argv[2]; sr = 22050
v, _ = librosa.load(d / 'stems/htdemucs/source/vocals.wav', sr=sr, mono=True)
m = pretty_midi.PrettyMIDI(str(d / 'midi' / f'{name}.mid')).synthesize(fs=sr)
n = max(len(v), len(m)); v = np.pad(v, (0, n - len(v))); m = np.pad(m, (0, n - len(m)))
v /= np.abs(v).max() + 1e-9; m /= np.abs(m).max() + 1e-9
sf.write(d / f'check_{name}.wav', np.stack([0.8 * v, 0.5 * m], 1), sr)
