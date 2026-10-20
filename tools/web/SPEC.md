# Hymns web app (PWA): Spec & Plan

A browser app that reads our `hymns.sqlite` and shows hymns, with the LilyPond-derived sheet viewer
(piano/guitar, transpose, show/hide staff) and chord editing. Since 2026-10-20 it is **the app for iPhone and iPad
users**: a PWA on GitHub Pages that installs to the home screen and works offline (§9). It does not change the
Android app; it reads the Android app's files.

- Started: 2026-10-11 as "Hymns for Web" (branch `hymnsforweb`, `svg-to-lilypond/hymnsforweb/`, served from the
  home network). Became the PWA on 2026-10-20 (branch `pwa`, folder `tools/web/`).
- How to build, run and publish it: [README.md](README.md). Decisions: §7 (2026-10-11) and §9 (2026-10-20, these win).
- What the Android app does, for parity: [`docs/HYMNAL_SPEC.md`](../../docs/HYMNAL_SPEC.md).

> Sections 1–8 are the original design. Where they talk about `serve.py` sending `.gz` files, a server storing chord
> edits, or no service worker, §9 replaces them.

---

## 1. Goals

1. Look up any hymn in any hymnal in the database (22 groups, ~15,000 hymns) by number, first line or words.
2. Read the lyrics comfortably on a phone, tablet or desktop.
3. Show the sheet music from `sheetMei/*.mei` (the output of the SVG → LilyPond → MEI pipeline) with:
   - **Piano / Guitar** toggle
   - **Transpose** up/down, showing the new key
   - **Show / hide staff** (hidden = chords over lyrics, the guitarist's view)
4. Move between translations of the same hymn in one tap (the `related` / `parent_hymn` links).
5. Run with no server code: static files only, served by any web server.

Non-goals (for now): editing the melody or lyrics, accounts, copying the Android UI. (Chord editing was added later: §8.)

---

## 2. What we reuse

| Piece | Where it is | How the web app uses it |
|---|---|---|
| Hymn database | `app/src/main/assets/hymns.sqlite` (18 MB; 6.7 MB gzipped) | Loaded as-is in the browser with **sql.js** (SQLite compiled to WebAssembly). Same tables, same SQL. |
| Sheet files | `app/src/main/assets/sheetMei/*.mei` (3,342 files, 44 MB, ~13 KB each) | Fetched one at a time when a sheet is opened. |
| Renderer | `app/src/main/assets/viewer/verovio-toolkit-wasm.js` (7.3 MB, LGPL, see `VEROVIO-NOTICE.txt`) | Same Verovio build the app uses. Loaded only when the first sheet is opened. |
| Sheet logic | `app/src/main/assets/viewer/viewer.js` (444 lines) | Ported into a module: MEI loading, transposition through Verovio, the guitar version derived from the piano MEI (capo from the key, chords moved down, slash basses dropped, repeated chords removed; DESIGN.md §10, §19), staff hiding. The rules stay the same so web and app sheets match. |
| Data rules | `HymnsDao.java`, `SheetMusicButton.java`, `HymnGroup.java` | Re-implemented in JS (§5). |

The web app keeps **no copy** of the database or the MEI files in git. A build script copies them from the app's
assets into a git-ignored `dist/` folder, so the web app always shows the same data as the latest app build.

---

## 3. UI design

The Android app is built around a drawer, a hymnal switcher and a separate search screen. On the web the most
natural entry point is **one search box that understands everything**, and wide screens can show lyrics and
sheet side by side.

### 3.1 Screens

**Home / search** (`#/`)

```
┌──────────────────────────────────────────────────────────┐
│  Hymns                                         ☾  A A   │
│                                                          │
│   ┌────────────────────────────────────────────────┐     │
│   │ 🔍  Number, first line or any words…            │     │
│   └────────────────────────────────────────────────┘     │
│   [English ▾]  E · NS · BF · CH · 中文 · CS · …           │
│                                                          │
│   Recent      E8 Praise God, from whom all blessings…    │
│               NS151 Christ is the mystery of God…        │
│   Favorites   ★ E1225  ★ C206                            │
│   Browse      by number · by category                     │
└──────────────────────────────────────────────────────────┘
```

- The query is read as:
  - `8` → hymn 8 in the current hymnal (opens straight away on Enter).
  - `E8`, `ns151`, `C 206` → that hymn in that hymnal.
  - Anything else → a search of first lines, chorus lines and stanza text. Results update as you type. Each
    result shows the hymnal chip in the group colour, the number, the first line and the matching snippet.
- The hymnal picker remembers the last choice. Group names and colours come from `HymnGroup.java`.
- **Browse**: a number grid (1…max, with gaps greyed out) and a category tree (`main_category` →
  `sub_category`) for the selected hymnal.

**Hymn** (`#/h/E8`, wide screen)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ ‹ 7   E8 · English                                           ☆   🔍   8 ›    │
│ Blessing of the Trinity — His Praise                                          │
│ In other languages:  中文 C5 · 简 Z5 · Español S5 · Tagalog T8 · 한국어 K5 …   │
├───────────────────────────────────┬──────────────────────────────────────────┤
│  1  Praise God, from whom all     │ [Piano|Guitar]  − G Major +  [Staff ◐]   │
│     blessings flow;               │                                          │
│     Praise Him, all creatures…    │      ♩ rendered sheet (Verovio SVG)       │
│                                   │                                          │
│  2  Praise God the Father who's…  │                                          │
│                                   │                                          │
│  Thomas Ken · Genevan Psalter     │                                          │
│  8.8.8.8. · G Major · 4/4         │                                          │
└───────────────────────────────────┴──────────────────────────────────────────┘
```

- **Phone**: one column with a `Lyrics | Sheet` switch under the header. The sheet toolbar sticks to the
  top while scrolling.
- Lyrics: large serif text, stanza numbers in the margin, chorus indented and in italics. A font-size control
  in the header.
- "In other languages" lists every related hymn by language name, so a translation is one tap away.
  Switching keeps the current tab (lyrics or sheet).
- Footer: author, composer, meter, key, time, plus a link to the hymn on hymnal.net when there is one.
- If there is no sheet (no MEI for the hymn or its parent), the Sheet tab is hidden and the footer says
  there is no sheet music.

**Sheet only** (`#/sheet/E8`): the sheet full-width, for a music stand or a projector. Toolbar settings are in
the URL (`?v=guitar&t=2&staff=0`), so a link opens the same view.

### 3.2 Sheet toolbar

| Control | Behaviour |
|---|---|
| Piano / Guitar | Guitar derives the capo from the key (capo shown above the music), moves chords down by the capo and drops slash basses. This is the same rule as the app. |
| − Key + | Transposes by a semitone, from −6 to +6. Verovio moves notes, key signature and chord symbols, and the label shows the new key. |
| Hide / Show staff | Hides the staff and shows chords over the lyrics, reflowed to the width. |
| Zoom − / + | The sheet's size (Verovio scale 20–90), remembered. |
| Reset | Appears after a change and returns to the original key and size. Clicking the key label also returns to the original key. |
| ⤢ | The sheet-only view (`#/sheet/E8`). |

Piano/guitar, the staff and the zoom are remembered between hymns. Transposition is per hymn and is kept only
in the URL. (The app opens guitar sheets with the staff hidden. Here the last choice wins, since the web app
has no separate default-sheet setting.)

### 3.3 Other things

- **Keyboard**: `/` focuses search, `←` / `→` go to the previous or next hymn, `L` / `S` switch lyrics and
  sheet, `G` / `P` choose guitar or piano, `+` / `−` transpose, `H` hides the staff.
- **Dark mode**: follows the system, with a manual toggle. The sheet SVG is recoloured as the app does
  (`dark=1`).
- **Print**: a print stylesheet prints lyrics only, or the sheet only, without toolbars.
- **Recent & favorites**: kept in `localStorage`, on this browser only.

---

## 4. Architecture

```
tools/web/                (was svg-to-lilypond/hymnsforweb/ until 2026-10-20)
  SPEC.md, README.md
  build.py           dist/ from the app's assets: the DB (gzipped, with a search table), the MEI files, Verovio
  serve.py           the web server (Python standard library): sends the .gz files as they are, ETags
  src/
    index.html       the single page
    app.css
    app.js           routing (hash URLs), screens, keyboard, localStorage
    db.js            sql.js wrapper: open the DB, get a hymn (with the parent merge), search, browse
    groups.js        hymnal names, colours and order (from HymnGroup.java)
    sheet.js         viewer.js ported into a class: new SheetView(box).show(id, {guitar, shift, staff, scale})
  vendor/            sql.js 1.13.0
  tests/e2e.cjs      Playwright tests
  dist/              (git-ignored) what gets served
```

- **No framework and no bundler.** Plain ES modules, like the app's `viewer.js`.
- **No service worker.** On the home network the page is served over plain http from a LAN address, which
  is not a "secure context", so service workers and the Cache API are not available. Instead:
  - The database is stored in **IndexedDB** under its version (`data/version.json`), so it downloads once per
    database change. Measured on this PC: the first load is under a second, and later loads take about
    250 ms. A simulated mid-range phone (4× slower CPU, 30 Mbit/s Wi-Fi) takes 4.1 s the first time and
    0.65 s after that. On that phone a search takes about 90 ms, and transposing or switching to guitar
    about 0.3 s.
  - Verovio is prefetched in the background 1.5 s after the start, so the first sheet doesn't wait for it.
  - Everything else is revalidated with ETags (`304 Not Modified`).
- **Download size:** 10 MB of database (gzipped) once, and the 2.3 MB Verovio renderer when the first
  sheet is opened. Each sheet is 2–5 KB.
  - The shipped DB keeps only the index the web app uses (stanzas by hymn).
  - The `search` table (normalised text, see §5) costs about 3 MB of the download. In exchange, accents
    and case are ignored in every language.
- `sheets.json`: the IDs that have an `.mei`, so the app knows which hymns have a sheet without fetching.
- The hymn page loads the sheet only when it is shown: on a phone, only after "Sheet music" is tapped.

## 5. Data rules (ported from the app)

1. **Parent merge** (`HymnsDao.get`): a hymn with `parent_hymn` takes any empty field (author, composer, time,
   tune, key, categories, meter, verse, sheet link) from its parent. It takes the parent's stanzas when it has
   none of its own, and adds the parent's `related` to its own.
2. **Sheet lookup** (`SheetMusicButton.getRootMusicSheet`): use `<id>.mei` if it exists, otherwise the
   parent's `.mei`. So `SW10` shows `E1206`'s sheet, and `C8` shows `E11`'s. The header says
   "Sheet from E1206" when the sheet belongs to the parent.
3. **Related**: `related` is a comma-separated list of IDs (with a trailing comma). It is merged with the
   parent's list and the parent itself. Missing IDs are left out, the same way the app now handles missing
   hymn IDs.
4. **Stanza text** uses `<br/>` line breaks and `n_order` for order. Stanza `no` is a number or `chorus`.
5. **Search** runs `LIKE` over a `search` table that `build.py` fills with each hymn's first lines and
   stanzas in a normal form: no tags, no accents, lower case, punctuation as spaces. `norm()` in `build.py`
   and `db.js` must stay identical.
   - "senor" finds "Señor", and Greek final sigma matches.
   - Chinese and Japanese match by substring, since there are no spaces.
   - All words must appear. Sorting: the phrase at the start of the first line, the phrase in the first
     line, the phrase in the chorus line, all words in the first line, all words in the chorus line, then
     the phrase or whole words in the text, then parts of words.
   - It takes about 20 ms (no FTS5 in sql.js, and it isn't needed).

---

## 6. Milestones

| # | Deliverable | Status |
|---|---|---|
| M1 | `build.py`, DB loading, hymn page with lyrics and parent merge, hymnal picker, prev/next | done |
| M2 | Search box (number, ID, words) and results; browse by number and category | done |
| M3 | Sheet module ported from `viewer.js`; toolbar; side by side on wide screens, tabs on phones | done |
| M4 | Related languages, recent and favorites, dark mode, keyboard shortcuts, print | done |
| M5 | Offline | replaced by the IndexedDB cache (§4): the hymns open without the network, the server is still needed |

**Tested** with Playwright (`tests/e2e.cjs`), desktop and phone sizes, plus a run of every sheet in four modes
(piano, transposed, guitar, chord chart).

Later ideas (not planned):
- Play the tune: Verovio can make MIDI from the MEI, but it would need a small SoundFont player.
- A projector mode with one stanza per screen.

## 7. Decisions (Lemuel, 2026-10-11)

1. **Local only, private on the home network.** Not published. `serve.py` listens on all addresses by default
   so phones on the Wi-Fi can use it.
2. **Speed.** Lemuel wasn't sure about loading the whole SQLite file and didn't want it slow. So the app keeps
   the real SQLite file, but makes it fast: gzip, no indexes in the download, cached in IndexedDB, and
   measured (§4).
3. **Branch** `hymnsforweb`.
4. **Name:** Hymns for Web.
5. **Kept apart from the main project:** nothing in the main documentation or the app's code refers to this
   folder. The `dist/` ignore rule lives in this folder's own `.gitignore`.

## 8. Chord editing (Lemuel, 2026-10-12)

Use case: a tablet on the piano. The melody and words stay as they are; the chords get passing chords and
embellishments, saved on the server so every device sees them.

- **Model.** Per sheet, a list of chords for each edited bar: `{"bars": {"<bar>": {"was": [[beat, chord]], "chords": [[beat, chord]]}}}`.
  A bar is the nth `<measure>` of the sheet's MEI; a beat is the MEI `tstamp` (1 = first beat; half beats allowed).
  The list *replaces* the bar's chords (so moving and deleting are simple). `was` is the bar's original chords,
  used to warn when the sheet changes under an edit. Stored in the original key.
- **Where applied.** `SheetView.prepare()` replaces the harms in the parsed MEI before anything else, so transposing
  (Verovio), the guitar derivation and the chords-over-lyrics view work unchanged. Changed chords carry
  `type="edit"` (red in the SVG). Bars and chords get `xml:id`s in edit mode so a tap can be traced to a bar.
- **Editing only on the piano sheet with the staff shown**; guitar and chart views show the edits but leave edit mode.
- **Server.** `serve.py`: `GET /api/edits[/<sheet>]`, `PUT /api/edits/<sheet>` with the `rev` it was based on (409 when
  it moved on), atomic write, 30 versions of history, `X-Hymns: 1` required on writes (blocks cross-site writes).
  Data in `~/hymnsforweb-data/` (outside the repo and the build).
- **Hymns sharing a sheet** (SW10 -> E1206) share its edits: they belong to the sheet.
- **Deployment.** `deploy.sh` + user unit `hymnsforweb.service`, port 8765, on the `media` host. *(Removed 2026-10-20, with the
  service and its data on media: the app is now published by `.github/workflows/web-app.yml`, §9.)*
- **Later (when going multi-user):** a PIN or accounts; per-user edit sets; export the edits back into the `.ly` sources.

## 9. The PWA (Lemuel, 2026-10-20)

The iPhone version was a single offline HTML file with lyrics only (`tools/ios/`). It becomes this app, published so
iPhone and iPad users install it from Safari. Decisions:

1. **Same features as the Android app, not the same look.** A better UI is welcome. Kept from Android (see
   `docs/HYMNAL_SPEC.md`): the hymnals' colours, picking a hymnal on a hymn opens its translation, the "other
   languages" row, a single chorus repeated after every stanza (a setting, on by default), Back returns where you
   came from, favorites import/export in the Android format (`E1,C215,`), hymnals that can be switched off
   (Indonesian off at first), keep the screen on, copy the lyrics, the curated piano videos.
   Different on purpose: one smart search box instead of eight tabs, a bottom tab bar on phones (Hymns · Hymnal ·
   Favorites · Settings), lyrics and sheet side by side on wide screens, lyrics in two columns when there is room.
2. **Chord edits on the device + baked into the sheets.** No server: edits live in IndexedDB (`edits.js`), with
   export/import of a JSON file. Exported files are sent in and put into the `.ly`/MEI sources so every app gets
   the chords (tooling for that is a later step). The media host's `hymnsforweb` service and its data were removed.
3. **GitHub Pages** on this repository, built by `.github/workflows/web-app.yml` on each published release or by hand.
4. **Hidden from search engines** as far as possible: `noindex` on the page; not linked publicly.
5. **The single-file HTML stays** in releases as a fallback.

How it works now:

- **Static files only.** `build.py` writes hashed, gzipped data files: `data/hymns-<hash>.sqlite.gz` (the database
  plus the `search` table), `sheets/<group>-<hash>.json.gz` and `lyrics/<group>-<hash>.json.gz` (one pack per hymnal
  of MEI files and sheet-lyrics overlays), `data/index-<hash>.json` (which hymns have a sheet or an overlay) and
  `data/version.json` (which files are current). The browser unpacks them (`DecompressionStream`, `files.js`),
  because GitHub Pages serves `.gz` files as they are. Verovio is plain JS (Pages compresses it on the way).
- **Service worker** (`sw.js`, file lists written in by `build.py`): the app shell is stored per build; hashed data
  files are kept once fetched (cache first); `version.json` is network first. The database is not stored by the
  service worker: `db.js` keeps it unpacked in IndexedDB. Settings → Offline downloads all sheet packs at once
  (about 5 MB) and asks the browser to keep the storage.
- **Hymnals from `HymnGroup.java`** (order, app names, colours, right-to-left), with web names and a few darker
  colours from `DISPLAY` in `build.py`. A new language needs no change here.
- **Translated words under a borrowed sheet** (`sheetLyrics`, ported from the app's `viewer.js`): FR, FY, C, CS, Z, ZS.
- **Icons** from the Android app's icon (the serif H on dark grey), full tile, so iOS rounds it like any app.
- **Not done yet:** playing the melody (needs a small MIDI synthesizer), the similar-tune list, the tool that
  bakes exported chord edits into the `.ly` sources.
