"""Side-by-side PNG of an original sheet and our LilyPond re-render, for reviewing failures.

usage: python3 tools/compare_png.py E1 [NS948 ...] [--variant piano|guitar] [--width 1100]
Writes build/compare/<variant>_<id>.png (left = original from the app assets, right = our render).
Run tools/convert.py on the hymn first so build/svg/<variant>/<id>.svg exists.
"""
import argparse
import glob
import os
import subprocess

HERE = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
ASSETS = os.path.join(HERE, '..', 'app/src/main/assets')

ap = argparse.ArgumentParser()
ap.add_argument('ids', nargs='+')
ap.add_argument('--variant', default='piano')
ap.add_argument('--width', type=int, default=1100)
a = ap.parse_args()

out_dir = os.path.join(HERE, 'build', 'compare')
os.makedirs(out_dir, exist_ok=True)
for hid in a.ids:
    orig = os.path.join(ASSETS, a.variant + 'Svg', hid + '.svg')
    base = os.path.join(HERE, 'build', 'svg', a.variant, hid)
    new = base + '.svg' if os.path.exists(base + '.svg') else (sorted(glob.glob(base + '-*.svg')) or [None])[0]
    if not os.path.exists(orig) or not new:
        print(hid, ': missing original or render (run tools/convert.py first)')
        continue
    left = os.path.join(out_dir, '_l.png')
    right = os.path.join(out_dir, '_r.png')
    subprocess.run(['rsvg-convert', '-w', str(a.width), '-b', 'white', orig, '-o', left], check=True)
    subprocess.run(['rsvg-convert', '-w', str(a.width), '-b', 'white', new, '-o', right], check=True)
    target = os.path.join(out_dir, '%s_%s.png' % (a.variant, hid))
    subprocess.run(['convert', left, right, '+append', target], check=True)
    os.remove(left)
    os.remove(right)
    print(target)
