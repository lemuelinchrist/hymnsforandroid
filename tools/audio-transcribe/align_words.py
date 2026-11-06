"""Precise syllable times: forced alignment (torchaudio MMS_FA, GPU) of the known words to the vocals stem.

usage: align_words.py <song dir>    reads lyrics.json (Whisper lines) and sheet.json ("words" fixes)
writes <song dir>/syllables.json: [{"syl", "start", "end", "cont"}] (cont = the word goes on, a hyphen follows)
Each Whisper line is aligned in its own stretch of audio (from just before it to the next line), letters get times,
a syllable starts at its first letter.
"""
import json, re, sys, pathlib, torch, librosa, pyphen
from torchaudio.pipelines import MMS_FA as B
d = pathlib.Path(sys.argv[1]); cfg = json.load(open(d / 'sheet.json'))
hy = pyphen.Pyphen(lang='en_US')
lines = [s for s in json.load(open(d / 'lyrics.json')) if re.search(r'[A-Za-z]', s['text'])]
fixes = {k.lower(): v for k, v in cfg.get('words', {}).items()}
y, sr = librosa.load(d / 'stems/htdemucs/source/vocals.wav', sr=B.sample_rate, mono=True)
model = B.get_model(with_star=False).to('cuda').eval(); tok = B.get_tokenizer(); aligner = B.get_aligner()
out = []
for i, ln in enumerate(lines):
    text = ' ' + ln['text'].lower() + ' '
    for wrong, right in fixes.items(): text = text.replace(' ' + wrong + ' ', ' ' + right.lower() + ' ')
    shown = []   # the words as written (case from the fix or Whisper)
    for w in text.split():
        w = re.sub(r"[^a-z']", '', w)
        if w: shown.append(w)
    orig = re.findall(r"[A-Za-z']+", ' '.join([cfg.get('words', {}).get(k, k) for k in [ln['text']]]))
    t0 = max(0, ln['start'] - 0.6); t1 = lines[i + 1]['start'] if i + 1 < len(lines) else ln['end'] + 1.0
    t1 = max(t1, ln['end'] + 0.3)
    wav = torch.tensor(y[int(t0 * sr):int(t1 * sr)])[None].to('cuda')
    with torch.inference_mode():
        em, _ = model(wav)
    spans = aligner(em[0], tok(shown))
    fr = wav.shape[1] / em.shape[1] / sr
    # the case of each word as Whisper (or the fix) wrote it
    cased = {}
    for w in re.findall(r"[A-Za-z']+", ln['text'] + ' ' + ' '.join(cfg.get('words', {}).values())): cased.setdefault(w.lower(), w)
    for w, sp in zip(shown, spans):
        parts = hy.inserted(cased.get(w, w)).split('-'); pos = 0
        for k, part in enumerate(parts):
            ch = sp[pos] if pos < len(sp) else sp[-1]
            end_ch = sp[min(pos + len(part), len(sp)) - 1]
            out.append({'syl': part, 'start': round(t0 + ch.start * fr, 3), 'end': round(t0 + end_ch.end * fr, 3), 'cont': k < len(parts) - 1})
            pos += len(part)
json.dump(out, open(d / 'syllables.json', 'w'), indent=0)
print(len(out), 'syllables'); print(' '.join(f"{s['syl']}@{s['start']:.2f}" for s in out[:20]))
