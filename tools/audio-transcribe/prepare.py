"""Step 1: a song's audio, its stems and its beat.

usage: prepare.py <song dir> (--url <youtube url> | --audio <file>)
writes <song dir>/source.wav (44.1 kHz stereo), stems/htdemucs/source/{vocals,other,bass,drums}.wav (Demucs on the
GPU, ~10 s a song) and beats.npy (beat times in seconds, librosa on the full mix).
"""
import argparse, pathlib, shutil, subprocess, sys, numpy as np, imageio_ffmpeg, librosa
ap = argparse.ArgumentParser(); ap.add_argument('dir'); g = ap.add_mutually_exclusive_group(required=True)
g.add_argument('--url'); g.add_argument('--audio')
a = ap.parse_args(); d = pathlib.Path(a.dir); d.mkdir(parents=True, exist_ok=True)
bin_ = pathlib.Path(sys.executable).parent; ff = imageio_ffmpeg.get_ffmpeg_exe()
if a.url:
    subprocess.run([str(bin_ / 'yt-dlp'), '-f', 'bestaudio', '-o', str(d / 'download.%(ext)s'), '--ffmpeg-location', ff, a.url], check=True)
    src = next(d.glob('download.*'))
else:
    src = pathlib.Path(a.audio)
subprocess.run([ff, '-y', '-loglevel', 'error', '-i', str(src), '-ar', '44100', '-ac', '2', str(d / 'source.wav')], check=True)
env = {'PATH': f"{pathlib.Path(ff).parent}:{bin_}:/usr/bin:/bin"}
subprocess.run([sys.executable, '-m', 'demucs', '-n', 'htdemucs', '-d', 'cuda', '-o', str(d / 'stems'), str(d / 'source.wav')], check=True, env=env)
y, sr = librosa.load(d / 'source.wav', sr=22050)
tempo, beats = librosa.beat.beat_track(y=y, sr=sr, units='time')
np.save(d / 'beats.npy', beats)
print(f'{len(y) / sr:.0f} s, tempo {float(np.atleast_1d(tempo)[0]):.0f} BPM, {len(beats)} beats')
