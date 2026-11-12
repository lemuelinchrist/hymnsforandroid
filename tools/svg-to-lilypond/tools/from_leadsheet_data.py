"""hymnal.net's page data of a sheet -> our piano .ly (the dialect of emit_ly.py, which ly_to_mei.py reads).

Since 2026-11 hymnal.net serves no sheet SVG: a hymn page holds the sheet as JSON (key, time, chords per bar, the melody
in numbered notation) and draws it in the browser. databaseProvisioner saves that JSON (runExtractLeadsheetData,
data/leadsheetData/<id>.json); this tool builds the same IR recognize.py makes from an SVG and lets emit_ly.py write it.

The data has no words under the notes: they come from the hymn's stanzas in the database, cut into syllables as the
sheets we already have cut them (a dictionary made from ly/piano/*.ly), one syllable per sung note.

usage:
  python3 tools/from_leadsheet_data.py BF69 [NS226 ...] [--out build/leadsheet] [--mei DIR]

The melody, as far as the pages seen use it (bars between `|`, tokens between spaces):
  1-7   scale degree of the key (movable: 1 is the tonic), 0 a rest, a quarter note long
  #, b  after the digit: raised, lowered
  _.    after the digit: an octave lower;  ._ before it: an octave higher
  .     dotted;  /  half as long (an eighth), // a sixteenth
  -     the note before lasts a quarter longer
  ( )   after the note: a slur or tie starts / ends here
  {..}  a triplet
  (break) end of a line; (Chorus) (Verse_2) (Ending) a section starts at the next note;
  (startrepeat) (alt1) (alt2) (endalt) a repeat with endings
The chords are written as if the key were C, one slot per beat (`-` = no change), and are moved to the key here.
"""
import argparse
import glob
import json
import os
import re
import sqlite3
import sys
from collections import Counter, defaultdict
from fractions import Fraction as F

HERE = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
sys.path.insert(0, os.path.dirname(__file__))
import emit_ly  # noqa: E402

DATA_DIR = os.path.join(ROOT, 'databaseProvisioner', 'data', 'leadsheetData')
DB = os.path.join(ROOT, 'app', 'src', 'main', 'assets', 'hymns.sqlite')
LETTERS = 'CDEFGAB'
PC = {'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11}
MAJOR = [0, 2, 4, 5, 7, 9, 11]
ACC = {'': 0, '#': 1, 'b': -1, '♯': 1, '♭': -1}
NOTE = re.compile(r'^(\{)?((?:\._)*)([0-7])([#b]?)((?:_\.)*)(\.*)(/*)([()]*)(\})?$')
SECTION = re.compile(r'^\((Chorus|Verse_(\d+)|Ending|Bridge|Intro|Interlude)\)$')


class DataError(ValueError):
    pass


# ---------------------------------------------------------------- pitch

def parse_key(text):
    m = re.fullmatch(r'([A-G])([#b♯♭]?)\s+(Major|Minor)', text.strip())
    if not m:
        raise DataError('key %r' % text)
    letter, alter, minor = m.group(1), ACC[m.group(2)], m.group(3) == 'Minor'
    if minor:                     # numbered notation of a minor key starts on 6: 1 is the relative major's tonic
        i = (LETTERS.index(letter) + 2) % 7
        pc = (PC[letter] + alter + 3) % 12
        letter, alter = LETTERS[i], (pc - PC[LETTERS[i]] + 6) % 12 - 6
    return letter, alter


def degree_pitch(tonic, degree, alter, octave):
    """(letter, alter, octave) of scale degree 1-7 in the major key of `tonic` (letter, alter); the tonic is in `octave`."""
    ti = LETTERS.index(tonic[0])
    li = ti + degree - 1
    letter = LETTERS[li % 7]
    midi = 12 * (octave + 1) + PC[tonic[0]] + tonic[1] + MAJOR[degree - 1] + alter
    octv = octave + li // 7
    return letter, midi - (12 * (octv + 1) + PC[letter]), octv


def move_chord(text, tonic):
    """A chord written in C, in the key of `tonic`: Am -> Em in G; F/C -> C/G."""
    def move(m):
        li = LETTERS.index(m.group(1)) + LETTERS.index(tonic[0])
        letter = LETTERS[li % 7]
        pc = (PC[m.group(1)] + ACC[m.group(2)] + PC[tonic[0]] + tonic[1]) % 12
        alter = (pc - PC[letter] + 6) % 12 - 6
        return letter + {0: '', 1: '#', -1: 'b', 2: '##', -2: 'bb'}[alter]
    root = re.match(r'([A-G])([#b]?)', text)
    if not root:
        raise DataError('chord %r' % text)
    rest = text[root.end():]
    bass = ''
    if '/' in rest:
        rest, b = rest.split('/', 1)
        bm = re.fullmatch(r'([A-G])([#b]?)', b)
        if not bm:
            raise DataError('chord %r' % text)
        bass = '/' + move(bm)
    return move(root) + rest + bass


# ---------------------------------------------------------------- the melody

def split_dur(d):
    """A length as note values that exist: 5/8 -> [1/2, 1/8]."""
    out = []
    while d > 0:
        for den in (1, 2, 4, 8, 16, 32):
            for dots in (1, 0):
                v = F(1, den) * (F(3, 2) if dots else 1)
                if v <= d and not (dots and v != d):      # a dotted value only when it is the whole length
                    break
            else:
                continue
            break
        else:
            raise DataError('length %s' % d)
        out.append((den, dots))
        d -= v
    return out


def parse_melody(data, tonic, warnings, marks=None):
    """-> bars: [{'events': [...], 'break': bool, 'repeat_start': bool, 'alt': n or None, 'alt_end': bool}]"""
    bars, pending, tup = [], [], False
    alt = None
    raw = [b.strip() for b in data['melody'].strip().strip('|').split('|')]
    for number, text in enumerate(raw, 1):
        bar = {'events': [], 'break': False, 'repeat_start': False, 'alt': alt, 'alt_start': False, 'alt_end': False}
        for index, tok in enumerate(text.split(), 1):
            if marks and (number, index) in marks:      # a section the page does not mark (--sections)
                pending.append(marks[number, index].replace('_', ' '))
            if tok == '(break)':
                bar['break'] = True
            elif re.fullmatch(r'\(startrepeat\d*\)', tok):   # the page also writes (startrepeat5)
                bar['repeat_start'] = True
            elif re.fullmatch(r'\(alt(\d+)\)', tok):
                alt = int(tok[4:-1])
                bar['alt'], bar['alt_start'] = alt, True
            elif tok == '(endalt)':
                bar['alt_end'] = True
                alt = None
            elif SECTION.match(tok):
                pending.append(tok[1:-1].replace('_', ' '))
            elif tok == '-':
                if not bar['events']:
                    raise DataError('a bar starts with "-": %r' % text)
                bar['events'][-1]['len'] += F(1, 4)
            else:
                m = NOTE.match(tok)
                if not m:
                    raise DataError('token %r in %r' % (tok, text))
                opens, up, digit, acc, down, dots, slashes, parens, closes = m.groups()
                tup = tup or bool(opens)
                length = F(1, 4) / 2 ** len(slashes)
                length *= {0: F(1), 1: F(3, 2), 2: F(7, 4)}[len(dots)]
                e = {'len': length, 'rest': digit == '0', 'open': '(' in parens, 'close': ')' in parens,
                     'tuplet': tup, 'tup_start': bool(opens), 'tup_end': bool(closes), 'sections': pending}
                pending = []
                if digit != '0':
                    e['pitch'] = degree_pitch(tonic, int(digit), ACC[acc], 4 + len(up) // 2 - len(down) // 2)
                if closes:
                    tup = False
                bar['events'].append(e)
        bars.append(bar)
    if pending:
        warnings.append('section %s after the last note' % pending)
    return bars


def chords_of(data, tonic, n_bars, bar_len, warnings):
    """-> per bar: [(offset in the bar, chord in the key)], a chord that only repeats the one before left out."""
    raw = [b.split() for b in data['chords'].strip().strip('|').split('|')]
    if len(raw) != n_bars:
        warnings.append('%d bars of chords, %d of melody' % (len(raw), n_bars))
    out, last = [], None
    for slots in raw:
        here = []
        for i, s in enumerate(slots):
            if s == '-':
                continue
            c = move_chord(s, tonic)
            if c != last:
                here.append((bar_len * i / len(slots), c))
            last = c
        out.append(here)
    return out + [[]] * (n_bars - len(out))


# ---------------------------------------------------------------- words

def split_word(word):
    """(text before the letters, the letters, text after): '"Lord,' -> ('"', 'Lord', ',')."""
    m = re.match(r"^([^A-Za-zÀ-ɏ]*)(.*?)([^A-Za-zÀ-ɏ]*)$", word)
    return m.group(1), m.group(2), m.group(3)


def norm(core):
    return core.lower().replace('’', "'")


def syllable_dictionary():
    """word -> Counter of its cuts (syllable lengths), as the sheets we have cut it."""
    cache = os.path.join(HERE, 'build', 'syllables.json')
    files = glob.glob(os.path.join(HERE, 'ly', 'piano', '*.ly'))
    if os.path.exists(cache) and os.path.getmtime(cache) > max(os.path.getmtime(os.path.dirname(files[0])), 0):
        return {w: Counter({tuple(json.loads(k)): n for k, n in c.items()}) for w, c in json.load(open(cache)).items()}
    words = defaultdict(Counter)
    tok = re.compile(r'"((?:[^"\\]|\\.)*)"|(--)')
    for f in files:
        for block in re.findall(r'verse\w+ = \\lyricmode \{\n(.*?)\n\}', open(f, encoding='utf-8').read(), re.S):
            block = re.sub(r'\\set stanza = "[^"]*"', '', block)
            cur, joined = [], False
            for m in tok.finditer(block):
                if m.group(2):
                    joined = True
                    continue
                if cur and not joined:
                    add_word(words, cur)
                    cur = []
                cur.append(m.group(1).replace('\\"', '"'))
                joined = False
            if cur:
                add_word(words, cur)
    os.makedirs(os.path.dirname(cache), exist_ok=True)
    json.dump({w: {json.dumps(list(k)): n for k, n in c.items()} for w, c in words.items()}, open(cache, 'w'))
    return words


def add_word(words, syls):
    whole = ''.join(syls)
    pre, core, post = split_word(whole)
    if not core or ' ' in whole:
        return
    lens = [len(s) for s in syls]
    lens[0] -= len(pre)
    lens[-1] -= len(post)
    if min(lens) > 0:
        words[norm(core)][tuple(lens)] += 1


def guess_cut(core):
    """Syllable lengths of a word the sheets do not have: one syllable per vowel group, cut before a single consonant."""
    groups = [m.span() for m in re.finditer(r"[aeiouyÀ-ɏ]+", core.lower())]
    low = core.lower()
    if len(groups) > 1 and groups[-1][1] - groups[-1][0] == 1 and low[groups[-1][0]] == 'e':
        tail = low[groups[-1][1]:]
        before = low[groups[-1][0] - 1:groups[-1][0]]
        if (tail == '' and not low.endswith(('le', 'ee'))) \
                or (tail == 's' and before not in 'sxzcg' and not low.endswith(('ches', 'shes'))) \
                or (tail == 'd' and before not in 'td'):
            groups = groups[:-1]                       # a silent e: love, divides, filled
    cuts = []
    for (a0, a1), (b0, b1) in zip(groups, groups[1:]):
        cuts.append(b0 - 1 if b0 - a1 >= 1 else b0)
    edges = [0] + cuts + [len(core)]
    return tuple(b - a for a, b in zip(edges, edges[1:])) if len(groups) > 1 else (len(core),)


def syllables_for(text, want, dictionary, report):
    """The words of `text` cut into exactly `want` syllables if the known cuts allow it.
    -> [(syllable, hyphen after it)]; fewer or more than `want` when nothing fits (reported)."""
    words = []
    for w in text.split():
        pre, core, post = split_word(w)
        if not core:                                    # a dash on its own: stays with the word before
            if words:
                words[-1][2] += ' ' + w
            continue
        words.append([pre, core, post])
    options = []
    for pre, core, post in words:
        known = dictionary.get(norm(core))
        if known:
            best = known.most_common()
            opts, seen = [], set()
            for rank, (cut, _) in enumerate(best):
                if len(cut) not in seen:                # the commonest cut of each syllable count
                    seen.add(len(cut))
                    opts.append((rank and 1, cut))
        else:
            cut = guess_cut(core)
            opts = [(2, cut)]
            report.append('guessed: %s' % '-'.join(pieces(core, cut)))
        options.append(opts)
    # cheapest choice of one cut per word with `want` syllables in all
    best = {0: (0, [])}
    for opts in options:
        nxt = {}
        for total, (cost, chosen) in best.items():
            for c, cut in opts:
                t = total + len(cut)
                if (t <= want + 6 or want >= 10 ** 6) and (t not in nxt or cost + c < nxt[t][0]):
                    nxt[t] = (cost + c, chosen + [cut])
        best = nxt
    if want in best:
        chosen = best[want][1]
    else:
        key = (lambda kv: kv[1][0]) if want >= 10 ** 6 else (lambda kv: (abs(kv[0] - want), kv[1][0]))
        chosen = min(best.items(), key=key)[1][1] if best else []
        if want < 10 ** 6:
            report.append('%d syllables for %d notes: %s' % (sum(len(c) for c in chosen), want, text[:60]))
    out = []
    for (pre, core, post), cut in zip(words, chosen):
        ps = pieces(core, cut)
        ps[0] = pre + ps[0]
        ps[-1] += post
        out += [(p, i < len(ps) - 1) for i, p in enumerate(ps)]
    return out


def pieces(core, cut):
    out, i = [], 0
    for n in cut:
        out.append(core[i:i + n])
        i += n
    return out


# ---------------------------------------------------------------- the hymn in the database

def hymn_of(hymn_id):
    db = sqlite3.connect(DB)
    row = db.execute('select first_stanza_line, main_category, sub_category, parent_hymn, hymn_group, no '
                     'from hymns where _id=?', (hymn_id,)).fetchone()
    if not row:
        raise DataError('%s is not in the database' % hymn_id)
    words_of = hymn_id
    stanzas = db.execute('select no, text from stanza where parent_hymn=? order by n_order', (words_of,)).fetchall()
    if not stanzas and row[3]:                         # a New Tune has its parent's words
        stanzas = db.execute('select no, text from stanza where parent_hymn=? order by n_order', (row[3],)).fetchall()
    clean = []
    for no, text in stanzas:
        lines = [re.sub(r'<[^>]+>', '', l).strip() for l in re.split(r'<br\s*/?>', text)]
        clean.append((no, [l for l in lines if l]))
    number = row[5] if row[4] == 'E' else (row[3][1:] if row[3] and re.fullmatch(r'E\d+', row[3]) else '')
    return {'first_line': row[0], 'category': ' — '.join(x for x in row[1:3] if x), 'number': number,
            'stanzas': clean}


# ---------------------------------------------------------------- IR

def build_ir(hymn_id, data, hymn, dictionary, warnings, marks=None):
    tonic = parse_key(data['key'])
    num, den = [int(x) for x in data['time'].split('/')]
    bar_len = F(num, den)
    bars = parse_melody(data, tonic, warnings, marks)

    # the first bar's leading rests, when they fill half the bar or more, make the rest of it an upbeat
    first = bars[0]['events']
    lead = 0
    while lead < len(first) - 1 and first[lead]['rest'] and not first[lead]['sections']:
        lead += 1
    if sum(e['len'] for e in first[:lead]) >= bar_len / 2:      # else the bar keeps its rests
        del first[:lead]
    for i, b in enumerate(bars):
        total = sum(e['len'] * (F(2, 3) if e['tuplet'] else 1) for e in b['events'])
        if total != bar_len and i not in (0, len(bars) - 1):
            warnings.append('bar %d is %s long, not %s' % (i + 1, total, bar_len))
    pickup = bar_len - sum(e['len'] * (F(2, 3) if e['tuplet'] else 1) for e in bars[0]['events'])

    # range: the tonic sits in octave 4; a song that then goes above the staff is written an octave lower
    pitches = [12 * (e['pitch'][2] + 1) + PC[e['pitch'][0]] + e['pitch'][1] for b in bars for e in b['events'] if not e['rest']]
    shift = -1 if max(pitches) > 79 and min(pitches) - 12 >= 57 else 0
    if shift:
        warnings.append('written an octave lower (highest note would be above G5)')

    chords = chords_of(data, tonic, len(bars), bar_len, warnings)
    beat = F(3, 8) if den == 8 and num % 3 == 0 else F(1, 4)

    # sung notes per section, in order
    sections, cur, inside = [], None, False
    for b in bars:
        for e in b['events']:
            if e['sections'] or cur is None:
                cur = {'name': e['sections'][-1] if e['sections'] else None, 'notes': []}
                sections.append(cur)
            if not e['rest']:
                if not inside:
                    cur['notes'].append(e)
                if e['close']:
                    inside = False
                if e['open']:
                    inside = True
                e['linked'] = inside                   # the next note goes on with this one's syllable
    placed = place_words(sections, hymn, dictionary, warnings)

    measures, system = [], 0
    # a note linked to the next one: a tie when the pitch stays, else a slur (which runs on over linked notes)
    flat = [e for b in bars for e in b['events']]
    for e, n in zip(flat, flat[1:] + [None]):
        if not e['rest']:
            e['link'] = None if not e['linked'] or n is None or n['rest'] else 'tie' if n['pitch'] == e['pitch'] else 'slur'
    in_slur = False
    for bi, b in enumerate(bars):
        events, pos = [], (pickup if bi == 0 else F(0))
        pending_chords = list(chords[bi])
        if bi == 0 and pickup and pending_chords:      # the chord of the upbeat bar stands on its first note
            pending_chords = [(pickup, c) for _, c in pending_chords[:1]] + [pc for pc in pending_chords[1:] if pc[0] > pickup]
        for e in b['events']:
            scale = F(2, 3) if e['tuplet'] else 1
            parts = split_dur(e['len'])
            here = [c for c in pending_chords if c[0] < pos + e['len'] * scale]
            pending_chords = pending_chords[len(here):]
            for pi, (dur, dots) in enumerate(parts):
                ev = {'kind': 'rest' if e['rest'] else 'note', 'dur': dur, 'dots': dots, 'tie': False, '_pos': pos}
                plen = F(1, dur) * (F(3, 2) if dots else 1) * scale
                if e['tuplet']:
                    ev['tuplet'] = {'num': 3, 'den': 2, 'start': e['tup_start'] and pi == 0,
                                    'end': e['tup_end'] and pi == len(parts) - 1}
                if not e['rest']:
                    ev['letter'], ev['alter'], ev['octave'] = e['pitch'][0], e['pitch'][1], e['pitch'][2] + shift
                    if pi < len(parts) - 1:
                        ev['tie'] = True
                    if pi == 0:
                        if in_slur and e['link'] != 'slur':
                            ev['slur_end'] = True
                            in_slur = False
                        if id(e) in placed:
                            ev['lyrics'] = {0: placed[id(e)]}
                    if pi == len(parts) - 1:
                        if e['link'] == 'tie':
                            ev['tie'] = True
                        elif e['link'] == 'slur' and not in_slur:
                            ev['slur_start'] = True
                            in_slur = True
                if pi == 0 and e['sections']:
                    ev['marks'] = [{'text': s, 'boxed': True, 'bold': True} for s in e['sections']]
                for off, c in here:
                    if pos <= off < pos + plen or (pi == len(parts) - 1 and off >= pos):
                        if off == pos and 'chord' not in ev:
                            ev['chord'] = c
                        else:
                            rel = off - pos
                            ev.setdefault('mid_chords', []).append({'offset': [rel.numerator, rel.denominator], 'text': c})
                here = [(off, c) for off, c in here if not (pos <= off < pos + plen or (pi == len(parts) - 1 and off >= pos))]
                events.append(ev)
                pos += plen
        beam(events, beat)
        for ev in events:
            del ev['_pos']
        last = bi == len(bars) - 1
        m = {'n': bi + 1, 'system': system, 'events': events, 'bar_after': '|.' if last else '|'}
        nxt = bars[bi + 1] if not last else None
        if nxt and nxt['repeat_start']:
            m['bar_after'] = '.|:'
        if b['alt_start']:
            m['volta_start'] = '%d.' % b['alt']
        if b['alt'] and (b['alt_end'] or (nxt and nxt['alt_start'])):
            m['volta_end'] = True
            if nxt and nxt['alt_start']:
                m['bar_after'] = ':|.'
        measures.append(m)
        if b['break']:
            system += 1

    tops = [22.967 + 14.5 * i for i in range(measures[-1]['system'] + 1)]
    under = {s['stanza'] for s in sections if s.get('stanza') is not None}
    rest = [(i, st) for i, st in enumerate(hymn['stanzas']) if i not in under]
    verses = []
    if rest:
        stz = [{'number': (no + '.') if no.isdigit() else None, 'lines': lines} for _, (no, lines) in rest]
        half = (len(stz) + 1) // 2 if len(stz) > 2 else len(stz)
        verses = [{'y': tops[-1] + 17, 'stanzas': part} for part in (stz[:half], stz[half:]) if part]
    title = (data.get('title') or re.sub(r'[,;:.— ]+$', '', hymn['first_line'] or '')).strip()
    return {
        'source': 'hymnal.net page data (leadsheetData/%s.json)' % hymn_id,
        'key': {'tonic': tonic[0] + {0: '', 1: '+', -1: '-'}[tonic[1]]},
        'time': {'num': num, 'den': den, 'symbol': None},
        'systems': [{'top': t} for t in tops],
        'measures': measures,
        'text': {'title': {'text': title, 'y': 9.63}, 'subtitle': {'text': hymn['category']},
                 'number': {'text': hymn['number']}, 'footer': [], 'instructions': [], 'verses': verses, 'leftover': []},
    }


def beam(events, beat):
    """Beams join the notes shorter than a quarter inside one beat (the bar's positions are in '_pos')."""
    run = []

    def close():
        if len(run) > 1:
            run[0]['beam_start'] = True
            run[-1]['beam_end'] = True
        del run[:]
    for ev in events:
        short = ev['kind'] == 'note' and ev['dur'] >= 8
        if not short or (run and int(run[0]['_pos'] / beat) != int(ev['_pos'] / beat)) \
                or (run and bool(run[0].get('tuplet')) != bool(ev.get('tuplet'))):
            close()
        if short:
            run.append(ev)
    close()


def place_words(sections, hymn, dictionary, warnings):
    """Which stanza each section of the music sings, and its syllables on the notes. -> {id(note): lyric}

    Verse n sings stanza n. A Chorus, an Ending or another section sings the first stanza of its kind whose syllables
    fill its notes exactly; a few notes marked Chorus again (the way back into a repeat) sing how the chorus begins."""
    stanzas = hymn['stanzas']
    verses = [i for i, (no, _) in enumerate(stanzas) if no.isdigit()]
    choruses = [i for i, (no, _) in enumerate(stanzas) if no == 'chorus']
    others = [i for i, (no, _) in enumerate(stanzas) if not no.isdigit() and no != 'chorus']
    placed, used = {}, []

    def fit(i, want):
        report = []
        syls = syllables_for(' '.join(stanzas[i][1]), want, dictionary, report)
        return syls, report, len(syls) == want

    for si, s in enumerate(sections):
        name, want = s['name'], len(s['notes'])
        s['stanza'] = None
        if not want:
            continue
        if name is None or name.startswith('Verse'):
            n = int(name.split()[1]) if name else 1
            cands = [i for i in verses if stanzas[i][0] == str(n)]
            if not cands and not verses and si == 0 and stanzas and name is None:
                cands = [0]
        elif name == 'Chorus':
            cands = [i for i in choruses if i not in used] + [i for i in choruses if i in used]
        else:
            cands = [i for i in others + choruses if i not in used]
        tried = [(i,) + fit(i, want) for i in cands]
        best = next((t for t in tried if t[3]), None)
        cue = False
        if best is None and name == 'Chorus' and want <= 4:
            first = next((i for i in used if i in choruses), choruses[0] if choruses else None)
            if first is not None:                      # the way back into the chorus: its first words
                syls = syllables_for(' '.join(stanzas[first][1]), 10 ** 6, dictionary, [])[:want]
                best, cue = (first, syls, [], True), True
        if best is None and tried:
            best = tried[0]
        if best is None:
            warnings.append('no words for the section %s (%d notes)' % (name or 'at the start', want))
            continue
        pick, syls, report, _ = best
        if not cue:
            s['stanza'] = pick
            used.append(pick)
        warnings += ['%s: %s' % (name or 'Verse 1', r) for r in report]
        for note, (text, hyphen) in zip(s['notes'], syls):
            placed[id(note)] = {'text': text, 'hyphen': hyphen}
    return placed


# ---------------------------------------------------------------- main

def convert(hymn_id, marks=None):
    data = json.load(open(os.path.join(DATA_DIR, hymn_id + '.json'), encoding='utf-8'))
    warnings = []
    ir = build_ir(hymn_id, data, hymn_of(hymn_id), syllable_dictionary(), warnings, marks)
    ly, more = emit_ly.emit(ir)
    return ly.replace('% Generated by svg-to-lilypond from', '% Generated by from_leadsheet_data.py from'), warnings + more


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('hymns', nargs='+')
    ap.add_argument('--out', default=os.path.join(HERE, 'build', 'leadsheet'))
    ap.add_argument('--mei', help='also write <id>.mei here (ly_to_mei.py)')
    ap.add_argument('--sections', action='append', default=[], metavar='ID=BAR:NAME,...',
                    help='sections the page does not mark: the bar, and "@n" for the n-th item of the bar when the section '
                         'starts inside it (a pickup): NS389=9@4:Chorus,20:Verse_2,35@4:Chorus')
    a = ap.parse_args()
    marks = {}
    for item in a.sections:
        hid, _, spec = item.partition('=')
        marks[hid] = {}
        for x in spec.split(','):
            where, name = x.split(':')
            bar, _, at = where.partition('@')
            marks[hid][int(bar), int(at or 1)] = name
    os.makedirs(a.out, exist_ok=True)
    for h in a.hymns:
        try:
            ly, warnings = convert(h, marks.get(h))
        except DataError as e:
            print('%s FAIL %s' % (h, e))
            continue
        path = os.path.join(a.out, h + '.ly')
        open(path, 'w', encoding='utf-8').write(ly)
        print('%s %s (%d to check)' % (h, os.path.relpath(path, ROOT), len(warnings)))
        for w in warnings:
            print('   ' + w)
        if a.mei:
            import ly_to_mei
            os.makedirs(a.mei, exist_ok=True)
            open(os.path.join(a.mei, h + '.mei'), 'w', encoding='utf-8').write(ly_to_mei.convert(ly, h)[0])


if __name__ == '__main__':
    main()
