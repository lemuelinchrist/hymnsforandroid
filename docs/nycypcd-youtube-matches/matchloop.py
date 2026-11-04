#!/usr/bin/env python3
# repeatedly: build tasks + run matcher for videos that have captions and no valid answer; one batch at a time
import subprocess, os, time, json, re, datetime
W=os.path.expanduser('~/nycypcd'); S=os.path.expanduser('~/hymnsforandroid/.claude/skills/match-youtube-songs/scripts')
env=dict(os.environ,HYMNS_DB=W+'/hymns.sqlite'); MODEL='gemini-3.8-flash-low'
def log(m): open(W+'/progress.log','a').write(f"{datetime.datetime.now():%Y-%m-%d %H:%M:%S} match: {m}\n")
ids=[l.split('|')[0] for l in open(W+'/videos.txt') if l.strip()]
tries={}
def valid(v):
    try:
        d=json.load(open(f"{W}/out/{v}.json")); return bool(re.search(r'```json\s*\{.*?\}\s*```',d.get('response',''),re.S))
    except Exception: return False
log("start")
while True:
    for v in ids:  # drop invalid answers so they are retried (max 3 tries)
        f=f"{W}/out/{v}.json"
        if os.path.exists(f) and not valid(v) and tries.get(v,0)<3: os.remove(f); tries[v]=tries.get(v,0)+1
    todo=[v for v in ids if os.path.exists(f"{W}/caps/{v}.en-orig.vtt") and not os.path.exists(f"{W}/out/{v}.json")]
    fetch_done=any('FETCH-DONE' in l for l in open(W+'/progress.log'))
    if not todo:
        if fetch_done: break
        time.sleep(300); continue
    b=todo[:6]
    subprocess.run(['nice','-n','10','python3',S+'/build_task.py',W,W+'/videos.txt']+b,env=env,capture_output=True)
    p=subprocess.run(['nice','-n','10','python3',S+'/run_matcher.py',W,MODEL]+b,env=env,capture_output=True,text=True)
    for l in p.stdout.splitlines(): log(l)
    if p.stderr.strip(): log("stderr: "+p.stderr.strip()[-200:])
    if all(not valid(v) for v in b): log("whole batch without answer, waiting 20 min"); time.sleep(1200)
log("MATCH-DONE")
