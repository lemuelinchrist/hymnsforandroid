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

## Editing chords (piano sheet)

Tap **Edit chords** on a piano sheet (or press `E`). Tap a bar; the panel at the bottom shows its beats. Pick a beat
(half beats too, for passing chords), then build the chord from the buttons or type it (`bb`, `#` and a lower-case
root are fixed for you). A chord you added or changed is red on the sheet. The melody is never touched.

- Edits are saved on the server as you go (one file per sheet in `~/hymnsforweb-data/edits/`, the last 30 versions in
  `history/`). Every device that opens the sheet sees them. **Original chords** (`O`) shows the sheet without them.
- They are stored in the original key, so transposing, the guitar sheet and the chords-over-lyrics view all use them.
  When the editor is open while transposed, what you type is in the key you see.
- If two devices edit the same sheet, the second save is refused ("Changed on another device") instead of
  overwriting; **Use the other version** loads the saved one.
- There is no login yet (single user, home network). Writes need a header a web page on another site cannot send.

## Running it all the time

```bash
./deploy.sh      # builds, copies serve.py + dist/ to ~/hymnsforweb-app/, (re)starts the user service on port 8765
```

`hymnsforweb.service` is a systemd **user** service (enabled; lingering keeps it up after reboots), so switching git
branches never affects it. It builds from the private snapshot of `sqlite/hymns.sql`, not the shared
`hymns.sqlite`. Run `./deploy.sh` again after the hymns or sheets change. Logs: `journalctl --user -u hymnsforweb`.
Back up `~/hymnsforweb-data/`: it is the only place your chord edits live.

## Tests

```bash
node tests/e2e.cjs                 # 37 checks in Chromium: search, hymn pages, sheets, phone layout (about 30 s)
node tests/e2e.cjs --sheets 200    # also renders 200 random sheets in four modes each
node tests/e2e.cjs --sheets all    # ... or every sheet (about half an hour)
```

```bash
node tests/edit.cjs                # 11 checks of the chord editor and saving (own server, empty temp data folder)
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
| `src/editor.js` | the chord editor panel |
| `deploy.sh`, `hymnsforweb.service` | the always-on service (see above) |
| `tests/e2e.cjs`, `tests/edit.cjs` | Playwright tests |
| `dist/` | build output, not in git |
