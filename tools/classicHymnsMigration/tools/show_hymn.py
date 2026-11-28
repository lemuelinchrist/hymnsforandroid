"""Show a hymn bar by bar: its notes, its chords and what the MIDI plays on each beat (sheet chords next to the MIDI's).
usage: python3 tools/show_hymn.py <hymn>   (SUB=2 for every half beat; the dump goes to build/show_hymn.tsv)"""
import re,sys,subprocess,os
h=sys.argv[1]; R=os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '..'))+'/'; S=R+'svg-to-lilypond/build/'
row=[l.rstrip('\n').split('\t') for l in open(R+'tools/classicHymnsMigration/STATUS.tsv') if re.search(r'\b%s\b'%h,l.split('\t')[2] if l.count('\t')>=2 else '')]
fam=row[0][2].split() if row else [h]
tune=re.search(r'from the MIDI of tune (\d+)',row[0][3]) if row and len(row[0])>3 else None
x=open(R+'app/src/main/assets/sheetMei/%s.mei'%h).read()
sd=re.search(r'<scoreDef\b[^>]*>',x).group(0); unit=re.search(r'meter\.unit="(\d+)"',sd).group(1)
env=dict(os.environ,DUMP=S+'show_hymn.tsv',THRESH='0',SUB=os.environ.get('SUB','3' if unit=='8' else '1'))
if tune: env['MIDI_TUNE']='%s=%s'%(h,tune.group(1))
if os.path.exists(S+'show_hymn.tsv'): os.remove(S+'show_hymn.tsv')
r=subprocess.run(['python3','tools/midi_align.py',h],cwd=R+'tools/classicHymnsMigration',env=env,capture_output=True,text=True)
print(r.stdout.strip().split('\n')[-1]); print('family',fam,re.search(r'key\.sig="[^"]*"',x).group(0),re.search(r'meter\.count="\d+"',sd).group(0),'unit',unit)
dump={}
if os.path.exists(S+'show_hymn.tsv'):
    for l in open(S+'show_hymn.tsv'):
        q=l.rstrip('\n').split('\t'); dump.setdefault(int(q[1]),[]).append('%s:%s[%s]%s'%(q[2],q[3],q[4],q[5]))
for i,m in enumerate(re.findall(r'<measure\b.*?</measure>',x,re.S)):
    notes=' '.join(dict(re.findall(r'([\w.]+)="([^"]*)"',n)).get('pname','?')+dict(re.findall(r'([\w.]+)="([^"]*)"',n)).get('accid','')+dict(re.findall(r'([\w.]+)="([^"]*)"',n)).get('dur','') for n in re.findall(r'<note\b[^>]*>',m))
    print(i+1,notes,'| SHEET:',' '.join(c+'@'+t for t,c in sorted(re.findall(r'<harm\b[^>]*tstamp="([^"]*)"[^>]*>([^<]*)<',m),key=lambda a:float(a[0]))))
    for d in dump.get(i+1,[]): print('     ',d)
