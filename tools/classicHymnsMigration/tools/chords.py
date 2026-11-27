"""Naming the chord of a stretch of a MIDI (a beat), the way a player hears it: by the notes that last, not by the notes that pass.

window_chord(notes, a, b, kind, prev) -> the chord's name for the ticks a..b, or None when nothing sounds. `notes` are
(start, end, pitch) in ticks. Each note counts as much as it sounds of the window (a passing eighth in a beat counts little);
the bass is the lowest note at the start of the window. A chord is a triad or a seventh chord (sus2, sus4, add9, 6th and augmented
chords only when nothing else fits: a hymnal's chords come from passing notes otherwise); a seventh counts only when it really sounds.
`prev` (the name of the chord before) stays unless another chord fits clearly better, so that a chord does not flip back and forth
over passing notes. Diminished chords are written as the plain chord (simplify_dim.py).
"""
import simplify_dim as SD
SHARP = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B']
FLAT = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B']
MAIN = [('', (0, 4, 7)), ('m', (0, 3, 7)), ('7', (0, 4, 7, 10)), ('m7', (0, 3, 7, 10)),
        ('dim', (0, 3, 6)), ('m7♭5', (0, 3, 6, 10)), ('dim7', (0, 3, 6, 9))]
ODD = [('Maj7', (0, 4, 7, 11)), ('sus4', (0, 5, 7)), ('sus2', (0, 2, 7)), ('aug', (0, 4, 8)), ('6', (0, 4, 7, 9)), ('m6', (0, 3, 7, 9)), ('mMaj7', (0, 3, 7, 11))]
FLOOR = 0.12    # a note that sounds less of the window than this does not count (unless it is the bass)

def _mass(notes, a, b):
    mass = {}; bass = None; low_start = None
    for s, e, p in notes:
        ov = min(e, b) - max(s, a)
        if ov <= 0: continue
        w = ov / (b - a)
        if s <= a + (b - a) * 0.1 and (low_start is None or p < low_start): low_start = p
        if w >= FLOOR: mass[p % 12] = mass.get(p % 12, 0) + w
    if low_start is None:   # nothing starts the window: the lowest of what sounds most
        cand = [(p, min(e, b) - max(s, a)) for s, e, p in notes if min(e, b) > max(s, a)]
        if cand: low_start = min(cand, key=lambda c: (-(c[1] > (b - a) * 0.3), c[0]))[0]
    if low_start is not None:
        bass = low_start % 12; mass.setdefault(bass, 0.15)
    return mass, bass

def _score(root, ivs, q, mass, bass, total):
    tones = {(root + i) % 12 for i in ivs}
    if bass not in tones: return None
    cov = sum(m for pc, m in mass.items() if pc in tones); extra = total - cov
    s = cov - 1.3 * extra
    third = [pc for pc in ((root + 3) % 12, (root + 4) % 12) if pc in tones]
    if third and not any(mass.get(pc, 0) > 0 for pc in third): s -= 0.2 * total    # a chord without its third in the notes
    if len(ivs) == 4:
        seventh = (root + ivs[3]) % 12
        if mass.get(seventh, 0) < 0.3: s -= 0.6       # a seventh must really sound
        if q == 'm7' and bass == (root + 3) % 12: s -= 0.15 * total   # a minor seventh over its third is mostly the relative major (E♭ for C-E♭-G-B♭): the notes decide
    if bass != root: s -= 0.12 * total
    return s

def window_chord(notes, a, b, kind, prev=None):
    mass, bass = _mass(notes, a, b)
    total = sum(mass.values())
    if not total: return None
    names = FLAT if kind == 'f' else SHARP
    def best(table, penalty):
        out = None
        for root in range(12):
            for q, ivs in table:
                s = _score(root, ivs, q, mass, bass, total)
                if s is None: continue
                s -= penalty + 0.02 * [x[0] for x in table].index(q)
                if out is None or s > out[0]: out = (s, root, q)
        return out
    b1 = best(MAIN, 0)
    b2 = best(ODD, 1.5)
    pick = b1 if b2 is None or (b1 is not None and b1[0] >= b2[0]) else b2
    if pick is None: return None
    def name(r, q): return SD.simplify(names[r] + q + ('' if bass == r else '/' + names[bass]))
    if prev:
        # score of the chord before for this window
        import re
        m = re.match(r'^([A-G][♭♯]?)([^/]*)(?:/([A-G][♭♯]?))?$', prev)
        if m:
            nat = {'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11}
            r = (nat[m.group(1)[0]] + {'': 0, '♯': 1, '♭': -1}[m.group(1)[1:]]) % 12
            for q, ivs in MAIN + ODD:
                if SD.simplify(names[r] + q) == names[r] + m.group(2) or q == m.group(2):
                    s = _score(r, ivs, q, mass, bass, total)
                    if s is None:
                        # same chord over another bass: a walking bass keeps the chord
                        tones = {(r + i) % 12 for i in ivs}
                        if bass in tones: s = None
                    if s is not None and s >= pick[0] - 0.18 * total: return prev
                    break
    return name(pick[1], pick[2])
