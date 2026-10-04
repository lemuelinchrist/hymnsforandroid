"""Per-file feature extraction over the whole corpus, to find the hard lead sheets.

Output: data/features.csv (one row per SVG) + summary on stdout.
"""
import collections
import csv
import glob
import json
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from svgscan import parse, staves  # noqa: E402

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
HERE = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
NAMES = {k: v['name'] for k, v in json.load(open(os.path.join(HERE, 'data/glyph_names.json'))).items()}
DIGITS = {'zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'}


def kind(name):
    n = name.replace('fattened.', '')
    return 'digit' if n in DIGITS else n


def features(path):
    sc = parse(path)
    st = staves(sc)
    f = collections.Counter()
    f['format'] = sc.fmt
    f['pages'] = sc.pages or ''
    f['staves'] = len(st)
    heads = []
    for gid, x, y, s in sc.glyphs:
        n = kind(NAMES.get(gid, 'UNKNOWN'))
        small = s < 0.0035
        if n.startswith('noteheads'):
            heads.append((x, y, n))
            f['heads'] += 1
            if n == 'noteheads.s2cross':
                f['cross_heads'] += 1
        elif n.startswith('accidentals'):
            f['chord_acc' if small else 'staff_acc'] += 1
            if n.endswith('natural'):
                f['naturals'] += 1
            if n.endswith('doublesharp'):
                f['doublesharps'] += 1
        elif n.startswith('flags'):
            f['flag_16th' if n[-1] in '4567' else 'flag_8th'] += 1
        elif n.startswith('rests'):
            f['rests'] += 1
        elif n == 'dots.dot':
            f['dots'] += 1
        elif n.startswith('timesig') or (n == 'digit' and not small):
            f['timesig_glyphs'] += 1
        elif n == 'digit' and small:
            f['small_digits'] += 1     # volta / tuplet numbers
        elif n.startswith('clefs'):
            f['clefs'] += 1
        elif n.startswith('scripts.'):
            f[n.split('.')[1]] += 1
        elif n == 'UNKNOWN':
            f['unknown_glyphs'] += 1
    # chords in the melody / two voices: >1 notehead at (nearly) the same x on the same staff
    byx = collections.defaultdict(set)
    for x, y, n in heads:
        byx[(round(x * 2) / 2, int(y // 8))].add(round(y, 1))
    f['stacked_heads'] = sum(1 for v in byx.values() if len(v) > 1)
    f['beams'] = len(sc.polys)
    f['curves'] = len(sc.curves)          # slurs, ties, volta brackets...
    # thick bar lines (repeats / final) : rect wider than 0.4 and taller than 3.5
    f['thick_bars'] = sum(1 for x, y, w, h in sc.rects if w > 0.4 and h > 3.5)
    # lyric lines per system: distinct y offsets below each staff of lyric-sized serif text
    lyr = collections.defaultdict(set)
    italic = []
    for t, x, y, fam, size, weight, style in sc.texts:
        if 'italic' in style:
            italic.append(t)
        if 2.4 < size < 2.55 and st:
            top = max((s for s in st if s[0] < y), key=lambda s: s[0], default=None)
            if top is not None and y - top[0] < 14:
                lyr[top[0]].add(round(y - top[0], 1))
    f['max_lyric_lines'] = max((len(v) for v in lyr.values()), default=0)
    f['italic_texts'] = len(italic)
    f['italic_sample'] = ' | '.join(italic[:4])[:120]
    f['chord_texts'] = sum(1 for t in sc.texts if t[3] in ('sans-serif',) and t[4] < 2.1)
    return f


COLS = ['file', 'format', 'pages', 'staves', 'heads', 'stacked_heads', 'staff_acc', 'chord_acc', 'naturals',
        'doublesharps', 'flag_8th', 'flag_16th', 'beams', 'rests', 'dots', 'timesig_glyphs', 'small_digits',
        'clefs', 'thick_bars', 'curves', 'ufermata', 'segno', 'coda', 'cross_heads', 'max_lyric_lines',
        'italic_texts', 'chord_texts', 'unknown_glyphs', 'error', 'italic_sample']

if __name__ == '__main__':
    rows = []
    for folder in ('pianoSvg', 'guitarSvg'):
        for p in sorted(glob.glob(os.path.join(ROOT, 'app/src/main/assets', folder, '*.svg'))):
            name = folder + '/' + os.path.basename(p)
            try:
                f = features(p)
            except Exception as e:  # noqa: BLE001
                f = collections.Counter(error=str(e)[:60])
            f['file'] = name
            rows.append(f)
    with open(os.path.join(HERE, 'data/features.csv'), 'w', newline='') as fh:
        w = csv.DictWriter(fh, COLS, extrasaction='ignore')
        w.writeheader()
        for r in rows:
            w.writerow({c: r.get(c, 0) for c in COLS})
    print(len(rows), 'files')
