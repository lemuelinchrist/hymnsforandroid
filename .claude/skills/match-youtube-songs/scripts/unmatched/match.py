"""Step 2: candidates per recording (set.json + work/lyrics/<video id>.txt from tools/audio-transcribe/batch_lyrics.py) -> matched.json.
Title and sung words against the database and songbase.life (SONGBASE_JSON=<app_data json>, default ./songbase_app_data.json; sb_in_db.json caches
which songbase songs are already hymns). Run from the work folder."""
import json, re, sqlite3, collections, difflib, unicodedata, os, pathlib
R = next(p for p in pathlib.Path(__file__).resolve().parents if (p / 'app/src/main/assets/hymns.sqlite').exists())
db = sqlite3.connect(R/'app/src/main/assets/hymns.sqlite')
S = json.load(open('set.json'))
par = dict(db.execute('select _id,parent_hymn from hymns')); grp = dict(db.execute('select _id,hymn_group from hymns'))
def root(h):
    for _ in range(5):
        if par.get(h): h = par[h]
    return h
CJK = re.compile(r'[一-鿿]')
ZH_TRANS = str.maketrans('裡祢祂阿着惟', '裏你他啊著唯')
def clean(t): return re.sub(r'<[^>]+>', ' ', t or '').replace('’', "'")
def words(t): return re.findall(r"[a-z']+", clean(t).lower())
def pairs(w): return {(a, b) for a, b in zip(w, w[1:])}
def nrm(s):
    s = unicodedata.normalize('NFKD', clean(s)).lower()
    return re.sub(r'[^a-z0-9一-鿿 ]+', ' ', s).split()
def zh_clean(s):
    s = re.sub(r'<[^>]+>', '', s or '').translate(ZH_TRANS)
    return re.sub(r'[^\u4e00-\u9fff0-9A-Za-z]+', '', s)
def strip_title_noise(t):
    t = re.sub(r'^\d+\s*[.、\-]?\s*', '', t.strip())
    t = re.sub(r'[－\-]\s*(?:SOLSO|水流之音|.*音樂會).*$', '', t)
    return t.strip()
def zh_title_variants(t):
    s = strip_title_noise(t)
    v1 = zh_clean(s)
    v2 = zh_clean(re.sub(r'[－\-].*$', '', s))
    return (v1,) if v1 == v2 else (v1, v2)
existing_links = collections.defaultdict(list)
for h, inst_flag, alb in db.execute("select hymn_id, instrumental, album from link where kind in ('youtube', 'soundcloud')"):
    existing_links[h].append((1 if inst_flag == 1 else 0, (alb or '').strip()))
def link_summary(h):
    lks = existing_links.get(h, [])
    if not lks: return 'no existing recordings'
    sung_n = sum(1 for i, _ in lks if i == 0)
    inst_albs = [a for i, a in lks if i == 1]
    inst_n = len(inst_albs)
    albs = ', '.join(a for a in inst_albs if a)
    return f'existing: {sung_n} sung, {inst_n} inst' + (f' ({albs})' if albs else '')
# ---- corpus
text_raw = collections.defaultdict(list)
for h, t in db.execute('select parent_hymn,text from stanza order by n_order'): text_raw[h].append(t or '')
info = {h: (f, ch, ti, v) for h, f, ch, ti, v in db.execute('select _id,first_stanza_line,first_chorus_line,title,verse from hymns')}
EN = ('E', 'NS', 'BF', 'CH'); ZH = ('C', 'CS', 'T', 'CB', 'ZS', 'Z')
H = {}   # root hymn (or C/CS hymn itself) -> dict
for h, g in grp.items():
    if g not in ('C', 'CS') and h != root(h): continue
    if not text_raw.get(h): continue
    tx = clean(' '.join(text_raw[h]))
    lines = [re.sub(r'\s+', ' ', clean(l)).strip() for t in text_raw[h] for l in re.split(r'<br\s*/?>|\n', t) if clean(l).strip()]
    f, ch, ti, v = info[h]
    first = (f or (lines[0] if lines else '')).strip()
    pairs2 = [lines[i] + lines[i + 1] for i in range(len(lines) - 1)]
    first2 = (lines[0] + lines[1]) if len(lines) >= 2 else first
    H[h] = {'g': g, 'first': first, 'first2': first2, 'chorus': (ch or '').strip(), 'title': ti or '', 'verse': v or '',
            'lines': lines, 'pairs': pairs(words(tx)), 'zh': bool(CJK.search(tx)),
            'c_first': zh_clean(first), 'c_first2': zh_clean(first2), 'c_chorus': zh_clean(ch or ''), 'c_title': zh_clean(ti or ''),
            'c_lines': [(zh_clean(l), l) for l in lines if zh_clean(l)],
            'c_pairs': [(zh_clean(p), p) for p in pairs2 if zh_clean(p)],
            'c_full': zh_clean(' '.join([ti or '', first, ch or '', tx]))}
sb = json.load(open(pathlib.Path(os.environ.get('SONGBASE_JSON', 'songbase_app_data.json')), encoding='utf-8'))['songs']
SB = []
for s in sb:
    if s['lang'] not in ('english', '繁體中文'): continue
    ly = re.sub(r'\[[^\]]*\]', '', s['lyrics'])
    SB.append({'id': s['id'], 'title': s['title'], 'pairs': pairs(words(ly)), 'lines': [l.strip() for l in ly.split('\n') if l.strip()], 'zh': s['lang'] != 'english', 'text': ly})
def contain(a, b): return len(a & b) / len(a) if a else 0
Hen = {h: v for h, v in H.items() if v['g'] in EN}
Hzh = {h: v for h, v in H.items() if v['g'] in ('C', 'CS')}
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
zh_title_idx = {}
for h, v in sorted(Hzh.items()):
    for key in (v['c_first'], v['c_first2'], v['c_title'], v['c_chorus']):
        if key and key not in zh_title_idx: zh_title_idx[key] = h
for s_ in SB:
    if s_['zh'] and s_['id'] not in sb_in_db:
        st = zh_clean(s_['title'])
        if st in zh_title_idx:
            sb_in_db[s_['id']] = zh_title_idx[st]
        elif len(st) >= 6:
            hits = [h for h, v in sorted(Hzh.items()) if v['c_first2'].startswith(st) or v['c_first'].startswith(st)]
            if len(hits) == 1: sb_in_db[s_['id']] = hits[0]
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
def zh_score(t, v):
    sc, ev = 0, ''
    for tc in zh_title_variants(t):
        if not tc: continue
        if tc in (v['c_first'], v['c_first2']):
            return 1.0, 'first line: "%s"' % (v['first2'] or v['first'])[:50]
        if v['c_title'] and tc == v['c_title']:
            sc, ev = max(sc, 0.99), 'hymn title: "%s"' % v['title'][:50]
        elif v['c_chorus'] and tc == v['c_chorus']:
            sc, ev = max(sc, 0.98), 'chorus line: "%s"' % v['chorus'][:50]
        else:
            for cp, orig_p in v['c_pairs']:
                if tc == cp and 0.96 > sc: sc, ev = 0.96, 'line pair: "%s"' % orig_p[:50]
                elif len(tc) >= 5 and (cp.startswith(tc) or tc.startswith(cp)) and 0.90 > sc: sc, ev = 0.90, 'pair prefix: "%s"' % orig_p[:50]
            for cl, orig_l in v['c_lines']:
                if tc == cl and 0.94 > sc: sc, ev = 0.94, 'whole line: "%s"' % orig_l[:50]
                elif len(tc) >= 4 and len(cl) >= 4 and (cl.startswith(tc) or tc.startswith(cl)) and 0.85 > sc: sc, ev = 0.85, 'line prefix: "%s"' % orig_l[:50]
                elif len(tc) >= 3 and tc in cl:
                    val = 0.78 if len(tc) >= 5 else (0.70 if len(tc) == 4 else 0.60)
                    if val > sc: sc, ev = val, 'in line: "%s"' % orig_l[:50]
            if sc < 0.75 and len(tc) >= 4 and tc in v['c_full']:
                sc, ev = 0.72, 'in stanza text'
    if sc == 0:
        qt = zh_title_variants(t)[0]
        if len(qt) >= 3:
            grams = {qt[i:i + 2] for i in range(len(qt) - 1)}
            hit = sum(1 for g in grams if g in v['c_full'])
            if hit >= max(2, len(grams) - 1):
                sc, ev = round(0.55 * hit / len(grams), 2), 'keywords (%d/%d)' % (hit, len(grams))
    return sc, ev
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
        if zh:
            if v['g'] not in ('C', 'CS'): continue
            sc, l = zh_score(t, v)
            if sc >= 0.4: add(h, sc, '%s (%s)' % (l, link_summary(h)), 'title')
        else:
            sc, l = title_score(t, v['P'], v['first'])
            if sc >= 0.5: add(h, sc, 'title = %s: "%s"' % (l, v['first'][:50]), 'title')
    for s in SB:
        if s['zh'] != zh: continue
        if zh:
            sc, l = 0, ''
            st = zh_clean(s['title']); sly = zh_clean(s['text'])
            for tc in zh_title_variants(t):
                if not tc: continue
                if tc == st: sc, l = 0.95, 'songbase title: "%s"' % s['title'][:50]; break
                elif len(tc) >= 3 and (tc in st or (st and st in tc)): sc, l = 0.80, 'songbase title match: "%s"' % s['title'][:50]; break
                elif len(tc) >= 4 and tc in sly: sc, l = 0.65, 'songbase lyrics'; break
        else:
            sc, l = title_score(t, s['P'], s['title'])
            if sc >= 0.5: l = 'songbase %s: "%s"' % (l, s['title'][:50])
        if sc >= 0.5:
            key = sb_in_db.get(s['id']) or 'SB%d' % s['id']
            if key in H: add(key, sc, '%s (%s)' % (l, link_summary(key)), 'title')
            else: add(key, sc, l, 'title')
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
    if p.exists() and not zh:
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
