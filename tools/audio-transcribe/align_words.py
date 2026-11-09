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
# the known words (e.g. the hymn's stanza from the database), one line each with its start in the recording:
# they replace Whisper's lines, which only serve to find where the lines start
if cfg.get('lines'):
    lines = [{'text': ' ' + ln['text'], 'start': ln['start'], 'end': ln.get('end', nx['start'] if nx else ln['start'] + 4)}
             for ln, nx in zip(cfg['lines'], cfg['lines'][1:] + [None])]
fixes = {k.lower(): v for k, v in cfg.get('words', {}).items()}
# syllables pyphen gets wrong (it leaves many names whole: "Lebanon"), {"lebanon": "Leb-a-non"}
hyphens = {k.lower(): v.lower() for k, v in cfg.get('hyphens', {}).items()}
y, sr = librosa.load(d / 'stems/htdemucs/source/vocals.wav', sr=B.sample_rate, mono=True)
model = B.get_model(with_star=False).to('cuda').eval(); tok = B.get_tokenizer(); aligner = B.get_aligner()
out = []
for i, ln in enumerate(lines):
    text = ' ' + re.sub(r"[^A-Za-z' ]", ' ', ln['text']) + ' '
    for wrong, right in cfg.get('words', {}).items():
        text = re.sub(' ' + re.escape(wrong) + ' ', ' ' + right + ' ', text, flags=re.I)
    written = text.split()                 # the words as written here (case from the line or the fix)
    shown = [w.lower() for w in written]   # what the aligner gets
    # from just before the line, but not back into the line before (its last word would take this line's first)
    t0 = max(0, ln['start'] - 0.6, out[-1]['end'] if out else 0); t1 = lines[i + 1]['start'] if i + 1 < len(lines) else ln['end'] + 1.0
    t1 = max(t1, ln['end'] + 0.3)
    wav = torch.tensor(y[int(t0 * sr):int(t1 * sr)])[None].to('cuda')
    with torch.inference_mode():
        em, _ = model(wav)
    spans = aligner(em[0], tok(shown))
    fr = wav.shape[1] / em.shape[1] / sr
    for w, cw, sp in zip(shown, written, spans):
        parts = hyphens[w].split('-') if w in hyphens else hy.inserted(cw).split('-')
        if w in hyphens and cw[:1].isupper(): parts[0] = parts[0][:1].upper() + parts[0][1:]
        # pyphen cuts a possessive off as its own syllable ("li-on-s'"): it belongs to the last one
        while len(parts) > 1 and re.fullmatch(r"'?s?'?", parts[-1]):
            last = parts.pop(); parts[-1] += last
        pos = 0
        for k, part in enumerate(parts):
            ch = sp[pos] if pos < len(sp) else sp[-1]
            end_ch = sp[min(pos + len(part), len(sp)) - 1]
            out.append({'syl': part, 'start': round(t0 + ch.start * fr, 3), 'end': round(t0 + end_ch.end * fr, 3), 'cont': k < len(parts) - 1})
            pos += len(part)
json.dump(out, open(d / 'syllables.json', 'w'), indent=0)
print(len(out), 'syllables'); print(' '.join(f"{s['syl']}@{s['start']:.2f}" for s in out[:20]))
