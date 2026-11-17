#!/usr/bin/env python3
"""Serves the Android app's sheet viewer the way the app does (WebViewAssetLoader), for trying it in a browser and for
tests/android.cjs, without a build of the app:

    python3 tools/web/tests/android_serve.py [--port 8798]   then http://127.0.0.1:8798/assets/viewer/index.html?id=E8

/assets/viewer/<file>  the files app/build.gradle copies in: tools/web/src (those in tools/web/android/shared.txt),
                       tools/web/android, tools/lead-sheet-editor/music.js; else app/src/main/assets/viewer (Verovio)
/assets/<path>         app/src/main/assets (sheetMei, sheetLyrics)
/res/raw/<name>.mid    app/src/main/res/raw (the tunes)
"""
import argparse
import http.server
import os
import posixpath
import urllib.parse

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, '..', '..', '..'))
WEB = os.path.join(ROOT, 'tools', 'web')
ASSETS = os.path.join(ROOT, 'app', 'src', 'main', 'assets')
RAW = os.path.join(ROOT, 'app', 'src', 'main', 'res', 'raw')
SHARED = [l.strip() for l in open(os.path.join(WEB, 'android', 'shared.txt'), encoding='utf-8')
          if l.strip() and not l.startswith('#')]


def resolve(path):
    parts = [p for p in posixpath.normpath(urllib.parse.unquote(path)).split('/') if p and p != '..']
    if parts[:2] == ['assets', 'viewer'] and len(parts) == 3:
        name = parts[2]
        if name in SHARED:
            return os.path.join(WEB, 'src', name)
        if name == 'music.js':
            return os.path.join(ROOT, 'tools', 'lead-sheet-editor', 'music.js')
        if name != 'shared.txt' and os.path.isfile(os.path.join(WEB, 'android', name)):
            return os.path.join(WEB, 'android', name)
        return os.path.join(ASSETS, 'viewer', name)
    if parts[:1] == ['assets']:
        return os.path.join(ASSETS, *parts[1:])
    if parts[:2] == ['res', 'raw'] and len(parts) == 3:
        base = os.path.splitext(parts[2])[0]
        for ext in ('.mid', '.mp3'):
            if os.path.isfile(os.path.join(RAW, base + ext)):
                return os.path.join(RAW, base + ext)
    return None


class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map, '.js': 'text/javascript', '.mei': 'application/xml',
                      '.mid': 'audio/midi', '.wasm': 'application/wasm'}

    def translate_path(self, path):
        return resolve(path.split('?', 1)[0]) or os.path.join(HERE, '__missing__')

    def log_message(self, *args):
        pass


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--port', type=int, default=8798)
    ap.add_argument('--bind', default='127.0.0.1')
    a = ap.parse_args()
    http.server.ThreadingHTTPServer((a.bind, a.port), Handler).serve_forever()
