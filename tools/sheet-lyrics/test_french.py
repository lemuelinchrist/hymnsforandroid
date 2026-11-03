"""Quick checks of the French syllable splitter (python3 sheet-lyrics/test_french.py)."""
import os
import sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from french import word_readings  # noqa: E402


def syllables(word, nxt=None, line_end=False):
    return [r[0] for r in word_readings(word, nxt, line_end)]


CASES = [
    # word, next word, line end, a reading that must be offered
    ('Rendons', None, False, ['Ren', 'dons']),
    ('notre', 'Père', False, ['no', 'tre']),          # silent e sung before a consonant
    ('notre', 'Esprit', False, ['notre']),            # swallowed before a vowel
    ('Père', None, True, ['Pè', 're']),               # sung at the end of a line
    ('gloire', 'à', False, ['gloire']),
    ('Esprit', None, False, ['Es', 'prit']),
    ("l'Esprit", None, False, ["l'Es", 'prit']),
    ('chaque', 'jour', False, ['cha', 'que']),         # the u of que is silent
    ('longue', None, True, ['lon', 'gue']),
    ('Dieu', None, False, ['Dieu']),
    ('louons', None, False, ['lou', 'ons']),          # both the glide and the two-syllable reading exist
    ('louons', None, False, ['louons']),
    ('Des', 'mains', False, ['Des']),                  # des/les/tes: the e is the vowel
    ('rédemption', None, False, ['ré', 'demp', 'tion']),
    ('rédemption', None, False, ['ré', 'demp', 'ti', 'on']),
    ('yeux', None, False, ['yeux']),
]


def main():
    bad = 0
    for word, nxt, end, want in CASES:
        got = syllables(word, nxt, end)
        if want not in got:
            bad += 1
            print('FAIL %s (next %s): want %s, got %s' % (word, nxt, want, got))
    print('%d/%d as expected' % (len(CASES) - bad, len(CASES)))
    sys.exit(1 if bad else 0)


if __name__ == '__main__':
    main()
