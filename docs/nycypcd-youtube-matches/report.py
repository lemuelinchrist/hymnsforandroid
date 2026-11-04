#!/usr/bin/env python3
import json, re, os, sqlite3, csv, collections, subprocess
W=os.path.expanduser('~/nycypcd'); db=sqlite3.connect(W+'/hymns.sqlite')
vids=[l.rstrip('\n').split('|') for l in open(W+'/videos.txt',encoding='utf-8') if l.strip()]
nocaps=set(open(W+'/nocaps.txt').read().split()) if os.path.exists(W+'/nocaps.txt') else set()
def first(h):
    r=db.execute("select first_stanza_line from hymns where _id=?",(h,)).fetchone(); return (r[0] if r else '?') or '?'
import html
def norm(t):
    t=html.unescape(re.sub(r'<[^>]+>',' ',t or '')).lower().replace("'",""); return re.sub(r'\s+',' ',re.sub(r'[^a-z0-9 ]',' ',t)).strip()
def cands(title):
    t=norm(title); o=[]
    if len(t)<8: return o
    for h,a,b,c,p in db.execute("select _id,first_stanza_line,first_chorus_line,main_category,parent_hymn from hymns"):
        if p or not re.match(r'(NS|E|BF|CH)\d+$',h): continue
        if any(norm(x)==t or (norm(x) and norm(x).startswith(t)) for x in (a,b,c)): o.append(h)
    return o
res={}
for v,t,*_ in vids:
    f=f"{W}/out/{v}.json"; cap=os.path.exists(f"{W}/caps/{v}.en-orig.vtt")
    r=None
    if os.path.exists(f):
        try:
            d=json.load(open(f)); m=re.search(r'```json\s*(\{.*?\})\s*```',d.get('response',''),re.S)
            r=(d.get('structured_output') or (json.loads(m.group(1)) if m else None)); tok=d.get('usage',{}).get('total_tokens',0)
        except Exception: r=None
    res[v]=(t,cap,r)
esc=lambda s:str(s or '').replace('|','/').replace('\n',' ')
with open(W+'/matches.csv','w',newline='',encoding='utf-8') as fh:
    w=csv.writer(fh); w.writerow('video_id,title,hymn_id,confidence,evidence,also_matches,has_caption'.split(','))
    for v,(t,cap,r) in res.items():
        r=r or {}; w.writerow([v,t,r.get('hymn_id') or '',r.get('confidence') or '',r.get('evidence') or '',' '.join(r.get('also_matches') or []),'yes' if cap else 'no'])
hi=[(v,t,r) for v,(t,c,r) in res.items() if r and r.get('hymn_id') and r.get('confidence')=='high']
oth=[(v,t,r) for v,(t,c,r) in res.items() if r and not(r.get('hymn_id') and r.get('confidence')=='high')]
nor=[v for v,(t,c,r) in res.items() if c and not r]
nc=[v for v,(t,c,r) in res.items() if not c]
dup=collections.defaultdict(list)
for v,t,r in hi: dup[r['hymn_id']].append(v)
L=["# NYCYPCD videos -> hymns (for review, nothing imported)\n",
 f"- videos: {len(vids)}; with captions: {sum(1 for x in res.values() if x[1])}; without captions (recorded): {len(nocaps)}; caption download still pending: {len([v for v in nc if v not in nocaps])}",
 f"- HIGH matches: {len(hi)}; medium/low/null: {len(oth)}; captions but no answer yet: {len(nor)}\n",
 "## Pilot sanity check\n"]
for v,h in [('GwA4IPcvET8','E1152'),('fxowTR-wFWk','NS728'),('ADBcYtZShwU','E285'),('pU-_uGqaL_c','E151'),('2e6hzX9O1P0','E252')]:
    r=res.get(v,(0,0,None))[2]; L.append(f"- {v}: expected {h}, got {r.get('hymn_id') if r else 'not done'} ({r.get('confidence') if r else ''})")
L+=["\n## HIGH matches\n","| video | title | hymn | first line | evidence |","|---|---|---|---|---|"]
for v,t,r in sorted(hi,key=lambda x:x[2]['hymn_id']): L.append(f"| {v} | {esc(t)} | {r['hymn_id']} | {esc(first(r['hymn_id']))} | {esc(r.get('evidence'))} |")
L+=["\n## Medium / low / no hymn (check by hand)\n","| video | title | hymn | conf | evidence | also |","|---|---|---|---|---|---|"]
for v,t,r in oth: L.append(f"| {v} | {esc(t)} | {r.get('hymn_id') or '-'} | {r.get('confidence')} | {esc(r.get('evidence'))} | {' '.join(r.get('also_matches') or [])} |")
L+=["\n## Captions present but no usable agy answer\n"]+[f"- {v} {res[v][0]}" for v in nor]
L+=["\n## Without captions (title only)\n"]
for v in nc:
    L.append(f"- {v} {res[v][0]}" + ("" if v in nocaps else " (download not finished)") + (" | title candidates: "+', '.join(cands(res[v][0])) if cands(res[v][0]) else ""))
L+=["\n## Hymns with more than one video (HIGH)\n"]+[f"- {h}: {' '.join(x)}" for h,x in dup.items() if len(x)>1]
open(W+'/report.md','w',encoding='utf-8').write('\n'.join(L)+'\n')
print('report written', len(hi), len(oth), len(nor), len(nc))
