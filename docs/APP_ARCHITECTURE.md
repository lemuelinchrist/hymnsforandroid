# Hymns for Android: App Architecture Deep-Dive

This document provides a detailed architectural overview of the main Android application located in the `app/` directory. It is intended to be a supplement to the main `AGENTS.md` file.

## Core Components and Flow

The application follows a model-view-controller-like pattern, with clear separation of concerns between the UI (Activities/Fragments), data management (DAOs/Entities), and navigation/business logic.

The overall flow is as follows:
1.  `HymnsActivity` serves as the main entry point and primary controller.
2.  It initializes a `HymnBookCollection`, which manages the `ViewPager` for swiping between hymns.
3.  The `HymnBookCollection` uses an inner `HymnBookGroup` adapter to provide hymn pages.
4.  The `HymnBookGroup` adapter fetches a list of hymn numbers for the current hymn book from `HymnsDao`.
5.  For each page, the adapter creates a `ContentArea` fragment.
6.  The `ContentArea` fragment is given a `hymnId`. It then uses `HymnsDao` to fetch the full `Hymn` object and its `Stanza` objects.
7.  `ContentArea` renders the hymn's lyrics (using `LyricsArea`) and initializes various action buttons (like `PlayButton`, `FaveButton`, etc.).
8.  When the user swipes to a new page, the `ContentArea` fragment for that page becomes visible and notifies `HymnsActivity` so it can update the title bar.

---

## Key Class Descriptions

### 1. `HymnsActivity.java`
-   **Role:** Main Controller / Entry Point.
-   **Responsibilities:**
    -   Manages the main UI, including the `Toolbar` (Action Bar) and the `DrawerLayout` (for the navigation drawer).
    -   Initializes and holds a reference to `HymnBookCollection`.
    -   Handles user interactions from the menu (Search, Settings) and the navigation drawer (switching hymn books).
    -   Listens for `onLyricVisible` events from `ContentArea` (delegated through `HymnBookCollection`) to update the hymn title in the action bar.
    -   Starts `SearchActivity` and receives the selected hymn via `onActivityResult`.

### 2. `HymnBookCollection.java`
-   **Role:** Navigation and ViewPager Logic.
-   **Responsibilities:**
    -   Acts as the primary coordinator for the `ViewPager`.
    -   Manages a collection of `HymnBookGroup` adapters, one for each language/hymn book.
    -   Contains the core logic for switching between hymns (`switchToHymn`) and translating between related hymns in different languages (`translateTo`).
    -   Maintains a `HymnStack` to keep track of the user's viewing history for the back button functionality.
    -   Uses `HymnsDao` to get the list of hymn numbers for a given hymn book.

### 3. `HymnBookGroup` (Inner class of `HymnBookCollection`)
-   **Role:** `ViewPager` Adapter.
-   **Responsibilities:**
    -   Extends `FragmentStatePagerAdapter`.
    -   Provides the `ViewPager` with `ContentArea` fragments for each hymn.
    -   Holds the ordered list of hymn numbers for a specific hymn book.

### 4. `ContentArea.java`
-   **Role:** View for a Single Hymn.
-   **Responsibilities:**
    -   A `Fragment` that displays the entire content for one hymn.
    -   Takes a `hymnId` and uses `HymnsDao` to fetch the complete `Hymn` object.
    -   Delegates lyric rendering to a `LyricsArea` helper class.
    -   Initializes and manages all the action buttons (`PlayButton`, `SheetMusicButton`, `FaveButton`, etc.), each of which encapsulates its own logic.
    -   Fires the `onLyricVisible` event when it becomes visible to the user, signaling a page change.
    -   Logs the hymn to the history `LogBook`.

### 5. `HymnsDao.java`
-   **Role:** Data Access Layer.
-   **Responsibilities:**
    -   Encapsulates all SQLite database interactions.
    -   The `get(String hymnId)` method is the most critical. It fetches a `Hymn` and its `Stanza` objects.
    -   **Implements the "Parent Hymn" logic:** When fetching a hymn, it also fetches its parent (if one exists) and merges the data, providing a unified view to the rest of the app. This is a key piece of business logic located in the data layer.
    -   Provides numerous other query methods (`getBy...`) that return a `Cursor` for efficient list display in the search activity.
    -   Uses a custom `QueryBuilder` to construct its SQL queries safely and cleanly.

### 6. `Hymn.java` / `Stanza.java`
-   **Role:** Data Entities.
-   **Responsibilities:**
    -   Plain Old Java Objects (POJOs) that model the data from the `hymns` and `stanza` tables.
    -   They hold the data and have no significant business logic, which is consistent with the DAO pattern.

---

## Visual Architecture Diagrams

For a visual representation of the architecture and component interactions, please see the following PlantUML diagram files. These can be viewed with any standard PlantUML viewer or IDE plugin.

-   **[`component_diagram.puml`](./component_diagram.puml)**: Shows the static relationships and dependencies between the major components.
-   **[`sequence_diagram.puml`](./sequence_diagram.puml)**: Illustrates the dynamic interaction for displaying a hymn selected from the search results.
