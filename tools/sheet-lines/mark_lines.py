#!/usr/bin/env python3
"""Marks where the lines of the words end in the sheets (sheetMei/<id>.mei), for the viewer's "Chords only" view.

  python3 tools/sheet-lines/mark_lines.py [--write] [--report] [HYMN_ID ...]

With the staff hidden the viewer draws the chords over the first stanza's words and cannot tell where a line of the
words ends (the notes only carry syllables). The database knows: stanza 1 (and the first chorus) are stored line by line.
This script aligns those words with the syllables under the notes of each sheet and sets eol="1" on the last <syl>
of every line that it finds. The viewer breaks the line there (sheet.js, chartData); a sheet without marks keeps
the old guess (a break after a sentence end). Re-running changes nothing (existing marks are removed first, so a
corrected stanza moves the mark). Without --write it only reports what it would do.
Needs app/src/main/assets/hymns.sqlite (built by the Gradle importSql task)."""
import difflib, re, sqlite3, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SHEETS = ROOT / 'app/src/main/assets/sheetMei'
CJK = re.compile(r'[㐀-鿿豈-﫿]')
NOTE = re.compile(r'<note\b[^>]*?>.*?</note>', re.S)
SYL = re.compile(r'<syl\b([^>]*)>(.*?)</syl>', re.S)


def norm(w):
    return re.sub(r'[\W_]+', '', w.lower())


def tokens(text):
    """[(token, ends_a_line)] of a stanza kept line by line with <br/>; a Chinese character is a token of its own."""
    out = []
    for line in re.split(r'<br\s*/?>|\n', text):
        line = re.sub(r'<[^>]+>', ' ', line)
        toks = []
        for w in line.split():
            if CJK.search(w):
                toks += [c for c in w if CJK.match(c)]
            elif norm(w):
                toks.append(w)
        out += [(t, False) for t in toks]
        if toks: out[-1] = (out[-1][0], True)
    return out


def stanza_tokens(db, hid):
    for h in (hid, (db.execute('select parent_hymn from hymns where _id=?', (hid,)).fetchone() or [None])[0]):
        if not h: continue
        rows = db.execute("select no, text from stanza where parent_hymn=? order by n_order", (h,)).fetchall()
        if not rows: continue
        first = next((t for n, t in rows if n == '1'), None) or rows[0][1]
        chorus = next((t for n, t in rows if re.match(r'(?i)(chorus|refrain)', n or '')), None)
        return tokens(first) + (tokens(chorus) if chorus else [])
    return []


def sheet_words(s):
    """[(text, id of the note of its last syllable)] of verse 1 under the notes, in order."""
    words, cur = [], ''
    for note in NOTE.finditer(s):
        n = note.group(0)
        nid = re.search(r'xml:id="([^"]+)"', n)
        verse = re.search(r'<verse\b[^>]*\bn="1"[^>]*>(.*?)</verse>', n, re.S)
        syl = verse and SYL.search(verse.group(1))
        if not syl or not nid: continue
        pos = re.search(r'wordpos="(\w)"', syl.group(1))
        pos = pos.group(1) if pos else None
        text = re.sub(r'<[^>]+>', '', syl.group(2))
        cur += text
        if pos in ('i', 'm'): continue
        if CJK.search(cur):
            words += [(c, nid.group(1)) for c in cur if CJK.match(c)]
        elif norm(cur):
            words.append((cur, nid.group(1)))
        cur = ''
    return words


def align(words, target):
    a = [norm(w) if not CJK.match(w[0]) else w for w, _ in words]
    b = [norm(t) if not CJK.match(t[0]) else t for t, _ in target]
    sm = difflib.SequenceMatcher(None, a, b, autojunk=False)
    ends, hit = [], 0
    for i, j, n in sm.get_matching_blocks():
        for k in range(n):
            hit += 1
            if target[j + k][1]: ends.append(words[i + k][1])
    return ends, hit


def mark(s, ends):
    s = re.sub(r' eol="1"', '', s)
    for nid in ends:
        def put(m):
            note = m.group(0)
            v = re.search(r'<verse\b[^>]*\bn="1"[^>]*>.*?</verse>', note, re.S)
            return note[:v.start()] + re.sub(r'<syl\b', '<syl eol="1"', v.group(0), count=1) + note[v.end():]
        s = re.sub(r'<note\b[^>]*xml:id="%s"[^>]*>.*?</note>' % re.escape(nid), put, s, count=1, flags=re.S)
    return s


def main(argv):
    write = '--write' in argv
    ids = [a for a in argv if not a.startswith('--')]
    db = sqlite3.connect(ROOT / 'app/src/main/assets/hymns.sqlite')
    files = [SHEETS / f'{i}.mei' for i in ids] or sorted(SHEETS.glob('*.mei'))
    stat = {'marked': 0, 'poor': 0, 'nowords': 0, 'changed': 0}
    for f in files:
        s = f.read_bytes().decode('utf-8')   # keeps CRLF as it is
        if 'type="kind">chords<' in s: continue   # a chords-only sheet already has a bar per line
        words = sheet_words(s)
        target = stanza_tokens(db, f.stem)
        if not words or not target:
            stat['nowords'] += 1
            continue
        ends, hit = align(words, target)
        if hit < 0.8 * len(words) or not ends:   # too little in common: leave the old guess
            stat['poor'] += 1
            if '--report' in argv: print('poor', f.stem, hit, len(words), len(target))
            continue
        stat['marked'] += 1
        new = mark(s, ends)
        if new != s:
            stat['changed'] += 1
            if write: f.write_bytes(new.encode('utf-8'))
    print(stat)


if __name__ == '__main__':
    main(sys.argv[1:])
