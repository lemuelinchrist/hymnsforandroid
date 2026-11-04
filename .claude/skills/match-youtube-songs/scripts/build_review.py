#!/usr/bin/env python3
"""Build the review page (video + candidate lyrics + tick box) for the videos agy could not match.

usage: python3 build_review.py <to_review.csv> <out.html>
CSV columns (UTF-8, header row): Video (youtube watch url), Title, Status,
"Possible hymns from the title (first line)" (entries like `NS868 (IT IS ...); E12 (...)`), "Your hymn (fill in)".
Lyrics of the E, NS, BF and CH hymns come from app/src/main/assets/hymns.sqlite (children with no own stanzas
use their parent's). Serve the html over http (python3 -m http.server 8765 --bind 127.0.0.1): from file://
YouTube refuses the embed (error 153). Answers (TSV: Video, Title, Your hymn) come from the page's Export button.
"""
import csv, json, re, sqlite3, sys, pathlib
here = pathlib.Path(__file__).resolve().parent
root = here.parents[3]
db = sqlite3.connect(root / 'app/src/main/assets/hymns.sqlite')
hy = dict(db.execute("select _id,parent_hymn from hymns where hymn_group in ('E','NS','BF','CH')"))
def lyrics(h):
    q = "select no,text from stanza where parent_hymn=? order by n_order"
    rows = db.execute(q, (h,)).fetchall()
    if not rows and hy.get(h):
        rows = db.execute(q, (hy[h],)).fetchall()
    return [[n, re.sub(r'<br\s*/?>', '\n', t or '')] for n, t in rows]
L = {h: v for h in hy if (v := lyrics(h))}
rows = []
with open(sys.argv[1], encoding='utf-8-sig', newline='') as f:
    for r in csv.DictReader(f):
        vid = re.search(r'v=([\w-]+)', r['Video']).group(1)
        cands = re.findall(r'\b([A-Z]{1,2}\d+) \(', r['Possible hymns from the title (first line)'])
        rows.append({'v': vid, 't': r['Title'], 'c': cands})
html = (here / 'review_template.html').read_text(encoding='utf-8')
html = html.replace('__ROWS__', json.dumps(rows, ensure_ascii=False)).replace('__LYR__', json.dumps(L, ensure_ascii=False, separators=(',', ':')))
pathlib.Path(sys.argv[2]).write_text(html, encoding='utf-8')
print(len(rows), 'videos,', len(L), 'hymns with lyrics')
