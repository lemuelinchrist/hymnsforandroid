"""Name every corpus glyph by matching it against LilyPond's Emmentaler font.

Corpus glyph outlines come from several LilyPond versions, so exact path matching against the
installed font (2.24.3) doesn't work for all of them. Instead both sets are rasterized (via rsvg-convert)
and matched by shape (IoU of bbox-normalized bitmaps) plus bbox size in font units.

Input : data/glyph_census.json   (from glyph_census.py)
Output: data/glyph_names.json    {gid: {name, score, runner_up, count, files}}
"""
import json
import os
import re
import subprocess
import tempfile

import numpy as np
from PIL import Image
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.boundsPen import BoundsPen
from fontTools.ttLib import TTFont

HERE = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
import glob as _glob
FONT = sorted(_glob.glob('/usr/share/lilypond/*/fonts/otf/emmentaler-20.otf'))[-1]     # whichever LilyPond is installed
CELL = 256         # px per cell (~10 font units per px)
N = 32             # normalized bitmap size

# Only glyphs that can occur on a modern lead sheet (excludes chant, shape-note, ancient notation).
PLAUSIBLE = re.compile(r'^(noteheads\.s[012]$|noteheads\.s2(cross|xcircle|diamond)$|'
                       r'accidentals\.(sharp|flat|natural|doublesharp|flatflat)$|'
                       r'accidentals\.(left|right)paren$|'
                       r'clefs\.[GFC](_change)?$|flags\.[ud][3-7]$|flags\.(u|d)grace$|'
                       r'rests\.([0-7]|M[123])o?$|dots\.dot$|'
                       r'scripts\.(ufermata|dfermata|segno|coda|varcoda|staccato|tenuto|sforzato|uaccentus|daccentus|trill|turn|prall|mordent|upbow|downbow|caesura.*|rcomma|lcomma)$|'
                       r'timesig\.C(44|22)$|brackettips\.(up|down)$|ties\.lyric\.(default|short)$|'
                       r'(fattened\.)?(zero|one|two|three|four|five|six|seven|eight|nine|plus|period|comma|hyphen)$|'
                       r'pedal\..*|f|p|m|r|s|z)$')

census = json.load(open(os.path.join(HERE, 'data/glyph_census.json')))


def font_glyphs():
    f = TTFont(FONT)
    gs = f.getGlyphSet()
    out = {}
    for name in f.getGlyphOrder():
        if name in ('.notdef', 'space') or name.startswith('uni'):
            pass
        p = SVGPathPen(gs)
        gs[name].draw(p)
        d = p.getCommands()
        if d and PLAUSIBLE.match(name):
            out[name] = d
    return out


def bbox_of(d):
    nums = [float(n) for n in re.findall(r'-?\d+\.?\d*', d)]
    return nums


def rasterize(items):
    """items: list of (key, d). Returns {key: (bitmap NxN bool, (w,h) in font units)}."""
    res = {}
    cols = 8
    with tempfile.TemporaryDirectory() as tmp:
        for start in range(0, len(items), 64):
            chunk = items[start:start + 64]
            rows = (len(chunk) + cols - 1) // cols
            parts = []
            for i, (k, d) in enumerate(chunk):
                # absolute-coord bounds via a throwaway render: use font units directly, assume within +-1500
                x, y = (i % cols) * CELL, (i // cols) * CELL
                parts.append(f'<svg x="{x}" y="{y}" width="{CELL}" height="{CELL}" viewBox="-800 -1800 2600 2600">'
                             f'<path transform="scale(1,-1)" d="{d}"/></svg>')
            svg = (f'<svg xmlns="http://www.w3.org/2000/svg" width="{cols*CELL}" height="{rows*CELL}">'
                   f'<rect width="100%" height="100%" fill="white"/>{"".join(parts)}</svg>')
            sp, pp = os.path.join(tmp, 's.svg'), os.path.join(tmp, 's.png')
            open(sp, 'w').write(svg)
            subprocess.run(['rsvg-convert', sp, '-o', pp], check=True)
            img = np.array(Image.open(pp).convert('L')) < 128
            for i, (k, d) in enumerate(chunk):
                x, y = (i % cols) * CELL, (i // cols) * CELL
                cell = img[y:y + CELL, x:x + CELL]
                ys, xs = np.nonzero(cell)
                if len(xs) == 0:
                    continue
                crop = cell[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
                bm = np.array(Image.fromarray(crop.astype(np.uint8) * 255).resize((N, N))) > 127
                w = (xs.max() - xs.min() + 1) * 2600 / CELL
                h = (ys.max() - ys.min() + 1) * 2600 / CELL
                cx = (xs.min() + xs.max()) / 2 * 2600 / CELL - 800   # bbox centre rel. to origin
                cy = -((ys.min() + ys.max()) / 2 * 2600 / CELL - 1800)
                res[k] = (bm, (w, h, cx, cy))
    return res


fg = font_glyphs()
fr = rasterize(list(fg.items()))
cr = rasterize([(k, v['d']) for k, v in census.items()])

out = {}
for gid, (bm, (w, h, cx, cy)) in cr.items():
    scored = []
    for name, (fbm, (fw, fh, fcx, fcy)) in fr.items():
        iou = (bm & fbm).sum() / max(1, (bm | fbm).sum())
        size = min(w, fw) / max(w, fw) * min(h, fh) / max(h, fh)
        off = 1.0 / (1.0 + (abs(cx - fcx) + abs(cy - fcy)) / 100.0)   # origin placement matters too
        scored.append((iou * size * off, name))
    scored.sort(reverse=True)
    c = census[gid]
    out[gid] = {'name': scored[0][1], 'score': round(float(scored[0][0]), 3),
                'runner_up': f'{scored[1][1]} ({scored[1][0]:.3f})',
                'count': c['count'], 'files': c['files'], 'scales': c['scales'], 'example': c['example']}

json.dump(dict(sorted(out.items(), key=lambda kv: -kv[1]['count'])),
          open(os.path.join(HERE, 'data/glyph_names.json'), 'w'), indent=1)
for gid, v in sorted(out.items(), key=lambda kv: -kv[1]['count']):
    print(f"{gid} {v['count']:7d} {v['files']:5d}  {v['score']:.3f}  {v['name']:28s} | {v['runner_up']}  {list(v['scales'])}")
