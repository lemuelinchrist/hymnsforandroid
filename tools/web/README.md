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

Installed apps pick up a new version the next time they are opened with a network: when a new build activates while open,
it offers a sticky "Reload" toast (reloading automatically only when the app is hidden and idle).

## Install on iPhone / iPad

Open the site in Safari, tap **Share**, then **Add to Home Screen**. The app opens full screen, keeps the hymns on
the device and works without internet. The home page and every hymn page show this hint (a link from a video opens a hymn, not the home page) until the app is
installed or the hint is closed; on Android/Chrome it has an Install button.

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

## The sheet toolbar

In front, what is used most: **Piano | Guitar**, **Chords only** (hides the staff: chords over the words, for
guitarists and for those who read only chords), the key (**−** and **+**), **Both hands**, the zoom, and **⤢ Sheet only, for a music stand** (the
sheet alone has ✕ back to the lyrics there). The rest is in **⋯**: **Edit chords** (for players who reharmonize; `E`),
**Original chords** once the sheet has edits (a dot on ⋯ while it is on; `O`), **Original key and size** after a change,
**Chords only** (piano sheet; the guitar sheet has it as a button), **Simplify chords** (guitar sheet; the piano sheet has a Simplify button instead; Original, Medium or Easy, with a dot on ⋯ while it is on), **Light paper** in the dark theme, **Print** and **Save MIDI**. **Print** prints the sheet alone as it is shown (the key, Chords only, Both hands, edited
chords), black on white: `sheet.js` lays the music out a page wide in page-high pieces that fit A4 and Letter, so no
line of music is cut between pages (it does so for the browser's own printing too), and `sheet.css` leaves the rest of
the page out (`html.print-sheet`). The hymn page has no print button of its own (the browser's Print still gives the
lyrics, then the sheet). The menu is the Share menu's (`popupMenu` in `app.js`).
The bar is always one row: when the pane is too narrow it gives up a little at a time (`fit()` in `sheetpanel.js`, the steps in
`sheet.css` as `data-fit`), in this order: the zoom buttons (**Smaller** and **Bigger** go into **⋯**; two fingers on the sheet
change its size on every touch screen, in the web app too), the words of Piano | Guitar (icons), **Both hands** (into **⋯**),
the widest buttons and the words of Chords only (just "Chords"), and last **Chords only** itself (into **⋯**); only below that
does it wrap.

## Both hands

A hymn's sheet is a lead sheet: the melody, the words, the chords. **Both hands** (or `B`) on the piano sheet makes a
piano part of it: a second staff with a left hand made from the chords, and, if chosen, notes of the chord under the
melody. Nothing of it is in the sheet files: it is worked out for the sheet as it is shown, so it follows the key
(transposing) and this device's chord edits, and every hymn that has chords has it.

Turning Both hands on or pressing Play on the sheet opens one **Unified Bottom Dock** (`pianopanel.js` `createSheetDock`, `.ud-dock.sheet-dock`, shared with Android's sheet viewer — matching the Jukebox layout 1:1). It floats at the bottom with a 3 px top progress line, a slim 1-row bar (circular Play/Stop, From-start `|◀`, active style + `♩ = <bpm>` / bar summary, Loop icon toggle, Expand/Collapse chevron, and Close `✕`), and an expandable drawer (tapped or dragged up/down; hidden while editing chords or on chords-only sheets) with the segmented category tabs (`Hymn's own` | `Piano` | `Guitar` | `Melody`) on the piano sheet, organized horizontal style pills (with attached `↻` shuffle side-buttons on phrase-shuffled styles), Chorale `More walking` switch, Tempo slider, and Right hand (`RH: 1 note` | `RH: 2 notes`). The web Lyrics tab's Jukebox (`app.js` `jukeboxCard`, `.ud-dock.jukebox-dock`) uses the exact same floating bottom dock.

On the **guitar sheet**, there is no Both hands switch: the sheet always plays strummed or picked on the sampled steel-string guitar (melody included), honoring slash basses above the guitar sheet's capo even though slash basses are hidden on screen. Its bottom dock shows the four guitar styles (**Folk strum** `↻`, **Ballad** `↻`, **Country**, **Fingerpicking** `↻`), **Tone** (`Bright`, `Warm` default, `Mellow`, `Soft`), and **Tempo**.

Every style choice is stored per hymn (`handsByHymn` / `strumByHymn`; legacy device-wide and Advanced keys are cleared on load by `forgetOldChoices()`), falling back to the sheet's `<identifier type="hands">` if present or the defaults (`Flowing` on piano, `Folk strum · Warm` on guitar).

For the full technical specification of all Piano & Guitar accompaniment styles, pattern tokens, phrase-shuffled mood engines (`Flowing`, `Lively`, `Fingerpicking`, `Folk strum`, `Ballad`), guitar capo/slash-bass voicings, dynamics, tempo-aware pacing, and audio synthesis, see **[`docs/ACCOMPANIMENT_STYLES.md`](../../docs/ACCOMPANIMENT_STYLES.md)**. The rules live in `tools/lead-sheet-editor/music.js` (copied into the web app by `build.py`) and are applied to MEI sheets by `src/piano.js`.

## Play sheet

**Sound load on tablets.** Playing chopped on an Honor Pad 10 (an Android WebView) a little way into a song, worst with the
guitar strums. Two things were cut: in the Android WebViews (`; wv)` in the user agent) the room reverb (a convolver, about
a quarter of the audio work) is not made; and a guitar voice has only its own low-pass, because the body and treble-cut
filters, the same for every string of a tone, sit once on a shared bus (`guitarBus` in `player.js`; before, a six-string
strum ran 18 filters). The hidden jukebox player works out only the bar (`barsOnly`, at most every 120 ms), and the lit
notes are found from a binary search, not from the first event. Every 10 s while it plays, the Android WebViews log one
line `audio-stats {...}` (the audio clock against the wall clock, latency, heap, the slowest frame), which the app copies
to logcat as tag `HymnsAudio`.

The hymn page's **Play** button (▶ in the header, or `Space`; `M` plays the sheet) plays the sheet while the sheet is
shown (the Sheet music tab, or beside the lyrics on a wide screen) and the tune with the lyrics alone, so there is one
Play button, and it plays what is in front of you; the sheet alone (Sheet only) has a ▶ of its own in its toolbar. It plays the
sheet as it is shown: in its key (transposing), with this
device's chord edits, and the piano style chosen in the dock (the melody with the chords softly under it when the dock's **Melody** is chosen). Both hands only shows the left hand on the sheet: the style plays with it on or off, and picking a style leaves it as it is (`melody` in the saved `sheet` choice). The notes
that sound light up, the bar that sounds is shaded, and the page follows them until the reader scrolls it by hand (the
next Play follows again); a tap on a note, or on a bar, highlights that start measure in red and plays from there (stopping and pressing Play starts from the red measure again until "From the start" or ✕ clears it, while Loop wraps back to the beginning of the sheet on subsequent passes). A row under the toolbar, there from the first
Play until its ✕, has Play / Stop, back to the start, the **tempo** (a slider showing ♩ = beats a minute, from half to one
and a half times the tune's, by twentieths; a double tap goes back to the tune's), **All | Melody | Accompaniment** (what is
heard; the accompaniment is the left hand, or the chords), and Loop. **Save MIDI** (in ⋯) saves the sheet as a MIDI file:
the melody, and the left hand on a track of its own. A change while it plays (the key, a chord, a style) goes on from the
same place with the new notes.

The notes are not read from a MIDI file or from Verovio but made from the sheet by `piano.js` (`scoreOf`), the same data that
draws the second staff, so what is heard is what is drawn: tied notes are one note, the pedal makes a left hand note ring, and
repeats and endings are played out (the first ending is left out the second time). The tempo is the sheet's `scoreDef/@midi.bpm`
(set from `\tempo`, `leadsheetData` `verseBpm`, the dominant sounding tempo of the hymn's MIDI file adjusted for 2×/½× beat-unit differences, or the lead-sheet editor), falling back to the tune's MIDI file (`parseMidi` dominant sounding tempo). The sound is the Play button's
small Web Audio piano (`player.js`, `playScore`); starting the sheet stops the tune and the other way round. A hymn with no tune file but a sheet has an enabled Play: on the lyrics it opens the Sheet tab, waits until the sheet is drawn and plays it (audio is unlocked inside the tap first); with no tempo of its own a sheet plays at 110.

## Chord edits

On a piano sheet, **Edit chords** (in ⋯, or `E`): tap a bar, pick a beat (half beats too), then take a chord of the key
(the buttons numbered 1 to 7, or those keys; a green line under one says it holds the melody from that beat to the
bar's next chord), build one from the buttons, or type it. With Both hands on, the left hand follows as the chords change.
Changed chords are red; **Original chords** (in ⋯, or `O`) hides them. Edits are stored in the original key, so transposing,
the guitar sheet and the chords-over-lyrics view use them.

They are kept **on the device** (IndexedDB), per sheet. Settings → Chord edits exports them as a file
(`hymns-chord-edits-<date>.json`) and imports such a file on another device (a sheet edited later on this device is
kept). The Android app exports and imports the same file (Settings → Chord Edits; it edits with this same editor, see
"The Android app's sheet viewer"), so edits move between the two. The same file is what gets sent in so the chords can go into the sheets for everyone:

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

On a phone the editor keeps to three lines (the bar with ‹ ›, Undo and Done; the beats; the chords of the key) and
folds the rest (the letters, ♭ ♯, the kinds of chord, the bass, typing, Original bar) under **More**, so most of the
sheet stays in view; on a big screen it is open, and either way the reader's choice is kept.

## The Android app's sheet viewer

The Android app shows sheet music with this same code, so the two cannot drift apart: `app/build.gradle` (`copyViewer`)
copies the files listed in `android/shared.txt` from `src/`, the page around them (`android/`: `index.html`,
`android.js`, `android.css`) and `music.js` into the app's `assets/viewer` at every build. The page is the sheet alone,
as `#/sheet/E8` here, with a ‹ back button first. What differs is said in two places:

- `src/host.js`: where the sheet code gets things. The web app gives it its data packs (`app.js`); the Android page
  fetches `../sheetMei/<id>.mei` and `../sheetLyrics/<id>.json` from the app's assets, keeps chord edits in the app
  (`window.HymnsEdits`, `ChordEdits.java`, so Settings exports them) and hands Save MIDI's file to the app, which asks
  where to save it, and Print's page to Android's printing (`host.print`; a WebView has no `window.print`).
- The options of `createSheetPanel` (`src/sheetpanel.js`): the back button, the ⤢ button (web only), pinching to zoom
  (Android only), the tune whose tempo the sheet plays at (Android: `res/raw/m<tune>.mid`, served by the app at `/res/raw/`).

The app opens `index.html?id=E8&variant=piano&theme=dark&accent=…&accentNight=…&lyrics=FR8&tune=m123&lang=zh-Hant`
(`SheetMusicActivity`); see `android/android.js`. A module the sheet code starts to import must be added to
`android/shared.txt`. `python3 tools/web/tests/android_serve.py` serves the page the way the app does, for a browser.

## Tests

```bash
node tools/web/tests/e2e.cjs                 # 63 checks in Chromium: search, hymns, sheets, tunes, Android behaviour, offline, phone
node tools/web/tests/e2e.cjs --sheets 300    # also renders 300 random sheets in four modes each (--sheets all: every one)
node tools/web/tests/edit.cjs                # 12 checks of the chord editor, saving, export and import
node tools/web/tests/piano.cjs               # Both hands and Play sheet: 14 checks of the buttons, the panel and the player, then every 12th sheet in five styles, also what plays and its MIDI file (--all: every sheet)
node tools/web/tests/android.cjs            # 9 checks of the Android app's sheet viewer, served as the app serves it, on a phone screen
node tools/web/tests/scripture.cjs          # 10 checks of the Bible references as links (src/scripture.js), also on every reference in the database
```

They start their own `serve.py` on a spare port and use Playwright (`npm i -g playwright && npx playwright install chromium`).

## Files

| | |
|---|---|
| `src/index.html`, `app.css` | the page (its own parts; `base.css` has the colours and themes, `sheet.css` the sheet music, both shared with the Android viewer) |
| `src/app.js` | screens and routing (hash URLs), settings, favorites, the hymnal picker |
| `src/db.js` | the database (sql.js): a hymn with its parent's fields, related hymns, search |
| `src/sheet.js` | the sheet itself (Verovio), translated words, chord edits; both apps run it |
| `src/sheetpanel.js` | the sheet with its toolbar, the ⋯ menu, the panels and the player's row; both apps run it |
| `src/host.js`, `src/ui.js` | what the sheet code gets from the app it runs in; small helpers (elements, icons, the popup menu, what the device keeps) |
| `android/` | the Android app's sheet viewer page around the shared code; `shared.txt` lists the files it takes from `src/` |
| `src/player.js` | Play: reads the app's MIDI files (`res/raw/m<tune>.mid`) and plays them (and sheets) with Web Audio using multi-sampled Salamander Grand Piano MP3s (`vendor/piano/`) and a synthesized fallback |
| `src/editor.js`, `src/edits.js` | the chord editor panel; edits on the device, export and import |
| `src/piano.js`, `src/pianopanel.js` | Both hands: the piano part written into a sheet's MEI, and the notes to play (`scoreOf`, `playOrder`); the panel at the bottom that chooses how the hands play. The rules are `music.js`, copied by `build.py` from `tools/lead-sheet-editor/` |
| `src/sheetplayer.js` | Play sheet: the row of controls, lighting up the notes, tap to play from there |
| `src/jukebox.js` | the jukebox card's styles and player (the hymn page's card under the details, `jukeboxCard` in `app.js`); the Android app's card plays through it too (`android/play.js`) |
| `src/files.js` | fetching and unpacking the gzipped data files |
| `src/groups.js` | the hymnals; `build.py` fills them in from `HymnGroup.java` |
| `src/sw.js`, `src/manifest.webmanifest` | service worker (offline) and install manifest; `build.py` writes the file lists in |

Offline: the service worker precaches only the core shell (`SHELL`) and `data/version.json` on install (plus refreshing any `LAZY` entries already cached from a previous build) so first-visit shared hymn links open from a single ~24–57 KB content-hashed pre-resolved shard (`hymns/<hash>/<group>-<bucket>.json.gz`) without waiting for the 14 MB SQLite database, `sql-wasm.wasm`, sheet modules, or `qrcode.js`. The full SQLite database downloads in the background (kept in IndexedDB; word search and Browse show inline progress if opened before it finishes), and `app.js` (`offlineDownload`) then fetches the deferred scripts (`LAZY`), all sheet/lyric packs, Verovio, and every tune (~30 MB total) in the background about 8 s after start, once per build; Settings → Offline shows it and can start it again.
| `vendor/` | sql.js 1.13.0 (SQLite in WebAssembly, MIT licence); qrcode.js 1.4.4 (QR Code Generator for JavaScript by Kazuhiko Arase, MIT licence; draws the QR code of Settings → Share the app); Noto Nastaliq Urdu 4.000 (SIL Open Font License), the font of Urdu text (`:lang(ur)` in `app.css`); `piano/` — Salamander Grand Piano (Yamaha C5, by Alexander Holm, CC-BY 3.0), 22 compact MP3 samples (`A1`–`C7`, every minor 3rd); `guitar/` — FluidR3 GM acoustic guitar (steel), by Frank Wen, CC-BY 3.0, as rendered by midi-js-soundfonts, 13 MP3s (`E2`–`E5`, every minor 3rd; `LICENSE.txt`) |
| `build.py`, `serve.py` | the build, and a local server that serves `dist/` the way GitHub Pages does |
| `dist/` | build output, not in git |


### Simpler chords

`src/simplify.js` makes the chords on the sheet simpler (only on sheets whose own style is Chorale, `view.chorale`: they are the ones with the complex chords; any other sheet has the Chords only button instead), at two levels (and Original): *medium* (light touch-ups: the same chords at the same places as plain triads or sevenths, with the slash bass, no repeats, at most three chord changes in a bar) and *easy* (a chord for the bar). It changes only
what is shown, never the sheet, the chord edits or the sound (`sheet.js` works it out on the sheet before the guitar's capo and
the piano part, and leaves the bars the user edited as they are). `node tools/web/tests/simplify.mjs E84` shows a hymn's bars
at each level, `--stats` the chords per bar over the English sheets, `--mei <level> <id>` the sheet with those chords.
