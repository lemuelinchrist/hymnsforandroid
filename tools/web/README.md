# Hymns web app (PWA)

The hymns of the Android app as a web app that installs on a phone or tablet and works offline: lyrics in every
hymnal, search, favorites, each hymn's tune (Play), and the sheet music viewer (piano / guitar, transpose, chords over lyrics, chord editing,
a piano part for both hands made from the chords).
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
by hand under **Actions → Web app → Run workflow** (or `gh workflow run web-app.yml --ref master`), after each release
and whenever master has web changes. Only master can deploy to Pages (the github-pages environment's rule).
Pages must be set to "GitHub Actions" as its source (repository Settings → Pages), once.

Installed apps pick up a new version the next time they are opened with a network (they offer "Reload").

## Install on iPhone / iPad

Open the site in Safari, tap **Share**, then **Add to Home Screen**. The app opens full screen, keeps the hymns on
the device and works without internet. The home page shows this hint until it is installed.

## Not for search engines

Every page has `<meta name="robots" content="noindex, nofollow">`, so search engines that respect it leave it out
of their results; people find it through the link in the main README (since 2026-10-20) or by being sent the link.
(A `robots.txt` would only count at the root of the domain, which a GitHub Pages project site does not control.)

## Loose pages (`extra/`)

A folder `tools/web/extra/<name>/` (with its own `index.html`) is copied into the site as `/extra/<name>/`, beside the
app, for a one-off page such as a review questionnaire for a contributor. The service worker ignores `extra/`, so the
page opens even on a phone that has the app installed. Give the folder an unguessable name and `noindex` in the page;
the repository is public, so the page is too. Delete the folder when the page has done its job.

## Language

The web app's own texts (not the hymns) come in English, Traditional Chinese, Simplified Chinese and Spanish,
like the Android app: Settings → Language → App language (*Phone's language* by default). The texts are in
`src/strings.js` (English text → translation; a text without one shows in English), written with `tr()`, `tn()` (counts)
and `trh()` (text with elements) from `src/i18n.js`; the fixed texts of `index.html` carry `data-tr` attributes.
The names of the books and a new person's first book are read by `build.py` from the Android strings
(`app/src/main/res/values-*/strings.xml`), so adding a language there needs a language in `i18n.js` and `strings.js` too.
A new text: use `tr('English text')` and add its four translations to `strings.js`.

## Both hands

A hymn's sheet is a lead sheet: the melody, the words, the chords. **Both hands** (or `B`) on the piano sheet makes a
piano part of it: a second staff with a left hand made from the chords, and, if chosen, notes of the chord under the
melody. Nothing of it is in the sheet files: it is worked out for the sheet as it is shown, so it follows the key
(transposing) and this device's chord edits, and every hymn that has chords has it.

Turning Both hands on opens a panel at the bottom of the screen that chooses how the hands play. **Done** tucks it
down to a slim bar that names the style ("Both hands · Bass + chord · In eighths · Pedal"); a tap on the bar, or a
drag up, opens it again, and a drag down on the open panel's top tucks it away. There is no toolbar button for it: the bar
is there whenever Both hands is on (not while editing chords, on the guitar sheet or with the staff hidden), and the next
hymn starts with it tucked down. Its rows:

- **Left hand**: none, **Strike**, **Bass + chord** or **Arpeggio**; then its **Pattern** (Strike: two notes, three
  notes, open, or the hymn style: root and fifth where the chord starts, third and fifth higher up in the bars it lasts;
  Bass + chord, by the time signature: root and fifth, bass and chords, slow, in eighths, a waltz ...; Arpeggio: open,
  wide, broken chord, Alberti, rise and hold), its **Rhythm** where it has more than one (Strike: held, twice a bar or
  every beat; Arpeggio: quarters, eighths or sixteenths), the **Octave** (Lower or Higher) and **Pedal**.
- **Right hand**: the melody alone, or two or three notes, and **When**: where a chord starts, on the beat, on long
  notes or on every note.

The choice is the device's, for every hymn (Both hands stays on from hymn to hymn, like the zoom); **Only this hymn**
keeps a choice for one hymn alone. A style is kept by its name, not its notes, so the same arpeggio fits 4/4, 3/4 and 6/8.

The rules are the lead sheet editor's (`tools/lead-sheet-editor/music.js`, which `build.py` copies into the app; its
README says what a pattern is): the upbeat bar stays empty, a pattern starts again with every chord and every bar, the
left hand moves on the beat and stays under the right hand, the last bar is one held chord. `src/piano.js` reads the
bars, the chords and the melody of a sheet and writes the second staff and the added notes into the MEI before Verovio
draws it. It is not there on the guitar sheet, with the staff hidden, or on a chords-only sheet.

## Play sheet

The hymn page's **Play** button (▶ in the header, or `Space`; `M` plays the sheet) plays the sheet while the sheet is
shown (the Sheet music tab, or beside the lyrics on a wide screen) and the tune with the lyrics alone, so there is one
Play button, and it plays what is in front of you; the sheet alone (⤢) has a ▶ of its own in its toolbar. It plays the
sheet as it is shown: in its key (transposing), with this
device's chord edits, and, with Both hands on, the piano part, else the melody with the chords softly under it. The notes
that sound light up and the page follows them; a tap on a note, or on a bar, plays from there. A row under the toolbar has
Play / Stop, back to the start, the speed (½ to 1¼), Loop, the melody and the accompaniment on or off, Follow, and
**Save MIDI** (the sheet as a MIDI file: the melody, and the left hand on a track of its own). A change while it plays
(the key, a chord, a style) goes on from the same place with the new notes.

The notes are not read from a MIDI file or from Verovio but made from the sheet by `piano.js` (`scoreOf`), the same data that
draws the second staff, so what is heard is what is drawn: tied notes are one note, the pedal makes a left hand note ring, and
repeats and endings are played out (the first ending is left out the second time). The tempo is the one of the hymn's tune
file (the sheets have none), folded into 50 to 160 where a file counts the beat as an eighth. The sound is the Play button's
small Web Audio piano (`player.js`, `playScore`); starting the sheet stops the tune and the other way round.

## Chord edits

On a piano sheet, **Edit chords** (or `E`): tap a bar, pick a beat (half beats too), then take a chord of the key
(the buttons numbered 1 to 7, or those keys; a green line under one says it holds the melody from that beat to the
bar's next chord), build one from the buttons, or type it. With Both hands on, the left hand follows as the chords change.
Changed chords are red; **Original chords** (`O`) hides them. Edits are stored in the original key, so transposing,
the guitar sheet and the chords-over-lyrics view use them.

They are kept **on the device** (IndexedDB), per sheet. Settings → Chord edits exports them as a file
(`hymns-chord-edits-<date>.json`) and imports such a file on another device (a sheet edited later on this device is
kept). The Android app exports and imports the same file (Settings → Chord Edits; it edits on tablets and unfolded
phones), so edits move between the two. The same file is what gets sent in so the chords can go into the sheets for everyone:

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
node tools/web/tests/e2e.cjs                 # 63 checks in Chromium: search, hymns, sheets, tunes, Android behaviour, offline, phone
node tools/web/tests/e2e.cjs --sheets 300    # also renders 300 random sheets in four modes each (--sheets all: every one)
node tools/web/tests/edit.cjs                # 12 checks of the chord editor, saving, export and import
node tools/web/tests/piano.cjs               # Both hands and Play sheet: 13 checks of the buttons, the panel and the player, then every 12th sheet in five styles, also what plays and its MIDI file (--all: every sheet)
node tools/web/tests/scripture.cjs          # 10 checks of the Bible references as links (src/scripture.js), also on every reference in the database
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
| `src/piano.js`, `src/pianopanel.js` | Both hands: the piano part written into a sheet's MEI, and the notes to play (`scoreOf`, `playOrder`); the panel at the bottom that chooses how the hands play. The rules are `music.js`, copied by `build.py` from `tools/lead-sheet-editor/` |
| `src/sheetplayer.js` | Play sheet: the row of controls, lighting up the notes, tap to play from there |
| `src/files.js` | fetching and unpacking the gzipped data files |
| `src/groups.js` | the hymnals; `build.py` fills them in from `HymnGroup.java` |
| `src/sw.js`, `src/manifest.webmanifest` | service worker (offline) and install manifest; `build.py` writes the file lists in |
| `vendor/` | sql.js 1.13.0 (SQLite in WebAssembly, MIT licence); qrcode.js 1.4.4 (QR Code Generator for JavaScript by Kazuhiko Arase, MIT licence; draws the QR code of Settings → Share the app); Noto Nastaliq Urdu 4.000 (SIL Open Font License), the font of Urdu text (`:lang(ur)` in `app.css`) |
| `build.py`, `serve.py` | the build, and a local server that serves `dist/` the way GitHub Pages does |
| `dist/` | build output, not in git |

