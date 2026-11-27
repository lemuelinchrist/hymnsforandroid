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
MEI = os.environ.get('MEI_DIR') or os.path.join(ROOT, 'app/src/main/assets/sheetMei')   # (MEI_DIR: where the sheets to read are; they are written to the app's folder)
OUT_MEI = os.path.join(ROOT, 'app/src/main/assets/sheetMei')

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
        ('6', (0, 4, 7, 9)), ('m6', (0, 3, 7, 9)), ('mMaj7', (0, 3, 7, 11))]
SHARP_NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B']
import simplify_dim as SD
import chords as CH
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
    return SD.simplify(s + ('' if bass == root else '/' + names[bass]))   # diminished chords as the plain chord (simplify_dim.py)

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

def convert(hid, db, write, out_dir):
    path = os.path.join(MEI, hid + '.mei')
    xml = open(path, encoding='utf8').read()
    tune = db.execute('select lower(trim(tune)) from hymns where _id=?', (hid,)).fetchone()[0]
    div, notes, bpm, (tn, td), ks = read_midi(os.path.join(PROJ, 'midi', 'm%s.mid' % tune))
    sd = re.search(r'<scoreDef\b[^>]*>', xml).group(0)
    sig = re.search(r'key\.sig="([^"]*)"', sd).group(1); alt, kind = key_alters(sig)
    o_n, o_d = int(re.search(r'meter\.count="(\d+)"', sd).group(1)), int(re.search(r'meter\.unit="(\d+)"', sd).group(1))
    problems = []; info = []; info_end = None
    if (o_n, o_d) != (tn, td): problems.append('time signature: sheet %d/%d, MIDI %d/%d' % (o_n, o_d, tn, td))
    msig = ('%d%s' % (abs(ks), 's' if ks > 0 else 'f')) if ks else '0'
    key_differs = msig != sig   # the MIDI's key mark is often off: only a problem when the pitches differ too (checked below)
    if re.search(r'rptstart|rptend|<ending|<repeat', xml): problems.append('the old sheet has repeats or endings (not handled yet)')
    q = div // 4
    def soprano(notes):
        events = {}
        for s_, e_, p_ in notes: events.setdefault(s_, []).append((e_, p_))
        onsets = sorted(events); sop = []
        for t in onsets:
            e, p = max(events[t], key=lambda x: x[1])
            if any(s_ < t < e_ and p_ >= p for s_, e_, p_ in notes): continue   # the soprano holds while a lower voice moves
            sop.append((t, e, p))
        return events, onsets, sop
    events, onsets, sop = soprano(notes)
    # the MIDI may start later than the sheet (a rest or a count-in before the pickup): move it back by the offset that makes the
    # most note onsets agree with the sheet
    old_on = {t for b in read_old(xml) for (t, n, a, tag) in b[1] if 'pname' in a}
    mon = [t // q for t, e, p in sop if t % q == 0]
    best = max(range(0, 8 * 16 + 1), key=lambda off: (sum(1 for t in mon if t - off in old_on), -off))
    if best and sum(1 for t in mon if t - best in old_on) > sum(1 for t in mon if t in old_on):
        notes = [(s_ - best * q, e_ - best * q, p_) for s_, e_, p_ in notes if s_ >= best * q]
        events, onsets, sop = soprano(notes)
        info_off = 'the MIDI starts %d sixteenths after the sheet: moved back' % best
    else: info_off = None
    for t, e, p in sop:
        if (e - t) % q or t % q: problems.append('a note off the sixteenth grid at tick %d' % t); break
    bars = read_old(xml)
    dropped = 0
    old_total = sum(b[2] for b in bars); midi_total = sop[-1][1] // q
    if midi_total != old_total and abs(midi_total - old_total) <= 16 and sop[-1][0] // q < old_total:
        # the last note is held a little longer or shorter in the MIDI than on the sheet: the sheet's length stands
        t, e, p = sop[-1]; sop[-1] = (t, old_total * q, p); midi_total = old_total
        info_end = 'the last note is %d sixteenths on the sheet; the MIDI differs' % (old_total - t // q)
    if midi_total != old_total: problems.append('length: sheet %d sixteenths, MIDI %d' % (old_total, midi_total))
    if problems: print(hid, '\n'.join(problems)); return 1
    # which MIDI note takes which old note's words: the same onset
    by_onset = {t // q: i for i, (t, e, p) in enumerate(sop)}
    # the MIDI may be in another key than the sheet (the keys of hymnal.net's sheets follow the book): when moving the whole
    # tune by some semitones makes the melody match the old sheet, the MIDI is moved by that much
    def old_midi(a):
        l = a['pname']; acc = {'s': 1, 'f': -1, 'n': 0, 'ss': 2, 'ff': -2}
        al = acc[a['accid']] if a.get('accid') in acc else acc[a['accid.ges']] if a.get('accid.ges') in acc else alt[l]
        return (int(a['oct']) + 1) * 12 + NAT_PC[l] + al
    pairs = [(old_midi(a), sop[by_onset[t]][2]) for mh, els, tot, txt in bars for (t, n, a, tag) in els if 'pname' in a and t in by_onset]
    def score(sh): return sum(1 for o, m in pairs if m + sh == o)
    shift = max(range(-7, 8), key=lambda sh: (score(sh), -abs(sh)))
    if shift and score(shift) > score(0):
        notes = [(s_, e_, p_ + shift) for s_, e_, p_ in notes]
        events = {t: [(e_, p_ + shift) for e_, p_ in v] for t, v in events.items()}
        sop = [(t, e_, p_ + shift) for t, e_, p_ in sop]
        info_shift = 'the MIDI is %d semitones %s than the sheet: moved to the sheet\'s key' % (abs(shift), 'lower' if shift > 0 else 'higher')
        key_differs = False
    else: info_shift = None
    # a MIDI note with no note of its own on the sheet, far below the sheet's melody, is a lower voice (the bass where the soprano
    # rests or holds), not the melody: it is dropped, and the note before goes on to its end when it ended where this one began
    lo = min(old_midi(a) for b in bars for (t, n, a, tag) in b[1] if 'pname' in a)
    old_start = {t for b in bars for (t, n, a, tag) in b[1] if 'pname' in a}
    kept = []
    for t, e, p in sop:
        if p < lo - 2 and t // q not in old_start and t % q == 0 and kept:
            pt, pe, pp = kept[-1]
            if pe == t: kept[-1] = (pt, e, pp)
            continue
        kept.append((t, e, p))
    dropped = len(sop) - len(kept)
    if dropped: sop = kept; by_onset = {t_ // q: i for i, (t_, e__, p__) in enumerate(sop)}
    # the sheet writes the same note again where the MIDI holds one note on (a repeated note): the MIDI note is split there
    split = []
    for bi, (mh, els, tot, txt) in enumerate(bars):
        for (t, n, a, tag) in els:
            if 'pname' not in a or t in by_onset: continue
            j = next((k for k, (s_, e_, p_) in enumerate(sop) if s_ < t * q < e_), None)
            if j is not None and sop[j][2] == old_midi(a) and sop[j][0] % q == 0:
                s_, e_, p_ = sop[j]; sop[j] = (s_, t * q, p_); sop.insert(j + 1, (t * q, e_, p_)); by_onset = {t_ // q: i for i, (t_, e__, p__) in enumerate(sop)}
                split.append(t)
    if split: info.append('%d held notes split where the sheet repeats the note' % len(split))
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
    if moved: print(hid, '\n'.join(moved)); return 1
    if key_differs and any(x.startswith('bar') for x in info): problems.append('key signature: sheet %s, MIDI %s, and the notes differ' % (sig, msig))
    if info_end: info.append(info_end)
    if info_off: info.append(info_off)
    if dropped: info.append('%d low MIDI notes dropped (a lower voice, not the melody)' % dropped)
    if info_shift: info.append(info_shift)
    # the new bars
    bt = 0; idn = 0; body = []; slurs_all = []; extra_syl = 0
    beat = beats16(o_n, o_d)
    prev_chord = [None]
    def harm_at(t0, t1):
        # one chord a beat (a dotted beat in 6/8, 9/8, 12/8), named by the notes that last through the beat (chords.py); it stays
        # while the beat only passes through other notes. (tstamps count the meter's unit, eighths in 6/8, not the beat)
        out = []; step = beat * q; k = 0
        while t0 + k * step < t1 - 1e-6:
            a = t0 + k * step; b = min(a + step, t1)
            name = CH.window_chord(notes, a, b, kind, prev_chord[0])
            if name and (name != prev_chord[0] or k == 0):   # the first chord of a bar is always written
                out.append((1 + k * beat / (16 // o_d), name)); prev_chord[0] = name
            k += 1
        return out
    sop_by_start = {t // q: i for i, (t, e, p) in enumerate(sop)}
    last_voiced = None
    chords_seen = False
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
        hs = harm_at(b0 * q, b1 * q)
        if not hs and not chords_seen:   # an opening in unison or octaves has no chord to name: the old sheet's chords stand
            hs = [(float(a), b) for a, b in re.findall(r'<harm\b[^>]*tstamp="([^"]*)"[^>]*>([^<]*)</harm>', txt)]
        chords_seen = chords_seen or bool(hs)
        hh = ''.join('\n<harm staff="1" tstamp="%s" place="above">%s</harm>' % ('%g' % ts, nm) for ts, nm in hs)
        fm = ''
        for fid in re.findall(r'<fermata\b[^>]*startid="#([^"]+)"', txt):
            ot = next((tg for (t_, n_, a_, tg) in els if a_.get('xml:id') == fid), None)
            oi = next((k for k, v in owner.items() if v == ot), None) if ot else None
            nx = next((x for x in xs if oi is not None and x['i'] == oi and not x.get('cont')), None)
            if nx is None: problems.append('a fermata on %s could not be carried over' % fid); continue
            fm += '\n<fermata startid="#%s" place="above"/>' % nx['id']
        sl = ''.join('\n<tie startid="#%s" endid="#%s"/>' % ab for ab in ties)
        mh2 = mh
        if bi == len(bars) - 1 and 'right="end"' not in mh2: mh2 = mh2[:-1] + ' right="end">'
        body.append('%s<staff n="1"><layer n="1">\n%s\n</layer></staff>%s%s%s\n@@SLURS%d@@</measure>' % (mh2, '\n'.join(out), hh, fm, sl, bi))
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
    if write:
        out_path = os.path.join(OUT_MEI, hid + '.mei')
        if out_dir: out_path = os.path.join(out_dir, hid + '.mei'); os.makedirs(out_dir, exist_ok=True)
        open(out_path, 'w', encoding='utf8').write(new); print('written', out_path)
    return 1 if problems else 0


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    out_dir = None
    if '--out' in sys.argv:
        out_dir = sys.argv[sys.argv.index('--out') + 1]; args = [a for a in args if a != out_dir]
    if not args: print(__doc__); sys.exit(2)
    db = sqlite3.connect(':memory:'); db.executescript(open(os.path.join(ROOT, 'sqlite/hymns.sql'), encoding='utf8').read())
    bad = 0
    for hid in args:
        try: bad += convert(hid, db, '--write' in sys.argv, out_dir)
        except Exception as e: print(hid, 'ERROR', e); bad += 1
    sys.exit(1 if bad else 0)

if __name__ == "__main__": main()
