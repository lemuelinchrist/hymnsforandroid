"""Checks of the note placement (python3 sheet-lyrics/test_align.py)."""
import os
import sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import align  # noqa: E402


def slots(durs):
    return [{'id': 'n%d' % i, 'dur': d} for i, d in enumerate(durs)]


def toks(*words):
    out = []
    for w in words:
        for j, s in enumerate(w):
            out.append({'t': s, 'ws': j == 0, 'we': j == len(w) - 1})
    return out


def main():
    bad = 0

    def check(name, cond):
        nonlocal bad
        if not cond:
            bad += 1
            print('FAIL', name)

    # exact: one syllable per note
    placed, adj = align.place(toks(['Pè', 're'], ['bon']), slots([4, 4, 2]))
    check('exact', adj == (0, 0) and [len(s) for _, s in placed] == [1, 1, 1])
    # one note too many: the syllable on the longest note is held
    placed, adj = align.place(toks(['Pè', 're'], ['bon']), slots([4, 4, 8, 1]))
    held = [t['t'] for t, s in placed if len(s) == 2]
    check('hold count', adj == (1, 0) and len(held) == 1)
    check('hold on the long final note', held == ['bon'])
    # one syllable too many: a weak syllable shares a note
    placed, adj = align.place(toks(['de'], ['jour'], ['en'], ['jour']), slots([8, 8, 8]))
    check('merge count', adj == (0, 1))
    check('merge uses the tie', any(align.JOIN in t['t'] for t, s in placed))
    # the syllable text keeps its order
    out = {}
    align.write_notes(placed, out)
    check('all notes written', len(out) == 3)
    # a hold writes the held note as 0 and marks the extender
    placed, adj = align.place(toks(['bon']), slots([2, 2]))
    out = {}
    align.write_notes(placed, out)
    check('held note empty', out['n1'] == 0 and out['n0'][2] == 'u')
    # a compound is one word
    out = {}
    align.write_notes([(t, [s]) for t, s in zip(toks(['Jé', 'sus-'], ['Christ']), slots([4, 4, 4]))], out)
    check('compound joined', out['n1'][0] == 'sus' and out['n1'][1] == 'm' and out['n2'][1] == 't')
    # hand-made line syntax
    t, n = align.parse_override_line('Nous ai-mons_ le Pè-re‿est')
    check('override notes', n == 7)
    print('%d checks passed' % (11 - bad) if not bad else '%d failed' % bad)
    sys.exit(1 if bad else 0)


if __name__ == '__main__':
    main()
