#!/usr/bin/env python3
"""Make a simple piano MIDI from a hymn's sheet (app/src/main/assets/sheetMei/<id>.mei): the melody as written plus a
generated left hand in the style of hymnal.net's "Easy hymn style": in the measure where a chord starts the left hand plays
the low root + fifth; while the chord goes on in the next measures it plays the upper third + fifth (or third + seventh,
fourth + fifth for sus4) as a held dyad.
usage: make_midi.py <hymn.mei> <out.mid> [bpm=110]"""
import sys, re, xml.etree.ElementTree as ET
import pretty_midi
NS = '{http://www.music-encoding.org/ns/mei}'
STEP = {'c': 0, 'd': 2, 'e': 4, 'f': 5, 'g': 7, 'a': 9, 'b': 11}
SHARP_ORDER, FLAT_ORDER = 'fcgdaeb', 'beadgcf'
def strip(e):
    for x in e.iter(): x.tag = x.tag.split('}')[-1]
def keysig(t):
    m = re.match(r'(\d+)([sf])', t or '0')
    n, k = (int(m.group(1)), m.group(2)) if m else (0, 's')
    return {l: (1 if k == 's' else -1) for l in (SHARP_ORDER if k == 's' else FLAT_ORDER)[:n]}
ACC = {'s': 1, 'f': -1, 'n': 0, 'ss': 2, 'ff': -2}
def dur(e):
    d = 4.0 / int(e.get('dur')) if e.get('dur') else 0
    d *= sum(0.5 ** i for i in range(int(e.get('dots', 0)) + 1))
    return d
def parse_chord(s):
    m = re.match(r'([A-G])([#b♯♭]?)(.*?)(?:/([A-G][#b♯♭]?))?$', s.strip())
    if not m: return None
    root = STEP[m.group(1).lower()] + (1 if m.group(2) in '#♯' and m.group(2) else -1 if m.group(2) else 0)
    q = m.group(3)
    third = 3 if (q.startswith('m') and not q.startswith('maj')) or q.startswith('dim') else 4
    fifth = 6 if q.startswith('dim') else 8 if q.startswith('aug') else 7
    upper = (third, fifth)
    if 'sus' in q: upper = (5, 7)
    elif re.search(r'(?<!a)7|9', q) and 'maj' not in q: upper = (third, 10)
    elif 'maj7' in q or 'maj9' in q: upper = (third, 11)
    return root % 12, fifth, upper
def main(src, out, bpm=110):
    root = ET.parse(src).getroot(); strip(root)
    sd = root.find('.//scoreDef'); four4 = sd.get('meter.count') == '4' and sd.get('meter.unit') == '4'
    unit = int(sd.get('meter.unit', 4))
    ks = keysig(root.find('.//scoreDef').get('key.sig'))
    sp = 60.0 / bpm
    pm = pretty_midi.PrettyMIDI(initial_tempo=bpm)
    mel = pretty_midi.Instrument(program=0, name='melody'); lh = pretty_midi.Instrument(program=0, name='left hand')
    byid = {}; t = 0.0; open_ties = {}; chords = []   # chords: (start_beat, measure_index, name)
    beat = 0.0; mstarts = []
    for mi, m in enumerate(root.iter('measure')):
        acc = {}; mstarts.append(beat); pos = 0.0
        layer = m.find('staff/layer')
        def walk(parent, scale):
            nonlocal pos
            for e in parent:
                if e.tag in ('beam', 'tuplet', 'graceGrp'):
                    if e.tag == 'tuplet': walk(e, scale * int(e.get('numbase', 2)) / int(e.get('num', 3)))
                    else: walk(e, scale)
                elif e.tag in ('note', 'chord', 'rest', 'space'):
                    if e.get('grace'): continue
                    d = (dur(e) if e.get('dur') else 0) * scale
                    if e.tag == 'chord': d = dur(e) * scale
                    notes = [e] if e.tag == 'note' else (list(e.findall('note')) if e.tag == 'chord' else [])
                    for n in notes:
                        p = n.get('pname'); o = int(n.get('oct'))
                        key = (p, o)
                        a = n.get('accid') or n.get('accid.ges')
                        if n.get('accid'): acc[key] = ACC[n.get('accid')]
                        sem = acc.get(key, ks.get(p, 0))
                        pitch = 12 * (o + 1) + STEP[p] + sem
                        s = (beat + pos) * sp
                        tie = n.get('tie', '')
                        if key in open_ties and open_ties[key].end > s - 1e-6 and open_ties[key].pitch == pitch:
                            open_ties[key].end = s + d * sp * 0.98
                            if 't' not in tie and 'm' not in tie: del open_ties[key]
                            continue
                        nt = pretty_midi.Note(velocity=90, pitch=pitch, start=s, end=s + d * sp * 0.98)
                        mel.notes.append(nt); byid[n.get('{http://www.w3.org/XML/1998/namespace}id')] = nt
                        if 'i' in tie or 'm' in tie: open_ties[key] = nt
                    pos += d
        walk(layer, 1.0)
        mlen = pos
        for h in m.findall('harm'):
            chords.append(((beat + (float(h.get('tstamp', 1)) - 1) * 4.0 / unit), mi, ''.join(h.itertext()).strip()))
        beat += mlen
        # ties given as <tie startid endid> elements
    ids = {}
    # second pass for <tie> elements is not needed when the notes carry no tie attribute: merge same-pitch tie links
    xml_tie = [(x.get('startid')[1:], x.get('endid')[1:]) for x in root.iter('tie')]
    total = beat
    gone = set()
    for a, b in reversed(xml_tie):   # last link first, so a chain of ties (a-b, b-c) ends as one note
        na, nb = byid.get(a), byid.get(b)
        if na and nb and na.pitch == nb.pitch and id(nb) not in gone:
            na.end = nb.end; gone.add(id(nb))
    mel.notes = [n for n in mel.notes if id(n) not in gone]
    chords.sort()
    for i, (cb, mi, name) in enumerate(chords):
        cp = parse_chord(name)
        if not cp: continue
        r, fifth, upper = cp
        end = chords[i + 1][0] if i + 1 < len(chords) else total
        # per measure slice
        mm = mi
        b = cb
        first = True
        while b < end - 1e-6:
            mend = mstarts[mm + 1] if mm + 1 < len(mstarts) else total
            seg_end = min(end, mend)
            if first or (i > 0 and False):
                base = 36 + r if r >= 2 else 48 + r   # bass root between D2 and C3
                if r >= 2: base = 36 + r
                else: base = 36 + r + 12
                pitches = [base, base + fifth]
            else:
                x = 12 * 4 + r   # upper dyad near C4
                pitches = []
                for iv in upper:
                    p = 48 + r + iv
                    while p > 66: p -= 12
                    while p < 52: p += 12
                    pitches.append(p)
            up = []
            for iv in upper:
                p = 48 + r + iv
                while p > 66: p -= 12
                while p < 52: p += 12
                up.append(p)
            def put(ps, s0, e0, v=70):
                if e0 - s0 <= 1e-6: return
                for p in ps: lh.notes.append(pretty_midi.Note(velocity=v, pitch=p, start=s0 * sp, end=(s0 + (e0 - s0) * 0.98) * sp))
            if first and mm > 0 and seg_end - b >= 3.99 and four4:
                put(pitches, b, b + 3); put(up, b + 3, seg_end, 62)      # low root+fifth for three beats, upper dyad on beat 4
            else:
                put(pitches, b, seg_end)
            first = False; b = seg_end; mm += 1
    spans = []
    for i, (cb, mi, name) in enumerate(chords):
        cp = parse_chord(name)
        if cp: spans.append((cb, chords[i + 1][0] if i + 1 < len(chords) else total, cp))
    for n in list(mel.notes):
        nb, nd = n.start / sp, (n.end - n.start) / sp
        if nd < 1.99: continue
        cp = next((c for st, en, c in spans if st - 1e-6 <= nb < en), None)
        if not cp: continue
        r, fifth, upper = cp
        tones = {r % 12, (r + upper[0]) % 12, (r + fifth) % 12}
        if 'sus' in name: pass
        cand = [q for q in range(n.pitch - 9, n.pitch - 2) if q % 12 in tones]
        if cand:
            mel.notes.append(pretty_midi.Note(velocity=72, pitch=max(cand), start=n.start, end=n.end))
    pm.instruments += [mel, lh]
    pm.write(out)
    print(f'{len(mel.notes)} melody notes, {len(lh.notes)} left-hand notes, {total:.0f} beats, {total * sp:.0f} s')
if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2], float(sys.argv[3]) if len(sys.argv) > 3 else 110)
