"""The four voices of an on-grid MIDI at every step, top voice first, exactly (no sampling blur). A note marked ' starts there.
The MIDI may be in another key than the sheet (E659 in G for a sheet in F, E1313 in B flat for one in A): transpose the reading.
usage: python3 tools/midi_voices.py <tune> <pickup in quarters> <quarters a bar> [step in quarters, 0.5 for eighths]   (run from tools/)"""
import os, sys; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import midi_to_sheet as M
tune,pick,per=sys.argv[1],float(sys.argv[2]),float(sys.argv[3]); step=float(sys.argv[4]) if len(sys.argv)>4 else 1
div,notes,bpm,ts,ks=M.read_midi(os.path.join(os.path.dirname(os.path.abspath(__file__)),'..','midi','m%s.mid'%tune))
t0=min(s for s,e,p in notes)
NM=['C','D♭','D','E♭','E','F','G♭','G','A♭','A','B♭','B'] if ks<0 else ['C','C♯','D','D♯','E','F','F♯','G','G♯','A','A♯','B']
end=max(e for s,e,p in notes); q=0; line=''
bar=1; pos=0; barlen=pick
while t0+q*div<end:
    tm=t0+q*div+div*0.25*step
    snd=sorted({p for s,e,p in notes if s<=tm<e},reverse=True)
    new=[p for s,e,p in notes if abs(s-(t0+q*div))<div*0.1*step]
    line+=' %g:%s'%(pos+1,'.'.join(NM[p%12]+("'" if p in new else '') for p in snd))
    pos+=step; q+=step
    if pos>=barlen-1e-9: print(bar,line); bar+=1; pos=0; barlen=per; line=''
if line: print(bar,line)
