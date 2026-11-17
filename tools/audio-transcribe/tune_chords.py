import numpy as np, json, re, itertools
"""Tunes the chord rules of make_sheet.py against the chords people corrected by hand.

For every song with a corrected leadsheet.json (single-section songs): make_sheet.py with CHORD_DUMP=<prefix> saves the
evidence per half bar (acc, bass, melody, key) to <prefix>0.npz; this scores a set of weights against the chords in
the corrected sheet (one chord per half bar, as the sheet has it at the half bar's start).
usage: put each song in <dir>/<song>/ with sc0.npz (the dump) and truth.json (the corrected leadsheet.json), then
  python3 tune_chords.py <dir> <song> [<song> ...]
Result on six songs (2026-11-17): the weights hardly matter; scoring triads only took the half-bar
accuracy from 57 % to 76 % (biased: those sheets had no 7ths because nobody had added any; make_sheet.py adds the
dominant's 7th afterwards); pooling the evidence of repeated phrases did not help (the errors repeat alike)."""
import sys
S = sys.argv[1].rstrip('/') + '/'; SONGS = sys.argv[2:]
NAMES=['C','Cis','D','Dis','E','F','Fis','G','Gis','A','Ais','B']
CH=[(NAMES[r]+q) for r in range(12) for q in ('',':m',':7')]
def norm(c):
    c=c.split('/')[0]; m=re.match(r'([A-G])([♯#♭b]?)(m?)',c); r=NAMES.index(m.group(1))
    if m.group(2) and m.group(2) in '♯#': r+=1
    if m.group(2) and m.group(2) in '♭b': r-=1
    return NAMES[r%12]+(':m' if m.group(3) else '')
def load(n):
    z=np.load(S+n+'/sc0.npz'); t=json.load(open(S+n+'/truth.json')); comp=z['comp']; nh=comp.shape[1]
    bar_d=2*int(z['bar']); ev=[];tt=0
    for x in t['notes']: ev.append((tt,x.get('ch'))); tt+=x['d']
    truth=[];c=None
    for h in range(nh):
        p0=t.get('pickup',0); a=(p0-bar_d if p0 else 0)+h*bar_d//2
        for e,ch in ev:
            if e<=a and ch: c=norm(ch)
        truth.append(c if 0<=a<tt else None)
    return comp,truth,t
D={n:load(n) for n in SONGS} if __name__=='__main__' else {}
def tri(sc):
    s=sc.copy()
    for k,c in enumerate(CH):
        if c.endswith(':7'): s[:,k]=-9
    return s
def run(W,vit=0.0,mid=0.0,tri_only=True,verbose=False):
    res={}
    for n,(comp,truth,t) in D.items():
        sc=W[0]*comp[0]+W[1]*comp[1]+W[2]*comp[2]+W[3]*comp[3]
        if tri_only: sc=tri(sc)
        # viterbi
        nh=len(sc); best=sc[0].copy(); back=np.zeros((nh,36),int)
        for h in range(1,nh):
            cost=vit+(mid if h%2 else 0); stay=best; move=best.max()-cost
            back[h]=np.where(stay>=move,np.arange(36),best.argmax()); best=np.maximum(stay,move)+sc[h]
        path=[int(best.argmax())]
        for h in range(nh-1,0,-1): path.append(back[h][path[-1]])
        pred=[CH[k] for k in path[::-1]]
        v=[h for h,x in enumerate(truth) if x]
        res[n]=np.mean([pred[h]==truth[h] for h in v])
    return res
if __name__=='__main__':
    for lab,W,vit,mid,tr in (('current',(1,.25,.35,.12),.1,.05,False),('no7',(1,.25,.35,.12),.1,.05,True)):
        r=run(W,vit,mid,tr); print(lab,{k:round(v,2) for k,v in r.items()},'mean',round(np.mean(list(r.values())),3))
