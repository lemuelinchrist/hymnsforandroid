# Spanish Hymn Provisioning Guide (2026 Edition)

This document provides technical context for the provisioning of Spanish hymns into the Hymns For Android database. It is intended to help future developers or AI agents understand the workflow, file formats, and architectural nuances of the `databaseProvisioner` module.

## 0. Prerequisite Reading

Before working on the provisioning scripts, it is highly recommended to read the following documents to understand the system's foundation:

- **[`docs/database_spec.md`](./database_spec.md)**: Essential for understanding the SQLite schema (`hymns` and `stanza` tables) and the "Parent Hymn" inheritance mechanism.
- **[`docs/APP_ARCHITECTURE.md`](./APP_ARCHITECTURE.md)**: Provides a high-level view of how the `HymnsDao` and data entities fit into the overall application.
- **[`databaseProvisioner/src/main/groovy/com/lemuelinchrist/hymns/ProvisionSpanishSupplement.groovy`](../src/main/groovy/com/lemuelinchrist/hymns/ProvisionSpanishSupplement.groovy)**: The original reference implementation for parsing Spanish supplements.

## 1. System Overview

The provisioning process involves parsing raw text files containing hymn lyrics and metadata and importing them into the `hymns.sqlite` database. This is handled by Groovy scripts located in the `databaseProvisioner` module.

### Key Components:
- **Data Source**: Text files in `src/main/resources/` (e.g., `Spanish2026.txt`).
- **Parser**: Groovy classes (e.g., `ProvisionSpanish2026.groovy`) that iterate through the text files using regex and state-based logic.
- **Persistence**: `Dao.java` uses Hibernate/JPA to interact with the SQLite database.
- **Entities**: `HymnsEntity` (hymn metadata) and `StanzaEntity` (lyrics/notes).

---

## 2. Database & Entity Nuances

### Schema Details
- **`hymns` table**: Primary key is `_id` (e.g., "S1"). Metadata includes `related`, `parent_hymn`, and `hymn_group`.
- **`stanza` table**: Linked to `hymns` via `parent_hymn` (the hymn ID). The `no` column stores the stanza number, "chorus", or "note".

### Critical Fixes (April 2026)
- **Null Handling**: Previously, `HymnsEntity.getRelated()` returned `null` if the column was empty, causing a `NullPointerException` during deletion/cleanup in `Dao.java`. 
- **The Fix**: Modified `HymnsEntity.java` to return an empty `HashSet` instead of `null`. Added safety checks in `removeRelated()`. Always ensure `getRelated()` returns a collection to avoid breaking the `Dao` lifecycle.

---

## 3. File Format Specification (`Spanish2026.txt`)

The 2026 Spanish supplement uses a specific format that differs slightly from older files:

### Identifiers
Hymns start with the pattern `S-X` (e.g., `S-1`).
- **Regex**: `^S-.*`

### Metadata Block
Immediately following the identifier:
- `Subject:` Main Category - Sub Category (separated by `–` or `-`).
- `Related:` Comma or semicolon separated list of related hymn IDs (e.g., `E1, NS435`).
- `Meter:` (Optional) The poetic meter.
- `Hymn code Hymnalnet:` (Optional) The tune ID for sheet music/MIDI.

### Lyrics & Stanzas
- **Stanzas**: Identified by a number (e.g., `1`, `2`).
- **Choruses**: Identified by the word `Coro:`.
- **End-notes**: Identified by `End-note:`. These should be saved as a `StanzaEntity` with `no = "note"`.

---

## 4. Parser Logic (`ProvisionSpanish2026.groovy`)

The parser follows a state-machine approach:
1. **`removeSpanishHymns()`**: Deletes the target range (e.g., S1-S200) before import to ensure a clean state.
2. **`provision()` loop**:
   - Detects `S-` to trigger `createNewHymn()`.
   - Parses metadata lines into the `hymn` object.
   - Detects numbers or `Coro` to trigger `createNewStanza()`.
   - Detects `End-note:` to trigger `createNewNote()`.
   - Appends all other lines to the current `stanza.text` with `<br/>` tags.
3. **`wrapup()`**: Finalizes the current hymn, sets `firstStanzaLine` and `firstChorusLine` for search indexing, and saves via `dao.save(hymn)`.

---

## 5. Known Anomalies

During the April 2026 import, the following hymns were flagged for non-sequential stanza numbering:
- **S68**: Skips stanza 2 (goes 1 -> 3).
- **S199**: Skips stanza 3 (goes 2 -> 4).

The parser is configured to log these as "anomalies" rather than throwing exceptions, allowing the import to complete while alerting the developer to data inconsistencies in the source text file.

---

## 6. How to Run
To execute the provisioning, run the Gradle task associated with the specific Groovy class:
```bash
./gradlew :databaseProvisioner:ProvisionSpanish2026.main()
```
*(Note: Ensure the database path in `hibernate.cfg.xml` or your local environment points to the correct `hymns.sqlite` file.)*
