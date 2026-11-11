#!/usr/bin/env python3
"""Make a MIDI for every hymn whose tune code has no res/raw/m<tune>.mid yet (hymnal.net serves no MIDI since 2026-10).
usage: make_missing.py <out dir> [bpm=110]      (Python with pretty_midi; reads the app database and the sheetMei files)
One file per tune code, named m<tune lower-cased>.mid, written to <out dir> (NOT to res/raw: listen to a few, then copy).
A hymn without its own tune code uses its parent's (as the app does); a hymn without its own sheet uses its parent's.
Prints what was made, and the hymns that have a tune but no sheet to make it from."""
import os, sqlite3, sys, pathlib
sys.path.insert(0, str(pathlib.Path(__file__).parent))
import make_midi
REPO = pathlib.Path(__file__).resolve().parents[2]
raw = {p.stem[1:].lower() for p in (REPO / 'app/src/main/res/raw').glob('m*.*')}  # any extension: a .mid next to an .mp3 of the same name is a duplicate resource and breaks the build
db = sqlite3.connect(f"file:{REPO}/app/src/main/assets/hymns.sqlite?mode=ro", uri=True)
rows = {r[0]: r for r in db.execute('select _id, parent_hymn, tune from hymns')}
mei = REPO / 'app/src/main/assets/sheetMei'
def up(h):
    r = rows[h]
    return rows.get(r[1]) if r[1] else None
def tune(h):
    r = rows[h]
    for _ in range(4):
        if (r[2] or '').strip(): return r[2].strip().lower()
        r = rows.get(r[1]) if r[1] else None
        if not r: return ''
    return ''
def sheet(h):
    for _ in range(4):
        if (mei / f'{h}.mei').exists(): return mei / f'{h}.mei'
        h = rows[h][1] if rows[h][1] in rows else None
        if not h: return None
out = pathlib.Path(sys.argv[1]); out.mkdir(parents=True, exist_ok=True)
bpm = float(sys.argv[2]) if len(sys.argv) > 2 else 110
made, nosheet, failed = {}, [], []
for h in sorted(rows):
    t = tune(h)
    if not t or t in raw or t in made: continue
    s = sheet(h)
    if not s: nosheet.append(h); continue
    try:
        make_midi.main(str(s), str(out / f'm{t}.mid'), bpm); made[t] = h
    except Exception as e:
        failed.append((h, repr(e)))
print(f'{len(made)} MIDI files in {out}; no sheet: {nosheet}; failed: {failed}')
