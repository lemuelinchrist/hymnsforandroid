# Database Specification

This document specifies the schema of the `hymns.sqlite` database and provides guidance on how it's used within the application.

## Application-Level Concepts

- **Hymn ID**: A string that uniquely identifies a hymn, composed of a `HymnGroup` prefix and a number (e.g., "E1", "C215"). This ID is the primary key in the `hymns` table.
- **HymnGroup**: A high-level categorization of hymns, typically by language or collection. The `HymnsActivity` uses this to manage which hymn book is currently active. The available hymn groups are defined in the `HymnGroup.java` enum.
- **Parent Hymn**: A data inheritance mechanism that allows a "child" hymn to inherit data from a "parent" hymn. This is implemented in the `HymnsDao.java` file and is used to avoid data duplication. When a hymn is loaded, the DAO checks for a `parent_hymn` and merges the data, with the child's data taking precedence. For example, if a Tagalog hymn has an English parent, it can inherit the composer, meter, and tune, while still providing its own Tagalog stanzas.
- **Related Hymn**: A system for linking different versions of the same hymn across various hymn groups (usually languages). The `related` column in the `hymns` table stores a comma-separated list of other hymn IDs. This allows the app to find and display hymns with the same tune in different languages, creating a web of connections between hymn translations.

### Choosing Between Parent and Related

When connecting hymns across languages, use this rule of thumb:
- **Parent**: Use when the child hymn is a direct translation or adaptation that should **inherit** metadata (tune, composer, category, etc.) from another hymn to avoid duplication.
- **Related**: Use when hymns merely share a tune or are loosely connected. This creates a link in the UI but does **not** trigger data inheritance.

### The Rule of Reciprocity
Unlike the `parent_hymn` (which is a one-way pointer), the `related` column should ideally be **reciprocal**. If `Hymn A` lists `Hymn B` as related, `Hymn B` should also list `Hymn A` in its `related` column to ensure the connection works regardless of which hymn the user starts from.

### Available Hymn Groups

| Code | Simple Name | Description                       |
| ---- | ----------- | --------------------------------- |
| E    | English     | English hymns.                    |
| C    | Chinese (Traditional) | Traditional Chinese hymns.        |
| CS   | Chinese Supplement (Traditional) | Traditional Chinese supplement.   |
| Z    | Chinese (Simplified) | Simplified Chinese hymns.         |
| ZS   | Chinese Supplement (Simplified) | Simplified Chinese supplement.    |
| CB   | Cebuano     | Cebuano hymns.                    |
| T    | Tagalog     | Tagalog hymns.                    |
| FR   | French      | French hymns.                     |
| S    | Spanish     | Spanish hymns.                    |
| SY   | Spanish Youth | Spanish supplement.              |
| K    | Korean      | Korean hymns.                     |
| G    | German      | German hymns.                     |
| GY   | German Youth | German youth hymns.              |
| J    | Japanese    | Japanese hymns.                   |
| I    | Indonesian  | Indonesian hymns.                 |
| BF   | Be Filled   | "Be Filled" collection.           |
| NS   | New Songs   | "New Songs" collection.           |
| CH   | Children    | Children's hymns.                 |
| F    | Farsi       | Farsi hymns.                      |
| SK   | Slovak      | Slovak hymns.                     |
| GK   | Greek       | Greek hymns.                      |
| SW   | Kiswahili   | Kiswahili hymns (Kenya); numbers are the printed page numbers, so they have gaps. |
| R    | Russian     | Russian hymnal (from Brother Victor, 2026-10); its own numbering, the "R" numbers in the German file's Related lines. |
| MY   | Burmese     | Burmese (Myanmar) hymnal (from Brother Victor, 2026-10); its own numbering, extra songs from MY1001. |
| TA   | Tamil       | Tamil hymns (from Brother Victor, 2026-10); numbered like the English hymnal (TA1 = E1), with gaps; TA1501 and up are other songs. |
| UR   | Urdu        | Urdu hymns from hymnal.net (2026-10, asked for by a brother for the churches in Pakistan); numbered like the English hymnal (UR1 = E1), with gaps; UR8273 and similar follow hymnal.net's English translations of Chinese hymns (8000 + the Chinese number) and have the Chinese hymn as parent. The Urdu New Songs are UR10000 + the NS number (UR10292 = NS292) and the Urdu Long Beach hymns UR20000 + the LB number (UR20082 = LB82 = NS10082), with the New Songs hymn as parent; hymnal.net lists them at `/hymn/ns/<n>ur` and `/hymn/lb/<n>ur`, not in its Urdu hymnal. Right to left. |
| KI   | Kikuyu      | Kikuyu hymns (Kenya, 2026-10, from the brother who sent the Kiswahili book); typed from a scan of his original typed pages (no hymn numbers), so they are numbered in the order of his file (KI1-KI70), then two hymns from his earlier file (KI71, KI72). Holy names are capitalized as he asked: Jesu, Ngai, Baba, Mwathani and the like always; Roho, Muoyo and the possessives (Waku, Wake, Yaku, Riaku, ...) only where they mean God ("roho-ini witu" stays small; "Muti wa Muoyo", the Tree of Life, is capitalized). Parents come from the page's English hymn number, or from the matching Kiswahili hymn. |
| POR  | Portuguese  | Portuguese hymns (2026-11, files from the testers of Brother Victor, formatted by him); numbered exactly like the English hymnal (POR1 = E1, POR1-POR1360), parent the English hymn. The first book with a three-letter code. |
| POY  | Portuguese Youth | Portuguese young people's songs (140, 2026-11, same source); POY1-POY140; parent the New Songs hymn where the file names one (76 do), Spanish Youth hymns in `related`. |
| POL  | Polish      | Polish hymns (424, 2026-11, same source); POL1-POL424, parent the English hymn (hymnal.net's E8xxx translations of Chinese hymns are linked to the Chinese hymn: E8255 = C255), LB12 = NS10012. |
| FY   | French Youth | French young people's songbook (Lyon, 2024); numbered in book order (the book has no song numbers). Most have an English parent for the sheet music. |

## Database Lifecycle & Source of Truth

Understanding the flow of data is crucial for maintaining the hymnal. The database is not edited directly; instead, it follows a multi-stage generation process.

### 1. The Real Source of Truth: Text Files
The definitive content of the hymns (lyrics, metadata) lives in raw text files within the `databaseProvisioner/src/main/resources/` directory (e.g., `Spanish2026.txt`). Any permanent changes to hymn content **must** be made in these files.

### 2. Provisioning (Groovy Scripts)
When the text files are updated, specialized Groovy scripts in `databaseProvisioner/src/main/groovy/` (like `ProvisionSpanish2026.groovy`) are executed. These scripts:
1.  Read the raw text files.
2.  Parse the stanzas and metadata.
3.  Wipe the existing data and re-populate the local `sqlite/hymns.sqlite` file using the `Dao.java` class.

### 3. The SQL Export (`hymns.sql`)
Since `hymns.sqlite` is a binary file and not ideal for version control, the "Source of Truth" for the database structure and data in Git is `sqlite/hymns.sql`. 
- To capture changes made by the Groovy scripts into Git, run: `./gradlew :sqlite:exportSql`. This task dumps the state of `sqlite/hymns.sqlite` into the `hymns.sql` file.

### 4. Build-Time Import
When the Android app is built (Debug or Release), the Gradle build process automatically triggers the `:sqlite:importSql` task. 
- This task deletes any existing `hymns.sqlite`, recreates it by executing the commands in `hymns.sql`, and copies the resulting binary into the app's assets folder (`app/src/main/assets/hymns.sqlite`).

### Manual Developer Workflow
If you make manual edits to `sqlite/hymns.sql` (e.g., for quick fixes to relationships):
1.  Apply your changes to `sqlite/hymns.sql`.
2.  Run `./gradlew :sqlite:importSql` to rebuild the binary `hymns.sqlite` and copy it to the app's `assets` folder.
3.  Verify the change in the app or by querying the asset directly.

**Summary Table:**

| File / Component | Role | Persistence |
| :--- | :--- | :--- |
| `*.txt` (Resources) | **The True Source** | Permanent / Version Controlled |
| `hymns.sqlite` | Transient Working DB | Volatile / Ignored by Git |
| `hymns.sql` | DB Source of Truth | Permanent / Version Controlled |
| `app/.../hymns.sqlite` | Final App Asset | Generated / Overwritten on Build |

---

## Database Schema

The database contains the following tables:

### `hymns`

| Column              | Type    | Description                                       |
| ------------------- | ------- | ------------------------------------------------- |
| `_id`               | VARCHAR | The unique ID of the hymn (e.g., "E1").           |
| `author`            | VARCHAR | The author of the hymn.                           |
| `composer`          | VARCHAR | The composer of the hymn.                         |
| `first_chorus_line` | VARCHAR | The first line of the chorus.                     |
| `first_stanza_line` | VARCHAR | The first line of the first stanza.               |
| `hymn_group`        | VARCHAR | The group of the hymn (e.g., "E" for English).    |
| `key`               | VARCHAR | The key of the hymn (e.g., "Ab Major").           |
| `main_category`     | VARCHAR | The main category of the hymn.                    |
| `meter`             | VARCHAR | The meter of the hymn.                            |
| `no`                | VARCHAR | The number of the hymn within its group.          |
| `sub_category`      | VARCHAR | The sub-category of the hymn.                     |
| `time`              | VARCHAR | The time signature of the hymn.                   |
| `tune`              | TEXT    | The tune of the hymn.                             |
| `parent_hymn`       | TEXT    | The parent hymn, if any.                          |
| `verse`             | TEXT    | The scripture verse associated with the hymn.     |
| `related`           | TEXT    | A comma-separated list of related hymn IDs.       |

### `stanza`

| Column        | Type    | Description                               |
| ------------- | ------- | ----------------------------------------- |
| `parent_hymn` | TEXT    | The ID of the hymn to which this stanza belongs. |
| `no`          | TEXT    | The stanza number (e.g., "1", "2", "chorus"). |
| `text`        | TEXT    | The text of the stanza.                   |
| `note`        | TEXT    | Any notes associated with the stanza.     |
| `id`          | INTEGER | The unique ID of the stanza.              |
| `n_order`     | INTEGER | The sorting order of the stanza.           |

### `link`

Stores the links of a hymn to places outside the app, one row per link. Today these are the curated piano videos (`kind` = `piano`), used by the YouTube button in "piano" mode and by the web app's "Piano videos" line; when a hymn has no rows of a kind, its parent hymn's rows are used. (It replaced the table `tune` in v5.8.2: that table was keyed by hymn ID, not by tune code, and held only a YouTube video ID, so it could not hold any other kind of link.) Index `link_hymn (hymn_id, kind, n_order)`.

| Column    | Type    | Description                                |
| --------- | ------- | ------------------------------------------ |
| `id`      | INTEGER | Primary key (generated by the provisioner; sequence `link`). |
| `hymn_id` | TEXT    | The **hymn ID** the link belongs to (e.g. "E8"). |
| `kind`    | TEXT    | What the link is: `piano` (a piano video of the hymn's tune). |
| `label`   | TEXT    | The text shown for it (e.g. "1st tune", "Alt tune: 295", "New tune"). |
| `url`     | TEXT    | The whole web address, e.g. `https://www.youtube.com/watch?v=DL6lgn78DcU`. The Android YouTube button opens the `embed` form of a YouTube address (`https://www.youtube.com/embed/DL6lgn78DcU`); the web app opens the stored address. |
| `n_order` | INTEGER | The order among the hymn's links of the same kind, from 1. |

`YoutubePiano.groovy` (reads `pianohymns202112.txt`) writes the `piano` rows.

### `SEQUENCE`

| Column    | Type    | Description                           |
| --------- | ------- | ------------------------------------- |
| `SEQ_NAME`| VARCHAR | The name of the sequence.             |
| `SEQ_COUNT`| NUMBER  | The current value of the sequence.    |

## How to Query

**Important Note on Character Encoding:** The database contains text with special characters (e.g., accented letters, curly apostrophes). When querying the database and exporting data to files (like CSV), it is crucial to use **UTF-8 encoding** to prevent character corruption. Failure to do so will result in characters being replaced by placeholders like `?`.

The database can be queried with the `sqlite3` command-line tool (install it and put it on the `PATH`; the build needs it too). Run these from the repository root.

### Example Queries

**Get a hymn by its ID:**

```shell
sqlite3 app/src/main/assets/hymns.sqlite "SELECT * FROM hymns WHERE _id='E1'"
```

**Get the stanzas for a hymn:**

```shell
sqlite3 app/src/main/assets/hymns.sqlite "SELECT * FROM stanza WHERE parent_hymn='E1' ORDER BY n_order"
```

For stanza `no` conventions, field quirks and how the app assembles a hymn at runtime, see [`HYMNAL_SPEC.md`](./HYMNAL_SPEC.md) §4–§5.
