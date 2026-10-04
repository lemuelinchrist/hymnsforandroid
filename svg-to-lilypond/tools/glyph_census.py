"""Collect every distinct font-glyph outline used in the corpus.

Writes:
  data/glyph_census.json  {gid: {count, files, scales, example, d}}
  build/glyph_sheet_N.svg contact sheets (gid label under each glyph) for manual labelling
"""
import collections
import glob
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(__file__))
from svgscan import glyph_id  # noqa: E402

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))

census = {}
# corpus SVGs plus our own LilyPond 2.24 renders (build/svg), which use that version's glyph shapes
SOURCES = [(folder, os.path.join(ROOT, 'app/src/main/assets', folder)) for folder in ('pianoSvg', 'guitarSvg')] + \
          [('build/' + v, os.path.join(OUT, 'build/svg', v)) for v in ('piano', 'guitar') if os.path.isdir(os.path.join(OUT, 'build/svg', v))]
for folder, folder_path in SOURCES:
    for f in sorted(glob.glob(os.path.join(folder_path, '*.svg'))):
        s = open(f, encoding='utf8').read()
        if '<html' in s[:2000].lower():
            continue
        name = folder + '/' + os.path.basename(f)
        for m in re.finditer(r'<path([^>]*)d="([^"]*)"', s):
            sc = re.search(r'scale\(([-\d.]+)', m.group(1))
            if not sc:
                continue
            d = ' '.join(m.group(2).split())
            g = census.setdefault(glyph_id(d), {'count': 0, 'files': set(), 'scales': collections.Counter(),
                                                 'example': name, 'd': d})
            g['count'] += 1
            g['files'].add(name)
            g['scales'][sc.group(1)] += 1

os.makedirs(os.path.join(OUT, 'data'), exist_ok=True)
os.makedirs(os.path.join(OUT, 'build'), exist_ok=True)
ordered = sorted(census.items(), key=lambda kv: -kv[1]['count'])
json.dump({k: {'count': v['count'], 'files': len(v['files']), 'scales': dict(v['scales']),
               'example': v['example'], 'd': v['d']} for k, v in ordered},
          open(os.path.join(OUT, 'data/glyph_census.json'), 'w'), indent=1)

# contact sheets: 8 columns x 6 rows per sheet, each cell 20x26 units, glyph drawn at scale 0.008
per = 48
for n in range(0, len(ordered), per):
    cells = []
    for i, (gid, v) in enumerate(ordered[n:n + per]):
        cx, cy = (i % 8) * 20 + 10, (i // 8) * 26 + 14
        cells.append(f'<line x1="{cx-9}" y1="{cy}" x2="{cx+9}" y2="{cy}" stroke="#f99" stroke-width="0.1"/>'
                     f'<line x1="{cx}" y1="{cy-12}" x2="{cx}" y2="{cy+8}" stroke="#f99" stroke-width="0.1"/>'
                     f'<path transform="translate({cx},{cy}) scale(0.008,-0.008)" d="{v["d"]}"/>'
                     f'<text x="{cx}" y="{cy+10.5}" font-size="2.2" text-anchor="middle" font-family="monospace">'
                     f'{n+i}:{gid[:6]} ({v["count"]})</text>')
    svg = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 {6*26+2}" width="1600" height="{(6*26+2)*10}">'
           f'<rect width="100%" height="100%" fill="white"/>{"".join(cells)}</svg>')
    open(os.path.join(OUT, f'build/glyph_sheet_{n//per}.svg'), 'w').write(svg)
print(len(census), 'glyphs;', (len(ordered) + per - 1) // per, 'sheets')
