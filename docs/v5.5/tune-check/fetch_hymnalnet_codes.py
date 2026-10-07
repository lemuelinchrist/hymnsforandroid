"""Fetch the hymnal.net page of every hymn with sheet music; write hn_full.tsv:
id, db tune, site code, status, url path, page title, first-line-found(Y/n), midi links."""
import re, sqlite3, subprocess, sys, time, html, os
S = os.path.dirname(os.path.abspath(__file__))
db = sqlite3.connect(os.path.join(S, 'db.sqlite'))
ids = [l.strip() for l in open(os.path.join(S, 'all_ids.txt')) if l.strip()]
def url_for(i, link):
    g = re.match(r'[A-Z]+', i).group(); n = int(i[len(g):])
    if g == 'E': return 'h/%d' % n
    if g == 'NS': return 'lb/%d' % (n - 10000) if n > 10000 else 'ns/%d' % n
    if g == 'C': return 'ch/%d' % n
    if g == 'CS': return 'ts/%d' % n
    if g == 'CH': return 'c/%d' % n
    if g == 'BF':
        m = re.search(r'NewTunes/svg/e0*(\d+)_new', link or '')
        return 'nt/%s' % m.group(1) if m else None
norm = lambda s: re.sub(r'[\W_]+', '', html.unescape(s or '')).lower()
out = open(os.path.join(S, 'hn_full.tsv'), 'w')
for k, i in enumerate(ids):
    row = db.execute('select tune, first_stanza_line, sheet_music_link from hymns where _id=?', (i,)).fetchone()
    if not row:
        out.write('\t'.join([i, '', '', 'NOT_IN_DB']) + '\n'); continue
    tune, first, link = row; tune = (tune or '').strip()
    u = url_for(i, link)
    if not u:
        out.write('\t'.join([i, tune, '', 'NO_SOURCE', '', '', '', '']) + '\n'); continue
    f = os.path.join(S, 'hn', i + '.html')
    if not os.path.exists(f) or os.path.getsize(f) < 5000:
        subprocess.run(['curl', '-s', '--max-time', '30', '-A', 'Mozilla/5.0', 'https://www.hymnal.net/en/hymn/' + u, '-o', f]); time.sleep(1)
    t = open(f, encoding='utf-8', errors='replace').read()
    m = re.search(r'Hymn Code:</label>.*?<a [^>]*>([^<]*)</a>', t, re.S)
    code = m.group(1).strip() if m else ''
    tm = re.search(r'<title>([^<]*)', t)
    title = html.unescape(tm.group(1)).strip() if tm else ''
    fl = norm(first)[:12]
    found = 'Y' if fl and fl in norm(re.sub(r'<[^>]+>', '', t)) else 'n'
    midis = ' '.join(sorted(set(re.findall(r'href="([^"]*\.midi?)"', t))))
    st = 'MATCH' if code == tune else ('NO_CODE' if not code else 'DIFF')
    out.write('\t'.join([i, tune, code, st, u, title[:60], found, midis]) + '\n'); out.flush()
    if k % 200 == 0: print(k, i, flush=True)
