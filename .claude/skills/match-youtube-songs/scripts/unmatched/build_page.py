"""Step 3: review.html from matched.json, ordered by confidence. Run from the work folder, then `python3 <skill>/scripts/unmatched/serve.py`."""
import json, re, sqlite3, pathlib, collections
R = pathlib.Path(__file__).resolve().parents[4]
HERE = pathlib.Path(__file__).resolve().parent
S = json.load(open('matched.json'))
db = sqlite3.connect(R/'app/src/main/assets/hymns.sqlite')
sb = {s['id']: s for s in json.load(open(pathlib.Path(os.environ.get('SONGBASE_JSON', 'songbase_app_data.json')), encoding='utf-8'))['songs']}
S.sort(key=lambda o: (-o['conf'], not o['has_audio'], o['title']))
GROUPS = {'E', 'NS', 'BF', 'CH', 'T', 'C', 'CS'}
need = {c['k'] for o in S for c in o['cands'] if not c['k'].startswith('SB')}
hy = {h: p for h, g, p in db.execute('select _id,hymn_group,parent_hymn from hymns') if g in GROUPS or h in need}
def lyrics(h):
    q = "select no,text from stanza where parent_hymn=? order by n_order"
    rows = db.execute(q, (h,)).fetchall()
    if not rows and hy.get(h): rows = db.execute(q, (hy[h],)).fetchall()
    return [[n, re.sub(r'<br\s*/?>', '\n', t or '')] for n, t in rows]
L = {h: v for h in hy if (v := lyrics(h))}
rows = []
for o in S:
    r = {'v': o['id'], 't': o['title'], 'c': [], 'ev': {}, 'sbs': [], 'conf': o['conf'], 'alb': o['album'], 'ch': o['channel'], 'w': o.get('words', '') if o.get('nwords', 0) >= 6 else ''}
    for c in o['cands']:
        if c['k'].startswith('SB'):
            s = sb[int(c['k'][2:])]
            r['sbs'].append({'id': s['id'], 'title': s['title'], 'lyrics': re.sub(r'\[[^\]]*\]', '', s['lyrics']), 'ev': '; '.join(c['ev']), 'sc': c['score']})
        elif c['k'] in L:
            r['c'].append(c['k']); r['ev'][c['k']] = '%d%%: %s' % (round(c['score'] * 100), '; '.join(c['ev']))
    r['c'] = r['c'][:3]; r['sbs'] = r['sbs'][:2]
    rows.append(r)
t = open(HERE / 'review_template.html', encoding='utf-8').read()
t = t.replace('__ROWS__', json.dumps(rows, ensure_ascii=False)).replace('__LYR__', json.dumps(L, ensure_ascii=False, separators=(',', ':')))
open('review.html', 'w', encoding='utf-8').write(t)
print(len(rows), 'rows,', len(L), 'hymns with lyrics', round(len(t) / 1e6, 1), 'MB')
