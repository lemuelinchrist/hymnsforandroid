#!/usr/bin/env python3
"""Serves dist/ on the home network.

    python3 serve.py [--port 8080] [--bind 0.0.0.0]

A file stored as <name>.gz (the database, the sheets, Verovio) is sent compressed with Content-Encoding: gzip,
or unpacked for the rare client that does not accept gzip. Every response has an ETag and "no-cache", so the
browser keeps its copy and only asks whether it changed.

Chord edits (the only thing the server stores) live under /api/edits/<sheet id>:

    GET  /api/edits          {sheet id: {rev, updated}} for every saved sheet
    GET  /api/edits/E8       the saved edits of one sheet (rev 0 and no bars when there are none)
    PUT  /api/edits/E8       save them; the body carries the rev it was based on, 409 when the file moved on

Each sheet is one JSON file in the data folder (--data, default ~/hymnsforweb-data/edits). Writes are atomic and
the previous version is kept in history/ (the last 30). Writes need the header "X-Hymns: 1", which a web page on
another site cannot send without a CORS preflight that this server never grants.
"""
import argparse
import email.utils
import gzip
import json
import mimetypes
import os
import re
import socket
import tempfile
import threading
import time
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import unquote, urlsplit

DIST = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'dist')
EDITS = os.path.join(os.path.expanduser('~'), 'hymnsforweb-data', 'edits')
SHEET_ID = re.compile(r'^[A-Za-z0-9_-]{1,24}$')
MAX_BODY = 256 * 1024
KEEP_HISTORY = 30
edit_lock = threading.Lock()
TYPES = {'.wasm': 'application/wasm', '.mei': 'application/xml', '.sqlite': 'application/vnd.sqlite3',
         '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.html': 'text/html',
         '.svg': 'image/svg+xml', '.png': 'image/png', '.txt': 'text/plain', '.webmanifest': 'application/manifest+json'}


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIST, **kwargs)

    def log_message(self, fmt, *args):
        pass

    def do_HEAD(self):
        self.send(head=True)

    def do_GET(self):
        if urlsplit(self.path).path.startswith('/api/'):
            return self.api('GET')
        self.send(head=False)

    def do_PUT(self):
        if urlsplit(self.path).path.startswith('/api/'):
            return self.api('PUT')
        self.send_error(405)

    def reply(self, status, obj):
        body = json.dumps(obj, ensure_ascii=False, separators=(',', ':')).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(body)

    def api(self, method):
        parts = [unquote(p) for p in urlsplit(self.path).path.split('/') if p]
        if len(parts) < 2 or parts[:2] != ['api', 'edits'] or len(parts) > 3:
            return self.reply(404, {'error': 'not found'})
        if len(parts) == 2:
            if method != 'GET':
                return self.reply(405, {'error': 'method not allowed'})
            return self.reply(200, list_edits())
        sid = parts[2]
        if not SHEET_ID.match(sid):
            return self.reply(400, {'error': 'bad sheet id'})
        if method == 'GET':
            data = read_edits(sid) or {'v': 1, 'sheet': sid, 'rev': 0, 'bars': {}}
            return self.reply(200, data)
        if self.headers.get('X-Hymns') != '1':
            return self.reply(403, {'error': 'missing X-Hymns header'})
        try:
            n = int(self.headers.get('Content-Length', '0'))
            if n <= 0 or n > MAX_BODY:
                return self.reply(413, {'error': 'body too large or empty'})
            body = json.loads(self.rfile.read(n).decode('utf-8'))
        except (ValueError, UnicodeDecodeError):
            return self.reply(400, {'error': 'bad JSON'})
        status, out = write_edits(sid, body)
        self.reply(status, out)

    def send(self, head):
        path = unquote(urlsplit(self.path).path)
        if path.endswith('/'):
            path += 'index.html'
        full = os.path.realpath(os.path.join(DIST, path.lstrip('/')))
        if not full.startswith(os.path.realpath(DIST) + os.sep):
            return self.send_error(403)
        gz = not os.path.isfile(full) and os.path.isfile(full + '.gz')
        file = full + '.gz' if gz else full
        if not os.path.isfile(file):
            return self.send_error(404)

        st = os.stat(file)
        etag = '"%x-%x"' % (int(st.st_mtime), st.st_size)
        if self.headers.get('If-None-Match') == etag:
            self.send_response(304)
            self.send_header('ETag', etag)
            self.end_headers()
            return

        with open(file, 'rb') as f:
            body = f.read()
        if gz and 'gzip' not in self.headers.get('Accept-Encoding', ''):
            body, gz = gzip.decompress(body), False
        ext = os.path.splitext(full)[1]
        self.send_response(200)
        self.send_header('Content-Type', TYPES.get(ext) or mimetypes.guess_type(full)[0] or 'application/octet-stream')
        if gz:
            self.send_header('Content-Encoding', 'gzip')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('ETag', etag)
        self.send_header('Last-Modified', email.utils.formatdate(st.st_mtime, usegmt=True))
        self.send_header('Cache-Control', 'no-cache')
        self.end_headers()
        if not head:
            self.wfile.write(body)


# ---- chord edits ----

def edit_path(sid):
    return os.path.join(EDITS, sid + '.json')


def read_edits(sid):
    try:
        with open(edit_path(sid), encoding='utf-8') as f:
            return json.load(f)
    except (OSError, ValueError):
        return None


def list_edits():
    out = {}
    try:
        names = os.listdir(EDITS)
    except OSError:
        return out
    for name in names:
        if name.endswith('.json') and SHEET_ID.match(name[:-5]):
            d = read_edits(name[:-5])
            if d:
                out[name[:-5]] = {'rev': d.get('rev', 0), 'updated': d.get('updated', 0)}
    return out


def valid_bars(bars):
    """bars: {"<bar number, 1 = the first bar of the file>": {"was": [[beat, chord]...], "chords": [[beat, chord]...]}}"""
    if not isinstance(bars, dict) or len(bars) > 400:
        return False

    def pairs(v):
        return isinstance(v, list) and len(v) <= 32 and all(
            isinstance(p, list) and len(p) == 2 and isinstance(p[0], (int, float)) and not isinstance(p[0], bool)
            and 0 < p[0] < 64 and isinstance(p[1], str) and 0 < len(p[1]) <= 24 for p in v)
    for k, v in bars.items():
        if not (k.isdigit() and 0 < int(k) < 1000 and isinstance(v, dict) and pairs(v.get('chords'))
                and pairs(v.get('was', []))):
            return False
    return True


def write_edits(sid, body):
    if not isinstance(body, dict) or not valid_bars(body.get('bars')) or not isinstance(body.get('rev'), int):
        return 400, {'error': 'bad edits'}
    with edit_lock:
        cur = read_edits(sid)
        cur_rev = cur.get('rev', 0) if cur else 0
        if body['rev'] != cur_rev:
            return 409, {'error': 'changed elsewhere', 'current': cur}
        new = {'v': 1, 'sheet': sid, 'rev': cur_rev + 1, 'updated': int(time.time()), 'bars': body['bars']}
        os.makedirs(EDITS, exist_ok=True)
        if cur is not None:
            hist = os.path.join(os.path.dirname(EDITS), 'history', sid)
            os.makedirs(hist, exist_ok=True)
            with open(os.path.join(hist, '%010d-r%d.json' % (cur.get('updated', 0), cur_rev)), 'w', encoding='utf-8') as f:
                json.dump(cur, f, ensure_ascii=False)
            for old in sorted(os.listdir(hist))[:-KEEP_HISTORY]:
                os.remove(os.path.join(hist, old))
        if not new['bars'] and cur is None:
            return 200, new
        fd, tmp = tempfile.mkstemp(dir=EDITS, suffix='.tmp')
        with os.fdopen(fd, 'w', encoding='utf-8') as f:
            json.dump(new, f, ensure_ascii=False, indent=1)
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp, edit_path(sid))
        return 200, new


def lan_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(('10.255.255.255', 1))
        return s.getsockname()[0]
    except OSError:
        return None


def main():
    global EDITS
    ap = argparse.ArgumentParser(description='Serve Hymns for Web')
    ap.add_argument('--port', type=int, default=8080)
    ap.add_argument('--bind', default='0.0.0.0', help='address to listen on (127.0.0.1 = this computer only)')
    ap.add_argument('--data', default=EDITS, help='folder for the saved chord edits (default: %(default)s)')
    args = ap.parse_args()
    EDITS = os.path.abspath(args.data)
    if not os.path.isfile(os.path.join(DIST, 'index.html')):
        raise SystemExit('dist/ is empty: run python3 build.py first')
    server = ThreadingHTTPServer((args.bind, args.port), Handler)
    print('Hymns for Web: http://localhost:%d/' % args.port)
    ip = lan_ip()
    if ip and args.bind == '0.0.0.0':
        print('On your home network: http://%s:%d/' % (ip, args.port))
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == '__main__':
    main()
