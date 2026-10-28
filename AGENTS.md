# AGENTS.md: Hymns For Android

This document provides a comprehensive overview of the Hymns For Android project, optimized for AI agents to use as a development guide.

## 1. Project Overview

Hymns For Android is a digital hymnal application for Android. It provides users with a large collection of hymns, complete with lyrics and sheet music for piano and guitar. The app is designed for offline use and features a modern, searchable interface.

The project is divided into three main parts:
-   **`app`**: The main Android application.
-   **`databaseProvisioner`**: A Groovy-based tool for building the hymn database from source files.
-   **`sqlite`**: Contains the SQLite database and command-line tool.

## 2. File Structure

-   `app/`: The main Android application module.
    -   `src/main/java/com/lemuelinchrist/android/hymns/`: The root package for the app's Java source code.
    -   `src/main/assets/hymns.sqlite`: The pre-built SQLite database containing all hymn data.
    -   `build.gradle`: The build script for the Android app.
-   `databaseProvisioner/`: A Groovy project responsible for parsing raw hymn data and building the `hymns.sqlite` database.
    -   `src/main/groovy/`: The Groovy source code for the data provisioning process.
    -   `data/`: Contains raw data files (e.g., MIDI, SVG) used to generate the database.
-   `sqlite/`: Contains `hymns.sql`, the text dump of the database that git tracks (see `docs/database_spec.md`). Inspect the database with the `sqlite3` command-line tool, which the build also needs on the `PATH`.
-   `tools/web/`: The web app (PWA) for iPhone/iPad users: hymns, search, favorites, sheet music with chord editing, offline. Built from the app's assets by `python3 tools/web/build.py`, published on GitHub Pages by `.github/workflows/web-app.yml` (on each published release, or by hand). See `tools/web/README.md`.
-   `tools/ios/`: Builds `hymnal.html`, a single-file offline lyrics-only web version for iPhone users (`python3 tools/ios/build.py`). Book names/order come from `HymnGroup.java`; see `tools/ios/README.md`.
-   `docs/`: Contains all supplementary documentation, including the architecture deep-dive, diagrams, database specification, and other notes. `docs/HYMNAL_SPEC.md` is the full functional and data specification (enough to rebuild the app on another platform, e.g. a PWA). Per-version reports (plans, contributor correspondence, decisions) are **not** in this public repo: they are Lemuel's private Claude Docs ("Hymns For Android vX.Y Report"), and `docs/v[0-9]*/` is git-ignored. Contributors' original files go in the git-ignored `databaseProvisioner/src/main/resources/originals/`.
-   `AGENTS.md`: This file.
-   `README.md`: The original, human-focused README file.

## 3. Core Data Concepts

The application's data model revolves around a few key concepts:

-   **Hymn ID**: A unique string identifier for a hymn, combining a `HymnGroup` and a number (e.g., "E1", "C215"). It is the primary key in the `hymns` table.
-   **HymnGroup**: A high-level category for hymns, usually based on language or collection (e.g., "E" for English, "C" for Chinese). The app uses this to switch between different hymn books. The full list is in the `HymnGroup.java` enum.
-   **Parent Hymn**: A data inheritance feature. A "child" hymn can inherit data (like composer, meter, tune) from a "parent" hymn to reduce data duplication. The `HymnsDao.java` class handles this logic, merging parent and child data at runtime.
-   **Related Hymn**: A system for linking different language versions of the same hymn. The `related` column in the `hymns` table stores a comma-separated list of other hymn IDs, allowing the app to show translations of a hymn.

## 4. Database Schema

The core data is stored in a SQLite database in `app/src/main/assets/hymns.sqlite`. The main tables are:

### `hymns`
Stores the main metadata for each hymn.

| Column | Type | Description |
|---|---|---|
| `_id` | VARCHAR | Primary Key. The unique Hymn ID (e.g., "E1"). |
| `hymn_group` | VARCHAR | Hymn group code (e.g., "E", "C"). |
| `no` | VARCHAR | Hymn number within its group. |
| `main_category` | VARCHAR | Main category of the hymn. |
| `sub_category` | VARCHAR | Sub-category of the hymn. |
| `first_stanza_line` | VARCHAR | First line of the first stanza for quick display. |
| `parent_hymn` | TEXT | ID of the parent hymn for data inheritance. |
| `related` | TEXT | Comma-separated list of related hymn IDs. |
| ... | ... | Other metadata like `author`, `composer`, `key`, `time`, `tune`. |

### `stanza`
Stores the lyrics for each stanza of a hymn.

| Column | Type | Description |
|---|---|---|
| `id` | INTEGER | Primary Key. |
| `parent_hymn` | TEXT | Foreign Key to `hymns._id`. |
| `no` | TEXT | Stanza number (e.g., "1", "chorus"). |
| `text` | TEXT | The text of the stanza. |
| `n_order`| INTEGER | The display order of the stanza. |

## 5. Code Architecture

The Android app's source code is located in `app/src/main/java/com/lemuelinchrist/android/hymns/`. The architecture is organized into the following key packages:

> **Note:** For a more detailed architectural overview and an explanation of how the major classes interact, please see the [`APP_ARCHITECTURE.md`](./docs/APP_ARCHITECTURE.md) file.

-   **`dao` (Data Access Objects)**: Contains classes responsible for all database interactions. `HymnsDao` is a key class here, providing methods to query the `hymns` and `stanza` tables. It also implements the "Parent Hymn" logic.
-   **`entities`**: Contains the Java objects that map to database tables, such as `Hymn` and `Stanza`. These are the data models for the application.
-   **`content`**: Displays one hymn. `ContentArea` is the fragment for a hymn page; `LyricsArea` renders the header and stanzas; `OtherLanguagesSection` shows the foldable "OTHER LANGUAGES" number grid under the subject; `PlayButton`, `FaveButton`, `CopyButton`, `YoutubeButton`, `SimilarTuneButton` and `sheetmusic/SheetMusicButton` are the button bar. `sheetmusic/SheetMusicActivity` shows sheet music in a WebView running the Verovio viewer (`assets/viewer/`) on `assets/sheetMei/<id>.mei`; on tablets and unfolded phones its chords can be edited (`assets/viewer/editor.js`, saved through `logbook/ChordEdits`).
-   **`search`**: Implements the search functionality. It contains the logic for building search queries and displaying results.
-   **`logbook`**: Handles user-specific data, such as history and favorites, and the chord edits (`ChordEdits`, exported and imported by `ChordEditsBackup` in Settings).
-   **`settings`**: Manages the application's settings and preferences.
-   **`HymnsActivity.java`**: The main entry point and primary activity for the app. It coordinates the various components.
-   **`HymnGroup.java`**: An enum that defines the different hymn books available in the app.

## 6. Development and Build

### Environment Setup
-   **Android Studio**: a version that supports Android Gradle Plugin 8.13.
-   **Android SDK**: compileSdk/targetSdk 36, minSdk 24.
-   **JDK**: 17.
-   **sqlite3** on the `PATH` (the build runs `:sqlite:importSql`), and **Python 3** for the iOS html (`buildIosHymnal`).

### Building the App
1.  Open the project in Android Studio.
2.  Build the app using the Gradle panel or by running `./gradlew assembleDebug`. The database is imported automatically during the build.

### Running the Database Provisioner
The `databaseProvisioner` module is used to build the `hymns.sqlite` database from source files. To run it, execute its Gradle tasks from within Android Studio.

## 7. Publishing a GitHub Release

There is no CI/CD workflow for this (no `.github/workflows`) — releases are created manually. The pattern below is inferred from past releases (v4.23–v5.1) and is not officially documented elsewhere, so treat it as the convention to follow, not a guaranteed spec.

1. Bump `hymnAppVersion` in `app/build.gradle` (e.g. `"v5.1"` -> `"v5.2"`). `versionCode` is auto-derived from a timestamp, so it doesn't need manual bumping.
2. Build the release artifacts: `./gradlew clean assembleRelease bundleRelease`. This produces:
   - `app/build/outputs/apk/release/HymnsForAndroidvX.Y-PianoAndGuitar.apk`
   - `app/build/outputs/bundle/release/HymnsForAndroidvX.Y-PianoAndGuitar.aab` (for Google Play)
   - `app/build/outputs/ios/HymnsForAndroidvX.Y-iOS.html` (single-file offline lyrics-only hymnal, built by the `buildIosHymnal` task; no longer attached to releases since v5.6.1, as iPhone users have the web app)
3. Create the GitHub release with the APK attached, using the `gh` CLI. Tag and title follow the `vX.Y` convention (title is `vX.Y - <short description>`), major.minor only even when `hymnAppVersion` has a patch number (`v5.7.6` → tag `v5.7`); the APK keeps its full-version file name:
   ```shell
   gh release create vX.Y \
     "app/build/outputs/apk/release/HymnsForAndroidvX.Y-PianoAndGuitar.apk" \
     --draft \
     --title "vX.Y - <short description>" \
     --notes "<release notes>"
   ```
   Use `--draft` first so it can be previewed on GitHub before publishing; drop the flag (or `gh release edit vX.Y --draft=false`) to publish. Check `gh release view vX.Y` or recent releases (`gh release list`) for tone/format examples.
4. The `.aab` bundle is for Google Play Console upload, not attached to the GitHub release.
5. Publishing the release redeploys the web app from the release's tag (`.github/workflows/web-app.yml`). If master is newer, run `gh workflow run web-app.yml --ref master` right after publishing; it cancels the tag's run.

## 8. Keeping the Public Docs Current

The per-version reports are private (see `docs/` in section 2), so **the files in `docs/`, this file, the tools'
READMEs and the GitHub release notes are the only public record of how the app works and why**. Keep them true as part
of every change, in the same commit, not later:

-   Behaviour or a screen changes (search, the hymn page, buttons, settings, favorites, sheet music): `docs/HYMNAL_SPEC.md`
    (it must stay enough to rebuild the app) and, for new or renamed classes, `docs/APP_ARCHITECTURE.md` and section 5 above.
-   The data changes (a new book or group code, a column, how parents and related hymns are chosen, numbering):
    `docs/database_spec.md`, the group table in `docs/HYMNAL_SPEC.md`, and section 3/4 above.
-   A tool or pipeline changes (provisioning, the web app, the sheet music converter): its README, and the skill in
    `.claude/skills/` that describes it.
-   A release: the GitHub release notes say what changed for users (section 7).

Write what the app does and why it was designed that way, not who asked or what was said: no names of the people who
send feedback or contributions, no email addresses, no places where saints meet. Those stay in the private reports.

