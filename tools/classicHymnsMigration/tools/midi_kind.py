#!/usr/bin/env python3
"""Tells what kind of MIDI a tune has (2026-11-28): a four-part setting (what add_voices.py needs), a piano accompaniment, one line only, or
something else. Used because the hymns' MIDIs come from several sources and only some play the hymnal's four parts.

For every note onset it counts the notes that start together (a chorale moves its voices together: 3-4 start at once) and the notes
that sound; it also counts how many notes are short (a sixteenth or less: arpeggios, runs) and how long the lowest voice holds.

usage: python3 tools/midi_kind.py [tune ...]   (all MIDIs without arguments; prints a table, writes midi_kinds.tsv beside STATUS.tsv when all)
"""
import os, sys, glob
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import midi_to_sheet as M
HERE = os.path.dirname(os.path.abspath(__file__)); MIDI = os.path.join(HERE, '..', 'midi')


def kind(path):
    div, notes, bpm, ts, ks = M.read_midi(path)
    if len(notes) < 8: return ('empty', {})
    q = div / 4.0                                   # a sixteenth
    notes = [(round(s / q), max(round(e / q), round(s / q) + 1), p) for s, e, p in notes]
    onsets = sorted({s for s, e, p in notes})
    start = {t: 0 for t in onsets}
    for s, e, p in notes: start[s] += 1
    block = sum(1 for t in onsets if start[t] >= 3) / len(onsets)
    poly = []
    for t in onsets: poly.append(sum(1 for s, e, p in notes if s <= t < e))
    poly.sort(); med = poly[len(poly) // 2]
    four = sum(1 for n in poly if 3 <= n <= 5) / len(poly)
    short = sum(1 for s, e, p in notes if e - s <= 1) / len(notes)
    per = len(notes) / max(len(onsets), 1)                      # notes per onset
    low_onsets = len({s for s, e, p in notes if p < 55})        # the bass line's moves
    m = dict(notes=len(notes), onsets=len(onsets), block=round(block, 2), median_poly=med, four=round(four, 2), short=round(short, 2), per_onset=round(per, 2))
    if med <= 1 or per < 1.4: k = 'one-line'
    elif block >= 0.55 and short <= 0.12 and 3 <= med <= 5: k = 'four-part'
    elif block >= 0.4 and short <= 0.25 and 3 <= med <= 5: k = 'mostly-four-part'
    elif short > 0.25 or block < 0.3: k = 'piano'
    else: k = 'other'
    return (k, m)


if __name__ == '__main__':
    args = sys.argv[1:]
    files = [os.path.join(MIDI, 'm%s.mid' % a) for a in args] if args else sorted(glob.glob(os.path.join(MIDI, 'm*.mid')))
    rows = []
    for f in files:
        try: k, m = kind(f)
        except Exception as e: k, m = 'error', {}
        rows.append((os.path.basename(f)[1:-4], k, m))
        if args: print(rows[-1])
    if not args:
        with open(os.path.join(HERE, '..', 'midi_kinds.tsv'), 'w') as o:
            o.write('tune\tkind\tnotes\tonsets\tblock\tmedian_poly\tshort\tper_onset\n')
            for t, k, m in rows: o.write('\t'.join([t, k] + [str(m.get(c, '')) for c in ('notes', 'onsets', 'block', 'median_poly', 'short', 'per_onset')]) + '\n')
        import collections; print(collections.Counter(k for t, k, m in rows))
