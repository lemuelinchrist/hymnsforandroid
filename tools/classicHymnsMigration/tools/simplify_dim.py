#!/usr/bin/env python3
"""Chords written as the plain chords a pianist reads at sight.

Two rules. (1) A minor seventh over its own third (C♯m7/E: C♯ E G♯ B on an E) is the sixth chord of the relative major, so it is
written as that chord: C♯m7/E -> E. (2) Diminished and half-diminished chords, below.

A diminished triad on X (X, X+3, X+6) is the top of the dominant seventh a major third below it: G♯dim = E7 without its root, so
G♯dim -> E/G♯ (the bass stays where it was). Diminished sevenths and half-diminished chords (Xdim7, Xm7♭5) go the same way
(the 7th chord of that dominant when its seventh is the bass). Used by midi_to_sheet.py / midi_align.py when they name a chord, and
as a script over the sheets:  python3 tools/simplify_dim.py [--write] [hymn ...]   (all English sheets of ours when none is named).
"""
import os, re, sys
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
MEI = os.path.join(ROOT, 'app/src/main/assets/sheetMei')
LET = 'CDEFGAB'; NAT = {'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11}
SHARP = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B']
FLAT = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'G♭', 'G', 'A♭', 'A', 'B♭', 'B']
DIM = re.compile(r'^([A-G])([♭♯]?)(dim7|dim|°7|°|m7♭5|ø7|ø)(?:/([A-G][♭♯]?))?$')

def pc(letter, acc): return (NAT[letter] + {'': 0, '♯': 1, '♭': -1}[acc]) % 12

M7INV = re.compile(r'^([A-G][♭♯]?)m7/([A-G][♭♯]?)$')

def simplify(chord):
    mi = M7INV.match(chord)
    if mi:
        r, b = mi.groups()
        if (pc(b[0], b[1:]) - pc(r[0], r[1:])) % 12 == 3: return b
    m = DIM.match(chord)
    if not m: return chord
    L, acc, q, bass = m.groups()
    x = pc(L, acc); r = (x - 4) % 12
    rl = LET[(LET.index(L) - 2) % 7]          # a third below, by letter
    d = (r - NAT[rl] + 6) % 12 - 6
    if d == 0: root = rl
    elif d == 1: root = rl + '♯'
    elif d == -1: root = rl + '♭'
    else: root = (SHARP if acc == '♯' else FLAT)[r]
    if root in ('F♭', 'C♭', 'E♯', 'B♯'): root = (SHARP if acc == '♯' else FLAT)[r]   # E, B, F, C
    if bass is None: return '%s/%s' % (root, L + acc)
    b = pc(bass[0], bass[1:])
    if b == x or b == (x + 3) % 12: return '%s/%s' % (root, bass)
    if b == (x + 6) % 12: return '%s7/%s' % (root, bass)
    return '%s/%s' % (root, bass)

HARM = re.compile(r'(<harm\b[^>]*>)([^<]*)(</harm>)')
def convert(xml):
    n = [0]
    def sub(m):
        new = simplify(m.group(2))
        if new != m.group(2): n[0] += 1
        return m.group(1) + new + m.group(3)
    return HARM.sub(sub, xml), n[0]

if __name__ == '__main__':
    write = '--write' in sys.argv; ids = [a for a in sys.argv[1:] if not a.startswith('--')]
    files = [os.path.join(MEI, i + '.mei') for i in ids] or sorted(
        os.path.join(MEI, f) for f in os.listdir(MEI) if re.match(r'E\d+\.mei$', f))
    tot = 0; sheets = 0; ex = {}
    for p in files:
        x = open(p, encoding='utf8').read()
        if not ids and 'type="source">Hymns For Android' not in x: continue   # the hymnal.net sheets stay as they are
        y, n = convert(x)
        if n:
            sheets += 1; tot += n
            if write: open(p, 'w', encoding='utf8').write(y)
    print('%d chords in %d sheets %s' % (tot, sheets, 'rewritten' if write else '(dry run)'))
