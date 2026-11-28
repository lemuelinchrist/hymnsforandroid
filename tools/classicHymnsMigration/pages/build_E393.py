#!/usr/bin/env python3
"""E393 'Thy way, not mine, O Lord' (first tune, 2/4 then 3/4) made from the printed page (the user's photo, 2026-11-28).

The page was read head by head: the noteheads were found on the photo and each was put on its staff line (the photo's staff
lines found per place), the hollow heads and the one accidental (a flat before the tenor's C in 'own': C-flat) looked at in zooms.
The melody of the sheet we had (from the hymnal.net sheet) is the page's soprano; what the sheet got wrong was the rhythm of
'Choose out the' (the page has 'hand,' alone before the double bar, then 3/4: Choose - out the on F A-flat as two eighths - the) and
that bar's meter. The alto, tenor and bass are the page's, the chords of the Original level are named from the four voices as they
sound, the Medium chords are made by hand.

usage: python3 pages/build_E393.py [E393|E379] [--write]   (E379 'I hunger and I thirst' has the same tune)
"""
import os, re, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'tools'))
import add_voices as A, midi_to_sheet as M

HYMN = sys.argv[1] if len(sys.argv) > 1 and not sys.argv[1].startswith('--') else 'E393'
PATH = os.path.join(A.SHEETS, HYMN + '.mei')
P = {'C4': 60, 'B3': 59, 'A3': 57, 'F3': 53, 'G3': 55, 'E3': 52, 'D3': 50, 'C3': 48, 'B2': 47, 'A2': 45, 'G2': 43, 'D4': 62, 'E4': 64, 'F4': 65, 'G4': 67, 'A4': 69, 'B4': 71}
def n(name):
    """a pitch of the page: 'Db4' = D flat 4, 'Cb4' = C flat 4"""
    L = name[0]; acc = -1 if name[1] == 'b' else 0 if name[1].isdigit() else 1; o = int(name[-1])
    return {'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11}[L] + acc + 12 * (o + 1)

# the page, bar by bar (the sheet's bars): per voice a list of (pitch, beats); the soprano is the sheet's melody
Q = 1.0
ALTO = [
    [('Db4', 1)],
    [('Ab3', 1), ('Db4', 1)],
    [('Eb4', 1), ('Db4', 1)],
    [('C4', 1), ('C4', 1)],
    [('Db4', 1), ('Eb4', 1)],
    [('C4', 1), ('C4', 1)],
    [('Db4', 1), ('Ab3', 1)],
    [('Db4', 1), ('Db4', 1)],
    [('Db4', 1), ('F4', 1)],
    [('Gb4', 1)],
    [('Eb4', 1), ('Db4', 1), ('Db4', 1)],
    [('Db4', 2), ('C4', 1)],
    [('C4', 3)],
    [('Db4', 2)],
]
TENOR = [
    [('Ab3', 1)],
    [('F3', 1), ('Ab3', 1)],
    [('Ab3', 1), ('Ab3', 1)],
    [('Ab3', 1), ('Ab3', 1)],
    [('Bb3', 1), ('C4', 1)],
    [('Eb3', 1), ('Ab3', 1)],
    [('Ab3', 1), ('F3', 1)],
    [('Ab3', 1), ('Ab3', 1)],
    [('Gb3', 1), ('Cb4', 1)],
    [('Bb3', 1)],
    [('Bb3', 1), ('Ab3', .5), ('F3', .5), ('Ab3', 1)],
    [('Bb3', 1), ('Eb3', 1), ('Ab3', 1)],
    [('Gb3', 1), ('F3', 1), ('Gb3', 1)],
    [('F3', 2)],
]
BASS = [
    [('Db3', 1)],
    [('Db3', 1), ('Db3', 1)],
    [('C3', 1), ('Db3', 1)],
    [('Ab2', 1), ('Ab2', 1)],
    [('Ab2', 1), ('Ab2', 1)],
    [('Ab2', 1), ('Ab2', 1)],
    [('Db3', 1), ('Db3', 1)],
    [('Db3', 1), ('C3', 1)],
    [('Bb2', 1), ('Ab2', 1)],
    [('Gb2', 1)],
    [('Gb2', 1), ('Ab2', 1), ('Ab2', 1)],
    [('Ab2', 2), ('Ab2', 1)],
    [('Ab2', 3)],
    [('Db3', 2)],
]
# the Medium chords, by hand: (tstamp, name) per bar
MEDIUM = [
    [(1, 'D♭')],
    [],
    [(1, 'A♭/C'), (2, 'D♭')],
    [(1, 'A♭'), (2, 'A♭7')],
    [(1, 'A♭7')],
    [(1, 'A♭'), (2, 'A♭7')],
    [(1, 'D♭')],
    [(1, 'D♭')],
    [(1, 'G♭'), (2, 'Fm')],
    [(1, 'G♭')],
    [(1, 'E♭m'), (2, 'D♭/A♭')],
    [(1, 'A♭sus4'), (3, 'A♭')],
    [(1, 'A♭7')],
    [(1, 'D♭')],
]


def verse_of(x, nid):
    m = re.search(r'<note xml:id="%s"[^>]*>\s*(<verse.*?</verse>)\s*</note>' % nid, x, re.S)
    return m.group(1) if m else ''


def fix_rhythm(x):
    """'hand,' alone in its bar (one beat, before the double bar), then 3/4: Choose, out and A-flat as two eighths, the
    (the words of the notes n18-n22 are kept, whatever the hymn's words are: E393 'hand, Choose out the', E379 'burst Out of the')"""
    v18, v19, v20, v22 = (verse_of(x, k) for k in ('n18', 'n19', 'n20', 'n22'))
    a = x.index('<measure n="10"'); b = x.index('<measure n="12">')
    new = """<measure n="10" metcon="false"><staff n="1"><layer n="1">
<note xml:id="n18" pname="b" oct="4" dur="4">
%s</note>
</layer></staff>
<harm staff="1" tstamp="1" place="above">G♭</harm>
<fermata startid="#n18" place="above"/>
</measure>
<scoreDef meter.count="3" meter.unit="4"/>
<measure n="11"><staff n="1"><layer n="1">
<note xml:id="n19" pname="g" oct="4" dur="4">
%s</note>
<note xml:id="n20" pname="f" oct="4" dur="8">
%s</note>
<note xml:id="n21" pname="a" oct="4" dur="8"/>
<note xml:id="n22" pname="f" oct="4" dur="4">
%s</note>
</layer></staff>
<slur startid="#n20" endid="#n21"/>
</measure>
""" % (v18, v19, v20, v22)
    return x[:a] + new + x[b:]


def build(write):
    x = open(PATH, encoding='utf8').read()
    if 'type="parts"' in x: x = __import__('strip_voices').strip(x)
    x = fix_rhythm(x)
    x = re.sub(r'<harm\b[^>]*>[^<]*</harm>\s*', '', x)   # the sheet's own chords go; the Medium ones are written below
    alt, kind = M.key_alters('5f')
    bars = A.sheet_bars(x, alt)
    # the voices in sixteenths
    vs = {'A': [], 'T': [], 'B': []}
    for bi, (b0, blen, notes) in enumerate(bars):
        for v, tab in (('A', ALTO), ('T', TENOR), ('B', BASS)):
            t = b0
            for name, beats in tab[bi]:
                d = int(round(beats * 4)); vs[v].append((t, d, n(name))); t += d
            assert t - b0 == blen or t - b0 < blen, (bi + 1, v, t - b0, blen)
    unit = 4
    original = A.chords_of(bars, [m for b in bars for m in b[2]], vs, kind, unit)
    # the flat spelling of the chord namer gives F-sharp for G-flat (pitch class 6), and the diminished chord of 'own' (F A-flat C-flat) is named as the page has it
    original = [[(t, c.replace('F♯', 'G♭')) for t, c in bar] for bar in original]
    original[8] = [(t, 'Fdim/A♭' if t == 2 else c) for t, c in original[8]]
    ids = [100]; ms = list(re.finditer(r'<measure\b.*?</measure>', x, re.S)); out = []; last = 0
    for bi, mm in enumerate(ms):
        m = mm.group(0); bar = bars[bi]; acc1, acc2, acc3 = {}, {}, {}
        alto = A.layer_xml(bar, vs['A'], alt, kind, ids, acc1)
        ten = A.layer_xml(bar, vs['T'], alt, kind, ids, acc2); bas = A.layer_xml(bar, vs['B'], alt, kind, ids, acc3)
        if bi == 8: ten = ten.replace('pname="b" oct="3" accid="n"', 'pname="c" oct="4" accid="f"', 1)   # the page's flat before the C of 'own'
        m = re.sub(r'(<staff n="1">.*?</layer>)', lambda g: g.group(1) + '\n<layer n="2">' + alto + '</layer>', m, count=1, flags=re.S)
        m = m.replace('</staff>', '</staff>\n<staff n="2"><layer n="1">' + ten + '</layer><layer n="2">' + bas + '</layer></staff>', 1)
        harms = ''.join('<harm type="medium" staff="1" tstamp="%g" place="above">%s</harm>\n' % (t, c) for t, c in MEDIUM[bi])
        harms += ''.join('<harm staff="1" tstamp="%g" place="above">%s</harm>\n' % (t, c) for t, c in original[bi])
        if '<fermata' in m: m = m.replace('<fermata', harms + '<fermata', 1)
        else: m = m.replace('</measure>', harms + '</measure>')
        out.append(x[last:mm.start()]); out.append(m); last = mm.end()
    out.append(x[last:]); new = ''.join(out)
    new = new.replace('<staffGrp>', '<staffGrp symbol="brace" bar.thru="true">', 1)
    new = re.sub(r'(<staffDef n="1"[^>]*/>)', r'\1<staffDef n="2" lines="5" clef.shape="F" clef.line="4"/>', new, count=1)
    new = new.replace('</pubStmt>', '<identifier type="parts">SATB</identifier><identifier type="requiredFermata">true</identifier></pubStmt>', 1)   # the tune cannot be listened to without its fermatas
    if write: open(PATH, 'w', encoding='utf8').write(new)
    for bi, o in enumerate(original): print(bi + 1, ' '.join('%g:%s' % (t, c) for t, c in o))
    return new


if __name__ == '__main__':
    build('--write' in sys.argv)
