"""Convert our generated piano .ly (ly/piano/) to MEI for the in-app Verovio viewer (DESIGN.md §19).

Only the dialect written by emit_ly.py is understood: absolute pitches, one `|` per measure in melody and harmonies,
`\\break` per original system, manual beams, `\\tuplet`, `\\partial`, repeat bars and voltas via `\\bar` and
`Score.repeatCommands`, lyrics with `\\set ignoreMelismata = ##t` (one token per note, `_` = no syllable).
Anything else raises, so a new construct is noticed instead of being dropped.

The MEI holds the music (melody, chord symbols, verse lyrics under the staff, original system breaks as <sb/>);
title, subtitle, number and the verse block below the music go into meiHead / <back> as plain text, for the viewer
to lay out as HTML.

usage:
  python3 tools/ly_to_mei.py ly/piano/E1.ly [-o E1.mei]          one file (stdout without -o)
  python3 tools/ly_to_mei.py --all [--out build/mei] [-j 12]     all hymns, with checks; report on stdout
  python3 tools/ly_to_mei.py --render HYMN... [--width 1000]     MEI -> SVG via verovio (python package) for a look
"""
import argparse
import os
import re
import sys
from fractions import Fraction as F
from xml.sax.saxutils import escape

HERE = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
sys.path.insert(0, os.path.dirname(__file__))
from guitar_from_piano import block, parse_note  # noqa: E402

NOTE = r'[a-g](?:isis|eses|is|es|s)?'
NOTE_TOK = re.compile(r"^(%s|r|s|R)([',]*)(\d+|\\breve)?(\.*)((?:[~\[\]()]|\\\(|\\\))*)$" % NOTE)
CHORD_TOK = re.compile(r'^(%s|s|r)(\d+|\\breve)?(\.*)(?::([a-z0-9.+-]+))?(?:/(%s))?$' % (NOTE, NOTE))
FIFTHS = {'c': 0, 'g': 1, 'd': 2, 'a': 3, 'e': 4, 'b': 5, 'f': -1}
ACC = {-2: 'ff', -1: 'f', 0: 'n', 1: 's', 2: 'x'}
ACC_GES = {-2: 'ff', -1: 'f', 0: 'n', 1: 's', 2: 'ss'}
SIGN = {-2: '\U0001D12B', -1: '\u266D', 0: '', 1: '\u266F', 2: '\U0001D12A'}
QUALITY = {None: '', 'm': 'm', '7': '7', 'm7': 'm7', 'maj7': 'maj7', 'sus4': 'sus4', 'sus2': 'sus2', 'dim': '\u00B0',
           'dim7': '\u00B07', 'aug': '+', '6': '6', 'm6': 'm6', 'm9': 'm9', '9': '9'}
VERSE_NAMES = ['verseOne', 'verseTwo', 'verseThree', 'verseFour', 'verseFive', 'verseSix']


class LyError(ValueError):
    pass


# ---------------------------------------------------------------- tokenizing

def tokens(body):
    """Split a music body into tokens; strings stay whole, `^\\markup {..}` and `\\markup {..}` become one token."""
    out, i, n = [], 0, len(body)
    while i < n:
        c = body[i]
        if c.isspace():
            i += 1
            continue
        if c == '"':
            j = i + 1
            while body[j] != '"':
                j += 2 if body[j] == '\\' else 1
            out.append(body[i:j + 1])
            i = j + 1
            continue
        if body.startswith('\\markup', i) or body.startswith('^\\markup', i) or body.startswith('-\\markup', i):
            j = body.index('markup', i) + 6
            while True:                                  # skip markup commands up to `{` or a plain string
                while body[j].isspace():
                    j += 1
                if body[j] == '\\':
                    while j < n and not body[j].isspace():
                        j += 1
                    continue
                break
            if body[j] == '"':
                k = j + 1
                while body[k] != '"':
                    k += 2 if body[k] == '\\' else 1
                out.append(body[i:k + 1])
                i = k + 1
                continue
            depth, k = 0, j
            while True:
                if body[k] == '"':
                    k = body.index('"', k + 1)
                elif body[k] == '{':
                    depth += 1
                elif body[k] == '}':
                    depth -= 1
                    if depth == 0:
                        break
                k += 1
            out.append(body[i:k + 1])
            i = k + 1
            continue
        if body.startswith("#'(", i) or body.startswith('#(', i):     # scheme list: balanced parens
            depth, k = 0, i + 1
            while True:
                if body[k] == '"':
                    k = body.index('"', k + 1)
                elif body[k] == '(':
                    depth += 1
                elif body[k] == ')':
                    depth -= 1
                    if depth == 0:
                        break
                k += 1
            out.append(body[i:k + 1])
            i = k + 1
            continue
        j = i
        while j < n and not body[j].isspace() and body[j] != '"' and not body.startswith('^\\markup', j) \
                and not (j > i and body.startswith('-\\markup', j)):
            j += 1
        out.append(body[i:j])
        i = j
    return out


def split_post(tok):
    """'c''4.(^\\fermata' -> ('c''4.(', ['\\fermata']); markups are separate tokens already."""
    posts = []
    while True:
        m = re.search(r'([\^_-])\\(fermata)$', tok)
        if not m:
            break
        posts.insert(0, '\\' + m.group(2))
        tok = tok[:m.start()]
    return tok, posts


def markup_text(mk):
    """Plain text of a markup and whether it is boxed."""
    strings = re.findall(r'"((?:[^"\\]|\\.)*)"', mk)
    return ' '.join(strings), '\\box' in mk


def dur_of(d, dots):
    base = F(2) if d == '\\breve' else F(1, int(d))
    return base * (2 - F(1, 2 ** len(dots)))


# ---------------------------------------------------------------- parsing

def parse_global(text):
    g = text[slice(*block(text, 'global'))]
    km = re.search(r'\\key (%s) \\(major|minor)' % NOTE, g)
    tm = re.search(r'\\time (\d+)/(\d+)', g)
    pm = re.search(r'\\partial (\d+)(\.*)', g)
    return dict(key=(km.group(1), km.group(2)), time=(int(tm.group(1)), int(tm.group(2))),
                partial=dur_of(pm.group(1), pm.group(2)) if pm else None)


def key_sig(tonic, mode):
    letter, alt = parse_note(tonic)
    f = FIFTHS[letter] + 7 * alt
    if mode == 'minor':
        f -= 3
    return f


def key_alter(fifths):
    """letter -> alteration implied by the key signature"""
    alt = dict.fromkeys('cdefgab', 0)
    order_s, order_f = 'fcgdaeb', 'beadgcf'
    for i in range(abs(fifths)):
        alt[(order_s if fifths > 0 else order_f)[i]] = 1 if fifths > 0 else -1
    return alt


def parse_melody(body):
    """-> list of measures: dict(events=[...], end_bar, left_bar, volta_start, volta_end, sb, time, key, length)"""
    toks = tokens(body)
    measures = [dict(events=[])]
    m = measures[0]
    dur, dots = '4', ''
    tuplet, pending = [], []      # stack of (num, den); pending marks for the next note
    once_head = once_dashed = None
    slur_dashed = tie_dashed = False
    i = 0

    def take(n):
        nonlocal i
        r = toks[i + 1:i + 1 + n]
        i += n
        return r

    while i < len(toks):
        t = toks[i]
        if t == '|':
            m = dict(events=[])
            measures.append(m)
        elif t in ('\\clef',):
            take(1)
        elif t in ('\\global', '\\autoBeamOff', '\\defaultTimeSignature'):
            pass
        elif t == '\\break':
            m['sb'] = True
        elif t == '\\bar':
            bar = take(1)[0].strip('"')
            if bar == '.|:':
                m['rpt_start_after'] = True
            else:
                m['end_bar'] = bar
        elif t == '\\time':
            num, den = take(1)[0].split('/')
            m['time'] = (int(num), int(den))
        elif t == '\\key':
            tonic, mode = take(2)
            m['key'] = (tonic, mode.lstrip('\\'))
        elif t == '\\partial':
            m['partial'] = take(1)[0]
        elif t == '\\set':
            what, eq, val = take(3)
            if what == 'Score.repeatCommands':
                for vm in re.finditer(r'\(volta (#f|"[^"]*")\)', val):
                    if vm.group(1) == '#f':
                        m.setdefault('volta', []).append(None)
                    else:
                        m.setdefault('volta', []).append(vm.group(1).strip('"'))
            elif what == 'Timing.measureLength':
                mm = re.search(r'(\d+)[ /](\d+)', val)
                m['length'] = F(int(mm.group(1)), int(mm.group(2)))
            else:
                raise LyError('\\set ' + what)
        elif t == '\\once' and toks[i + 1] in ('\\tieDashed', '\\slurDashed'):
            once_dashed = toks[i + 1]
            i += 1
        elif t == '\\once':
            if toks[i + 1] != '\\override':
                raise LyError('\\once ' + toks[i + 1])
            prop, eq, val = toks[i + 2:i + 5]
            i += 4
            if prop == 'NoteHead.style' and val == "#'cross":
                once_head = 'x'
            else:
                raise LyError('\\once \\override ' + prop)
        elif t in ('\\tieDashed', '\\slurDashed', '\\slurSolid'):
            if t == '\\tieDashed':
                tie_dashed = True
            elif t == '\\slurDashed':
                slur_dashed = True
            else:
                slur_dashed = False
        elif t in ('\\slurSolid]', '\\slurSolid['):                # beam mark glued to the command
            slur_dashed = False
            ev = m['events'][-1] if t.endswith(']') else None
            if ev:
                ev['beam_end'] = True
            else:
                pending.append('beam_start')
        elif t == '\\tuplet':
            num, den = take(1)[0].split('/')
            if toks[i + 1] != '{':
                raise LyError('tuplet without braces')
            i += 1
            tuplet.append((int(num), int(den)))
            m['events'].append(dict(kind='tuplet_start', num=int(num), den=int(den)))
        elif t == '}':
            tuplet.pop()
            m['events'].append(dict(kind='tuplet_end'))
        elif t == '\\mark':
            mk = toks[i + 1]
            i += 1
            pending.append(('mark', mk))
        elif t == '\\tempo':
            # \tempo 4 = 120 or \tempo "text"
            nxt = toks[i + 1]
            if nxt.startswith('"'):
                i += 1
            else:
                i += 3
        elif t.startswith('^\\markup') or t.startswith('-\\markup'):
            ev = m['events'][-1] if m['events'] and m['events'][-1]['kind'] in ('note', 'rest') else None
            if ev is None:
                raise LyError('markup without a note')
            ev.setdefault('markups', []).append(t)
        else:
            core, posts = split_post(t)
            nm = NOTE_TOK.match(core)
            if not nm:
                raise LyError('token %r' % t)
            name, octs, d, dt, marks = nm.groups()
            if d:
                dur, dots = d, dt
            elif dt:
                dots = dt
            ev = dict(dur=dur, dots=dots, len=dur_of(dur, dots), tuplet=tuplet[-1] if tuplet else None)
            if tuplet:
                ev['len'] = ev['len'] * tuplet[-1][1] / tuplet[-1][0]
            if name in ('r', 'R'):
                ev['kind'] = 'rest'
            elif name == 's':
                ev['kind'] = 'space'
            else:
                letter, alt = parse_note(name)
                octave = 3 + octs.count("'") - octs.count(',')
                ev.update(kind='note', pname=letter, alt=alt, oct=octave)
                if once_head:
                    ev['head'] = once_head
                    once_head = None
            for p in pending:
                if p == 'beam_start':
                    ev['beam_start'] = True
                else:
                    ev.setdefault('marks', []).append(p[1])
            pending = []
            marks = marks.replace('\\(', '(').replace('\\)', ')')
            ev['tie'] = '~' in marks
            ev['tie_dashed'] = tie_dashed or (once_dashed == '\\tieDashed' and ev['tie'])
            if once_dashed == '\\slurDashed' and '(' in marks:
                ev['slur_dashed_once'] = True
            if ev['tie'] or '(' in marks:
                once_dashed = None
            ev['slur_start'] = marks.count('(')
            ev['slur_end'] = marks.count(')')
            ev['slur_dashed'] = slur_dashed or ev.pop('slur_dashed_once', False)
            ev['beam_start'] = ev.get('beam_start') or '[' in marks
            ev['beam_end'] = ']' in marks
            ev['fermata'] = '\\fermata' in posts
            m['events'].append(ev)
        i += 1
    if not measures[-1]['events'] and len(measures) > 1:     # trailing `|`
        tail = measures.pop()
        for k, v in tail.items():
            if k != 'events':
                measures[-1].setdefault(k, v)
    return measures


def parse_harmonies(body):
    """-> list per measure of (offset, text) chord symbols"""
    toks = tokens(body)
    out, cur, pos = [], [], F(0)
    dur, dots = '4', ''
    tuplet = []
    override = None
    i = 0
    while i < len(toks):
        t = toks[i]
        if t == '|':
            out.append(cur)
            cur, pos = [], F(0)
        elif t == '\\global':
            pass
        elif t == '\\tuplet':
            num, den = toks[i + 1].split('/')
            tuplet.append((int(num), int(den)))
            i += 2
        elif t == '}':
            tuplet.pop()
        elif t in ('\\time', '\\partial'):
            i += 1
        elif t == '\\defaultTimeSignature':
            pass
        elif t == '\\once':                                  # \once \override ChordName.text = \markup {..}
            if toks[i + 1:i + 4] != ['\\override', 'ChordName.text', '=']:
                raise LyError('harmonies \\once')
            override = markup_text(toks[i + 4])[0]
            i += 4
        else:
            cm = CHORD_TOK.match(t)
            if not cm:
                raise LyError('chord %r' % t)
            root, d, dt, q, bass = cm.groups()
            if d:
                dur, dots = d, dt
            elif dt:
                dots = dt
            ln = dur_of(dur, dots)
            if tuplet:
                ln = ln * tuplet[-1][1] / tuplet[-1][0]
            if root != 's':
                if q not in QUALITY:
                    raise LyError('chord quality %r' % q)
                text = override or chord_text(root, q, bass)
                cur.append((pos, text))
                override = None
            pos += ln
        i += 1
    if cur:
        out.append(cur)
    return out


def chord_text(root, q, bass):
    l, a = parse_note(root)
    s = l.upper() + SIGN[a] + QUALITY[q]
    if bass:
        bl, ba = parse_note(bass)
        s += '/' + bl.upper() + SIGN[ba]
    return s


def parse_lyrics(body):
    """-> list of items, one per note: None (no syllable) or dict(text, hyphen, label)"""
    toks = tokens(body)
    out, label, i = [], None, 0
    while i < len(toks):
        t = toks[i]
        if t == '\\set':
            what, eq, val = toks[i + 1:i + 4]
            if what == 'stanza':
                label = val.strip('"')
            i += 4
            continue
        if t == '--':
            if out and out[-1]:
                out[-1]['hyphen'] = True
            elif out:                                    # hyphen after a skip: attach to the last real syllable
                for x in reversed(out):
                    if x:
                        x['hyphen'] = True
                        break
        elif t == '_':
            out.append(None)
        elif t.startswith('"'):
            out.append(dict(text=t[1:-1].replace('\\"', '"'), hyphen=False, label=label))
            label = None
        elif t.startswith('\\markup'):
            out.append(dict(text=markup_text(t)[0], hyphen=False, label=label, italic='\\italic' in t))
            label = None
        else:
            raise LyError('lyric token %r' % t)
        i += 1
    return out


def parse_verse_block(text):
    """The verse text under the music: list of (label or None, [lines])."""
    m = re.search(r'\n\\markup \{\n  \\fill-line', text)
    if not m:
        return []
    body = text[m.start():]
    out = []
    for vm in re.finditer(r'(?:\\bold "([^"]*)" )?\\column \{((?: *"(?:[^"\\]|\\.)*")+) *\}', body):
        lines = [s.replace('\\"', '"') for s in re.findall(r'"((?:[^"\\]|\\.)*)"', vm.group(2))]
        out.append((vm.group(1), lines))
    return out


def parse(text):
    hdr = {k: (re.search(r'^  %s = "((?:[^"\\]|\\.)*)"' % k, text, re.M) or [None, ''])[1]
           for k in ('title', 'subtitle', 'opus')}
    g = parse_global(text)
    measures = parse_melody(text[slice(*block(text, 'melody'))])
    hb = block(text, 'harmonies')
    harm = parse_harmonies(text[slice(*hb)]) if hb else []
    score = text[text.index('\\score'):]
    verses = []
    for name in re.findall(r'\\addlyrics \{ \\(\w+) \}', score):
        verses.append(parse_lyrics(text[slice(*block(text, name))]))
    return dict(header=hdr, glob=g, measures=measures, harm=harm, verses=verses, verse_block=parse_verse_block(text))


# ---------------------------------------------------------------- MEI

class Ids:
    def __init__(self):
        self.n = 0

    def __call__(self, p):
        self.n += 1
        return '%s%d' % (p, self.n)


def mei_dur(ev):
    d = ev['dur']
    return 'breve' if d == '\\breve' else d


def build_mei(doc, hymn):
    ids = Ids()
    g = doc['glob']
    fifths = key_sig(*g['key'])
    num, den = g['time']
    measures, harm = doc['measures'], doc['harm']
    tail = []
    if harm and len(harm) == len(measures) + 1:          # chords printed after the staff ends (DESIGN.md §18)
        tail = [t for _, t in harm[-1]]
        harm = harm[:-1]
    if harm and len(harm) != len(measures):
        raise LyError('harmonies have %d measures, melody %d' % (len(harm), len(measures)))
    notes = [e for m in measures for e in m['events'] if e['kind'] == 'note']
    for vi, v in enumerate(doc['verses']):
        if len(v) > len(notes):
            raise LyError('verse %d has %d syllables for %d notes' % (vi + 1, len(v), len(notes)))
        for k, item in enumerate(v):
            if item:
                notes[k].setdefault('lyr', {})[vi + 1] = item

    def meter_attrs(n, d):
        a = 'meter.count="%d" meter.unit="%d"' % (n, d)
        if (n, d) == (4, 4):
            a += ' meter.sym="common"'
        elif (n, d) == (2, 2):
            a += ' meter.sym="cut"'
        return a

    out = []
    w = out.append
    w('<?xml version="1.0" encoding="UTF-8"?>')
    w('<mei xmlns="http://www.music-encoding.org/ns/mei" meiversion="5.0">')
    w('<meiHead><fileDesc><titleStmt><title type="main">%s</title>' % escape(doc['header']['title']))
    if doc['header']['subtitle']:
        w('<title type="subordinate">%s</title>' % escape(doc['header']['subtitle']))
    w('</titleStmt><pubStmt><identifier type="hymn">%s</identifier><identifier type="number">%s</identifier>'
      '</pubStmt></fileDesc></meiHead>' % (escape(hymn), escape(doc['header']['opus'])))
    w('<music><body><mdiv><score>')
    w('<scoreDef key.sig="%s" %s><staffGrp><staffDef n="1" lines="5" clef.shape="G" clef.line="2"/></staffGrp>'
      '</scoreDef>' % ('0' if fifths == 0 else '%d%s' % (abs(fifths), 's' if fifths > 0 else 'f'), meter_attrs(num, den)))
    w('<section>')

    alt_key = key_alter(fifths)
    full = F(num, den)
    in_ending = False
    rpt_start_next = False
    tie_open = {}           # (pname, oct) -> (start id, dashed, measure index)
    slur_open = []          # stack of (start id, dashed, measure index)
    ctrls = []              # per measure; ties and slurs go into the measure where they start (Verovio wants that)
    for mi, m in enumerate(measures):
        if m.get('time'):
            num, den = m['time']
            full = F(num, den)
            w('<scoreDef %s/>' % meter_attrs(num, den))
        if m.get('key'):
            fifths = key_sig(*m['key'])
            alt_key = key_alter(fifths)
            w('<scoreDef key.sig="%s"/>' % ('0' if fifths == 0 else '%d%s' % (abs(fifths), 's' if fifths > 0 else 'f')))
        for v in m.get('volta', []):
            if v is None:
                if in_ending:
                    w('</ending>')
                    in_ending = False
            else:
                if in_ending:
                    w('</ending>')
                w('<ending n="%s" label="%s">' % (escape(v.rstrip('.')), escape(v)))
                in_ending = True
        length = sum((e['len'] for e in m['events'] if e['kind'] in ('note', 'rest', 'space')), F(0))
        attrs = ['n="%d"' % (mi + 1)]
        if length != full:
            attrs.append('metcon="false"')
        if rpt_start_next:
            attrs.append('left="rptstart"')
            rpt_start_next = False
        bar = m.get('end_bar')
        right = {'|.': 'end', ':|.': 'rptend', '||': 'dbl', None: None}.get(bar, 'X')
        if right == 'X':
            raise LyError('bar %r' % bar)
        if right:
            attrs.append('right="%s"' % right)
        if m.get('rpt_start_after'):
            rpt_start_next = True
        w('<measure %s><staff n="1"><layer n="1">' % ' '.join(attrs))

        ctrl = []
        ctrls.append(ctrl)
        measure_alt = {}
        open_beam = False
        pos = F(0)
        for ev in m['events']:
            k = ev['kind']
            if k == 'tuplet_start':
                if open_beam:                              # nor its start (NS383): split the beam there
                    w('</beam>')
                w('<tuplet num="%d" numbase="%d" num.visible="true" bracket.visible="%s">'
                  % (ev['num'], ev['den'], 'false' if False else 'true'))
                if open_beam:
                    w('<beam>')
                continue
            if k == 'tuplet_end':
                if open_beam:                              # a beam may not cross the tuplet's end
                    w('</beam>')
                    open_beam = False
                w('</tuplet>')
                continue
            eid = ids({'note': 'n', 'rest': 'r', 'space': 's'}[k])
            if ev.get('beam_start') and not open_beam:
                w('<beam>')
                open_beam = True
            dots = ' dots="%d"' % len(ev['dots']) if ev['dots'] else ''
            if k == 'note':
                p, o, a = ev['pname'], ev['oct'], ev['alt']
                cur = measure_alt.get((p, o), alt_key[p])
                acc = ''
                tied_in = (p, o) in tie_open
                if a != cur and not tied_in:
                    acc = ' accid="%s"' % ACC[a]
                if a != alt_key[p]:
                    acc += ' accid.ges="%s"' % ACC_GES[a]
                measure_alt[(p, o)] = a
                head = ' head.shape="x"' if ev.get('head') == 'x' else ''
                body = ''
                for vn, item in sorted(ev.get('lyr', {}).items()):
                    body += '<verse n="%d">' % vn
                    if item.get('label'):
                        body += '<label>%s</label>' % escape(item['label'])
                    wp = item.get('wordpos')
                    con = ' con="d"' if item['hyphen'] else ''
                    syl = escape(item['text'])
                    if item.get('italic'):
                        syl = '<rend fontstyle="italic">%s</rend>' % syl
                    body += '<syl%s%s>%s</syl></verse>' % (' wordpos="%s"' % wp if wp else '', con, syl)
                w('<note xml:id="%s" pname="%s" oct="%d" dur="%s"%s%s%s%s>' % (eid, p, o, mei_dur(ev), dots, acc, head,
                                                                         '' if body else '/'))
                if body:
                    w(body + '</note>')
                if tied_in:
                    sid, dashed, smi = tie_open.pop((p, o))
                    ctrls[smi].append('<tie startid="#%s" endid="#%s"%s/>' % (sid, eid, ' lform="dashed"' if dashed else ''))
                if ev['tie']:
                    tie_open[(p, o)] = (eid, ev['tie_dashed'], mi)
                for _ in range(ev['slur_end']):
                    if slur_open:
                        sid, dashed, smi = slur_open.pop()
                        ctrls[smi].append('<slur startid="#%s" endid="#%s"%s/>'
                                    % (sid, eid, ' lform="dashed"' if dashed else ''))
                for _ in range(ev['slur_start']):
                    slur_open.append((eid, ev['slur_dashed'], mi))
            elif k == 'rest':
                w('<rest xml:id="%s" dur="%s"%s/>' % (eid, mei_dur(ev), dots))
            else:
                w('<space xml:id="%s" dur="%s"%s/>' % (eid, mei_dur(ev), dots))
            if ev.get('fermata'):
                ctrl.append('<fermata startid="#%s" place="above"/>' % eid)
            for mk in ev.get('markups', []) + ev.get('marks', []):
                text, boxed = markup_text(mk)
                if not text:
                    continue
                t = escape(text)
                if boxed:
                    t = '<rend rend="box" fontweight="bold">%s</rend>' % t
                ctrl.append('<dir startid="#%s" place="above" staff="1">%s</dir>' % (eid, t))
            if ev.get('beam_end') and open_beam:
                w('</beam>')
                open_beam = False
            pos += ev['len']
        if open_beam:
            w('</beam>')
        w('</layer></staff>')
        if harm:
            for off, text in harm[mi]:
                tstamp = 1 + off * den
                w('<harm staff="1" tstamp="%s" place="above">%s</harm>'
                  % (('%d' % tstamp) if tstamp.denominator == 1 else '%.4f' % float(tstamp), escape(text)))
        w('\x00CTRL%d' % mi)
        w('</measure>')
        if m.get('sb'):
            w('<sb/>')
    if in_ending:
        w('</ending>')
    w('</section></score></mdiv></body>')
    if tail:
        w('<back><div type="tailChords"><p>%s</p></div>' % escape(' '.join(tail)))
    if doc['verse_block']:
        w(('' if tail else '<back>') + '<div type="verses">')
        for label, lines in doc['verse_block']:
            w('<lg%s>%s</lg>' % (' label="%s"' % escape(label) if label else '',
                                 ''.join('<l>%s</l>' % escape(x) for x in lines)))
        w('</div>')
    if tail or doc['verse_block']:
        w('</back>')
    w('</music></mei>')
    out = [('\n'.join(ctrls[int(x[5:])]) if x.startswith('\x00CTRL') else x) for x in out]
    return '\n'.join(x for x in out if x) + '\n'


def word_positions(doc):
    """MEI wants wordpos on syllables of multi-syllable words."""
    for v in doc['verses']:
        prev_h = False
        for item in v:
            if not item:
                continue
            if prev_h:
                item['wordpos'] = 'm' if item['hyphen'] else 't'
            elif item['hyphen']:
                item['wordpos'] = 'i'
            prev_h = item['hyphen']


def convert(text, hymn):
    doc = parse(text)
    word_positions(doc)
    return build_mei(doc, hymn), doc


# ---------------------------------------------------------------- batch / render

def one(args):
    path, out_dir = args
    hymn = os.path.basename(path)[:-3]
    try:
        mei, doc = convert(open(path, encoding='utf-8').read(), hymn)
    except Exception as e:  # noqa: BLE001
        return hymn, 'FAIL', '%s: %s' % (type(e).__name__, e)
    notes = sum(1 for m in doc['measures'] for e in m['events'] if e['kind'] == 'note')
    over = [len(v) - notes for v in doc['verses'] if len(v) != notes]
    open(os.path.join(out_dir, hymn + '.mei'), 'w', encoding='utf-8').write(mei)
    return hymn, 'OK', 'syllables-notes %s' % over if over else ''


def render(hymns, mei_dir, svg_dir, width):
    import verovio
    tk = verovio.toolkit()
    tk.setOptions({'pageWidth': width, 'adjustPageHeight': True, 'breaks': 'auto', 'scale': 40,
                   'header': 'none', 'footer': 'none', 'lyricSize': 4.5})
    os.makedirs(svg_dir, exist_ok=True)
    for h in hymns:
        ok = tk.loadFile(os.path.join(mei_dir, h + '.mei'))
        if not ok:
            print(h, 'verovio could not load', file=sys.stderr)
            continue
        for p in range(1, tk.getPageCount() + 1):
            open(os.path.join(svg_dir, '%s-%d.svg' % (h, p)), 'w').write(tk.renderToSVG(p))
        print(h, tk.getPageCount(), 'page(s)')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('file', nargs='?')
    ap.add_argument('-o', '--output')
    ap.add_argument('--all', action='store_true')
    ap.add_argument('--render', nargs='+')
    ap.add_argument('--out', default=os.path.join(HERE, 'build/mei'))
    ap.add_argument('--svg', default=os.path.join(HERE, 'build/mei_svg'))
    ap.add_argument('--width', type=int, default=1000)
    ap.add_argument('-j', type=int, default=12)
    a = ap.parse_args()
    if a.render:
        render(a.render, a.out, a.svg, a.width)
    elif a.all:
        import collections
        from multiprocessing import Pool
        os.makedirs(a.out, exist_ok=True)
        src = os.path.join(HERE, 'ly/piano')
        files = sorted(os.path.join(src, f) for f in os.listdir(src) if f.endswith('.ly'))
        with Pool(a.j) as pool:
            res = pool.map(one, [(f, a.out) for f in files])
        st = collections.Counter(r[1] for r in res)
        for h, s, msg in res:
            if s != 'OK' or msg:
                print(h, s, msg)
        print(dict(st))
    else:
        hymn = os.path.basename(a.file)[:-3]
        mei = convert(open(a.file, encoding='utf-8').read(), hymn)[0]
        if a.output:
            open(a.output, 'w', encoding='utf-8').write(mei)
        else:
            sys.stdout.write(mei)


if __name__ == '__main__':
    main()
