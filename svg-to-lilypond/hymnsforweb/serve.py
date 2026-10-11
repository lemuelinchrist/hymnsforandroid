#!/usr/bin/env python3
"""Serves dist/ on the home network.

    python3 serve.py [--port 8080] [--bind 0.0.0.0]

A file stored as <name>.gz (the database, the sheets, Verovio) is sent compressed with Content-Encoding: gzip,
or unpacked for the rare client that does not accept gzip. Every response has an ETag and "no-cache", so the
browser keeps its copy and only asks whether it changed.
"""
import argparse
import email.utils
import gzip
import mimetypes
import os
import socket
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import unquote, urlsplit

DIST = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'dist')
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
        self.send(head=False)

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


def lan_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(('10.255.255.255', 1))
        return s.getsockname()[0]
    except OSError:
        return None


def main():
    ap = argparse.ArgumentParser(description='Serve Hymns for Web')
    ap.add_argument('--port', type=int, default=8080)
    ap.add_argument('--bind', default='0.0.0.0', help='address to listen on (127.0.0.1 = this computer only)')
    args = ap.parse_args()
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
