#!/usr/bin/env python3
"""The second way to make our sheet of an English hymn from its tune's MIDI, for the hymns midi_to_sheet.py refuses (notes off the
grid, another time signature, another length, a note with no MIDI note): the old sheet keeps all its notes and words as they
are (its melody is the reference, so every word stays on its note); only the chords are new, named from the MIDI's four voices.

usage: python3 midi_align.py <hymn ids...> [--write] [--out DIR]

The MIDI's melody (its top voice) is lined up with the old sheet's melody note for note (an edit-distance alignment on pitch
classes, the MIDI moved to the sheet's key by the best of the semitone shifts; extra MIDI notes and old notes the MIDI does
not have are skipped), which gives a map from the sheet's time to the MIDI's. The chords of each bar are the chords of the MIDI's
voices where they change, put at the sheet's positions. The tempo of the MIDI becomes midi.bpm. The result tells how much of the
melody lined up exactly: a low figure means the hymn needs a look by hand.
"""
import os, re, sys, sqlite3
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import midi_to_sheet as M
THRESH = float(os.environ.get("THRESH", ".9"))   # how much of the melody must line up exactly

def soprano(notes, q=64):
    """the melody: the top sounding note at each onset. Voices of a played MIDI do not start together: onsets less than a third of a
    sixteenth apart are one onset (else a chord's later voices would look like melody notes)"""
    starts = sorted({s for s, e, p in notes}); at = {}; first = None
    for s in starts:
        if first is None or s - first > q / 3: first = s
        at[s] = first
    ev = {}
    for s, e, p in notes: ev.setdefault(at[s], []).append((e, p))
    sop = []
    for t in sorted(ev):
        e, p = max(ev[t], key=lambda x: x[1])
        if any(at[s_] < t < e_ and p_ >= p for s_, e_, p_ in notes): continue
        sop.append((t, e, p))
    return sop

def align(O, S):
    """O old pitch classes, S MIDI pitch classes -> (cost, pairs [(i, j)]) with free MIDI ends"""
    n, m = len(O), len(S); INF = 1e9
    GO, GM, SUB = 1.0, 0.5, 1.0
    dp = [[INF] * (m + 1) for _ in range(n + 1)]; bk = [[None] * (m + 1) for _ in range(n + 1)]
    for j in range(m + 1): dp[0][j] = 0
    for i in range(1, n + 1):
        Oi = O[i - 1]; prev = dp[i - 1]; cur = dp[i]
        for j in range(m + 1):
            best = prev[j] + GO; b = 1                         # an old note with no MIDI note
            if j:
                c = prev[j - 1] + (0 if Oi == S[j - 1] else SUB)
                if c < best: best, b = c, 0
                c = cur[j - 1] + GM                             # an extra MIDI note
                if c < best: best, b = c, 2
            cur[j] = best; bk[i][j] = b
    j = min(range(m + 1), key=lambda j: dp[n][j]); cost = dp[n][j]; i = n; pairs = []
    while i > 0:
        b = bk[i][j]
        if b == 0: pairs.append((i - 1, j - 1)); i -= 1; j -= 1
        elif b == 1: i -= 1
        else: j -= 1
    return cost, pairs[::-1]

def convert(hid, db, write, out_dir):
    path = os.path.join(M.MEI, hid + '.mei'); xml = open(path, encoding='utf8').read()
    tune = db.execute('select lower(trim(tune)) from hymns where _id=?', (hid,)).fetchone()[0]
    tune = dict(x.split('=') for x in os.environ.get('MIDI_TUNE', '').split(',') if x).get(hid, tune)   # MIDI_TUNE=E811=5365317521: the MIDI of another tune
    div, notes, bpm, ts, ks = M.read_midi(os.path.join(M.PROJ, 'midi', 'm%s.mid' % tune)); q = div // 4
    sd = re.search(r'<scoreDef\b[^>]*>', xml).group(0)
    sig = re.search(r'key\.sig="([^"]*)"', sd).group(1); alt, kind = M.key_alters(sig)
    unit = int(re.search(r'meter\.unit="(\d+)"', sd).group(1))
    bars = M.read_old(xml)
    def old_midi(a):
        acc = {'s': 1, 'f': -1, 'n': 0, 'ss': 2, 'ff': -2}; l = a['pname']
        al = acc[a['accid']] if a.get('accid') in acc else acc[a['accid.ges']] if a.get('accid.ges') in acc else alt[l]
        return (int(a['oct']) + 1) * 12 + M.NAT_PC[l] + al
    old = [(t, old_midi(a)) for b in bars for (t, n, a, tag) in b[1] if 'pname' in a]
    if len(old) < 4: print(hid, 'too few notes'); return 1
    sop = soprano(notes, q)
    S = [p % 12 for t, e, p in sop]
    # the shifts worth trying: by how well the pitch-class counts agree
    hist = lambda xs: [sum(1 for x in xs if x == k) for k in range(12)]
    ho, hs = hist([p % 12 for t, p in old]), hist(S)
    cands = sorted(range(-6, 7), key=lambda sh: -sum(ho[(k + sh) % 12] * hs[k] for k in range(12)))[:3]
    best = None
    for sh in cands:
        cost, pairs = align([(p % 12) for t, p in old], [(x + sh) % 12 for x in S])
        if best is None or cost < best[0]: best = (cost, pairs, sh)
    cost, pairs, sh = best
    exact = sum(1 for i, j in pairs if (old[i][1] % 12) == ((sop[j][2] + sh) % 12))
    ratio = exact / len(old)
    # the map from the sheet's time (sixteenths) to the MIDI's (ticks)
    anchors = [(old[i][0], sop[j][0]) for i, j in pairs if (old[i][1] % 12) == ((sop[j][2] + sh) % 12)]   # only the exact matches fix the time map
    if len(anchors) < 3: print(hid, 'PROBLEM too little of the melody lined up'); return 1
    def to_midi(t):
        a = anchors
        if t <= a[0][0]: return a[0][1] + (t - a[0][0]) * q
        if t >= a[-1][0]: return a[-1][1] + (t - a[-1][0]) * q
        lo, hi = 0, len(a) - 1
        while hi - lo > 1:
            mid = (lo + hi) // 2
            if a[mid][0] <= t: lo = mid
            else: hi = mid
        (t0, m0), (t1, m1) = a[lo], a[hi]
        return m0 + (t - t0) * (m1 - m0) / (t1 - t0) if t1 > t0 else m0
    def to_old(tm):
        a = anchors
        if tm <= a[0][1]: return a[0][0] + (tm - a[0][1]) / q
        if tm >= a[-1][1]: return a[-1][0] + (tm - a[-1][1]) / q
        lo, hi = 0, len(a) - 1
        while hi - lo > 1:
            mid = (lo + hi) // 2
            if a[mid][1] <= tm: lo = mid
            else: hi = mid
        (t0, m0), (t1, m1) = a[lo], a[hi]
        return t0 + (tm - m0) * (t1 - t0) / (m1 - m0) if m1 > m0 else t0
    beat16 = M.beats16(int(re.search(r'meter\.count="(\d+)"', sd).group(1)), unit)
    # the chords bar by bar
    chords = []; bt = 0; per = 16 / unit
    for bi, (mh, els, tot, txt) in enumerate(bars):
        b0, b1 = bt, bt + tot; bt = b1
        m0, m1 = to_midi(b0), to_midi(b1)
        # a chord for each beat of the bar, taken a little after the beat's start: the voices of a played MIDI do not start together
        pts = []; t_old = b0
        while t_old < b1:
            pts.append((t_old, to_midi(t_old) + q * float(os.environ.get('OFFSET', '0.4')))); t_old += beat16
        out = []; prev = None
        for t_old, tm in pts:
            snd = [p + sh for s, e, p in notes if s <= tm < e]
            name = M.chord_name(snd, kind, 0) if snd else None
            name = name or prev
            if name and name != prev:
                out.append(((t_old - b0) / per + 1, name)); prev = name
        chords.append(out)
    # the new sheet: the old measures with their chords replaced
    parts = []; pos = 0
    for k, mm in enumerate(M.MEAS.finditer(xml)):
        body = re.sub(r'\n?<harm\b[^>]*>[^<]*</harm>', '', mm.group(0))
        hh = ''.join('\n<harm staff="1" tstamp="%s" place="above">%s</harm>' % ('%g' % round(ts_, 3), nm) for ts_, nm in chords[k])
        body = body[:-len('</measure>')] + hh + '\n</measure>'
        parts.append(xml[pos:mm.start()] + body); pos = mm.end()
    new = ''.join(parts) + xml[pos:]
    if not 40 <= bpm <= 220:   # a tempo that cannot be right (a MIDI with an odd tempo event): the sheet's own stays
        m_ = re.search(r'midi\.bpm="(\d+)"', xml); bpm = int(m_.group(1)) if m_ else 100
    new = re.sub(r'midi\.bpm="\d+"', 'midi.bpm="%d"' % bpm, new, count=1) if 'midi.bpm' in new else new.replace('<scoreDef ', '<scoreDef midi.bpm="%d" ' % bpm, 1)
    flag = '' if ratio >= THRESH else '   LOOK'
    print('%s: tune %s, %d old notes, %.0f%% lined up exactly (%d MIDI notes, shift %+d), %d chords, tempo %d%s' % (hid, tune, len(old), ratio * 100, len(sop), sh, sum(len(c) for c in chords), bpm, flag))
    if write and ratio >= THRESH:
        out_path = os.path.join(out_dir, hid + '.mei') if out_dir else os.path.join(M.OUT_MEI, hid + '.mei')
        os.makedirs(os.path.dirname(out_path), exist_ok=True); open(out_path, 'w', encoding='utf8').write(new); print('written', out_path)
    return 0 if ratio >= THRESH else 1

def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]; out_dir = None
    if '--out' in sys.argv: out_dir = sys.argv[sys.argv.index('--out') + 1]; args = [a for a in args if a != out_dir]
    if not args: print(__doc__); sys.exit(2)
    db = sqlite3.connect(':memory:'); db.executescript(open(os.path.join(M.ROOT, 'sqlite/hymns.sql'), encoding='utf8').read())
    bad = 0
    for h in args:
        try: bad += convert(h, db, '--write' in sys.argv, out_dir)
        except Exception as e: print(h, 'ERROR', e); bad += 1
    sys.exit(1 if bad else 0)
if __name__ == '__main__': main()
