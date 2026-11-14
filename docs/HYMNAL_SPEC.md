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

A fully **offline** digital hymnal for the hymns used in the Lord's recovery, in 31 books (languages and
collections). No account, no network calls, no tracking, no permissions.

Features:

| Feature | Summary |
|---|---|
| Lyrics reader | One hymn per page; swipe left/right to the previous/next hymn of the same book. Header with category, meter, time, key, tune code, Bible verses, author, composer. Stanza numbers and choruses in the book's colour. |
| Books (languages) | 31 books, chosen from a side drawer. Switching book opens the **same hymn in the new language** when a translation is known, otherwise hymn 1 of that book. |
| Related hymns | "OTHER LANGUAGES" grid under the subject: code and number of the same hymn in other books (`CS 305`), foldable. Tap to open. |
| Search / Index | 4 tabs: Hymn Numbers, Search (one list of hymns from first lines, subjects, authors, tunes and all lyrics; browse the current book when empty), Favorites, History. |
| Favorites | Heart button; listed in the Favorites tab; back up / restore as a short text file (one "ID – first line" per hymn). |
| History | Recently opened hymns (newest first, up to 100). The app reopens the last hymn on start. |
| Play | Loops the hymn's melody (MIDI file looked up by tune code). |
| Sheet music | Engraved from MEI with Verovio at screen width; piano or guitar (capo + chords derived), transpose ±6, "chords over lyrics" mode, pinch to zoom, dark in the dark themes. Translations can show their own lyrics under the borrowed sheet. On big screens (tablets, unfolded phones) the chords of the piano sheet can be edited, kept on the device and exported/imported (§11.5). |
| YouTube (optional) | Searches YouTube for the hymn (Settings → YouTube button, off by default). The hymn's piano videos are in the links card (§6.1). |
| Similar tune (optional) | Lists other hymns sung to the same tune, preferring the current language. |
| Share | A menu: share the lyrics, share a link to the hymn in the web app, or copy the lyrics. |
| Display settings | Font size (5 steps), theme (System default / Light / Dark / Black), keep screen on, hide books you don't use (Hymn books), a QR code to share the app (§10). |

---

## 2. Shipped assets (what a rebuild consumes)

Everything the app needs at runtime is in the repository. A rebuild does **not** need hymnal.net or any server.

| Asset | Location | Format | Count / size | Used for |
|---|---|---|---|---|
| Hymn database | `app/src/main/assets/hymns.sqlite` (built from `sqlite/hymns.sql`, see §13) | SQLite 3 | 14,127 hymns, 71,090 stanzas, 674 video links; 18 MB | everything textual |
| Book list, names, colours, order | `app/src/main/java/.../HymnGroup.java` | Java enum (also parsed by `tools/ios/build.py`) | 31 books | drawer, colours, ID parsing |
| Book icons | `app/src/main/res/drawable-xhdpi/<code>.png` (lowercase code: `e.png`, `cs.png` …) | PNG, 364×364 | 31 | drawer, search list rows, the Languages (Hymn Books) dialog |
| Melodies | `app/src/main/res/raw/m<tune>.mid` | Standard MIDI | 2,523 files (one tune is an .mp3); 19 MB | Play button |
| Sheet music | `app/src/main/assets/sheetMei/<hymnId>.mei` | MEI 5.0 XML | 3,407 (E 1362, NS 1238, CS 291, CH 243, BF 149, C 124); 45 MB | sheet viewer |
| Translated sheet lyrics | `app/src/main/assets/sheetLyrics/<hymnId>.json` | JSON (§11.6) | 2,446 (Z 755, C 632, ZS 460, FR 239, CS 194, FRY 166): every French and French Youth hymn that has a sheet; about 10 MB | sheet viewer overlay |
| Sheet viewer (web) | `app/src/main/assets/viewer/` (`index.html`, `viewer.js`, `editor.js`, `viewer.css`, `verovio-toolkit-wasm.js`) | HTML/JS; Verovio 6.3.0 (LGPL-3.0) | 7.3 MB | **reusable as-is in a web build** |
| Lyrics-only web app | `tools/ios/template.html` + `tools/ios/build.py` | single HTML file with gzipped JSON payload | ~6.5 MB | starting point for a PWA (§14.2) |
| UI icons | `app/src/main/res/drawable*/` | Material icons (vector/PNG) | — | buttons |

---

## 3. Core concepts: Hymn ID and Hymn Group (book)

### 3.1 Hymn ID

A string `<GROUP><NUMBER>`, e.g. `E1`, `C215`, `NS10012`, `SW36`. It is the primary key everywhere (database,
favorites, history, file names of `.mei` and `.json`).

Parsing rule (MUST match `HymnGroup.getHymnGroupFromID` / `getHymnNoFromID`):

- The group is the **leading letters** of the ID (1 to **3**, upper-cased: `E`, `CS`, `POR`); the number is the rest,
  and it starts with a digit. (Until v5.8.3 a code was at most two letters; three-letter codes came with the
  Portuguese and Polish books, so that a book can be named by its language and a language can have two books.)
- An ID whose group is unknown is invalid (skip it silently in lists).
- **Old codes**: three books were renamed in 2026-11 to the three-letter codes their contributors already use: Burmese
  `MY` is now `BUR`, Russian `R` is `RUS`, French Youth `FY` is `FRY`. An old code still resolves to the new one when a
  hymn ID is read, typed or opened from a link (`MY637` is `BUR637`), and what a device saved is migrated once:
  History and Favorites, the hidden books (Android: `CodeMigration`), the web app's stored favorites, recent hymns,
  hidden books and current book. Chord edits need nothing: they are kept per sheet, and no MY, R or FY hymn has a sheet of
  its own.

The number part is a string. It is numeric for every hymn today, but compare and sort it as `CAST(no AS decimal)`.
Numbers are **not** contiguous: `SW` uses printed page numbers (gaps), `KI` and `FRY` follow their book's page order, `TA` and `UR` use the English numbers (gaps), `NS` has a block from 10002 (Long Beach songs:
LB12 = `NS10012`), `T` goes up to 30017, `G` to 10002, `SK` to 3049.

The **default hymn** is `E1`.

### 3.2 Hymn Groups (books)

Order below is the **display order** (drawer, settings, iOS book picker). Colours: *day* = Material 500, used for the
toolbar, stanza numbers, chorus text and the button bar; *night* = Material 200, used for stanza numbers/chorus and the
"Hide" link in the dark themes (each at least 4.5:1 on the dark card; Farsi and Slovak were lightened for it in v5.8).

| # | Code | Display name | Day colour | Night colour | Text align | "Big" book¹ | Hymns |
|---|---|---|---|---|---|---|---|
| 1 | `E` | English | `#3D577A` | `#B0BEC5` | left | yes | 1362 |
| 2 | `C` | Chinese (Traditional) | `#669900` | `#A5D6A7` | left | yes | 786 |
| 3 | `CS` | Chinese Supplement (Traditional) | `#9933CC` | `#CE93D8` | left | yes | 513 |
| 4 | `Z` | Chinese (Simplified) | `#669900` | `#A5D6A7` | left | yes | 786 |
| 5 | `ZS` | Chinese Supplement (Simplified) | `#9933CC` | `#CE93D8` | left | yes | 513 |
| 6 | `CB` | Cebuano | `#FF8800` | `#FFCC80` | left | yes | 584 |
| 7 | `T` | Tagalog | `#009688` | `#80CBC4` | left | yes | 1176 |
| 8 | `FR` | French | `#E91E63` | `#F48FB1` | left | yes | 248 |
| 9 | `FRY` | French Youth | `#E91E63` | `#F48FB1` | left | yes | 176 |
| 10 | `S` | Spanish | `#3F51B5` | `#9FA8DA` | left | yes | 910 |
| 11 | `SY` | Spanish Youth | `#3F51B5` | `#9FA8DA` | left | yes | 426 |
| 12 | `K` | Korean | `#795548` | `#BCAAA4` | left | yes | 1144 |
| 13 | `G` | German | `#FF5722` | `#FFAB91` | left | yes | 482 |
| 14 | `GY` | German Youth | `#FF5722` | `#FFAB91` | left | yes | 271 |
| 15 | `J` | Japanese | `#8BC34A` | `#AED581` | left | yes | 780 |
| 16 | `I` | Indonesian | `#F44336` | `#E57373` | left | yes | 1133 |
| 17 | `BF` | Be Filled | `#0099CC` | `#90CAF9` | left | **no** | 438 |
| 18 | `NS` | New Songs | `#CC0000` | `#EF9A9A` | left | **no** | 1246 |
| 19 | `CH` | Children | `#AFB42B` | `#E6EE9C` | left | **no** | 243 |
| 20 | `F` | Farsi | `#673AB7` | `#B39DDB` | **right** (RTL) | yes | 329 |
| 21 | `SK` | Slovak | `#9C27B0` | `#CE93D8` | left | yes | 360 |
| 22 | `GK` | Greek | `#03A9F4` | `#4FC3F7` | left | yes | 124 |
| 23 | `SW` | Kiswahili | `#00838F` | `#4DD0E1` | left | yes | 101 |
| 24 | `RUS` | Russian | `#1565C0` | `#64B5F6` | left | yes | 800 |
| 25 | `BUR` | Burmese | `#2E7D32` | `#66BB6A` | left | yes | 706 |
| 26 | `TA` | Tamil | `#546E7A` | `#90A4AE` | left | yes | 305 |
| 27 | `UR` | Urdu | `#880E4F` | `#F06292` | **right** (RTL) | yes | 496 |
| 28 | `KI` | Kikuyu | `#FF6F00` | `#FFB300` | left | yes | 96 |
| 29 | `POR` | Portuguese | `#33691E` | `#7CB342` | left | yes | 1360 |
| 30 | `POY` | Portuguese Youth | `#33691E` | `#7CB342` | left | yes | 140 |
| 31 | `POL` | Polish | `#5E35B1` | `#B39DDB` | left | yes | 424 |

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
  "related" TEXT,                       -- comma-separated Hymn IDs (same hymn in other books)
  "new_tune" INTEGER                    -- 1 = a New Tune (hymnal.net's, or a translation of one): the header says "(New Tune)" and lists add it to the first line. NULL for all others
);
CREATE TABLE "stanza" (
  "parent_hymn" TEXT NOT NULL,          -- Hymn ID the stanza belongs to (NOT the parent hymn concept)
  "no" TEXT NOT NULL,                   -- '1','2',..., 'chorus', 'note', ... (see 4.3)
  "text" TEXT,                          -- HTML-ish text, lines separated by <br/>
  "note" TEXT,                          -- optional performance note, e.g. 'Sisters sing'
  "id" INTEGER NOT NULL PRIMARY KEY,
  "n_order" INTEGER                     -- display order within the hymn
);
CREATE TABLE "link" (                   -- links of a hymn to places outside the app (piano videos, and the YouTube and SoundCloud links of the youth books)
  "id" INTEGER NOT NULL PRIMARY KEY,
  "hymn_id" TEXT NOT NULL,              -- a HYMN ID (not a tune code), e.g. 'E8'
  "kind" TEXT NOT NULL,                 -- 'piano' (a piano video of the hymn's tune), 'youtube' or 'soundcloud' (a recording of this hymn; a hymn with none of its own shows those of the hymn above it, see the links card)
  "label" TEXT,                         -- piano: the text shown ('1st tune', 'Alt tune: 295', 'New tune' ...); youtube/soundcloud: the PUBLISHER of the recording ('NYCYPCD', 'Hymn CDs'; empty when unknown, never the channel)
  "url" TEXT NOT NULL,                  -- the whole address, e.g. 'https://www.youtube.com/watch?v=DL6lgn78DcU'
  "n_order" INTEGER,                    -- order among the hymn's links of that kind, from 1
  "album" TEXT,                         -- youtube/soundcloud: the album or playlist the recording is from
  "instrumental" INTEGER                -- youtube/soundcloud: 1 for an instrumental recording, else NULL
);
CREATE INDEX stanza_parent_hymn ON stanza (parent_hymn, n_order);
CREATE INDEX link_hymn ON link (hymn_id, kind, n_order);
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
3. `isNewTune = (new_tune == 1)` — the hymn's own `new_tune` column, never inherited from the parent; shown as "(New Tune)" in the header. Every list that shows a first line (hymn numbers, first lines, favorites, history, subjects, authors, tunes, same-tune choices) and the search (its `line`, `first` and `chorus`, so typing "new tune" finds them) shows `first line + " (New Tune)"` for such a hymn; the stored first lines never contain that text, and sharing and the YouTube search use the plain line.
4. If `parent_hymn` is set, load the parent **recursively with the same rules** and fill every *empty* child field
   from it:

   | Child field empty? | Take from parent |
   |---|---|
   | author, composer, time, tune, key, meter, verse | same field |
   | main_category | **both** main_category and sub_category |
   | stanzas (none at all) | the parent's stanzas (33 hymns rely on this) |
   | sheet music | — (resolved separately, §11.1) |

   **Own tune:** a New Tune whose parent is not one (`new_tune` = 1 on the hymn, not on its parent: a BF New Tune of an English
   hymn) does **not** take composer, time, tune or key from the parent, nor its sheet music (§11.1), piano videos or recordings
   in the links card: they are another tune. A translation of a New Tune has the New Tune as parent and borrows from it as usual.

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
   Background = the book's colour in the theme (§6.3). Hides when scrolling down, reappears when scrolling up
   and whenever a new hymn is opened.
2. **Header card** (always shown: it holds the buttons):
   - Subject line, centred (omitted when empty): **main_category** (bold), newline, sub_category, newline `(New Tune)`
     if `isNewTune`.
   - **Other languages** (since v5.7; omitted when the hymn has no related hymn in an enabled book), so a brother can
     call the hymn in several languages without scrolling:
     - A row: `OTHER LANGUAGES` (12sp, bold, letter-spaced, muted), the count in a small rounded badge, and at the right
       `Hide ▴` / `Show ▾` in the book's colour (its night colour in the dark themes). Tapping the row folds or unfolds the grid.
     - A grid of the related hymns: book **code** (muted, ~0.82× the number's size, one fixed width so the numbers line
       up) and **number** (bold), e.g. `CS 305`. No border, no colour dot. Order: the books' drawer order (the
       `HymnGroup` order), then the number. Columns: as many as fit (4 on most phones at the default size;
       2 to 8). Number size = font size − 4sp (at least 12sp). Tap = open that hymn *and remember where we came from* (§8.2).
     - Folded or not is **one setting for every hymn** (`otherLanguagesFolded`, default false = open), kept across
       restarts; pages already built next to the current one follow it at once.
     - **Back-to-hymn button** (a switch to a related hymn, by this grid or by choosing a book in the drawer when the
       hymn has a related hymn there): a round button, 60dp, on the lower right of the hymn page, above the
       navigation bar, **not there by default**. It appears when a related hymn is opened and is labelled with the
       **hymn just left** (`C45`), filled with that hymn's book colour (the same as its button bar), white bold text.
       Tapping it opens that hymn the same way, so the button now shows the hymn that was left in turn: a meeting in
       two languages goes back and forth with it. It disappears as soon as any other hymn is shown (a swipe, Search,
       Back, a similar tune). Opening a hymn goes straight to it, never through hymn 1 of its book.
       The web app has both: its other-languages row (the chips under the title) is one row that scrolls on phones, with an
       **All N** button at its right that opens every language below each other (**Fewer** closes it; one choice for every
       hymn, kept on the device, closed at first), and the back-to-hymn button is the same 60px round button on the lower
       right, shown after a chip or a hymnal choice that switches language and removed by any other hymn.
     - **Where the related hymn opens:** a related hymn opens at the **same relative place** as the hymn left
       (scroll position ÷ scroll range, so verse 10 of a long hymn goes to about verse 10 of its translation, since
       the languages differ in line heights), not at its top; this holds for the back-to-hymn button and the drawer
       too. Any other hymn (Search, Back, similar tune, swipe) opens at its top. The grid itself is at the top of the
       page, so a switch from it starts from the top; the button and the drawer work from anywhere in the hymn.
   - **Button bar**: a pill (corner radius 25dp) filled with the book's day colour holding white icons:
     Favorite ♡/♥, Play ▶/❚❚, Sheet music, YouTube (conditional), Similar tune (conditional), Share. See §7.
3. **Lyrics card** (§6.2).
4. **Details card** (hidden when none of these has a value): label `DETAILS` (12sp, bold, letter-spaced, muted), then
   a two-column table at font size − 2sp, one row per item, omitted when empty, in this order: label (muted) | value
   (wraps in its own column, selectable): `Meter` · `Time` (with the key when both exist: `4/4 · Ab Major`), or `Key`
   when there is only a key · `Tune` (omit when `0`) · `Verses` · `Author` · `Composer`.
   `Verses` are links to the Bible (below). Every other value is a link (underlined, book accent colour; the time and the key are separate links) that
   opens the search screen on the Search tab, all books, with that value in the box. The search looks **only in one
   column of the `search` table** while the box still holds the link's words: `music` for meter, time, key and tune,
   `people` for author and composer (an author is searched without the dates and `v. N`). Time and meter are searched
   as a quoted phrase, since `4/4` in search form is `4 4`, a scripture reference (`Mt. 4:4`) in a subject or the
   lyrics. Editing the words searches everywhere again. (The web app does the same: the link is
   `#/search?q="4/4"&all=1&in=music`, and `in=` stays on the hymnal / all hymnals switch but not on typing.)
   (Until v5.6 these were in the header card and the related hymns were pills with book names at the bottom: the
   numbers moved up because brothers call hymns in several languages during meetings.)
   **Verses** (Bible references): the hymn's `verse` text ("Ephesians 2:5-6,18,19-22,") is shown as a list of separate
   references (`Ephesians 2:5-6, 18, 19-22`, without the trailing comma); each one that can be read is a link (underlined,
   book accent colour) to the Recovery Version text, as hymnal.net links them: `https://text.recoveryversion.bible/` +
   `<NN>_<Book>_<chapter>.htm` + `#<Abbr><chapter>-<verse>` (e.g. `66_Revelation_5.htm#Rev5-12`; the 66 books' file
   names, anchor codes and chapter counts are in `content/Scripture.java` and `tools/web/src/scripture.js`, which hold
   the same table and rules). It opens in the browser (Android: `ACTION_VIEW`; web: a new tab). Rules: the parts are
   separated by commas or semicolons; a part with no book goes on from the one before (a bare `18` after `Ephesians 2:5-6`
   is verse 2:18, and `19-22` its range; after a chapter alone, as in `Psalms 42,43`, a bare number is a chapter); a range
   links to its first verse; a chapter alone, a chapter range (`Revelation 18-21`) or a book alone link to the chapter's
   page (the first one); in a book of one chapter (Obadiah, Philemon, 2 John, 3 John, Jude) a number is a verse;
   a trailing `a`/`b` is ignored; book names are English, Portuguese or Spanish (accents and spaces ignored); anything
   else (another language's book names, a chapter the book doesn't have, a part before any book) stays plain text. Only
   the link is made: the Bible text is not copied into the app (it is copyrighted).
5. **Listen and links card** (below the details; hidden when it has nothing to show): label `LISTEN AND LINKS`, then sections, each with a
   heading (`RECORDINGS`, `PIANO VIDEOS`, `NEW TUNES`, in capitals) and the number of links on its right; a section with nothing is left out.
   - **Recordings**: the hymn's own `link` rows of kind `youtube` (first) and `soundcloud`, in `n_order`. A row is a link at least 56 dp tall:
     a round icon (play for YouTube, music for SoundCloud) in the book's accent colour, a first line, a second line and an arrow `↗`. The first
     line is the **publisher** (`label`: who made the recording: NYCYPCD, Living Stream Ministry, Hymn CDs, the group of a "Playlist (by Group)",
     ...), else the **album** (`album`: the album or playlist), else the platform (`YouTube` / `SoundCloud`); the second line is the album
     after a publisher, else the platform. The YouTube channel is never shown. An instrumental recording (`instrumental` = 1) has
     ` · Instrumental` (muted) after its first line. A tap opens the stored `url`. A link with neither a publisher nor an album is one a book's
     editor chose (the Spanish and German youth books): it is always shown. A hymn with **no** recording of its own shows those of the nearest
     hymn above it (parent, grandparent, ... up to 5 steps, never past a New Tune whose parent has another tune, §5.1); when that hymn is in another language (`HymnGroup.getLanguage`: English for E/BF/NS/CH,
     Chinese for the four Chinese books, the youth books and supplements in their main language) each first line starts with the language
     (`English – NYCYPCD`) so it is not taken for a recording in the hymn's own; a hymn with any recording of its own gets nothing inherited.
   - **Piano videos**: `link` rows of kind `piano` where `hymn_id` is this hymn, else its parent (never for an own-tune New Tune, §5.1) (`n_order`): the label (`1st tune`) over
     `Piano video · YouTube`. A tap opens the url with `https://www.youtube.com/watch?v=` replaced by `https://www.youtube.com/embed/` (the web
     app opens the watch address as it is).
   - **New tunes**: the hymns whose `parent_hymn` is this hymn, `hymn_group` `BF` and `new_tune` = 1, in number order: a row `BF94 · New tune` /
     `Same words, another tune · opens in the app` (arrow `›`; a tap opens that hymn in the app), and under it, indented, that tune's own
     recordings (first line as above, second line `BF94 · <album>`). A New Tune itself, or a hymn with none, has no such section.
   - **Showing more**: a section shows its first 3 links (a New Tune with its recordings counts as one) and a button `Show N more`, which
     becomes `Show fewer`; the links of a book's editor do not count and are always shown. Nothing is dropped for being the 4th: every known
     recording of the hymn is linked (the import no longer caps them), and a recording of the same title in the same album twice is one
     (a re-upload; `link_meta.py` keeps the first).
   - **Wide windows**: where the window is 600 dp wide or more (an unfolded foldable, a tablet; `values-w600dp`/`w840dp` `links_columns` = 2 or 3)
     the links are cards in a grid (icon, publisher, the album on up to two lines) instead of rows, a New Tune's recordings following it.
     The web app does the same by the width of the card (a container query of 520 px), and has a last section `SEARCH` with `YouTube` and
     `SoundCloud` (a search for the hymn, as the Android YouTube button makes it), so every hymn page has the card.
   The card does not depend on the YouTube button setting. (Until v5.8.3 these were stanzas named `YouTube Link` / `SoundCloud Link`; there are none any more.)

Cards: 10dp side margins, 5dp radius, light elevation. Page and card colours: §6.3.

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
    else:
        emit(bold(stanza.no) coloured + newline + text)
        if hymn has exactly ONE 'chorus' stanza and chorusText != '':
            emit(chorusText)                     # repeat the chorus after each later stanza
```

Consequences worth testing:

- A single chorus is shown where it sits *and* repeated after every following stanza. Stanzas before the chorus's
  position don't get it (usually only stanza 1, which the chorus follows directly anyway).
- With 2+ chorus stanzas (E1118: brothers/sisters), each is shown only where it sits; nothing is repeated.
- "Coloured" = book day colour (Light) or night colour (Dark, Black). Body text and backgrounds: §6.3.
- Text alignment: left, except right for RTL books (`F`, `UR`).
- Font: the phone's own, except Urdu (`UR`), which is read in Nastaliq: the app bundles Noto Nastaliq Urdu (SIL Open
  Font License) and uses it for the subject, the lyrics and the Urdu rows of every hymn list. Android's own
  Arabic-script font is Naskh, the style of Arabic and Farsi, which Urdu readers find hard to read. The web app does
  the same through `:lang(ur)`.
- Font size = the setting (14/18/22/26/32 sp; default 18), applied to header and lyrics.
- Lyrics text is selectable.

**Columns.** In portrait each emitted block is one row. In landscape or on screens ≥720dp wide, blocks fill a
**two-column grid** left-to-right (stanza 1 | chorus, stanza 2 | chorus, …); full-width blocks (notes) close the
current row and take a row of their own. RTL books (`F`, `UR`) fill each row right-to-left instead (chorus | stanza 1),
so the stanza is read before its chorus. A web build SHOULD use CSS grid/columns at a similar breakpoint (with
`dir="rtl"` the grid runs right to left by itself).

### 6.3 Themes

The setting `theme` (§10) is **System default** (the default: follows the phone's dark theme), **Light**, **Dark** or
**Black**. Dark follows Material Design's dark theme: dark grey rather than black (black tires the eyes and smears on
OLED screens when scrolling), raised things (cards, drawer, dialogs) a little lighter, off-white text, the books'
lighter night colours, and the bars in a dimmed book colour. Black is the pre-v5.8 night mode, kept for reading in a
dark room on OLED phones.

| | Light | Dark | Black |
|---|---|---|---|
| Toolbar | book day colour | day colour 55 % over `#1D1F23` | black |
| Button bar (pill) | book day colour | day colour 70 % over `#1D1F23` | black |
| Page background | `#F4F6F9` (the Settings page's; cards, bars and the drawer are white on it) | `#121316` | black |
| Cards (header, lyrics, details) | white, elevated | `#1D1F23`, elevated | black, no shadow |
| Lyric text | `#4E4E4E` | `#E3E4E7` | `#CCCCCC` |
| Stanza numbers, chorus, "Hide" | book day colour | book night colour | book night colour |
| Count beside OTHER LANGUAGES | `#EEF1F4` | `#2E3137` | `#2A2A2A` |
| Other screens (drawer, search, settings, dialogs, sheet viewer) | light (drawer white) | dark grey (`#121316` page, `#1D1F23` bars, `#1F2125` drawer, `#26292E` choice bars) | as Dark |
| Status bar | translucent black `#44000000` over content | same | same |

On Android the colours are in XML, apart from the code, like CSS beside HTML: `res/values/attrs.xml` names the hymn
page's colour roles (page, card, text, muted text, badge, highlight, and how the book colours are used: night tone or
day tone, how much the bars are dimmed), `values/themes.xml` and `values-night/themes.xml` give them for Light and Dark,
the overlay `ThemeOverlay.Hymns.Black` turns Dark into Black, and the layouts use them as `?attr/...`; the other
screens use `values/colors.xml` and `values-night/colors.xml`. The book colours stay in `HymnGroup` (one place when
adding a book); `style/BookColors` is the only code that combines them with the theme. Changing the theme recreates
the open screens. On Android 12+ the app also tells the system its choice (`UiModeManager.setApplicationNightMode`):
the splash at launch is drawn by the system before the app runs, and would otherwise follow the phone's light or dark
mode.

---

## 7. Hymn actions (button bar)

Every action also logs the hymn to History (§8.3).

### 7.1 Favorite

Toggle. Filled heart when the hymn is in Favorites. Stored as in §8.4.

### 7.2 Play melody

- File: `res/raw/m<tune lower-cased>.mid` (e.g. tune `5553216153222` → `m5553216153222.mid`). 8,325 of the 8,353
  hymns with a tune had a file (2026-10). Since hymnal.net serves no MIDI any more, MIDI for newer songs is generated from our own sheet by `tools/hymn-midi` (melody as written, generated left hand; 60 files on 2026-11-12). A song transcribed from a recording (BF473) has a tune code made from its own melody: the scale degrees (1-7, relative to its key) of its first 16 notes. Translations get the tune from their parent (§5.1), so they play too.
- Plays **looped** until stopped. Only one hymn plays at a time. Playback stops when the page changes, the app is
  paused, or the button is tapped again. Icon toggles ▶ / ❚❚.
- No tune, tune `0`, or no file → toast "Sorry! hymn not available".

### 7.3 Sheet music

Resolve the sheet (§11.1). If none → toast "Sorry! sheet music not available". Otherwise open the viewer with
`id=<sheet hymn id>` and `lyrics=<this hymn id>`.

### 7.4 YouTube (optional; Settings → YouTube Button, a switch, off by default)

When the switch is on the button is shown on every hymn; a tap opens `https://www.youtube.com/results?search_query=` +
the query below, with the characters `+ . ; ! " ' : ,` removed and spaces as `+`. (Until v5.8.1 the setting also had a
"plays YouTube piano videos" choice; the videos are in the links card now, §6.1. An old setting of "search" becomes on,
"disabled" and "piano" become off.)

The search query:

| Book | Query | Example |
|---|---|---|
| `E` | `Hymn <no> <first_stanza_line>` | `Hymn 313 Christ the Rock the Rock eternal` |
| `NS` | `NS <no> <first_stanza_line>` | `NS 46 …` |
| every other book | `<first_stanza_line> <first_chorus_line>` | |

The web app has no button and no switch for this: the same search is the last row of the links card (`Search`: `YouTube ↗ · SoundCloud ↗`,
each opens in a new tab; the query is built the same way, and SoundCloud's is `https://soundcloud.com/search/sounds?q=`), so its card is on every hymn page.

Why the number: recordings of English hymns and New Songs are usually titled with it ("Hymn 313", "NS 46"), and
other churches' hymnals number their hymns differently, so the number finds this hymnal's recordings first. With the
lines alone, a hymn with a common first line often brought up other churches' songs first. Adding a group name to the
query was tried and dropped: when a song has no recording it brings up unrelated videos instead. The other books keep
the lines until their recordings' titles are checked.

### 7.5 Similar tune (optional; Settings → Similar tune button, default off)

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

### 7.6 Share

The share icon opens a small rounded menu under the button (Android `PopupWindow`, `layout/popup_share.xml`: an icon tile and a label per action):

- **Share lyrics**: the system share sheet (`ACTION_SEND`, `text/plain`) with the lyrics as plain text.
- **Share link**: the share sheet with `<HymnID> · <first line>` and, on the next line, the hymn in the web app:
  `https://lemuelinchrist.github.io/hymnsforandroid/#/h/<HymnID>`. It opens on any phone, Android or iPhone,
  with sheet music and nothing to install; for a group about to sing together.
- **Copy lyrics**: the same text to the clipboard, toast "Lyrics copied". Kept in the menu because people paste
  lyrics into slides and notes, and Android 7–9's share sheet has no Copy entry.
  The web app has the same Share button and menu (Share lyrics and Share link use the browser's share sheet where it has one; otherwise the menu offers Copy lyrics and Copy link).

The subject (`EXTRA_SUBJECT`) is `<HymnID> · <first line>`. The lyrics text is the web app's (`lyricsText`):

```
<HymnID> · <first line>\n\n
each stanza, all markup removed: <no>\n<text>\n\n   (a chorus: its note as "(<note>)\n" if any, no number;
                                                     a note or copyright: the text alone)
```

Why a menu and not one action: lyrics with a link appended would make everyone who pastes lyrics delete the link,
and a hidden long press for the link would go unnoticed.

---

## 8. Navigation, history and favorites

### 8.1 Reading flow

- The main screen is a horizontal pager over the hymns of **one book** in the order of §5.3. Swiping moves within
  the book; the toolbar title and colours follow the visible hymn. A swiped-to hymn opens at its top, even if its page
  was made (and scrolled) in advance, and with the toolbar showing, even if scrolling the last hymn had hidden it
  (else the new hymn's header would sit under the status bar). Android: once the pager is at rest, after it has moved
  the focus to the new page, because on Android 16 and up a page taking focus asks to be shown in full and the
  scrolling app bar hides itself for that.
- Switching to another language of the hymn being read (Other languages, drawer, the way back) keeps the reading
  place (the same fraction of the page, so the stanza being sung stays in view) and leaves a toolbar that scrolling
  had hidden hidden. A link to a hymn that is something else (a New Tune in the links card) opens it at its top with
  the toolbar showing, like any hymn.
- Opening a hymn from anywhere (search, related chip, drawer, back) switches the pager to that hymn's book if
  needed, jumps to it, scrolls it to the top and shows the toolbar.
- If the target hymn does not exist (stale history/favorite, or a typed number not in the book): go to the first
  hymn of its book and **remove the ID from History and Favorites**. If the book is unknown, show `E1`.
- On start: open the most recent History entry, else the first hymn of the book in the app's language (§10.1): `E1`
  in English, `C1` in Traditional Chinese, `Z1` in Simplified Chinese.

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
  add it.") with **Back up** and **Restore**; Settings → Favorites opens a dialog with both.
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

- Each book shows its name **in its own language**, big (Español, 中文 (繁), 補充本 (繁), 한국어, فارسی; English, Be Filled,
  New Songs, Children, Cebuano, Tagalog, Kiswahili and Kikuyu as they are), and under it, small, its name in the app's
  language and the number of hymns ("Spanish · 910 hymns"; "西班牙文 · 910 首詩歌" in Chinese). The translated name is
  left out when it would repeat the big one ("English" in English) and for a book in the app's own language (the four
  Chinese books in Chinese). The web app shows the same names: both read the `native_<code>` strings of the app's
  `res/values/strings.xml`. (Until 2026-11 the drawer showed English names for everyone.)
- A header (app icon, "Hymns"), then the list, then a fixed link at the bottom:
  - **The books**: every **enabled** book (§10) in display order, a fixed order the saints know. (v5.8 put a RECENT
    section of the latest books above it; it was taken out again on 2026-11-02 because saints are used to the old
    arrangement. The Hymn Numbers tab still lists hymns of the same number by recent use, §9.)
  - **Languages…**: opens Settings with the Languages (Hymn Books) dialog (§10, `disableLanguages`), to hide books
    never used. The setting is named with the word people look for ("Disable Languages" before v5.8, then "Hymn
    Books", which hid what it does); its summary says what it is for (`Simplify your view by hiding books you don't use (all 31 shown)`,
    then `Hiding Indonesian`, or `Hiding 5 of 28`) and the dialog is titled "Choose the languages to show".
- A row: the book's badge picture (36dp; the app's own pictures since its first versions, kept as they are even
  where their letters differ from the code: H for English, B for Cebuano, Ch for Children), the book's own name, and the
  small line (at most two lines). The current book has a rounded highlight in a tint of its
  colour, in both sections: by day 14 % of its day colour over white, its name darkened; at night 20 % of its night
  colour over the drawer, its name in the night colour (§6.3).
- The lists are made again each time the drawer starts to open.
- Selecting a book while viewing hymn H: if H is already in that book, just close. Else if `relatedIn(H, book)`
  exists → open it and remember (§8.2). Else → open `<book>1` (first hymn of the book).

---

## 9. Search / Index

Opened from the toolbar search icon. One search box shared by 4 tabs (with icons); each tab remembers its own query.
Tapping a result returns to the reader and opens the hymn (open and remember). Scrolling the list hides the
keyboard. Tabs that can't be searched (Favorites, History): when the search box gets focus there, jump to Search.

**The rule that must not break: number lookup in the meetings.** A hymn is called out, the saint taps Search and
types the number. So Search always opens on Hymn Numbers (never "the last tab"), with the number keypad up at once.

### 9.1 Tabs

| # | Tab | Keyboard | Empty box shows | Typing |
|---|---|---|---|---|
| 0 | **Hymn Numbers** (first, default) | number keypad | current book by number | `no` (word filter, §9.4) in all enabled books; order `CAST(no AS int)`, then the same number's books in the drawer's RECENT order (the current book, then the books of the latest hymns in History, up to 4 in all), then the other books in drawer order. **Submit** (Enter) jumps straight to `<book><typed number>`. Rows `<ID> - <first stanza line>`. |
| 1 | **Search** | text | the current book's lists (§9.2) | one list of hymns from everything (§9.3) |
| 2 | **Favorites** | none | favorites, with Back up / Restore (§8.4) | not searchable |
| 3 | **History** | none | history | not searchable |

Every row shows the book icon of the hymn on the left. The title bar, search box and tabs stay at the top while a
list scrolls.

Tapping the box on Favorites or History (which show an empty box) goes to the Search tab with its words.

Why one Search tab: the app used to have separate tabs for First Lines, Subjects, Authors, All Lyrics and Music, so
the user had to guess where a word was before searching. All Lyrics listed stanzas, not hymns (a hymn showed once per
matching stanza), had no exact phrase, ignored hidden books, and SQLite `LIKE` ignores case only for A–Z.

### 9.2 Search tab, empty box: the current book's lists

A row of choices above the list, **First Lines** (default) · **Subjects** · **Authors** · **Tunes**, each for the
current book only, so nothing that could be browsed before is lost:

| Choice | Lists | Row text |
|---|---|---|
| First Lines | first stanza **and** first chorus lines, merged, sorted alphabetically (case-insensitive, ignoring leading spaces and quote marks `"'“”‘’«»„¿¡`, locale collation) | `<line> - <ID>` |
| Subjects | hymns with a main category, in database order | **`<main> - <sub>`** (just `<main>` without a sub-category) / `<ID> - <first stanza line>` |
| Authors | hymns with an author or composer, by the author shown (no author = `Unknown`), then composer, leading quote marks ignored | **`<author> - <composer>`** (empty→`Unknown`) / `<ID> - <first line>` |
| Tunes | hymns with key and tune, by tune | `<key> - <ID>` / first stanza line / `Tune: <tune>` |

Subjects, Authors and Tunes use each hymn's values as its page shows them: an empty author, composer, key, tune or
subject (with its sub-category) comes from the parent, grandparent… (§5.1). Translated books mostly have none of their
own, so without this their Authors list would be empty.

### 9.3 Search tab, typing: one list of hymns

Live as you type, about 150 ms after the last key, run off the main thread.

- **What is searched:** a `search` table, one row per hymn, every column in **search form** (§9.5): `first` (first
  stanza line), `chorus` (first chorus line), `subject` (main + sub category), `people` (author + composer), `music`
  (time + key + tune + meter), `body` (all its stanzas joined with ` | `), plus `id`, `grp`, `no` and `line` (the first stanza line as
  shown, else the chorus line). A hymn with a parent takes the parent's author, composer, key, tune, meter, time, subject and
  stanzas where it has none (§5.1), so a translation is found by what its page shows.
- **Terms:** the query in search form, split into words; text in quotes (`"…"`, `“…”`, `„…“`, `«…»`) is one term, an
  exact phrase. Duplicate terms count once. No word is dropped for being short, but a word of one or two Latin,
  Greek or Cyrillic letters or digits (`c`, `o`, `de`) only counts as a **whole word**, in the search and in the bold:
  as part of a word it is in nearly every hymn (`c major` found 9,055). Chinese, Japanese, Korean, Tamil… text has
  no spaces between words, so there short terms count anywhere.
- **A hymn matches** when every term is found, anywhere and in any order, in one of its six columns
  (`column LIKE '%term%'`, so parts of words count). Hidden books (`disableLanguages`) are always left out.
- **One row per hymn**, best first. `phrase` = the whole query in search form (quotes removed):

  | Score | When |
  |---|---|
  | 100 | `first` starts with `phrase` |
  | 90 | `first` contains `phrase` |
  | 80 | `chorus` contains `phrase` |
  | 70 / 60 | every term in `first` / in `chorus` |
  | 50 / 40 / 30 | every term in `subject` / `people` / `music` |
  | 26 | `phrase` in the stanzas as whole words |
  | 23 | every term in the stanzas as a whole word |
  | 20 | otherwise (terms as parts of words, or spread over several columns) |

  Ties: the current book first, then the drawer's book order (§3.2), then the number.
- **Books:** two choices above the list, `<current book> · n` and `All books · n` (a dot, not brackets: names like "Chinese (Traditional)" have their own). It starts on the current book, or on
  All books when the current book has no result; the user's choice is kept while typing and reset when the box is
  emptied. This is how to search only one book (for example only New Songs): search from a hymn of that book.
- **Row:** `**<ID>** - <line>`, the matched terms in bold. When the hymn did not match on its first line, a second,
  smaller grey line shows why: the first chorus line, `Subject: <main> – <sub>`, `Author: … · Composer: …`,
  `Key: … · Tune: …`, or the stanza line with the most of the terms (the first one with all of them) other than the
  first line. No second line when it would only repeat the first.
- **A hymn number or ID typed** (`123`, `#123`, `NS 151`, `ns151`, `e8`; a 1–3 letter book code, optional space or
  `-`, digits): if that hymn exists the list is only a first row **Go to `<ID>`** (a bare number means the current
  book), and **Enter** opens it. Otherwise the words are searched as usual and Enter just hides the keyboard.
- **The table is built on the phone**, not shipped: in the background the first time the app runs after an install or
  update (about 1.2 s in a release build on an emulator, a few seconds on a slow phone; it adds about 20 MB on the
  phone and nothing to the download). It is its own database file, `search.sqlite`, whose `user_version` is the app's
  `versionCode`, so building never locks the hymn database and an update rebuilds it. Typing before it is ready shows
  "Preparing the search… (once after each update)" and searches as soon as it is ready.

### 9.4 Word filter (Hymn Numbers tab)

```
q = query with ' replaced by space, and ^ " & % $ @ . , ! removed, trimmed
words = q.split(' ')
keep words[0] always; keep later words only if length >= 3
column matches  <=>  every kept word w:  column LIKE '%w%'   (SQLite LIKE: case-insensitive for ASCII only)
```

### 9.5 Search form of a text (MUST be identical everywhere)

Markup and comments become spaces, `&nbsp;` and `&amp;` are word breaks; accents removed (`NFD`, drop U+0300–U+036F,
`NFC`); lower case; final sigma `ς` → `σ`; every run of characters that are not letters, marks or digits
(`[^\p{L}\p{M}\p{N}]`) becomes one space; trimmed. Marks are kept because they are the vowel signs of Tamil, Burmese
and other scripts. The Android app (`SearchText.norm`), the web app's `build.py` and `db.js` must give the same result,
so the same words find the same hymns everywhere. Known side effect: Russian `й` loses its breve and becomes `и`, so
`и` also finds `й`.

### 9.6 The web app

The web app (§14.2) searches the same way (since 2026-10-28): the same six columns with the parents' values, the same
search form, quotes, short-word rule, scores, ties and "why" line, built by `tools/web/build.py` and searched by
`search()` in `tools/web/src/db.js`. Differences: it has no browsing lists in the search (it browses hymnals by number
and category on their own page), it shows hidden books when they are the current one, and a hymn ID that does not
exist says "No hymn …" instead of searching the words.

---

## 10. Settings

Stored in platform preferences (web: `localStorage`). Keys are the Android keys; keep them if you plan migration tools.

| Key | Type | Default | Values / effect |
|---|---|---|---|
| `FontSize` | string | `18f` | `14f` Small, `18f` Medium, `22f` Large, `26f` Extra Large, `32f` XXL (sp) |
| `theme` | string | `system` | `system` / `light` / `dark` / `black` (§6.3). Replaced `nightMode` (bool) in v5.8: on the first start after the update, `nightMode` on becomes `dark`, else `system` |
| `keepDisplayOn` | bool | false | keep the screen awake (web: Screen Wake Lock API) in reader and sheet viewer |
| `disableLanguages` | set of codes | `{I}` | hidden books: removed from drawer, the other-languages grid, and from search (§9) |
| `otherLanguagesFolded` | bool | false | the other-languages grid on the hymn page is folded (§6.1); set by its Hide/Show row, not in the Settings screen |
| `youtubeSearch` | bool | false | show the YouTube button, which searches YouTube (§7.4). Replaced the string `youtubeButton` (`disabled` / `piano` / `search`) in v5.8.2 |
| `similarTune` | bool | false | show Similar Tune button (§7.5) |
| `sheetMusicType` | string | `pianoSvg` | `pianoSvg` = Piano, `guitarSvg` = Guitar: the viewer's starting mode (§11) |

**The Android Settings screen (v5.9)** is one scrolling page of cards; every choice is on the page: a switch, or a row
whose value opens a short list of choices. On a tablet or an unfolded phone the page (and the About page) is a centred column at most 640 dp wide. From the top:

1. **Text size** and **Theme**: two plain rows in one card, like App language. The row shows the current choice
   (Small to XXL; System default, Light, Dark, Black) and opens a rounded popup: Text size a five-step slider with the step's name and a sample stanza at that size (OK saves it); Theme four small pictures (System, Light, Dark, Black) with
   their names, the current one framed. (A first v5.9 draft had five "A" steps and the four pictures on the page itself;
   that looked too flashy next to the rest, so the page has rows and only the Theme popup keeps the pictures.) The web app keeps the steps and pictures on the page.
3. **Sheet music**: a two-part switch, Piano | Guitar.
4. **On the hymn page**: three switch rows: YouTube button, Similar tune button, Keep screen on.
5. **Language**: one row, **App language**, that opens a dialog: Phone's language (the default), English, 繁體中文,
   简体中文 (§10.1).
6. **Hymn books**: one row (up to three coloured book chips and a summary such as "Hiding Indonesian") that opens the
   "Choose the languages to show" dialog (every book with its icon, hymn count and a tick; at least one stays shown).
   The drawer's "Languages…" link opens Settings with that dialog already open.
7. **Your data**: **Favorites** (opens the back up / restore dialog, §8.4) and **Chord edits** (opens the chord edits
   dialog: the edited sheets, Export, Import, §11.5; its summary counts the edited sheets).
8. **Share the app**: a QR code shown on the page, with a switch **Android | iPhone and all devices**. Android points to
   the app's Google Play page; iPhone and all devices points to the web app
   (`https://lemuelinchrist.github.io/hymnsforandroid/`) and its note says how to add it to the Home Screen. Under the
   code: the address, **Copy link** and **Share link** (the system share sheet). The QR code is drawn on the phone
   (error correction level M), black on white in every theme.
9. **About** (a row that opens its own page): the app name and version, **Send feedback** (an email to the project's
   support address, `hymnsforandroid.support@gmail.com`, with the version in the subject) and **Source code** (the
   repository, `github.com/lemuelinchrist/hymnsforandroid`). The web app's About card shows the same lines. The web app has the same **Share the app** card (QR code with the Android | iPhone and all devices switch, opening on the web app; Copy link, and Share link where the browser can share), among its own cards (Display, Language, Languages (Hymn Books), Chord edits, Offline, Share, About). Its **Text size** and **Appearance** (the theme) are drawn like the Android ones, above the cards: a header with the chosen name on the right, five "A" steps (the web's seven sizes are reached with the A buttons on a hymn; the steps are the middle five) and four theme pictures.

### 10.1 The app's language

The app's own texts (menus, buttons, labels, dialogs, the book names, the sheet viewer's buttons) are in English,
Traditional Chinese or Simplified Chinese; the hymns themselves are always in their book's language.

- **Choice**: Settings → Language → App language: *Phone's language* (default: the phone's language when the app has
  it, else English; Hong Kong, Macau and Taiwan get Traditional, mainland China and Singapore Simplified) or one of the
  three (English, 繁體中文, 简体中文), each written in its own language so it can be found from any language. Android keeps the choice (AppCompat
  per-app language; Android 13 and later also list it under the phone's App languages). The open screens are redrawn at once.
- **Book names**: the drawer and the books dialog show each book's own name with the translated name under it (§8.5);
  sentences and the Other languages grid's spoken names use the translated name (英文, 中文（繁體）…, Children =
  英文兒童), except **Be Filled** and **New Songs**, which keep their English names in every language. The search
  title and its book filter use the book's own name. The book codes (E, C, CS…) never change.
- **The launcher label** is 詩歌 / 诗歌 in Chinese, Hymns in English.
- **First hymn**: someone with no History starts on the first hymn of the book in their language (§8.1): C1 or Z1.
- **Spanish is not offered**: the Spanish saints' hymnbook is new, and the app should not look like a replacement for
  the printed book, so the app's own texts are not translated into Spanish (the Spanish hymns are, of course). The
  draft is kept on the branch `localization-es-ui`.
- **Not translated**: the " (New Tune)" after first lines and in the header (it is part of the search index and the
  History text), the YouTube search words (they match how recordings are titled), and the Send feedback email subject.
- A favorites backup's heading and note are written in the app's language; Restore reads only the hymn numbers, so a
  backup made in any language restores in any other.
- Android: `res/values/strings.xml` (English), `values-b+zh+Hant`, `values-b+zh+Hans`; a
  string without a translation shows in English. `StringsTranslationsTest` checks that a translation has no string
  English lacks and the same placeholders. The sheet viewer gets the language as `&lang=zh-Hant|zh-Hans` (§11.2).
- **The web app** speaks the same three languages. Settings → **Language** → *App language* is a list with the same
  choices (*Phone's language* by default: the first language of the browser's list that the app has, Traditional for
  zh-Hant/TW/HK/MO, else Simplified); the choice is kept on the device and the screen is written again at once. Its
  texts are in `tools/web/src/strings.js`, keyed by the English text (a text without a translation shows in English;
  most have the same words as the Android strings, the chord editor's the same as `assets/viewer/strings.js`). The book
  names (the big native name, the translated name and the count under it, the sentences and the labels of inherited
  links) and the book a new person starts in are the Android app's own: `build.py` reads `book_<code>`,
  `language_<code>` and `first_hymn` from `res/values-*/strings.xml`. The page title, the install hint, the keyboard
  shortcuts and the favorites text it exports are translated too; the manifest's name and the home-screen title stay
  "Hymns" (a web app manifest has one name).

Changing any setting refreshes the reader (theme, font, drawer, current page) when returning to it.

Hidden state (not user-visible settings): History, Favorites (§8), chord edits (§11.5), and the database version (§14.5).

---

## 11. Sheet music subsystem

### 11.1 Which sheet to show

```
sheetId(h) = h._id            if sheetMei/<h._id>.mei exists
           = h.parent_hymn    else if parent set, h is not an own-tune New Tune (§5.1), and sheetMei/<parent>.mei exists
           = none
lyricsId  = h._id             (passed so a translation can overlay its own words)
```

### 11.2 Viewer contract

The viewer is a self-contained web page (`assets/viewer/`). Hosts open:

```
viewer/index.html?id=<sheetId>&variant=piano|guitar&dark=0|1[&lyrics=<lyricsId>][&edit=1][&lang=en|zh-Hant|zh-Hans]
```

- `lang` is the language of the viewer's own buttons and messages (`assets/viewer/strings.js`, §10.1); English when
  missing. The sheet itself (titles, lyrics, the capo line) follows the hymn.
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
  swapped); verses 2+ below the music as text in columns; footer `www.hymnal.net`, or `Hymns For Android` on a
  sheet made for this app (transcribed from a recording: its MEI head has
  `<identifier type="source">Hymns For Android</identifier>` in `pubStmt`, and the footer shows that text). The web app
  shows the same line under its sheets.
- Music: Verovio renders the MEI to SVG at page width, `scale` 40, `breaks: auto`, `lyricWordSpace` 3,
  `lyricSize` 4.5, `fontTextLiberation` true, margins 20, no Verovio header/footer.
- **Chords-only sheets.** A song we have words and chords for but no notes yet (15 Be Filled songs on 2026-11-14,
  chords from songbase.life) has a sheet marked `<identifier type="kind">chords</identifier>` in `pubStmt`. Its MEI
  is one bar per line of the words, each word (or part of a word where a chord changes inside it) a quarter note that
  only carries the syllable and the chord; stanza numbers and "Chorus" are `<dir>` labels, stanzas without chords are
  in `<back>`. Such a sheet is always shown as chords over the words (staff hidden), one line per bar, every label in
  a box; the Staff and Edit chords buttons are hidden. Piano shows the chords at sounding pitch, Guitar the capo and
  shapes worked out from the key as for any sheet; transposing works. It has no tune code and no MIDI. Made by
  `tools/chord-sheet/make_chord_sheet.py`; when the melody is written the real sheet replaces the file.
- Tap anywhere (not on the bar) toggles a top bar with: **Back**, **Piano | Guitar**, **− key +** (transpose, ±6
  semitones; shows tonic and offset, e.g. `B♭ (+2)`), **Hide/Show staff** (`Staff` toggle under 400px, or under 500px in the dark theme where the paper button also needs room); in the dark theme also the round **paper** button (◐), which switches between dark paper and light paper (below). State resets
  each time the sheet is opened; it starts in the `sheetMusicType` variant; guitar starts with the staff hidden.
- Pinch to zoom changes `scale` (20–100) and re-lays-out (reflows, never scrolls sideways). Resize re-lays-out.
- Night mode (the app's theme is dark; the page is given `dark=1`): CSS vars switch to dark and **the music is drawn in its
  own colours**, not inverted (it was `filter: invert(0.91)`, which gave bright hairline staves on near-black). Notes,
  text and stems `#d6d6d6` on a `#1a1a1a` page; the staff `#8e8e8e` and bar and ledger lines `#b4b4b4`, so the notes
  stand out against the staff; the thin lines a little thicker (Verovio's units: staff line 13 → 17, bar line 27 → 30,
  stem 18 → 22, ledger 20). Verovio gives glyphs no fill and strokes `currentColor` through an id rule, so the page sets
  `fill` and `color` on the music svgs and the line strokes by CSS (the web app needs `!important`, having no `#music`).
  The web app does the same on `.sheet.dark`, and prints black.
- **Paper button** (dark theme only): the sheet on **light paper**, black on white with the page and bar light, instead of
  dark paper. It is the colours only, nothing is laid out again. The choice is kept and used for every sheet (Android: the
  `sheetLightPaper` preference, set through the viewer's bridge and passed back as `paper=light`; web: `sheetPaper` in
  the local store, a white page behind the sheet, the book's day colour). The button is not there in the light theme.
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

#### 11.4.1 Native rendering alternative

A native app that doesn't want a WebView can render the same MEI with Verovio's C++ library, or reuse the viewer's
algorithms (they are small) with a different engraver. The WebView route is what the app ships and is recommended.

### 11.5 Chord edits

For a tablet on the piano: the melody and words stay, the chords get passing chords and embellishments. The same
feature, file format and rules as the web app (`tools/web/README.md`, "Chord edits"), so edits move between the two.

- **Where:** only with `edit=1` (big screens), on the piano sheet with the staff shown. The bar gets **Edit chords**,
  and **Original chords** (shows the sheet without this device's edits) once the sheet has edits. Choosing Guitar,
  hiding the staff or Original leaves edit mode. Phones show the edits but cannot edit (no room for the panel).
- **Editing:** a panel at the bottom. Tap a bar on the sheet (a note or chord also picks its beat); a strip shows the
  bar's beats (half beats in 4/4-type meters, plus every note's start); build the chord with buttons (root, ♭/♯,
  quality, bass) or type it (`bb7/d` is stored as `B♭7/D`); Remove chord, Undo, Original bar, Done, ‹ › for the
  neighbouring bars. Changed chords are drawn red (light red `#ff8a80` in night mode); the
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
- **Settings → Chord edits:** lists the edited sheets, newest first (`E8 – first line`, `N bars · date`; a tap opens
  the sheet), with **Export** (Send through the share sheet, or Save as a file; `hymns-chord-edits-<date>.json`, the
  stored file plus `"exported"`) and **Import** (a file picker; asks "Import chord edits?" listing the sheets, then
  says how many were imported and kept). A sheet replaces this device's edits of it unless it was edited later here.
  Bars and chords that are not well formed are left out. A chord edits file tapped in another app (email, Drive,
  Files) opens the same import question (`RestoreFavoritesActivity`, which also takes favorites backups).
- **Into the sheets:** an exported file sent in goes through `tools/svg-to-lilypond/tools/chord_edits.py import`
  (`tools/web/README.md`), which changes the `.ly` and MEI files for everyone.

### 11.6 Sheet lyrics overlay (`sheetLyrics/<hymnId>.json`)

The file is named with the hymn's **current** book code (`FRY18.json`, not the old `FY18.json`): the app looks the file up by the hymn ID, so a renamed book code needs its files renamed too (v5.8 renamed FY to FRY and the 104 French Youth files were left behind until v5.9; the unit test `SheetLyricsFilesTest` now guards it). The 77 French hymns whose words the code could not fit to the notes were fitted by hand (`tools/sheet-lyrics/overrides/`, v5.9), to be checked by a French speaker.

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
| 3 | ~~Subjects/Authors with an empty query list *all* enabled books.~~ | Done in v5.7: the Search tab's lists show the current book (§9.2). |
| 4 | ~~All Lyrics ignores disabled books.~~ | Done in v5.7: Search leaves hidden books out (§9.3). |
| 5 | Hymn Numbers' word filter ignores 1–2 letter words after the first; `LIKE` is accent- and (non-ASCII) case-sensitive. | Done for the Search tab in v5.7 (search form, §9.5); Hymn Numbers only matches digits. |
| 6 | Similar Tune needs **two** other hymns before it shows a list (one match → "No Hymn with similar tune"). | Fix: show the list for ≥1. |
| 7 | Similar Tune uses a prefix match on the tune code, so a longer tune starting with the same digits counts as similar. | Decide (exact match is stricter). |
| 8 | History only records swiped-to hymns if they were opened deliberately or a button was tapped. | Keep (avoids flooding history while browsing). |
| 9 | ~~Copy keeps `<i>`/`<u>` tags in the clipboard text.~~ | Done in v5.8: Share/Copy strip all markup (§7.6). |
| 10 | Stanza labels like `copyright`, `chorusverse`, `-` are shown verbatim as the stanza number. | Decide: hide `-`, style `copyright` as a note. |
| 11 | The old `tune` table was keyed by **hymn ID**, not tune code (name was misleading). | Done in v5.8.2: it is now the `link` table (hymn_id, kind, label, url, n_order). |
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
| Theme | System default / Light / Dark from `prefers-color-scheme` and a setting |
| Swipe between hymns | horizontal pointer/touch gestures + ←/→ keys; prefetch neighbours |
| Favorites and Settings | no bottom tab bar (it took height from the hymn): the top bar has the Settings gear (the Android app's) and, wider than a phone, a Favorites star; on phones Favorites is the home page's card, shown also when empty so its import stays reachable |
| Hymn heading (phones, tablets) | the subject (category · subcategory) is the heading, in a bigger size; the first line is left out of sight (stanza 1 shows it right below; it stays for screen readers and print). Wide screens show both |
| Lyrics / Sheet music tab strip (phones) | fixed at the top of the page (scrolls away with it, does not reappear on scrolling up); the sheet hides its own bars separately |
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

The sheet viewer footer credits `www.hymnal.net`; keep it. Sheets made for this app (not from hymnal.net) say
`Hymns For Android` there instead (§11.3). Verovio is LGPL-3.0 (`viewer/VEROVIO-NOTICE.txt`) — ship
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
| 4 | Related on `E1`, Indonesian disabled (default) | No `I1` chip; chips for SW 36, GK 89, BUR 1, TA 1, UR 1, RUS 1, K 1, J 1, G 1, F 1, FR 216, C 1, CB 1, Z 1, SK 1, T 1, S 1, KI 24, POR 1 |
| 5 | Chorus repetition | A hymn with one chorus after stanza 1 shows: 1, chorus, 2, chorus, 3, chorus… |
| 6 | Two choruses (`E1118`) | `1`, chorus with `(Sisters sing)`, chorus with `(Brothers sing)`, `2`, `3` — no repetition |
| 7 | Note stanza (`E66` `end-note`) | Full-width italic red line "(Repeat the last two lines of each stanza)" |
| 8 | Farsi hymn | Right-aligned, chorus not italic |
| 9 | Drawer: on `E52` choose French | Opens `FR10` (E52's French translation); Back returns to `E52` |
| 10 | Drawer: on a hymn with no Kiswahili translation, choose Kiswahili | Opens first hymn of `SW`; back stack unchanged |
| 11 | Search Hymn Numbers, type `12`, submit | Opens `<current book>12` |
| 12 | Search tab, empty box, in English | First Lines: English first stanza and chorus lines A→Z, quotes ignored for sorting |
| 13 | Search `glory be to god the father` in English | `E1` first, no second line; every hymn at most once |
| 13a | Search `"ancient of days"` | Only hymns with the three words together (E3, E14, E946 in English), the stanza line shown under each |
| 13b | Search `watchman nee` from a New Songs hymn | Starts on `New Songs (n)`; rows show `Author: …`; `All books` adds the English hymns |
| 13c | Search `ns 151`, Enter | Only the row `Go to NS151`; Enter opens `NS151` |
| 13d | Search `бог` (lower case) | Finds the Russian hymns with `Бог` |
| 14 | Play on `E1` | Loops `m5553216153222.mid`; stops when swiping to `E2` |
| 15 | Sheet music on `E1`, guitar | Shows `(Guitar: Capo 1)`, chord chart (staff hidden); key label `A♭` |
| 16 | Sheet `NS576` guitar | `(Guitar: Capo 3)` (key F) |
| 17 | Sheet on `FR10` | Opens `E52`'s sheet with French verse-1 syllables, French title, French verses below, `FR10` at top-right |
| 18 | Sheet on a hymn with no own MEI and parent without MEI | "Sorry! sheet music not available" |
| 19 | Transpose `E1` +3 | Key label `B (+3)`; guitar capo recomputed (B → capo 4) |
| 20 | Piano videos link on `E8` (links card) | Opens `https://www.youtube.com/embed/DL6lgn78DcU` |
| 21 | Favorites export, then import on a fresh install | Same set of favorites |
| 22 | History contains a removed ID | Opening it goes to the book's first hymn and the ID disappears from History and Favorites |
| 23 | Theme Dark / Black / System default with the phone dark | Dark: dark grey page, lighter cards, dimmed book-colour bars, every screen dark; Black: black page and toolbar, `#CCCCCC` text; stanza numbers in night colour; sheet viewer dark |
| 24 | Landscape / wide screen | Lyrics in two columns, notes full-width |
