"""One-off fix of 2026-11-28 (kept for the record and for sheets made the same way): midi_align.py used to read a tuplet at its written
length, so the chords after a triplet sat late or past the end of the bar. This moves each chord of a bar with a tuplet to the true time of its
MIDI sample; one that falls inside the tuplet is left out as passing, unless it lasts past the next beat (then it starts on that beat).
NOT REPEATABLE: on a sheet already fixed it moves the chords again. The 17 sheets of 2026-11-28 are done; use it only on a sheet whose
chords were written by midi_align.py before that day's fix (read_old in midi_to_sheet.py now counts tuplets), so --write needs --untupled.
usage: python3 tools/tuplet_chords.py [--write --untupled] <hymn>...   (D=<folder> reads the sheets from another folder)"""
import re,sys
import os; D=os.environ.get('D',os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)),'..','..','..','app/src/main/assets/sheetMei'))+'/')
write='--write' in sys.argv
if write and '--untupled' not in sys.argv: sys.exit('--write needs --untupled: only for chords still in untupled time (see the header)')
hs=[a for a in sys.argv[1:] if not a.startswith('--')]
for h in hs:
    x=open(D+h+'.mei').read(); sd=re.search(r'<scoreDef\b[^>]*>',x).group(0)
    unit=int(re.search(r'meter\.unit="(\d+)"',sd).group(1)); cnt=int(re.search(r'meter\.count="(\d+)"',sd).group(1))
    out=[]; last=0; changed=0
    for bi,mm in enumerate(re.finditer(r'<measure\b.*?</measure>',x,re.S)):
        m=mm.group(0)
        if '<tuplet' not in m: continue
        segs=[]; u=0; t=0; fac=1   # piecewise map: (u0,u1,t0,fac)
        for tok in re.finditer(r'<tuplet\b[^>]*>|</tuplet>|<(?:note|rest)\b[^>]*>',m):
            s=tok.group(0)
            if s.startswith('<tuplet'):
                a=dict(re.findall(r'([\w.]+)="([^"]*)"',s)); fac=int(a['numbase'])/int(a['num']); continue
            if s=='</tuplet>': fac=1; continue
            a=dict(re.findall(r'([\w.]+)="([^"]*)"',s)); d=unit/int(a['dur'])*{None:1,'1':1.5,'2':1.75}[a.get('dots')]
            segs.append((u,u+d,t,fac)); u+=d; t+=d*fac
        def f(v):   # untupled tstamp -> true tstamp
            p=v-1
            for u0,u1,t0,fc in segs:
                if u0-1e-9<=p<u1-1e-9: return 1+t0+(p-u0)*fc
            return 1+t+(p-u)
        harms=[(hm, float(re.search(r'tstamp="([^"]*)"',hm.group(0)).group(1)), re.search(r'>([^<]*)<',hm.group(0)).group(1)) for hm in re.finditer(r'<harm\b[^>]*>[^<]*</harm>',m)]
        harms.sort(key=lambda z:z[1])
        new=[]
        for k,(hm,ts,txt) in enumerate(harms):
            v=f(ts); g=round(v*2)/2
            if abs(v-g)<1e-6: new.append((g,txt)); continue
            # off the half-beat grid (inside a tuplet): drop it as passing, unless it lasts past the next beat
            nxt=f(harms[k+1][1]) if k+1<len(harms) else 1+t
            nb=int(v)+1 if v<int(v)+1 else v
            if nxt>nb+1e-6: new.append((float(nb),txt))   # it carries on: write it from the next beat
        # dedupe consecutive equal / same time
        res=[]
        for ts,txt in new:
            if res and abs(res[-1][0]-ts)<1e-6: res[-1]=(ts,txt); continue
            if res and res[-1][1]==txt: continue
            res.append((ts,txt))
        if res and res[-1][0]>1+t-1e-6: print('  !! beyond bar',h,bi+1)
        old=[(ts,txt) for _,ts,txt in harms]
        fmt=lambda L:' '.join('%s@%g'%(c,s) for s,c in L)
        if [(round(a,3),b) for a,b in old]!=[(round(a,3),b) for a,b in res]:
            changed+=1; print('%s bar %d: %s  ->  %s'%(h,bi+1,fmt(old),fmt(res)))
            body=re.sub(r'\n?<harm\b[^>]*>[^<]*</harm>','',m); body=body[:-len('</measure>')].rstrip('\n')+''.join('\n<harm staff="1" tstamp="%g" place="above">%s</harm>'%r for r in res)+'\n</measure>'
            out.append((mm.start(),mm.end(),body))
    if write and out:
        for a,b,body in reversed(out): x=x[:a]+body+x[b:]
        open(D+h+'.mei','w').write(x)
    print(h,changed,'bars')
