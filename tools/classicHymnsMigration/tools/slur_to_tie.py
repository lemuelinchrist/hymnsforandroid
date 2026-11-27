#!/usr/bin/env python3
"""A slur over notes of ONE pitch, the later ones with no syllable of their own, is a tie: it is written as ties (the player holds a
tied note instead of striking it again; a slur is only a curve to it).   python3 tools/slur_to_tie.py [--write]   (all sheets)"""
import os, re, sys
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..')); MEI = os.path.join(ROOT, 'app/src/main/assets/sheetMei')
NOTE = re.compile(r'<note\b([^>]*?)(?:/>|>(.*?)</note>)', re.S); SLUR = re.compile(r'\n?<slur\b[^>]*?startid="#([^"]+)"[^>]*?endid="#([^"]+)"[^>]*?/>')
TIE = re.compile(r'<tie\b[^>]*?startid="#([^"]+)"[^>]*?endid="#([^"]+)"')
def pitch(a): return (a.get('pname'), a.get('oct'), a.get('accid') or a.get('accid.ges') or '')
def convert(x):
    order = []; notes = {}
    for m in re.finditer(r'<(?:note|rest)\b[^>]*?xml:id="([^"]+)"', x): order.append(m.group(1))   # notes AND rests: a slur over a rest is no tie
    for m in NOTE.finditer(x):
        a = dict(re.findall(r'([\w.:]+)="([^"]*)"', m.group(1)))
        if 'xml:id' in a: a['_syl'] = '<syl' in (m.group(2) or ''); notes[a['xml:id']] = a
    have = set(TIE.findall(x)); n = [0]
    def sub(m):
        s, e = m.group(1), m.group(2)
        if s not in notes or e not in notes: return m.group(0)
        i, j = order.index(s), order.index(e)
        if j <= i: return m.group(0)
        seg = order[i:j + 1]
        if any(k not in notes or pitch(notes[k]) != pitch(notes[s]) or (k != s and notes[k]['_syl']) for k in seg): return m.group(0)
        new = ''.join('\n<tie startid="#%s" endid="#%s"/>' % (a, b) for a, b in zip(seg, seg[1:]) if (a, b) not in have)
        n[0] += 1; return new
    return SLUR.sub(sub, x), n[0]
if __name__ == '__main__':
    write = '--write' in sys.argv; tot = files = 0
    for f in sorted(os.listdir(MEI)):
        if not f.endswith('.mei'): continue
        p = os.path.join(MEI, f); x = open(p, encoding='utf8').read(); y, n = convert(x)
        if n:
            files += 1; tot += n
            if write: open(p, 'w', encoding='utf8').write(y)
    print('%d slurs over one pitch -> ties, in %d sheets %s' % (tot, files, 'rewritten' if write else '(dry run)'))
