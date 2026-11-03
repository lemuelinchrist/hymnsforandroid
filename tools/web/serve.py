#!/usr/bin/env python3
"""Serves dist/ for trying the app on this computer, the way GitHub Pages serves it (static files only).

    python3 tools/web/serve.py [--port 8080] [--bind 0.0.0.0]

http://localhost:<port>/ works fully (the service worker needs https or localhost). Phones on the same Wi-Fi can
open the printed network address too, but over plain http there is no service worker, so no offline use there.
"""
import argparse
import os
import socket
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

DIST = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'dist')


class Handler(SimpleHTTPRequestHandler):
    extensions_map = dict(SimpleHTTPRequestHandler.extensions_map, **{
        '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm', '.json': 'application/json',
        '.webmanifest': 'application/manifest+json', '.gz': 'application/gzip', '.svg': 'image/svg+xml'})

    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache')
        super().end_headers()

    def log_message(self, fmt, *args):
        pass


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('--port', type=int, default=8080)
    ap.add_argument('--bind', default='0.0.0.0')
    args = ap.parse_args()
    if not os.path.exists(os.path.join(DIST, 'index.html')):
        raise SystemExit('No dist/ yet: run python3 tools/web/build.py first')
    server = ThreadingHTTPServer((args.bind, args.port), partial(Handler, directory=DIST))
    print('Serving %s' % DIST)
    print('  this computer: http://localhost:%d/' % args.port)
    if args.bind in ('0.0.0.0', ''):
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            s.connect(('10.255.255.255', 1))
            print('  same Wi-Fi:    http://%s:%d/ (no offline use over http)' % (s.getsockname()[0], args.port))
        except OSError:
            pass
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == '__main__':
    main()
