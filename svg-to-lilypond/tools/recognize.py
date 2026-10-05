"""Recognize music from a parsed hymnal.net SVG (see DESIGN.md §4) and produce the IR (§7).

usage: python3 tools/recognize.py path/to/file.svg   -> prints IR as JSON
"""
import json
import os
import re
import sys
from fractions import Fraction

sys.path.insert(0, os.path.dirname(__file__))
from svgscan import parse, staves  # noqa: E402

HERE = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
GLYPHS = {k: v['name'] for k, v in json.load(open(os.path.join(HERE, 'data/glyph_names.json'))).items()}

LETTERS = 'CDEFGAB'
FLAT_ORDER = 'BEADGCF'
SHARP_ORDER = 'FCGDAEB'
MAJOR_BY_FLATS = ['C', 'F', 'B-', 'E-', 'A-', 'D-', 'G-', 'C-']
MAJOR_BY_SHARPS = ['C', 'G', 'D', 'A', 'E', 'B', 'F+', 'C+']
HEAD_W = 1.18          # notehead width in staff spaces
CHORD_SCALE = 0.0032   # accidentals inside chord names
STAFF_SCALE = 0.0040


_FONTS = {}


def text_width(text, size, bold=False):
    """Width in staff spaces of `text` in the serif lyric font (C059 stands in for Century Schoolbook L)."""
    from PIL import ImageFont
    path = '/usr/share/fonts/opentype/urw-base35/C059-%s.otf' % ('Bold' if bold else 'Roman')
    f = _FONTS.get(path)
    if f is None:
        f = _FONTS[path] = ImageFont.truetype(path, 1000)
    return f.getlength(text) / 1000.0 * size


class RecognitionError(Exception):
    pass


def gname(gid):
    return GLYPHS.get(gid, 'UNKNOWN')


# ---------------------------------------------------------------- pitch helpers
def staff_step(y, top):
    """Diatonic steps above E4 (bottom line) for a notehead centre at y."""
    return round((top + 4 - y) / 0.5)


def step_to_pitch(step):
    d = step + 2                       # C-based diatonic number, E4 -> 2 (+ 7*4 octave offset below)
    octave = 4 + d // 7
    return LETTERS[d % 7], octave


def ly_pitch(letter, alter, octave):
    name = letter.lower()
    acc = {0: '', 1: 'is', -1: 'es', 2: 'isis', -2: 'eses'}[alter]
    if acc == 'es' and name in 'ea':
        acc = 's'                      # ees -> es? LilyPond Dutch: ees/es, aes/as; both spellings valid, keep ees/aes
        acc = 'es'
    mark = "'" * (octave - 3) if octave >= 3 else ',' * (3 - octave)
    return name + acc + mark


def key_from_signature(kind, n):
    if n == 0:
        return {'tonic': 'C', 'mode': 'major', 'count': 0, 'kind': 'none'}
    tonic = (MAJOR_BY_FLATS if kind == 'flat' else MAJOR_BY_SHARPS)[n]
    return {'tonic': tonic, 'mode': 'major', 'count': n, 'kind': kind}


def key_alters(kind, n):
    alters = {l: 0 for l in LETTERS}
    order = FLAT_ORDER if kind == 'flat' else SHARP_ORDER
    for l in order[:n]:
        alters[l] = -1 if kind == 'flat' else 1
    return alters


# ---------------------------------------------------------------- main
STD_PAGE_W = 153.5737          # viewBox width (staff spaces) of a Letter page at staff size 16; some sheets use a smaller size


def recognize(path):
    sc = parse(path)
    sts = staves(sc)
    if not sts:
        raise RecognitionError('no staves found')
    tops = [s[0] for s in sts]

    def system_of(y, lo=-4.5, hi=8.5):
        best, bd = None, 1e9
        for i, t in enumerate(tops):
            if t + lo <= y <= t + hi and abs(y - (t + 2)) < bd:
                best, bd = i, abs(y - (t + 2))
        return best

    glyphs = [(gname(g), x, y, s) for g, x, y, s in sc.glyphs]
    unknown = [g for g in sc.glyphs if gname(g[0]) == 'UNKNOWN']
    if unknown:
        raise RecognitionError('unknown glyph ids: %s' % sorted(set(g[0] for g in unknown)))

    systems = []
    for i, t in enumerate(tops):
        systems.append({'index': i, 'top': t, 'x1': sts[i][1], 'x2': sts[i][2], 'heads': [], 'rests': [],
                        'acc': [], 'chordacc': [], 'dots': [], 'flags': [], 'timesig': [], 'clef': None,
                        'bars': [], 'stems': [], 'beams': [], 'curves': [], 'chords': [], 'lyrics': [],
                        'hyphens': [], 'extenders': [], 'tuplets': [], 'voltas': [], 'scripts': []})

    for name, x, y, s in glyphs:
        kind, _, sub = name.partition('.')
        if kind == 'noteheads':
            i = system_of(y)
            if i is not None:
                systems[i]['heads'].append({'x': x, 'y': y, 'type': sub})
        elif kind == 'rests':
            i = system_of(y, -1.5, 5.5)
            if i is not None:
                systems[i]['rests'].append({'x': x, 'y': y, 'type': sub})
        elif kind == 'accidentals':
            if s < STAFF_SCALE * 0.9:
                i = system_of(y, -19.0, 1.0)
                if i is not None:
                    systems[i]['chordacc'].append({'x': x, 'y': y, 'type': sub})
            else:
                i = system_of(y)
                if i is not None:
                    systems[i]['acc'].append({'x': x, 'y': y, 'type': sub})
        elif kind == 'dots':
            i = system_of(y, -3, 8)
            if i is not None:
                systems[i]['dots'].append({'x': x, 'y': y})
        elif kind == 'flags':
            i = system_of(y, -4.5, 8.5)
            if i is not None:
                systems[i]['flags'].append({'x': x, 'y': y, 'type': sub})
        elif kind == 'scripts':
            i = system_of(y, -12, 10)
            if i is not None:
                systems[i]['scripts'].append({'x': x, 'y': y, 'type': sub})
        elif kind == 'clefs':
            i = system_of(y, -3, 7)
            if i is not None:
                systems[i]['clef'] = {'x': x, 'y': y, 'type': sub}
                if sub != 'G':
                    raise RecognitionError('non-treble clef: ' + name)
        elif kind == 'timesig' or (sub == '' and name in ('one', 'two', 'three', 'four', 'five', 'six', 'seven',
                                                           'eight', 'nine', 'zero', 'fattened.one') and s >= STAFF_SCALE * 0.9):
            i = system_of(y, -1, 5)
            if i is not None:
                systems[i]['timesig'].append({'x': x, 'y': y, 'name': name})
        elif name.startswith('fattened.') and s >= STAFF_SCALE * 0.9:
            i = system_of(y, -1, 5)
            if i is not None:
                systems[i]['timesig'].append({'x': x, 'y': y, 'name': name})

    # rects: bar lines, stems, hyphens/extenders, ledger lines
    for x, y, w, h in sc.rects:
        mid = y + h / 2
        for sy in systems:
            t = sy['top']
            if abs(y - t) < 0.05 and abs(h - 4.0) < 0.05:
                sy['bars'].append({'x': x, 'w': w})
            elif w < 0.3 and 2.0 < h < 7.0 and t - 6 < mid < t + 10:
                sy['stems'].append({'x': x, 'y1': y, 'y2': y + h})
            elif abs(h - 0.151) < 0.06 and 0.25 < w < 0.9 and t + 4.5 < y < t + 12:
                sy['hyphens'].append({'x': x, 'y': y, 'w': w})
            elif h < 0.3 and w > 1.2 and t + 4.5 < y < t + 12 and abs(w - 1.95) > 0.2:
                sy['extenders'].append({'x': x, 'y': y, 'w': w})

    # beams (polygons): parallelogram with origin at left end
    for ox, oy, pts in sc.polys:
        nums = [float(n) for n in pts.split()]
        P = list(zip(nums[0::2], nums[1::2]))
        right = max(p[0] for p in P)
        rys = [p[1] for p in P if p[0] == right]
        lys = [p[1] for p in P if p[0] < 1.0]
        i = system_of(oy, -8, 12)
        if i is None:
            continue
        systems[i]['beams'].append({'x1': ox, 'x2': ox + right, 'yl': oy + sum(lys) / len(lys),
                                    'yr': oy + sum(rys) / len(rys)})

    find_voltas(sc, systems)
    for sy in systems:
        for k in ('heads', 'rests', 'acc', 'chordacc', 'dots', 'flags', 'bars', 'stems', 'hyphens', 'extenders',
                  'timesig'):
            sy[k].sort(key=lambda e: e['x'])

    # curves (slurs/ties): closed shapes relative to an origin. A dashed slur is drawn as several small
    # pieces sharing one origin: merge pieces with the same origin into one curve flagged dashed.
    groups = {}
    for ox, oy, d in sc.curves:
        nums = [float(n) for n in re.findall(r'-?\d+\.?\d*(?:e-?\d+)?', d)]
        groups.setdefault((round(ox, 3), round(oy, 3)), []).append((ox, oy, nums))
    for (_, _), pieces in groups.items():
        ox, oy = pieces[0][0], pieces[0][1]
        widths = [max(nums[0::2]) - min(nums[0::2]) for _, _, nums in pieces]
        dashed = len(pieces) > 2 or (len(pieces) == 2 and max(widths) < 1.0)
        # two long pieces with one origin are two real curves (a tie and a slur on the same note), not one dashed one
        parts = [pieces] if (dashed or len(pieces) == 1) else [[pc] for pc in pieces]
        for part in parts:
            xs = [n for _, _, nums in part for n in nums[0::2]]
            ys = [n for _, _, nums in part for n in nums[1::2]]
            x0, x1 = min(xs), max(xs)
            i = system_of(oy + min(ys), -8, 12)
            if i is None:
                continue
            # a slur lifted above a tuplet bracket sits between two systems: assign it to the system whose
            # noteheads it actually joins (nearest head height at the curve's ends)
            cy = oy + ys[0]
            def head_gap(k):
                near = [h for h in systems[k]['heads'] if min(abs(h['x'] - (ox + x0)), abs(h['x'] - (ox + x1))) < 3.5]
                return min([abs(h['y'] - cy) for h in near] or [1e9])
            cands = [k for k, t in enumerate(tops) if t - 8 <= oy + min(ys) <= t + 12]
            if len(cands) > 1:
                i = min(cands, key=head_gap)
            systems[i]['curves'].append({'x0': ox + x0, 'x1': ox + x1, 'y0': oy + ys[0], 'y1': oy + ys[len(ys) // 2],
                                         'dashed': dashed})

    # chord-name text, lyric text, other text
    other = []
    for text, x, y, fam, size, weight, style in sc.texts:
        if fam in ('sans', 'sans-serif') and size < 2.1:
            i = system_of(y, -19.0, 1.0)            # chord row rises when a boxed mark sits above the staff
            if i is not None:
                systems[i]['chords'].append({'x': x, 'y': y, 'text': text, 'size': size})
                continue
        if fam not in ('sans', 'sans-serif', 'Trebuchet MS') and abs(size - 2.47) < 0.05 and 'italic' not in style:
            cand = [i for i, t in enumerate(tops) if y > t + 3.0]
            if cand:
                systems[cand[-1]]['lyrics'].append({'x': x, 'y': y, 'text': text, 'bold': 'bold' in weight})
                continue
        other.append({'text': text, 'x': x, 'y': y, 'family': fam, 'size': size, 'weight': weight, 'style': style})

    rest = []
    for o in other:
        if 'italic' in o['style'] and re.fullmatch(r'[2-9]', o['text']) and o['size'] < 1.9:
            i = system_of(o['y'], -7, 11)
            if i is not None:
                tb = {'x': o['x'], 'y': o['y'], 'n': int(o['text'])}
                # the bracket: two horizontal pieces either side of the digit, ~0.6 above its baseline; its ends
                # tell which notes are in the group (the digit alone cannot: 3 over quarter, quarter, 2 eighths)
                dx = o['x'] + 0.45
                hs = [l for l in sc.lines if abs(l[2] - l[0]) > 0.8 and abs(l[1] - (o['y'] - 0.6)) < 0.8]
                left = [l for l in hs if min(l[0], l[2]) < dx and max(l[0], l[2]) > dx - 2.2 and max(l[0], l[2]) <= dx + 0.2]
                right = [l for l in hs if max(l[0], l[2]) > dx and min(l[0], l[2]) >= dx - 0.2 and min(l[0], l[2]) < dx + 3.2]
                if left and right:
                    tb['x0'] = min(min(l[0], l[2]) for l in left)
                    tb['x1'] = max(max(l[0], l[2]) for l in right)
                systems[i]['tuplets'].append(tb)
                continue
        rest.append(o)
    return build_ir(path, sc, systems, rest)


# ---------------------------------------------------------------- build IR
def build_ir(path, sc, systems, other):
    # ---- key and time from the first system
    s0 = systems[0]
    first_head_x = min([h['x'] for h in s0['heads']] + [h['x'] for h in s0['rests']] + [1e9])
    ts_x = min([t['x'] for t in s0['timesig']] + [1e9])
    clef_x = s0['clef']['x'] if s0['clef'] else 0
    key_acc = [a for a in s0['acc'] if clef_x < a['x'] < min(ts_x, first_head_x) - 0.5]
    kinds = set(a['type'] for a in key_acc)
    if len(kinds) > 1:
        raise RecognitionError('mixed key signature')
    kind = kinds.pop() if kinds else 'none'
    n_key = len(key_acc)
    key = key_from_signature(kind if kind in ('flat', 'sharp') else 'flat', n_key)
    base_alters = key_alters(kind if kind in ('flat', 'sharp') else 'flat', n_key)

    clusters0 = time_clusters(s0['timesig'])
    time = parse_time(clusters0[0][1]) if clusters0 and clusters0[0][0] < first_head_x else None
    vb = re.search(r'viewBox="([^"]*)"', open(path, encoding='utf8', errors='ignore').read(600))
    page_w = float(vb.group(1).split()[2]) if vb else STD_PAGE_W
    ir = {'page_w': page_w, 'source': os.path.basename(os.path.dirname(path)) + '/' + os.path.basename(path), 'format': sc.fmt,
          'key': key, 'time': time, 'systems': [], 'measures': [], 'warnings': [], 'other_text': other}

    cur_key = (kind if kind in ('flat', 'sharp') else 'none', n_key)
    measures = []
    lead_sigs = []
    volta_state = {'open': None}
    state = {'open': []}
    for sy in systems:
        ev_x0 = sy['clef']['x'] if sy['clef'] else 0
        changes = [(x, parse_time(items)) for x, items in time_clusters(sy['timesig'])]
        if sy['index'] == 0 and time is not None and changes:
            changes = changes[1:]                      # the first cluster of system 0 is the initial time
        groups = bar_groups(sy)
        first_x = min([h['x'] for h in sy['heads']] + [r['x'] for r in sy['rests']] + [1e9])
        lead = [g for g in groups if g['x'] < first_x - 0.5]          # e.g. a start-repeat at the start of a line
        body = [g for g in groups if g['x'] >= first_x - 0.5]
        bar_xs = [round(g['x'], 2) for g in body]
        bar_sig = {round(g['x'], 2): g['sig'] for g in body}
        lead_sigs.append(lead[-1]['sig'] if lead else None)
        ev_xs = sorted([h['x'] for h in sy['heads']] + [r['x'] for r in sy['rests']])
        # a key change in the middle of the previous line stays in force: start this system from the current key
        sys_base_alters = key_alters(cur_key[0] if cur_key[0] in ('flat', 'sharp') else 'flat', cur_key[1])
        key_changes, cur_key = detect_key_changes(sy, [g['x'] for g in body], ev_xs, cur_key, first_check_start=sy['index'] > 0)
        sys_measures = split_system(sy, bar_xs, key, sys_base_alters, ir, state, bar_sig, key_changes)
        apply_voltas(sy, sys_measures, volta_state)
        for cx, new_time in changes:
            for m in sys_measures:
                if m['events'] and min(e['x'] for e in m['events']) > cx:
                    m['time_change'] = new_time
                    break
        for m in sys_measures:
            m['system'] = sy['index']
        measures.extend(sys_measures)
        ir['systems'].append({'index': sy['index'], 'top': sy['top'],
                              'first_measure': len(measures) - len(sys_measures) + 1,
                              'measures': len(sys_measures)})
    merge_line_start_bars(ir, measures, lead_sigs)
    for n, m in enumerate(measures, 1):
        m['n'] = n
        m['events'] = [clean_event(e) for e in m['events']]
    if state['open']:
        ir['warnings'].append('curve left open at end of piece')
    ir['measures'] = measures
    ir['max_y'] = max([t[2] for t in sc.texts] or [0])          # > page height: the original overflows its page
    ir['text'] = extract_text(systems, other, ir, sc.rects)
    assign_marks(systems, ir)
    assign_scripts(systems, ir)
    assign_lyrics(systems, ir)
    return ir


def time_clusters(items):
    """Group time-signature glyphs by x: a stacked pair / C symbol / multi-digit number is one signature."""
    items = sorted(items, key=lambda t: t['x'])
    clusters, cur = [], []
    for t in items:
        if cur and t['x'] - cur[-1]['x'] > 2.2:
            clusters.append(cur)
            cur = []
        cur.append(t)
    if cur:
        clusters.append(cur)
    return [(c[0]['x'], c) for c in clusters]


def parse_time(items):
    if not items:
        return None
    names = [t['name'] for t in items]
    if 'timesig.C44' in names:
        return {'num': 4, 'den': 4, 'symbol': 'C'}
    if 'timesig.C22' in names:
        return {'num': 2, 'den': 2, 'symbol': 'C22'}
    digit = {'zero': 0, 'one': 1, 'two': 2, 'three': 3, 'four': 4, 'five': 5, 'six': 6, 'seven': 7, 'eight': 8,
             'nine': 9}
    rows = {}
    for t in items:
        n = t['name'].replace('fattened.', '')
        if n in digit:
            rows.setdefault('top' if t['y'] < min(i['y'] for i in items) + 0.5 else 'bot', []).append((t['x'], digit[n]))
    if len(rows) == 2:
        num = int(''.join(str(d) for _, d in sorted(rows['top'])))
        den = int(''.join(str(d) for _, d in sorted(rows['bot'])))
        return {'num': num, 'den': den, 'symbol': None}
    raise RecognitionError('cannot parse time signature')


def split_system(sy, bar_xs, key, base_alters, ir, state, bar_sig, key_changes=()):
    """Turn one system's primitives into measures of events."""
    top = sy['top']
    # events: notes and rests
    events = []
    for h in sy['heads']:
        events.append({'kind': 'note', 'x': h['x'], 'y': h['y'], 'head': h['type']})
    for r in sy['rests']:
        events.append({'kind': 'rest', 'x': r['x'], 'y': r['y'], 'rtype': r['type']})
    events.sort(key=lambda e: (e['x'], e['y']))

    # stems / flags / beams -> duration base for black heads
    for e in events:
        if e['kind'] != 'note':
            continue
        e['stem'] = find_stem(e, sy)
        e['flags'] = 0
        if e['head'] == 's2':
            if e['stem'] is None:
                ir['warnings'].append('black notehead without stem at x=%.2f' % e['x'])
                e['flags'] = 0
            else:
                tip = e['stem']['tip']
                sx = e['stem']['x']
                nflag = 0
                for f in sy['flags']:
                    if abs(f['x'] - (sx + 0.075)) < 0.5 and abs(f['y'] - tip) < 0.6:
                        nflag = max(nflag, 2 if f['type'][-1] in '45' else 1)
                nbeam = 0
                e['beams'] = []
                for bi, b in enumerate(sy['beams']):
                    if b['x1'] - 0.1 <= sx <= b['x2'] + 0.25:
                        t = (sx - b['x1']) / max(1e-6, b['x2'] - b['x1'])
                        by = b['yl'] + t * (b['yr'] - b['yl'])
                        if abs(by - tip) < 2.3:       # primary beam at the tip; secondary beams ~0.9 apart
                            nbeam += 1
                            e['beams'].append(bi)
                e['flags'] = max(nflag, nbeam)
    # durations
    for e in events:
        if e['kind'] == 'note':
            base = {'s0': 1, 's1': 2, 's2': 4}.get(e['head'])
            if base is None:
                raise RecognitionError('unsupported notehead ' + e['head'])
            if e['head'] == 's2':
                base = {0: 4, 1: 8, 2: 16, 3: 32}[min(e['flags'], 3)]
            e['base'] = base
        else:
            e['base'] = {'0': 1, '1': 2, '2': 4, '3': 8, '4': 16, '5': 32}.get(e['rtype'])
            if e['base'] is None:
                raise RecognitionError('unsupported rest ' + e['rtype'])
        e['dots'] = count_dots(e, sy)
    assign_beam_groups(events)

    # pitch (needs accidentals): assign accidental glyphs on staff to their note
    used = set()
    for e in events:
        if e['kind'] != 'note':
            continue
        step = staff_step(e['y'], top)
        letter, octave = step_to_pitch(step)
        e['letter'], e['octave'], e['step'] = letter, octave, step
        e['acc'] = None
        for ai, a in enumerate(sy['acc']):
            if ai in used:
                continue
            if 0.4 < e['x'] - a['x'] < 3.2 and abs(a['y'] - e['y']) < 0.3:
                e['acc'] = a['type']
                used.add(ai)
                break

    # key signature accidentals on this system are everything before first event not matched to a note
    # split into measures by bar lines
    bounds = [-1e9] + list(bar_xs) + [1e9]
    meas = []
    for k in range(len(bounds) - 1):
        evs = [e for e in events if bounds[k] < e['x'] - 0.3 <= bounds[k + 1] or
               (bounds[k] < e['x'] <= bounds[k + 1] and False)]
        if not evs:
            continue
        meas.append({'bar_before': bounds[k], 'bar_after': bounds[k + 1], 'events': evs})
    # drop a trailing empty measure; apply accidentals within each measure
    out = []
    active = dict(base_alters)
    for m in meas:
        mx = min(e['x'] for e in m['events'])
        for kx, kdict, kal in key_changes:
            if abs(mx - kx) < 0.01:
                active = dict(kal)
                m['key_change'] = kdict
        sig_alters = dict(active)
        local = {}
        for e in m['events']:
            if e['kind'] != 'note':
                continue
            L, o = e['letter'], e['octave']
            if e['acc']:
                alter = {'flat': -1, 'sharp': 1, 'natural': 0, 'doublesharp': 2}[e['acc']]
                local[(L, o)] = alter
            e['alter'] = local.get((L, o), sig_alters[L])
        out.append(m)
    # chords and lyrics attach by x
    beat = beat_unit(ir['time']) if ir.get('time') else None
    starts = {}
    for m in out:
        acc = Fraction(0)
        for e in m['events']:
            starts[id(e)] = acc
            acc += Fraction(1, e['base']) * ((2 - Fraction(1, 2 ** e['dots'])) if e['dots'] else 1)
    if sy['index'] == 0 and out and ir.get('time'):                # a pickup is anchored to the end of its bar
        full = Fraction(ir['time']['num'], ir['time']['den'])
        first_sum = sum((Fraction(1, e['base']) * ((2 - Fraction(1, 2 ** e['dots'])) if e['dots'] else 1)
                         for e in out[0]['events']), Fraction(0))
        if first_sum < full:
            for e in out[0]['events']:
                starts[id(e)] += full - first_sum
    attach_chords(sy, events, starts, beat)
    if sy.get('unattached_chords'):
        ir['warnings'].append('chord(s) not attached to any note: %s' % sy['unattached_chords'][:3])
    attach_lyrics_and_curves(sy, events, ir, state)
    assign_tuplets(sy, out, ir)
    result = []
    for m in out:
        entry = {'events': m['events'], 'bar_after': SIG2LY.get(bar_sig.get(m['bar_after'], 'T'), '|')}
        if m.get('key_change'):
            entry['key_change'] = m['key_change']
        result.append(entry)
    return result


def assign_beam_groups(events):
    """Notes sharing any beam polygon form one beamed group; first/last get beam_start/beam_end."""
    notes = [e for e in events if e['kind'] == 'note' and e.get('beams')]
    parent = list(range(len(notes)))

    def find(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i
    by_beam = {}
    for i, n in enumerate(notes):
        for b in n['beams']:
            if b in by_beam:
                parent[find(i)] = find(by_beam[b])
            else:
                by_beam[b] = i
    groups = {}
    for i, n in enumerate(notes):
        groups.setdefault(find(i), []).append(n)
    for e in events:
        e['beam_start'] = e['beam_end'] = False
    for g in groups.values():
        if len(g) >= 2:
            g.sort(key=lambda n: n['x'])
            g[0]['beam_start'] = True
            g[-1]['beam_end'] = True


def find_stem(e, sy):
    best = None
    for s in sy['stems']:
        up = abs(s['x'] - (e['x'] + 1.163)) < 0.2 and abs(s['y2'] - (e['y'] - 0.1)) < 0.5
        down = abs(s['x'] - e['x']) < 0.2 and abs(s['y1'] - (e['y'] + 0.1)) < 0.5
        if up:
            best = {'x': s['x'], 'tip': s['y1'], 'dir': 'up'}
        elif down:
            best = {'x': s['x'], 'tip': s['y2'], 'dir': 'down'}
    return best


def count_dots(e, sy):
    n = 0
    xs = []
    for d in sy['dots']:
        dx = d['x'] - e['x']
        if any(abs(d2['x'] - d['x']) < 0.05 and 0.9 < abs(d2['y'] - d['y']) < 1.1 for d2 in sy['dots']):
            continue                  # one of a vertical pair: a repeat sign, not an augmentation dot
        whole_rest = e['kind'] == 'rest' and e.get('base') == 1      # hangs from line 4: its dot is half a space below
        if 1.2 < dx < 3.6 and (abs(d['y'] - e['y']) < 0.08 or abs(d['y'] - (e['y'] - 0.5)) < 0.08 or
                               (whole_rest and abs(d['y'] - (e['y'] + 0.5)) < 0.08)):
            xs.append(d['x'])
    xs.sort()
    # consecutive dots are ~1 apart
    last = None
    for x in xs:
        if last is None or 0.4 < x - last < 1.6:
            n += 1
            last = x
    return n


def chord_clusters(sy):
    """Chord names are loose texts + accidental glyphs. A new chord starts at a root letter A-G that doesn't
    directly follow a slash; everything else (accidentals, quality, superscripts, '/bass') continues it."""
    items = [('t', c['x'], c['text']) for c in sy['chords']] + \
            [('g', a['x'], {'flat': 'b', 'sharp': '#', 'natural': 'n'}.get(a['type'], '?')) for a in sy['chordacc']]
    items.sort(key=lambda it: it[1])
    chords, cur, prev = [], None, None
    for kind, x, text in items:
        is_root = kind == 't' and re.fullmatch(r'[A-G]', text) and prev != '/'
        if cur is None or is_root:
            cur = {'x': x, 'text': ''}
            chords.append(cur)
        cur['text'] += text
        prev = text
    return chords


def attach_chords(sy, events, starts=None, beat=None):
    """A chord name sits at the time position where it starts. If a note starts there, attach it to the note;
    if it falls inside a sustained note (chord change mid-note), record it with its offset in that note,
    found by interpolating x between the note and the next event (or the bar line)."""
    from fractions import Fraction
    for e in events:
        e['chord'] = None
        e['mid_chords'] = []
    ordered = sorted(events, key=lambda e: e['x'])
    clusters = chord_clusters(sy)
    for ch in clusters:
        near = min(ordered, key=lambda e: abs(e['x'] - ch['x']), default=None)
        if near is not None and abs(near['x'] - ch['x']) < 1.2 and near['chord'] is None:
            near['chord'] = ch['text']
            continue
        host = None
        for k, e in enumerate(ordered):
            nxt = ordered[k + 1]['x'] if k + 1 < len(ordered) else sy['x2']
            if e['x'] - 0.2 <= ch['x'] < nxt - 0.2:
                host, x0, x1 = e, e['x'], nxt
                break
        if host is None:
            sy.setdefault('unattached_chords', []).append(ch['text'])
            continue
        dur = Fraction(1, host['base']) * (2 - Fraction(1, 2 ** host['dots'])) if host['dots'] else Fraction(1, host['base'])
        frac = (ch['x'] - x0) / max(1e-6, x1 - x0)
        k_host = ordered.index(host)
        nxt_ev = ordered[k_host + 1] if k_host + 1 < len(ordered) else None
        next_has_own = nxt_ev is not None and any(abs(c2['x'] - nxt_ev['x']) < 1.2 for c2 in clusters)
        if frac > 0.72 and nxt_ev is not None and nxt_ev['chord'] is None and not next_has_own:
            nxt_ev['chord'] = ch['text']                             # belongs to the next note, drawn a bit early
            continue
        guess = frac * dur
        off = Fraction(round(float(guess) * 16), 16)               # fallback: nearest sixteenth
        if starts is not None and beat:
            s0 = starts.get(id(host), Fraction(0))
            grid = min(beat, Fraction(1, 4)) if beat.denominator < 8 else Fraction(1, 8)   # chords change on quarters
            beats = [Fraction(k) * grid - s0 for k in range(0, 128)]
            inside = [b for b in beats if 0 < b < dur]
            if inside:                                             # chord changes land on beats
                off = min(inside, key=lambda b: abs(float(b) - float(guess)))
        if off <= 0 or off >= dur:
            if host['chord'] is None and off <= 0:
                host['chord'] = ch['text']
            else:
                sy.setdefault('unattached_chords', []).append(ch['text'])
            continue
        if any(mc['offset'] == [off.numerator, off.denominator] for mc in host['mid_chords']):
            sy.setdefault('unattached_chords', []).append(ch['text'])      # two chords on one beat: ambiguous
            continue
        host['mid_chords'].append({'text': ch['text'], 'offset': [off.numerator, off.denominator]})


def same_pitch(a, b):
    return (a['letter'], a['octave'], a.get('alter')) == (b['letter'], b['octave'], b.get('alter'))


def attach_lyrics_and_curves(sy, events, ir, state):
    notes = [e for e in events if e['kind'] == 'note']
    for e in events:
        e['lyric'] = None
        e['tie'] = False
        e['slur_start'] = e['slur_end'] = False
    if not notes:
        return
    first_x, last_x = notes[0]['x'], notes[-1]['x']
    # Curves still open from the previous system (a tie and a slur can both leave a line) are matched with the
    # curves that arrive at the start of this one, biggest to biggest.
    openers = sorted(state['open'], key=lambda o: -o['size'])
    state['open'] = []
    arriving = sorted([c for c in sy['curves'] if c['x0'] < first_x - 0.4], key=lambda c: -(c['x1'] - c['x0']))
    for c in arriving:
        if not openers:
            break
        o = openers.pop(0)
        opener = o['ev']
        b = min(notes, key=lambda n: abs((n['x'] + HEAD_W / 2) - c['x1']))
        if same_pitch(opener, b) and opener.get('tie_open') and b is notes[0]:      # a tie joins neighbouring notes only
            opener['tie'] = True
            if c.get('dashed'):
                opener['tie_dashed'] = True
        else:
            opener['slur_start'] = True
            b['slur_end'] = True
            if c.get('dashed'):
                opener['slur_dashed'] = True
        opener.pop('tie_open', None)
        c['_done'] = True
    if openers:
        ir['warnings'].append('a curve left the previous system but none arrives here')
    for c in sorted(sy['curves'], key=lambda c: c['x0']):
        if c.get('_done'):
            continue
        a = min(notes, key=lambda n: abs((n['x'] + HEAD_W / 2) - c['x0']))
        b = min(notes, key=lambda n: abs((n['x'] + HEAD_W / 2) - c['x1']))
        ends_after = c['x1'] > last_x + HEAD_W + 2.0 or c['x1'] >= sy['x2'] - 0.3     # continues to next system
        if ends_after:
            a['tie_open'] = a is notes[-1]                  # only the last note of the line can be tied over the break
            state['open'].append({'ev': a, 'size': c['x1'] - c['x0']})
            continue
        if a is b:
            # a curve shorter than the note spacing (a tie or slur between notes that nearly touch): both ends pick
            # the same note. It arrives at that note if its right end is nearer the note's centre, else it leaves it.
            i = notes.index(b)
            cb = b['x'] + HEAD_W / 2
            if abs(c['x1'] - cb) <= abs(c['x0'] - cb) and i > 0:
                a = notes[i - 1]
            elif i + 1 < len(notes):
                b = notes[i + 1]
            else:                                        # leaves the last note of the line: continues on the next system
                a['tie_open'] = True
                state['open'].append({'ev': a, 'size': c['x1'] - c['x0']})
                continue
            if a is b:
                ir['warnings'].append('curve with identical endpoints at x=%.1f' % c['x0'])
                continue
        if same_pitch(a, b) and notes.index(b) == notes.index(a) + 1:
            a['tie'] = True
            if c.get('dashed'):
                a['tie_dashed'] = True
        else:
            a['slur_start'] = True
            b['slur_end'] = True
            if c.get('dashed'):
                a['slur_dashed'] = True


def frac_of(e):
    """Written duration of an event (before any tuplet scaling)."""
    d = Fraction(1, e['base'])
    return d * Fraction(2 ** e['dots'] * 2 - 1, 2 ** e['dots']) if e['dots'] else d


def assign_tuplets(sy, measures, ir):
    """Italic digit above/below a group of n consecutive events scales their durations."""
    for e in [e for m in measures for e in m['events']]:
        e['tuplet'] = None
    for t in sy['tuplets']:
        n = t['n']
        cx = t['x'] + 0.45
        den = {2: 3, 3: 2, 4: 3, 5: 4, 6: 4, 7: 4, 8: 6, 9: 8}[n]
        if 'x0' in t:                 # group = the events inside the bracket (may be more events than the digit)
            for m in measures:
                grp = [e for e in m['events'] if e['x'] + HEAD_W > t['x0'] + 0.2 and e['x'] < t['x1'] - 0.2]   # head overlaps the bracket
                if len(grp) < 2 or any(e.get('tuplet') for e in grp):
                    continue
                total = sum(frac_of(e) for e in grp)
                u = total / n                                    # one tuplet unit
                if u.numerator == 1 and (u.denominator & (u.denominator - 1)) == 0:     # unit is a power of two
                    for k, e in enumerate(grp):
                        e['tuplet'] = {'num': n, 'den': den, 'start': k == 0, 'end': k == len(grp) - 1}
                    break
            else:
                grp = None
            if grp:
                continue
        best, bd = None, 1e9
        for m in measures:
            evs = m['events']
            for k in range(len(evs) - n + 1):
                run = evs[k:k + n]
                c = sum(e['x'] + HEAD_W / 2 for e in run) / n
                d = abs(c - cx)
                if d < bd:
                    best, bd = run, d
        if best is None or bd > 2.5:
            ir['warnings'].append('tuplet number %d at x=%.1f not matched to a group' % (n, t['x']))
            continue
        for k, e in enumerate(best):
            e['tuplet'] = {'num': n, 'den': den, 'start': k == 0, 'end': k == n - 1}


def clean_event(e):
    d = {'kind': e['kind'], 'x': round(e['x'], 3), 'dur': e['base'], 'dots': e['dots'], 'chord': e.get('chord'),
         'tie': e.get('tie', False), 'slur_start': e.get('slur_start', False), 'slur_end': e.get('slur_end', False),
         'lyrics': e.get('lyrics'), 'tuplet': e.get('tuplet'),
         'beam_start': e.get('beam_start', False), 'beam_end': e.get('beam_end', False), 'marks': e.get('marks'), 'mid_chords': e.get('mid_chords') or None, 'fermata': e.get('fermata'), 'signs': e.get('signs'),
         'slur_dashed': e.get('slur_dashed', False), 'tie_dashed': e.get('tie_dashed', False)}
    if e['kind'] == 'note':
        d.update({'letter': e['letter'], 'octave': e['octave'], 'alter': e['alter'], 'step': e['step'],
                  'acc': e['acc']})
    return d


if __name__ == '__main__':
    print(json.dumps(recognize(sys.argv[1]), indent=1))


# ---------------------------------------------------------------- text blocks
def extract_text(systems, other, ir, rects):
    tops = [sy['top'] for sy in systems]
    out = {'title': None, 'subtitle': None, 'number': None, 'footer': [], 'instructions': [], 'verses': [],
           'labels': [], 'leftover': [], 'marks': []}
    verse_texts = []
    lyric_ys = [l['y'] for sy in systems for l in sy['lyrics']]
    for o in other:                       # the title must be known before subtitles are classified
        if abs(o['size'] - 3.11) < 0.05 and 'bold' in o['weight']:
            out['title'] = o
    for o in other:
        t, y, x, size = o['text'], o['y'], o['x'], o['size']
        bold = 'bold' in o['weight']
        if o['family'] == 'Trebuchet MS':
            out['footer'].append(o)
        elif abs(size - 3.11) < 0.05 and bold:
            out['title'] = o
        elif 'italic' in o['style'] and re.match(r'\((Guitar|Piano)', t):
            out['instructions'].append(o)               # "(Guitar: Capo 1)" etc.: a line under the title
        elif abs(size - 5.87) < 0.1:
            out['number'] = o
        elif abs(size - 2.2) < 0.05 and bold and out['title'] and abs(y - out['title']['y'] - 3.5) < 0.7 and \
                out['subtitle'] is None:                      # the subtitle sits 3.5 below the title baseline
            out['subtitle'] = o
        elif 'italic' in o['style'] and not (abs(size - 2.2) < 0.05 and any(tp - 9 < y < tp - 0.3 for tp in tops)
                                              and y > tops[0] - 8):
            out['instructions'].append(o)
        elif abs(size - 1.75) < 0.05 and re.fullmatch(r'\d+', t):
            pass                                              # bar number: derived, not stored
        elif abs(size - 2.2) < 0.05 and bold and re.fullmatch(r'(\d+\.|\(.*\))', t) and \
                any(abs(y - ly) < 1.2 for ly in lyric_ys):
            out['labels'].append(o)                           # stanza label sharing a baseline with a lyric line
        elif abs(size - 2.2) < 0.05 and any(tp - 9 < y < tp - 0.3 for tp in tops) and not o['family'].startswith('sans'):
            sysi = max(i for i, tp in enumerate(tops) if tp - 9 < y < tp - 0.3)
            w = text_width(t, 2.2, bold)
            # a box = a thin horizontal rect above the text and one below it, both about as wide as the text
            # (padding differs per LilyPond version, so no exact offsets)
            hor = [r for r in rects if r[3] < 0.2 and r[2] >= w - 0.3 and x - 1.6 <= r[0] <= x + 0.8]
            boxed = any(y - 3.4 < r[1] < y - 1.4 for r in hor) and any(y - 0.2 < r[1] < y + 1.5 for r in hor)
            out['marks'].append({'text': t, 'x': x, 'y': y, 'width': w, 'bold': bold, 'boxed': boxed,
                                 'italic': 'italic' in o['style'], 'system': sysi})
        elif abs(size - 2.2) < 0.05 and y > tops[-1] + 10:
            verse_texts.append(o)
        elif abs(size - 2.2) < 0.05 and bold and re.fullmatch(r'(\d+\.|\(.*\))', t):
            out['labels'].append(o)                           # stanza label at the start of a lyric line
        else:
            out['leftover'].append(o)
    out['footer'].sort(key=lambda o: o['x'])
    # verse block: columns by x of the bold number, stanza = number + following lines
    cols = {}
    for o in verse_texts:
        if 'bold' in o['weight'] and re.fullmatch(r'\d+\.', o['text']):
            cols.setdefault(round(o['x']), []).append({'number': o['text'], 'y': o['y'], 'x': o['x'], 'lines': [], 'pos': []})
    stanzas = sorted([st for v in cols.values() for st in v], key=lambda st: (st['x'], st['y']))
    free = []
    for o in sorted(verse_texts, key=lambda o: (o['y'], o['x'])):
        if 'bold' in o['weight'] and re.fullmatch(r'\d+\.', o['text']):
            continue
        # a line belongs to the nearest column to its left (refrain paragraphs are indented ~7 units more than the
        # stanza text; columns are 40+ units apart), and to the last stanza above it in that column
        cands = [st for st in stanzas if st['y'] <= o['y'] + 0.01 and o['x'] > st['x'] and o['x'] - st['x'] < 20]
        if not cands:
            free.append(o)                        # not under a numbered stanza: an unnumbered block (bridge, ending...)
            continue
        st = max(cands, key=lambda st: (round(st['x']), st['y']))
        st['lines'].append(o['text'])
        st['pos'].append([round(o['x'], 2), round(o['y'], 2)])
    # unnumbered blocks: lines with one left edge, top to bottom, form one block (a column of its own)
    blocks = []
    for o in sorted(free, key=lambda o: (round(o['x'], 1), o['y'])):
        for b in blocks:
            if abs(b['x'] - o['x']) < 1.0 and o['y'] >= b['pos'][-1][1]:
                b['lines'].append(o['text'])
                b['pos'].append([round(o['x'], 2), round(o['y'], 2)])
                break
        else:
            blocks.append({'number': None, 'x': o['x'], 'y': o['y'], 'lines': [o['text']], 'pos': [[round(o['x'], 2), round(o['y'], 2)]]})
    # group stanzas into columns (left to right); a block is a column of its own
    columns = {}
    for st in stanzas + blocks:
        columns.setdefault(round(st['x']), []).append(st)
    out['verses'] = [{'x': cx, 'y': min(st['y'] for st in sts),
                      'stanzas': [{'number': st['number'], 'lines': st['lines'], 'pos': st['pos']} for st in sts]}
                     for cx, sts in sorted(columns.items())]
    for k in ('title', 'subtitle', 'number'):
        if out[k]:
            out[k] = {'text': out[k]['text'], 'x': out[k]['x'], 'y': out[k]['y']}
    out['footer'] = [{'text': o['text'], 'x': o['x'], 'y': o['y']} for o in out['footer']]
    out['instructions'] = [{'text': o['text'], 'x': o['x'], 'y': o['y'], 'bold': 'bold' in o['weight']}
                           for o in out['instructions']]
    out['labels'] = [{'text': o['text'], 'x': o['x'], 'y': o['y']} for o in out['labels']]
    out['leftover'] = [{'text': o['text'], 'x': o['x'], 'y': o['y'], 'size': o['size']} for o in out['leftover']]
    return out


def assign_lyrics(systems, ir):
    """Match syllables to notes by x (monotone DP on distance between syllable centre and head centre)."""
    labels = ir['text']['labels']
    ev_by_system = {}
    for m in ir['measures']:
        ev_by_system.setdefault(m['system'], []).extend(m['events'])
    for sy in systems:
        evs = [e for e in ev_by_system.get(sy['index'], []) if e['kind'] == 'note']
        if not sy['lyrics'] or not evs:
            continue
        # lines by y
        ys = sorted(set(round(l['y'], 1) for l in sy['lyrics']))
        lines = []
        for y in ys:
            if lines and y - lines[-1][0] < 1.2:
                continue
            lines.append([y])
        def line_index(y):
            return min(range(len(lines)), key=lambda i: abs(lines[i][0] - y))
        by_line = {}
        for l in sy['lyrics']:
            by_line.setdefault(line_index(l['y']), []).append(l)
        for li, items in by_line.items():
            items.sort(key=lambda l: l['x'])
            ly_y = lines[li][0]
            cen = [l['x'] + text_width(l['text'], 2.47, l['bold']) / 2 for l in items]
            ncen = [e['x'] + HEAD_W / 2 for e in evs]
            m, n = len(items), len(evs)
            if m > n:
                ir['warnings'].append('system %d lyric line %d has %d syllables for %d notes' % (sy['index'], li, m, n))
                continue
            INF = 1e18
            dp = [[INF] * (n + 1) for _ in range(m + 1)]
            back = [[0] * (n + 1) for _ in range(m + 1)]
            dp[0] = [0.0] * (n + 1)
            for i in range(1, m + 1):
                for j in range(i, n + 1):
                    # syllable i-1 on note j-1, or note j-1 skipped
                    take = dp[i - 1][j - 1] + abs(cen[i - 1] - ncen[j - 1])
                    skip = dp[i][j - 1]
                    if take <= skip:
                        dp[i][j], back[i][j] = take, 1
                    else:
                        dp[i][j], back[i][j] = skip, 0
            i, j = m, n
            assign = {}
            while i > 0:
                if back[i][j] == 1:
                    assign[i - 1] = j - 1
                    i -= 1
                    j -= 1
                else:
                    j -= 1
            for k, l in enumerate(items):
                e = evs[assign[k]]
                cx = cen[k]
                nxt = cen[k + 1] if k + 1 < len(items) else None
                hy = any(cx < h['x'] + h['w'] / 2 < (nxt if nxt else cx + 99) and abs(h['y'] - (ly_y - 0.55)) < 0.7
                         for h in sy['hyphens'])
                ex = any(abs(r['y'] - (ly_y - 0.55)) < 0.7 and cx - 0.5 < r['x'] < cx + text_width(l['text'], 2.47) / 2 + 1.5
                         for r in sy['extenders'])
                lab = [lb['text'] for lb in labels if abs(lb['y'] - ly_y) < 1.0 and lb['x'] < l['x'] + 0.1 and
                       l['x'] - lb['x'] < 14 and not any(
                           o is not l and o['x'] < l['x'] and o['x'] > lb['x'] and abs(o['y'] - ly_y) < 0.3 for o in items)]
                if e.get('lyrics') is None:
                    e['lyrics'] = {}
                e['lyrics'][li] = {'text': l['text'], 'hyphen': hy, 'extender': ex, 'stanza': lab[0] if lab else None}


def assign_marks(systems, ir):
    """Attach each above-staff text mark to the measure start or note it is centred over."""
    marks = sorted(ir['text']['marks'], key=lambda mk: mk['y'])      # top first
    ev_by_system = {}
    for m in ir['measures']:
        ev_by_system.setdefault(m['system'], []).append(m)
    for mk in marks:
        ms = ev_by_system.get(mk['system'], [])
        pad = 0.62 if mk['boxed'] else 0.0
        cx = mk['x'] - pad + (mk['width'] + 2 * pad) / 2
        best, bd = None, 1e9
        for m in ms:
            for e in m['events']:
                d = abs(e['x'] + HEAD_W / 2 - cx)
                if d < bd:
                    best, bd = e, d
        if best is None:
            ir['warnings'].append('mark %r has no event to attach to' % mk['text'])
            continue
        if not best.get('marks'):
            best['marks'] = []
        best['marks'].append({'text': mk['text'], 'boxed': mk['boxed'], 'bold': mk['bold'],
                                             'italic': mk['italic']})


# ---------------------------------------------------------------- bar lines, repeats, voltas
SIG2LY = {'T': '|', 'TT': '||', 'TK': '|.', 'DTK': ':|.', 'KTD': '.|:', 'DTKTD': ':|.|:'}


def bar_groups(sy):
    """Group thin (T) / thick (K) bar rects and repeat-dot pairs (D) into bar-line signatures such as 'DTK'."""
    top = sy['top']
    items = [(b['x'], 'K' if b['w'] > 0.5 else 'T') for b in sy['bars']]
    ups = [d['x'] for d in sy['dots'] if abs(d['y'] - (top + 1.5)) < 0.12]
    downs = [d['x'] for d in sy['dots'] if abs(d['y'] - (top + 2.5)) < 0.12]
    for x in ups:
        if any(abs(x - x2) < 0.05 for x2 in downs):               # a repeat dot pair, unlike a single note dot
            items.append((x, 'D'))
    items.sort()
    groups, cur = [], []
    for it in items:
        if cur and it[0] - cur[-1][0] > 2.2:
            groups.append(cur)
            cur = []
        cur.append(it)
    if cur:
        groups.append(cur)
    out = []
    for g in groups:
        sig = ''.join(c for _, c in g)
        if 'T' in sig or 'K' in sig:
            out.append({'x': g[0][0], 'sig': sig})
    return out


def merge_line_start_bars(ir, measures, lead_sigs):
    """A start-repeat drawn at the start of a line belongs to the bar that ended the previous system."""
    by_sys = {}
    for m in measures:
        by_sys.setdefault(m['system'], []).append(m)
    for i, sig in enumerate(lead_sigs):
        if not sig or i == 0 or (i - 1) not in by_sys:
            continue
        prev = by_sys[i - 1][-1]
        merged = {('|', 'KTD'): '.|:', (':|.', 'KTD'): ':|.|:'}.get((prev['bar_after'], sig))
        if merged is None:
            ir['warnings'].append('line-start bar %s after %s not understood' % (sig, prev['bar_after']))
        else:
            prev['bar_after'] = merged


def _label_char(name):
    n = name.replace('fattened.', '')
    digits = {'zero': '0', 'one': '1', 'two': '2', 'three': '3', 'four': '4', 'five': '5', 'six': '6',
              'seven': '7', 'eight': '8', 'nine': '9'}
    return digits.get(n) or {'period': '.', 'hyphen': '-', 'comma': ','}.get(n)


def find_voltas(sc, systems):
    """Volta brackets: a long thin horizontal line above a staff, vertical end ticks, label as small glyphs."""
    tops = [sy['top'] for sy in systems]
    for x1, y, x2, w in sc.lines:
        if not (0.15 < w < 0.3 and x2 - x1 > 3):
            continue
        cand = [i for i, t in enumerate(tops) if t - 8 < y < t - 1.0]
        if not cand:
            continue
        sy = systems[max(cand)]
        label = []
        for gid, gx, gy, gs in sc.glyphs:
            ch = _label_char(gname(gid))
            if ch and x1 - 0.5 <= gx <= x1 + 12 and y + 0.3 <= gy <= y + 3.8 and gs < STAFF_SCALE * 0.9:
                label.append((gx, ch))
        label.sort()
        text = ''.join(c for _, c in label)
        text = re.sub(r'-+', '\u2013', text)
        ticks = [lx for lx, ly, lx2, lw in sc.lines if abs(lx - lx2) < 0.01 and 0.15 < lw < 0.3 and abs(ly - y) < 0.05]
        sy['voltas'].append({'x1': x1, 'x2': x2, 'label': text or None,
                             'left_tick': any(abs(t - x1) < 0.05 for t in ticks),
                             'right_tick': any(abs(t - x2) < 0.05 for t in ticks)})


def apply_voltas(sy, sys_measures, vstate):
    """Mark the first/last measure covered by each bracket segment of this system."""
    for seg in sorted(sy.get('voltas', []), key=lambda g: g['x1']):
        covered = [m for m in sys_measures if m['events'] and
                   min(e['x'] for e in m['events']) >= seg['x1'] - 1.5 and
                   max(e['x'] for e in m['events']) <= seg['x2'] + 1.0]
        if not covered:
            continue
        if seg['label']:
            covered[0]['volta_start'] = seg['label']
        elif covered[0] is sys_measures[0] and vstate.get('last_end') is not None:
            # an unlabeled bracket at the very start of the line continues the previous line's bracket: what looked
            # like its end (a tick at the line break) was only the break
            vstate['last_end'].pop('volta_end', None)
        vstate['last_end'] = None
        if seg.get('right_tick', True):                 # no end tick: the bracket is still open (continues on the next line)
            covered[-1]['volta_end'] = True
            vstate['last_end'] = covered[-1]


def assign_scripts(systems, ir):
    """Fermatas sit centred over a note/rest; segno/coda are signs above the staff attached to the nearest event.
    Any other articulation/ornament symbol is not modelled yet and must force a review."""
    by_sys = {}
    for m in ir['measures']:
        by_sys.setdefault(m['system'], []).extend(m['events'])
    for sy in systems:
        for sc_ in sy['scripts']:
            evs = by_sys.get(sy['index'], [])
            if not evs:
                continue
            near = min(evs, key=lambda e: abs(e['x'] + HEAD_W / 2 - sc_['x']))
            t = sc_['type']
            if t in ('ufermata', 'dfermata'):
                near['fermata'] = 'up' if t == 'ufermata' else 'down'
            elif t in ('segno', 'coda', 'varcoda'):
                near.setdefault('signs', None)
                near['signs'] = (near['signs'] or []) + [t]
            else:
                ir['warnings'].append('unmodelled symbol scripts.%s' % t)


def beat_unit(t):
    """Duration of one beat as a fraction of a whole note (compound meters count dotted beats)."""
    from fractions import Fraction
    if t['den'] == 8 and t['num'] % 3 == 0 and t['num'] > 3:
        return Fraction(3, 8)
    return Fraction(1, t['den'])


def _key_between(sy, lo, hi, cur_key):
    accs = [a for a in sy['acc'] if lo < a['x'] < hi]
    naturals = [a for a in accs if a['type'] == 'natural']
    real = [a for a in accs if a['type'] in ('flat', 'sharp')]
    kinds = set(a['type'] for a in real)
    if len(kinds) > 1:
        return None
    kind, n = (kinds.pop(), len(real)) if real else ('none', 0)
    if (kind, n) == cur_key or (n == 0 and not naturals):
        return None                  # nothing found, or accidentals not found: don't invent a key change
    key = key_from_signature(kind if kind in ('flat', 'sharp') else 'flat', n)
    key['kind'] = kind
    return key


def detect_key_changes(sy, bar_xs, ev_xs, cur_key, first_check_start):
    """Key-signature accidentals sit between a clef/bar line and the next note. A different signature there
    (usually preceded by cancelling naturals) is a key change. Returns ([(first_event_x, keydict, alters)], new cur_key)."""
    changes = []
    clef_x = sy['clef']['x'] if sy['clef'] else 0
    boundaries = []
    if first_check_start and ev_xs:
        boundaries.append((clef_x + 2.0, ev_xs[0]))
    for bx in bar_xs:
        nxt = [x for x in ev_xs if x > bx + 1.0]
        if nxt:
            boundaries.append((bx + 1.0, nxt[0]))
    for lo, first_event in sorted(boundaries, key=lambda b: b[1]):
        k = _key_between(sy, lo, first_event - 2.0, cur_key)
        if k:
            cur_key = (k['kind'], k['count'])
            kd = {kk: k[kk] for kk in ('tonic', 'mode', 'count', 'kind')}
            changes.append((first_event, kd, key_alters(k['kind'] if k['kind'] in ('flat', 'sharp') else 'flat', k['count'])))
    return changes, cur_key
