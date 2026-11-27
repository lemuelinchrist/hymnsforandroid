#!/usr/bin/env python3
"""A review page for the sheets made from the MIDI: the old sheet and the new sheet side by side, each in its own copy of the
web app (play them in Chorale style), with OK / Problem buttons whose answers are kept in review/verdicts.json.

usage: python3 review_server.py --old <dist of a build with the old sheets> --new <dist of the current build> [--port 8094]
It serves the page and the answers on --port, the old build on port+1 and the new build on port+2 (a copy of the app each,
so that their service workers and settings stay apart)."""
import argparse, json, os, re, threading
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
HERE = os.path.dirname(os.path.abspath(__file__)); PROJ = os.path.dirname(HERE)
REVIEW = os.environ.get('REVIEW_DIR') or os.path.join(PROJ, 'review')   # REVIEW_DIR: another folder for the answers (and only.txt)
VERDICTS = os.path.join(REVIEW, 'verdicts.json')
COMPARE = os.environ.get('REVIEW_DIFFS')   # a TSV (hymn, bar, beat, before, after): compare two builds hymn by hymn, the chord changes as notes
LABELS = {'old': os.environ.get('REVIEW_OLD_LABEL', 'OLD sheet'), 'new': os.environ.get('REVIEW_NEW_LABEL', 'NEW sheet (from the MIDI) — plays in Chorale style'),
          'diffs': os.environ.get('REVIEW_DIFFS_LABEL', 'Notes that follow the MIDI:')}

class Static(SimpleHTTPRequestHandler):
    extensions_map = dict(SimpleHTTPRequestHandler.extensions_map, **{'.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm',
        '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.gz': 'application/gzip', '.svg': 'image/svg+xml'})
    def end_headers(self): self.send_header('Cache-Control', 'no-cache'); super().end_headers()
    def log_message(self, *a): pass

_cache = []
def hymns():
    """what still needs a look: one hymn per tune (the others have the same melody and chords), and not the ones answered OK"""
    if not _cache: _cache.append(_hymns())
    if COMPARE: return _cache[0]
    ok = {}
    if os.path.exists(VERDICTS): ok = json.load(open(VERDICTS, encoding='utf8'))
    only = os.path.join(REVIEW, 'only.txt')   # optional: ids to show, instead of the usual list
    if os.path.exists(only):
        ids = open(only, encoding='utf8').read().split()
        seen = {}
        for h in _cache[0]: seen.setdefault(h['id'], h)
        return [dict(seen[i], first=True) for i in dict.fromkeys(ids) if i in seen]
    return [h for h in _cache[0] if h['first'] and ok.get(h['id'], {}).get('verdict') != 'ok']

def _compare():
    import sqlite3
    root = os.path.abspath(os.path.join(PROJ, '..', '..'))
    db = sqlite3.connect(':memory:'); db.executescript(open(os.path.join(root, 'sqlite/hymns.sql'), encoding='utf8').read())
    by = {}
    for l in open(COMPARE, encoding='utf8').read().split('\n')[1:]:
        c = l.split('\t')
        if len(c) >= 5: by.setdefault(c[0], []).append('bar %s beat %s: %s → %s' % (c[1], c[2], c[3], c[4]))
    out = []
    for h in sorted(by, key=lambda k: -len(by[k])):
        r = db.execute('select ifnull(title, ""), ifnull(first_stanza_line, "") from hymns where _id=?', (h,)).fetchone()
        out.append({'id': h, 'tune': '', 'first': True, 'diffs': by[h], 'title': (r[0] or r[1] or '') if r else ''})
    return out

def _hymns():
    if COMPARE: return _compare()
    out = []; diffs = {}
    p = os.path.join(PROJ, 'DIFFS.tsv')
    if os.path.exists(p):
        for l in open(p, encoding='utf8').read().split('\n')[1:]:
            c = l.split('\t')
            if len(c) >= 4: diffs.setdefault(c[0], []).append('bar %s: %s -> %s' % (c[1], c[2], c[3]))
    import sqlite3
    root = os.path.abspath(os.path.join(PROJ, '..', '..'))
    db = sqlite3.connect(':memory:'); db.executescript(open(os.path.join(root, 'sqlite/hymns.sql'), encoding='utf8').read())
    for l in open(os.path.join(PROJ, 'STATUS.tsv'), encoding='utf8').read().split('\n')[1:]:
        c = l.split('\t')
        if len(c) < 3 or c[1] != 'imported': continue
        for i, h in enumerate(c[2].split()):
            r = db.execute('select ifnull(title, ""), ifnull(first_stanza_line, "") from hymns where _id=?', (h,)).fetchone()
            out.append({'id': h, 'tune': c[0], 'first': i == 0, 'diffs': diffs.get(h, []), 'title': (r[0] or r[1] or '') if r else ''})
    return out

class Api(SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
    def _send(self, body, ctype='application/json'):
        b = body if isinstance(body, bytes) else body.encode(); self.send_response(200); self.send_header('Content-Type', ctype)
        self.send_header('Cache-Control', 'no-cache'); self.send_header('Content-Length', str(len(b))); self.end_headers(); self.wfile.write(b)
    def do_GET(self):
        if self.path.startswith('/api/config'): return self._send(json.dumps(LABELS))
        if self.path.startswith('/api/hymns'): return self._send(json.dumps(hymns()))
        if self.path.startswith('/api/verdicts'):
            return self._send(open(VERDICTS, encoding='utf8').read() if os.path.exists(VERDICTS) else '{}')
        return self._send(open(os.path.join(HERE, 'review_page.html'), 'rb').read(), 'text/html; charset=utf-8')
    def do_POST(self):
        n = int(self.headers.get('Content-Length', 0)); data = json.loads(self.rfile.read(n) or b'{}')
        v = json.load(open(VERDICTS, encoding='utf8')) if os.path.exists(VERDICTS) else {}
        h = data.get('id')
        if h and re.match(r'^E\d+$', h):
            if data.get('verdict') in ('ok', 'problem'): v[h] = {'verdict': data['verdict'], 'note': str(data.get('note', ''))[:500]}
            else: v.pop(h, None)
            os.makedirs(os.path.dirname(VERDICTS), exist_ok=True); json.dump(v, open(VERDICTS, 'w', encoding='utf8'), indent=1, sort_keys=True)
        self._send(json.dumps(v))

def serve(handler, port):
    s = ThreadingHTTPServer(('0.0.0.0', port), handler); threading.Thread(target=s.serve_forever, daemon=True).start()

def main():
    ap = argparse.ArgumentParser(); ap.add_argument('--old', required=True); ap.add_argument('--new', required=True); ap.add_argument('--port', type=int, default=8094)
    a = ap.parse_args()
    serve(partial(Static, directory=a.old), a.port + 1); serve(partial(Static, directory=a.new), a.port + 2)
    hymns(); s = ThreadingHTTPServer(('0.0.0.0', a.port), Api); print('review page on port', a.port, '(old app', a.port + 1, ', new app', a.port + 2, ')', flush=True)
    s.serve_forever()
main()
