"""Suggest the hymn a transcribed recording sings, by its words.
usage: match_lyrics.py <lyrics dir> [GROUPS=E,NS,BF,CH]  -> TSV on stdout: id, top 3 hymns with scores, the song's first words
Score of a hymn = share of the song's word pairs that occur in the hymn's lyrics (a song repeats and reorders stanzas, and
Whisper mishears a few words, so containment of the song in the hymn is used, not equality). English and its New Tune
copies are collapsed to the root hymn. 0.5+ with a clear gap to the next is a likely match; the rest need a person."""
import os, re, sys, sqlite3, pathlib, collections
REPO = pathlib.Path(__file__).resolve().parents[2]
db = sqlite3.connect(REPO / 'app/src/main/assets/hymns.sqlite')
groups = set((sys.argv[2] if len(sys.argv) > 2 else 'E,NS,BF,CH').split(','))
par = {h: p for h, p in db.execute('select _id, parent_hymn from hymns')}
grp = {h: g for h, g in db.execute('select _id, hymn_group from hymns')}
def root(h):
    for _ in range(5):
        if par.get(h): h = par[h]
    return h
def words(t): return re.findall(r"[a-z']+", re.sub(r'<[^>]+>', ' ', t or '').lower().replace('’', "'"))
def pairs(w): return {(a, b) for a, b in zip(w, w[1:])}
text = collections.defaultdict(list)
for h, t in db.execute('select parent_hymn, text from stanza'): text[h].append(t)
H = {}
for h, g in grp.items():
    if g in groups and h == root(h) and text.get(h):
        H[h] = pairs(words(' '.join(text[h])))
for p in sorted(pathlib.Path(sys.argv[1]).glob('*.txt')):
    w = words(p.read_text(encoding='utf8')); s = pairs(w)
    if len(s) < 6:
        print(p.stem, 'too few words', ' '.join(w[:10]), sep='\t'); continue
    sc = sorted(((len(s & v) / len(s), h) for h, v in H.items()), reverse=True)[:3]
    print(p.stem, ' '.join(f'{h}:{x:.2f}' for x, h in sc), ' '.join(w[:12]), sep='\t')
