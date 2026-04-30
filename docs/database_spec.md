# Database Specification

This document specifies the schema of the `hymns.sqlite` database and provides guidance on how it's used within the application.

## Application-Level Concepts

- **Hymn ID**: A string that uniquely identifies a hymn, composed of a `HymnGroup` prefix and a number (e.g., "E1", "C215"). This ID is the primary key in the `hymns` table.
- **HymnGroup**: A high-level categorization of hymns, typically by language or collection. The `HymnsActivity` uses this to manage which hymn book is currently active. The available hymn groups are defined in the `HymnGroup.java` enum.
- **Parent Hymn**: A data inheritance mechanism that allows a "child" hymn to inherit data from a "parent" hymn. This is implemented in the `HymnsDao.java` file and is used to avoid data duplication. When a hymn is loaded, the DAO checks for a `parent_hymn` and merges the data, with the child's data taking precedence. For example, if a Tagalog hymn has an English parent, it can inherit the composer, meter, and tune, while still providing its own Tagalog stanzas.
- **Related Hymn**: A system for linking different versions of the same hymn across various hymn groups (usually languages). The `related` column in the `hymns` table stores a comma-separated list of other hymn IDs. This allows the app to find and display hymns with the same tune in different languages, creating a web of connections between hymn translations.

### Available Hymn Groups

| Code | Simple Name | Description                       |
| ---- | ----------- | --------------------------------- |
| E    | English     | English hymns.                    |
| C    | 中文-繁     | Traditional Chinese hymns.        |
| CS   | 補充本-繁   | Traditional Chinese supplement.   |
| Z    | 中文-简     | Simplified Chinese hymns.         |
| ZS   | 補充本-简   | Simplified Chinese supplement.    |
| CB   | Cebuano     | Cebuano hymns.                    |
| T    | Tagalog     | Tagalog hymns.                    |
| FR   | French      | French hymns.                     |
| S    | Spanish     | Spanish hymns.                    |
| K    | Korean      | Korean hymns.                     |
| G    | German      | German hymns.                     |
| J    | Japanese    | Japanese hymns.                   |
| I    | B.Indonesia | Indonesian hymns.                 |
| BF   | Be Filled   | "Be Filled" collection.           |
| NS   | New Songs   | "New Songs" collection.           |
| CH   | Children    | Children's hymns.                 |
| F    | Farsi       | Farsi hymns.                      |
| SK   | Slovak      | Slovak hymns.                     |

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
| `sheet_music_link`  | TEXT    | A URL to the sheet music.                         |
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
| `n_order`     | INTEGER | The order of the stanza within the hymn.  |

### `tune`

There appears to be a `tune` table, but its schema is not fully defined in the database.

### `SEQUENCE`

| Column    | Type    | Description                           |
| --------- | ------- | ------------------------------------- |
| `SEQ_NAME`| VARCHAR | The name of the sequence.             |
| `SEQ_COUNT`| NUMBER  | The current value of the sequence.    |

## How to Query

**Important Note on Character Encoding:** The database contains text with special characters (e.g., accented letters, curly apostrophes). When querying the database and exporting data to files (like CSV), it is crucial to use **UTF-8 encoding** to prevent character corruption. Failure to do so will result in characters being replaced by placeholders like `?`.

The database can be queried using the `sqlite3.exe` command-line tool located in the `sqlite` directory of this workspace.

### Example Queries

**Get a hymn by its ID:**

```shell
c:\dev\hymnsforandroid\sqlite\sqlite3.exe c:\dev\hymnsforandroid\app\src\main\assets\hymns.sqlite "SELECT * FROM hymns WHERE _id='E1'"
```

**Get the stanzas for a hymn:**

```shell
c:\dev\hymnsforandroid\sqlite\sqlite3.exe c:\dev\hymnsforandroid\app\src\main\assets\hymns.sqlite "SELECT * FROM stanza WHERE parent_hymn='E1'"
```
