#!/usr/bin/env python3
"""Marks where the chorus starts in our own sheets: the label (C) at the first note of the chorus, as the sheets from
hymnal.net have it (<verse n="1"><label>(C)</label><syl>...). The viewer shows it left of the word, and
tools/sheet-lyrics/align.py reads it to split a sheet's words into the stanza and the chorus.

  python3 tools/lead-sheet-editor/mark_chorus.py            # report what would change, for every sheet of ours (source Hymns For Android)
  python3 tools/lead-sheet-editor/mark_chorus.py --write    # do it
  python3 tools/lead-sheet-editor/mark_chorus.py BF153 E336 --write

The chorus is the hymn's chorus stanza (the first line of it, else first_chorus_line). Its first words (up to six) are looked for in the
sheet's first verse; the label goes on the first note of the word where they are found, when that is the only place. A sheet that has
a (C) already, no chorus, or a chorus that is not in its music is left alone and listed. Run it after adding or changing a sheet of ours."""
import html, os, re, sqlite3, sys
ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
MEI = os.path.join(ROOT, 'app/src/main/assets/sheetMei')

def norm(s): return re.sub(r'[^a-z0-9]', '', html.unescape(s).lower())

def words(xml):
    """[(position of the word's first note, normalised word)] of the first verse"""
    ws = []; cur = ''; first = None
    for m in re.finditer(r'<note\b[^>]*?(?:/>|>.*?</note>)', xml, re.S):
        t = m.group(0); s = re.search(r'<syl([^>]*)>([^<]*)</syl>', t)
        if not s or '<verse n="1"' not in t: continue
        wp = re.search(r'wordpos="(\w)"', s.group(1)); wp = wp.group(1) if wp else None
        if wp in (None, 'i'):
            if cur: ws.append((first, norm(cur)))
            cur = s.group(2); first = m.start()
        else: cur += s.group(2)
    if cur: ws.append((first, norm(cur)))
    return [w for w in ws if w[1]]

def mark(xml, chorus_line, chorus_len=0):
    """-> (new xml or None, reason)"""
    if '<label>(C)</label>' in xml: return None, 'has (C)'
    cw = [norm(w) for w in re.sub(r'<[^>]+>', ' ', chorus_line).split() if norm(w)][:6]
    if len(cw) < 2: return None, 'chorus line too short'
    ws = words(xml); names = [w[1] for w in ws]
    for n in range(len(cw), 1, -1):                     # the full six words first, then fewer
        hits = [i for i in range(len(names)) if names[i:i + n] == cw[:n] and i > 0]
        if len(hits) == 1:
            pos = ws[hits[0]][0]; head = re.match(r'<note\b[^>]*>', xml[pos:]).group(0)
            end = xml.index('</note>', pos)
            seg = xml[pos:end]; seg2 = seg.replace('<verse n="1">', '<verse n="1"><label>(C)</label>', 1)
            return xml[:pos] + seg2 + xml[end:], 'marked at word %d' % hits[0]
        if len(hits) > 1 and hits[-1] - hits[0] < chorus_len: hits = hits[:1]   # the chorus repeats its own first line
        if len(hits) == 1:
            pos = ws[hits[0]][0]
            end = xml.index('</note>', pos)
            return xml[:pos] + xml[pos:end].replace('<verse n="1">', '<verse n="1"><label>(C)</label>', 1) + xml[end:], 'marked at word %d' % hits[0]
        if len(hits) > 1: return None, 'the first words come %d times' % len(hits)
    return None, 'the chorus is not in the music'

def main():
    ids = [a for a in sys.argv[1:] if not a.startswith('--')]
    db = sqlite3.connect(':memory:'); db.executescript(open(os.path.join(ROOT, 'sqlite/hymns.sql'), encoding='utf8').read())
    files = [i + '.mei' for i in ids] if ids else sorted(os.listdir(MEI))
    n = 0
    for f in files:
        xml = open(os.path.join(MEI, f), encoding='utf8').read(); h = f[:-4]
        if 'type="source">Hymns For Android<' not in xml: continue
        r = db.execute("select text from stanza where parent_hymn=? and no='chorus' order by n_order", (h,)).fetchone()
        line = r[0].split('<br/>')[0] if r else (db.execute('select first_chorus_line from hymns where _id=?', (h,)).fetchone() or [''])[0]
        if not line: continue
        clen = len(re.sub(r'<[^>]+>', ' ', r[0]).split()) if r else 0
        new, why = mark(xml, line, clen)
        if new is None:
            if why != 'has (C)': print('%-8s left alone: %s' % (h, why))
            continue
        print('%-8s %s' % (h, why)); n += 1
        if '--write' in sys.argv: open(os.path.join(MEI, f), 'w', encoding='utf8').write(new)
    print(n, 'sheets %s' % ('marked' if '--write' in sys.argv else 'would be marked'))

if __name__ == '__main__': main()
