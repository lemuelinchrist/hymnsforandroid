# Language Provisioning & Content Maintenance Guide

This guide covers the end-to-end workflow for adding new hymn books, updating existing language resource files, and maintaining hymn data in **Hymns For Android**.

## Prerequisite Reading

- **[`docs/database_spec.md`](./database_spec.md)**: SQLite schema (`hymns`, `stanza`, `link`), Parent Hymn vs. Related Hymn rules, and the list of hymn group codes.
- **[`docs/HYMNAL_SPEC.md`](./HYMNAL_SPEC.md)**: Runtime behavior, hymn assembly rules, and book color/icon specifications.
- **[`docs/APP_ARCHITECTURE.md`](./APP_ARCHITECTURE.md)**: Overview of `HymnsDao` and how the Android app consumes the database.

---

## 1. The Provisioning Pipeline

```
databaseProvisioner/src/main/resources/*.txt   (git-tracked text sources)
  │
  ▼  Provision*.groovy (parses text + writes via JPA)
app/src/main/assets/hymns.sqlite               (git-ignored binary working DB)
  │
  ▼  ./gradlew :sqlite:exportSql
sqlite/hymns.sql                               (git-tracked SQL dump — source of truth)
```

1. **Import the committed SQL before provisioning:**
   ```bash
   ./gradlew :sqlite:importSql
   ```
   This wipes the local `hymns.sqlite`, rebuilds it from `sqlite/hymns.sql`, and copies it to `app/src/main/assets/hymns.sqlite`. Always run this before provisioning so you start from the last committed state.
2. **Run the provisioning task(s):**
   Each `Provision*.groovy` script connects to `app/src/main/assets/hymns.sqlite` (configured in `databaseProvisioner/src/main/resources/META-INF/persistence.xml`), deletes its owned hymn ID range first, and then re-parses its `.txt` resource file and inserts rows via `Dao.save()`.
   - **WSL note:** When developing on Windows with WSL, always run `databaseProvisioner` and `sqlite` Gradle tasks from WSL using a Linux JDK (`JAVA_HOME=/path/to/linux-jdk ./gradlew :databaseProvisioner:run...`), not via `cmd.exe /c gradlew.bat` across the WSL mount, which can cause SQLite locking or primary-key constraint failures.
3. **Export back to SQL after provisioning:**
   ```bash
   ./gradlew :sqlite:exportSql
   ```
   This dumps the updated `hymns.sqlite` back to `sqlite/hymns.sql`. Commit `sqlite/hymns.sql` (never commit `.sqlite` binary files).

- **Contributors' original files** (such as raw Word documents, PDFs, or unformatted exports) belong in `databaseProvisioner/src/main/resources/originals/`, which is git-ignored. Only the standardized resource files read by the provisioning scripts are committed to the repository.

---

## 2. Script, Resource File, and ID-Range Mapping

| Script / Gradle Task | Resource File (`databaseProvisioner/src/main/resources/`) | ID Range Owned |
|---|---|---|
| `ProvisionLanguageFile.groovy` (`runRussian`, `runBurmese`, `runTamil`, `runUrdu`, `runPortuguese`, `runPortugueseYouth`, `runPolish`) | `Russian.txt`, `Burmese.txt`, `Tamil.txt`, `Urdu.txt`, `Portuguese.txt`, `PortugueseYouth.txt`, `Polish.txt` | `RUS1`–`RUS1000` (also cleans legacy `R`), `BUR1`–`BUR1100` (also cleans legacy `MY`), `TA1`–`TA2000`, `UR1`–`UR20999`, `POR1`–`POR1400`, `POY1`–`POY200`, `POL1`–`POL500` |
| `ProvisionSpanish2026.groovy` | `Spanish2026.txt` | `S1`–`S1000` |
| `ProvisionSpanishSupplement.groovy` | `HImnosCanticosEspirituales.txt` | `SY1`–`SY506` (also cleans legacy `S2000`+ and `SS`) |
| `ProvisionGermanV2.groovy` (`runGerman`) | `german/New_German_hymns.txt` (`G1`–`G460`) and `german/GermanNewHymn_2019Dec.txt` (`G1001`–`G1020`) | `G1`–`G1336` (`G10001`/`G10002` are outside this range and untouched) |
| `ProvisionGermanYouth.groovy` | `german/GermanYPsongs_v2.txt` | `GY1`–`GY271` (also cleans legacy `G2001`+) |
| `ProvisionFrenchYouth.groovy` (`runFrenchYouth`) | `FrenchYouth.txt` | `FRY1`–`FRY400` (also cleans legacy `FY`) |
| `ProvisionSwahili.groovy` (`runSwahili`) | `Swahili.txt` | `SW1`–`SW300` (printed page numbers, with gaps) |
| `ProvisionKikuyu.groovy` (`runKikuyu`) | `Kikuyu.txt` | `KI1`–`KI300` |
| `ProvisionGreek.groovy` (`runGreek`) | `Greek.txt` | `GK1`–`GK1000` |

> **Note on `ProvisionLanguageFile.groovy`:** Multiple languages share `ProvisionLanguageFile.groovy` via a per-language settings table. Because each Gradle `run*` task depends on `:sqlite:importSql`, running several of them requires passing them in **one** Gradle command (e.g., `./gradlew :databaseProvisioner:runPortuguese :databaseProvisioner:runPortugueseYouth`) so earlier runs are not reset by `importSql`. Note also that re-running `ProvisionSpanishSupplement` drops reciprocal `related` links added by `runPortugueseYouth`, so run `runPortugueseYouth` after it.

---

## 3. Adding a New Language or Hymn Group

### Step 1: Prepare the Resource File
Standardize the source text into UTF-8 (no BOM) in `databaseProvisioner/src/main/resources/<Language>.txt`. Most new books use the format handled by `ProvisionLanguageFile.groovy`:

```text
POR-1
Subject: Blessing of the Trinity – His Plan
Related: E1
Hymn code: 5553216153222

1.
Glory be to God the Father,
...

Chorus:
...
```

- **Parent Hymn Selection (`ProvisionLanguageFile.parentOf()`):**
  A translated hymn inherits key, time, meter, tune, author, composer, and sheet music from its `parent_hymn`. Pick the parent in this order:
  1. **English (`E`) or New Songs (`NS`)** whenever the hymn has one (`LB<n>` maps to `NS10000 + n`, e.g. `LB12` → `NS10012`).
  2. Otherwise **Be Filled (`BF`)**.
  3. Otherwise **traditional Chinese (`C`, or `CS` for the supplement)** (`E8<n>` on hymnal.net is an English translation of a Chinese hymn and maps to `C<n>`, e.g. `E8255` → `C255`). Never use simplified Chinese (`Z`, `ZS`) as a parent, since those are children of `C`/`CS` themselves.
  - All other cross-language references go into `related` only.
  - An optional `Hymn code: <tune>` line assigns a melody code directly when a hymn has no English parent.

### Step 2: Add the Provisioner Entry & Gradle Task
- Add the language configuration to `ProvisionLanguageFile.groovy` (or create a dedicated `Provision*.groovy` script if the format requires custom parsing).
- Register a `run<Language>` task in `databaseProvisioner/build.gradle`.

### Step 3: Register the `HymnGroup` Enum Entry
Add the new group code to `app/src/main/java/com/lemuelinchrist/android/hymns/HymnGroup.java` with its display name, day color, and night color:
- Pick a color pair not used by another group, **except for a youth book**, which uses the exact same day and night colors as its language's main book (`FR`/`FRY`, `S`/`SY`, `G`/`GY`, `POR`/`POY`).
- Ensure the night color has at least a 4.5:1 contrast ratio on the dark card background (`#1D1F23`).

### Step 4: Generate the Group Icon (`<code>.png`)
Book icons live at `app/src/main/res/drawable-xhdpi/<lowercase-code>.png`. Each icon is a 364×364 8-bit RGBA PNG: a rounded square with the darker color as the border, the lighter color as the fill, and off-white (`rgb(242,242,242)`) serif letters in the `C059-Roman` font (Century Schoolbook clone):

```bash
convert -size 364x364 xc:none \
  -fill "rgb(0,131,143)"  -draw "roundrectangle 0,0 363,363 64,64" \
  -fill "rgb(77,208,225)" -draw "roundrectangle 12,12 351,351 54,54" \
  -font /usr/share/fonts/opentype/urw-base35/C059-Roman.otf -pointsize 170 \
  -fill "rgb(242,242,242)" -gravity center -annotate -4+22 "SW" -depth 8 \
  app/src/main/res/drawable-xhdpi/sw.png
```

- **Centering:** ImageMagick's `-gravity center` centers the font's full line box (including descender space), which places all-caps letters slightly too high. Measure the visible letter pixels and adjust `-annotate +x+y` until the bounding box center is at `(182, 182)` (use a smaller `-pointsize` for 3-letter codes):
  ```python
  from PIL import Image
  im = Image.open('app/src/main/res/drawable-xhdpi/sw.png').convert('RGB')
  px = im.load(); w, h = im.size
  pts = [(x, y) for y in range(h) for x in range(w) if min(px[x, y]) > 225]
  xs = [p[0] for p in pts]; ys = [p[1] for p in pts]
  print((min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2)
  ```
- Always include `-depth 8` so ImageMagick writes 8-bit rather than 16-bit channels.

### Step 5: Update Documentation
Update the group tables in [`docs/database_spec.md`](./database_spec.md) and [`docs/HYMNAL_SPEC.md`](./HYMNAL_SPEC.md) (§3.2).

---

## 4. Splitting or Renaming a `HymnGroup`

### Splitting a Combined Collection into its Own `HymnGroup`
When a supplement or youth collection that previously lived at a high number offset inside another group (such as `S2000`+ → `SY` or `G2001`+ → `GY`) is split into its own `HymnGroup`:
1. Add the new `HymnGroup` enum constant and its `drawable-xhdpi/<lowercase-code>.png` icon.
2. Update the owning `Provision*.groovy` script to use the new group code and renumber from 1.
3. Update the script's delete step (`removeXxxHymns()`) to permanently delete **both** the new ID range and the old high-offset ID range so orphaned rows never remain.
4. Grep all resource `.txt` files for `Related:` references to the old ID range and remap them to the new prefix.
5. Update `docs/database_spec.md` and `docs/HYMNAL_SPEC.md`.

### Renaming an Existing `HymnGroup` Prefix
When an existing group's prefix changes (e.g., `MY` → `BUR`, `R` → `RUS`, `FY` → `FRY`):
1. **Bulk-rename in `sqlite/hymns.sql`** using a word-boundary-anchored regex (e.g., `perl -pi -e 's/\bMY([0-9]+)\b/BUR$1/g' sqlite/hymns.sql`). Because `Dao.save()` writes reciprocal `related` entries into parent and sibling hymns across all books, re-running a single provisioning script is not enough—renaming in `hymns.sql` updates `_id`, `parent_hymn`, and every cross-group `related` reference in one pass.
2. Rename the `HymnGroup` enum constant and the icon file, and add the old code to `HymnGroup` / `CodeMigration` (and web app migration) if the old code was already shipped to users.
3. Add the old prefix (`legacyGroup`) to the provisioning script's delete step so future runs also clean up any legacy rows.
4. Remap `Related:` references in all resource `.txt` files.
5. Run `./gradlew :sqlite:importSql`, re-run the owning provisioning script, verify with `PRAGMA integrity_check` and a count query confirming zero rows use the old prefix, and run `./gradlew :sqlite:exportSql`.

---

## 5. Updating Existing Languages & Parser Gotchas

### Preventing Regressions from External Correction Files
Over time, some typo fixes were applied directly to `sqlite/hymns.sql`. If an updated `.txt` file is later provided from an older base copy, re-provisioning can silently overwrite those fixes. Before running a `Provision*` script on an updated file:
1. Run `./gradlew :sqlite:importSql` and copy `app/src/main/assets/hymns.sqlite` to a temporary `before.sqlite`.
2. Run the provisioning script and diff the group's stanzas and metadata between `before.sqlite` and `app/src/main/assets/hymns.sqlite`.
3. Carry any DB-only fixes into the `.txt` resource file and re-run until only the intended updates remain. If a contributor maintains an external copy of that `.txt` file, make sure the merged `.txt` file is shared back so the next update stays in sync.

### Checking for Duplicate Hymn Headers
`Dao.save()` keys rows by `hymn.id`. If a source `.txt` file accidentally gives two hymns the same header ID, the second silently overwrites the first. Check for duplicates before provisioning:
```bash
grep "^HSE-" databaseProvisioner/src/main/resources/Spanish2026.txt | sort | uniq -d
```

### Parser Keyword Differences Across Scripts
Older `Provision*.groovy` scripts each have their own hand-written state machine in `createNewHymn()`:
- **Keyword branches are not shared across all scripts:** For example, `ProvisionSpanish2026.groovy` parses `Hymn code Hymnalnet:`, whereas `ProvisionGermanYouth.groovy` does not. Before debugging a missing metadata field or an unexpected extra lyric line, verify that the owning script has a branch for that keyword.
- **Audio/video links in source files:** `Video:` and `Soundcloud:` lines in the Spanish and German youth files are stored as `link` rows (`youtube` / `soundcloud`) via `Dao.saveLink()`, not as stanzas.
- **`End-note:` placement:** An `End-note:` can appear either in the header metadata block (before stanza 1) or after the stanzas; both the inner metadata loop and outer stanza loop in `Provision*.groovy` must handle it.
- **Delimiter-only lines (`...`):** In Groovy/Java, `".".split("\\.")` returns an empty array because trailing empty strings are dropped. Always check `.length > 0` before indexing `line.split("\\.")[0]`.

### One-Off Fixes to a Single Hymn (No Owning `.txt` File)
Some groups (such as English `E` or New Songs `NS`) were populated by one-off extraction scripts and do not have a full `.txt` resource file. For a small fix to a single hymn in those groups:
1. Edit the hymn's `INSERT INTO hymns` or `INSERT INTO stanza` line directly in `sqlite/hymns.sql`.
2. Run `./gradlew :sqlite:importSql` and verify with `sqlite3`.
3. Commit `sqlite/hymns.sql`. Do not create a one-off `Update*.groovy` script for a single-row correction.

---

## 6. Tunes, MIDI Files, and Syncing from hymnal.net

All code that downloads or parses pages from `hymnal.net` lives in `databaseProvisioner` as Groovy/Java (`HymnalNetExtractor` and the `Sync*`/`Extract*` scripts).

### Tunes (`m<tunecode>.mid`) vs. Sheet Music (`<hymnId>.mei`)
- **MIDI files** (`app/src/main/res/raw/m<tunecode>.mid`) are keyed by **tune code**, shared across every language. Never blanket-overwrite existing `.mid` files from a download batch; only copy MIDI files for genuinely new tune codes not already present in the app. (Note: `hymnal.net` now serves MP3 audio rather than `.mid` files for newer tunes, so new tunes may not have a `.mid` file.)
- **Sheet music** is keyed by **hymn ID**. `HymnalNetExtractor` stages downloaded piano and guitar SVGs in `databaseProvisioner/data/{pianoSvg,guitarSvg}/` and appends source URLs to `databaseProvisioner/data/hymnalnet_links.tsv`.
  After extraction:
  1. Copy new SVGs into `tools/svg-to-lilypond/svg/{pianoSvg,guitarSvg}/` and merge new rows into `tools/svg-to-lilypond/svg/hymnalnet_links.tsv`.
  2. Convert the SVGs to LilyPond (`.ly`) and regenerate `app/src/main/assets/sheetMei/<id>.mei` (see `tools/svg-to-lilypond/DESIGN.md`).

### Syncing Collections from hymnal.net
Note that `Extract*` scripts are not idempotent (unlike `Provision*` scripts, they do not delete existing IDs first), and should be run with `--exclude-task :sqlite:importSql` when you have unexported changes in `hymns.sqlite`.

- **New Tunes (`BF436` and up):**
  `SyncNewTunes.groovy` reads the site index (`data/nt_keys.txt`) and updates or adds New Tunes under the `BF` group with their English `parent_hymn` set. Run in small batches (the tool pauses 30s between pages):
  ```bash
  JAVA_HOME=/path/to/jdk17 ./gradlew :databaseProvisioner:runSyncNewTunes --exclude-task :sqlite:importSql -Pnew=true -Plimit=6
  ```
- **Children (`CH`):**
  `SyncChildrenFromHymnalNet.groovy` updates or adds `CH<n>` from `hymnal.net/en/hymn/c/<n>`:
  ```bash
  JAVA_HOME=/path/to/jdk17 ./gradlew :databaseProvisioner:runSyncChildren -Pfrom=1 -Pto=243
  ```
- **New Songs (`NS`):**
  Out-of-range `/en/hymn/ns/<n>` URLs return HTTP 200 with a fallback hymn rather than 404, so always find new `NS` IDs from the published sitemap (`https://www.hymnal.net/sitemaps/hymns-ns.xml`) or `/en/song-index/ns/<letter>` and diff against `SELECT CAST(substr(_id,3) as int) FROM hymns WHERE hymn_group='NS' AND CAST(substr(_id,3) as int) < 10000`.
  Then list the missing numbers in `ExtractNSMissing.groovy` and run in small batches (around 7 songs / ~20 requests per run):
  ```bash
  JAVA_HOME=/path/to/jdk17 ./gradlew :databaseProvisioner:runExtractNSMissing --exclude-task :sqlite:importSql
  ```

---

## 7. Verification and Git Hygiene

Verify database changes directly with `sqlite3` before building:
```bash
sqlite3 app/src/main/assets/hymns.sqlite "SELECT _id, tune, parent_hymn, related FROM hymns WHERE _id='POR1'"
sqlite3 app/src/main/assets/hymns.sqlite "SELECT no, text FROM stanza WHERE parent_hymn='POR1' ORDER BY n_order"
```

- **Stage specific files by name** (`git add sqlite/hymns.sql ...`), never `git add .` or `git add -A`.
- **Never commit `.sqlite` files** (`app/src/main/assets/hymns.sqlite` and `sqlite/hymns.sqlite` are git-ignored; `sqlite/hymns.sql` is the tracked source of truth).
- For building and publishing releases, see [`AGENTS.md`](../AGENTS.md) §7 ("Publishing a GitHub Release").
