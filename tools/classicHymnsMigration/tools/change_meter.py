#!/usr/bin/env python3
"""Writes a change of meter into a sheet: a <scoreDef meter.count meter.unit/> before the first bar of the stretch, another one that
puts the old meter back after its last bar (when it does not run to the end). The chords' tstamp count the meter's unit, so those of the bars
in the stretch are converted when the unit changes (6/8 -> 4/4: tstamp 4 of eighths is 2.5 of quarters).

usage: python3 tools/change_meter.py <hymn> <from bar> <to bar|end> <count>/<unit> [--write]
"""
import os, re, sys
HERE = os.path.dirname(os.path.abspath(__file__)); SHEETS = os.path.join(HERE, '..', '..', '..', 'app/src/main/assets/sheetMei')


def change(x, b0, b1, count, unit):
    sd = re.search(r'<scoreDef\b[^>]*>', x).group(0)
    old_c = re.search(r'meter\.count="(\d+)"', sd).group(1); old_u = int(re.search(r'meter\.unit="(\d+)"', sd).group(1))
    ms = list(re.finditer(r'<measure\b.*?</measure>', x, re.S)); b1 = len(ms) if b1 == 'end' else int(b1)
    out = []; last = 0
    for i, mm in enumerate(ms, 1):
        m = mm.group(0); pre = ''
        if b0 <= i <= b1 and unit != old_u:
            f = unit / old_u
            m = re.sub(r'(<harm\b[^>]*?tstamp=")([\d.]+)(")', lambda g: g.group(1) + ('%g' % round(1 + (float(g.group(2)) - 1) * f, 4)) + g.group(3), m)
        if i == b0: pre = '<scoreDef meter.count="%d" meter.unit="%d"/>\n' % (count, unit)
        if i == b1 + 1: pre = '<scoreDef meter.count="%s" meter.unit="%d"/>\n' % (old_c, old_u)
        out.append(x[last:mm.start()]); out.append(pre + m); last = mm.end()
    out.append(x[last:])
    return ''.join(out)


if __name__ == '__main__':
    a = [v for v in sys.argv[1:] if not v.startswith('--')]
    h, b0, b1, ts = a; c, u = ts.split('/')
    p = os.path.join(SHEETS, h + '.mei'); x = open(p, encoding='utf8').read(); y = change(x, int(b0), b1, int(c), int(u))
    if '--write' in sys.argv: open(p, 'w', encoding='utf8').write(y)
    print(h, 'bars %s-%s in %s/%s' % (b0, b1, c, u), '(written)' if '--write' in sys.argv else '')
