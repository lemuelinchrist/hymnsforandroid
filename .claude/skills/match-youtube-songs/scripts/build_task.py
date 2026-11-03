#!/usr/bin/env python3
"""Builds one task file per video for the agy matcher: title, auto-caption, candidate hymns with full lyrics.

usage: build_task.py <workdir> <videos.txt> <video id> [<video id> ...]
  workdir/videos.txt   lines "<id>|<title>|..." (yt-dlp --print "%(id)s|%(title)s|%(duration)s")
  workdir/caps/<id>.en-orig.vtt   the auto-captions (see SKILL.md)
  writes workdir/task/songs/<id>.md
Candidates = hymns whose first line, first chorus line or subject equals / starts with the title, plus the 5 hymns whose
lyrics share the most word triples with the caption (so songs whose title is not a first line are found too).
Only root hymns (no parent) of the groups in GROUPS (env, default NS|E|BF|CH) are candidates: translations hang off them.
"""
import sqlite3, re, sys, os, html, collections
work, videos, ids = sys.argv[1], sys.argv[2], sys.argv[3:]
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..', '..'))
GROUPS = os.environ.get('GROUPS', 'NS|E|BF|CH')
# HYMNS_DB: a database file to read instead of sqlite/hymns.sqlite (make a fresh one: sqlite3 <file> < sqlite/hymns.sql)
db = sqlite3.connect(os.environ.get('HYMNS_DB') or os.path.join(ROOT, 'sqlite', 'hymns.sqlite'))   # ./gradlew :sqlite:importSql if it is stale
par = dict(db.execute("select _id, parent_hymn from hymns"))
isroot = lambda h: re.match(r'(%s)\d+$' % GROUPS, h) and not par.get(h)

def norm(t):
    t = html.unescape(re.sub(r'<[^>]+>', ' ', t or '')).lower().replace("'", "")
    return re.sub(r'\s+', ' ', re.sub(r'[^a-z0-9 ]', ' ', t)).strip()

def shingles(t, n=3):
    w = norm(t).split()
    return set(tuple(w[i:i + n]) for i in range(len(w) - n + 1))

lyrics = collections.defaultdict(list)
for pid, no, text in db.execute("select parent_hymn, no, text from stanza order by parent_hymn, n_order"):
    if isroot(pid) and not any(x in (no or '').lower() for x in ('youtube', 'soundcloud', 'note', 'copyright')):
        lyrics[pid].append((no, re.sub(r'<br/?>', '\n', text or '')))
index = {h: shingles(' '.join(t for _, t in v)) for h, v in lyrics.items()}
heads = collections.defaultdict(list)
for h, a, b, c in db.execute("select _id, first_stanza_line, first_chorus_line, main_category from hymns"):
    if isroot(h):
        for t in (a, b, c):
            if norm(t): heads[norm(t)].append(h)

def vtt(path):
    out, prev = [], None
    for l in open(path, encoding='utf-8'):
        l = l.strip()
        if not l or l.startswith(('WEBVTT', 'Kind:', 'Language:')) or '-->' in l: continue
        l = re.sub(r'<[^>]+>', '', l)
        if l != prev: out.append(l)
        prev = l
    return ' '.join(out)

titles = {l.split('|')[0]: l.split('|')[1] for l in open(videos, encoding='utf-8')}
os.makedirs(work + '/task/songs', exist_ok=True)
for vid in ids:
    cap_file = next((f for f in os.listdir(work + '/caps') if f.startswith(vid)), None)
    if not cap_file: print('no caption', vid, titles.get(vid)); continue
    cap = vtt(work + '/caps/' + cap_file)
    t = norm(titles[vid])
    cand = []
    for k, v in heads.items():
        if len(t) >= 8 and (k == t or k.startswith(t) or (k and t.startswith(k) and len(k) >= 10)):
            cand += [h for h in v if h not in cand]
    cs = shingles(cap)
    for sc, h in sorted(((len(cs & index[h]) / (len(index[h]) or 1), h) for h in index), reverse=True)[:5]:
        if h not in cand: cand.append(h)
    md = [f"# Video {vid}\n\nYouTube title: {titles[vid]}\n\n## Auto-generated caption (speech recognition of the singing, noisy)\n\n{cap}\n\n# Candidate hymns\n"]
    for h in cand:
        md.append(f"## {h}\n\n" + '\n\n'.join(f"[{no}]\n{x}" for no, x in lyrics.get(h, [])) + "\n")
    open(f"{work}/task/songs/{vid}.md", 'w', encoding='utf-8').write('\n'.join(md))
    print(vid, titles[vid], 'candidates:', cand)
