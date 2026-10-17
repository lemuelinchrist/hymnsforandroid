"""Page-fit check: does any ink touch or cross the page edge?

Rasterizes an SVG (rsvg-convert) and measures the blank margin on each side, in staff spaces (the viewBox unit).
LilyPond clips whatever leaves the page, so a line that overflows shows up as ink running right up to an edge
(or as a second page, which convert.py already counts). The same measure on the original is the reference:
the original's own margins are what a good sheet looks like.

    python3 tools/pagefit.py build/svg/E1242.svg [more.svg ...]
"""
import re
import subprocess
import sys
import tempfile

import numpy as np
from PIL import Image

PX_PER_UNIT = 6          # raster resolution: 1/6 staff space
MIN_MARGIN = 2.0         # staff spaces of blank paper required on every side


def view_box(svg_path):
    head = open(svg_path, encoding='utf8').read(2000)
    m = re.search(r'viewBox="([-\d. ]+)"', head)
    x, y, w, h = (float(v) for v in m.group(1).split())
    return w, h


def margins(svg_path):
    """Blank margin (staff spaces) left, top, right, bottom; None for an empty page."""
    w, h = view_box(svg_path)
    with tempfile.NamedTemporaryFile(suffix='.png') as f:
        subprocess.run(['rsvg-convert', '-w', str(int(w * PX_PER_UNIT)), '-h', str(int(h * PX_PER_UNIT)),
                        '-b', 'white', '-o', f.name, svg_path], check=True)
        a = np.asarray(Image.open(f.name).convert('L'))
    ink = a < 200
    rows, cols = np.where(ink.any(axis=1))[0], np.where(ink.any(axis=0))[0]
    if not len(rows):
        return None
    H, W = a.shape
    return {'left': cols[0] / PX_PER_UNIT, 'top': rows[0] / PX_PER_UNIT,
            'right': (W - 1 - cols[-1]) / PX_PER_UNIT, 'bottom': (H - 1 - rows[-1]) / PX_PER_UNIT}


def page_fit_problems(svg_path, orig_path=None, min_margin=MIN_MARGIN):
    """Empty list when the ink stays clear of every page edge. A side where the original is itself tighter than
    `min_margin` (a few originals run off the page) only has to be as roomy as the original."""
    m = margins(svg_path)
    if m is None:
        return ['page is blank']
    ref = margins(orig_path) if orig_path else None
    out = []
    for k, v in m.items():
        need = min_margin if not ref else min(min_margin, ref[k] - 0.5)
        if v < need:
            out.append('ink %.1f from %s edge (need %.1f)' % (v, k, need))
    return out


if __name__ == '__main__':
    for p in sys.argv[1:]:
        m = margins(p)
        print(p, {k: round(float(v), 1) for k, v in m.items()} if m else None, page_fit_problems(p) or 'fits')
