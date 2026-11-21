"""Step 1 of the unmatched-songs review: the recordings still `unmatched` in tools/youtube-monitor/recordings.tsv (minus kids' songs and
the messages), each mapped to a local file of Lemuel's collection when the album folder and the track title agree (gfiles.txt: the file list of
G:\\My Drive\\Archives\\Hymns\\Online, see the match-youtube-songs skill) -> set.json. Run from the work folder (temp/review-unmatched/)."""
import csv, re, json, os, difflib, unicodedata, pathlib
R = pathlib.Path(__file__).resolve().parents[5]
rows = [x for x in csv.DictReader(open(R/'tools/youtube-monitor/recordings.tsv', encoding='utf-8'), delimiter='\t') if x['status'] == 'unmatched']
def kids(x): return re.search(r'兒童|性格的培養|Children|Joyful Songs for Children|Songs for Children', x['album / playlist'])
def msg(x): return x['album / playlist'] == 'Message of the Week' or re.search(r'\([A-Z]\.[A-Z]\.\)$', x['title'])
def english(x): return x.get('language', '') in ('', 'English')   # only English for now (Lemuel 2026-11-21); the language column is filled by build_recordings.py
keep = [x for x in rows if not kids(x) and not msg(x) and english(x)]
def norm(s):
    s = unicodedata.normalize('NFKD', s).lower().replace('’', "'")
    s = re.sub(r"\(by [^)]*\)|\(banner song\)|\(excerpt\)|\(#\d+\)", ' ', s)
    return re.sub(r'[^a-z0-9一-鿿]+', ' ', s).strip()
files = []
for l in open('gfiles.txt', encoding='utf-8'):
    p = l.strip().replace('\\', '/')
    parts = p.split('/')
    if len(parts) < 2: continue
    alb = parts[0]; fn = os.path.splitext(parts[-1])[0]
    fn = re.sub(r'^\d+\s*[-.]\s*', '', fn)
    files.append((norm(alb), norm(fn), p))
out = []
for x in keep:
    a, t = norm(x['album / playlist']), norm(x['title'])
    best = None
    for fa, ft, p in files:
        if fa == a or (a and (fa in a or a in fa)) or not a:
            r = difflib.SequenceMatcher(None, t, ft).ratio()
            if (not best or r > best[0]): best = (r, p)
    out.append({'id': x['video id'], 'title': x['title'], 'album': x['album / playlist'], 'channel': x['youtube channel'],
                'local': best[1] if best and best[0] >= 0.85 else None, 'lscore': round(best[0], 2) if best else 0})
json.dump(out, open('set.json', 'w'), ensure_ascii=False, indent=0)
import collections
print(len(out), sum(1 for o in out if o['local']), collections.Counter(o['channel'] for o in out if o['local']))
print([ (o['title'],o['lscore']) for o in out if not o['local'] and o['lscore']>0.6][:15])
