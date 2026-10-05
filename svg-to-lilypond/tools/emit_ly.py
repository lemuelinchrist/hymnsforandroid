"""IR -> LilyPond source (DESIGN.md §8). Pure function: no layout guessing beyond measured offsets.

usage: python3 tools/emit_ly.py ir.json > out.ly      (normally called from convert.py)
"""
import re
import sys
from fractions import Fraction

LY_KEY = {'C': 'c', 'F': 'f', 'B-': 'bes', 'E-': 'ees', 'A-': 'aes', 'D-': 'des', 'G-': 'ges', 'C-': 'ces',
          'G': 'g', 'D': 'd', 'A': 'a', 'E': 'e', 'B': 'b', 'F+': 'fis', 'C+': 'cis'}
QUALITY = {'': '', 'm': ':m', '7': ':7', 'm7': ':m7', 'maj7': ':maj7', 'sus4': ':sus4', 'sus2': ':sus2',
           '+': ':aug', 'o': ':dim', 'o7': ':dim7', 'm6': ':m6', '6': ':6', '9': ':9', 'm9': ':m9', 'maj9': ':maj9'}


def q(s):
    return '"' + s.replace('\\', '\\\\').replace('"', '\\"') + '"'


def ly_pitch(letter, alter, octave):
    name = letter.lower() + {0: '', 1: 'is', -1: 'es', 2: 'isis', -2: 'eses'}[alter]
    return name + ("'" * (octave - 3) if octave >= 3 else ',' * (3 - octave))


def ly_dur(dur, dots):
    return str(dur) + '.' * dots


def frac_to_durations(f):
    """Express a duration (fraction of a whole) as a LilyPond duration string, e.g. 3/16 -> '8.'"""
    parts = []
    for dur in (1, 2, 4, 8, 16, 32):
        for dots in (3, 2, 1, 0):
            val = Fraction(1, dur) * (2 - Fraction(1, 2 ** dots))
            if val == f:
                return ly_dur(dur, dots)
    # sum of two simple values
    for d1 in (1, 2, 4, 8, 16, 32):
        for dots in (0, 1):
            v1 = Fraction(1, d1) * (2 - Fraction(1, 2 ** dots))
            if v1 < f:
                rest = f - v1
                try:
                    return ly_dur(d1, dots) + ' ' + frac_to_durations(rest)
                except ValueError:
                    pass
    raise ValueError('cannot express %s' % f)


def chord_to_ly(text):
    m = re.fullmatch(r'([A-G])([b#]?)(.*?)(?:/([A-G])([b#]?))?', text)
    if not m or m.group(3) not in QUALITY:
        return None
    root = m.group(1).lower() + {'': '', 'b': 'es', '#': 'is'}[m.group(2)]
    out = root + QUALITY[m.group(3)]
    if m.group(4):
        out += '/' + m.group(4).lower() + {'': '', 'b': 'es', '#': 'is'}[m.group(5)]
    return out


def time_token(t):
    sym = '\\numericTimeSignature ' if (t['symbol'] is None and (t['num'], t['den']) in ((4, 4), (2, 2))) else \
        '\\defaultTimeSignature '
    return '%s\\time %d/%d' % (sym, t['num'], t['den'])


def event_dur(e):
    return ly_dur(e['dur'], e['dots'])


def walk_events(ir):
    """Yield ('tuplet_open', ratio) / ('event', e) / ('tuplet_close',) / ('bar', measure) / ('break',) in order."""
    sys_last = {}
    for m in ir['measures']:
        sys_last[m['system']] = m['n']
    ms = ir['measures']
    for mi, m in enumerate(ms):
        prev_ended = mi > 0 and ms[mi - 1].get('volta_end')
        if m.get('volta_start') and not prev_ended:
            yield ('volta_cmd', [m['volta_start']])
        if m.get('key_change'):
            yield ('key', m['key_change'])
        if m.get('time_change'):
            yield ('time', m['time_change'])
        for e in m['events']:
            t = e.get('tuplet')
            if t and t['start']:
                yield ('tuplet_open', t)
            yield ('event', e)
            if t and t['end']:
                yield ('tuplet_close', t)
        last_measure = mi == len(ir['measures']) - 1
        if sys_last.get(m['system']) == m['n'] and not last_measure:
            yield ('break', m)
        yield ('bar', m, last_measure)
        if m.get('volta_end'):
            nxt = ms[mi + 1] if mi + 1 < len(ms) else None
            yield ('volta_cmd', [None] + ([nxt['volta_start']] if nxt and nxt.get('volta_start') else []))


def emit_melody(ir):
    out = []
    dashed_open = [False]
    for item in walk_events(ir):
        kind = item[0]
        if kind == 'tuplet_open':
            out.append('\\tuplet %d/%d {' % (item[1]['num'], item[1]['den']))
        elif kind == 'tuplet_close':
            out.append('}')
        elif kind == 'event':
            e = item[1]
            for sg in (e.get('signs') or []):
                out.append('\\mark \\markup { \\musicglyph "scripts.%s" }' % sg)
            mks = e.get('marks') or []
            mark_txt = ''
            if mks:
                def mark_markup(mk):
                    inner = q(mk['text'])
                    if mk.get('bold'):
                        inner = '\\bold ' + inner
                    if mk.get('italic'):
                        inner = '\\italic ' + inner
                    if mk.get('boxed'):
                        inner = '\\box ' + inner
                    return inner
                # a script (not \mark): the originals put the box between chord names and staff, a \mark would go
                # above the chord row and collide with the lyrics of the system above. With a fermata on the same
                # note keep \mark (a script would stack over the fermata and move it, which the checks notice).
                if len(mks) == 1:
                    mk_ly = '\\markup { %s }' % mark_markup(mks[0])
                else:            # several marks on one note: stack them as a column (top first)
                    mk_ly = '\\markup { \\column { %s } }' % ' '.join('\\line { %s }' % mark_markup(m) for m in mks)
                if e.get('fermata'):
                    out.append('\\mark ' + mk_ly)
                else:
                    mark_txt = '^' + mk_ly
            if e['kind'] == 'rest':
                tok = 'r' + event_dur(e)
            else:
                tok = ly_pitch(e['letter'], e['alter'], e['octave']) + event_dur(e)
                if e['tie']:
                    tok += '~'
                    if e.get('tie_dashed'):
                        tok = '\\once \\tieDashed ' + tok
            if e.get('slur_end'):
                tok += ')'
                if dashed_open[0]:
                    tok += ' \\slurSolid'
                    dashed_open[0] = False
            if e.get('slur_start'):
                if e.get('slur_dashed'):
                    tok = '\\slurDashed ' + tok
                    dashed_open[0] = True
                tok += '('
            if e.get('beam_start'):
                tok += '['
            if e.get('beam_end'):
                tok += ']'
            if e.get('fermata'):
                tok += '^\\fermata' if e['fermata'] == 'up' else '_\\fermata'
            tok += mark_txt
            out.append(tok)
        elif kind == 'time':
            out.append(time_token(item[1]))
        elif kind == 'key':
            out.append('\\key %s \\major' % LY_KEY[item[1]['tonic']])
        elif kind == 'break':
            out.append('\\break')
        elif kind == 'volta_cmd':
            cmds = ' '.join('(volta #f)' if lab is None else '(volta %s)' % q(lab) for lab in item[1])
            out.append("\\set Score.repeatCommands = #'(%s)" % cmds)
        elif kind == 'bar':
            m, last = item[1], item[2]
            b = m['bar_after']
            out.append('|' if b == '|' else ('\\bar "%s"' % b if last else '\\bar "%s" |' % b))
    return ' '.join(out).replace('{ ', '{ ').replace('| \\break', '\\break |')


def chord_token(ly, dur_str):
    """Chord (already converted) with a duration; `c:7/g` and `c/g` need the duration before ':' or '/'."""
    if ':' in ly:
        return ly.replace(':', dur_str + ':', 1)
    if '/' in ly:
        return ly.replace('/', dur_str + '/', 1)
    return ly + dur_str


def emit_chords(ir, warnings):
    from verify import dur_of
    out = []
    for item in walk_events(ir):
        kind = item[0]
        if kind == 'tuplet_open':
            out.append('\\tuplet %d/%d {' % (item[1]['num'], item[1]['den']))
        elif kind == 'tuplet_close':
            out.append('}')
        elif kind == 'time':
            out.append(time_token(item[1]))
        elif kind == 'event':
            e = item[1]
            segs = [(Fraction(0), e.get('chord'))]
            for mc in (e.get('mid_chords') or []):
                segs.append((Fraction(*mc['offset']), mc['text']))
            segs.sort(key=lambda x: x[0])
            if len(segs) == 1:
                c = segs[0][1]
                ly = chord_to_ly(c) if c else None
                if c and ly is None:
                    warnings.append('unsupported chord %r' % c)
                out.append(chord_token(ly, event_dur(e)) if ly else 's' + event_dur(e))
                continue
            total = Fraction(1, e['dur']) * ((2 - Fraction(1, 2 ** e['dots'])) if e['dots'] else 1)
            for k, (off, c) in enumerate(segs):
                d = (segs[k + 1][0] if k + 1 < len(segs) else total) - off
                try:
                    dstr = frac_to_durations(d)
                except ValueError:
                    warnings.append('cannot split chord duration %s' % d)
                    dstr = '16'
                first, _, rest = dstr.partition(' ')
                ly = chord_to_ly(c) if c else None
                if c and ly is None:
                    warnings.append('unsupported chord %r' % c)
                out.append(chord_token(ly, first) if ly else 's' + first)
                if rest:
                    out.append('s' + rest)
        elif kind == 'bar':
            out.append('|')
    return ' '.join(out)


def emit_lyrics(ir, warnings):
    """One token per note (syllable or `_` skip) with ignoreMelismata on: reproduces exactly what is printed,
    independent of LilyPond's melisma rules (the originals place syllables under slurs freely)."""
    lines = sorted({k for m in ir['measures'] for e in m['events'] for k in (e.get('lyrics') or {})})
    notes = [e for m in ir['measures'] for e in m['events'] if e['kind'] == 'note']
    blocks = []
    for k in lines:
        toks = ['\\set ignoreMelismata = ##t']
        for e in notes:
            syl = (e.get('lyrics') or {}).get(k)
            if syl is None:
                toks.append('_')
                continue
            if syl.get('stanza'):
                toks.append('\\set stanza = %s' % q(syl['stanza']))
            toks.append(q(syl['text']))
            if syl.get('hyphen'):
                toks.append('--')
            elif syl.get('extender'):
                toks.append('__')
        blocks.append((k, ' '.join(toks)))
    return blocks


def stanza_body(st):
    """Lines of one stanza. A sub-paragraph inside a stanza (refrain: a blank gap and an indent in the original) keeps
    its extra vertical gap and its indent."""
    pos = st.get('pos')
    if not pos or len(pos) != len(st['lines']):
        return ' '.join(q(l) for l in st['lines'])
    dys = sorted(b[1] - a[1] for a, b in zip(pos, pos[1:]) if b[1] > a[1])
    pitch = dys[len(dys) // 2] if dys else 0
    x0 = min(p[0] for p in pos)
    out = []
    cum = 0.0
    for i, (l, (x, y)) in enumerate(zip(st['lines'], pos)):
        if i and pitch and y - pos[i - 1][1] - pitch > 0.4:
            cum += y - pos[i - 1][1] - pitch       # a \\vspace inside a \\column costs a whole extra line: shift instead
        dx = x - x0 if x - x0 > 0.4 else 0.0
        out.append('\\translate #\'(%.2f . %.2f) %s' % (dx, -cum, q(l)) if (dx or cum) else q(l))
    return ' '.join(out)


def emit_verses(ir):
    cols = ir['text']['verses']
    if not cols:
        return ''

    def col_markup(col):
        lines = []
        for i, st in enumerate(col['stanzas']):
            if i:
                lines.append('\\vspace #0.88')
            body = stanza_body(st)
            lines.append('\\line { \\bold %s \\column { %s } }' % (q(st['number']), body))
        return '\\left-column {\n      ' + '\n      '.join(lines) + '\n    }'
    if len(cols) == 1:
        inner = '\\null\n    \\line { %s \\hspace #1.1 }\n    \\null' % col_markup(cols[0])
    else:
        inner = '\n    '.join(col_markup(c) for c in cols)
    return '\\markup {\n  \\fill-line {\n    %s\n  }\n}\n' % inner


def mm_per_space(ir):
    """Letter page width / viewBox width: sheets typeset with a smaller staff size have a wider viewBox."""
    return 215.9 / ir.get('page_w', 153.5737)


def default_params(ir):
    t = ir['text']
    tops = [s['top'] for s in ir['systems']]
    title_y = t['title']['y'] if t['title'] else 9.63
    gaps = [b - a for a, b in zip(tops, tops[1:])]
    verse_y = min((c['y'] for c in t['verses']), default=None)
    return {'top_margin': 8.91 + (title_y - 9.63) * mm_per_space(ir),
            'vspace': 0.68 + (tops[0] - 22.967) / 3.0,
            'sys_gap': (sum(gaps) / len(gaps)) if gaps else 12.87,
            'score_gap': (verse_y - tops[-1] - 2.0) if verse_y else 15.0}


def emit(ir, variant='piano', params=None):
    warnings = []
    P = dict(default_params(ir))
    P.update(params or {})
    key, time = ir['key'], ir['time']
    t = ir['text']
    first_m = ir['measures'][0]
    full = Fraction(time['num'], time['den'])
    from verify import dur_of
    first_sum = sum((dur_of(e) for e in first_m['events']), Fraction(0))
    partial = ''
    if first_sum < full:
        try:
            one = frac_to_durations(first_sum)
            partial = '\\partial %s' % (one if ' ' not in one else '%d*%d' % (first_sum.denominator, first_sum.numerator))
        except ValueError:
            partial = '\\partial %d*%d' % (first_sum.denominator, first_sum.numerator)

    tops = [s['top'] for s in ir['systems']]
    title_y = t['title']['y'] if t['title'] else 9.63
    top_margin_mm, vspace_title, sys_gap = P['top_margin'], P['vspace'], P['sys_gap']
    footer = ' '.join(f['text'] for f in t['footer']) or 'www.hymnal.net'
    instr_line = ''
    for ins in sorted([i for i in t['instructions'] if i['y'] < tops[0] - 0.5], key=lambda i: i['y']):
        inner = '\\italic ' + q(ins['text'])
        if ins.get('bold'):
            inner = '\\bold ' + inner
        pos = '%s \\null' % inner if ins['x'] < 40 else '\\null %s \\null' % inner
        instr_line += '\\fill-line { %s }\n    ' % pos
    head_instr = [i for i in t['instructions'] if i['y'] < tops[0] - 0.5]

    mel = emit_melody(ir)
    harm = emit_chords(ir, warnings)
    lyr = emit_lyrics(ir, warnings)

    ly = []
    ly.append('\\version "2.24.3"\n')
    ly.append('%% Generated by svg-to-lilypond from %s\n' % ir['source'])
    ly.append('#(set-global-staff-size %.3f)\n' % (16 * 153.5737 / ir.get('page_w', 153.5737)))
    score_markup_gap = P['score_gap']
    ly.append('''\\paper {
  #(set-paper-size "letter")
  left-margin = 12.7\\mm
  right-margin = 8.89\\mm
  top-margin = %.2f\\mm
  bottom-margin = 12.5\\mm
  indent = 0
  #(define fonts
     (set-global-fonts
       #:roman "Century Schoolbook L"
       #:sans "sans-serif"
       #:factor (/ staff-height pt 20)))
  bookTitleMarkup = \\markup \\column {
    \\fill-line {
      \\null
      \\override #'(baseline-skip . 3.5) \\center-column {
        \\fontsize #3 \\bold \\fromproperty #'header:title
        \\bold \\fromproperty #'header:subtitle
      }
      \\raise #-8.1 \\fontsize #8.5 \\fromproperty #'header:opus
    }
    %s\\vspace #%.2f
  }
  system-system-spacing = #'((basic-distance . %.2f) (minimum-distance . %.2f) (padding . 0) (stretchability . 0))
  score-markup-spacing = #'((basic-distance . %.2f) (minimum-distance . %.2f) (padding . 0) (stretchability . 0))
  scoreTitleMarkup = ##f
  tagline = \\markup \\line { \\hspace #1.84 \\override #'(font-name . "Trebuchet MS") %s }
}
''' % (top_margin_mm, instr_line, vspace_title, sys_gap, sys_gap, score_markup_gap, score_markup_gap, q(footer)))
    ly.append('\\header {\n  title = %s\n  subtitle = %s\n  opus = %s\n}\n' % (
        q(t['title']['text'] if t['title'] else ''), q(t['subtitle']['text'] if t['subtitle'] else ''),
        q(t['number']['text'] if t['number'] else '')))
    numeric = '\\numericTimeSignature ' if (time['symbol'] is None and time['num'] == 4 and time['den'] == 4) else ''
    ly.append('global = {\n  \\key %s \\major\n  %s\\time %d/%d\n  \\autoBeamOff\n  %s\n}\n' % (
        LY_KEY[key['tonic']], numeric, time['num'], time['den'], partial))
    ly.append('melody = {\n  \\clef treble\n  \\global\n  ' + mel + '\n}\n')
    ly.append('harmonies = \\chordmode {\n  \\global\n  %s\n}\n' % harm)
    for k, body in lyr:
        ly.append('verse%s = \\lyricmode {\n  %s\n}\n' % (['One', 'Two', 'Three', 'Four'][k], body))
    addl = ''.join('    \\addlyrics { \\verse%s }\n' % ['One', 'Two', 'Three', 'Four'][k] for k, _ in lyr)
    # 2.24 packs syllables tighter than the originals: keep words apart and hyphens drawn (the wider word gap is
    # dropped by convert.py when a dense system overflows with it and ends in REVIEW)
    lyr_ctx = '    \\context {\n      \\Lyrics\n      \\override LyricHyphen.minimum-distance = #0.6\n'
    if P.get('lyric_space'):
        lyr_ctx += '      \\override LyricSpace.minimum-distance = #%.1f\n' % P['lyric_space']
    lyr_ctx += '    }\n'
    ly.append('''\\score {
  <<
    \\new ChordNames \\with {
      \\override ChordName.font-size = #-1
      majorSevenSymbol = \\markup { "maj7" }
    } \\harmonies
    \\new Staff { \\melody }
%s  >>
  \\layout {
    \\context {
      \\Score
      \\override RehearsalMark.font-size = #0
      \\override RehearsalMark.font-series = #'medium
      \\override RehearsalMark.self-alignment-X = #CENTER
    }
    \\context {
      \\Staff
      \\override TextScript.self-alignment-X = #CENTER
    }
%s    \\context {
      \\Score
      %% line breaks come only from the explicit break marks (one per original system)
      \\override NonMusicalPaperColumn.line-break-permission = ##f
    }
  }
}
''' % (addl, lyr_ctx))
    ly.append(emit_verses(ir))
    for ins in ir['text']['instructions']:
        if ins['y'] < tops[0] - 0.5:
            continue                                       # emitted in the title block
        if ins['y'] > tops[-1] + 14:                       # page-level note below the music
            ly.append('\\markup \\fill-line { \\null \\fontsize #-1 \\italic %s \\null }\n' % q(ins['text']))
        else:
            warnings.append('instruction %r above the music is not emitted yet' % ins['text'])
    if ir['text']['leftover']:
        warnings.append('unplaced text: %s' % [l['text'][:20] for l in ir['text']['leftover']][:4])
    return '\n'.join(ly), warnings


if __name__ == '__main__':
    import json
    sys.path.insert(0, __file__.rsplit('/', 1)[0])
    ir = json.load(open(sys.argv[1]))
    text, warns = emit(ir)
    print(text)
    for w in warns:
        print('% WARNING', w, file=sys.stderr)
