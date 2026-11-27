#!/usr/bin/env python3
"""Adds the chords that change on the "and" (half a beat after a beat; in 6/8, 9/8 and 12/8 on the 2nd and 3rd eighth of a beat) to sheets made by midi_align.py, which read the MIDI's
chord only on each beat (2026-11-27; the player plays chords off the beat since then).

usage: python3 add_offbeat.py <hymn ids...> [--write]      (no ids: every hymn of STATUS.tsv made by midi_align.py)

It reads the MIDI again every half beat (midi_align.py with SUB=2) and adds a half-beat chord to the sheet as it is now only
  - where the sheet has no chord at that place, and the sheet's chord just before it is the one the MIDI has there (so a bar
    that was changed by hand after the alignment is left alone), and
  - when it is a chord and not a passing note over the chord before it:
      - not a major seventh, sixth, ninth, suspended or added-note chord (a passing note or a suspension over a triad),
      - not a chord over a bass that is not one of its notes (E♭/F),
      - not the chord before with one note added on another root (C -> Am7/C: the A is a passing note),
      - not the chord before on the same root and bass in another shape (Dm7 -> Dm, Cm7 -> C7), except a triad that becomes its seventh (F -> F7),
      - not a chromatic chord spelled against its own bass (B/E♭ over an E♭ chord: passing notes).
After an added chord the sheet's chord comes back where the MIDI has it again (C - A♭/C - C), when that is on a beat with no
chord of its own in the sheet.
"""
import os, re, subprocess, sys, tempfile
HERE = os.path.dirname(os.path.abspath(__file__)); PROJ = os.path.dirname(HERE); ROOT = os.path.dirname(os.path.dirname(PROJ))
MEI = os.environ.get('MEI_OUT') or os.path.join(ROOT, 'app/src/main/assets/sheetMei')   # MEI_OUT: test on copies
MEAS = re.compile(r'<measure\b.*?</measure>', re.S)
HARM = re.compile(r'<harm\b[^>]*tstamp="([^"]*)"[^>]*>([^<]*)</harm>')
NAT = {'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11}
CH = re.compile(r'^([A-G])([♭♯]?)(.*?)(?:/([A-G])([♭♯]?))?$')

def parse(name):
    m = CH.match(name)
    if not m: return None
    acc = {'♭': -1, '♯': 1, '': 0}
    root = (NAT[m.group(1)] + acc[m.group(2)]) % 12; q = m.group(3)
    third = 3 if re.match(r'm(?!aj)', q) else 4
    tones = {root, (root + third) % 12, (root + (6 if q.startswith('dim') or q.startswith('°') else 8 if q.startswith('+') else 7)) % 12}
    if re.search(r'(?<!maj)7', q) and 'Maj' not in q: tones.add((root + 10) % 12)
    bass = (NAT[m.group(4)] + acc[m.group(5)]) % 12 if m.group(4) else root
    return {'root': root, 'letter': m.group(1), 'q': q, 'tones': tones, 'bass': bass, 'bletter': m.group(4)}

def scale(sig):
    """the pitch classes of the major key of a key.sig ("2f", "3s", "0")"""
    n = int(sig[:-1]) * (-1 if sig.endswith('f') else 1) if sig != '0' else 0
    tonic = (n * 7) % 12
    return {(tonic + i) % 12 for i in (0, 2, 4, 5, 7, 9, 11)}

def passing(new, prev, sig):
    a, b = parse(new), parse(prev) if prev else None
    if not a: return True
    if re.search(r'Maj|maj|6|9|add|sus', a['q']): return True   # a suspension or an added note over the chord
    if a['bass'] not in a['tones']: return True                  # a bass outside the chord (E♭/F): a passing bass
    if b and a['root'] != b['root'] and b['tones'] <= a['tones']: return True
    if b and a['root'] == b['root'] and a['bass'] == b['bass'] and not (a['q'] == '7' and b['q'] == ''): return True   # Dm7 -> Dm, Cm7 -> C7: no change
    if a['root'] not in scale(sig) and a['bletter'] and a['bass'] != a['root']:
        letters = 'CDEFGAB'
        if letters[(letters.index(a['letter']) + 2) % 7] != a['bletter'] and a['q'] != '7': return True
    return False

def bars_of(xml): return [[(float(t), c) for t, c in HARM.findall(m)] for m in MEAS.findall(xml)]

def at(chords_by_bar, bi, t):
    """the chord in effect at beat t of bar bi (carried over the bars)"""
    for k in range(bi, -1, -1):
        cs = [c for tt, c in chords_by_bar[k] if (k < bi or tt <= t + 1e-6)]
        if cs: return cs[-1]
    return None

def status():
    out = []
    for line in open(os.path.join(PROJ, 'STATUS.tsv'), encoding='utf8'):
        f = line.rstrip('\n').split('\t')
        if len(f) < 4 or 'midi_align' not in f[3]: continue
        m = re.search(r'from the MIDI of tune (\d+)', f[3])
        for h in f[2].split(): out.append((h, m.group(1) if m else None))
    return list(dict.fromkeys(out))

def main():
    write = '--write' in sys.argv; ids = [a for a in sys.argv[1:] if not a.startswith('--')]
    todo = [(h, None) for h in ids] if ids else status()
    tunes = dict(status())
    tmp = tempfile.mkdtemp(); total = 0; touched = 0
    for h, _ in todo:
        tune = tunes.get(h)
        sd = re.search(r'<scoreDef\b[^>]*>', open(os.path.join(MEI, h + '.mei'), encoding='utf8').read()).group(0)
        unit, count = int(re.search(r'meter\.unit="(\d+)"', sd).group(1)), int(re.search(r'meter\.count="(\d+)"', sd).group(1))
        # a beat of three eighths (6/8, 9/8, 12/8) is read on each eighth, the others on each half beat; tstamps count the meter's unit
        compound = unit == 8 and count % 3 == 0 and count > 3
        per_beat = 3 if compound else 1
        on_beat = lambda t: abs(t - round(t)) < 1e-6 and (round(t) - 1) % per_beat == 0
        env = dict(os.environ, SUB='3' if compound else '2', THRESH='0'); env.pop('DUMP', None)
        if tune: env['MIDI_TUNE'] = '%s=%s' % (h, tune)
        r = subprocess.run([sys.executable, os.path.join(HERE, 'midi_align.py'), h, '--write', '--out', tmp], env=env, capture_output=True, text=True)
        p = os.path.join(tmp, h + '.mei')
        if not os.path.exists(p): print(h, 'NO RUN', r.stdout.strip()[-200:]); continue
        cur_xml = open(os.path.join(MEI, h + '.mei'), encoding='utf8').read()
        sig = re.search(r'key\.sig="([^"]*)"', cur_xml).group(1)
        cur, mid = bars_of(cur_xml), bars_of(open(p, encoding='utf8').read())
        if len(cur) != len(mid): print(h, 'bars differ'); continue
        adds = [[] for _ in cur]
        for bi in range(len(cur)):
            here = {round(t, 3) for t, c in cur[bi]}
            for k, (t, c) in enumerate(mid[bi]):
                if on_beat(t) or round(t, 3) in here: continue
                before_mid = at(mid, bi, t - 0.25); before_cur = at(cur, bi, t)
                if c == before_cur or before_mid != before_cur: continue
                if passing(c, before_cur, sig): continue
                adds[bi].append((t, c))
                # the sheet's chord comes back where the MIDI goes back to it, on a beat with no chord in the sheet
                if k + 1 < len(mid[bi]):
                    t2, c2 = mid[bi][k + 1]
                    if on_beat(t2) and round(t2, 3) not in here and c2 == before_cur: adds[bi].append((t2, c2))
        n = sum(len(a) for a in adds)
        if not n: continue
        touched += 1; total += n
        print(h, ' '.join('b%d:%s' % (bi + 1, ','.join('%s@%g' % (c, t) for t, c in a)) for bi, a in enumerate(adds) if a))
        if write:
            parts = []; pos = 0
            for bi, mm in enumerate(MEAS.finditer(cur_xml)):
                body = mm.group(0)
                if adds[bi]:   # the new chords go in after the bar's own (which stay as they are)
                    body = body[:-len('</measure>')].rstrip('\n') + ''.join('\n<harm staff="1" tstamp="%g" place="above">%s</harm>' % (t, c) for t, c in adds[bi]) + '\n</measure>'
                parts.append(cur_xml[pos:mm.start()] + body); pos = mm.end()
            open(os.path.join(MEI, h + '.mei'), 'w', encoding='utf8').write(''.join(parts) + cur_xml[pos:])
    print('%d chords added in %d hymns' % (total, touched))

if __name__ == '__main__': main()
