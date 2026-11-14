#!/usr/bin/env python3
"""Makes a chords-only sheet (chords over the words, no melody) for a song we have words and chords for but no notes.

  python3 tools/chord-sheet/make_chord_sheet.py song.txt BF491 "Blanket me dear Lord" \
      --source "Chords: songbase.life" --mei app/src/main/assets/sheetMei/BF491.mei > song.json

song.txt is the song as chord sites write it (the songbase.life form):

  #Capo 2                      a comment; "Capo n" means the chords are the shapes played with that capo
  1                            a stanza number on its own line
  [C]Blanket me dear [G]Lord,  chords in brackets where they change, also inside a word (tender[G]ly)
                               (a blank line ends the stanza)
    [Em]'Cause I can't ...     lines indented by two spaces are a chorus

The MEI it writes is marked <identifier type="kind">chords</identifier>: the app's viewer and the web app then always
show it as chords over the words (one bar per line of words; every word or part of a word is a quarter note that is
never drawn), with the stanzas that have no chords below. Piano shows the chords at sounding pitch (the capo is added),
Guitar the capo and shapes the viewer works out from the key, as for every other sheet. When the melody is written
later (tools/lead-sheet-editor), the real sheet replaces this file.

The JSON on stdout is the song for the database: title, key, first line and the stanzas (no, lines) without chords."""
import argparse, json, re, sys
from xml.sax.saxutils import escape

NOTE_PC = {'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11}
SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
FLAT = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B']
FIFTHS = {0: 0, 7: 1, 2: 2, 9: 3, 4: 4, 11: 5, 6: 6, 5: -1, 10: -2, 3: -3, 8: -4, 1: -5}   # major key (pitch class) -> key.sig
CHORD = re.compile(r'^([A-G])([#b]?)([^/\s]*)(?:/([A-G])([#b]?))?$')


def pc(letter, acc): return (NOTE_PC[letter] + (1 if acc == '#' else -1 if acc == 'b' else 0)) % 12


def clean(text):
    """The words as the hymnal writes them: curly apostrophes and quotes, no chords, single spaces."""
    text = re.sub(r'\[[^\]]*\]', '', text)
    text = re.sub(r'\s+', ' ', text).strip()
    text = text.replace("'", '’')
    out, opened = [], False
    for ch in text:
        if ch == '"': out.append('”' if opened else '“'); opened = not opened
        else: out.append(ch)
    return ''.join(out)


def parse(text):
    """-> capo, blocks [{kind: 'stanza'|'chorus', no, lines: [raw line]}]"""
    capo, blocks, cur = 0, [], None
    for raw in text.replace('\r', '').split('\n') + ['']:
        if raw.lstrip().startswith('#'):
            m = re.search(r'capo\s*(\d+)', raw, re.I)
            if m: capo = int(m.group(1))
            continue
        if not raw.strip():
            if cur and cur['lines']: blocks.append(cur)
            cur = None
            continue
        if cur is None: cur = {'kind': 'chorus' if raw.startswith('  ') else 'stanza', 'no': None, 'lines': []}
        if re.fullmatch(r'\s*\d+\s*', raw) and not cur['lines']: cur['no'] = raw.strip(); continue
        cur['lines'].append(raw.strip())
    n = 0
    for b in blocks:   # stanzas without a number are counted in order
        if b['kind'] == 'stanza':
            n = int(b['no']) if b['no'] else n + 1
            b['no'] = str(n)
        else: b['no'] = 'chorus'
    return capo, blocks


def events(line):
    """One line of words with [chords] -> [(chords, text, wordpos)]: a word, or a part of one where a chord changes
    inside it; text '' for a chord that stands alone."""
    words, pending, word, glued = [], [], None, False   # word: list of [chords, text]
    for tok in re.findall(r'\[[^\]]*\]|\s+|[^\s\[]+', line):
        if tok.startswith('['):
            for name in tok[1:-1].split():
                if CHORD.match(name): pending.append(name)
                else: words.append([[pending, '(' + name + ')']]); pending = []   # "[C G F C repeat]"
            continue
        if tok.isspace():
            word, glued = None, False
            continue
        if word is not None: word.append([pending, tok])            # a chord inside the word
        else: word = [[pending, tok]]; words.append(word)
        pending = []
    if pending: words.append([[pending, '']])
    out = []
    for w in words:
        for i, (ch, t) in enumerate(w):
            pos = '' if len(w) == 1 else 'i' if i == 0 else 't' if i == len(w) - 1 else 'm'
            out.append((ch, clean(t) if t else '', pos))
    return out


def guess_key(chords):
    """The major key whose main chords the song uses most; the last and the first chord count extra."""
    best, score = 0, -1
    parsed = [(pc(m.group(1), m.group(2)), m.group(3)) for m in (CHORD.match(c) for c in chords) if m]
    for key in range(12):
        s = 0.0
        for root, kind in parsed:
            minor = kind.startswith('m') and not kind.startswith('maj')
            d = (root - key) % 12
            s += {(0, False): 3, (5, False): 2, (7, False): 2, (9, True): 1.5, (2, True): 1, (4, True): 1}.get((d, minor), 0)
        if parsed and parsed[-1] == (key, ''): s += 3
        if parsed and parsed[0][0] == key and not parsed[0][1].startswith('m'): s += 2
        if s > score: best, score = key, s
    return best


def transpose(chord, semis, flats):
    m = CHORD.match(chord)
    if not m or not semis: return chord.replace('Dim', 'dim')
    names = FLAT if flats else SHARP
    out = names[(pc(m.group(1), m.group(2)) + semis) % 12] + m.group(3).replace('Dim', 'dim')
    if m.group(4): out += '/' + names[(pc(m.group(4), m.group(5)) + semis) % 12]
    return out


def shown(chord):
    """As the app's sheets write chord names: B♭ and F♯, which is what the viewer transposes."""
    m = CHORD.match(chord)
    if not m: return chord
    acc = {'#': '\u266f', 'b': '\u266d', '': ''}
    return m.group(1) + acc[m.group(2)] + m.group(3) + ('/' + m.group(4) + acc[m.group(5)] if m.group(4) else '')


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('song'); ap.add_argument('hymn'); ap.add_argument('title')
    ap.add_argument('--source', default='', help='the credit line under the sheet, e.g. "Chords: songbase.life"')
    ap.add_argument('--mei', help='where to write the sheet (none when the song has no chords)')
    a = ap.parse_args()
    capo, blocks = parse(open(a.song, encoding='utf-8').read())
    for b in blocks: b['ev'] = [events(l) for l in b['lines']]
    used = [c for b in blocks for l in b['ev'] for ch, _, _ in l for c in ch]
    key = (guess_key(used) + capo) % 12 if used else None
    flats = key is not None and FIFTHS[key] < 0
    stanzas = [{'no': b['no'], 'lines': [clean(l) for l in b['lines'] if clean(l)]} for b in blocks]
    first = stanzas[0]['lines'][0] if stanzas else ''
    json.dump({'title': a.title, 'key': (FLAT if flats else SHARP)[key] + ' Major' if key is not None else None, 'capo': capo,
               'first_line': first, 'stanzas': stanzas}, sys.stdout, ensure_ascii=False, indent=1)
    if not a.mei or not used: return

    labelled = len(blocks) > 1
    bars, back, n, prev = [], [], 0, None   # prev: the block before, when it went below the chart
    for b in blocks:
        if not any(ch for l in b['ev'] for ch, _, _ in l):   # no chords: below the chart, as text
            if b['kind'] == 'chorus' and prev is not None:
                # a chorus stays with its stanza: after an empty line, set in a little
                back[-1] = back[-1][:-5] + '<l>\u00a0</l>' + ''.join('<l>\u2003%s</l>' % escape(clean(l)) for l in b['lines'] if clean(l)) + '</lg>'
            else:
                lines = ''.join('<l>%s</l>' % escape(clean(l)) for l in b['lines'] if clean(l))
                back.append('<lg label="%s">%s</lg>' % ('' if b['kind'] == 'chorus' else b['no'] + '.', lines))
            prev = b
            continue
        prev = None
        for li, line in enumerate(b['ev']):
            if not line: continue
            n += 1
            notes, extra = '', ''
            for i, (chords, text, pos) in enumerate(line):
                nid = 'c%d_%d' % (n, i + 1)
                syl = '<verse n="1"><syl%s>%s</syl></verse>' % (' wordpos="%s"' % pos if pos else '', escape(text)) if text else ''
                notes += '<note xml:id="%s" dur="4" pname="b" oct="4"%s' % (nid, '>' + syl + '</note>' if syl else '/>')
                if li == 0 and i == 0 and labelled:
                    extra += '<dir staff="1" place="above" startid="#%s">%s</dir>' % (nid, 'Chorus' if b['kind'] == 'chorus' else b['no'])
                for c in chords:
                    extra += '<harm staff="1" place="above" tstamp="%d">%s</harm>' % (i + 1, escape(shown(transpose(c, capo, flats))))
            bars.append('<measure n="%d" metcon="false"><staff n="1"><layer n="1">%s</layer></staff>%s</measure>' % (n, notes, extra))
    f = FIFTHS[key]
    mei = ('<?xml version="1.0" encoding="UTF-8"?>\n<mei xmlns="http://www.music-encoding.org/ns/mei" meiversion="5.0">\n'
           '<meiHead><fileDesc><titleStmt><title type="main">%s</title>\n</titleStmt><pubStmt><identifier type="hymn">%s</identifier>'
           '<identifier type="number"></identifier><identifier type="kind">chords</identifier>%s</pubStmt></fileDesc></meiHead>\n'
           '<music><body><mdiv><score>\n<scoreDef key.sig="%s" meter.count="4" meter.unit="4"><staffGrp>'
           '<staffDef n="1" lines="5" clef.shape="G" clef.line="2"/></staffGrp></scoreDef>\n<section>\n%s\n</section>\n'
           '</score></mdiv></body>%s</music></mei>\n'
           % (escape(a.title), escape(a.hymn), '<identifier type="source">%s</identifier>' % escape(a.source) if a.source else '',
              '0' if f == 0 else '%d%s' % (abs(f), 's' if f > 0 else 'f'), '\n'.join(bars),
              '\n<back><div type="verses">\n%s\n</div>\n</back>' % '\n'.join(back) if back else ''))
    open(a.mei, 'w', encoding='utf-8', newline='\n').write(mei)


if __name__ == '__main__':
    main()
