import re,sys
import xml.etree.ElementTree as ET
def tr(s):
    x=y=0.0
    for a,b in re.findall(r'translate\(([-\d.]+)[ ,]+([-\d.]+)\)',s or ''): x+=float(a); y+=float(b)
    return x,y
def walk(el,ox,oy,out):
    dx,dy=tr(el.get('transform')); ox+=dx; oy+=dy
    tag=el.tag.split('}')[1]
    if tag=='text':
        t=''.join(el.itertext()).strip()
        if t: out['text'].append((t,ox,oy,el.get('font-family'),float(el.get('font-size')),el.get('font-weight','')))
        return
    if tag=='line': out['line'].append((ox,oy))
    if tag=='path': out['path'].append((ox,oy,el.get('d')[:12]))
    for c in el: walk(c,ox,oy,out)
def load(f):
    out={'text':[],'line':[],'path':[]}; walk(ET.parse(f).getroot(),0,0,out); return out
a=load(sys.argv[1]); b=load(sys.argv[2])
print("staff top lines orig:",sorted(set(round(y,3) for x,y in a['line']))[::5])
print("staff top lines new: ",sorted(set(round(y,3) for x,y in b['line']))[::5])
print("paths orig/new:",len(a['path']),len(b['path']))
bd={}
for t in b['text']: bd.setdefault(t[0],[]).append(t)
for t in a['text']:
    m=bd.get(t[0])
    if not m: print("MISSING",t[:3]); continue
    n=m.pop(0)
    print(f"{t[0][:24]:24} dx={n[1]-t[1]:+6.2f} dy={n[2]-t[2]:+6.2f}  size {t[4]:.3f}->{n[4]:.3f}  {t[3][:10]}->{n[3]}")
