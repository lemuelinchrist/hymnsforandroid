#!/usr/bin/env python3
"""Rank our English sheets by chord noise, to pick the next ones to clean by hand (LESSONS.md section 5).
score per bar = (2 x sus/Maj7/add/6/9 chords + 2 x misspelled slash basses + flickers) / bars; a flicker is a chord with chords half a beat
before and after it. A high score is a hint, not a verdict: E702's comes from real half-beat chords and it sounds good.
usage: python3 tools/noise_score.py [N]   (prints the N noisiest, one hymn per tune; default 25)"""
import glob, os, re, statistics, sys
ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '..'))
NAT = {'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11}; L = 'CDEFGAB'; ACC = {'♭': -1, '♯': 1, '': 0}
fam = {}
for line in open(os.path.join(ROOT, 'tools/classicHymnsMigration/STATUS.tsv'), encoding='utf8'):
    f = line.rstrip('\n').split('\t')
    if len(f) > 2:
        for h in f[2].split(): fam[h] = f[0]
rows = []
for p in glob.glob(os.path.join(ROOT, 'app/src/main/assets/sheetMei/E*.mei')):
    x = open(p, encoding='utf8').read()
    if 'Hymns For Android' not in x: continue
    h = os.path.basename(p)[:-4]; ms = re.findall(r'<measure\b.*?</measure>', x, re.S)
    sus = spell = flick = total = 0
    for m in ms:
        hs = sorted((float(t), c) for t, c in re.findall(r'<harm\b[^>]*tstamp="([^"]*)"[^>]*>([^<]*)<', m)); total += len(hs)
        for i, (t, c) in enumerate(hs):
            if re.search(r'sus|Maj|maj|add|6|9', c): sus += 1
            mm = re.match(r'^([A-G])([♭♯]?)(.*?)/([A-G])([♭♯]?)$', c)
            if mm:
                iv = ((NAT[mm[4]] + ACC[mm[5]]) - (NAT[mm[1]] + ACC[mm[2]])) % 12; want = {3: 2, 4: 2, 7: 4, 10: 6}.get(iv)
                if want and L[(L.index(mm[1]) + want) % 7] != mm[4]: spell += 1
            if 0 < i < len(hs) - 1 and hs[i + 1][0] - t <= 0.5 + 1e-6 and t - hs[i - 1][0] <= 0.5 + 1e-6: flick += 1
    rows.append((round((2 * sus + 2 * spell + flick) / max(1, len(ms)), 2), h, len(ms), sus, spell, flick, round(total / max(1, len(ms)), 1)))
rows.sort(reverse=True)
n = int(sys.argv[1]) if len(sys.argv) > 1 else 25; seen = set(); out = 0
print('score hymn bars sus/maj7/add misspelled flicker chords-per-bar  (tune-mates)')
for r in rows:
    t = fam.get(r[1], r[1])
    if t in seen: continue
    seen.add(t); mates = [k for k, v in fam.items() if v == t and k != r[1]]
    print(*r, ' '.join(mates)); out += 1
    if out >= n: break
print('median score', statistics.median(r[0] for r in rows), '| hymns over 1.0:', sum(1 for r in rows if r[0] > 1.0), '| over 1.5:', sum(1 for r in rows if r[0] > 1.5))
