import sys,math
sys.argv=sys.argv
exec(open('experiments/cmp.py').read().split('a=load')[0])
a=load(sys.argv[1]); b=load(sys.argv[2])
def match(A,B,key):
    pool=list(B); res=[]
    for e in A:
        c=[p for p in pool if key(p)==key(e)]
        if not c: res.append((e,None)); continue
        n=min(c,key=lambda p:math.hypot(p[1]-e[1],p[2]-e[2])) if len(e)>2 and isinstance(e[1],float) else None
        pool.remove(n); res.append((e,n))
    return res
for name,A,B,key in [('text',a['text'],b['text'],lambda e:e[0]),('glyph',[(p[2],p[0],p[1]) for p in a['path']],[(p[2],p[0],p[1]) for p in b['path']],lambda e:e[0][:6])]:
    r=match(A,B,key); d=[math.hypot(n[1]-e[1],n[2]-e[2]) for e,n in r if n]
    miss=[e for e,n in r if not n]
    print(f"{name}: {len(A)} orig / {len(B)} new, matched {len(d)}, max dev {max(d):.3f}, mean {sum(d)/len(d):.3f}, unmatched {len(miss)}")
    for e,n in sorted([x for x in r if x[1]],key=lambda x:-math.hypot(x[1][1]-x[0][1],x[1][2]-x[0][2]))[:4]:
        print(f"   worst: {str(e[0])[:28]:28} dx={n[1]-e[1]:+.3f} dy={n[2]-e[2]:+.3f}")
    for e in miss[:5]: print("   unmatched:",e[:3])
