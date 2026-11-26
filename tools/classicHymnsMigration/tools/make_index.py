#!/usr/bin/env python3
"""Writes INDEX.tsv: one row per English tune that has a MIDI (the work unit of classicHymnsMigration), with what a
converter has to cope with. Reads sqlite/hymns.sql (built in memory), ../midi and the sheets in
app/src/main/assets/sheetMei. Re-run it any time; it never touches STATUS.tsv. Usage: python3 make_index.py [--copy]
(--copy is no longer needed: the files are in ../midi.)"""
import collections, os, re, shutil, sqlite3, struct, sys
HERE = os.path.dirname(os.path.abspath(__file__)); PROJ = os.path.dirname(HERE)
ROOT = os.path.abspath(os.path.join(PROJ, '..', '..'))
RAW = os.path.join(PROJ, 'midi')   # the tunes' MIDI files (no longer in the app since 2026-11-26)
MEI = os.path.join(ROOT, 'app/src/main/assets/sheetMei')

def parse(path):
    d = open(path, 'rb').read(); fmt, nt, div = struct.unpack('>HHH', d[8:14]); p = 14
    def vl(p):
        v = 0
        while True:
            b = d[p]; p += 1; v = (v << 7) | (b & 127)
            if not b & 128: return v, p
    notes, tempos, ts, ks = [], [], [], []
    for _ in range(nt):
        L = struct.unpack('>I', d[p + 4:p + 8])[0]; p += 8; end = p + L; tick = 0; rs = None; op = {}
        while p < end:
            dt, p = vl(p); tick += dt; b = d[p]
            if b == 0xFF:
                ty = d[p + 1]; l, q = vl(p + 2); data = d[q:q + l]; p = q + l
                if ty == 0x51: tempos.append((tick, round(60e6 / int.from_bytes(data, 'big'))))
                elif ty == 0x58: ts.append((data[0], 2 ** data[1]))
                elif ty == 0x59: ks.append(struct.unpack('b', data[:1])[0])
            elif b in (0xF0, 0xF7): l, q = vl(p + 1); p = q + l
            else:
                if b & 128: rs = b; p += 1
                st = rs & 0xF0
                if st in (0xC0, 0xD0): p += 1
                else:
                    a, c = d[p], d[p + 1]; p += 2
                    if st == 0x90 and c > 0: op[(rs & 15, a)] = tick
                    elif st == 0x80 or (st == 0x90 and c == 0):
                        s = op.pop((rs & 15, a), None)
                        if s is not None: notes.append((s, tick, a))
    return div, sorted(notes), tempos, ts, ks

def main():
    import subprocess
    db = sqlite3.connect(':memory:'); db.executescript(open(os.path.join(ROOT, 'sqlite/hymns.sql'), encoding='utf8').read())
    raw = {f[1:-4].lower(): f for f in os.listdir(RAW) if f.endswith('.mid')}
    tune_of = {}; hymns = collections.defaultdict(list); books = collections.Counter()
    for i, g, t, k, tm in db.execute("select _id, hymn_group, lower(trim(tune)), key, time from hymns where trim(ifnull(tune,'')) not in ('','0')"):
        if t in raw: books[t] += 1
        if g == 'E' and t in raw: hymns[t].append((i, k, tm))
    rows = []
    for t in sorted(hymns, key=lambda t: (-len(hymns[t]), t)):
        div, notes, tempos, ts, ks = parse(os.path.join(RAW, raw[t]))
        bpm = tempos[0][1] if tempos else 0; num, den = ts[0] if ts else (4, 4)
        bar = div * 4 * num // den; end = max(e for s, e, p in notes)
        off = sum(1 for s, e, p in notes if s % (div // 4)) / len(notes)
        ev = sorted([(s, 1) for s, e, p in notes] + [(e, -1) for s, e, p in notes], key=lambda x: (x[0], x[1])); cur = mx = 0
        for _, v in ev: cur += v; mx = max(mx, cur)
        dips = len({b for _, b in tempos}) - 1
        first = sorted(hymns[t], key=lambda h: int(re.sub(r'\D', '', h[0]) or 0))[0][0]
        sheet = os.path.join(MEI, first + '.mei'); src = ''
        if os.path.exists(sheet):
            h = open(sheet, encoding='utf8').read(1500); src = 'ours' if 'type="source">Hymns For Android<' in h else 'hymnal.net'
        hard = [x for x in (('off-grid %d%%' % round(off * 100)) if off > .05 else '', 'voices %d' % mx if mx > 4 else '',
                            'tempo dips' if dips else '', 'monophonic' if mx == 1 else '') if x]
        rows.append((t, raw[t], ' '.join(h[0] for h in sorted(hymns[t], key=lambda h: int(re.sub(r'\D', '', h[0]) or 0))), len(hymns[t]), books[t],
                     hymns[t][0][1] or '', '%d/%d' % (num, den), round(end / bar, 1), bpm, mx, '%d%%' % round(off * 100), dips, src, '; '.join(hard)))
    with open(os.path.join(PROJ, 'INDEX.tsv'), 'w', encoding='utf8') as f:
        f.write('tune\tfile\tE hymns\tn E\tn all books\tkey\ttime\tmidi bars\tbpm\tmax voices\toff 16th grid\ttempo dips\tcurrent E sheet\tneeds care\n')
        for r in rows: f.write('\t'.join(str(x) for x in r) + '\n')
    print(len(rows), 'tunes;', sum(r[3] for r in rows), 'English hymns')
main()
