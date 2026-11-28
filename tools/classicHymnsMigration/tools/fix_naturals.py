#!/usr/bin/env python3
"""Finds (and with --write fixes) notes that follow an altered note of the same pitch in their bar and layer without a written
accidental of their own: after G♭ a plain G in the same bar is read as G♭ again by anyone reading the sheet (and by a player that
carries accidentals through the bar), although the MIDI plays G. The sheet's note keeps its sound; the natural (or the key's
accidental) is written on it.  (2026-11-28, found on E789 bar 9, 'O what peace we often forfeit'.)

usage: python3 tools/fix_naturals.py <file.mei>... [--write]     (prints the fixes)
"""
import re, sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import midi_to_sheet as M

ACC = {'s': 1, 'f': -1, 'n': 0, 'ss': 2, 'ff': -2}
NAME = {1: 's', -1: 'f', 0: 'n', 2: 'ss', -2: 'ff'}


def fix(x):
    """the player (piano.js readBars) carries a written accidental through the bar over every layer of a staff, one layer after the other"""
    sd = re.search(r'<scoreDef\b[^>]*>', x)
    if not sd: return x, []
    sig = re.search(r'key\.sig="([^"]*)"', sd.group(0))
    alt, _ = M.key_alters(sig.group(1) if sig else '0')
    out = []; found = []; last = 0
    for mm in re.finditer(r'<measure\b.*?</measure>', x, re.S):
        m = mm.group(0)
        for st in reversed(list(re.finditer(r'<staff\b[^>]*>.*?</staff>', m, re.S))):
            seg = st.group(0); state = {}; edits = []
            for ly in re.finditer(r'<layer\b[^>]*>.*?</layer>', seg, re.S):
                lstate = {}   # what the layer's own earlier notes wrote (the reader of the printed sheet sees only these)
                def one(t):
                    a = dict(re.findall(r'([\w.:]+)="([^"]*)"', t.group(0)))
                    if 'pname' not in a: return t.group(0)
                    key = (a['pname'], a['oct'])
                    if 'accid' in a: state[key] = lstate[key] = ACC[a['accid']]; return t.group(0)
                    want = ACC[a['accid.ges']] if 'accid.ges' in a else alt[a['pname']]
                    if 'accid.ges' not in a and key in state and state[key] != want:
                        written = key in lstate
                        found.append((a.get('xml:id'), a['pname'] + a['oct'], NAME[want], 'written' if written else 'sounding only'))
                        if written: state[key] = lstate[key] = want
                        return t.group(0).replace('<note ', '<note %s="%s" ' % ('accid' if written else 'accid.ges', NAME[want]), 1)
                    return t.group(0)
                edits.append((ly.start(), ly.end(), re.sub(r'<note\b[^>]*>', one, ly.group(0))))
            for a, b, t in reversed(edits): seg = seg[:a] + t + seg[b:]
            m = m[:st.start()] + seg + m[st.end():]
        out.append(x[last:mm.start()]); out.append(m); last = mm.end()
    out.append(x[last:])
    return ''.join(out), found


if __name__ == '__main__':
    files = [a for a in sys.argv[1:] if not a.startswith('--')]; total = 0; nf = 0
    for f in files:
        x = open(f, encoding='utf8').read(); y, found = fix(x)
        if found:
            nf += 1; total += len(found)
            if '--write' in sys.argv: open(f, 'w', encoding='utf8').write(y)
            if len(files) < 6: print(os.path.basename(f), found)
    print('%d files, %d notes' % (nf, total))
