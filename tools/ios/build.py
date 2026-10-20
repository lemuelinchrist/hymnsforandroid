#!/usr/bin/env python3
"""Builds tools/ios/hymnal.html, or the path given as argv[1] (single offline file) from app/src/main/assets/hymns.sqlite.
Book names and order are read from HymnGroup.java, so a new language needs no edit here
(add it to HymnGroup.java; add it to OWN below only if hymnal.net has its own collection)."""
import sqlite3, json, gzip, base64, re, sys, os
here = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(here, '..', '..')
DB = os.path.join(ROOT, 'app/src/main/assets/hymns.sqlite')
ENUM = os.path.join(ROOT, 'app/src/main/java/com/lemuelinchrist/android/hymns/HymnGroup.java')
books = re.findall(r'^\s+([A-Z]{1,3})\(\s*"([^"]+)"', open(ENUM, encoding='utf-8').read(), re.M)
BOOKS = dict(books); ORDER = [b[0] for b in books]
c = sqlite3.connect(DB)

def clean(s):
    if not s: return ''
    s = re.sub(r'<br\s*/?>', '\n', s)
    s = re.sub(r'</?(?!i>|u>)\w+[^>]*>', '', s)   # keep <i>/<u> only
    return s.strip('\n ')

# own hymnal.net collection per group (number = our number); verified to exist
OWN = {'E': 'h', 'NS': 'ns', 'C': 'ch', 'Z': 'ch', 'CS': 'ts', 'ZS': 'ts', 'CH': 'c',
       'T': 'ht', 'CB': 'cb', 'G': 'de'}
SHEET = [(r'/e0*(\d+)_new', 'nt'), (r'/e0*(\d+)_', 'h'), (r'/ns0*(\d+)_', 'ns'),
         (r'/ts0*(\d+)_', 'ts'), (r'/child0*(\d+)_', 'c'), (r'/c0*(\d+)_', 'ch')]
def link(g, no, sheet, parent):
    if g in OWN and no.isdigit(): return f"{OWN[g]}/{int(no)}"
    for rx, col in SHEET:
        m = re.search(rx, sheet or '')
        if m: return f"{col}/{int(m.group(1))}"
    m = re.fullmatch(r'E(\d+)', parent or '')
    if m: return f"h/{m.group(1)}"
    return ''

st = {}
for pid, no, text, note in c.execute("select parent_hymn,no,text,note from stanza order by parent_hymn,n_order,id"):
    t = clean(text)
    if no == 'copyright' and not t: continue
    st.setdefault(pid, []).append([no, t] + ([clean(note)] if note else []))

rows = list(c.execute("""select _id,hymn_group,no,first_stanza_line,first_chorus_line,author,composer,key,time,
  tune,meter,main_category,sub_category,verse,related,parent_hymn,sheet_music_link from hymns"""))
byid = {r[0]: r for r in rows}
hymns = []
for (i,g,no,fs,fc,au,co,key,tm,tune,meter,mc,sc,verse,rel,par,sheet) in rows:
    p = byid.get(par)
    def inh(v, idx): return v if v else (p[idx] if p and p[idx] else '')
    stz = st.get(i) or (st.get(par) if p else None) or []
    title = clean(fs or fc or (stz[0][1].split('\n')[0] if stz else i)).split('\n')[0]
    relset = [x for x in (rel or '').split(',') if x]
    if p:
        for x in (p[14] or '').split(','):
            if x and x not in relset: relset.append(x)
        if par not in relset: relset.append(par)
    relset = [x for x in relset if x != i and x in byid]
    meta = {k: v for k, v in dict(
        a=inh(au,5), m=inh(co,6), k=inh(key,7), t=inh(tm,8), n=inh(tune,9), r=inh(meter,10),
        c=inh(mc,11), s=inh(sc,12) if (mc or not p) else (p[12] or ''), v=inh(verse,13)).items() if v}
    ln = link(g, no, sheet or (p[16] if p else ''), par)
    if not ln:
        for x in relset:
            if re.fullmatch(r'E\d+', x): ln = 'h/' + x[1:]; break
    h = [i, g, no, title, stz if (i in st) else 0, par or '', meta, relset, ln]
    hymns.append(h)

groups = [r[0] for r in c.execute("select hymn_group from hymns group by 1")]
for g in groups:
    if g not in BOOKS: print(f'WARNING: group {g} is in the database but not in HymnGroup.java - it will be hidden', file=sys.stderr)
payload = json.dumps(hymns, ensure_ascii=False, separators=(',', ':')).encode()
gz = gzip.compress(payload, 9)
b64 = base64.b64encode(gz).decode()
tpl = open(os.path.join(here, 'template.html'), encoding='utf-8').read()
out = tpl.replace('/*DATA*/', b64).replace('/*BOOKS*/{}', json.dumps(BOOKS, ensure_ascii=False)).replace('/*ORDER*/[]', json.dumps(ORDER))
dest = os.path.abspath(sys.argv[1]) if len(sys.argv) > 1 else os.path.join(here, 'hymnal.html')
os.makedirs(os.path.dirname(dest), exist_ok=True)
open(dest, 'w', encoding='utf-8').write(out)
print(len(hymns), 'hymns; json', len(payload)//1024, 'KB; gz', len(gz)//1024, 'KB; html', len(out)//1024, 'KB')
