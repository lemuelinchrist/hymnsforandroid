"""List the hymns whose database tune code disagrees with the melody on the sheet (task 4, report only).

usage: python3 tools/tune_mismatch_report.py   -> build/db_tune_mismatches.txt
Takes every ACCEPT_DB_MISMATCH sheet whose reason includes 'tune code' (piano reports; the guitar sheet has the same
melody), recomputes the scale-degree reading from build/ir/piano/<id>.json and writes: id, DB tune code, our reading of
the same length, first position where they differ, the MIDI top-voice check (V4), and the piano/guitar agreement.
Nothing in the database is changed: the tune code names the MIDI file (res/raw/m<tune>.mid).
"""
import json
import os
import sys

HERE = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
sys.path.insert(0, os.path.dirname(__file__))
import verify  # noqa: E402

rows = []
for variant in ('piano', 'guitar'):
    for g in ('E', 'NS', 'CS', 'BF', 'C', 'CH'):
        for x in json.load(open(os.path.join(HERE, 'build/report_%s_%s.json' % (g, variant)))):
            if x['status'] == 'ACCEPT_DB_MISMATCH' and 'tune code' in (x.get('unverified') or []):
                rows.append((variant, x))
ids = sorted({x['id'] for _, x in rows}, key=lambda i: (''.join(c for c in i if c.isalpha()), int(''.join(c for c in i if c.isdigit()))))
by_id = {}
for v, x in rows:
    by_id.setdefault(x['id'], {})[v] = x
out = ['# Hymns whose database tune code disagrees with the printed melody (our reading), %d hymns.' % len(ids),
       '# Report only: the tune code names the MIDI file (res/raw/m<tune>.mid), so do NOT edit it without checking playback.',
       '# columns: id | variants flagged | DB tune code | our reading (same length) | first differing position (1-based) | MIDI check (V4)',
       '']
for i in ids:
    ir = json.load(open(os.path.join(HERE, 'build/ir/piano/%s.json' % i)))
    r = verify.v3_tune(ir, i)
    if r is None:
        continue
    status, tune, got = r
    pos = next((k + 1 for k, (a, b) in enumerate(zip(tune, got)) if a != b), min(len(tune), len(got)) + 1)
    v4 = by_id[i].get('piano', next(iter(by_id[i].values()))).get('v4')
    out.append('%-8s | %-12s | %s | %s | %d | v3=%s v4=%s' % (i, '+'.join(sorted(by_id[i])), tune, ''.join(map(str, got)), pos, status, v4))
open(os.path.join(HERE, 'build/db_tune_mismatches.txt'), 'w').write('\n'.join(out) + '\n')
print(len(ids), 'hymns ->', 'build/db_tune_mismatches.txt')
