#!/usr/bin/env python3
"""Makes our own sheet of an English hymn from its tune's MIDI file (route M of PLAN.md).

usage: python3 midi_to_sheet.py <hymn id> [--write] [--out DIR]

The new sheet keeps the header, the bars' lengths, the words and the other verses of the hymn's current sheet and takes the
notes and the chord symbols from the MIDI: the melody is the top voice, the chords are named from all four voices. A word
goes to the MIDI note that starts at the same time as its old note; a MIDI note with no old note is a further note of the
syllable before it (a slur). The tempo of the MIDI becomes midi.bpm. Nothing is written without --write (then the sheet replaces
app/src/main/assets/sheetMei/<id>.mei; with --out it is written there instead). Always prints what differs from the old
sheet, and refuses (exit 1) when the MIDI and the old sheet do not have the same number of melody notes, or a note
cannot be written as one (dotted) note value.

Checks done here: the melody equals the old sheet's pitch for pitch (differences are listed, the MIDI wins), every bar adds
up to the time signature, the key signature and time signature equal the MIDI's.
"""
import os, re, sys, sqlite3
HERE = os.path.dirname(os.path.abspath(__file__)); PROJ = os.path.dirname(HERE)
ROOT = os.path.abspath(os.path.join(PROJ, '..', '..'))
MEI = os.path.join(ROOT, 'app/src/main/assets/sheetMei')

# ---- MIDI ----
def read_midi(path):
    d = open(path, 'rb').read()
    import struct
    fmt, nt, div = struct.unpack('>HHH', d[8:14]); p = 14
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
                if ty == 0x51: tempos.append(round(60e6 / int.from_bytes(data, 'big')))
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
    return div, sorted(notes), (tempos or [0])[0], (ts or [(4, 4)])[0], (ks or [0])[0]

# ---- spelling ----
LETTERS = 'cdefgab'; NAT_PC = {'c': 0, 'd': 2, 'e': 4, 'f': 5, 'g': 7, 'a': 9, 'b': 11}
SHARP_ORDER = 'fcgdaeb'; FLAT_ORDER = 'beadgcf'

def key_alters(sig):
    m = re.match(r'(\d+)([sf]?)', sig or '0')
    n = int(m.group(1)); k = m.group(2)
    alt = {l: 0 for l in LETTERS}
    for l in (SHARP_ORDER[:n] if k == 's' else FLAT_ORDER[:n] if k == 'f' else ''): alt[l] = 1 if k == 's' else -1
    return alt, k or ''

def spell(midi, alt, kind):
    """-> (pname, oct, accid or None (written), accid.ges or None)."""
    pc = midi % 12; octv = midi // 12 - 1
    for l in LETTERS:                                   # a note of the key
        if (NAT_PC[l] + alt[l]) % 12 == pc:
            o = octv + (1 if NAT_PC[l] + alt[l] >= 12 else -1 if NAT_PC[l] + alt[l] < 0 else 0)
            return l, o, None, {1: 's', -1: 'f', 0: None}[alt[l]]
    for l in LETTERS:                                   # a natural note that the key alters
        if NAT_PC[l] == pc: return l, octv, 'n', None
    order = ('s', 'f') if kind != 'f' else ('f', 's')
    for acc in order:                                   # a sharp or flat of another note
        for l in LETTERS:
            if (NAT_PC[l] + (1 if acc == 's' else -1)) % 12 == pc:
                o = octv + (1 if NAT_PC[l] + (1 if acc == 's' else -1) >= 12 else -1 if NAT_PC[l] + (1 if acc == 's' else -1) < 0 else 0)
                return l, o, acc, None
    raise ValueError(midi)

DUR = {1: (16, 0), 2: (8, 0), 3: (8, 1), 4: (4, 0), 6: (4, 1), 8: (2, 0), 12: (2, 1), 16: (1, 0), 24: (1, 1)}   # sixteenths -> (dur, dots)

# ---- chords ----
QUAL = [('', (0, 4, 7)), ('m', (0, 3, 7)), ('7', (0, 4, 7, 10)), ('Maj7', (0, 4, 7, 11)), ('m7', (0, 3, 7, 10)), ('dim', (0, 3, 6)),
        ('m7♭5', (0, 3, 6, 10)), ('dim7', (0, 3, 6, 9)), ('aug', (0, 4, 8)), ('sus4', (0, 5, 7)), ('sus2', (0, 2, 7)),
        ('6', (0, 4, 7, 9)), ('m6', (0, 3, 7, 9)), ('add9', (0, 2, 4, 7)), ('mMaj7', (0, 3, 7, 11))]
SHARP_NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B']
FLAT_NAMES = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B']

def chord_name(pitches, kind, key_pc):
    names = FLAT_NAMES if kind == 'f' else SHARP_NAMES
    pcs = {p % 12 for p in pitches}; bass = min(pitches) % 12
    best = None
    for root in range(12):
        for qi, (q, ivs) in enumerate(QUAL):
            tones = {(root + i) % 12 for i in ivs}
            if bass not in tones: continue
            miss = len(tones - pcs); extra = len(pcs - tones)
            if miss > 1 or (miss == 1 and len(tones) < 4 and False): continue
            score = miss * 5 + extra * 4 + qi * .3 + (0 if bass == root else .8) + (5 if q in ('sus2', 'sus4', 'add9', '6', 'm6', 'mMaj7') else 0)   # a hymnal's chords are triads and sevenths; sus, add and 6th chords come from passing notes
            if miss == 1: score += 3
            if best is None or score < best[0]: best = (score, root, q)
    if best is None: return None
    _, root, q = best
    s = names[root] + q
    return s + ('' if bass == root else '/' + names[bass])

# ---- the old sheet ----
ELEM = re.compile(r'<note\b[^>]*?/>|<note\b[^>]*>.*?</note>|<rest\b[^>]*/>', re.S)
MEAS = re.compile(r'<measure\b[^>]*>.*?</measure>', re.S)

def attrs(tag):
    return dict(re.findall(r'([\w.:]+)="([^"]*)"', re.match(r'<\w+\b[^>]*', tag).group(0)))

def dur16(a):
    d = 16 // int(a['dur']); return d + (d // 2 if a.get('dots') == '1' else 0)

def read_old(xml):
    """-> bars: [(measure tag, [(onset16, length16, attrs, text)])] with onsets from the start of the sheet."""
    bars = []; t = 0
    for m in MEAS.finditer(xml):
        mh = re.match(r'<measure\b[^>]*>', m.group(0)).group(0); els = []
        for e in ELEM.finditer(m.group(0)):
            tag = e.group(0); a = attrs(tag); n = dur16(a)
            els.append((t, n, a, tag)); t += n
        bars.append((mh, els, sum(x[1] for x in els), m.group(0)))
    return bars

def beats16(o_n, o_d):
    return 6 if (o_d == 8 and o_n % 3 == 0 and o_n > 3) else 16 // o_d

def pieces(n, room):
    """split n sixteenths into writable values, none longer than room (ties)"""
    out = []
    while n > 0:
        for v in (24, 16, 12, 8, 6, 4, 3, 2, 1):
            if v <= n and v <= room: out.append(v); n -= v; break
        else: raise ValueError(n)
    return out

def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    if not args: print(__doc__); sys.exit(2)
    hid = args[0]; path = os.path.join(MEI, hid + '.mei')
    xml = open(path, encoding='utf8').read()
    db = sqlite3.connect(':memory:'); db.executescript(open(os.path.join(ROOT, 'sqlite/hymns.sql'), encoding='utf8').read())
    tune = db.execute('select lower(trim(tune)) from hymns where _id=?', (hid,)).fetchone()[0]
    div, notes, bpm, (tn, td), ks = read_midi(os.path.join(PROJ, 'midi', 'm%s.mid' % tune))
    sd = re.search(r'<scoreDef\b[^>]*>', xml).group(0)
    sig = re.search(r'key\.sig="([^"]*)"', sd).group(1); alt, kind = key_alters(sig)
    o_n, o_d = int(re.search(r'meter\.count="(\d+)"', sd).group(1)), int(re.search(r'meter\.unit="(\d+)"', sd).group(1))
    problems = []; info = []
    if (o_n, o_d) != (tn, td): problems.append('time signature: sheet %d/%d, MIDI %d/%d' % (o_n, o_d, tn, td))
    msig = ('%d%s' % (abs(ks), 's' if ks > 0 else 'f')) if ks else '0'
    if msig != sig: problems.append('key signature: sheet %s, MIDI %s' % (sig, msig))
    if re.search(r'rptstart|rptend|<ending|<repeat|<fermata', xml): problems.append('the old sheet has repeats, endings or fermatas (not handled yet)')
    q = div // 4
    events = {}
    for s_, e_, p_ in notes: events.setdefault(s_, []).append((e_, p_))
    onsets = sorted(events); sop = []
    for t in onsets:
        e, p = max(events[t], key=lambda x: x[1])
        if any(s_ < t < e_ and p_ >= p for s_, e_, p_ in notes): continue   # the soprano holds while a lower voice moves
        sop.append((t, e, p))
    for t, e, p in sop:
        if (e - t) % q or t % q: problems.append('a note off the sixteenth grid at tick %d' % t); break
    bars = read_old(xml)
    old_total = sum(b[2] for b in bars); midi_total = sop[-1][1] // q
    if midi_total != old_total: problems.append('length: sheet %d sixteenths, MIDI %d' % (old_total, midi_total))
    if problems: print(hid, '\n'.join(problems)); sys.exit(1)
    # which MIDI note takes which old note's words: the same onset
    by_onset = {t // q: i for i, (t, e, p) in enumerate(sop)}
    owner = {}; moved = []
    for bi, (mh, els, tot, txt) in enumerate(bars):
        for (t, n, a, tag) in els:
            if 'pname' not in a: continue
            i = by_onset.get(t)
            if i is None: moved.append('bar %d: an old note at %d has no MIDI note' % (bi + 1, t)); continue
            owner[i] = tag
            l, o, w, g = spell(sop[i][2], alt, kind)
            if (l, o) != (a['pname'], int(a['oct'])) or sop[i][1] - sop[i][0] != n * q:
                info.append('bar %d: sheet %s%s %d/16, MIDI %s%s %d/16' % (bi + 1, a['pname'], a['oct'], n, l, o, (sop[i][1] - sop[i][0]) // q))
    if moved: print(hid, '\n'.join(moved)); sys.exit(1)
    # the new bars
    bt = 0; idn = 0; body = []; slurs_all = []; extra_syl = 0
    beat = beats16(o_n, o_d)
    def harm_at(t0, t1):
        out = []; prev = None
        for t in onsets:
            if t < t0 or t >= t1: continue
            snd = [p for s_, e_, p in notes if s_ <= t < e_]
            name = chord_name(snd, kind, 0) or prev
            if name and name != prev:
                out.append((1 + (t - t0) / q / beat, name)); prev = name
        return out
    sop_by_start = {t // q: i for i, (t, e, p) in enumerate(sop)}
    last_voiced = None
    for bi, (mh, els, tot, txt) in enumerate(bars):
        b0, b1 = bt, bt + tot; bt = b1
        # notes of this bar: from the soprano, cut at the bar lines
        seq = []   # (start16, len16, midi pitch or None, source index, continues-from-previous-bar)
        cur = b0
        for i, (t, e, p) in enumerate(sop):
            s16, e16 = t // q, e // q
            if e16 <= b0 or s16 >= b1: continue
            if s16 > cur: seq.append((cur, s16 - cur, None, None, False))
            st = max(s16, b0); en = min(e16, b1)
            seq.append((st, en - st, p, i, s16 < b0)); cur = en
        if cur < b1: seq.append((cur, b1 - cur, None, None, False))
        items = []
        for st, n, p, i, cont in seq:
            parts = pieces(n, 24)
            # a bar-spanning note splits on the beat: do not rewrite lengths that are fine
            for k, v in enumerate(parts):
                items.append([st, v, p, i, cont or k > 0, k < len(parts) - 1 or (i is not None and sop[i][1] // q > st + n and st + n == b1)])
                st += v
        # fix up the ties: a note continues in the next piece of the same source
        xs = []
        for k, (st, v, p, i, cont, tie_next) in enumerate(items):
            idn += 1
            d, dots = DUR[v]
            xid = ('n%d' % idn) if p is not None else ('r%d' % idn)
            if p is None:
                xs.append(dict(xml='<rest xml:id="%s" dur="%d"%s/>' % (xid, d, ' dots="1"' if dots else ''), st=st, v=v, p=None, id=xid, i=i)); continue
            l, o, w, g = spell(p, alt, kind)
            at = 'xml:id="%s" dur="%d"%s pname="%s" oct="%d"%s%s' % (xid, d, ' dots="1"' if dots else '', l, o, (' accid="%s"' % w) if w else '', (' accid.ges="%s"' % g) if g else '')
            xs.append(dict(xml=None, at=at, st=st, v=v, p=p, id=xid, i=i, cont=cont, tie_next=tie_next))
        # words: the first piece of a MIDI note that has an old note gets its verse
        for x in xs:
            if x['p'] is None: continue
            tag = owner.get(x['i']) if not x['cont'] else None
            verse = ''
            if tag and '<verse' in tag: verse = re.search(r'<verse.*</verse>', tag, re.S).group(0)
            elif not x['cont']:
                # a note with no old note: it goes on with the syllable before
                slurs_all.append((last_voiced, x['id']))
            if verse: last_voiced = x['id']
            x['xml'] = '<note %s>%s</note>' % (x['at'], ('\n' + verse) if verse else '') if verse else '<note %s/>' % x['at']
        # ties between the pieces of one note
        ties = [(a['id'], b['id']) for a, b in zip(xs, xs[1:]) if a.get('p') is not None and a['i'] == b.get('i') and a['i'] is not None and b.get('cont')]
        # beams: runs of eighths and shorter inside a beat
        out = []; run = []
        def flush():
            nonlocal run
            if len(run) >= 2: out.append('<beam>\n' + '\n'.join(run) + '\n</beam>')
            else: out.extend(run)
            run = []
        bs = None
        for x in xs:
            is_short = x['p'] is not None and x['v'] < 4 and x['v'] not in (3,) or (x['p'] is not None and x['v'] == 3)
            short = x['p'] is not None and x['v'] <= 3
            if short and (not run or ((x['st'] - b0) // beat) == bs):
                run.append(x['xml']); bs = (x['st'] - b0) // beat
            else:
                flush()
                if short: run = [x['xml']]; bs = (x['st'] - b0) // beat
                else: out.append(x['xml'])
        flush()
        hh = ''.join('\n<harm staff="1" tstamp="%s" place="above">%s</harm>' % ('%g' % ts, nm) for ts, nm in harm_at(b0 * q, b1 * q))
        sl = ''.join('\n<tie startid="#%s" endid="#%s"/>' % ab for ab in ties)
        mh2 = mh
        if bi == len(bars) - 1 and 'right="end"' not in mh2: mh2 = mh2[:-1] + ' right="end">'
        body.append('%s<staff n="1"><layer n="1">\n%s\n</layer></staff>%s%s\n@@SLURS%d@@</measure>' % (mh2, '\n'.join(out), hh, sl, bi))
        if re.search(r'<sb/>', xml[xml.find(mh):][len(txt):len(txt) + 12]): body.append('<sb/>')
    # slurs: from the syllable's note to the notes after it, in the bar of the last one
    text = '\n'.join(body)
    first_of = {}
    for a, b in slurs_all: first_of.setdefault(b, a)
    chains = {}
    for a, b in slurs_all: chains.setdefault(a, []).append(b)
    def num(i): return int(i[1:])
    for a, bs_ in chains.items():
        end = bs_[-1]
        # the slur goes in the bar of its last note
        m = re.search(r'id="%s"' % end, text); pos = m.start()
        mark = re.search(r'@@SLURS\d+@@', text[pos:]).group(0)
        text = text.replace(mark, '<slur startid="#%s" endid="#%s"/>\n%s' % (a, end, mark), 1)
    text = re.sub(r'@@SLURS\d+@@', '', text)
    head = xml[:xml.index('<section>') + len('<section>')]; tail = xml[xml.index('</section>'):]
    head = re.sub(r'midi\.bpm="\d+"', 'midi.bpm="%d"' % bpm, head, count=1) if 'midi.bpm' in head else head.replace('<scoreDef ', '<scoreDef midi.bpm="%d" ' % bpm, 1)
    new = head + '\n' + text + '\n' + tail
    # the old words that found no note
    old_words = sum(1 for b in bars for e in b[1] if 'pname' in e[2] and '<syl' in e[3]); new_words = new.count('<syl')
    # (the other verses live in the back matter and stay as they were)
    new_words_front = len(re.findall(r'<syl', new[:new.index('</section>')]))
    if new_words_front != old_words: problems.append('syllables: sheet %d, new %d' % (old_words, new_words_front))
    print('%s: tune %s, %d notes (sheet %d), %d melisma notes, %d notes differ in pitch or length, tempo %d' % (hid, tune, len(sop), sum(1 for b in bars for e in b[1] if 'pname' in e[2]), len(slurs_all), len(info), bpm))
    for d in info: print('  ', d)
    for p in problems: print('  PROBLEM', p)
    if '--write' in sys.argv:
        out_path = path
        if '--out' in sys.argv: out_path = os.path.join(sys.argv[sys.argv.index('--out') + 1], hid + '.mei'); os.makedirs(os.path.dirname(out_path), exist_ok=True)
        open(out_path, 'w', encoding='utf8').write(new); print('written', out_path)
    sys.exit(1 if problems else 0)

main()
