#!/usr/bin/env python3
# resumable, sequential caption fetcher. state: caps/<id>.en-orig.vtt (got), nocaps.txt (none available)
import subprocess, os, time, datetime
W=os.path.expanduser('~/nycypcd'); os.makedirs(W+'/caps',exist_ok=True)
def log(m): open(W+'/progress.log','a').write(f"{datetime.datetime.now():%Y-%m-%d %H:%M:%S} fetch: {m}\n")
ids=[l.split('|')[0] for l in open(W+'/videos.txt') if l.strip()]
def state():
    nc=set(open(W+'/nocaps.txt').read().split()) if os.path.exists(W+'/nocaps.txt') else set()
    return nc
fails=0; log(f"start, {len(ids)} videos")
for n,v in enumerate(ids):
    if os.path.exists(f"{W}/caps/{v}.en-orig.vtt") or v in state(): continue
    try:
        p=subprocess.run(['timeout','90',W+'/venv/bin/yt-dlp','--skip-download','--write-auto-subs','--sub-langs','en-orig','--sub-format','vtt',
          '--socket-timeout','20','--retries','1','-o',f'{W}/caps/{v}',f'https://www.youtube.com/watch?v={v}'],capture_output=True,text=True)
        out=p.stdout+p.stderr
    except Exception as e: out=str(e)
    if os.path.exists(f"{W}/caps/{v}.en-orig.vtt"): fails=0; log(f"{v} caption ok")
    elif 'no subtitles for the requested languages' in out.lower(): fails=0; open(W+'/nocaps.txt','a').write(v+'\n'); log(f"{v} no captions")
    else:
        fails+=1; log(f"{v} FAIL ({fails}): {out.strip()[-120:]!r}")
        if fails>=5: log("5 failures in a row, waiting 30 min"); time.sleep(1800); fails=0; continue
    time.sleep(30)
rest=[v for v in ids if not os.path.exists(f"{W}/caps/{v}.en-orig.vtt") and v not in state()]
log("FETCH-DONE, unresolved: %d"%len(rest))
