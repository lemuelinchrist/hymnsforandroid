"""Derive the guitar sheet from the piano .ly (DESIGN.md §10.2).

Conservative on purpose: only steps that never drop a chord the hymnal.net guitar sheets keep.
  1. capo from the piano key (table, §10.1)
  2. chords moved down by the capo as an interval (spelling stays right); melody and key unchanged
  3. slash basses removed
  4. a chord equal to the one already sounding becomes a spacer of the same length
  5. capo text: C/CS as a markup on the first note, other groups as a line under the title

usage:
  python3 tools/guitar_from_piano.py ly/piano/E5.ly [-o out.ly]       one file (stdout without -o)
  python3 tools/guitar_from_piano.py --all [--out build/guitar_derived] [--drop-short]
  python3 tools/guitar_from_piano.py --check [--out build/guitar_derived]   compare with ly/guitar/ (removed 2026-10-08; restore from git: 1fcdba84)
  python3 tools/guitar_from_piano.py --compile [-j 12] [HYMN ...]   render to SVG; a sheet that spills onto a second
      page is derived again with the gap above the verse block 2.5 staff spaces smaller (like hymnal.net's own guitar
      sheets do) and rendered again
"""
import argparse
import collections
import os
import re
import sys
from fractions import Fraction as F

HERE = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
LETTERS = 'cdefgab'
NAT = dict(c=0, d=2, e=4, f=5, g=7, a=9, b=11)
# capo per piano key (pitch class); the observed choices for 11 keys, the rest by the same pattern (target D/G/C/A/E)
CAPO = {0: 0, 1: 1, 2: 0, 3: 1, 4: 2, 5: 3, 6: 4, 7: 0, 8: 1, 9: 0, 10: 3, 11: 4}
# capo -> (letter steps down, semitones down)
INTERVAL = {0: (0, 0), 1: (1, 1), 2: (1, 2), 3: (2, 3), 4: (2, 4)}
NOTE = r'[a-g](?:isis|eses|is|es|s)?'
CHORD = re.compile(r'(%s|s|r|R)(\d+\*?\d*|\\breve)?(\.*)(?::([^\s/|]+))?(?:/\+?(%s))?$' % (NOTE, NOTE))


def parse_note(name):
    """'bes' -> ('b', -1); 'as' -> ('a', -1)"""
    letter, rest = name[0], name[1:]
    if rest == 's':                                # as, es
        return letter, -1
    if rest == 'ses':                              # ases
        return letter, -2
    alt = 0
    while rest:
        if rest.startswith('is'):
            alt += 1
        elif rest.startswith('es'):
            alt -= 1
        else:
            raise ValueError(name)
        rest = rest[2:]
    return letter, alt


def pc(name):
    letter, alt = parse_note(name)
    return (NAT[letter] + alt) % 12


def note_name(letter, alt):
    return letter + ('is' * alt if alt > 0 else 'es' * -alt)


def transpose_down(name, capo):
    steps, semis = INTERVAL[capo]
    letter, alt = parse_note(name)
    nl = LETTERS[(LETTERS.index(letter) - steps) % 7]
    target = (NAT[letter] + alt - semis) % 12
    nalt = (target - NAT[nl] + 6) % 12 - 6
    return note_name(nl, nalt)


def block(text, name):
    """(start, end) of the body of `name = [\\chordmode] {` ... matching `}`"""
    m = re.search(r'^%s = (?:\\chordmode |\\lyricmode )?\{' % name, text, re.M)
    if not m:
        return None
    i, depth = m.end(), 1
    while depth:
        c = text[i]
        depth += c == '{'
        depth -= c == '}'
        i += 1
    return m.end(), i - 1


def dur_value(d, dots):
    if not d or d == '\\breve':
        return None
    m = re.match(r'(\d+)(?:\*(\d+))?', d)
    v = F(1, int(m.group(1))) * (int(m.group(2)) if m.group(2) else 1)
    return v * (2 - F(1, 2 ** len(dots))) if dots else v


def system_starts(melody_body):
    """Bar numbers (count of preceding bar checks) at which a new system starts."""
    starts, bars, since_bar, pending = {0}, 0, 0, False
    for tok in melody_body.split():
        if tok == '|':
            bars += 1
            since_bar = 0
            if pending:
                starts.add(bars)
                pending = False
        elif tok == '\\break':
            if since_bar:                  # `... d'2 \break |`: the next bar starts the system
                pending = True
            else:                          # `| \break d'2`: this bar does
                starts.add(bars)
        else:
            since_bar += 1
    return starts


def convert_chords(body, capo, drop_short=False, starts=frozenset({0})):
    """Rewrite the chordmode body. Returns (new_body, n_chords_in, n_chords_out).
    A chord at the start of a system is always printed, like on the original sheets."""
    toks = re.split(r'(\s+)', body)
    sounding = None
    bar, bar_start = 0, True
    n_in = n_out = 0
    last_dur = F(1, 4)
    out = []
    for tok in toks:
        if tok == '|':
            bar += 1
            bar_start = True
        m = CHORD.match(tok) if tok and not tok.isspace() else None
        if not m:
            out.append(tok)
            continue
        at_system_start = bar_start and bar in starts
        bar_start = False
        name, d, dots, qual, bass = m.groups()
        v = dur_value(d, dots)
        if v is not None:
            last_dur = v
        if name in ('s', 'r', 'R'):
            out.append(tok)
            continue
        n_in += 1
        root = transpose_down(name, capo)
        chord = (pc(root), qual or '')
        if not at_system_start and (chord == sounding or (drop_short and last_dur <= F(1, 8) and sounding is not None)):
            out.append('s' + (d or '') + dots)            # same length, nothing printed
            continue
        sounding = chord
        n_out += 1
        out.append(root + (d or '') + dots + (':' + qual if qual else ''))
    return ''.join(out), n_in, n_out


FIRST_NOTE = re.compile(r'(?:%s|r|R)[\',]*=?[\',]*(?:\d+\*?\d*|\\breve)?\.*(?:[\[\]()~]|\\\(|\\\)|-[-.>^_!]|\\\w+)*$' % NOTE)
SKIP_ARG = {'\\clef': 1, '\\key': 2, '\\time': 1, '\\partial': 1, '\\set': 3, '\\override': 3, '\\tempo': 1, '\\mark': 1,
            '\\bar': 1, '\\tuplet': 1, '\\repeat': 2}


def add_note_markup(body, text):
    """Attach ^\\markup to the first note or rest of the melody body."""
    toks = re.split(r'(\s+)', body)
    skip = 0
    for i, tok in enumerate(toks):
        if not tok or tok.isspace():
            continue
        if skip:
            skip -= 1
            continue
        if tok in SKIP_ARG:
            skip = SKIP_ARG[tok]
            continue
        if FIRST_NOTE.match(tok):
            toks[i] = tok + '^\\markup { \\italic \\bold "%s" }' % text
            return ''.join(toks)
    raise ValueError('no first note found')


TIGHTEN = 2.5     # staff spaces taken from the gap above the verse block when the capo line pushes a sheet to two pages


def derive(text, hymn, drop_short=False, tight=False):
    """piano .ly text -> (guitar .ly text, capo)"""
    km = re.search(r'\\key (%s) \\(major|minor)' % NOTE, text)
    kpc = pc(km.group(1))
    if km.group(2) == 'minor':
        kpc = (kpc + 3) % 12                           # relative major
    capo = CAPO[kpc]
    group = re.match(r'[A-Z]+', hymn).group()
    chinese = group in ('C', 'CS')
    label = ('(吉他: Capo %d)' if chinese else '(Guitar: Capo %d)') % capo if capo else ('(吉他)' if chinese else '(Guitar)')

    out = text
    hb = block(out, 'harmonies')
    if hb:
        mb = block(out, 'melody')
        body, n_in, n_out = convert_chords(out[hb[0]:hb[1]], capo, drop_short, system_starts(out[mb[0]:mb[1]]))
        out = out[:hb[0]] + body + out[hb[1]:]
    # own line under the title block, before any instruction lines and the \vspace
    m = re.search(r'(\\raise #-?[\d.]+ \\fontsize #[\d.]+ \\fromproperty #\'header:opus\n    \}\n    )', out)
    if not m:
        raise ValueError('title block not found')
    out = out[:m.end()] + '\\fill-line { \\bold \\italic "%s" \\null }\n    ' % label + out[m.end():]
    if tight:
        out = re.sub(r"score-markup-spacing = #'\(\(basic-distance \. ([\d.]+)\) \(minimum-distance \. [\d.]+\)",
                     lambda m: "score-markup-spacing = #'((basic-distance . %.2f) (minimum-distance . %.2f)"
                     % ((max(4.0, float(m.group(1)) - TIGHTEN),) * 2), out, count=1)
    out = re.sub(r'^(% Generated by svg-to-lilypond from )pianoSvg/(\S+)\.svg',
                 r'\1pianoSvg/\2.svg; guitar derived by tools/guitar_from_piano.py (capo %d%s)'
                 % (capo, ', tight' if tight else ''), out, count=1, flags=re.M)
    return out, capo


def render(ly_path, svg_dir):
    """LilyPond -> SVG. Returns the number of pages, or 0 on failure."""
    import glob
    import subprocess
    h = os.path.basename(ly_path)[:-3]
    for old in glob.glob(os.path.join(svg_dir, h + '.svg')) + glob.glob(os.path.join(svg_dir, h + '-*.svg')):
        os.remove(old)
    r = subprocess.run(['lilypond', '-dbackend=svg', '-o', os.path.join(svg_dir, h), ly_path], capture_output=True, text=True)
    if r.returncode:
        return 0
    return len(glob.glob(os.path.join(svg_dir, h + '.svg')) + glob.glob(os.path.join(svg_dir, h + '-*.svg')))


def fit(hymn, out_dir, svg_dir, drop_short=False):
    """Derive, render; if it needs two pages derive tight and render again. Returns (hymn, pages, tight)."""
    src = open(os.path.join(HERE, 'ly/piano', hymn + '.ly'), encoding='utf-8').read()
    path = os.path.join(out_dir, hymn + '.ly')
    for tight in (False, True):
        open(path, 'w', encoding='utf-8').write(derive(src, hymn, drop_short, tight)[0])
        pages = render(path, svg_dir)
        if pages == 1:
            break
    return hymn, pages, tight


# ---------------------------------------------------------------- check against ly/guitar/

def chord_events(body):
    """[(onset, root_pc, quality)] of printed chords; slash bass ignored."""
    toks = body.split()
    t, dur, scale, out, i = F(0), F(1, 4), F(1), [], 0
    while i < len(toks):
        tok = toks[i]
        i += 1
        if tok == '\\tuplet':
            n, d = toks[i].split('/')
            scale = F(int(d), int(n))
            i += 2
            continue
        if tok == '}':
            scale = F(1)
            continue
        if tok == '\\time':
            i += 1
            continue
        m = CHORD.match(tok)
        if not m:
            continue
        name, d, dots, qual, bass = m.groups()
        v = dur_value(d, dots)
        if v is not None:
            dur = v
        if name not in ('s', 'r', 'R'):
            out.append((t, pc(name), qual or ''))
        t += dur * scale
    return out


def family(q):
    if q.startswith('m') and not q.startswith('maj'):
        return 'm'
    return q[:3] if q[:3] in ('dim', 'aug', 'sus') else ''


def check(out_dir):
    st = collections.Counter()
    worst, capo_diff = [], []
    sym_tot = sym_ok = extra_tot = 0
    for f in sorted(os.listdir(os.path.join(HERE, 'ly/guitar'))):
        dpath = os.path.join(out_dir, f)
        if not os.path.exists(dpath):
            st['not derived'] += 1
            continue
        g = open(os.path.join(HERE, 'ly/guitar', f), encoding='utf-8').read()
        d = open(dpath, encoding='utf-8').read()
        gc = re.search(r'Capo (\d)', g)
        dc = re.search(r'Capo (\d)', d)
        if (gc.group(1) if gc else '0') != (dc.group(1) if dc else '0'):
            st['X capo differs from the guitar sheet (not compared)'] += 1
            capo_diff.append('%s(%s->%s)' % (f[:-3], gc.group(1) if gc else '0', dc.group(1) if dc else '0'))
            continue
        gb, db = block(g, 'harmonies'), block(d, 'harmonies')
        if not gb or not db:
            st['no chords'] += 1
            continue
        ge, de = chord_events(g[gb[0]:gb[1]]), chord_events(d[db[0]:db[1]])
        dmap = {t: (r, family(q)) for t, r, q in de}

        def sounding(t):
            cur = None
            for x in de:
                if x[0] <= t:
                    cur = (x[1], family(x[2]))
                else:
                    break
            return cur
        ok = sum(1 for t, r, q in ge if sounding(t) == (r, family(q)))
        gt = {t for t, *_ in ge}
        extra = sum(1 for t in dmap if t not in gt)
        sym_tot += len(ge)
        sym_ok += ok
        extra_tot += extra
        if ok == len(ge) and extra == 0:
            st['A same chord changes as the guitar sheet'] += 1
        elif ok == len(ge):
            st['B guitar sheet + extra chord changes'] += 1
        else:
            st['C some chords differ from the guitar sheet'] += 1
            worst.append((len(ge) - ok, f[:-3]))
    for k in sorted(st):
        print('%5d  %s' % (st[k], k))
    print('guitar chord symbols reproduced (root + major/minor): %d / %d (%.1f%%); extra chord changes printed: %d'
          % (sym_ok, sym_tot, 100 * sym_ok / max(1, sym_tot), extra_tot))
    worst.sort(reverse=True)
    print('capo differs:', ' '.join(capo_diff))
    print('most different:', ' '.join('%s(%d)' % (h, n) for n, h in worst[:15]))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('file', nargs='?')
    ap.add_argument('-o', '--output')
    ap.add_argument('--all', action='store_true')
    ap.add_argument('--check', action='store_true')
    ap.add_argument('--compile', nargs='*', metavar='HYMN', help='render (all hymns if none given); see usage')
    ap.add_argument('-j', type=int, default=12)
    ap.add_argument('--svg', default=os.path.join(HERE, 'build/guitar_derived_svg'))
    ap.add_argument('--out', default=os.path.join(HERE, 'build/guitar_derived'))
    ap.add_argument('--drop-short', action='store_true', help='also drop chords of 1/8 or less (off by default)')
    a = ap.parse_args()
    if a.check:
        check(a.out)
        return
    if a.compile is not None:
        from concurrent.futures import ProcessPoolExecutor
        os.makedirs(a.out, exist_ok=True)
        os.makedirs(a.svg, exist_ok=True)
        hymns = a.compile or sorted(f[:-3] for f in os.listdir(os.path.join(HERE, 'ly/piano')))
        res = collections.Counter()
        with ProcessPoolExecutor(a.j) as ex:
            for h, pages, tight in ex.map(fit, hymns, [a.out] * len(hymns), [a.svg] * len(hymns), [a.drop_short] * len(hymns)):
                k = 'FAILED' if not pages else '%d page%s%s' % (pages, 's' if pages > 1 else '', ', tight' if tight else '')
                res[k] += 1
                if not pages or pages > 1 or tight:
                    print(h, k)
        print(dict(res))
        return
    if a.all:
        os.makedirs(a.out, exist_ok=True)
        caps = collections.Counter()
        bad = []
        for f in sorted(os.listdir(os.path.join(HERE, 'ly/piano'))):
            try:
                text, capo = derive(open(os.path.join(HERE, 'ly/piano', f), encoding='utf-8').read(), f[:-3], a.drop_short)
            except Exception as e:  # noqa: BLE001
                bad.append('%s: %s' % (f, e))
                continue
            caps[capo] += 1
            open(os.path.join(a.out, f), 'w', encoding='utf-8').write(text)
        print('derived %d files into %s; capo %s' % (sum(caps.values()), a.out, dict(sorted(caps.items()))))
        for b in bad:
            print('FAILED', b)
        return
    hymn = os.path.basename(a.file)[:-3]
    text, capo = derive(open(a.file, encoding='utf-8').read(), hymn, a.drop_short)
    if a.output:
        open(a.output, 'w', encoding='utf-8').write(text)
    else:
        sys.stdout.write(text)


if __name__ == '__main__':
    main()
