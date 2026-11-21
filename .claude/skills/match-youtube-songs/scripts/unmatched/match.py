"""Step 2: candidates per recording (set.json + work/lyrics/<video id>.txt from tools/audio-transcribe/batch_lyrics.py) -> matched.json.
Title and sung words against the database and songbase.life (SONGBASE_JSON=<app_data json>, default ./songbase_app_data.json; sb_in_db.json caches
which songbase songs are already hymns). Run from the work folder."""
import json, re, sqlite3, collections, difflib, unicodedata, os, pathlib
R = pathlib.Path(__file__).resolve().parents[4]
db = sqlite3.connect(R/'app/src/main/assets/hymns.sqlite')
S = json.load(open('set.json'))
par = dict(db.execute('select _id,parent_hymn from hymns')); grp = dict(db.execute('select _id,hymn_group from hymns'))
def root(h):
    for _ in range(5):
        if par.get(h): h = par[h]
    return h
CJK = re.compile(r'[一-鿿]')
def clean(t): return re.sub(r'<[^>]+>', ' ', t or '').replace('’', "'")
def words(t): return re.findall(r"[a-z']+", clean(t).lower())
def pairs(w): return {(a, b) for a, b in zip(w, w[1:])}
def nrm(s):
    s = unicodedata.normalize('NFKD', clean(s)).lower()
    return re.sub(r'[^a-z0-9一-鿿 ]+', ' ', s).split()
# ---- corpus
text = collections.defaultdict(list)
for h, t in db.execute('select parent_hymn,text from stanza order by n_order'): text[h].append(clean(t))
info = {h: (f, ti, v) for h, f, ti, v in db.execute('select _id,first_stanza_line,title,verse from hymns')}
EN = ('E', 'NS', 'BF', 'CH'); ZH = ('C', 'CS', 'T', 'CB', 'ZS', 'Z')
H = {}   # root hymn -> dict
for h, g in grp.items():
    if h != root(h): continue
    tx = ' '.join(text.get(h, []))
    if not tx: continue
    lines = [re.sub(r'\s+', ' ', l).strip() for t in text[h] for l in re.split(r'<br/>|\n', t) if l.strip()]
    f, ti, v = info[h]
    H[h] = {'g': g, 'first': (f or '').strip(), 'title': ti or '', 'verse': v or '', 'lines': lines, 'pairs': pairs(words(tx)), 'zh': bool(CJK.search(tx))}
sb = json.load(open(pathlib.Path(os.environ.get('SONGBASE_JSON', 'songbase_app_data.json')), encoding='utf-8'))['songs']
SB = []
for s in sb:
    if s['lang'] not in ('english', '繁體中文'): continue
    ly = re.sub(r'\[[^\]]*\]', '', s['lyrics'])
    SB.append({'id': s['id'], 'title': s['title'], 'pairs': pairs(words(ly)), 'lines': [l.strip() for l in ly.split('\n') if l.strip()], 'zh': s['lang'] != 'english', 'text': ly})
def contain(a, b): return len(a & b) / len(a) if a else 0
Hen = {h: v for h, v in H.items() if v['g'] in EN}
if os.path.exists('sb_in_db.json'): sb_in_db = {int(k): v for k, v in json.load(open('sb_in_db.json')).items()}
else:
    idx = collections.defaultdict(set)
    for h, v in Hen.items():
        for p in v['pairs']: idx[p].add(h)
    sb_in_db = {}
    for s_ in SB:
        if s_['zh'] or len(s_['pairs']) < 6: continue
        cnt = collections.Counter(h for p in s_['pairs'] for h in idx.get(p, ()))
        if cnt:
            h, n = cnt.most_common(1)[0]
            if n / len(s_['pairs']) >= 0.8: sb_in_db[s_['id']] = h
    json.dump(sb_in_db, open('sb_in_db.json', 'w'))
def tnorm(t):
    t = re.sub(r'\(.*?\)|\[.*?\]', ' ', t)
    t = re.sub(r'\b(new tune|instrumental|banner song|excerpt|alternate tune)\b', ' ', t, flags=re.I)
    return ' '.join(nrm(t))
def prep(first, extra, lines):
    f = ' '.join(nrm(first or '')); ex = [' '.join(nrm(x)) for x in extra if x]
    return {'first': f, 'extra': ex, 'lines': lines, 'join': '|' + '|'.join(' '.join(nrm(l)) for l in lines) + '|'}
for v in H.values(): v['P'] = prep(v['first'], [v['title']], v['lines'])
for s_ in SB: s_['P'] = prep(s_['title'], [], s_['lines'][:40])
def title_score(t, P, raw):
    tn = tnorm(t)
    if len(tn.replace(' ', '')) < 4: return 0, ''
    nw = len(tn.split()); zh = bool(CJK.search(tn))
    if P['first'] and P['first'] == tn: return 1.0, 'first line'
    if tn in P['extra']: return 1.0, 'hymn title'
    if nw >= 3 or (zh and len(tn.replace(' ', '')) >= 5):
        for c in [P['first']] + P['extra']:
            if c and c.startswith(tn): return 0.85, 'start of first line/title'
            if c and tn.startswith(c) and len(c.split()) >= 3: return 0.8, 'first line inside title'
        if ('|' + tn + '|') in P['join']: return 0.6, 'a whole line'
        if ('|' + tn) in P['join']: return 0.5, 'start of a line'
    c = P['first']
    if c and abs(len(c) - len(tn)) <= 6 and difflib.SequenceMatcher(None, tn, c).ratio() > 0.85: return 0.75, 'first line, near'
    return 0, ''
def ref_norm(t):
    m = re.search(r'((?:[1-3] )?[A-Za-z]+\.?)\s*(\d+)[:.](\d+)(?:\s*[-–&,]\s*(\d+))?', t.replace('1 John', '1John'))
    return m
ZH_ONLY = lambda t: bool(CJK.search(t))
for o in S:
    t = o['title']; zh = ZH_ONLY(t); cands = {}
    def add(key, score, ev, kind):
        c = cands.setdefault(key, {'k': key, 'kind': kind, 'title': 0, 'lyric': 0, 'ev': []})
        if kind == 'title': c['title'] = max(c['title'], score)
        else: c['lyric'] = max(c['lyric'], score)
        if ev not in c['ev']: c['ev'].append(ev)
    # hymn number titles
    m = re.match(r'^Hymns? (\d+)\b', t)
    if m:
        h = 'E' + m.group(1)
        if h in H: add(h, 0.9, 'title says %s' % t, 'title')
    # title vs DB
    for h, v in H.items():
        if v['zh'] != zh: continue
        sc, l = title_score(t, v['P'], v['first'])
        if sc >= 0.5: add(h, sc, 'title = %s: "%s"' % (l, v['first'][:50]), 'title')
    for s in SB:
        if s['zh'] != zh: continue
        sc, l = title_score(t, s['P'], s['title'])
        if sc >= 0.5:
            key = sb_in_db.get(s['id']) or 'SB%d' % s['id']
            add(key, sc, 'songbase %s: "%s"' % (l, s['title'][:50]), 'title')
    # scripture reference vs verse
    ref = ref_norm(t)
    if ref:
        book = ref.group(1).lower().rstrip('.'); ch, v1 = ref.group(2), ref.group(3)
        for h, v in H.items():
            vs = v['verse'].lower()
            if vs and book[:4] in vs and re.search(r'\b%s:%s\b' % (ch, v1), vs): add(h, 0.6, 'verse %s' % v['verse'], 'title')
    # lyrics
    ly = None
    p = pathlib.Path('work/lyrics/%s.txt' % o['id'])
    if p.exists():
        ly = p.read_text(encoding='utf8'); w = words(ly); pr = pairs(w); o['words'] = ' '.join(w[:40])
        o['nwords'] = len(w)
        if len(pr) >= 6 and not re.fullmatch(r'(thank you\s*)+', ' '.join(w) + ' '):
            scs = sorted(((contain(pr, v['pairs']), h) for h, v in Hen.items()), reverse=True)[:3]
            for x, h in scs:
                if x >= 0.3: add(h, x, 'words %.2f' % x, 'lyric')
            scs = sorted(((contain(pr, s['pairs']), s['id']) for s in SB if not s['zh']), reverse=True)[:3]
            for x, i in scs:
                if x >= 0.3:
                    key = sb_in_db.get(i) or 'SB%d' % i
                    add(key, x, 'words vs songbase %.2f' % x, 'lyric')
    for c in cands.values():
        a, b = c['title'], c['lyric']
        c['score'] = round(min(1.0, max(a, b) + 0.25 * min(a, b) * (1 if min(a, b) >= 0.3 else 0)), 3)
        if a >= 0.7 and b >= 0.5: c['score'] = round(min(1.0, 0.5 * a + 0.5 * b + 0.3), 3)
    o['cands'] = sorted(cands.values(), key=lambda c: -c['score'])[:4]
    o['conf'] = o['cands'][0]['score'] if o['cands'] else 0
    o['has_audio'] = bool(ly) or bool(o['local'])
json.dump(S, open('matched.json', 'w'), ensure_ascii=False, indent=0)
C = collections.Counter('none' if not o['cands'] else ('>=0.9' if o['conf'] >= .9 else '>=0.7' if o['conf'] >= .7 else '>=0.5' if o['conf'] >= .5 else '<0.5') for o in S)
print(C)
