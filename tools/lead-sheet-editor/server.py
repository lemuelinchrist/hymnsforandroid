"""The lead sheet editor's local server.  usage: python3 tools/lead-sheet-editor/server.py [--port 8777] [--root temp/transcribe]

Serves the editor (index.html and its scripts) and the sheets under <root>: one folder per song with a leadsheet.json.
The json file is the shared state: the page saves into it, and anyone editing the file directly (an agent, a text
editor) is seen by the page, which reloads when the file changes. Every save keeps the version before it in
<song>/leadsheet.history/, and the page writes the sheet beside it as MEI: leadsheet.mei (the lead sheet, in the form
of the app's sheets) and, when the sheet has a left hand, piano.mei (the same with a second staff).
"""
import argparse, json, os, re, shutil, time
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from pathlib import Path
from urllib.parse import urlparse, parse_qs

HERE = Path(__file__).resolve().parent
REPO = HERE.parent.parent
VEROVIO = REPO / 'app/src/main/assets/viewer/verovio-toolkit-wasm.js'
PIANO = REPO / 'tools/web/vendor/piano'
AUDIO = ('source.mp3', 'source.ogg', 'source.m4a', 'source.wav')
PAGE = {'/': 'index.html', '/index.html': 'index.html', '/editor.js': 'editor.js', '/music.js': 'music.js', '/sound.js': 'sound.js',
        '/editor.css': 'editor.css'}
TYPES = {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
         '.json': 'application/json', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.m4a': 'audio/mp4'}


def dump(sheet):
    """One note per line, so that a diff of two versions reads as a list of changed notes (also the left hand's, "left")."""
    rows = [k for k in ('voice2', 'left', 'notes') if k == 'notes' or sheet.get(k)]
    head = {k: v for k, v in sheet.items() if k not in ('voice2', 'left', 'notes')}
    out = json.dumps(head, ensure_ascii=False, indent=1)[:-2] if head else '{'
    for i, k in enumerate(rows):
        body = ',\n  '.join(json.dumps(n, ensure_ascii=False) for n in sheet.get(k, []))
        out += (',\n' if head or i else '\n') + ' "%s": [\n  %s\n ]' % (k, body)
    return out + '\n}\n'


def first_line(d):
    """Where the singing starts in the recording, in seconds, as the transcription noted it (sheet.json), else None."""
    try: return float(json.loads((d / 'sheet.json').read_text(encoding='utf-8'))['lines'][0]['start'])
    except Exception: return None


class Handler(BaseHTTPRequestHandler):
    root = None

    def log_message(self, *a): pass

    def send(self, code, body, ctype='application/json', extra=None):
        if isinstance(body, (dict, list)): body = json.dumps(body, ensure_ascii=False)
        if isinstance(body, str): body = body.encode()
        self.send_response(code); self.send_header('Content-Type', ctype); self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        for k, v in (extra or {}).items(): self.send_header(k, v)
        self.end_headers(); self.wfile.write(body)

    def song(self, q):
        name = (q.get('song') or [''])[0]
        if not re.fullmatch(r'[\w.-]+', name) or name.startswith('.'): return None
        d = self.root / name
        return d if d.is_dir() else None

    def file(self, path):
        if not path.is_file(): return self.send(404, {'error': 'not found'})
        size = path.stat().st_size; start, end = 0, size - 1
        m = re.match(r'bytes=(\d*)-(\d*)', self.headers.get('Range') or '')
        if m and (m.group(1) or m.group(2)):   # the audio element seeks with ranges
            if m.group(1): start = int(m.group(1)); end = int(m.group(2)) if m.group(2) else end
            else: start = max(0, size - int(m.group(2)))
            end = min(end, size - 1)
        self.send_response(206 if m else 200)
        self.send_header('Content-Type', TYPES.get(path.suffix, 'application/octet-stream'))
        self.send_header('Accept-Ranges', 'bytes'); self.send_header('Content-Length', str(end - start + 1))
        if m: self.send_header('Content-Range', f'bytes {start}-{end}/{size}')
        self.send_header('Cache-Control', 'max-age=86400' if path == VEROVIO or path.parent == PIANO else 'no-store')
        self.end_headers()
        with open(path, 'rb') as f:
            f.seek(start); left = end - start + 1
            while left > 0:
                chunk = f.read(min(1 << 16, left))
                if not chunk: break
                try: self.wfile.write(chunk)
                except (BrokenPipeError, ConnectionResetError): return
                left -= len(chunk)

    def do_GET(self):
        u = urlparse(self.path); q = parse_qs(u.query)
        if u.path in PAGE: return self.file(HERE / PAGE[u.path])
        if u.path == '/verovio.js': return self.file(VEROVIO)
        if u.path.startswith('/piano/'):
            name = u.path[7:]
            if re.fullmatch(r'[A-G]s?\d\.mp3', name): return self.file(PIANO / name)
            return self.send(404, {'error': 'not found'})
        if u.path == '/api/list':
            songs = []
            for d in sorted(self.root.iterdir()):
                f = d / 'leadsheet.json'
                if f.is_file():
                    try: title = json.loads(f.read_text(encoding='utf-8')).get('title', d.name)
                    except Exception: title = d.name
                    songs.append({'song': d.name, 'title': title})
            return self.send(200, songs)
        d = self.song(q)
        if d is None: return self.send(404, {'error': 'no such song'})
        f = d / 'leadsheet.json'
        if u.path == '/api/rev': return self.send(200, {'rev': str(f.stat().st_mtime_ns) if f.is_file() else ''})
        if u.path == '/api/sheet':
            if not f.is_file(): return self.send(404, {'error': 'no leadsheet.json'})
            try: sheet = json.loads(f.read_text(encoding='utf-8'))
            except Exception as e: return self.send(500, {'error': f'leadsheet.json is not valid JSON: {e}'})
            audio = next((a for a in AUDIO if (d / a).is_file()), None)
            return self.send(200, {'rev': str(f.stat().st_mtime_ns), 'sheet': sheet, 'audio': audio,
                                   'start': first_line(d) if audio else None})
        if u.path == '/api/history':   # the versions before each save, newest first; ?v=<name> gives one of them
            h = d / 'leadsheet.history'; v = (q.get('v') or [''])[0]
            if not v: return self.send(200, sorted((x.stem for x in h.glob('*.json')), reverse=True) if h.is_dir() else [])
            if not re.fullmatch(r'[\w-]+', v) or not (h / (v + '.json')).is_file(): return self.send(404, {'error': 'no such version'})
            try: return self.send(200, {'sheet': json.loads((h / (v + '.json')).read_text(encoding='utf-8'))})
            except Exception as e: return self.send(500, {'error': f'not valid JSON: {e}'})
        if u.path == '/audio':
            a = next((d / a for a in AUDIO if (d / a).is_file()), None)
            return self.file(a) if a else self.send(404, {'error': 'no audio'})
        self.send(404, {'error': 'not found'})

    def do_PUT(self):
        u = urlparse(self.path); q = parse_qs(u.query); d = self.song(q)
        if u.path == '/api/mei' and d is not None:   # the sheet in the app's MEI form: leadsheet.mei, with a left hand piano.mei
            mei = self.rfile.read(int(self.headers.get('Content-Length', 0))).decode()
            out = d / ('piano.mei' if (q.get('kind') or [''])[0] == 'piano' else 'leadsheet.mei')
            if not mei and out.name == 'piano.mei':   # the sheet has no left hand any more
                out.unlink(missing_ok=True); return self.send(200, {})
            if not mei.startswith('<?xml'): return self.send(400, {'error': 'not MEI'})
            out.write_text(mei, encoding='utf-8'); return self.send(200, {})
        if u.path != '/api/sheet' or d is None: return self.send(404, {'error': 'not found'})
        f = d / 'leadsheet.json'
        try: sheet = json.loads(self.rfile.read(int(self.headers.get('Content-Length', 0))).decode())
        except Exception: return self.send(400, {'error': 'bad JSON'})
        if not isinstance(sheet, dict) or not isinstance(sheet.get('notes'), list): return self.send(400, {'error': 'not a sheet'})
        rev = str(f.stat().st_mtime_ns) if f.is_file() else ''
        if (q.get('rev') or [''])[0] != rev:   # the file changed since the page read it: the page takes the file's version
            return self.send(409, {'error': 'changed on disk', 'rev': rev})
        if f.is_file():
            h = d / 'leadsheet.history'; h.mkdir(exist_ok=True)
            shutil.copy2(f, h / (time.strftime('%Y%m%d-%H%M%S') + '.json'))
            old = sorted(h.glob('*.json'))
            for x in old[:-200]: x.unlink()
        tmp = f.with_suffix('.tmp'); tmp.write_text(dump(sheet), encoding='utf-8'); os.replace(tmp, f)
        self.send(200, {'rev': str(f.stat().st_mtime_ns)})


if __name__ == '__main__':
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('--port', type=int, default=8777); ap.add_argument('--root', default=str(REPO / 'temp/transcribe'))
    a = ap.parse_args()
    Handler.root = Path(a.root).resolve()
    print(f'Lead sheet editor: http://localhost:{a.port}/   (sheets in {Handler.root})', flush=True)
    ThreadingHTTPServer(('127.0.0.1', a.port), Handler).serve_forever()
