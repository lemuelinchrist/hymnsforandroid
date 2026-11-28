#!/usr/bin/env python3
"""Takes the four voices out of a voiced sheet again (the opposite of add_voices.py): the alto layer, the bass-clef staff, the chords
named from the voices (the typeless <harm>: the Original level), the parts mark and the brace; the chords of the Medium level
(type="medium" or "medium-auto") become the sheet's ordinary chords. Everything else (tempo, notes, words, naturals) stays.
Used to put a sheet back when its MIDI turns out not to be a four-part setting, and to correct a sheet's melody before add_voices.py is run again.

usage: python3 tools/strip_voices.py <hymn>... [--write]
"""
import os, re, sys
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..'))
SHEETS = os.path.join(ROOT, 'app/src/main/assets/sheetMei')


def strip(x):
    if 'type="parts"' not in x: return x
    x = re.sub(r'<identifier type="parts">SATB</identifier>', '', x)
    x = re.sub(r'<staff n="2">.*?</staff>\s*', '', x, flags=re.S)
    x = re.sub(r'(<staff n="1">.*?</layer>)\s*<layer n="2">.*?</layer>', r'\1', x, flags=re.S)
    x = re.sub(r'<harm\b(?![^>]*type=)[^>]*>[^<]*</harm>\s*', '', x)            # the Original chords
    x = re.sub(r'(<harm\b[^>]*?) type="medium(?:-auto)?"', r'\1', x)
    x = x.replace('<staffGrp symbol="brace" bar.thru="true">', '<staffGrp>')
    x = re.sub(r'<staffDef n="2"[^>]*/>', '', x)
    return x


if __name__ == '__main__':
    for h in [a for a in sys.argv[1:] if not a.startswith('--')]:
        p = os.path.join(SHEETS, h + '.mei'); x = open(p, encoding='utf8').read(); y = strip(x)
        print(h, 'stripped' if y != x else 'has no voices')
        if y != x and '--write' in sys.argv: open(p, 'w', encoding='utf8').write(y)
