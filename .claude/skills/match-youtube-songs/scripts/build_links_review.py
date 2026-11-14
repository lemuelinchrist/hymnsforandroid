"""Build review.html (lyrics fixed, candidate links to tick, sung/instrumental, own-link box) from results.json; serve with
python3 -m http.server 8766 --bind 127.0.0.1. Export gives: Hymn, Kind, Id, Title, Channel, Type, Note."""
import json,sqlite3,re
db=sqlite3.connect(str(__import__('pathlib').Path(__file__).resolve().parents[4]/'app/src/main/assets/hymns.sqlite'))
d=json.load(open('results.json'))
rows=[]
for h,v in d.items():
    st=[[n,re.sub(r'<br\s*/?>','\n',t or '')] for n,t in db.execute('select no,text from stanza where parent_hymn=? order by n_order',(h,))]
    c=[]
    for k,key in(('yt','youtube'),('sc','soundcloud')):
        for r in v[k]:
            if r['dur'] and (r['dur']<60 or r['dur']>900): continue
            c.append({'k':key,'id':r['id'],'t':r['title'],'ch':(r['ch'] or '')+' · number found in '+r['where'],'d':int(r['dur'] or 0)})
    rows.append({'h':h,'first':v['first'],'st':st,'c':c})
html=open(__import__('pathlib').Path(__file__).with_name('links_review_template.html')).read().replace('__ROWS__',json.dumps(rows,ensure_ascii=False))
open('review.html','w').write(html)
print(len(rows),sum(len(r['c']) for r in rows))
