"""Check that LilyPond `\\transpose` works on a converted hymn.

usage: python3 tools/transpose_check.py piano/E625 [piano/NS516 ...] [--to d] [--to f ...]

For each sheet and target key letter (transposing from c): wrap melody and chords in `\\transpose c <to>`, render,
read the render back with the recognizer and check
  1. every note moved by the same number of semitones (octave-correct), every chord root and the key tonic too,
  2. everything else is unchanged (durations, ties, slurs, beams, lyrics, marks, voltas, bar types, chord order,
     slash-chord bass, qualities, text),
  3. transposing back down (`\\transpose <to> c` on the transposed source) gives exactly the original IR
     (the same comparison convert.py uses).
Works on build/ly/<variant>/<id>.ly (run tools/convert.py first) or ly/<variant>/<id>.ly.
"""
import argparse
import json
import os
import re
import sys

HERE = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
sys.path.insert(0, os.path.dirname(__file__))
from convert import compare_ir, render, BUILD  # noqa: E402
from recognize import recognize  # noqa: E402

PC = {'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11}


def semis(e):
    return 12 * e['octave'] + PC[e['letter']] + (e.get('alter') or 0)


def chord_parts(text):
    """'F#m7/C#' -> (root semitone class, quality, bass class or None). Accepts the glyph spellings of our IR."""
    m = re.match(r'^([A-G])([#b♯♭]*)(.*?)(?:/([A-G])([#b♯♭]*))?$', text)
    if not m:
        return None
    def pc(l, acc):
        return (PC[l] + sum(1 if a in '#♯' else -1 for a in acc)) % 12
    return pc(m.group(1), m.group(2)), m.group(3), (pc(m.group(4), m.group(5)) if m.group(4) else None)


def wrap(ly, *steps):
    """steps: (from, to) pairs applied in order, e.g. ('c','d') or ('c','d'), ('d','c')."""
    t = ''.join('\\transpose %s %s ' % s for s in reversed(steps))
    ly = ly.replace('\\new Staff { \\melody }', '\\new Staff { %s\\melody }' % t, 1)
    ly = re.sub(r'\} \\harmonies\n', lambda m: '} %s\\harmonies\n' % t, ly, count=1)
    if '\\transpose' not in ly:
        raise SystemExit('could not find melody/harmonies in the source')
    return ly


def render_ir(ly_text, tag):
    d = os.path.join(BUILD, 'transpose')
    os.makedirs(d, exist_ok=True)
    tag = re.sub(r'[^A-Za-z0-9_]', lambda m: {',': 'D', "'": 'U'}.get(m.group(0), '_'), tag)
    p = os.path.join(d, tag + '.ly')
    open(p, 'w', encoding='utf8').write(ly_text)
    svg, msgs, pages = render(p, os.path.join(d, tag + '.svg'))
    if svg is None:
        raise RuntimeError('render failed: %s' % msgs[:2])
    return recognize(svg), pages, msgs


def events(ir):
    return [e for m in ir['measures'] for e in m['events']]


def check(variant, hid, to):
    src = os.path.join(HERE, 'ly', variant, hid + '.ly')
    if not os.path.exists(src):
        src = os.path.join(BUILD, 'ly', variant, hid + '.ly')
    ly = open(src, encoding='utf8').read()
    orig = recognize(os.path.join(HERE, '..', 'app/src/main/assets', variant + 'Svg', hid + '.svg'))
    up_ly = wrap(ly, ('c', to))
    up, pages, msgs = render_ir(up_ly, '%s_%s_to_%s' % (variant, hid, to))
    problems = []
    if pages != 1:
        problems.append('%d pages' % pages)
    ea, eb = events(orig), events(up)
    if len(ea) != len(eb):
        return ['event count %d vs %d' % (len(ea), len(eb))]
    shifts = set()
    for a, b in zip(ea, eb):
        if a['kind'] == 'note':
            shifts.add(semis(b) - semis(a))
    if len(shifts) != 1:
        problems.append('note shifts differ: %s' % sorted(shifts))
    shift = next(iter(shifts)) if len(shifts) == 1 else None
    if shift is not None:
        for a, b in zip(ea, eb):
            ca = [a.get('chord')] + [c['text'] for c in (a.get('mid_chords') or [])]
            cb = [b.get('chord')] + [c['text'] for c in (b.get('mid_chords') or [])]
            ca, cb = [c for c in ca if c], [c for c in cb if c]
            if len(ca) != len(cb):
                problems.append('chord count differs on a note'); break
            for x, y in zip(ca, cb):
                px, py = chord_parts(x), chord_parts(y)
                if not px or not py:
                    problems.append('unparsable chord %r/%r' % (x, y)); break
                ok = (py[0] - px[0]) % 12 == shift % 12 and px[1] == py[1] and \
                     ((px[2] is None and py[2] is None) or (px[2] is not None and py[2] is not None and
                                                           (py[2] - px[2]) % 12 == shift % 12))
                if not ok:
                    problems.append('chord %s -> %s is not a %+d transposition' % (x, y, shift)); break
    if shift is not None:       # key signature: tonic moved by the same interval (count of accidentals follows from it)
        def tonic_pc(k):
            return (PC[k['tonic'][0]] + sum(1 if c in '+#♯s' else -1 for c in k['tonic'][1:])) % 12
        if (tonic_pc(up['key']) - tonic_pc(orig['key'])) % 12 != shift % 12:
            problems.append('key %s -> %s is not a %+d transposition' % (orig['key']['tonic'], up['key']['tonic'], shift))
    # everything except pitches / chords must be identical: neutralise those fields and compare
    def qual(c):                       # chord text without its pitch letters: quality and the presence of a bass
        if not c:
            return c
        cp = chord_parts(c)
        return ('%s%s' % (cp[1], '/' if cp[2] is not None else '')) if cp else c

    def neutral(ir):
        ir = json.loads(json.dumps(ir))
        for m in ir['measures']:
            for e in m['events']:
                if e['kind'] == 'note':
                    e['letter'], e['octave'], e['alter'] = 'C', 4, 0
                e['chord'] = qual(e.get('chord'))
                for c in (e.get('mid_chords') or []):
                    c['text'] = qual(c['text'])
            if m.get('key_change'):
                m['key_change'] = {'count': None, 'kind': None}
        ir['key'] = None
        return ir
    diffs = compare_ir(neutral(orig), neutral(up))
    problems += ['non-pitch difference: ' + d for d in diffs[:3]]
    # round trip: transpose back and compare exactly (the same V2 comparison as the converter)
    back_ly = wrap(ly, ('c', to), (to, 'c'))
    back, pages2, _ = render_ir(back_ly, '%s_%s_back_%s' % (variant, hid, to))
    rt = compare_ir(orig, back)
    problems += ['round trip: ' + d for d in rt[:3]]
    return problems, shift, up['key']


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('ids', nargs='+')
    ap.add_argument('--to', action='append')
    a = ap.parse_args()
    for vid in a.ids:
        variant, hid = vid.split('/')
        for to in (a.to or ['d', 'f']):
            try:
                res = check(variant, hid, to)
            except Exception as e:  # noqa: BLE001
                print('%-14s c->%s ERROR %r' % (vid, to, e)); continue
            if isinstance(res, list):
                print('%-14s c->%s FAIL %s' % (vid, to, res)); continue
            problems, shift, key = res
            print('%-14s c->%s %s  shift %+d semitones, key %s%s' % (
                vid, to, 'OK  ' if not problems else 'FAIL', shift if shift is not None else 0, key['tonic'] if key else '?',
                '' if not problems else '  ' + '; '.join(problems)))
