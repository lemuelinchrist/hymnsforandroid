#!/usr/bin/env python3
"""Runs the agy matcher on task files, 3 at a time, and prints one line per song.

usage: run_matcher.py <workdir> <model> <video id> [<video id> ...]      e.g. gemini-3.8-flash-low
Raw agy answers go to workdir/out/<id>.json (a finished one is not run again). agy ignores --json-schema in headless
mode (structured_output stays null): the answer is the JSON object in a ```json block of the reply.
"""
import subprocess, sys, json, re, os, shutil, concurrent.futures as cf
work, model, ids = os.path.abspath(sys.argv[1]), sys.argv[2], sys.argv[3:]
here = os.path.dirname(os.path.abspath(__file__))
os.makedirs(work + '/task/.agents/agents', exist_ok=True); os.makedirs(work + '/cwd', exist_ok=True); os.makedirs(work + '/out', exist_ok=True)
shutil.copy(here + '/matcher-agent.md', work + '/task/.agents/agents/song-matcher.md')
schema = open(here + '/schema.json').read()

def run(v):
    out = f"{work}/out/{v}.json"
    if os.path.exists(out): return
    p = subprocess.run(['agy', '--add-dir', work + '/task', '--agent', 'song-matcher', '--dangerously-skip-permissions', '--model', model,
        '-p', f"Read {work}/task/songs/{v}.md, then answer ONLY with the JSON object required by the schema (video_id is {v}). evidence is one short string.",
        '--output-format', 'json', '--json-schema', schema], cwd=work + '/cwd', capture_output=True, text=True, timeout=900)
    open(out, 'w').write(p.stdout)

with cf.ThreadPoolExecutor(3) as ex: list(ex.map(run, ids))
tok = 0
for v in ids:
    try: d = json.load(open(f"{work}/out/{v}.json"))
    except Exception as e: print(v, 'NO ANSWER', e); continue
    tok += d.get('usage', {}).get('total_tokens', 0)
    m = re.search(r'```json\s*(\{.*?\})\s*```', d.get('response', ''), re.S)
    r = d.get('structured_output') or (json.loads(m.group(1)) if m else {})
    print(v, d.get('status'), round(d.get('duration_seconds', 0)), 's', r.get('hymn_id'), r.get('confidence'), '|', str(r.get('evidence'))[:110])
print('total tokens', tok)
