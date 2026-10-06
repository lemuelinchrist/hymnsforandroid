"""Full pipeline: SVG -> IR -> .ly -> LilyPond SVG -> IR' and verification (DESIGN.md §6, §9).

usage:
  python3 tools/convert.py FILE.svg [FILE.svg ...]
  python3 tools/convert.py --group E [--variant piano] [--limit N] [-j 8]
Outputs under build/: ir/<variant>/<id>.json, ly/<variant>/<id>.ly, svg/<variant>/<id>.svg, report_<group>_<variant>.json
"""
import argparse
import collections
import glob
import json
import multiprocessing
import os
import re
import subprocess
import sys

sys.path.insert(0, os.path.dirname(__file__))
import pagefit  # noqa: E402
import verify  # noqa: E402
from emit_ly import emit  # noqa: E402
from recognize import recognize, RecognitionError  # noqa: E402

HERE = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
ASSETS = os.path.join(HERE, '..', 'app/src/main/assets')
BUILD = os.path.join(HERE, 'build')


def event_sig(e):
    t = e.get('tuplet')
    base = (e['kind'], e['dur'], e['dots'], (e.get('chord') or '').replace('o', '') or None,   # LilyPond draws the dim circle as a glyph, not text
             e.get('tie', False), e.get('slur_start', False),
            e.get('slur_end', False), (t['num'], t['den'], t['start'], t['end']) if t else None)
    if e['kind'] == 'note':
        base += (e['letter'], e['octave'], e['alter'], bool(e.get('cross')))
    base += (tuple((m['text'], bool(m['boxed'])) for m in (e.get('marks') or [])),)
    base += (e.get('fermata'), tuple(e.get('signs') or ()))
    # chord changes inside a sustained note: the beat offset is estimated from layout, which differs per
    # LilyPond version, so only the chord order is compared
    base += (tuple(c['text'].replace('o', '') for c in (e.get('mid_chords') or [])),)
    return base                      # lyrics are compared as sequences (lyric_seq): placement is ambiguous in a re-render


def lyric_seq(ir):
    """Per lyric line: ordered (syllable, hyphen-follows) over all notes."""
    lines = collections.defaultdict(list)
    for m in ir['measures']:
        for e in m['events']:
            for k, v in (e.get('lyrics') or {}).items():
                lines[int(k)].append(v['text'])
    return dict(lines)


def compare_ir(a, b):
    """Differences between two IRs in musical/textual content. Layout numbers are ignored."""
    diffs = []
    if a['key'] != b['key']:
        diffs.append('key %s vs %s' % (a['key'], b['key']))
    if a['time'] != b['time']:
        diffs.append('time %s vs %s' % (a['time'], b['time']))
    if a.get('tempo') != b.get('tempo'):
        diffs.append('tempo %s vs %s' % (a.get('tempo'), b.get('tempo')))
    sa, sb = [s['measures'] for s in a['systems']], [s['measures'] for s in b['systems']]
    if sa != sb:
        diffs.append('system layout (measures per system) %s vs %s' % (sa, sb))
    if len(a['measures']) != len(b['measures']):
        diffs.append('measure count %d vs %d' % (len(a['measures']), len(b['measures'])))
    for ma, mb in zip(a['measures'], b['measures']):
        ea, eb = ma['events'], mb['events']
        if len(ea) != len(eb):
            diffs.append('measure %d: %d vs %d events' % (ma['n'], len(ea), len(eb)))
            continue
        ka = (ma.get('key_change') or {}).get('count'), (ma.get('key_change') or {}).get('kind')
        kb = (mb.get('key_change') or {}).get('count'), (mb.get('key_change') or {}).get('kind')
        if ka != kb:
            diffs.append('measure %d key change %s vs %s' % (ma['n'], ka, kb))
        nd = lambda lab: lab.replace('\u2013', '').replace('-', '') if lab else lab   # the dash glyph differs per version
        if (ma.get('bar_after'), nd(ma.get('volta_start')), bool(ma.get('volta_end'))) != \
                (mb.get('bar_after'), nd(mb.get('volta_start')), bool(mb.get('volta_end'))):
            diffs.append('measure %d bar/volta: %s vs %s' % (
                ma['n'], (ma.get('bar_after'), ma.get('volta_start'), bool(ma.get('volta_end'))),
                (mb.get('bar_after'), mb.get('volta_start'), bool(mb.get('volta_end')))))
        for k, (x, y) in enumerate(zip(ea, eb)):
            if event_sig(x) != event_sig(y):
                diffs.append('measure %d event %d: %s vs %s' % (ma['n'], k + 1, event_sig(x), event_sig(y)))
        if len(diffs) > 12:
            break
    la, lb = lyric_seq(a), lyric_seq(b)
    if la != lb:
        for k in sorted(set(la) | set(lb)):
            if la.get(k) != lb.get(k):
                xs, ys = la.get(k, []), lb.get(k, [])
                i = next((i for i, (p, q_) in enumerate(zip(xs, ys)) if p != q_), min(len(xs), len(ys)))
                diffs.append('lyric line %d differs at syllable %d: %s vs %s (counts %d/%d)' % (
                    k, i + 1, xs[i:i + 2], ys[i:i + 2], len(xs), len(ys)))
    ta, tb = a['text'], b['text']
    for k in ('title', 'subtitle', 'number'):
        va = (ta[k] or {}).get('text')
        vb = (tb[k] or {}).get('text')
        if va != vb:
            diffs.append('%s %r vs %r' % (k, va, vb))
    if ''.join(f['text'] for f in ta['footer']).replace(' ', '') != ''.join(f['text'] for f in tb['footer']).replace(' ', ''):
        diffs.append('footer differs')
    if True:
        def plain(cols):             # positions ('pos') are layout, not content
            return [(c['x'] and 0, [(st['number'], st['lines']) for st in c['stanzas']]) for c in cols]
        va, vb = plain(ta['verses']), plain(tb['verses'])
        if va != vb:
            diffs.append('verse block differs')
    if [i['text'] for i in ta['instructions']] != [i['text'] for i in tb['instructions']]:
        diffs.append('instructions %s vs %s' % ([i['text'] for i in ta['instructions']],
                                                  [i['text'] for i in tb['instructions']]))
    return diffs


def glyph_counts(path):
    """Counts of music symbols by name, independent of the IR (a model-free coverage check)."""
    from recognize import gname
    from svgscan import parse, is_sans
    c = collections.Counter()
    sc = parse(path)
    for gid, x, y, scale in sc.glyphs:
        n = gname(gid)
        if n.startswith(('noteheads.', 'rests.', 'scripts.', 'dots.')) or n.startswith('accidentals.'):
            c[n] += 1
    # chord-name text fragments (letters, quality, '/'): same chord names must print the same number of pieces
    # (the 'o' of a diminished chord is text in the originals but a drawn circle in LilyPond 2.24: not counted)
    c['chord_text_chars'] = sum(len(t[0].replace('o', '')) for t in sc.texts if is_sans(t[3]) and t[4] < 2.1)
    return c


def coverage_diff(orig_path, new_path, pages_ok=True):
    """Symbols present in the original but missing/extra in our render. (Flags and beams are excluded: we
    beam explicitly; time-signature digits and labels differ in size per version.)"""
    a, b = glyph_counts(orig_path), glyph_counts(new_path)
    out = []
    for k in sorted(set(a) | set(b)):
        if a.get(k, 0) != b.get(k, 0):
            out.append('%s: original %d, ours %d' % (k, a.get(k, 0), b.get(k, 0)))
    return out


def layout_deltas(a, b):
    """Target minus measured positions (staff units) of the things the layout parameters control."""
    d = {}
    try:
        d['top0'] = a['systems'][0]['top'] - b['systems'][0]['top']
        ta, tb = a['text']['title'], b['text']['title']
        if ta and tb:
            d['title'] = ta['y'] - tb['y']
        ga = [y['top'] for y in a['systems']]
        gb = [y['top'] for y in b['systems']]
        if len(ga) > 1 and len(gb) == len(ga):
            d['gap'] = (ga[-1] - ga[0]) / (len(ga) - 1) - (gb[-1] - gb[0]) / (len(gb) - 1)
        va, vb = a['text']['verses'], b['text']['verses']
        if va and vb:
            d['verse'] = min(c['y'] for c in va) - min(c['y'] for c in vb)
    except (KeyError, IndexError, TypeError):
        pass
    return d


def next_vspace(history, target):
    """history: [(vspace, measured_top0)]; measured top0 is non-decreasing in vspace but flat/clamped for low
    values. Bracket the target and interpolate; walk with growing steps until a bracket exists."""
    below = [(v, f) for v, f in history if f < target - 0.05]       # staff too high on the page -> need bigger vspace
    above = [(v, f) for v, f in history if f > target + 0.05]       # staff too low -> need smaller vspace
    v_last, f_last = history[-1]
    if below and above:
        v0, f0 = max(below)
        v1, f1 = min(above)
        if v1 <= v0:
            return (v0 + v1) / 2
        if f1 == f0:
            return (v0 + v1) / 2
        t = (target - f0) / (f1 - f0)
        return v0 + min(max(t, 0.1), 0.9) * (v1 - v0)               # keep it strictly inside the bracket
    step = (target - f_last) / 4.0
    n = len(history)
    step = max(abs(step), 0.4 * (1.6 ** (n - 1))) * (1 if target > f_last else -1)
    return v_last + step


def adjust_params(p, d, history, got_top0, target_top0):
    p = dict(p)
    if 'title' in d:
        p['top_margin'] += d['title'] * p.get('mm_per_space', 1.406)
        got_top0 += d['title']                            # moving the title also moves the staff
    history.append((p['vspace'], got_top0))
    p['vspace'] = next_vspace(history, target_top0)
    p['sys_gap'] += d.get('gap', 0)
    if 'verse' in d:
        p['score_gap'] += d['verse'] - d.get('top0', 0) - d.get('title', 0)
    return p


def render(ly_path, svg_out):
    """Render into build/ (git-ignored). LilyPond names extra pages <base>-page2.svg etc."""
    os.makedirs(os.path.dirname(svg_out), exist_ok=True)
    base = svg_out[:-4]
    def mine():          # exact match only: E1.svg, E1-page2.svg ... never E10.svg
        return sorted(f for f in glob.glob(base + '*.svg') if re.fullmatch(r'(-page\d+|-\d+)?\.svg', f[len(base):]))
    for old in mine():
        os.remove(old)
    r = subprocess.run(['lilypond', '-dbackend=svg', '-o', base, ly_path], capture_output=True, text=True)
    produced = mine()
    msgs = [l for l in (r.stderr + r.stdout).splitlines() if re.search(r'warning|error|fatal', l, re.I)
            and 'unsupported formats' not in l]
    if r.returncode != 0 or not produced:
        return None, msgs, 0
    return produced[0], msgs, len(produced)


def process(path, variant=None):
    """Convert with the wide lyric spacing; if that ends in REVIEW (a dense system overflows and LilyPond squeezes
    the notes), convert again with LilyPond's own spacing and keep that result when it is better."""
    res = process_once(path, variant, LYRIC_SPACE)
    if res.get('status') == 'REVIEW' or res.get('squeezed'):
        res2 = process_once(path, variant, None)
        if (res2.get('status') != 'REVIEW' and res.get('status') == 'REVIEW') or \
                (res2.get('status') != 'REVIEW' and res2.get('squeezed', 0) < res.get('squeezed', 0)):
            res2['lyric_space'] = 'default'
            return res2
        process_once(path, variant, LYRIC_SPACE)       # leave the .ly/.svg of the preferred version in build/
    return res


def squeezed_events(ir, ir2):
    """Number of neighbouring events that our render put less than half as far apart as the original (a system that
    overflowed with the wide lyric spacing is compressed by LilyPond; the checks do not see that)."""
    a = [e for m in ir['measures'] for e in m['events']]
    b = [e for m in ir2['measures'] for e in m['events']]
    if len(a) != len(b):
        return 0
    n = 0
    for i in range(1, len(a)):
        if a[i]['x'] > a[i - 1]['x'] and b[i]['x'] > b[i - 1]['x'] and a[i]['x'] - a[i - 1]['x'] > 3.0 and \
                (b[i]['x'] - b[i - 1]['x']) < 0.5 * (a[i]['x'] - a[i - 1]['x']):
            n += 1
    return n


LYRIC_SPACE = 2.5


def process_once(path, variant, lyric_space):
    hid = os.path.basename(path)[:-4]
    variant = variant or os.path.basename(os.path.dirname(path)).replace('Svg', '')
    res = {'id': hid, 'variant': variant}
    try:
        ir = recognize(path)
    except RecognitionError as e:
        res.update(status='recognition_error', detail=str(e)[:160])
        return res
    except Exception as e:  # noqa: BLE001
        res.update(status='crash', detail=repr(e)[:160])
        return res
    res['hyphens_restored'] = verify.repair_hyphens(ir, hid)
    res['v1'] = verify.v1_measures(ir)
    v3 = verify.v3_tune(ir, hid)
    res['v3'] = None if v3 is None else v3[0]
    v4 = verify.v4_midi(ir, hid)
    res['v4'] = None if v4 is None else v4[0]
    miss = verify.v8_lyrics(ir, hid)
    res['v8'] = miss
    res['warnings'] = ir['warnings']
    os.makedirs(os.path.join(BUILD, 'ir', variant), exist_ok=True)
    json.dump(ir, open(os.path.join(BUILD, 'ir', variant, hid + '.json'), 'w'))
    from emit_ly import default_params
    params = default_params(ir)
    params['lyric_space'] = lyric_space
    params['mm_per_space'] = 215.9 / ir.get('page_w', 153.5737)
    ir2 = None
    history = []
    overflow = ir.get('max_y', 0) > 198.75 * ir.get('page_w', 153.5737) / 153.5737
    best = None                                   # best attempt that kept the page count of the original

    def attempt_once(params):
        text, ewarn = emit(ir, variant, params)
        ly_path = os.path.join(BUILD, 'ly', variant, hid + '.ly')
        os.makedirs(os.path.dirname(ly_path), exist_ok=True)
        open(ly_path, 'w', encoding='utf8').write(text)
        svg_path, msgs, pages = render(ly_path, os.path.join(BUILD, 'svg', variant, hid + '.svg'))
        if svg_path is None:
            return dict(err=('render_error', '; '.join(msgs[:2])[:200]))
        try:
            ir2 = recognize(svg_path)
        except Exception as e:  # noqa: BLE001
            return dict(err=('roundtrip_recognition_error', repr(e)[:200]))
        return dict(ewarn=ewarn, svg_path=svg_path, msgs=msgs, pages=pages, ir2=ir2, d=layout_deltas(ir, ir2))

    for attempt in range(9):                      # emit -> render -> measure -> correct layout (max 8 corrections)
        try:
            r = attempt_once(params)
        except Exception as e:  # noqa: BLE001
            res.update(status='emit_error', detail=repr(e)[:160])
            return res
        if r.get('err'):
            res.update(status=r['err'][0], detail=r['err'][1])
            return res
        ewarn, svg_path, msgs, pages, ir2, d = (r[k] for k in ('ewarn', 'svg_path', 'msgs', 'pages', 'ir2', 'd'))
        if attempt == 0 and pages != 1 and not overflow:
            # a tall sheet (its lowest text is close to the footer) spills onto page 2 with the standard bottom
            # margin: let it use more of the page before the layout search starts
            for bm in (9.0, 6.0, 3.0):
                params['bottom_margin'] = bm
                r2 = attempt_once(params)
                if not r2.get('err') and r2['pages'] == 1:
                    r = r2
                    ewarn, svg_path, msgs, pages, ir2, d = (r[k] for k in ('ewarn', 'svg_path', 'msgs', 'pages', 'ir2', 'd'))
                    break
            else:
                params.pop('bottom_margin', None)
                r = attempt_once(params)
                ewarn, svg_path, msgs, pages, ir2, d = (r[k] for k in ('ewarn', 'svg_path', 'msgs', 'pages', 'ir2', 'd'))
        if os.environ.get('CONVERT_DEBUG'):
            print('attempt', attempt, 'vspace %.2f top_margin %.2f' % (params['vspace'], params['top_margin']), 'pages', pages, d)
        if (pages == 1 or overflow) and d:
            score = max(abs(v) for v in d.values())
            if best is None or score < best[0]:
                best = (score, params)
        if attempt == 8 or not d or max(abs(v) for v in d.values()) < 0.25:
            break
        params = adjust_params(params, d, history, ir2['systems'][0]['top'], ir['systems'][0]['top'])
    if pages != 1 and not overflow and best is not None:      # the search overshot onto a second page: go back
        r = attempt_once(best[1])
        if not r.get('err'):
            ewarn, svg_path, msgs, pages, ir2, d = (r[k] for k in ('ewarn', 'svg_path', 'msgs', 'pages', 'ir2', 'd'))
    res['emit_warnings'] = ewarn
    res['lilypond_msgs'] = msgs[:3]
    res['pages'] = pages
    res['layout_err'] = d
    res['original_overflows_page'] = overflow
    cmp_ir = ir
    if overflow and pages > 1:
        # our render continues on page 2 where the original's SVG just ran off the page: compare page 1 only
        k = len(ir2['systems'])
        cmp_ir = dict(ir, systems=ir['systems'][:k], measures=[m for m in ir['measures'] if m['system'] < k])
    diffs = compare_ir(cmp_ir, ir2)
    if overflow and pages > 1:
        diffs = [d for d in diffs if not d.startswith(('verse block differs', 'footer differs'))]
        res['tail_unverified'] = True
    res['v2'] = diffs
    res['squeezed'] = 0 if (diffs or (overflow and pages > 1)) else squeezed_events(ir, ir2)
    if pages == 1:
        cov = coverage_diff(path, svg_path)
        res['coverage'] = cov
        res['pagefit'] = pagefit.page_fit_problems(svg_path, path)
        if res['pagefit']:
            cov = cov + ['page fit: ' + p for p in res['pagefit']]     # same effect: not a clean render
    else:
        cov = []
    hard_ok = (not res['v1'] and not diffs and not ir['warnings'] and not ewarn and
               (pages == 1 or overflow) and not cov)
    unverified = []                    # independent-data checks that disagree (the database may be the wrong one)
    if not (res['v3'] in (None, 'exact', 'soft') or res['v4'] == 'exact'):
        unverified.append('tune code')
    if not verify.v8_ok(miss, verify.ir_words(ir)):
        unverified.append('lyrics vs DB')
    res['unverified'] = unverified
    # The only failing check is the bar arithmetic (V1) while the round trip, the model-free symbol counts and the
    # warnings all pass: the original itself prints bars that do not add up (short final bar, mis-barred source) and
    # our .ly reproduces it glyph for glyph. Kept apart from ACCEPT so that nobody mistakes it for musically clean.
    v1_only = bool(res['v1']) and not diffs and not ir['warnings'] and not ewarn and pages == 1 and not cov
    if v1_only:
        res['status'] = 'ACCEPT_SOURCE_BAR_SUM'
    elif not hard_ok:
        res['status'] = 'REVIEW'
    elif res.get('tail_unverified'):
        res['status'] = 'ACCEPT_TAIL_UNVERIFIED'
    elif unverified:
        res['status'] = 'ACCEPT_DB_MISMATCH'
    else:
        res['status'] = 'ACCEPT'
    return res


def _work(args):
    return process(*args)


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('files', nargs='*')
    ap.add_argument('--group', default=None)
    ap.add_argument('--variant', default='piano')
    ap.add_argument('--limit', type=int, default=0)
    ap.add_argument('-j', type=int, default=max(1, (os.cpu_count() or 2) - 1))
    ap.add_argument('--show', type=int, default=10)
    a = ap.parse_args()
    if a.files:
        paths = a.files
    else:
        paths = sorted(glob.glob(os.path.join(ASSETS, a.variant + 'Svg', a.group + '[0-9]*.svg')),
                       key=lambda p: int(re.search(r'(\d+)\.svg', p).group(1)))
    if a.limit:
        paths = paths[:a.limit]
    with multiprocessing.Pool(a.j) as pool:
        results = pool.map(_work, [(p, None) for p in paths], chunksize=4)
    tally = collections.Counter(r['status'] for r in results)
    print('files:', len(results), dict(tally))
    tag = (a.group or 'files') + '_' + a.variant
    json.dump(results, open(os.path.join(BUILD, 'report_%s.json' % tag), 'w'), indent=1)
    shown = collections.Counter()
    for r in results:
        if r['status'] == 'ACCEPT':
            continue
        why = r.get('detail') or (r.get('v1') or [None])[0] or (r.get('v2') or [None])[0] or \
            ('lyrics not in DB: %s' % r['v8'][:6] if r.get('v8') and len(set(r['v8'])) > 2 else None) or \
            ('coverage: %s' % r['coverage'][:2] if r.get('coverage') else None) or \
            (r.get('warnings') or [None])[0] or (r.get('emit_warnings') or [None])[0] or r.get('v3')
        key = r['status']
        if shown[key] < a.show:
            shown[key] += 1
            print('  [%s] %s: %s' % (key, r['id'], str(why)[:150]))
