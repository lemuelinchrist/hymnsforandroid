"""Sung words with timings from the vocals stem (Whisper on the GPU).
usage: lyrics.py <song dir> [model]  -> <song dir>/lyrics.json (segments with words) and lyrics.txt"""
import sys, os, json, pathlib, whisper, imageio_ffmpeg
# whisper runs ffmpeg by name: the one imageio-ffmpeg brings, under that name
ff = pathlib.Path(sys.executable).parent / 'ffmpeg'
if not ff.exists(): ff.symlink_to(imageio_ffmpeg.get_ffmpeg_exe())
os.environ['PATH'] = f"{ff.parent}:{os.environ['PATH']}"
d = pathlib.Path(sys.argv[1]); model = whisper.load_model(sys.argv[2] if len(sys.argv) > 2 else 'turbo', device='cuda')
r = model.transcribe(str(d / 'stems/htdemucs/source/vocals.wav'), language='en', word_timestamps=True,
                     condition_on_previous_text=False, initial_prompt='A hymn sung by a choir.')
json.dump(r['segments'], open(d / 'lyrics.json', 'w'), indent=1)
with open(d / 'lyrics.txt', 'w') as f:
    for s in r['segments']: f.write(f"{s['start']:6.1f} {s['end']:6.1f}  {s['text'].strip()}\n")
print(open(d / 'lyrics.txt').read())
