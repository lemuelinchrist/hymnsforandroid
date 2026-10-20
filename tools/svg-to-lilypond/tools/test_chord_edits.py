"""Tests of chord_edits.py, on copies of the sheets in a temporary folder (the real ly/ and sheetMei/ are not touched).

    python3 tools/test_chord_edits.py            the cases below
    python3 tools/test_chord_edits.py --corpus   also: every bar of every sheet rewritten with its own chords gives back
                                                 the same MEI (checks how chords and spacers are written, on all of them)
"""
import json
import os
import re
import shutil
import sys
import tempfile
from fractions import Fraction as F

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import chord_edits as C  # noqa: E402

REAL_LY, REAL_MEI = C.LY_DIR, C.MEI_DIR
passed = failed = 0


def test(name, fn):
    global passed, failed
    try:
        fn()
        passed += 1
        print('  ok   ' + name)
    except Exception as e:  # noqa: BLE001
        failed += 1
        print('  FAIL %s\n       %s: %s' % (name, type(e).__name__, e))


def sandbox(*hymns):
    d = tempfile.mkdtemp(prefix='chord-edits-')
    for sub in ('ly', 'mei', 'edits'):
        os.makedirs(os.path.join(d, sub))
    for h in hymns:
        shutil.copy(os.path.join(REAL_LY, h + '.ly'), os.path.join(d, 'ly'))
        shutil.copy(os.path.join(REAL_MEI, h + '.mei'), os.path.join(d, 'mei'))
    C.LY_DIR, C.MEI_DIR, C.EDITS_DIR = (os.path.join(d, s) for s in ('ly', 'mei', 'edits'))
    return d


def export(path, sheets):
    with open(path, 'w', encoding='utf-8') as f:
        json.dump({'format': 'hymns-chord-edits', 'v': 1, 'sheets': {h: {'bars': b} for h, b in sheets.items()}}, f)
    return path


def harms(hymn, bar):
    mei = open(os.path.join(C.MEI_DIR, hymn + '.mei'), encoding='utf-8').read()
    return [(float(b), t) for b, t in C.mei_bars(mei)[bar - 1]]


def chords_now(hymn, bar):
    text = open(os.path.join(C.LY_DIR, hymn + '.ly'), encoding='utf-8').read()
    return [(float(b), t) for b, t in C.bar_info(text)[bar - 1]['chords']]


def quiet(fn, *a):
    out = sys.stdout
    sys.stdout = open(os.devnull, 'w')
    try:
        return fn(*a)
    finally:
        sys.stdout.close()
        sys.stdout = out


def case_e8():
    d = sandbox('E8')
    f = export(os.path.join(d, 'x.json'), {'E8': {
        '1': {'was': [[1, 'G']], 'chords': [[1, 'Em']]},                                         # the pickup bar
        '2': {'was': [[3, 'Em']], 'chords': [[2.5, 'A7'], [3, 'Em']]},                          # a passing chord
        '3': {'was': [[1, 'D'], [3, 'G']], 'chords': [[1, 'D'], [3, 'Cadd9']]},                 # a written-out name
        '5': {'was': [[1, 'Am'], [3, 'C']], 'chords': [[1, 'F♯dim'], [3, 'C']]},
        '7': {'was': [[1, 'Z9']], 'chords': [[1, 'C']]},                                         # changed since: refused
        '8': {'was': [[1, 'C'], [3, 'Em']], 'chords': [[1, 'C7♯9']]},                            # unknown chord: refused
    }})
    assert quiet(C.cmd_import, f, False) == 1, 'import should report the two refused bars'
    assert harms('E8', 1) == [(1.0, 'Em')], harms('E8', 1)
    assert harms('E8', 2) == [(2.5, 'A7'), (3.0, 'Em')], harms('E8', 2)
    assert harms('E8', 3) == [(1.0, 'D'), (3.0, 'Cadd9')], harms('E8', 3)
    assert harms('E8', 5) == [(1.0, 'F♯°'), (3.0, 'C')], harms('E8', 5)
    assert harms('E8', 7) == [(1.0, 'D'), (3.0, 'Em')], 'bar 7 changed'
    ly = open(os.path.join(C.LY_DIR, 'E8.ly'), encoding='utf-8').read()
    assert '\\markup { "Cadd9" } c2:5.9' in ly, 'add9 not named'
    stored = json.load(open(os.path.join(C.EDITS_DIR, 'E8.json'), encoding='utf-8'))
    assert sorted(stored['bars'], key=int) == ['1', '2', '3', '5'], stored['bars'].keys()
    # the same file again: nothing to do, no new history entry
    quiet(C.cmd_import, f, False)
    again = json.load(open(os.path.join(C.EDITS_DIR, 'E8.json'), encoding='utf-8'))
    assert len(again['history']) == 1, again['history']
    # a converter refresh puts the old .ly back: check sees it, apply puts the edits in again
    edited = ly
    shutil.copy(os.path.join(REAL_LY, 'E8.ly'), C.LY_DIR)
    assert quiet(C.cmd_apply, set(), True) == 1, 'check did not notice'
    assert quiet(C.cmd_apply, set(), False) == 0, 'apply failed'
    assert open(os.path.join(C.LY_DIR, 'E8.ly'), encoding='utf-8').read() == edited, 'not the same .ly after apply'
    assert quiet(C.cmd_apply, set(), True) == 0, 'check after apply'
    shutil.rmtree(d)


def find_bar(pred, limit=3345):
    for name in sorted(os.listdir(REAL_LY))[:limit]:
        hymn = name[:-3]
        text = open(os.path.join(REAL_LY, name), encoding='utf-8').read()
        try:
            bars = C.bar_info(text)
        except Exception:  # noqa: BLE001
            continue
        for i, b in enumerate(bars, 1):
            if pred(b, i):
                return hymn, i, b
    raise AssertionError('no such bar')


def edit_bar(hymn, n, bar, chords):
    d = sandbox(hymn)
    f = export(os.path.join(d, 'x.json'), {hymn: {str(n): {'was': [[float(b), t] for b, t in bar['chords']], 'chords': chords}}})
    assert quiet(C.cmd_import, f, False) == 0, 'import failed'
    got = harms(hymn, n)
    want = [(float(b), C.printed(t)) for b, t in chords]
    assert got == want, '%s bar %d: %s, wanted %s' % (hymn, n, got, want)
    shutil.rmtree(d)


def case_named_bar():
    hymn, n, bar = find_bar(lambda b, i: 'ChordName.text' in b['src'])
    edit_bar(hymn, n, bar, [[1, 'A'], [3, 'E7']])


def case_tuplet_bar():
    hymn, n, bar = find_bar(lambda b, i: '\\tuplet' in b['src'] and b['chords'] and b['length'] == 1 and b['den'] == 4)
    edit_bar(hymn, n, bar, [[1, 'C'], [2, 'Dm7'], [3, 'G7sus4'], [4, 'G7']])


def case_six_eight():
    hymn, n, bar = find_bar(lambda b, i: b['den'] == 8 and b['length'] == F(6, 8) and len(b['chords']) == 1)
    edit_bar(hymn, n, bar, [[1, 'Bm7♭5'], [4, 'E7'], [5.5, 'Am']])


def case_triplet_beat_refused():
    d = sandbox('E8')
    f = export(os.path.join(d, 'x.json'), {'E8': {'2': {'was': [[3, 'Em']], 'chords': [[1 + 1 / 3, 'A7']]}}})
    assert quiet(C.cmd_import, f, False) == 1, 'a beat inside a triplet should be refused'
    assert harms('E8', 2) == [(3.0, 'Em')], 'bar changed'
    shutil.rmtree(d)


def corpus():
    """Every bar of every sheet rewritten with its own chords: the MEI must come out the same."""
    C.LY_DIR, C.MEI_DIR = REAL_LY, REAL_MEI
    bad, n = [], 0
    for name in sorted(os.listdir(REAL_LY)):
        hymn = name[:-3]
        text = open(os.path.join(REAL_LY, name), encoding='utf-8').read()
        try:
            bars = C.bar_info(text)
            new = text
            for b in reversed(bars):
                new = new[:b['start']] + C.new_bar_source(b, b['chords']) + new[b['end']:]
            old_mei = open(os.path.join(REAL_MEI, hymn + '.mei'), encoding='utf-8').read()
            C.check(hymn, old_mei, C.L.convert(new, hymn)[0], {})
            n += 1
        except Exception as e:  # noqa: BLE001
            bad.append('%s: %s' % (hymn, e))
    print('  corpus: %d sheets rewrite to the same MEI, %d do not' % (n, len(bad)))
    for b in bad[:20]:
        print('       ' + b)
    assert not bad, '%d sheets' % len(bad)


if __name__ == '__main__':
    test('E8: pickup, passing chord, add9, dim; refused: changed bar, unknown chord; re-import; refresh + apply', case_e8)
    test('a bar with a written-out chord name', case_named_bar)
    test('a bar with triplets in the melody', case_tuplet_bar)
    test('a 6/8 bar (beats in eighths, half beats)', case_six_eight)
    test('a chord on a triplet beat is refused', case_triplet_beat_refused)
    if '--corpus' in sys.argv:
        test('every sheet', corpus)
    print('%d passed, %d failed' % (passed, failed))
    sys.exit(1 if failed else 0)
