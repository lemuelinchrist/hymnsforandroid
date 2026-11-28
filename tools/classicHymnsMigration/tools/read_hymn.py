#!/usr/bin/env python3
"""Read a hymn for hand work: per bar, the sheet's melody and chords, and the MIDI's voices (top first) at every eighth, in the sheet's key.
The MIDI is laid on the sheet by time from its first note (fine for on-grid MIDIs that play the sheet once, as written); the top voice is
checked against the melody, and 'drift' says where the two stop agreeing (use show_hymn.py there). A note marked ' starts on that step.
usage: python3 tools/read_hymn.py <hymn> [step in quarters, default 0.5]"""
import os, re, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import midi_to_sheet as M
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..'))
h = sys.argv[1]; step = float(sys.argv[2]) if len(sys.argv) > 2 else 0.5
x = open(os.path.join(ROOT, 'app/src/main/assets/sheetMei/%s.mei' % h), encoding='utf8').read()
tune = None
for line in open(os.path.join(HERE, '..', 'STATUS.tsv'), encoding='utf8'):
    f = line.rstrip('\n').split('\t')
    if len(f) > 2 and h in f[2].split():
        m = re.search(r'MIDI of tune (\d+)', f[3] if len(f) > 3 else ''); tune = m.group(1) if m else f[0]
sd = re.search(r'<scoreDef\b[^>]*>', x).group(0); unit = int(re.search(r'meter\.unit="(\d+)"', sd).group(1))
sig = re.search(r'key\.sig="([^"]*)"', sd).group(1); alt, kind = M.key_alters(sig)
flats = sig.endswith('f') or sig == '0' and False
NAMES = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'G♭', 'G', 'A♭', 'A', 'B♭', 'B'] if sig.endswith('f') else ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B']
ACC = {'s': 1, 'f': -1, 'n': 0, 'ss': 2, 'ff': -2}
# the sheet: per bar its notes (onset in quarters from the sheet's start, midi pitch), chords, length
bars = []; t = 0.0
for m in re.findall(r'<measure\b.*?</measure>', x, re.S):
    pos = 0.0; fac = 1; notes = []
    for tok in re.finditer(r'<tuplet\b[^>]*>|</tuplet>|<(?:note|rest)\b[^>]*>', m):
        s = tok.group(0)
        if s.startswith('<tuplet'): a = dict(re.findall(r'([\w.]+)="([^"]*)"', s)); fac = int(a['numbase']) / int(a['num']); continue
        if s == '</tuplet>': fac = 1; continue
        a = dict(re.findall(r'([\w.]+)="([^"]*)"', s))
        if 'dur' not in a: continue
        d = 4 / int(a['dur']) * {None: 1, '1': 1.5, '2': 1.75}[a.get('dots')] * fac
        if s.startswith('<note') and 'pname' in a and not (a.get('tie') in ('m', 't')):
            al = ACC.get(a.get('accid'), ACC.get(a.get('accid.ges'), alt[a['pname']]))
            notes.append((t + pos, (int(a['oct']) + 1) * 12 + M.NAT_PC[a['pname']] + al, a['pname'] + {1: '♯', -1: '♭', 0: ''}.get(al, '')))
        pos += d
    hs = sorted((float(tt), c) for tt, c in re.findall(r'<harm\b[^>]*tstamp="([^"]*)"[^>]*>([^<]*)<', m))
    bars.append((t, pos, notes, hs)); t += pos
div, mnotes, bpm, ts, ks = M.read_midi(os.path.join(HERE, '..', 'midi', 'm%s.mid' % tune))
t0 = min(s for s, e, p in mnotes)
first = bars[0][2][0] if bars[0][2] else next(b[2][0] for b in bars if b[2])
top0 = max(p for s, e, p in mnotes if s == t0)
shift = ((first[1] - top0) % 12 + 6) % 12 - 6
at = lambda q: t0 + (q - first[0]) * div
print('%s: tune %s, MIDI shifted %+d to the sheet\'s key, %d bars, meter unit %d' % (h, tune, shift, len(bars), unit))
bad = 0
for bi, (b0, L, notes, hs) in enumerate(bars):
    mel = ' '.join('%s@%g' % (n[2], round((n[0] - b0) * unit / 4 + 1, 2)) for n in notes)
    miss = []
    for q, p, nm in notes:
        tm = at(q) + div * 0.05
        top = max([pp for s, e, pp in mnotes if s <= tm < e] or [-99]) + shift
        if top % 12 != p % 12: miss.append(nm)
    bad += bool(miss)
    print('\n%d | %s | SHEET: %s%s' % (bi + 1, mel, ' '.join('%s@%g' % (c, tt) for tt, c in hs), ('   !! top voice differs at ' + ' '.join(miss)) if miss else ''))
    q = 0.0; line = []
    while q < L - 1e-9:
        tm = at(b0 + q) + div * 0.25 * step
        snd = sorted({p for s, e, p in mnotes if s <= tm < e}, reverse=True)
        new = {p for s, e, p in mnotes if abs(s - at(b0 + q)) < div * 0.1}
        line.append('%g:%s' % (round(q * unit / 4 + 1, 2), '.'.join(NAMES[(p + shift) % 12] + ("'" if p in new else '') for p in snd)))
        q += step
    print('   ' + '  '.join(line))
print('\nbars where the top voice differs from the melody: %d of %d' % (bad, len(bars)))
