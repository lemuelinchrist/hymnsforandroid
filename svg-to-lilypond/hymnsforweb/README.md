# Hymns for Web

A browser app for the hymns in the Android app's database, with the sheet music viewer (piano / guitar,
transpose, show / hide staff). A side project: it reads the app's files and changes nothing in the app.
For home-network use. See [SPEC.md](SPEC.md) for the design.

## Run it

```bash
python3 build.py      # makes dist/ from the app's assets (about 20 s the first time, then about 10 s)
python3 serve.py      # serves dist/ on port 8080
```

`serve.py` prints two addresses: `http://localhost:8080/` for this computer, and one with this computer's
address (e.g. `http://192.168.0.2:8080/`) for phones and tablets on the same Wi-Fi. Use
`--bind 127.0.0.1` to keep it to this computer, or `--port` to change the port.

The first visit on each device downloads the hymns (about 10 MB); after that they open from the browser's
storage until the database changes. The music renderer (2.3 MB) loads the first time a sheet is opened.

Only Python 3 is needed (no packages). After the app's database or sheets change, run `build.py` again;
browsers pick up the new database on their next visit.

## Tests

```bash
node tests/e2e.cjs                 # 37 checks in Chromium: search, hymn pages, sheets, phone layout (about 30 s)
node tests/e2e.cjs --sheets 200    # also renders 200 random sheets in four modes each
node tests/e2e.cjs --sheets all    # ... or every sheet (about half an hour)
```

The tests start their own server on port 8799 (`PORT=… node tests/e2e.cjs` to change it). They use Playwright,
installed in this folder or globally (`npm i -g playwright && npx playwright install chromium`).

## Files

| | |
|---|---|
| `src/` | the app: `index.html`, `app.css`, `app.js` (screens), `db.js` (database), `sheet.js` (sheet music), `groups.js` (hymnals) |
| `vendor/` | sql.js 1.13.0 (SQLite in WebAssembly, MIT licence) |
| `build.py` | builds `dist/` from `../../app/src/main/assets` (or `--assets <folder>`) |
| `serve.py` | the web server (Python standard library only) |
| `tests/e2e.cjs` | Playwright tests |
| `dist/` | build output, not in git |
