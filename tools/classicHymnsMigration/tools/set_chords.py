"""Write the chords of some bars by hand, into the hymn and into the hymns of its tune that have the same melody (STATUS.tsv families).
usage: python3 tools/set_chords.py <hymn> "3: 1 C, 2.5 G7/D; 4: 1 F"   (bar: tstamp chord, ...; the bar's chords are replaced)"""
import os
import re,sys
R=os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '..'))+'/'; h=sys.argv[1]; spec=sys.argv[2]
row=[l.rstrip('\n').split('\t') for l in open(R+'tools/classicHymnsMigration/STATUS.tsv') if l.count('\t')>=2 and re.search(r'\b%s\b'%h,l.split('\t')[2])]
fam=row[0][2].split() if row else [h]
plan={}
for part in spec.split(';'):
    if not part.strip(): continue
    b,rest=part.split(':',1)
    plan[int(b)]=[tuple(z.strip().split(None,1)) for z in rest.split(',') if z.strip()]
def mel(x):
    out=[]
    for m in re.findall(r'<measure\b.*?</measure>',x,re.S):
        out.append(' '.join('%s%s%s.%s'%(a.get('pname'),a.get('oct'),a.get('dur'),a.get('dots','')) for a in (dict(re.findall(r'([\w.]+)="([^"]*)"',n)) for n in re.findall(r'<note\b[^>]*>',m))))
    return out
base=mel(open(R+'app/src/main/assets/sheetMei/%s.mei'%h).read())
for f in fam:
    p=R+'app/src/main/assets/sheetMei/%s.mei'%f; x=open(p).read()
    if mel(x)!=base: print(f,'SKIPPED: other notes'); continue
    for k in sorted(plan):
        mm=list(re.finditer(r'<measure\b.*?</measure>',x,re.S))[k-1]
        body=re.sub(r'\n?<harm\b[^>]*>[^<]*</harm>','',mm.group(0)); body=body[:-len('</measure>')].rstrip('\n')+''.join('\n<harm staff="1" tstamp="%s" place="above">%s</harm>'%tc for tc in plan[k])+'\n</measure>'
        x=x[:mm.start()]+body+x[mm.end():]
    open(p,'w').write(x); print(f,'written',len(plan),'bars')
