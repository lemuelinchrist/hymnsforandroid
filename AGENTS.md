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
-   `sqlite/`: Contains the `hymns.sql` schema file and the `sqlite3.exe` command-line tool for inspecting the database.
-   `docs/`: Contains all supplementary documentation, including the architecture deep-dive, diagrams, database specification, and other notes.
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
-   **`content`**: Manages the display of hymn content. This package includes the view pagers and fragments that render the hymn lyrics and sheet music. `HymnTextContent` and `SheetMusicContent` are important classes.
-   **`search`**: Implements the search functionality. It contains the logic for building search queries and displaying results.
-   **`logbook`**: Handles user-specific data, such as history and favorites.
-   **`settings`**: Manages the application's settings and preferences.
-   **`HymnsActivity.java`**: The main entry point and primary activity for the app. It coordinates the various components.
-   **`HymnGroup.java`**: An enum that defines the different hymn books available in the app.

## 6. Development and Build

### Environment Setup
-   **Android Studio**: Arctic Fox (2020.3.1) or newer.
-   **Android SDK**: Version 34.
-   **JDK**: Version 11 or newer.

### Building the App
1.  Open the project in Android Studio.
2.  To select the sheet music variant (e.g., piano or guitar), you may need to edit `app/build.gradle`.
3.  Build the app using the Gradle panel or by running `./gradlew assembleDebug`. The database is imported automatically during the build.

### Running the Database Provisioner
The `databaseProvisioner` module is used to build the `hymns.sqlite` database from source files. To run it, execute its Gradle tasks from within Android Studio.
