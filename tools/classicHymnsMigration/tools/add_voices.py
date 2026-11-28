#!/usr/bin/env python3
"""Adds the MIDI's four voices to a sheet (2026-11-28, the three-level design in LESSONS.md section 6).

The sheet keeps its melody and words as they are (staff 1, layer 1: the soprano). The alto goes in as staff 1 layer 2, the tenor and
bass as staff 2 (bass clef), layers 1 and 2. The chords the sheet had move to <harm type="medium> (the Medium level: hand-made, or
what the converter gave: type="medium-auto" when it was not cleaned by hand, so Medium works it out with Simplify; hymns listed in hand_medium.txt are type="medium"), and new chords without a type are named from the four voices, as they sound: the Original level.

The MIDI is laid on the sheet by time from its first note, so only MIDIs on the sixteenth grid that play the sheet once as written are
taken (tools/read_hymn.py shows whether the top voice is the melody in every bar); tuplets, repeats and endings are refused.

usage: python3 tools/add_voices.py <hymn>... [--write]   (prints what it would do without --write)
"""
import os, re, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import midi_to_sheet as M

HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..'))
SHEETS = os.path.join(ROOT, 'app/src/main/assets/sheetMei')
HAND = set(open(os.path.join(HERE, '..', 'hand_medium.txt')).read().split()) if os.path.exists(os.path.join(HERE, '..', 'hand_medium.txt')) else set()
ACC = {'s': 1, 'f': -1, 'n': 0, 'ss': 2, 'ff': -2}


def tune_of(h):
    for line in open(os.path.join(HERE, '..', 'STATUS.tsv'), encoding='utf8'):
        f = line.rstrip('\n').split('\t')
        if len(f) > 2 and h in f[2].split():
            m = re.search(r'MIDI of tune (\d+)', f[3] if len(f) > 3 else '')
            return m.group(1) if m else f[0]
    return None


def sheet_bars(x, alt):
    """[(start16, len16, [(onset16, len16, midi pitch)])] of the melody, from the sheet's start"""
    bars = []; t = 0
    for m in re.findall(r'<measure\b.*?</measure>', x, re.S):
        pos = 0; notes = []
        layer1 = re.search(r'<layer\b[^>]*n="1"[^>]*>(.*?)</layer>', m, re.S)
        for tok in re.finditer(r'<(?:note|rest)\b[^>]*>', layer1.group(1) if layer1 else m):
            a = dict(re.findall(r'([\w.]+)="([^"]*)"', tok.group(0)))
            if 'dur' not in a: continue
            d = 16 // int(a['dur']); d += d // 2 if a.get('dots') == '1' else 0
            if tok.group(0).startswith('<note') and 'pname' in a:
                al = ACC.get(a.get('accid'), ACC.get(a.get('accid.ges'), alt[a['pname']]))
                notes.append((t + pos, d, (int(a['oct']) + 1) * 12 + M.NAT_PC[a['pname']] + al))
            pos += d
        bars.append((t, pos, notes)); t += pos
    return bars


def voices(bars, mnotes, div, shift, t0, first16):
    """the alto, tenor and bass as [(start16, len16, pitch)] each, by rank among the notes sounding at each moment"""
    q16 = div / 4
    ns = []
    for s, e, p in mnotes:
        a = round((s - t0) / q16) + first16; b = round((e - t0) / q16) + first16
        if b > a: ns.append((a, b, p + shift))
    end = bars[-1][0] + bars[-1][1]
    cuts = sorted({0, end} | {a for a, b, p in ns if 0 <= a < end} | {b for a, b, p in ns if 0 < b < end})
    mel = [(o, o + d, p) for b in bars for (o, d, p) in b[2]]
    out = {v: [] for v in 'ATB'}; prev = {'A': None, 'T': None, 'B': None}
    for i in range(len(cuts) - 1):
        c0, c1 = cuts[i], cuts[i + 1]
        snd = sorted({(p, k) for k, (a, b, p) in enumerate(ns) if a <= c0 < b}, reverse=True)
        sop = next((p for o, e, p in mel if o <= c0 < e), None)
        # the soprano is the sheet's melody: the MIDI's note for it (the top one, when it is the melody's pitch) is not a lower voice
        low = [x for x in snd]
        if low and sop is not None and low[0][0] % 12 == sop % 12: low = low[1:]
        if not low: continue
        if len(low) >= 3: pick = {'A': low[0], 'T': low[1] if len(low) == 3 else low[-2], 'B': low[-1]}
        elif len(low) == 2:   # one of alto and tenor doubles a note (a unison): the one whose last pitch is nearer
            hi, lo = low
            pt = prev['T'] if prev['T'] is not None else lo[0]
            pick = {'A': hi, 'T': hi if abs(pt - hi[0]) < abs(pt - lo[0]) else lo, 'B': lo}
        else:
            pick = {'A': low[0], 'T': low[0], 'B': low[0]}
        for v in 'ATB':
            p, k = pick[v]
            seg = out[v]
            if seg and seg[-1][1] == c0 and seg[-1][2] == p and seg[-1][3] == k: seg[-1][1] = c1
            else: seg.append([c0, c1, p, k])
            prev[v] = p
    return {v: [(a, b - a, p) for a, b, p, k in out[v]] for v in out}


def layer_xml(bar, seq, alt, kind, ids, staff_acc):
    """the notes of one voice in one bar; ties across pieces and into the next bar are marked with tie i/m/t"""
    b0, blen = bar[0], bar[1]
    items = []; cur = b0
    for (a, d, p) in seq:
        s, e = max(a, b0), min(a + d, b0 + blen)
        if e <= s: continue
        if s > cur: items.append((cur, s - cur, None, False, False))
        items.append((s, e - s, p, a < b0, a + d > b0 + blen)); cur = e
    if cur < b0 + blen: items.append((cur, b0 + blen - cur, None, False, False))
    xml = []
    for st, n, p, cont, more in items:
        parts = M.pieces(n, 24)
        for k, v in enumerate(parts):
            d, dots = M.DUR[v]; ids[0] += 1
            if p is None:
                xml.append('<rest xml:id="v%d" dur="%d"%s/>' % (ids[0], d, ' dots="1"' if dots else '')); st += v; continue
            l, o, w, g = M.spell(p, alt, kind)
            key = (l, o); sounding = {'s': 1, 'f': -1, 'n': 0}.get(w, {'s': 1, 'f': -1}.get(g, 0))
            want = staff_acc.get(key, alt[l])
            acc = ''
            if sounding != want: acc = ' accid="%s"' % {1: 's', -1: 'f', 0: 'n'}[sounding]; staff_acc[key] = sounding
            elif sounding: acc = ' accid.ges="%s"' % {1: 's', -1: 'f'}[sounding]
            tie = ''
            first, last = (k == 0 and not cont), (k == len(parts) - 1 and not more)
            if not (first and last): tie = ' tie="%s"' % ('i' if first else 't' if last else 'm')
            xml.append('<note xml:id="v%d" dur="%d"%s pname="%s" oct="%d"%s%s/>' % (ids[0], d, ' dots="1"' if dots else '', l, o, acc, tie))
            st += v
    return ''.join(xml)


def chords_of(bars, mel_by_bar, vs, kind, unit):
    """the chord names of the four voices where they change, on the eighth grid: [[(tstamp, name)] per bar]"""
    allv = [[(o, o + d, p) for (o, d, p) in mel_by_bar]] + [[(a, a + d, p) for a, d, p in vs[v]] for v in 'ATB']
    out = []; prev = None
    for (b0, blen, _) in bars:
        res = []
        onsets = sorted({a for seq in allv for a, e, p in seq if b0 <= a < b0 + blen and (a - b0) % 2 == 0} | {b0})
        for t in onsets:
            snd = [p for seq in allv for a, e, p in seq if a <= t < e]
            if len({p % 12 for p in snd}) < 2: continue
            name = M.chord_name(snd, kind, 0)
            if name and name != prev:
                res.append((1 + (t - b0) / (16 / unit), name)); prev = name
        out.append(res)
    return out


def convert(h, write):
    path = os.path.join(SHEETS, h + '.mei'); x = open(path, encoding='utf8').read()
    if re.search(r'<tuplet|rptstart|rptend|<ending', x): return '%s: refused (tuplets, repeats or endings)' % h
    if 'type="parts"' in x: return '%s: has its voices already' % h
    tune = tune_of(h)
    if not tune: return '%s: no tune in STATUS.tsv' % h
    sd = re.search(r'<scoreDef\b[^>]*>', x).group(0)
    unit = int(re.search(r'meter\.unit="(\d+)"', sd).group(1)); sig = re.search(r'key\.sig="([^"]*)"', sd).group(1)
    alt, kind = M.key_alters(sig)
    bars = sheet_bars(x, alt)
    div, mnotes, bpm, ts, ks = M.read_midi(os.path.join(HERE, '..', 'midi', 'm%s.mid' % tune))
    t0 = min(s for s, e, p in mnotes)
    first = next(n for b in bars for n in b[2])
    top0 = max(p for s, e, p in mnotes if s == t0)
    shift = first[2] - top0
    # the melody must be the MIDI's top voice everywhere
    q16 = div / 4
    def count(sh):
        n = 0
        for o, d, p in (n for b in bars for n in b[2]):
            tm = t0 + (o - first[0]) * q16 + q16 * 0.2
            top = max([pp for s, e, pp in mnotes if s <= tm < e] or [-99]) + sh
            if top != p and top % 12 != p % 12: n += 1   # (an octave apart is the same voice)
        return n
    # the first note may not be the melody's pitch (a pickup, a chord): the transposition with the fewest melody notes off
    shift = min(range(shift - 11, shift + 12), key=lambda sh: (count(sh), abs(sh - shift)))
    bad = count(shift)
    if bad > 2: return '%s: refused (%d melody notes are not the top voice of the MIDI)' % (h, bad)
    note = ', %d melody notes differ from the MIDI top' % bad if bad else ''
    hand = h in HAND
    vs = voices(bars, mnotes, div, shift, t0, first[0])
    # a MIDI that is a piano accompaniment (broken chords, sixteenths in the lower voices) or has one line only is no four-part setting:
    # the notes of the tenor and bass per melody note stay near 2 (a chorale), and almost none are sixteenths
    nmel = sum(len(b[2]) for b in bars); lower = vs['T'] + vs['B']
    ratio = len(lower) / max(nmel, 1); fast = sum(1 for a, d, p in lower if d <= 1) / max(len(lower), 1)
    if not 1.6 <= ratio <= 2.5 or fast > 0.25: return '%s: refused (the MIDI is not a four-part setting: %.1f lower notes per melody note, %d%% sixteenths)' % (h, ratio, fast * 100)
    original = chords_of(bars, [n for b in bars for n in b[2]], vs, kind, unit)
    # the new file
    ids = [0]; ms = list(re.finditer(r'<measure\b.*?</measure>', x, re.S)); pieces = []; last = 0
    for bi, mm in enumerate(ms):
        m = mm.group(0); bar = bars[bi]
        acc1, acc2 = {}, {}
        alto = layer_xml(bar, vs['A'], alt, kind, ids, acc1)
        ten = layer_xml(bar, vs['T'], alt, kind, ids, acc2); bas = layer_xml(bar, vs['B'], alt, kind, ids, dict())
        m = re.sub(r'(<staff n="1">.*?</layer>)', lambda g: g.group(1) + '\n<layer n="2">' + alto + '</layer>', m, count=1, flags=re.S)
        m = m.replace('</staff>', '</staff>\n<staff n="2"><layer n="1">' + ten + '</layer><layer n="2">' + bas + '</layer></staff>', 1)
        m = re.sub(r'<harm\b(?![^>]*type=)', '<harm type="%s"' % ('medium' if hand else 'medium-auto'), m)
        m = m.replace('</measure>', ''.join('<harm staff="1" tstamp="%g" place="above">%s</harm>\n' % (t, c) for t, c in original[bi]) + '</measure>')
        pieces.append(x[last:mm.start()]); pieces.append(m); last = mm.end()
    pieces.append(x[last:]); new = ''.join(pieces)
    new = new.replace('<staffGrp>', '<staffGrp symbol="brace" bar.thru="true">', 1)
    new = re.sub(r'(<staffDef n="1"[^>]*/>)', r'\1<staffDef n="2" lines="5" clef.shape="F" clef.line="4"/>', new, count=1)
    new = new.replace('</pubStmt>', '<identifier type="parts">SATB</identifier></pubStmt>', 1)
    n_orig = sum(len(c) for c in original); n_med = len(re.findall(r'<harm type="medium', new))
    if write: open(path, 'w', encoding='utf8').write(new)
    return '%s: tune %s, MIDI %+d, %d bars, voices A %d T %d B %d notes; chords: Original %d, Medium %d%s' % (
        h, tune, shift, len(bars), len(vs['A']), len(vs['T']), len(vs['B']), n_orig, n_med, note + (' (written)' if write else ''))


if __name__ == '__main__':
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    if not args: print(__doc__); sys.exit(2)
    for h in args: print(convert(h, '--write' in sys.argv))
