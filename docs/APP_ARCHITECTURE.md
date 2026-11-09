# Hymns for Android: App Architecture Deep-Dive

This document provides a detailed architectural overview of the main Android application located in the `app/` directory. It is intended to be a supplement to the main `AGENTS.md` file.

For *what* the app does (exact display rules, search behaviour, settings, data quirks), see [`HYMNAL_SPEC.md`](./HYMNAL_SPEC.md). This document is about *how the code is organized*.

## Core Components and Flow

The application follows a model-view-controller-like pattern, with clear separation of concerns between the UI (Activities/Fragments), data management (DAOs/Entities), and navigation/business logic.

The overall flow is as follows:
1.  `HymnsActivity` serves as the main entry point and primary controller.
2.  It initializes a `HymnBookCollection`, which manages the `ViewPager` for swiping between hymns.
3.  The `HymnBookCollection` uses an inner `HymnBookGroup` adapter to provide hymn pages.
4.  The `HymnBookGroup` adapter fetches a list of hymn numbers for the current hymn book from `HymnsDao`.
5.  For each page, the adapter creates a `ContentArea` fragment.
6.  The `ContentArea` fragment is given a `hymnId`. It then uses `HymnsDao` to fetch the full `Hymn` object and its `Stanza` objects.
7.  `ContentArea` renders the hymn's lyrics (using `LyricsArea`), the other languages' numbers (using `OtherLanguagesSection`) and initializes the action buttons (`PlayButton`, `FaveButton`, `SheetMusicButton`, etc.).
8.  When the user swipes to a new page, the `ContentArea` fragment for that page becomes visible and notifies its listeners: `HymnsActivity` updates the title bar and colours, and `HymnBookCollection` stops any playing melody and logs the hymn to history.

---

## Key Class Descriptions

Before any screen opens, `HymnsApplication` sets the night mode from the Theme setting (`style/Theme.apply`). The colours themselves are in XML, not code: `values/attrs.xml` names the hymn page's colour roles, `values/themes.xml` and `values-night/themes.xml` set them for Light and Dark, `ThemeOverlay.Hymns.Black` (applied by `HymnsActivity`) makes Black, and the layouts use them as `?attr/...`; the other screens use `values/colors.xml` and `values-night/colors.xml`. The book colours stay in `HymnGroup`; `style/BookColors` combines them with the theme (toolbar, button pill, stanza numbers, chorus, "Hide").

### 1. `HymnsActivity.java`
-   **Role:** Main Controller / Entry Point.
-   **Responsibilities:**
    -   Manages the main UI, including the `Toolbar` (Action Bar) and the `DrawerLayout` (for the navigation drawer: a header, the list of books filled by `HymnDrawer` in their fixed order, and a "Languages…" link to Settings (the Languages (Hymn Books) setting)).
    -   Initializes and holds a reference to `HymnBookCollection`.
    -   Handles user interactions from the menu (Search, Settings) and the navigation drawer (switching hymn books).
    -   Listens for `onLyricVisible` events from `ContentArea` to update the hymn title and theme colours in the action bar.
    -   Starts `SearchActivity` and receives the selected hymn via `onActivityResult`.
    -   Handles Back: closes the drawer, else goes to the previous hymn (`HymnBookCollection.goToPreviousHymn`), else leaves the app.
    -   Shows and hides the round back-to-hymn button (`showBackToHymn`, `hideBackToHymn`; the view `back_to_hymn` in `main_hymns_activity.xml`), in the left hymn's book colour.
    -   Implements `HymnSwitcher`, which the related-hymn chips and the similar-tune dialog use to open a hymn (`HymnsActivity.getHymnSwitcher()`).
    -   Re-applies settings (theme, font, keep-screen-on, disabled languages) in `onResume` when a preference changed.

### 2. `HymnBookCollection.java`
-   **Role:** Navigation and ViewPager Logic.
-   **Responsibilities:**
    -   Acts as the primary coordinator for the `ViewPager`.
    -   Creates and caches one `HymnBookGroup` adapter per hymn book, on first use.
    -   Contains the core logic for switching between hymns (`switchToHymn`, `switchToHymnAndRememberChoice`) and translating between related hymns in different languages (`translateTo`). A switch to a related hymn (`switchToRelatedHymn`) also asks `HymnsActivity` to show the round back-to-hymn button for the hymn left; any other hymn shown (`onLyricVisible`) hides it. The hymn left is remembered as a scroll fraction (`ContentArea.getScrollFraction`) and the related hymn is scrolled to it (`scrollToFraction`, kept while the page is laid out); other switches open at the top. A book is opened on the target page at once (`switchHymnBook(group, hymnNo)`), so hymn 1 is never shown on the way.
    -   Maintains a `HymnStack` (`utils/HymnStack.java`) of hymns for the Back button. `switchToHymnAndRememberChoice` pushes the current hymn and then the target; plain `switchToHymn` and swiping do not touch the stack.
    -   Uses `HymnsDao` to get the list of hymn numbers for a given hymn book.
    -   On start (`refresh`), opens the most recent hymn from history, or `E1`.

### 3. `HymnBookGroup` (Inner class of `HymnBookCollection`)
-   **Role:** `ViewPager` Adapter.
-   **Responsibilities:**
    -   Extends `FragmentStatePagerAdapter`.
    -   Provides the `ViewPager` with `ContentArea` fragments for each hymn.
    -   Holds the ordered list of hymn numbers for a specific hymn book.

### 4. `ContentArea.java` (package `content`)
-   **Role:** View for a Single Hymn.
-   **Responsibilities:**
    -   A `Fragment` that displays the entire content for one hymn (layout `content_area.xml` in every theme, coloured by the theme's attributes; the other-languages grid and the details rows are `other_languages_row.xml`, `other_languages_cell.xml` and `detail_row.xml`).
    -   Takes a `hymnId` and uses `HymnsDao` to fetch the complete `Hymn` object. If the hymn no longer exists, removes it from history and favorites and shows `E1`.
    -   Delegates rendering to helper components, all subclasses of `ContentComponent`:
        -   `Scripture` (plain Java, `content/`): reads a hymn's `verse` text into references and their links to the Recovery Version text (`https://text.recoveryversion.bible/...`); `LyricsArea` shows them as links in the Details card; the web app has the same rules in `tools/web/src/scripture.js`.
        -   `LyricsArea`: the header (category, meter, time, key, tune, verses (as links), author, composer) and the stanzas, including chorus repetition and the two-column layout in landscape (`layout-land/` and `layout-w720dp/stanza_linear_layout.xml`). Colours come from the theme's attributes (the layouts), `style/BookColors` and `style/HymnTextFormatter`; the font from `style/ScriptFont` (Noto Nastaliq Urdu, `res/font/`, for Urdu; the search lists use it too).
        -   `OtherLanguagesSection`: the "OTHER LANGUAGES" number grid under the subject (foldable; the setting `otherLanguagesFolded` is kept for every hymn).
        -   `LinksSection`: the "LISTEN AND LINKS" card at the bottom, built from the `link` table in sections (Recordings, Piano videos, New tunes) of rows (cards in a grid from 600 dp, `R.integer.links_columns`), each with the publisher and the album (`entities/Recording`, `HymnsDao.getRecordings`); a section shows 3 links and "Show N more"; the card hides itself when it has nothing.
        -   The button bar: `FaveButton`, `PlayButton` (loops `res/raw/m<tune>.mid`), `sheetmusic/SheetMusicButton`, `YoutubeButton` (with `YouTubeSearchLauncher`), `SimilarTuneButton`, `ShareButton` (share the lyrics or a web app link, or copy the lyrics). Each button logs the hymn to history when tapped.
    -   Fires the `onLyricVisible` event when it becomes visible to the user, signaling a page change.

### 5. `HymnsDao.java` (package `dao`)
-   **Role:** Data Access Layer.
-   **Responsibilities:**
    -   Encapsulates all SQLite database interactions. The database is `assets/hymns.sqlite`, copied to the app's database folder by `HymnsSqliteHelper` on first run and again whenever the app's `versionCode` changes.
    -   The `get(String hymnId)` method is the most critical. It fetches a `Hymn` and its `Stanza` objects.
    -   **Implements the "Parent Hymn" logic:** When fetching a hymn, it also fetches its parent (if one exists) and merges the data, providing a unified view to the rest of the app. This is a key piece of business logic located in the data layer.
    -   Provides the search queries (`getBy...`), which return a `Cursor` for the search lists, and `getHymnsWithSimilarTune` (see [`FEATURE_SIMILAR_TUNE.md`](./FEATURE_SIMILAR_TUNE.md)).
    -   Uses a small `QueryBuilder` to assemble the search SQL (word filters, disabled-language filter, ordering). Note that values are concatenated into the SQL string rather than bound as parameters; `QueryBuilder` strips quotes and a few special characters from search text, but `get()` concatenates IDs directly (the `link` lookup binds them).

### 6. `Hymn.java` / `Stanza.java` (package `entities`)
-   **Role:** Data Entities.
-   **Responsibilities:**
    -   Model the data from the `hymns` and `stanza` tables.
    -   `Hymn` also holds a few helpers: the related-hymn set (`addRelated`, `getRelatedHymnOf`), chorus/stanza counts, whether a sheet exists (`hasOwnSheetMusic` checks `assets/sheetMei/<id>.mei`), and melody playback (`playHymn`/`stopHymn` with `MediaPlayer`).

### 7. `SearchActivity.java` (package `search`)
-   **Role:** The Index / Search screen.
-   **Responsibilities:**
    -   A `ViewPager` with 4 tabs, each a `TabFragment` subclass in `search/fragments/`: Hymn Numbers, Search, Favorites, History. The adapters are in `search/searchadapters/` (most extend `HymnCursorAdapter`).
    -   `SearchTabFragment` (the Search tab): with an empty box it lists the current book with the old adapters (`FirstLineChorusAdapter`, `CategoryAdapter`, `AuthorAdapter`, `MusicKeyAdapter`); while typing it runs `HymnSearch` on a background thread and shows `SearchResultAdapter` (one row per hymn, matched words in bold, a "why it matched" line, an optional "Go to <ID>" row).
    -   `HymnSearch` reads the query (words, quoted phrases, a hymn ID or number), finds and ranks hymns in the `search` table; `SearchText.norm` is the search form shared with the web app. The table is built by `dao/SearchIndex` into its own `search.sqlite`, in the background, once per app version (started by `HymnsActivity`).
    -   One shared `SearchView`; each tab remembers its own query. The Hymn Numbers tab uses a phone keypad and jumps straight to the typed number on submit; in the Search tab, submit opens a typed hymn ID or number.
    -   Returns the chosen hymn ID to `HymnsActivity` with `setResult`.

### 8. `LogBook.java` (package `logbook`)
-   **Role:** History and favorites storage.
-   **Responsibilities:**
    -   A set of `HymnRecord` (hymn ID, group, first line, date), serialized to an internal file with `InternalStorage` (Java serialization). Two files: `logBook` (history, constant `ContentArea.HISTORY_LOGBOOK_FILE`) and `faveLogBook` (favorites, `FaveButton.FAVE_LOG_BOOK_FILE`).
    -   Reloads the file before every change, since several pages hold their own `LogBook` instances.
    -   `getOrderedRecordList()` returns newest first, at most 100.

### 9. `SettingsActivity.java` (package `settings`)
-   **Role:** The Settings screen: one scrolling page of cards (`layout/settings_activity.xml`), no `PreferenceFragment`.
-   **Responsibilities:**
    -   Each control reads and writes the default shared preferences under the keys the rest of the app reads
        (`FontSize`, `theme`, `keepDisplayOn`, `youtubeSearch`, `similarTune`, `sheetMusicType`, `disableLanguages`).
        `xml/root_preferences.xml` is no longer shown: it only holds the default values, which `HymnsActivity` loads at start.
    -   `MaxWidthLinearLayout` keeps the page a centred column at most 640 dp wide on tablets.
    -   Text size steps, theme pictures (`layout/settings_theme_tile.xml`) and the Piano | Guitar switch are built here;
        the switch rows and the other rows are `SettingsRow` views (`rowIcon`, `rowTitle`, `rowSummary`, `rowTrailing`).
    -   The Hymn books row opens `HymnBooksDialog` (the books list; also counts the hymns per book for the drawer).
    -   "Favorites" opens `logbook/FavoritesBackup`'s dialog (also used by the Favorites tab's Back up / Restore bar,
        and by `logbook/RestoreFavoritesActivity`, which opens a backup file tapped in another app).
    -   "Chord edits" opens `logbook/ChordEditsBackup`'s dialog: the sheets whose chords were changed on this device, Export
        (share or save a `hymns-chord-edits-<date>.json`) and Import. `RestoreFavoritesActivity` hands it a chord edits file
        tapped in another app, and a favorites backup to `FavoritesBackup`.
    -   "Share the app" draws a QR code on the page (`io.nayuki.qrcodegen`, Nayuki's QR Code generator, MIT licence, copied
        into the source tree) for the Google Play page or the web app, with Copy link and Share link.
    -   "App language" opens `LanguageSetting`'s dialog (Phone's language, English, 繁體中文, 简体中文), which sets the
        AppCompat per-app language (`AppCompatDelegate.setApplicationLocales`; kept on Android 12 and older by the
        `AppLocalesMetadataHolderService` in the manifest, and listed for Android 13+ by `generateLocaleConfig`).
        Every text the app shows is in `res/values/strings.xml`, translated in `values-b+zh+Hant` and `values-b+zh+Hans`;
        book names come from `HymnGroup.getDisplayName` (strings `book_<code>`), the first hymn of a new user from
        `HymnGroup.firstHymn` (the string `first_hymn`), and the sheet viewer's texts from `assets/viewer/strings.js`.
    -   "About" opens `AboutActivity`: the version, Send feedback (an email) and Source code (a link).
    -   The edits themselves are kept by `logbook/ChordEdits` in `files/chord-edits.json`, in the web app's export format.

### 10. `SheetMusicActivity.java` (package `content.sheetmusic`)
-   **Role:** Full-screen sheet music viewer.
-   **Responsibilities:**
    -   A `WebView` that loads the web viewer in `assets/viewer/` (Verovio compiled to WebAssembly) through `WebViewAssetLoader`, at `https://appassets.androidplatform.net/assets/viewer/index.html?id=<id>&variant=piano|guitar&dark=0|1&lyrics=<id>`.
    -   The viewer renders `assets/sheetMei/<id>.mei` to the screen width, derives guitar chords and capo, transposes, and can swap in translated lyrics from `assets/sheetLyrics/<id>.json`. All of that is in `assets/viewer/viewer.js`; see `tools/svg-to-lilypond/DESIGN.md` §19.
    -   `SheetMusicButton` picks the sheet: the hymn's own MEI, else its parent's.
    -   The page closes the activity by navigating to `hymnsviewer://close`; the activity passes camera-cutout insets to the page with `setInsets(...)`.
    -   Chord editing (`docs/HYMNAL_SPEC.md` §11.5): on screens at least 600 dp wide (tablets, unfolded phones) the URL gets
        `&edit=1` and the page shows Edit chords (the panel is `assets/viewer/editor.js`). The page reads and saves a sheet's
        edits through `window.HymnsEdits`, the activity's `EditsBridge` over `ChordEdits`; while it edits, Back closes the panel,
        and `setKeyboard(...)` keeps the panel above the on-screen keyboard. No page other than the viewer may load in the WebView.

---

## Visual Architecture Diagrams

For a visual representation of the architecture and component interactions, please see the following PlantUML diagram files. These can be viewed with any standard PlantUML viewer or IDE plugin.

-   **[`component_diagram.puml`](./component_diagram.puml)**: Shows the static relationships and dependencies between the major components of the reading screen.
-   **[`sequence_diagram.puml`](./sequence_diagram.puml)**: Illustrates the dynamic interaction for displaying a hymn selected from the search results.
