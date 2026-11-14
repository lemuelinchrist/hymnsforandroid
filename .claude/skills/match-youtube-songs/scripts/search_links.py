"""Search YouTube and SoundCloud for the sung/instrumental recordings of hymns that have none (run from the work folder).

  python3 search_links.py <tag> E41 E42 ...     # writes res2_<tag>.json (title, description, channel of ~15-25 hits per site)
Then filter_links.py and build_links_review.py (see the skill, "Finding recordings by hymn number")."""
import sqlite3,subprocess,json,sys,re
import pathlib
D=str(pathlib.Path(__file__).resolve().parents[4]/'app/src/main/assets/hymns.sqlite')
import os
YT=os.environ.get('YTDLP',os.path.expanduser('~/.venvs/hymns-yt/bin/yt-dlp'))
db=sqlite3.connect(D)
tag,ids=sys.argv[1],sys.argv[2:]
def search(prefix,q,n):
    try: r=subprocess.run([YT,'--skip-download','--dump-json','--ignore-errors','--socket-timeout','20',f'{prefix}{n}:{q}'],capture_output=True,text=True,timeout=300)
    except Exception: return []
    res=[]
    for l in r.stdout.splitlines():
        try:j=json.loads(l)
        except: continue
        res.append({'id':str(j.get('id')),'url':j.get('webpage_url'),'title':j.get('title'),'desc':(j.get('description') or '')[:3000],'dur':j.get('duration'),'ch':j.get('channel') or j.get('uploader')})
    return res
out={}
for h in ids:
    fl=db.execute('select first_stanza_line from hymns where _id=?',(h,)).fetchone()[0]
    fl=re.sub(r'<.*?>','',fl).strip(' ,;:!'); no=h[1:]
    yt={}
    for q in (f'Hymn {no} {fl}',f'Hymns {no}',f'{fl} H{no}'):
        for r in search('ytsearch',q,8): yt[r['id']]=r
    sc={}
    for q in (f'Hymn {no} {fl}',f'Hymns {no}'):
        for r in search('scsearch',q,8): sc[r['id']]=r
    out[h]={'first':fl,'yt':list(yt.values()),'sc':list(sc.values())}
    print(h,len(yt),len(sc),file=sys.stderr)
    json.dump(out,open(f'res2_{tag}.json','w'),ensure_ascii=False)
