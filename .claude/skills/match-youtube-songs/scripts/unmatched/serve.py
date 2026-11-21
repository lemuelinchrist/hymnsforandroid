"""Serves the current folder on http://127.0.0.1:8768/ and keeps the page's answers in ./state.json ({ans, notes, lyr, inst, i}; backups/ every 5 min)."""
import http.server, os, time, shutil
os.makedirs('backups', exist_ok=True)
last = [0]
class H(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path == '/state':
            b = open('state.json', 'rb').read() if os.path.exists('state.json') else b'{}'
            self.send_response(200); self.send_header('Content-Type', 'application/json'); self.end_headers(); self.wfile.write(b); return
        super().do_GET()
    def do_POST(self):
        if self.path == '/state':
            b = self.rfile.read(int(self.headers['Content-Length']))
            open('state.json.tmp', 'wb').write(b); os.replace('state.json.tmp', 'state.json')
            if time.time() - last[0] > 300:
                last[0] = time.time(); shutil.copy('state.json', 'backups/state-%s.json' % time.strftime('%Y%m%d-%H%M%S'))
            self.send_response(204); self.end_headers()
    def log_message(self, *a): pass
http.server.ThreadingHTTPServer(('127.0.0.1', 8768), H).serve_forever()
