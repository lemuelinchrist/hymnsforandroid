"""Keep only hits whose title/description names the hymn number AND most of the first line (run in the work folder after search_links.py).
Writes results.json."""
import json,re,glob
d={}
for f in sorted(glob.glob('res2_*.json')): d.update(json.load(open(f)))
out={}
for h,v in d.items():
    no=h[1:]
    kw=re.compile(r'(?:\bhymns?|\bh|\bno\.?|#|\bnumber)\s*[:#.\-]?\s*(?:\d+\s*[,&/]\s*)*'+no+r'(?!\d)|^\s*'+no+r'\s*[.\-:)]|\b[eE]'+no+r'(?!\d)',re.I)
    res={'first':v['first'],'yt':[],'sc':[]}
    for k in('yt','sc'):
        for r in v[k]:
            t=r['title'] or '';ds=r['desc'] or ''
            if r['dur'] and (r['dur']<60 or r['dur']>900): continue
            if re.search(r'piano|instrumental|organ|karaoke',t,re.I): continue
            if re.search(r'piano',r['ch'] or '',re.I): continue
            nw=lambda x:re.sub(r"[^a-z ]",'',x.lower().replace('’',"'").replace("'",''))
            fw=[w for w in nw(v['first']).split()][:5]
            hay=nw(t+' '+ds)
            if sum(w in hay.split() for w in fw)<max(2,len(fw)-1): continue
            where=('title' if kw.search(t) else 'description' if kw.search(ds) else None)
            if where:
                m=(kw.search(t) or kw.search(ds)).group(0)
                res[k].append({'id':r['id'],'url':r['url'],'title':t,'dur':r['dur'],'ch':r['ch'],'where':where,'m':m,
                  'snip':ds[:0]})
    out[h]=res
    print(h,v['first'][:35],len(res['yt']),len(res['sc']))
json.dump(out,open('results.json','w'),ensure_ascii=False,indent=1)
