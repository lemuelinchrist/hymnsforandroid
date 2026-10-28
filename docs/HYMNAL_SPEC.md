# Hymns For Android: Functional & Data Specification

**Purpose.** This document describes Hymns For Android completely enough that someone can build an equivalent
hymnal on another platform (a PWA, a website, an iOS app, a custom Android app) without reading the Java code.
It covers the data (what is shipped, its format, its quirks), the business rules (how a hymn is assembled and
displayed, how search works, how navigation works), the screens, and the sheet-music subsystem.

- Describes the app as of **v5.6.0** (October 2026). Numbers (hymn counts, file counts) are from that build.
- **MUST / SHOULD / MAY** are used in the usual sense. MUST = needed to behave like the app. SHOULD = the app does it and
  users expect it. MAY = optional or platform-specific.
- Where the current app has a quirk or bug, §12 lists it. A rebuild should decide on each one deliberately rather than copy it by accident.
- Source of truth for anything not covered here: the code under `app/src/main/java/com/lemuelinchrist/android/hymns/`.
  Related docs: [`database_spec.md`](./database_spec.md), [`APP_ARCHITECTURE.md`](./APP_ARCHITECTURE.md),
  [`LANGUAGE_PROVISIONING_GUIDE.md`](./LANGUAGE_PROVISIONING_GUIDE.md), [`../tools/svg-to-lilypond/DESIGN.md`](../tools/svg-to-lilypond/DESIGN.md) §19.

---

## Contents

1. [Product summary](#1-product-summary)
2. [Shipped assets (what a rebuild consumes)](#2-shipped-assets-what-a-rebuild-consumes)
3. [Core concepts: Hymn ID and Hymn Group (book)](#3-core-concepts-hymn-id-and-hymn-group-book)
4. [Database: schema, conventions, quirks](#4-database-schema-conventions-quirks)
5. [Assembling a hymn (business rules)](#5-assembling-a-hymn-business-rules)
6. [Displaying a hymn (lyrics page)](#6-displaying-a-hymn-lyrics-page)
7. [Hymn actions (button bar)](#7-hymn-actions-button-bar)
8. [Navigation, history and favorites](#8-navigation-history-and-favorites)
9. [Search / Index](#9-search--index)
10. [Settings](#10-settings)
11. [Sheet music subsystem](#11-sheet-music-subsystem)
12. [Known quirks and decisions to make](#12-known-quirks-and-decisions-to-make)
13. [How the data is produced (upstream pipeline)](#13-how-the-data-is-produced-upstream-pipeline)
14. [Building a PWA / website: recommended approach](#14-building-a-pwa--website-recommended-approach)
15. [Acceptance tests](#15-acceptance-tests)

---

## 1. Product summary

A fully **offline** digital hymnal for the hymns used in the Lord's recovery, in 23 books (languages and
collections). No account, no network calls, no tracking, no permissions (see `PRIVACY_POLICY.md`).

Features:

| Feature | Summary |
|---|---|
| Lyrics reader | One hymn per page; swipe left/right to the previous/next hymn of the same book. Header with category, meter, time, key, tune code, Bible verses, author, composer. Stanza numbers and choruses in the book's colour. |
| Books (languages) | 23 books, chosen from a side drawer. Switching book opens the **same hymn in the new language** when a translation is known, otherwise hymn 1 of that book. |
| Related hymns | "OTHER LANGUAGES" grid under the subject: code and number of the same hymn in other books (`CS 305`), foldable. Tap to open. |
| Search / Index | 8 tabs: Hymn Numbers, First Lines, Favorites, Subjects, Authors, All Lyrics, History, Music (key/tune). |
| Favorites | Heart button; listed in the Favorites tab; back up / restore as a short text file (one "ID – first line" per hymn). |
| History | Recently opened hymns (newest first, up to 100). The app reopens the last hymn on start. |
| Play | Loops the hymn's melody (MIDI file looked up by tune code). |
| Sheet music | Engraved from MEI with Verovio at screen width; piano or guitar (capo + chords derived), transpose ±6, "chords over lyrics" mode, pinch to zoom, night mode. Translations can show their own lyrics under the borrowed sheet. On big screens (tablets, unfolded phones) the chords of the piano sheet can be edited, kept on the device and exported/imported (§11.5). |
| YouTube (optional) | Either opens curated piano videos for the hymn or a YouTube search. |
| Similar tune (optional) | Lists other hymns sung to the same tune, preferring the current language. |
| Copy | Copies the full lyrics as plain text. |
| Display settings | Font size (5 steps), night mode, keep screen on, hide books you don't use. |

---

## 2. Shipped assets (what a rebuild consumes)

Everything the app needs at runtime is in the repository. A rebuild does **not** need hymnal.net or any server.

| Asset | Location | Format | Count / size | Used for |
|---|---|---|---|---|
| Hymn database | `app/src/main/assets/hymns.sqlite` (built from `sqlite/hymns.sql`, see §13) | SQLite 3 | 14,127 hymns, 71,090 stanzas, 674 video links; 18 MB | everything textual |
| Book list, names, colours, order | `app/src/main/java/.../HymnGroup.java` | Java enum (also parsed by `tools/ios/build.py`) | 23 books | drawer, colours, ID parsing |
| Book icons | `app/src/main/res/drawable-xhdpi/<code>.png` (lowercase code: `e.png`, `cs.png` …) | PNG, 364×364 | 23 | drawer, search list rows |
| Melodies | `app/src/main/res/raw/m<tune>.mid` | Standard MIDI | 2,462 files; 19 MB | Play button |
| Sheet music | `app/src/main/assets/sheetMei/<hymnId>.mei` | MEI 5.0 XML | 3,345 (E 1362, NS 1227, CS 291, CH 243, C 124, BF 98); 45 MB | sheet viewer |
| Translated sheet lyrics | `app/src/main/assets/sheetLyrics/<hymnId>.json` | JSON (§11.6) | 2,369 (Z 755, C 632, ZS 460, FR 224, CS 194, FY 104); 9.3 MB | sheet viewer overlay |
| Sheet viewer (web) | `app/src/main/assets/viewer/` (`index.html`, `viewer.js`, `editor.js`, `viewer.css`, `verovio-toolkit-wasm.js`) | HTML/JS; Verovio 6.3.0 (LGPL-3.0) | 7.3 MB | **reusable as-is in a web build** |
| Lyrics-only web app | `tools/ios/template.html` + `tools/ios/build.py` | single HTML file with gzipped JSON payload | ~6.5 MB | starting point for a PWA (§14.2) |
| UI icons | `app/src/main/res/drawable*/` | Material icons (vector/PNG) | — | buttons |

---

## 3. Core concepts: Hymn ID and Hymn Group (book)

### 3.1 Hymn ID

A string `<GROUP><NUMBER>`, e.g. `E1`, `C215`, `NS10012`, `SW36`. It is the primary key everywhere (database,
favorites, history, file names of `.mei` and `.json`).

Parsing rule (MUST match `HymnGroup.getHymnGroupFromID` / `getHymnNoFromID`):

- If the **second character is a letter**, the group is the first two characters (upper-cased); the number is the rest.
- Otherwise the group is the first character; the number is the rest.
- No group code is longer than two letters. An ID whose group is unknown is invalid (skip it silently in lists).

The number part is a string. It is numeric for every hymn today, but compare and sort it as `CAST(no AS decimal)`.
Numbers are **not** contiguous: `SW` uses printed page numbers (gaps), `TA` and `UR` use the English numbers (gaps), `NS` has a block from 10002 (Long Beach songs:
LB12 = `NS10012`), `T` goes up to 30017, `G` to 10002, `SK` to 3049.

The **default hymn** is `E1`.

### 3.2 Hymn Groups (books)

Order below is the **display order** (drawer, settings, iOS book picker). Colours: *day* = Material 500, used for the
toolbar, stanza numbers, chorus text and the button bar; *night* = Material 200, used for stanza numbers/chorus in
night mode and for the related-hymn dots.

| # | Code | Display name | Day colour | Night colour | Text align | "Big" book¹ | Hymns |
|---|---|---|---|---|---|---|---|
| 1 | `E` | English | `#3D577A` | `#B0BEC5` | left | yes | 1362 |
| 2 | `C` | 中文-繁 | `#669900` | `#A5D6A7` | left | yes | 786 |
| 3 | `CS` | 補充本-繁 | `#9933CC` | `#CE93D8` | left | yes | 513 |
| 4 | `Z` | 中文-简 | `#669900` | `#A5D6A7` | left | yes | 786 |
| 5 | `ZS` | 補充本-简 | `#9933CC` | `#CE93D8` | left | yes | 513 |
| 6 | `CB` | Cebuano | `#FF8800` | `#FFCC80` | left | yes | 584 |
| 7 | `T` | Tagalog | `#009688` | `#80CBC4` | left | yes | 1176 |
| 8 | `FR` | French | `#E91E63` | `#F48FB1` | left | yes | 248 |
| 9 | `FY` | French Youth | `#E91E63` | `#F48FB1` | left | yes | 176 |
| 10 | `S` | Spanish | `#3F51B5` | `#9FA8DA` | left | yes | 910 |
| 11 | `SY` | Spanish Youth | `#3F51B5` | `#9FA8DA` | left | yes | 426 |
| 12 | `K` | Korean | `#795548` | `#BCAAA4` | left | yes | 1144 |
| 13 | `G` | German | `#FF5722` | `#FFAB91` | left | yes | 482 |
| 14 | `GY` | German Youth | `#FF5722` | `#FFAB91` | left | yes | 271 |
| 15 | `J` | Japanese | `#8BC34A` | `#AED581` | left | yes | 780 |
| 16 | `I` | B.Indonesia | `#F44336` | `#E57373` | left | yes | 1133 |
| 17 | `BF` | Be Filled | `#0099CC` | `#90CAF9` | left | **no** | 438 |
| 18 | `NS` | New Songs | `#CC0000` | `#EF9A9A` | left | **no** | 1245 |
| 19 | `CH` | Children | `#AFB42B` | `#E6EE9C` | left | **no** | 243 |
| 20 | `F` | Farsi | `#673AB7` | `#9575CD` | **right** (RTL) | yes | 329 |
| 21 | `SK` | Slovak | `#9C27B0` | `#BA68C8` | left | yes | 360 |
| 22 | `GK` | Greek | `#03A9F4` | `#4FC3F7` | left | yes | 124 |
| 23 | `SW` | Kiswahili | `#00838F` | `#4DD0E1` | left | yes | 98 |
| 24 | `R` | Russian | `#1565C0` | `#64B5F6` | left | yes | 800 |
| 25 | `MY` | Burmese | `#2E7D32` | `#66BB6A` | left | yes | 706 |
| 26 | `TA` | Tamil | `#546E7A` | `#90A4AE` | left | yes | 305 |
| 27 | `UR` | Urdu | `#880E4F` | `#F06292` | **right** (RTL) | yes | 446 |

¹ "Big" = a language hymnal (as opposed to the BF/NS/CH song collections). Used only by Similar Tune (§7.5).

Youth books share their language's colours by design. `I` (Indonesian) is **disabled by default** (§10).

A rebuild SHOULD keep this table as data (JSON) rather than code, so a new language is a data change. Adding a
language today = new rows in the DB + an enum entry + an icon (see `LANGUAGE_PROVISIONING_GUIDE.md`).

---

## 4. Database: schema, conventions, quirks

### 4.1 Tables

```sql
CREATE TABLE "hymns" (
  "_id" VARCHAR NOT NULL PRIMARY KEY,   -- Hymn ID, e.g. 'E1'
  "author" VARCHAR, "composer" VARCHAR,
  "first_chorus_line" VARCHAR, "first_stanza_line" VARCHAR,
  "hymn_group" VARCHAR,                 -- 'E', 'C', ...
  "key" VARCHAR, "main_category" VARCHAR, "meter" VARCHAR,
  "no" VARCHAR,                         -- number within the book, as text
  "sub_category" VARCHAR, "time" VARCHAR,
  "tune" TEXT,                          -- melody code, also the MIDI file name
  "parent_hymn" TEXT,                   -- Hymn ID this one inherits from (translation -> original)
  "verse" TEXT,                         -- Bible references, comma separated
  "related" TEXT                        -- comma-separated Hymn IDs (same hymn in other books)
);
CREATE TABLE "stanza" (
  "parent_hymn" TEXT NOT NULL,          -- Hymn ID the stanza belongs to (NOT the parent hymn concept)
  "no" TEXT NOT NULL,                   -- '1','2',..., 'chorus', 'note', ... (see 4.3)
  "text" TEXT,                          -- HTML-ish text, lines separated by <br/>
  "note" TEXT,                          -- optional performance note, e.g. 'Sisters sing'
  "id" INTEGER NOT NULL PRIMARY KEY,
  "n_order" INTEGER                     -- display order within the hymn
);
CREATE TABLE "tune" (                   -- curated YouTube videos (name is historical)
  _id VARCHAR,                          -- a HYMN ID (not a tune code), e.g. 'E8'
  comment VARCHAR,                      -- label shown to the user: '1st tune', 'Alt tune: 295', 'New tune' ...
  youtube_link TEXT                     -- YouTube video id, e.g. 'DL6lgn78DcU'
);
CREATE INDEX stanza_parent_hymn ON stanza (parent_hymn, n_order);
CREATE INDEX hymns_first_lines ON hymns (first_stanza_line, first_chorus_line);
CREATE VIEW "hymns_stanza" AS SELECT * FROM hymns INNER JOIN stanza ON hymns._id = stanza.parent_hymn;
-- SEQUENCE (SEQ_NAME, SEQ_COUNT): JPA bookkeeping of the provisioner; ignore.
```

### 4.2 Field conventions

| Field | Convention / example |
|---|---|
| `first_stanza_line` | First line of stanza 1, used as the hymn's **title** in every list. May be empty for chorus-only songs (then use `first_chorus_line`; 1 hymn, `NS802`, has neither). |
| `first_chorus_line` | First chorus line; English data has it in capitals (`ONCE FOR ALL-OH, SINNER, RECEIVE IT;`). |
| `main_category` / `sub_category` | Subject, e.g. `Blessing of the Trinity` / `His Plan`; Chinese `頌讚三一神` / `祂的計畫`. |
| `meter` | `8.5.8.3.` (English) or `8583` (Chinese), or `Peculiar Meter.` |
| `time` | `4/4`. Chinese hymns often put key+time in `key` (`降A大調4/4`) and leave `time` empty. |
| `key` | `Ab Major`, `F Minor` (English); localized in other books. |
| `tune` | Melody code made of scale-degree digits, e.g. `5553216153222`. One code has a letter (`5543321666665b`). **May have leading/trailing spaces: trim it.** `0` or empty = no tune. |
| `author`, `composer` | Free text, in hymnal.net's form where the hymn is on hymnal.net: full name and years, `Adapted from …`, `Translated by …`, several people separated by `; ` (e.g. `Gerhard Tersteegen (1697-1769); Translated by Emma Frances Shuttleworth Bevan (1827-1909)`). Empty/NULL = unknown. (Until v5.7 the printed hymnal's marks `*` = Witness Lee and `+` = Watchman Nee were stored as is.) |
| `verse` | `Genesis 12-50,` (often with a trailing comma). 781 hymns have it. |
| `related` | `SW36,GK89,K1,J1,...,` — **may have a trailing comma and empty entries; may contain IDs of hymns that don't exist** (filter them). Reciprocity is intended but not guaranteed. |
| `parent_hymn` | Usually the English (or NS/BF) original of a translation. One-way pointer. |
| Empty vs NULL | Both occur for "no value". Treat `NULL` and `''` the same everywhere. |

### 4.3 Stanza `no` values and their meaning

| `no` value | Count | Meaning / rendering |
|---|---|---|
| `1`, `2`, … `26` | ~64,000 | numbered stanza; label = the number |
| `4a`, `4b`, `6a`, `-`, `verse`, `chorusverse`, `copyright` | few | stanza with that literal label |
| `chorus` | 8,135 | chorus (exact match, lower-case). A hymn may have several (e.g. brothers/sisters alternate, E1118). |
| contains `note` (`note`, `beginning-note`, `end-note`) | 311 | an editorial note: full-width, italic, red |
| contains `youtube` / `soundcloud` (case-insensitive; `YouTube Link`, `SoundCloud Link`) | 289 | `text` is a URL; render as a tappable link |

### 4.4 Stanza `text` markup

- Lines are separated by `<br/>`; text usually ends with a trailing `<br/>`.
- May contain `<i>`, `<u>`, `<b>` and HTML entities. Treat it as a tiny HTML subset; when displaying on the web,
  **sanitize** (allow only `br`, `i`, `u`, `b`) rather than injecting raw HTML.
- `note` column (stanza-level, not the `note` stanza type): a cue like `Sisters sing`, shown before a chorus as `(Sisters sing)`.

---

## 5. Assembling a hymn (business rules)

### 5.1 Loading a hymn (MUST)

`get(hymnId)`:

1. Read the `hymns` row; trim `tune`.
2. Read its stanzas: `SELECT * FROM stanza WHERE parent_hymn = :id ORDER BY n_order`.
3. `isNewTune = (group == 'BF' && tune is not empty)` — shown as "(New Tune)" in the header.
4. If `parent_hymn` is set, load the parent **recursively with the same rules** and fill every *empty* child field
   from it:

   | Child field empty? | Take from parent |
   |---|---|
   | author, composer, time, tune, key, meter, verse | same field |
   | main_category | **both** main_category and sub_category |
   | stanzas (none at all) | the parent's stanzas (33 hymns rely on this) |
   | sheet music | — (resolved separately, §11.1) |

   The child's own `no`, `first_stanza_line`, `first_chorus_line`, `hymn_group` are never inherited.
5. Related set (§5.2).

### 5.2 Related hymns (MUST)

```
related(h) = split(h.related, ',')
           ∪ split(parent.related, ',')     -- if h has a parent
           ∪ { h.parent_hymn }              -- if set
           − { h._id, '' }
```

Then, for display, drop IDs whose group is unknown or **disabled** in settings (§10), and (SHOULD) drop IDs that
don't exist in the DB. The app stores the set unordered; a rebuild SHOULD order chips by the book order of §3.2.

`relatedIn(h, group)` = the first ID in `related(h)` whose group is `group`, else none.

### 5.3 Book contents and order

The hymns of a book, in reading/swipe order: `SELECT no FROM hymns WHERE hymn_group = :g ORDER BY CAST(no AS decimal)`.

---

## 6. Displaying a hymn (lyrics page)

### 6.1 Page structure (top to bottom)

1. **Toolbar** (app bar): hamburger (opens book drawer), title = the **Hymn ID** (e.g. `E1`), Search icon, Settings icon.
   Background = the book's day colour (black in night mode). Hides when scrolling down, reappears when scrolling up
   and whenever a new hymn is opened.
2. **Header card** (always shown: it holds the buttons):
   - Subject line, centred (omitted when empty): **main_category** (bold), newline, sub_category, newline `(New Tune)`
     if `isNewTune`.
   - **Other languages** (since v5.7; omitted when the hymn has no related hymn in an enabled book), so a brother can
     call the hymn in several languages without scrolling:
     - A row: `OTHER LANGUAGES` (12sp, bold, letter-spaced, muted), the count in a small rounded badge, and at the right
       `Hide ▴` / `Show ▾` in the book's colour (night colour in night mode). Tapping the row folds or unfolds the grid.
     - A grid of the related hymns: book **code** (muted, ~0.82× the number's size, one fixed width so the numbers line
       up) and **number** (bold), e.g. `CS 305`. No border, no colour dot. Order: the books' drawer order (the
       `HymnGroup` order), then the number. Columns: as many as fit (4 on most phones at the default size;
       2 to 8). Number size = font size − 4sp (at least 12sp). Tap = open that hymn *and remember where we came from* (§8.2).
     - Folded or not is **one setting for every hymn** (`otherLanguagesFolded`, default false = open), kept across
       restarts; pages already built next to the current one follow it at once.
   - **Button bar**: a pill (corner radius 25dp) filled with the book's day colour holding white icons:
     Favorite ♡/♥, Play ▶/❚❚, Sheet music, YouTube (conditional), Similar tune (conditional), Copy. See §7.
3. **Lyrics card** (§6.2).
4. **Details card** (hidden when none of these has a value): label `DETAILS` (12sp, bold, letter-spaced, muted), then
   a two-column table at font size − 2sp, one row per item, omitted when empty, in this order: label (muted) | value
   (wraps in its own column, selectable): `Meter` · `Time` (with the key when both exist: `4/4 · Ab Major`), or `Key`
   when there is only a key · `Tune` (omit when `0`) · `Verses` · `Author` · `Composer`.
   (Until v5.6 these were in the header card and the related hymns were pills with book names at the bottom: the
   numbers moved up because brothers call hymns in several languages during meetings.)

Cards: 10dp side margins, 5dp radius, light elevation. Page background white (day) / black (night).

### 6.2 Lyrics rendering algorithm (MUST)

Inputs: the assembled hymn, the book (for colour and alignment), font size, theme.

```
chorusText = ''
for stanza in stanzas (ordered by n_order):
    if stanza.no == 'chorus':
        block = (note ? italic('(' + note + ')') coloured : '')
              + (book is RTL ? chorus text coloured, not italic : italic(chorus text) coloured)
        emit(block)
        chorusText = that chorus block            # last chorus seen
    elif 'note' in stanza.no:
        emit_full_width(italic(text) in red #D32F2F)
    elif 'youtube' or 'soundcloud' in lower(stanza.no):
        emit(link(text.trim()))                  # opens externally
    else:
        emit(bold(stanza.no) coloured + newline + text)
        if hymn has exactly ONE 'chorus' stanza and chorusText != '':
            emit(chorusText)                     # repeat the chorus after each later stanza
```

Consequences worth testing:

- A single chorus is shown where it sits *and* repeated after every following stanza. Stanzas before the chorus's
  position don't get it (usually only stanza 1, which the chorus follows directly anyway).
- With 2+ chorus stanzas (E1118: brothers/sisters), each is shown only where it sits; nothing is repeated.
- "Coloured" = book day colour (light theme) or night colour (dark theme). Body text is `#4E4E4E` on white (day) or
  `#CCCCCC` on black (night).
- Text alignment: left, except right for RTL books (`F`).
- Font size = the setting (14/18/22/26/32 sp; default 18), applied to header and lyrics.
- Lyrics text is selectable.

**Columns.** In portrait each emitted block is one row. In landscape or on screens ≥720dp wide, blocks fill a
**two-column grid** left-to-right (stanza 1 | chorus, stanza 2 | chorus, …); full-width blocks (notes) close the
current row and take a row of their own. A web build SHOULD use CSS grid/columns at a similar breakpoint.

### 6.3 Themes

| | Light (default) | Dark ("Night mode") |
|---|---|---|
| Toolbar | book day colour | black |
| Page / lyric background | white | black |
| Lyric text | `#4E4E4E` | `#CCCCCC` |
| Stanza numbers, chorus | book day colour | book night colour |
| Status bar | translucent black `#44000000` over content | same |

---

## 7. Hymn actions (button bar)

Every action also logs the hymn to History (§8.3).

### 7.1 Favorite

Toggle. Filled heart when the hymn is in Favorites. Stored as in §8.4.

### 7.2 Play melody

- File: `res/raw/m<tune lower-cased>.mid` (e.g. tune `5553216153222` → `m5553216153222.mid`). 8,325 of the 8,353
  hymns with a tune have a file. Translations get the tune from their parent (§5.1), so they play too.
- Plays **looped** until stopped. Only one hymn plays at a time. Playback stops when the page changes, the app is
  paused, or the button is tapped again. Icon toggles ▶ / ❚❚.
- No tune, tune `0`, or no file → toast "Sorry! hymn not available".

### 7.3 Sheet music

Resolve the sheet (§11.1). If none → toast "Sorry! sheet music not available". Otherwise open the viewer with
`id=<sheet hymn id>` and `lyrics=<this hymn id>`.

### 7.4 YouTube (optional; Settings → YouTube Button)

| Setting | Button visible | Tap |
|---|---|---|
| `disabled` (default) | no | — |
| `piano` | only if the hymn has videos | Videos = `tune` rows where `_id` = this hymn's ID, else rows of its parent's ID. URL `https://www.youtube.com/embed/<youtube_link>`. One video → open it; several → dialog "Choose tune to play" listing the `comment`s. |
| `search` | yes | Open `https://www.youtube.com/results?search_query=` + the query below, with the characters `+ . ; ! " ' : ,` removed and spaces as `+`. |

The search query:

| Book | Query | Example |
|---|---|---|
| `E` | `Hymn <no> <first_stanza_line>` | `Hymn 313 Christ the Rock the Rock eternal` |
| `NS` | `NS <no> <first_stanza_line>` | `NS 46 …` |
| every other book | `<first_stanza_line> <first_chorus_line>` | |

Why the number: recordings of English hymns and New Songs are usually titled with it ("Hymn 313", "NS 46"), and
other churches' hymnals number their hymns differently, so the number finds this hymnal's recordings first. With the
lines alone, a hymn with a common first line often brought up other churches' songs first. Adding a group name to the
query was tried and dropped: when a song has no recording it brings up unrelated videos instead. The other books keep
the lines until their recordings' titles are checked.

The button is also hidden when the hymn has no tune.

### 7.5 Similar tune (optional; Settings → Similar Tune Button, default off)

Hidden when the setting is off or the hymn has no tune. On tap:

1. Candidates = hymns in enabled books that have a non-empty key **and** tune, matching the tune with the Music-tab
   filter (§9.3) using the tune code as the filter text — in practice `tune LIKE '<tune>%'` (same tune or a longer
   tune starting with it), ordered by tune.
2. For each candidate (fully assembled, §5.1):
   - if its book is not "big" (BF/NS/CH) **or** it is in the current hymn's book → keep it;
   - else if it has a related hymn in the current hymn's book → keep that related hymn instead;
   - else keep the candidate itself (fallback).
   De-duplicate by Hymn ID; remove the current hymn.
3. If the result has more than one entry → dialog "Go to hymn with similar tune" listing `<ID> - <first stanza line>`;
   tap opens it. Otherwise toast "Sorry! No Hymn with similar tune available". (See §12 #6 about the threshold.)

### 7.6 Copy

Copies plain text to the clipboard, then toast "Hymn text copied to Clipboard!":

```
<HymnID>\n\n
for each stanza: <no>\n<text with '<br/>' replaced by '\n'>\n
```

(Other tags are left as-is; a rebuild SHOULD strip all tags.)

---

## 8. Navigation, history and favorites

### 8.1 Reading flow

- The main screen is a horizontal pager over the hymns of **one book** in the order of §5.3. Swiping moves within
  the book; the toolbar title and colours follow the visible hymn.
- Opening a hymn from anywhere (search, related chip, drawer, back) switches the pager to that hymn's book if
  needed, jumps to it, scrolls it to the top and shows the toolbar.
- If the target hymn does not exist (stale history/favorite, or a typed number not in the book): go to the first
  hymn of its book and **remove the ID from History and Favorites**. If the book is unknown, show `E1`.
- On start: open the most recent History entry, else `E1`.

### 8.2 Back stack (MUST)

A stack of Hymn IDs, seeded with the hymn the session starts on.

- "Open and remember" (used by: search result, related chip, book drawer when a translation exists):
  push the *current* hymn, then push the *target*, then show the target. A push is ignored if it equals the top.
- Plain "open" (used by: similar-tune dialog, drawer when no translation exists): just show; the stack is unchanged.
- Swiping does not touch the stack.
- **Back**: if the drawer is open → close it. Else if the stack has more than one entry → pop the top and show the
  new top. Else → leave the app (web: do nothing / let the browser go back).

A web build SHOULD map this onto browser history (`#/E1` style URLs) so the browser Back button behaves the same.

### 8.3 History

- Records: `{hymnId, hymnGroup, firstLine, timestamp}`, one per hymn ID (re-logging updates the timestamp).
  `firstLine` = first stanza line, or first chorus line if empty.
- When a hymn is logged:
  - any button on its page is tapped (§7), or
  - its page becomes visible **and** the hymn is in the back stack (i.e. was opened deliberately, not just swiped past),
    except `E1`.
- Listed newest first, capped at 100 entries.

### 8.4 Favorites

- Same record shape as History. Toggled by the heart button. Listed newest-first (by time favorited), all of them
  (History stops at 100). The top of the Favorites tab shows "N favorites" (or "No favorites yet. Tap ♥ on a hymn to
  add it.") with **Back up** and **Restore**; Settings → "Back Up & Restore Favorites" opens a dialog with both.
- **Back up** text (also the file `hymns-favorites.txt`), newest first:
  ```
  My favorite hymns (Hymns For Android): 3 hymns

  To put them back: open this file with the Hymns app,
  or copy all of this text, then in the app tap Search,
  then Favorites > Restore > Paste copied text.

  E1 – Glory be to God the Father,
  C215 – ...
  ```
  Back up offers "Send (email, chat, Drive…)" (system share sheet with the file attached and the text as the body) or
  "Save as a file on this phone" (system file picker).
- **Restore**: "Open a backup file" (file picker), "Paste copied text" (clipboard), or tapping the file in another app
  (the app handles `VIEW` of `text/plain`). Reading the text: on each line, skip leading non-letters/digits (e.g. an
  email's `> `) and take the first word; a line of only letters, digits, commas and spaces is the old export format
  (`E1,C215,NS10012,`) and every item counts. Keep words that look like an ID (`[A-Za-z]{1,3}[0-9]{1,5}[A-Za-z]?`) and
  exist (as written, else upper-cased). Then ask "Add N hymns to your favorites?" (with how many are already there and how
  many are not in this version), and add them on top in the file's order. Nothing found: "No favorites found".
- The web app reads and writes the same text, so favorites move between the two.
- Android's own backup (Google backup, phone-to-phone transfer) carries the favorites; the hymn database is left out of
  it (`backup_rules.xml`, `data_extraction_rules.xml`) because Google keeps at most 25 MB per app.

### 8.5 Book drawer

- Lists the **enabled** books (§10) in display order, each with its icon and display name.
- Selecting a book while viewing hymn H: if H is already in that book, just close. Else if `relatedIn(H, book)`
  exists → open it and remember (§8.2). Else → open `<book>1` (first hymn of the book).

---

## 9. Search / Index

Opened from the toolbar search icon, scoped to the **current book**. Title "<Book name> Index". One search box shared
by 8 tabs (with icons); each tab remembers its own query. Tapping a result returns to the reader and opens the hymn
(open and remember). Scrolling the list hides the keyboard. Tabs that can't be searched (Favorites, History): when
the search box gets focus there, jump to First Lines.

### 9.1 Tabs

| # | Tab | Empty query shows | Query matches | Row text |
|---|---|---|---|---|
| 0 | **Hymn Numbers** (numeric keypad) | current book by number | `no` (word filter) in all enabled books; order `CAST(no AS int)`, then current book first, then by group code. **Submit** (Enter) jumps straight to `<book><typed number>`. | `<ID> - <first stanza line>` |
| 1 | **First Lines** | current book's first stanza **and** first chorus lines, merged, sorted alphabetically (case-insensitive, ignoring leading `"` and `'`, locale collation) | that merged list, all enabled books, same order | `<line> - <ID>` |
| 2 | **Favorites** | favorites | (not searchable) | `<ID> - <first line>` |
| 3 | **Subjects** | all hymns with a main category, all enabled books | `main_category` OR `sub_category` | **`<main> - <sub>`** / `<ID> - <first stanza line>` |
| 4 | **Authors** | all hymns, enabled books | `author` OR `composer` | **`<author> - <composer>`** (empty→`Unknown`) / `<ID> - <first line>` |
| 5 | **All Lyrics** | every stanza | stanza `text` (all books, including disabled ones — §12 #4) | **`<ID> - <stanza no>`** / stanza text |
| 6 | **History** | history | (not searchable) | `<ID> - <first line>` |
| 7 | **Music** | hymns with key and tune, enabled books, ordered by tune | first stanza line (word filter) OR `key LIKE '<q>%'` OR `tune LIKE '<q>%'` | `<key> - <ID>` / first stanza line / `Tune: <tune>` |

Every row shows the book icon of the hymn on the left.

### 9.2 Word filter (MUST, for matching behaviour)

```
q = query with ' replaced by space, and ^ " & % $ @ . , ! removed, trimmed
words = q.split(' ')
keep words[0] always; keep later words only if length >= 3
column matches  <=>  every kept word w:  column LIKE '%w%'   (SQLite LIKE: case-insensitive for ASCII only)
several columns <=>  OR of the per-column matches
```

### 9.3 Prefix filter (Music tab key/tune)

Same character cleanup, then `column LIKE '<q>%'`.

### 9.4 Notes for non-SQL rebuilds

Precompute per hymn: normalized first lines, categories, authors, key, tune, and per stanza normalized text. A
substring match per word (as above) over ~71k stanzas is fast enough in JS. The iOS web build (§14.2) already
does accent-folding (`NFD`, strip combining marks), which is a reasonable improvement over SQLite `LIKE`.

---

## 10. Settings

Stored in platform preferences (web: `localStorage`). Keys are the Android keys; keep them if you plan migration tools.

| Key | Type | Default | Values / effect |
|---|---|---|---|
| `FontSize` | string | `18f` | `14f` Small, `18f` Medium, `22f` Large, `26f` Extra Large, `32f` XXL (sp) |
| `nightMode` | bool | false | dark theme for reader and sheet viewer |
| `keepDisplayOn` | bool | false | keep the screen awake (web: Screen Wake Lock API) in reader and sheet viewer |
| `manageFaves` | action | — | Back up & restore favorites dialog (§8.4) |
| `chordEdits` | action | — | Chord edits dialog: the edited sheets, Export, Import (§11.5); the summary counts the edited sheets |
| `disableLanguages` | set of codes | `{I}` | hidden books: removed from drawer, the other-languages grid, and from search tabs 0,1,3,4,7 |
| `otherLanguagesFolded` | bool | false | the other-languages grid on the hymn page is folded (§6.1); set by its Hide/Show row, not in the Settings screen |
| `youtubeButton` | string | `disabled` | `disabled` / `piano` / `search` (§7.4) |
| `similarTune` | bool | false | show Similar Tune button (§7.5) |
| `sheetMusicType` | string | `pianoSvg` | `pianoSvg` = Piano, `guitarSvg` = Guitar: the viewer's starting mode (§11) |
| `about` | action | — | dialog with app name, version, feedback address `lemuelinchrist@gmail.com` |

Changing any setting refreshes the reader (theme, font, drawer, current page) when returning to it.

Hidden state (not user-visible settings): History, Favorites (§8), chord edits (§11.5), and the database version (§14.5).

---

## 11. Sheet music subsystem

### 11.1 Which sheet to show

```
sheetId(h) = h._id            if sheetMei/<h._id>.mei exists
           = h.parent_hymn    else if parent set and sheetMei/<parent>.mei exists
           = none
lyricsId  = h._id             (passed so a translation can overlay its own words)
```

### 11.2 Viewer contract

The viewer is a self-contained web page (`assets/viewer/`). Hosts open:

```
viewer/index.html?id=<sheetId>&variant=piano|guitar&dark=0|1[&lyrics=<lyricsId>][&edit=1]
```

- `edit=1` offers chord editing (§11.5). Android passes it when the screen's smallest width is at least 600 dp
  (tablets, unfolded foldables); on phones the page only shows edits the device already has.

- It fetches `../sheetMei/<id>.mei` and, if `lyrics` is given and differs from `id`, `../sheetLyrics/<lyrics>.json`
  (a 404 there is fine: no overlay). **Keep this relative folder layout** (`viewer/`, `sheetMei/`, `sheetLyrics/`
  as siblings) and serve over http(s) (fetch doesn't work from `file://`).
- The page's back button navigates to `hymnsviewer://close`; the Android host intercepts that and closes. A web host
  SHOULD replace it with `history.back()`.
- The host MAY call `window.setInsets(top, right, bottom, left)` (CSS px) to keep the bar clear of a camera cutout.
  On the web, use CSS `env(safe-area-inset-*)` instead.
- Android shows it full-screen (immersive) and keeps the screen on if `keepDisplayOn`.
- Chord edits are stored by the host through `window.HymnsEdits`: `get(sheetId)` → the sheet's bars as JSON (`"{}"`
  when none), `put(sheetId, barsJson)` → true when saved (`"{}"` removes the sheet), `setEditing(bool)` (Android: Back
  then calls `window.closeEditor()` instead of closing the sheet). Without it (a plain browser) the page keeps them in
  `localStorage`. The host MAY call `window.setKeyboard(px)` with how much of the page the on-screen keyboard covers,
  so the editor stays above it. Android lets no other page load in the WebView, since they would see `HymnsEdits`.

### 11.3 Viewer behaviour

- Header: MEI main title (centred), subtitle (bold), the hymn ID at top-right (the overlay's ID when lyrics are
  swapped); verses 2+ below the music as text in columns; footer `www.hymnal.net`.
- Music: Verovio renders the MEI to SVG at page width, `scale` 40, `breaks: auto`, `lyricWordSpace` 3,
  `lyricSize` 4.5, `fontTextLiberation` true, margins 20, no Verovio header/footer.
- Tap anywhere (not on the bar) toggles a top bar with: **Back**, **Piano | Guitar**, **− key +** (transpose, ±6
  semitones; shows tonic and offset, e.g. `B♭ (+2)`), **Hide/Show staff** (`Staff` toggle under 400px). State resets
  each time the sheet is opened; it starts in the `sheetMusicType` variant; guitar starts with the staff hidden.
- Pinch to zoom changes `scale` (20–100) and re-lays-out (reflows, never scrolls sideways). Resize re-lays-out.
- Night mode: CSS vars switch to dark and the outer music `<svg>` gets `filter: invert(0.91)`.
- **Transpose**: Verovio `transpose` option (`+2`, `-1`), then `getMEI()` and continue from that MEI. Tail chords are
  moved by the page itself by the same interval.
- **Guitar** (derived from the piano MEI, no separate source):
  - Key → capo by the tonic's pitch class: `CAPO = {C:0, C♯/D♭:1, D:0, D♯/E♭:1, E:2, F:3, F♯/G♭:4, G:0, G♯/A♭:1, A:0, A♯/B♭:3, B:4}`.
  - Capo → interval to move every chord **down**: `{0:[0,0], 1:[1 letter,1 semitone], 2:[1,2], 3:[2,3], 4:[2,4]}`.
  - Drop slash basses (`C/E` → shapes without bass); remove a chord equal to the previous one.
  - Show `(Guitar: Capo N)` or `(Guitar)`; for Chinese sheets (`C…`, `CS…`) `(吉他: Capo N)` / `(吉他)`.
  - After transposing, the capo is recomputed from the new key.
- **Hide staff (chord chart)**: built from the MEI by the page: each note/rest gets a start beat (meter unit, dots,
  tuplets); each `<harm>` goes over the last note starting at or before its `tstamp`. Lines flow to screen width,
  wrapping only between words (verse 1 decides word boundaries; CJK has no word gaps). A new line starts after a
  sentence end in verse 1 (`. ; ! ? 。 ； ！ ？`, not before 6 syllables) and before an ending or a section label matching
  `chorus|final chorus|refrain|bridge|verse|part N|ending|副`. Other `<dir>` labels (Sisters, D.C. al Fine) become a
  small italic tag in the chord row. Repeats show as `‖:` `:‖`; endings as a boxed `1.`/`2.`. Only verse rows used by
  a line are drawn. Chords in accent red `#C80000` (dark: `#FF8A80`).

Full algorithm: `app/src/main/assets/viewer/viewer.js` (~800 lines, no dependencies besides Verovio; the chord
editor's panel is `editor.js`).

### 11.5 Chord edits

For a tablet on the piano: the melody and words stay, the chords get passing chords and embellishments. The same
feature, file format and rules as the web app (`tools/web/README.md`, "Chord edits"), so edits move between the two.

- **Where:** only with `edit=1` (big screens), on the piano sheet with the staff shown. The bar gets **Edit chords**,
  and **Original chords** (shows the sheet without this device's edits) once the sheet has edits. Choosing Guitar,
  hiding the staff or Original leaves edit mode. Phones show the edits but cannot edit (no room for the panel).
- **Editing:** a panel at the bottom. Tap a bar on the sheet (a note or chord also picks its beat); a strip shows the
  bar's beats (half beats in 4/4-type meters, plus every note's start); build the chord with buttons (root, ♭/♯,
  quality, bass) or type it (`bb7/d` is stored as `B♭7/D`); Remove chord, Undo, Original bar, Done, ‹ › for the
  neighbouring bars. Changed chords are drawn red (inverted colour in night mode so they come out light red); the
  selected bar is highlighted. While editing, taps pick bars instead of hiding the bar. Back closes the panel first.
- **Model:** per sheet `{"<bar>": {"was": [[beat, chord]], "chords": [[beat, chord]]}}`. A bar is the nth `<measure>`
  of the MEI (from 1), a beat its `tstamp`; `chords` replaces all of the bar's `<harm>`s; `was` is what the bar had,
  so the editor can warn "The sheet has changed since you edited bar N" when a new release changes that bar. Chords
  are stored in the original key (a chord typed while transposed is moved back), so transposing, the guitar sheet
  and the chords-over-lyrics view all use them. A bar edited back to its original chords is dropped.
- **Applied** before anything else: the edited bars' `<harm>`s are replaced in the parsed MEI; new ones get
  `type="edit"` (drawn red). An edit the sheet itself now has (sent in and put into the sheets; `dim`/`°` and
  `aug`/`+` count as the same) is forgotten on the device.
- **Saved** at once, on every change, by the host. Android: `files/chord-edits.json` in the app's storage,
  `{"format": "hymns-chord-edits", "v": 1, "sheets": {"E8": {"updated": <ms>, "bars": {…}}}}`, written to a new file
  first and then swapped in; included in Android's own backup like the favorites.
- **Settings → Chord Edits:** lists the edited sheets, newest first (`E8 – first line`, `N bars · date`; a tap opens
  the sheet), with **Export** (Send through the share sheet, or Save as a file; `hymns-chord-edits-<date>.json`, the
  stored file plus `"exported"`) and **Import** (a file picker; asks "Import chord edits?" listing the sheets, then
  says how many were imported and kept). A sheet replaces this device's edits of it unless it was edited later here.
  Bars and chords that are not well formed are left out. A chord edits file tapped in another app (email, Drive,
  Files) opens the same import question (`RestoreFavoritesActivity`, which also takes favorites backups).
- **Into the sheets:** an exported file sent in goes through `tools/svg-to-lilypond/tools/chord_edits.py import`
  (`tools/web/README.md`), which changes the `.ly` and MEI files for everyone.

### 11.4 MEI files: what the viewer relies on

One file per hymn, MEI 5.0, generated from LilyPond sources by `tools/svg-to-lilypond/tools/ly_to_mei.py`.

| Element | Meaning |
|---|---|
| `meiHead//title[@type='main']`, `[@type='subordinate']` | title, subtitle (category) |
| `meiHead//identifier[@type='hymn']`, `[@type='number']` | Hymn ID, printed number |
| `scoreDef/@key.sig` (`4f`, `1s`, `0`), `@meter.count/@meter.unit` | key (fifths), time |
| `measure/staff/layer/note[@xml:id]` with `verse[@n]/syl[@wordpos,@con]` and `label` | melody; lyric syllables per verse under the staff (`wordpos` i/m/t, `con="d"` dash, `"u"` extender) |
| `measure/harm[@tstamp]` | chord symbol text using `♭ ♯` (e.g. `A♭`, `C/E`) |
| `dir[@startid]` | text labels (Chorus, Sisters, D.C. al Fine) |
| `ending[@n/@label]`, `measure/@left='rptstart'`, `@right='rptend'` | voltas and repeats |
| `back/div[@type='verses']/lg[@label]/l` | verses printed below the music as plain text |
| `back/div[@type='tailChords']` | chords printed after the last bar (space-separated text) |

### 11.5 Native rendering alternative

A native app that doesn't want a WebView can render the same MEI with Verovio's C++ library, or reuse the viewer's
algorithms (they are small) with a different engraver. The WebView route is what the app ships and is recommended.

### 11.6 Sheet lyrics overlay (`sheetLyrics/<hymnId>.json`)

Puts a translation's own words under the borrowed (parent's) sheet without duplicating the sheet.

```json
{
  "hymn": "FR10", "parent": "E52",
  "quality": "exact | adapted",
  "adjust": {"hold": 0, "merge": 1},
  "title": "Père, pour Toi montent, dans Ta présence",
  "subtitle": "",
  "syl": { "n1": ["Pè","i"], "n2": ["re,","t"], "n3": "pour", "n9": ["mer","i","u"], "n12": 0 },
  "verses": [ {"label": "2.", "lines": ["…", "…"]} ]
}
```

Applied before rendering (`applyLyrics` in `viewer.js`), for **verse 1 only** (`verse[@n='1']`):

- `syl[noteId]` is a string = whole word on that note (no `wordpos`, no `con`);
  `[text, wordpos]` = syllable with `wordpos` i/m/t (`con="d"` for i/m);
  `[text, wordpos, 'u']` = held over the next note (extender, `con="u"`);
  `0` = this note has no syllable (the previous one is held): remove its verse-1 element.
  Note IDs not in `syl` keep the original syllable.
- CJK text: remove the `‿` tie sign (two characters simply sit on one note).
- Replace main title with `title`, subtitle with `subtitle` (or empty).
- Replace `<back>` with a new `div[@type='verses']` built from `verses`.
- The ID shown at top-right becomes `hymn`.

Produced by `tools/sheet-lyrics/align.py` (French, Chinese); see its README.

---

## 12. Known quirks and decisions to make

Listed so a rebuild chooses on purpose. "Keep" = users rely on it; "Fix" = probably unintended.

| # | Quirk in the current app | Suggestion |
|---|---|---|
| 1 | `related` is an unordered set, so chip order is random-ish. | Fix: order by book order (§3.2). |
| 2 | `related` may list IDs that don't exist. | Fix: filter to existing IDs (the iOS build does). |
| 3 | Subjects/Authors with an empty query list *all* enabled books, not just the current one; no explicit sort. | Decide; current-book first is friendlier. |
| 4 | All Lyrics ignores disabled books. | Fix: apply the same book filter. |
| 5 | Word filter ignores 1–2 letter words after the first; `LIKE` is accent- and (non-ASCII) case-sensitive. | Improve with accent/case folding; keep the "short words ignored" rule or not. |
| 6 | Similar Tune needs **two** other hymns before it shows a list (one match → "No Hymn with similar tune"). | Fix: show the list for ≥1. |
| 7 | Similar Tune uses a prefix match on the tune code, so a longer tune starting with the same digits counts as similar. | Decide (exact match is stricter). |
| 8 | History only records swiped-to hymns if they were opened deliberately or a button was tapped. | Keep (avoids flooding history while browsing). |
| 9 | Copy keeps `<i>`/`<u>` tags in the clipboard text. | Fix: strip all tags. |
| 10 | Stanza labels like `copyright`, `chorusverse`, `-` are shown verbatim as the stanza number. | Decide: hide `-`, style `copyright` as a note. |
| 11 | `tune` table is keyed by **hymn ID**, not tune code (name is misleading). | Keep the semantics; rename in the new schema. |
| 12 | Hymn number submit jumps to `<book><number>` even if absent (falls back to the book's first hymn). | Fix: show "not found". |

---

## 13. How the data is produced (upstream pipeline)

A rebuild normally just **consumes** the outputs in §2. This section explains where they come from, so a rebuild
can stay in sync with future releases.

```
hymn text files (.txt)  ──Groovy Provision*.groovy──►  sqlite/hymns.sqlite  ──exportSql──►  sqlite/hymns.sql (git)
hymnal.net pages        ──HymnalNetExtractor───────┘                                          │
                                                                                              importSql (every app build)
                                                                                              ▼
                                                              app/src/main/assets/hymns.sqlite ──► tools/ios/build.py ──► iOS html
hymnal.net lead-sheet SVGs ──svg-to-lilypond──► .ly (piano) ──ly_to_mei.py──► assets/sheetMei/*.mei
sheetMei + DB stanzas      ──tools/sheet-lyrics/align.py──► assets/sheetLyrics/*.json
MIDI per tune (from hymnal.net) ──► res/raw/m<tune>.mid
```

- **Git source of truth** for the DB is the text dump `sqlite/hymns.sql`. `./gradlew :sqlite:importSql` rebuilds
  `hymns.sqlite` from it and copies it into the app assets (runs before every app build). A web build pipeline can do
  the same: `sqlite3 hymns.sqlite < sqlite/hymns.sql`, then export.
- **Hymn text file format** (input to the provisioners, e.g. `databaseProvisioner/src/main/resources/Swahili.txt`):

  ```
  SW-1
  Subject: KANISA LA UTUKUFU
  Related: E1226
  Parent: E1226

  1
  Kanisa la utukufu nasi tu washirika
  ...

  Chorus:
  Halleluyah kuna mwili
  ...
  ```
  A header line `<CODE>-<no>`, optional `Subject:`, `Related:`, `Parent:` lines, then stanzas introduced by a
  number line or `Chorus:`, separated by blank lines. Each language's provisioner differs slightly; the Greek one
  is the reference.
- **Provisioning invariants** (`databaseProvisioner/.../lib/Dao.java`): saving a child with a parent copies the
  parent's `tune` into the child if empty (denormalized, so Music search and Similar Tune find translations) and
  adds the child's ID to the parent's `related`.
- **Sheet music**: hymnal.net's LilyPond-made SVGs are parsed back into LilyPond (`.ly`), then converted to MEI.
  Only piano sources are kept; guitar is derived in the viewer. Details: `tools/svg-to-lilypond/DESIGN.md`.

---

## 14. Building a PWA / website: recommended approach

### 14.1 Architecture

```
/index.html, app.js, app.css          the reader + search + settings (SPA, hash routes)
/data/books.json                      §3.2 table
/data/hymns-<BOOK>.json(.gz)          one file per book (lazy-load), §14.3
/data/search-<BOOK>.json              optional precomputed search index
/icons/<code>.png                     book icons
/midi/m<tune>.mid  (or /audio/...)    melodies (§14.4)
/viewer/   /sheetMei/   /sheetLyrics/ copied unchanged from app/src/main/assets (§11.2)
/sw.js, manifest.webmanifest          offline + install
```

Routes: `#/E1` (hymn), `#/search/<book>/<tab>?q=…`, `#/settings`, `#/sheet/<sheetId>?lyrics=<id>` (or link straight
to `viewer/index.html?...`). Browser history = back stack (§8.2).

### 14.2 Existing web builds

The repository already has a PWA built this way: **`tools/web/`** (sql.js over the shipped database, the sheet viewer
as a module, chord editing, service worker, GitHub Pages). Start there; its `README.md` and `SPEC.md` describe it.
The older single-file lyrics-only build below is kept as a fallback.

### 14.2.1 The single-file iOS build

`tools/ios/build.py` already turns the DB into a compact JSON array, resolving parent inheritance and related sets.
Its record format (one array per hymn) is:

```
[ id, group, no, title, stanzas | 0, parent, meta, related[], hymnalNetPath ]
  stanzas = [[no, text(with \n, only <i>/<u> kept), note?], ...]   0 = "use the parent's stanzas"
  meta    = {a: author, m: composer, k: key, t: time, n: tune, r: meter, c: main cat, s: sub cat, v: verse}  (inherited, empty keys dropped)
  related = existing IDs only, own ∪ parent's ∪ parent
```

`template.html` implements: book picker with pinned books, search by number / words (accent-folded) / all books,
favorites, recent, font size, and a hymnal.net link. A PWA can fork both files and add: the two-column layout, colours
per book (§3.2), the button bar, sheet viewer, MIDI, settings, and a service worker. Note its favorites/recent keys
(`favs`, `recent` in localStorage) if both should interoperate.

### 14.3 Data export

Write a build script (Python, like `build.py`) that reads `hymns.sqlite` and emits, per book, the assembled hymns
(§5.1–5.2 already applied) plus the raw `parent`/`related` for navigation. Keep stanza `no` and text (`<br/>` → `\n`).
Size check: all books as one gzipped JSON is ~5 MB (the iOS html is that, base64-encoded); per-book files keep
first load small.

### 14.4 Mapping native features to the web

| Native feature | Web equivalent |
|---|---|
| SQLite asset | JSON per book, or `sql.js` (SQLite in WASM) on the shipped `hymns.sqlite` if you want the exact SQL of §9 |
| SharedPreferences | `localStorage` (settings), `localStorage`/IndexedDB (history, favorites) |
| MIDI playback (`MediaPlayer`) | Browsers can't play `.mid` natively. Either a JS synth (e.g. `@tonejs/midi` + Tone.js, or `html-midi-player` with a small SoundFont), or pre-render each MIDI to a small audio file at build time (FluidSynth → Opus/MP3). Loop it. |
| Keep screen on | Screen Wake Lock API (`navigator.wakeLock.request('screen')`), re-request on visibility change |
| Clipboard copy / import | `navigator.clipboard.writeText` / `readText` (import: also offer a paste textarea) |
| Export favorites (share sheet) | `navigator.share({text})`, fallback to copy |
| WebView sheet viewer | iframe or direct navigation to `viewer/index.html?...` |
| Night mode | toggle + default from `prefers-color-scheme` |
| Swipe between hymns | horizontal pointer/touch gestures + ←/→ keys; prefetch neighbours |
| Toasts / dialogs | lightweight in-page equivalents |

### 14.5 Offline and updates

- Precache the shell, `books.json`, and the user's current book; cache other books, MEI files and MIDI on first use
  (or offer "Download everything for offline": ~100 MB total, dominated by MEI 45 MB, MIDI 19 MB, Verovio 7 MB).
- The Android app refreshes its local DB copy whenever the app version code changes (DB file version = app
  versionCode). The web equivalent: version the data files (content hash in the name) and bump the service-worker
  cache name on each data release. History/favorites MUST survive updates; IDs removed from the data are dropped
  lazily (§8.1).
- Serve `.wasm`-containing JS and `.mei` with compression (they compress ~4×).

### 14.6 Content and attribution

The sheet viewer footer credits `www.hymnal.net`; keep it. Verovio is LGPL-3.0 (`viewer/VEROVIO-NOTICE.txt`) — ship
it unmodified with the notice. The app code is Apache-2.0 (`LICENSE`). Hymn texts and music have their own
copyright holders (authors marked `*` are Living Stream Ministry); anyone republishing the content publicly should
check permissions for their use.

---

## 15. Acceptance tests

Concrete checks against the shipped data. A rebuild that passes these behaves like the app.

| # | Scenario | Expected |
|---|---|---|
| 1 | Parse IDs | `E1`→(E,1); `CS330`→(CS,330); `NS10012`→(NS,10012); `C215`→(C,215) |
| 2 | Open `E1` | Title `E1`; subject **Blessing of the Trinity** / His Plan; details: `Meter: 8.5.8.3.`, `Time: 4/4 - Ab Major`, `Tune: 5553216153222`, `Author: J. F. Garland`, `Composer: Ira David Sankey (1840-1908)`; 6 numbered stanzas; toolbar `#3D577A` |
| 3 | Open `C1` | Inherits author/composer/time from `E1`; keeps its own key `降A大調4/4`, meter `8583`, categories; tune trimmed to `5553216153222`; related chips include `E1` and E1's translations (e.g. Tagalog 1, Korean 1) but not `C1` itself |
| 4 | Related on `E1`, Indonesian disabled (default) | No `I1` chip; chips for SW 36, GK 89, MY 1, TA 1, UR 1, R 1, K 1, J 1, G 1, F 1, FR 216, C 1, CB 1, Z 1, SK 1, T 1, S 1 |
| 5 | Chorus repetition | A hymn with one chorus after stanza 1 shows: 1, chorus, 2, chorus, 3, chorus… |
| 6 | Two choruses (`E1118`) | `1`, chorus with `(Sisters sing)`, chorus with `(Brothers sing)`, `2`, `3` — no repetition |
| 7 | Note stanza (`E66` `end-note`) | Full-width italic red line "(Repeat the last two lines of each stanza)" |
| 8 | Farsi hymn | Right-aligned, chorus not italic |
| 9 | Drawer: on `E52` choose French | Opens `FR10` (E52's French translation); Back returns to `E52` |
| 10 | Drawer: on a hymn with no Kiswahili translation, choose Kiswahili | Opens first hymn of `SW`; back stack unchanged |
| 11 | Search Hymn Numbers, type `12`, submit | Opens `<current book>12` |
| 12 | Search First Lines with empty query in English | English first stanza and chorus lines A→Z, quotes ignored for sorting |
| 13 | Word filter `"the of grace"` on First Lines | `of` ignored (2 letters, not first); matches lines containing both `the` and `grace` |
| 14 | Play on `E1` | Loops `m5553216153222.mid`; stops when swiping to `E2` |
| 15 | Sheet music on `E1`, guitar | Shows `(Guitar: Capo 1)`, chord chart (staff hidden); key label `A♭` |
| 16 | Sheet `NS576` guitar | `(Guitar: Capo 3)` (key F) |
| 17 | Sheet on `FR10` | Opens `E52`'s sheet with French verse-1 syllables, French title, French verses below, `FR10` at top-right |
| 18 | Sheet on a hymn with no own MEI and parent without MEI | "Sorry! sheet music not available" |
| 19 | Transpose `E1` +3 | Key label `B (+3)`; guitar capo recomputed (B → capo 4) |
| 20 | YouTube = piano on `E8` | Opens `https://www.youtube.com/embed/DL6lgn78DcU` |
| 21 | Favorites export, then import on a fresh install | Same set of favorites |
| 22 | History contains a removed ID | Opening it goes to the book's first hymn and the ID disappears from History and Favorites |
| 23 | Night mode | Black toolbar/background, `#CCCCCC` text, stanza numbers in night colour; sheet viewer dark |
| 24 | Landscape / wide screen | Lyrics in two columns, notes full-width |
