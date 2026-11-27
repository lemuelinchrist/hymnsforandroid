#!/usr/bin/env python3
"""Names the chords of sheets made by midi_to_sheet.py again (chords.py), leaving everything else of the sheet as it is now:
notes, words, tempo, credit, hand fixes. The conversion is run from the ORIGINAL sheets (git f43b1ce5e) into a scratch folder, and its
chords go into the current sheet only where the notes of every bar are the same; otherwise the sheet is left alone and named in the report.

usage: python3 tools/rechord.py [--write] hymn [hymn ...]
"""
import os, re, subprocess, sys, tempfile, sqlite3
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..'))
ORIG_COMMIT = 'f43b1ce5e'
def main():
    write = '--write' in sys.argv; ids = [a for a in sys.argv[1:] if not a.startswith('--')]
    if not ids: print(__doc__); sys.exit(2)
    work = tempfile.mkdtemp(prefix='rechord_'); orig = os.path.join(work, 'orig'); new = os.path.join(work, 'new'); os.makedirs(orig); os.makedirs(new)
    tar = subprocess.run(['git', '-C', ROOT, 'archive', ORIG_COMMIT, 'app/src/main/assets/sheetMei'], capture_output=True).stdout
    subprocess.run(['tar', '-x', '-C', orig, '--strip-components=5'], input=tar, check=True)
    os.environ['MEI_DIR'] = orig; sys.path.insert(0, HERE)
    import midi_to_sheet as M
    db = sqlite3.connect(':memory:'); db.executescript(open(os.path.join(ROOT, 'sqlite/hymns.sql'), encoding='utf8').read())
    MEAS = re.compile(r'<measure\b[^>]*>.*?</measure>', re.S); HARM = re.compile(r'\n?<harm\b[^>]*>[^<]*</harm>')
    def sig(m): return re.findall(r'<(?:note|rest)\b[^>]*?(?:pname="(\w)")?[^>]*?(?:oct="(\d)")?[^>]*?dur="(\d+)"[^>]*?(?:dots="(\d)")?', HARM.sub('', m))
    def sig2(m): return [tuple(re.findall(r'(pname|oct|dur|dots|accid|accid\.ges)="([^"]*)"', t)) for t in re.findall(r'<(?:note|rest)\b[^>]*>', m)]
    done = skipped = 0
    for hid in ids:
        import io, contextlib
        buf = io.StringIO()
        with contextlib.redirect_stdout(buf):
            try: M.convert(hid, db, True, new)
            except Exception as e: print('ERROR', e)
        p_new = os.path.join(new, hid + '.mei')
        if not os.path.exists(p_new): print(hid, 'SKIPPED: the converter wrote nothing:', buf.getvalue().strip().split('\n')[-1][:100]); skipped += 1; continue
        cur_path = os.path.join(ROOT, 'app/src/main/assets/sheetMei', hid + '.mei')
        cur = open(cur_path, encoding='utf8').read(); nw = open(p_new, encoding='utf8').read()
        cm = MEAS.findall(cur); nm = MEAS.findall(nw)
        if len(cm) != len(nm) or any(sig2(a) != sig2(b) for a, b in zip(cm, nm)):
            print(hid, 'SKIPPED: its notes are not those of a fresh conversion (edited by hand?)'); skipped += 1; continue
        out = []; pos = 0
        for a, b in zip(MEAS.finditer(cur), nm):
            hh = ''.join(re.findall(r'\n?<harm\b[^>]*>[^<]*</harm>', b))
            body = HARM.sub('', a.group(0)); body = body[:-len('</measure>')].rstrip('\n') + hh + '\n</measure>'
            out.append(cur[pos:a.start()] + body); pos = a.end()
        res = ''.join(out) + cur[pos:]
        if write: open(cur_path, 'w', encoding='utf8').write(res)
        done += 1
    print('%d sheets %s, %d left alone' % (done, 'rechorded' if write else 'checked (dry run)', skipped))
if __name__ == '__main__': main()
