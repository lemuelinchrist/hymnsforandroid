"""Step 4: a first sheet.json for make_sheet.py, from the melody and the words.

usage: new_sheet_config.py <song dir> [--title "..."]
The key comes from the melody (music21's key finder), the sections from the pauses between sung lines (a gap of 4 s
or more starts a new section). Edit the result: section marks and limits, "repeat": 2 for a part sung twice (keep one
pass), "words" for words the recognizer got wrong, "range" for the singing range the octave choice keeps to.
"""
import argparse, json, pathlib, re, music21
ap = argparse.ArgumentParser(); ap.add_argument('dir'); ap.add_argument('--title', default='')
a = ap.parse_args(); d = pathlib.Path(a.dir)
k = music21.converter.parse(str(d / 'midi/melody_crepe.mid')).analyze('key')
tonic = k.tonic.pitchClass
scale = sorted({(tonic + i) % 12 for i in ((0, 2, 4, 5, 7, 9, 11) if k.mode == 'major' else (0, 2, 3, 5, 7, 8, 10, 11))})
name = k.tonic.name.lower().replace('-', 'es').replace('#', 'is')
name = {'ees': 'ees', 'aes': 'aes'}.get(name, name)
lines = [s for s in json.load(open(d / 'lyrics.json')) if re.search(r'[A-Za-z]', s['text'])]
sections, cur = [], [lines[0]['start'] - 0.7, lines[0]['end']]
for ln in lines[1:]:
    if ln['start'] - cur[1] >= 4: sections.append(cur); cur = [ln['start'] - 0.7, ln['end']]
    else: cur[1] = ln['end']
sections.append(cur)
cfg = {'title': a.title, 'midi': 'melody_crepe', 'key': name, 'mode': k.mode, 'beats_per_bar': 4, 'bar_offset': 'auto',
       'scale': scale, 'range': [58, 77], 'words': {},
       'sections': [{'mark': chr(65 + i), 't0': round(s, 1), 't1': round(e + 1.5, 1)} for i, (s, e) in enumerate(sections)]}
json.dump(cfg, open(d / 'sheet.json', 'w'), indent=1)
print(f'key {k} (confidence {k.correlationCoefficient:.2f}),', len(sections), 'sections'); print(open(d / 'sheet.json').read())
