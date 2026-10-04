"""Regression check: convert a fixed list of sheets and compare each status with the expected one.

usage: python3 tools/regress.py [-j 8] [--list data/regression.txt]
List format (one per line, '#' comments): <variant>/<id> <expected status>
  e.g.  piano/NS948 ACCEPT      guitar/E1 ACCEPT      piano/E1242 ACCEPT_TAIL_UNVERIFIED
Exit code 1 if any file's status differs. Run after ANY change to recognize.py / emit_ly.py / verify.py.
"""
import argparse
import multiprocessing
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from convert import process, ASSETS  # noqa: E402

HERE = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))


def work(item):
    variant, hid, expected = item
    path = os.path.join(ASSETS, variant + 'Svg', hid + '.svg')
    r = process(path)
    why = r.get('detail') or (r.get('v1') or [None])[0] or (r.get('v2') or [None])[0] or ''
    return variant, hid, expected, r['status'], str(why)[:110]


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('-j', type=int, default=8)
    ap.add_argument('--list', default=os.path.join(HERE, 'data/regression.txt'))
    a = ap.parse_args()
    items = []
    for line in open(a.list, encoding='utf8'):
        line = line.split('#')[0].strip()
        if line:
            vid, expected = line.split()
            variant, hid = vid.split('/')
            items.append((variant, hid, expected))
    with multiprocessing.Pool(a.j) as pool:
        results = pool.map(work, items)
    bad = 0
    for variant, hid, expected, got, why in results:
        flag = 'ok ' if got == expected else 'BAD'
        bad += got != expected
        print('%s %s/%s expected %s got %s %s' % (flag, variant, hid, expected, got, '' if got == expected else why))
    print('%d/%d as expected' % (len(results) - bad, len(results)))
    sys.exit(1 if bad else 0)
