# Database Specification

This document specifies the schema of the `hymns.sqlite` database and provides guidance on how it's used within the application.

## Application-Level Concepts

- **Hymn ID**: A string that uniquely identifies a hymn, composed of a `HymnGroup` prefix and a number (e.g., "E1", "C215"). This ID is the primary key in the `hymns` table.
- **HymnGroup**: A high-level categorization of hymns, typically by language or collection. The `HymnsActivity` uses this to manage which hymn book is currently active. The available hymn groups are defined in the `HymnGroup.java` enum.
- **Parent Hymn**: A data inheritance mechanism that allows a "child" hymn to inherit data from a "parent" hymn. This is implemented in the `HymnsDao.java` file and is used to avoid data duplication. When a hymn is loaded, the DAO checks for a `parent_hymn` and merges the data, with the child's data taking precedence. For example, if a Tagalog hymn has an English parent, it can inherit the composer, meter, and tune, while still providing its own Tagalog stanzas.
- **Related Hymn**: A system for linking different versions of the same hymn across various hymn groups (usually languages). The `related` column in the `hymns` table stores a comma-separated list of other hymn IDs. This allows the app to find and display hymns with the same tune in different languages, creating a web of connections between hymn translations.

### Choosing Between Parent and Related

When connecting hymns across languages, use this rule of thumb:
- **Parent**: Use when the child hymn is a direct translation or adaptation that should **inherit** metadata (key, time, meter, tune, author, composer, category, and sheet music) from another hymn to avoid duplication. Pick the parent in this priority order (`ProvisionLanguageFile.parentOf()`):
  1. **English (`E`) or New Songs (`NS`)**: the default whenever the hymn has one.
  2. Otherwise **Be Filled (`BF`)**.
  3. Otherwise **traditional Chinese (`C`, or `CS` for the supplement)**. Never simplified Chinese (`Z`, `ZS`), which are children of `C`/`CS` themselves (`Z1` → `C1`).
- **Related**: Use for all other cross-language links, or when hymns merely share a tune or are loosely connected. This creates a link in the UI but does **not** trigger data inheritance.

### The Rule of Reciprocity
Unlike the `parent_hymn` (which is a one-way pointer), the `related` column should ideally be **reciprocal**. If `Hymn A` lists `Hymn B` as related, `Hymn B` should also list `Hymn A` in its `related` column to ensure the connection works regardless of which hymn the user starts from (`Dao.save()` automatically adds a child's ID to its parent's `related` set when saving).

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
| BF   | Be Filled   | "Be Filled" collection. BF436 and up are hymnal.net's New Tunes: another tune for an English hymn, whose `parent_hymn` is that hymn (see [`LANGUAGE_PROVISIONING_GUIDE.md`](./LANGUAGE_PROVISIONING_GUIDE.md)). |
| NS   | New Songs   | "New Songs" collection.           |
| CH   | Children    | Children's hymns.                 |
| F    | Farsi       | Farsi hymns.                      |
| SK   | Slovak      | Slovak hymns.                     |
| GK   | Greek       | Greek hymns.                      |
| SW   | Kiswahili   | Kiswahili hymns; numbers are the printed page numbers, so they have gaps (SW102 and SW103 continue after the last page number). |
| RUS  | Russian     | Russian hymnal; its own numbering (the code was `R` until 2026-11). |
| BUR  | Burmese     | Burmese (Myanmar) hymnal; its own numbering, extra songs from BUR1001 (the code was `MY` until 2026-11). |
| TA   | Tamil       | Tamil hymns; numbered like the English hymnal (TA1 = E1), with gaps; TA1501 and up are additional songs. |
| UR   | Urdu        | Urdu hymns from hymnal.net; numbered like the English hymnal (UR1 = E1), with gaps; UR8273 and similar follow hymnal.net's English translations of Chinese hymns (8000 + the Chinese number) and have the Chinese hymn as parent. The Urdu New Songs are UR10000 + the NS number (UR10292 = NS292) and the Urdu Long Beach hymns UR20000 + the LB number (UR20082 = LB82 = NS10082), with the New Songs hymn as parent; hymnal.net lists them at `/hymn/ns/<n>ur` and `/hymn/lb/<n>ur`, not in its Urdu hymnal. Right to left. |
| KI   | Kikuyu      | Kikuyu hymns; numbered in source-file order (KI1–KI96, as the original pages have no hymn numbers). Holy names are capitalized where they refer to God: Jesu, Ngai, Baba, Mwathani and the like always; Roho, Muoyo and the possessives (Waku, Wake, Yaku, Riaku, ...) only where they mean God ("roho-ini witu" stays lowercase; "Muti wa Muoyo", the Tree of Life, is capitalized). Parents come from the page's English hymn number, or from the matching Kiswahili hymn. |
| POR  | Portuguese  | Portuguese hymns; numbered like the English hymnal (POR1 = E1, POR1–POR1360), with the English hymn as parent. The first book with a three-letter code. |
| POY  | Portuguese Youth | Portuguese young people's songs (POY1–POY140); parent is the New Songs hymn where the file names one (76 do), with Spanish Youth hymns in `related`. |
| POL  | Polish      | Polish hymns (POL1–POL424); parent is the English hymn (hymnal.net's E8xxx translations of Chinese hymns are linked to the Chinese hymn: E8255 = C255), LB12 = NS10012. |
| FRY  | French Youth | French young people's songbook; numbered in book order (the book has no song numbers; the code was `FY` until 2026-11). Most have an English parent for the sheet music. |

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
| `new_tune`          | INTEGER | 1 for a hymnal.net New Tune (another tune for an English hymn): the hymn page header says "(New Tune)". NULL for every other hymn, including BF songs that have a tune of their own. Never inherited from the parent. |

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

Stores the links of a hymn to places outside the app, one row per link. These are the curated piano videos (`kind` = `piano`), used by the "Piano videos" line of the links card; when a hymn has no piano rows, its parent hymn's rows are used. The YouTube and SoundCloud links of the youth books (Spanish Youth, German Youth) are rows of kind `youtube` and `soundcloud` (45 and 242 rows); the NYCYPCD channel's recordings of English and New Songs hymns (245 rows for 245 hymns, one video each, label `NYCYPCD`) are `youtube` rows too, written by `ImportNycypcdYoutube.groovy` from `NycypcdYoutube.txt` (Gradle `runImportNycypcdYoutube`), shown in the same card as a `YouTube` and a `SoundCloud` line: the hymn's own, or, when it has none, those of the nearest hymn above it through `parent_hymn`, labelled with that hymn's language when it differs (see `docs/HYMNAL_SPEC.md`) (they were stanzas named `YouTube Link` / `SoundCloud Link` until v5.8.3). (It replaced the table `tune` in v5.8.2: that table was keyed by hymn ID, not by tune code, and held only a YouTube video ID, so it could not hold any other kind of link.) Index `link_hymn (hymn_id, kind, n_order)`.

| Column    | Type    | Description                                |
| --------- | ------- | ------------------------------------------ |
| `id`      | INTEGER | Primary key (generated by the provisioner; sequence `link`). |
| `hymn_id` | TEXT    | The **hymn ID** the link belongs to (e.g. "E8"). |
| `kind`    | TEXT    | What the link is: `piano` (a piano video of the hymn's tune), `youtube` or `soundcloud` (a recording of the hymn itself). |
| `label`   | TEXT    | The text shown for it (e.g. "1st tune", "Alt tune: 295", "New tune"). |
| `url`     | TEXT    | The whole web address, e.g. `https://www.youtube.com/watch?v=DL6lgn78DcU`. The Android YouTube button opens the `embed` form of a YouTube address (`https://www.youtube.com/embed/DL6lgn78DcU`); the web app opens the stored address. |
| `n_order` | INTEGER | The order among the hymn's links of the same kind, from 1. |

`YoutubePiano.groovy` (reads `pianohymns202112.txt`) writes the `piano` rows; the Spanish and German youth provisioners (`ProvisionSpanishSupplement`, `ProvisionGermanYouth`, and the unused French and Slovak ones) write the `youtube` and `soundcloud` rows through `Dao.saveLink`, and `Dao.delete` removes them with their hymn.

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
