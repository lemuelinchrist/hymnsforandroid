"""The sung words of many recordings, to match them to hymns by their lyrics (no sheet music).
usage: batch_lyrics.py <work dir>   (audio files in <work dir>/in/, any format ffmpeg reads; the file stem is the id)
-> <work dir>/lyrics/<id>.txt (plain words, one segment per line). Resumable: songs with a lyrics file are skipped.
Per song: ffmpeg to wav, Demucs vocals stem (two-stems), Whisper turbo on the GPU. Seconds per song."""
import sys, os, json, pathlib, subprocess, whisper, imageio_ffmpeg
bin_ = pathlib.Path(sys.executable).parent; ffe = imageio_ffmpeg.get_ffmpeg_exe()
ff = bin_ / 'ffmpeg'
if not ff.exists(): ff.symlink_to(ffe)
os.environ['PATH'] = f"{bin_}:{os.environ['PATH']}"
w = pathlib.Path(sys.argv[1]); (w / 'lyrics').mkdir(exist_ok=True); (w / 'wav').mkdir(exist_ok=True)
todo = [p for p in sorted((w / 'in').iterdir()) if not (w / 'lyrics' / (p.stem + '.txt')).exists()]
print(len(todo), 'songs to do', flush=True)
for p in todo:
    wav = w / 'wav' / (p.stem + '.wav')
    if not wav.exists():
        subprocess.run([ffe, '-y', '-loglevel', 'error', '-i', str(p), '-ar', '44100', '-ac', '2', str(wav)], check=True)
wavs = [str(w / 'wav' / (p.stem + '.wav')) for p in todo if not (w / 'stems' / 'htdemucs' / p.stem / 'vocals.wav').exists()]
for i in range(0, len(wavs), 20):
    subprocess.run([sys.executable, '-m', 'demucs', '-n', 'htdemucs', '--two-stems', 'vocals', '-d', 'cuda', '-o', str(w / 'stems'), *wavs[i:i + 20]],
                   check=True, env={'PATH': f"{bin_}:/usr/bin:/bin"})
model = whisper.load_model('turbo', device='cuda')
for p in todo:
    r = model.transcribe(str(w / 'stems' / 'htdemucs' / p.stem / 'vocals.wav'), language='en', condition_on_previous_text=False,
                         initial_prompt='A hymn sung by a choir.',
                         # Whisper's defaults dropped whole 30 s windows of sparse or rapped vocals (a song lost its first 25 s)
                         no_speech_threshold=0.9, logprob_threshold=-2.0, compression_ratio_threshold=3.0, temperature=0.0)
    (w / 'lyrics' / (p.stem + '.txt')).write_text('\n'.join(s['text'].strip() for s in r['segments']), encoding='utf8')
    print(p.stem, flush=True)
