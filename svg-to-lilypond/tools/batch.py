"""Run recognition + verification over a set of files and summarize.

usage: python3 tools/batch.py [--group E] [--limit N] [--variant piano|guitar] [--show-fail K]
Writes build/batch_<group>_<variant>.json with per-file results.
"""
import argparse
import collections
import glob
import json
import os
import re
import sys
import traceback

sys.path.insert(0, os.path.dirname(__file__))
from recognize import recognize, RecognitionError  # noqa: E402
import verify  # noqa: E402

HERE = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
ASSETS = os.path.join(HERE, '..', 'app/src/main/assets')

ap = argparse.ArgumentParser()
ap.add_argument('--group', default='E')
ap.add_argument('--variant', default='piano')
ap.add_argument('--limit', type=int, default=0)
ap.add_argument('--show-fail', type=int, default=8)
ap.add_argument('--files', nargs='*')
a = ap.parse_args()

if a.files:
    paths = a.files
else:
    paths = sorted(glob.glob(os.path.join(ASSETS, a.variant + 'Svg', a.group + '[0-9]*.svg')),
                   key=lambda p: int(re.search(r'(\d+)\.svg', p).group(1)))
if a.limit:
    paths = paths[:a.limit]

res = {}
tally = collections.Counter()
fails = collections.defaultdict(list)
for p in paths:
    hid = os.path.basename(p)[:-4]
    r = {}
    try:
        ir = recognize(p)
    except RecognitionError as e:
        r['error'] = str(e)
        tally['recognition_error'] += 1
        fails['recognition_error'].append((hid, str(e)[:100]))
        res[hid] = r
        continue
    except Exception as e:  # noqa: BLE001
        r['error'] = 'CRASH ' + repr(e)
        tally['crash'] += 1
        fails['crash'].append((hid, traceback.format_exc().strip().splitlines()[-1][:100]))
        res[hid] = r
        continue
    v1 = verify.v1_measures(ir)
    v3 = verify.v3_tune(ir, hid)
    r.update({'v1': v1, 'v3': None if v3 is None else {'ok': v3[0] != 'fail', 'status': v3[0], 'tune': v3[1], 'got': v3[2]},
              'warnings': ir['warnings']})
    tally['ok_v1' if not v1 else 'fail_v1'] += 1
    if v3 is None:
        tally['v3_none'] += 1
    else:
        tally['v3_' + v3[0]] += 1
    if v1:
        fails['v1'].append((hid, v1[0]))
    if v3 is not None and v3[0] == 'fail':
        fails['v3'].append((hid, 'tune %s got %s' % (v3[1][:20], v3[2][:20])))
    if ir['warnings']:
        tally['with_warnings'] += 1
        fails['warn'].append((hid, ir['warnings'][0]))
    if not v1 and (v3 is None or v3[0] != 'fail') and not ir['warnings']:
        tally['ACCEPT'] += 1
    res[hid] = r

os.makedirs(os.path.join(HERE, 'build'), exist_ok=True)
json.dump(res, open(os.path.join(HERE, 'build/batch_%s_%s.json' % (a.group, a.variant)), 'w'), indent=1)
print('files:', len(paths), dict(tally))
for k, v in fails.items():
    print('\n[%s] %d' % (k, len(v)))
    for hid, msg in v[:a.show_fail]:
        print('   ', hid, msg)
