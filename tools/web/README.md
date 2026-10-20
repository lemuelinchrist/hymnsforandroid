# Hymns web app (PWA)

The hymns of the Android app as a web app that installs on a phone or tablet and works offline: lyrics in every
hymnal, search, favorites, each hymn's tune (Play), and the sheet music viewer (piano / guitar, transpose, chords over lyrics, chord editing).
It is the app for iPhone and iPad users, published on GitHub Pages. Design notes: [SPEC.md](SPEC.md).

Everything comes from the Android app's files (`sqlite/hymns.sql` via `hymns.sqlite`, `app/src/main/assets/sheetMei`,
`sheetLyrics`, the viewer's Verovio, the tunes in `res/raw`, `HymnGroup.java`), so the web app always shows the same data as the APK.

## Build and try it

```bash
./gradlew :sqlite:importSql          # or: sqlite3 app/src/main/assets/hymns.sqlite < sqlite/hymns.sql
python3 tools/web/build.py           # makes tools/web/dist/ (about 30 s; needs Pillow for the icons)
python3 tools/web/serve.py           # serves dist/ on http://localhost:8080/
```

`localhost` behaves like the published site, service worker included. Phones on the same Wi-Fi can open the address
`serve.py` prints, but over plain http there is no service worker (no offline use, no install).

## Publish

The workflow `.github/workflows/web-app.yml` builds `dist/` from the repository and publishes it on GitHub Pages:
automatically when a GitHub release is published, or by hand under **Actions → Web app → Run workflow**.
Pages must be set to "GitHub Actions" as its source (repository Settings → Pages), once.

Installed apps pick up a new version the next time they are opened with a network (they offer "Reload").

## Install on iPhone / iPad

Open the site in Safari, tap **Share**, then **Add to Home Screen**. The app opens full screen, keeps the hymns on
the device and works without internet. The home page shows this hint until it is installed.

## Not for search engines

Every page has `<meta name="robots" content="noindex, nofollow">`, so search engines that respect it leave it out
of their results; people find it through the link in the main README (since 2026-10-20) or by being sent the link.
(A `robots.txt` would only count at the root of the domain, which a GitHub Pages project site does not control.)

## Chord edits

On a piano sheet, **Edit chords** (or `E`): tap a bar, pick a beat (half beats too), build or type the chord.
Changed chords are red; **Original chords** (`O`) hides them. Edits are stored in the original key, so transposing,
the guitar sheet and the chords-over-lyrics view use them.

They are kept **on the device** (IndexedDB), per sheet. Settings → Chord edits exports them as a file
(`hymns-chord-edits-<date>.json`) and imports such a file on another device (a sheet edited later on this device is
kept). The same file is what gets sent in so the chords can go into the sheets for everyone:

```bash
python3 tools/svg-to-lilypond/tools/chord_edits.py import hymns-chord-edits-<date>.json --dry-run   # what would change
python3 tools/svg-to-lilypond/tools/chord_edits.py import hymns-chord-edits-<date>.json             # .ly + MEI + chord_edits/
```

It changes the `.ly` sources and the MEI files the Android app ships, and keeps the edits in
`tools/svg-to-lilypond/chord_edits/` (README there). Then publish the web app and release the APK. A device that made
the edits drops its own copy once the sheet has those chords.

File format:

```json
{"format": "hymns-chord-edits", "v": 1, "exported": "2026-10-20T12:00:00Z",
 "sheets": {"E8": {"updated": 1792296177000,
   "bars": {"2": {"was": [[1, "E♭"]], "chords": [[1, "E♭"], [2.5, "A♭7"]]}}}}}
```

A bar is the nth `<measure>` of the sheet's MEI file (from 1), a beat the MEI `tstamp` (1 = the first beat, in the
meter's unit), `chords` replaces the bar's chords, and `was` is what the bar had, to notice when the sheet changes
under an edit.

## Tests

```bash
node tools/web/tests/e2e.cjs                 # 53 checks in Chromium: search, hymns, sheets, tunes, Android behaviour, offline, phone
node tools/web/tests/e2e.cjs --sheets 300    # also renders 300 random sheets in four modes each (--sheets all: every one)
node tools/web/tests/edit.cjs                # 12 checks of the chord editor, saving, export and import
```

They start their own `serve.py` on a spare port and use Playwright (`npm i -g playwright && npx playwright install chromium`).

## Files

| | |
|---|---|
| `src/index.html`, `app.css` | the page |
| `src/app.js` | screens and routing (hash URLs), settings, favorites, the hymnal picker |
| `src/db.js` | the database (sql.js): a hymn with its parent's fields, related hymns, search |
| `src/sheet.js` | the sheet viewer (ported from the app's `assets/viewer/viewer.js`), translated words, chord edits |
| `src/player.js` | Play: reads the app's MIDI files (`res/raw/m<tune>.mid`) and plays them looped with a small Web Audio piano |
| `src/editor.js`, `src/edits.js` | the chord editor panel; edits on the device, export and import |
| `src/files.js` | fetching and unpacking the gzipped data files |
| `src/groups.js` | the hymnals; `build.py` fills them in from `HymnGroup.java` |
| `src/sw.js`, `src/manifest.webmanifest` | service worker (offline) and install manifest; `build.py` writes the file lists in |
| `vendor/` | sql.js 1.13.0 (SQLite in WebAssembly, MIT licence) |
| `build.py`, `serve.py` | the build, and a local server that serves `dist/` the way GitHub Pages does |
| `dist/` | build output, not in git |

The single-file lyrics-only version (`tools/ios/`, attached to every release) stays as a fallback for anyone who
cannot use the web app.
