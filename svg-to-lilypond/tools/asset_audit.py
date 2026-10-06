"""Compare duplicate / suspicious sheet-music assets against each other and hymnal.net's current version.

usage: python3 tools/asset_audit.py dups          # guitarSvg/* (1).svg vs base vs live vs piano
       python3 tools/asset_audit.py pairs ID ...  # piano vs guitar vs live for given hymn ids
Live downloads are cached in build/fresh/{piano,guitar}/<id>.svg
"""
import os
import re
import sqlite3
import subprocess
import sys
import time

sys.path.insert(0, os.path.dirname(__file__))
from svgscan import parse, staves, is_sans  # noqa: E402

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
HERE = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
ASSETS = os.path.join(ROOT, 'app/src/main/assets')
FRESH = os.path.join(HERE, 'build/fresh')
db = sqlite3.connect(os.path.join(ASSETS, 'hymns.sqlite'))


def link(hid, variant):
    row = db.execute('select sheet_music_link from hymns where _id=?', (hid,)).fetchone()
    if not row or not row[0]:
        return None
    u = row[0].replace('http:', 'https:')
    return u.replace('_g.svg', '_p.svg').replace('_p.svg', '_g.svg' if variant == 'guitar' else '_p.svg')


def live(hid, variant):
    path = os.path.join(FRESH, variant, hid + '.svg')
    if not os.path.exists(path):
        u = link(hid, variant)
        if not u:
            return None
        os.makedirs(os.path.dirname(path), exist_ok=True)
        r = subprocess.run(['curl', '-sfL', '--max-time', '30', '-o', path, u])
        time.sleep(0.5)                       # be polite to hymnal.net
        if r.returncode != 0:
            return None
    head = open(path, encoding='utf8', errors='replace').read(2000).lower()
    return None if '<html' in head else path


def sig(path):
    """Musical signature: chord text sequence, notehead count, title/subtitle texts."""
    s = parse(path)
    tops = [st[0] for st in staves(s)]
    staff_of = lambda y: next((i for i, t in enumerate(tops) if t > y), len(tops))  # chord sits above its staff
    chords = sorted((t for t in s.texts if is_sans(t[3]) and t[4] < 2.1),
                    key=lambda t: (staff_of(t[2]), round(t[1], 1)))
    return {'chords': ''.join(c[0] for c in chords), 'heads': len([g for g in s.glyphs if g[3] >= 0.0039]),
            'texts': len(s.texts)}


def same(a, b):
    return a is not None and b is not None and a == b


def dups():
    gdir = os.path.join(ASSETS, 'guitarSvg')
    for f in sorted(os.listdir(gdir)):
        if not f.endswith(' (1).svg'):
            continue
        base = f.replace(' (1)', '')
        hid = base[:-4]
        A, B = os.path.join(gdir, base), os.path.join(gdir, f)
        if open(A, 'rb').read() == open(B, 'rb').read():
            print(f'{hid:7s} IDENTICAL')
            continue
        sa, sb = sig(A), sig(B)
        L = live(hid, 'guitar')
        sl = sig(L) if L else None
        verdict = ('base=live' if sl and sa['chords'] == sl['chords'] else
                   'dup=live' if sl and sb['chords'] == sl['chords'] else
                   'neither=live' if sl else 'no-live')
        print(f'{hid:7s} {verdict:12s} chords base/dup/live: {len(sa["chords"])}/{len(sb["chords"])}/'
              f'{len(sl["chords"]) if sl else "-"}  heads {sa["heads"]}/{sb["heads"]}/{sl["heads"] if sl else "-"}')


def pairs(ids):
    for hid in ids:
        P, G = os.path.join(ASSETS, 'pianoSvg', hid + '.svg'), os.path.join(ASSETS, 'guitarSvg', hid + '.svg')
        lp, lg = live(hid, 'piano'), live(hid, 'guitar')
        out = []
        for name, path in (('piano', P), ('guitar', G), ('live_piano', lp), ('live_guitar', lg)):
            out.append(f'{name}={sig(path)["heads"] if path and os.path.exists(path) else "-"}')
        print(hid, 'noteheads:', ' '.join(out))


if __name__ == '__main__':
    if sys.argv[1] == 'dups':
        dups()
    else:
        pairs(sys.argv[2:])
