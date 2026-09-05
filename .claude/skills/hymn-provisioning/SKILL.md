---
name: hymn-provisioning
description: Use when applying hymn content corrections/updates, importing a language's hymn text files into hymns.sqlite, running a Provision*.groovy script, or investigating why a hymn's metadata field (tune, related, etc.) isn't showing up correctly. Covers the text-file -> Groovy -> sqlite -> hymns.sql pipeline for Hymns For Android.
---

# Hymn Provisioning

Read first, in this order, before touching provisioning code or data:
1. `docs/database_spec.md` — schema, Parent Hymn vs Related Hymn, hymn group codes.
2. `docs/LANGUAGE_PROVISIONING_GUIDE.md` — full workflow for adding a *new* language, git hygiene rules.

This skill is the condensed playbook for the common case: **correcting or updating an existing language's hymn data**, plus gotchas discovered while doing that work that aren't in the other docs yet.

## The pipeline, in one line

`databaseProvisioner/src/main/resources/*.txt` (git-tracked source) → `Provision*.groovy` (parses + writes via JPA) → `app/src/main/assets/hymns.sqlite` (gitignored binary, live DB) → `sqlite/hymns.sql` (git-tracked full SQL dump — the *actual* source of truth for content).

- `./gradlew :sqlite:importSql` — wipes local `hymns.sqlite`, rebuilds it from `sqlite/hymns.sql`, copies it into `app/src/main/assets/`. Run this **before** provisioning, so you start from the last committed state.
- A `Provision*.groovy` script connects straight to `app/src/main/assets/hymns.sqlite` (path templated into `databaseProvisioner/src/main/resources/META-INF/persistence.xml` via `${sqliteFile}`). Each script deletes its own ID range first (e.g. `removeSpanishHymns()` wipes S1–S1000), then re-parses its `.txt` resource file and re-inserts via `Dao.save()`. This delete-then-reinsert pattern is what makes re-running a script safe/idempotent.
- `./gradlew :sqlite:exportSql` — dumps the now-updated `hymns.sqlite` back into `sqlite/hymns.sql`. Run this **after** provisioning, and commit `hymns.sql` (never the `.sqlite` binaries — they're gitignored on purpose).

## Known script ↔ resource ↔ ID-range mapping

| Script | Resource file | ID range owned |
|---|---|---|
| `ProvisionSpanish2026.groovy` | `Spanish2026.txt` | S1–S1000 |
| `ProvisionSpanishSupplement.groovy` | `HImnosCanticosEspirituales.txt` (name doesn't match "supplement" — verify by reading the script's `spanishFile =` line, not just the filename) | SS1–SS506 (own `SS` hymn group as of the v5.4 split; was `S2000`–`S2506` before that) |
| `ProvisionGermanYouth.groovy` | `german/GermanYPsongs_v2.txt` | GY1–GY271 (own `GY` hymn group as of the v5.4 split; was `G2001`–`G2271` before that) |

`SS` and `GY` are dedicated `HymnGroup` entries (own section in the app, own icon), not just an ID-prefix convention — see `app/src/main/java/com/lemuelinchrist/android/hymns/HymnGroup.java`. English "New Songs" (`NS`) is a different case: it isn't sourced from an editable `.txt`/`Provision*.groovy` at all — it was populated long ago by one-off `Extract*.groovy`/`Update*.groovy` scripts scraping hymnal.net. There's no resource file to edit for an `NS` correction; see the one-off single-hymn fix section below.

When a new correction file arrives (e.g. via email) and you need to figure out which resource it replaces, don't guess from the filename alone:
1. Diff line counts (`wc -l`) against candidate resource files — an exact match is strong evidence.
2. Confirm by reading the actual `<scriptName>.groovy`'s hardcoded `getResource("/...")` call — the filename in the script is the ground truth, not the name of the file someone emailed you.

## Keeping Victor's copies of the Spanish/German source files in sync

`Spanish2026.txt`, `HImnosCanticosEspirituales.txt` (Spanish Youth/Supplement), and `german/GermanYPsongs_v2.txt` (German Youth) are maintained by an external contributor, Victor, over email — **he is not a developer and has no git access**, so our repo copy and his own working copy are two independent files that only stay in sync because we manually pass changes back and forth. Whenever we make **any manual edit directly to one of these three files** (a disambiguation fix, a `Related:` link, anything beyond just applying a file Victor sent verbatim), his copy is now stale and **must be sent back to him**, or his next round of corrections will silently overwrite our fix.

- Before editing, know that these are literally the same three files Victor edits and emails back — there is no separate "our version"/"his version" distinction in the pipeline; the resource `.txt` *is* his file.
- After any direct edit (not just re-applying a file he sent), copy the current resource file(s) into `docs/v5.4/` (or the current version's docs folder) with a dated filename, following the existing naming pattern (e.g. `Supplemental_spanish_hymns_hymnsapp2026_renumbered_<date>.txt`), and flag to the user that these need to go back to Victor.
- **When in doubt about whether a file has drifted from what Victor last sent**, don't guess — diff the live resource file against his last-received copy (archived in `docs/v5.4/`) directly:
  ```bash
  diff <(tr -d '\r' < docs/v5.4/<his_last_file>.txt) <(tr -d '\r' < databaseProvisioner/src/main/resources/<resource>.txt)
  ```
  A clean diff means no send-back is needed for that file; don't assume based on memory of what you think you touched — verify all three files this way if there's any uncertainty, since it's cheap and it's exactly what settled this question on 2026-09-05 (only the Supplement file had drifted; the other two were byte-identical to what he'd sent).
- If a fix diverges from what hymnal.net/Victor's own source literally shows (e.g. an invented disambiguation suffix on a tune code), explain *why* in the message back to him — he may otherwise "correct" it back to the literal value next time he touches that hymn.

## Splitting a combined collection into its own `HymnGroup`

Some collections were historically appended onto the end of a parent group's ID range instead of getting their own section (`SS`/`GY` used to be `S2000+`/`G2001+` before the v5.4 split — see the mapping table). If asked to split one out (e.g. an Indonesian Supplement still living as high-numbered `I` IDs), the app side needs no DAO/UI changes — `HymnGroup` is a clean enum everything else iterates generically — but the checklist is:

1. Add a new `HymnGroup` enum entry (`app/src/main/java/.../HymnGroup.java`) with its own display name and color.
2. Add a placeholder icon at `app/src/main/res/drawable-xhdpi/<lowercase-code>.png` (icon lookup is `getIdentifier(group.name().toLowerCase(), "drawable", ...)` — one file covers every UI surface).
3. In the owning `Provision*.groovy`: change the ID prefix/`hymn.hymnGroup` to the new code, and renumber the counter to start from 1 (not the old high offset).
4. **Critical**: update the script's `removeXxxHymns()` to delete **both** the new ID range **and** the old legacy range, permanently (a one-time migration cleanup that costs nothing to leave in place forever). Forgetting this leaves orphaned rows under the old prefix that never get cleaned up by any future re-run — verify with a targeted count query (`WHERE _id LIKE 'S2%' AND CAST(substr(_id,2) AS INTEGER) >= 2000`, not a naive `LIKE` that also matches legitimate low IDs).
5. Grep **every** resource file (not just the one being split) for cross-references to the old ID range in `Related:` lines, and remap them — a split commonly breaks reciprocal links from a sibling collection (e.g. German Youth hymns referencing old Spanish-Supplement IDs).
6. Document the new group in `docs/database_spec.md`'s hymn group table and this skill's ID-range table.

## Gotcha: each script parses a different, hand-rolled set of field keywords

`createNewHymn()` in each `Provision*.groovy` is a small state machine keyed on literal line prefixes like `Subject:`, `Related:`, `Meter:`, `Verses:`, `Soundcloud:`. **These keyword sets are not shared across scripts** — one script recognizing a field doesn't mean another does.

Confirmed example: `ProvisionSpanish2026.groovy` has a branch for `"hymn code hymnalnet:"` that sets `hymn.tune`. `ProvisionGermanYouth.groovy` has **no such branch**. So a `Hymn code Hymnalnet: <code>` line in a German source file doesn't get parsed as metadata — it falls through to the generic "unrecognized line" `else` branch and gets inserted as if it were the first line of stanza/chorus lyrics. The symptom in the app: a hymn's tune field is empty/wrong, and there may be a bogus extra "chorus" whose text is literally the metadata line.

**Before changing a "wrong metadata value" for a hymn**, check that the owning script actually has a keyword branch to parse that field at all — the fix may be adding a parser branch, not just editing the text file.

## Gotcha: duplicate hymn IDs in source files

`Dao.save()` keys database rows by `hymn.id`. If a source `.txt` file accidentally assigns the same ID to two different hymns (has happened in real correction files — e.g. two unrelated hymns both labeled `HSE-2430s`), provisioning will silently let one overwrite the other with no error. Before provisioning a new/updated file, grep for the hymn-header pattern (e.g. `^HSE-`, `^YPG`, `^S-`) and diff/sort to check for duplicates:

```bash
grep "^HSE-" path/to/file.txt | sort | uniq -d
```

If you find a duplicate introduced by an external contributor's file, flag it to them and wait for their decision rather than guessing a renumbering yourself.

## Gotcha: `Coro`/chorus-detection regex is brittle to punctuation changes

`ProvisionSpanishSupplement.groovy`'s main loop decides a line is a new chorus stanza with `line.matches(".*\\bCoro\\b.*") && !line.matches(".*Coro.*parte.*")` — i.e. "contains the word Coro, but isn't a 'Coro parte N' annotation". This guard is matched against the *exact wording* a contributor happens to use, not a stable marker. Real incident: Victor's file started writing `Coro; parte 1:` (semicolon) inside `End-note:` blocks instead of the previous `Coro parte 1:` (no semicolon) — the regex no longer excluded it, so it was misdetected as a real chorus header, creating an empty stanza that later crashed `wrapup()` (`firstChorus.text.indexOf("<")` returns `-1` on empty text → `substring(0,-1)` throws `StringIndexOutOfBoundsException`).

**When a `Provision*.groovy` run throws deep inside `wrapup()` or crashes on `.substring`/`.split` of a line that looks like ordinary lyric text**, suspect a punctuation drift against one of these hand-written regexes before assuming the data itself is broken — grep the new source file for near-miss variants (`grep -n "Coro.*parte"` etc.) and widen the exclusion pattern rather than asking the contributor to change their formatting back.

## Gotcha: a standalone `...` (repeat-notation) line can crash stanza-number detection

Also in `ProvisionSpanishSupplement.groovy`: `line.split("\\.")[0].isNumber()` is used to detect numbered stanza lines. Groovy/Java's `String.split()` **drops trailing empty strings**, so a line that is *only* `"..."` splits to an **empty array**, and `[0]` throws `ArrayIndexOutOfBoundsException`. Fix applied: guard with `line.split("\\.").length>0 && ...` before indexing. Any hand-rolled parser branch that indexes into a `.split(...)` result without checking length is at risk of the same crash on delimiter-only lines.

## Gotcha: an `End-note:` can appear *before* a hymn's first stanza, not just after

`createNewHymn()`'s inner metadata-parsing loop (reads `Subject:`/`Related:`/etc. until it hits the first stanza/chorus line, then breaks) did not originally have a branch for `End-note:` — only the **outer** `provision()` loop did, for notes that appear *after* stanza content. When a hymn's `End-note:` appears immediately after `Related:`/`Hymn code Hymnalnet:` (before any numbered stanza), the inner loop's generic "unrecognized line" fallback called `createNewStanza()` on it instead of `createNewNote()`, throwing "Cant make out line" (since `End-note:` isn't a number and doesn't contain `"Coro"`). Fixed by adding an explicit `End-note:` branch to the inner loop too, mirroring the outer one. If a script only handles a keyword in one of its two parsing loops (inner metadata loop vs. outer main loop), a contributor putting that content in the position the script doesn't check will break.

## Gotcha: `Extract*.groovy`/`Update*.groovy` scripts are NOT idempotent like `Provision*.groovy` scripts

`Provision*.groovy` scripts are safe to re-run because they call a `removeXxxHymns()`/delete step for their whole ID range *before* re-parsing (see the pipeline section above). One-off `Extract*.groovy` scripts (used to scrape new hymns from hymnal.net — see the download section below) have **no such delete step**: they call `dao.save(hymn)` → `Dao.save()` → `em.persist(hymn)`, which **throws `SQLITE_CONSTRAINT_PRIMARYKEY`** if that hymn ID already exists (e.g. from a previous run of the same script, or because you need to re-run it after fixing a bug in `HymnalNetExtractor.java`).

If you need to re-run an `Extract*` script over IDs it already inserted (e.g. to pick up a downloader fix), delete those rows first:

```bash
for x in $(seq <start> <end>); do
  sqlite3 app/src/main/assets/hymns.sqlite "DELETE FROM stanza WHERE parent_hymn='NS$x'; DELETE FROM hymns WHERE _id='NS$x';"
done
```

Also: `Extract*`/one-off Gradle tasks should **not** `dependsOn ":sqlite:importSql"` the way `Provision*` tasks do — that would wipe the whole DB back to the last committed `hymns.sql`, discarding any other in-progress work in the same session. Run them standalone, or with `--exclude-task :sqlite:importSql` if the task object still declares that dependency.

## One-off fixes to a single hymn (no owning script/resource file)

Sometimes a fix is a one- or two-field correction to a single hymn that isn't covered by any `Provision*.groovy`/`.txt` pair — e.g. a hymn in the `NS` group (see table above), or any group where re-running the real provisioning script would be overkill for a single-value fix.

**Don't write a one-off `Update*.groovy` script for this**, even though older scripts like `UpdateV33.groovy`/`UpdateV34.groovy` set that precedent. A committed Groovy script for a single-hymn fix is dead weight: it doesn't get re-run automatically (unlike a real `Provision*` script wired into a Gradle task), so it just sits in the repo unless someone remembers to run it, and if a fix needs to survive future `importSql`/`exportSql` cycles, it needs to land in `hymns.sql` anyway.

Instead:
1. Query the current value(s) to confirm what needs to change (`sqlite3 app/src/main/assets/hymns.sqlite "SELECT ..."`).
2. Edit `sqlite/hymns.sql` directly — find the `INSERT INTO hymns VALUES(...)` line for that hymn ID and change the relevant field(s) in place (or the `INSERT INTO stanza`/`tune` line, if that's what needs fixing).
3. Run `./gradlew :sqlite:importSql` to rebuild `hymns.sqlite` from the edited `hymns.sql` and confirm the fix with a `sqlite3` query.
4. Commit `sqlite/hymns.sql` as-is — no script needed. Because no `Provision*` script touches that hymn's ID range, the hand-edited row survives every future re-provisioning run untouched.

This is exactly the "Manual Developer Workflow" already documented in `docs/database_spec.md` — it's the right tool for a single-hymn fix, not a new provisioning script.

## Tunes and their MIDI file equivalent

A hymn's `tune` field (parsed from a `Hymn code Hymnalnet:`/`Hymn code:` line — see the keyword gotcha above) is a numeric melody-shape code, e.g. `1233112353234321`. It is **shared across every hymn that uses that melody, in every language** — that's the entire point of the field: it's how the app finds "hymns with a similar tune" (`HymnsDao.getHymnsWithSimilarTune()` in the app) and how it plays the in-app MIDI preview.

- **MIDI playback**: `Hymn.playHymn()` (`app/src/main/java/.../entities/Hymn.java`) does a **reflection lookup** on `R.raw` for a field named `"m" + tune`, i.e. it plays whatever raw resource is named `app/src/main/res/raw/m<tunecode>.mid`. There is exactly **one MIDI file per tune code**, not per hymn — dozens of hymns across `E`, `C`, `S`, `NS`, etc. can and do point at the same `.mid` file.
- **Sheet music (SVG)** is the opposite: keyed by **hymn ID**, one file per hymn, in `app/src/main/assets/pianoSvg/<hymnId>.svg` and `guitarSvg/<hymnId>.svg`. A hymn with no tune/no English parent has no sheet music of its own and shows nothing (see `LegacySheetMusic.java` / `HymnsDao.get()`'s parent-inheritance fallback).
- **Because MIDI files are keyed by tune code, not hymn ID, never blanket-overwrite `app/src/main/res/raw/*.mid` from a fresh download batch.** If a newly-extracted hymn happens to share a tune code with hymns already in the app (very common — verify with `sqlite3 ... "SELECT _id FROM hymns WHERE tune='<code>'"` before copying), a fresh re-download for that code is not guaranteed byte-identical to what's already there (real incident: 9 of 70 new downloads differed in size, one by 6x) and can silently change audio for unrelated existing hymns in every language. **Diff staged/incoming `.mid` files against `git show HEAD:<path>` first; only copy files that are genuinely new (no existing hymn currently uses that tune code) or that you've confirmed are equivalent.**
- Full download pipeline for one hymn: `HymnalNetExtractor.convertWebPageToHymn()` scrapes the hymn page, sets `sheetMusicLink` from the page's `.leadsheet span.svg` element (see selector note below), then calls `downloadSheetMusicAndMidi()`, which saves piano/guitar SVGs to `Constants.SHEET_PIANO_DIR`/`SHEET_GUITAR_DIR` (`databaseProvisioner/data/pianoSvg`/`guitarSvg` — a **local staging directory**, not the app) and the MIDI to `Constants.MIDI_PIANO_DIR` (`databaseProvisioner/data/midi`, also staging). **None of this lands in the app automatically** — after extraction, manually `cp` the new files from `databaseProvisioner/data/{pianoSvg,guitarSvg,midi}/` into `app/src/main/assets/{pianoSvg,guitarSvg}/` and `app/src/main/res/raw/` respectively (after the MIDI dedup check above). `Constants.MIDI_DIR` (from the `midi.dir` property) is a *different*, unused-by-download constant that happens to point at `app/src/main/res/raw` — don't confuse it with `MIDI_PIANO_DIR`.
- **Known site-markup bug (fixed 2026-09-05):** hymnal.net changed its HTML at some point — the old selector `.leadsheet.piano span` no longer matches anything (should be `.leadsheet span.svg`). If a sync run logs `"warning no sheet Music link"` for hymns that visibly have sheet music on the live site, check `HymnalNetExtractor.java`'s two `.select(...)` calls for this selector before assuming the hymn genuinely lacks sheet music — the site can change markup again in the future.

## Downloading new hymnal.net songs (syncing the `NS`/"New Songs" collection)

`NS` (English New Songs) isn't sourced from a resource `.txt` (see the ID-range table above) — it was built up over time by one-off `Extract*.groovy` scripts (`ExtractNS523To543.groovy`, `ExtractNS1001To1091.groovy`, etc.), each just a `for` loop over a numeric range calling `HymnalNetExtractor.convertWebPageToHymn(Constants.HYMNAL_NET_NEWSONGS, "<n>", 'NS', "<n>")` then `dao.save(hymn)`. New hymns get added to hymnal.net's New Songs collection over time, so our copy drifts out of sync — a missing hymn (like NS1128) is often a symptom of a whole unsynced range, not an isolated gap.

**Don't try to find the sync boundary by probing `hymnal.net/en/hymn/ns/<n>` with increasing numbers and checking for a 404.** Past the real collection size, hymnal.net still returns **HTTP 200 with a real-looking but unrelated hymn** for arbitrary large `n` (confirmed: `/ns/50000` returns a genuine, differently-titled hymn, not an error) — there is no boundary to detect this way.

**Instead, use hymnal.net's own first-line index**, which is the authoritative list of what's actually in the collection:

```bash
# One page per letter (plus "(" and digit pages for symbol/numeric first lines)
for letter in "(" 1 2 A B C D E F G H I J K L M N O P R S T U V W Y Z; do
  curl -s "https://www.hymnal.net/en/song-index/ns/$letter" | grep -oE 'hymn/ns/[0-9]+' | sed 's/hymn\/ns\///'
done | sort -n -u > /tmp/ns_all_ids.txt
```

Then diff against what's actually in the DB:

```bash
sqlite3 app/src/main/assets/hymns.sqlite \
  "SELECT CAST(substr(_id,3) as int) FROM hymns WHERE hymn_group='NS' AND CAST(substr(_id,3) as int) < 10000 ORDER BY 1" \
  > /tmp/our_ns_ids.txt
python3 -c "
hymnalnet = set(int(l) for l in open('/tmp/ns_all_ids.txt') if l.strip())
ours = set(int(l) for l in open('/tmp/our_ns_ids.txt') if l.strip())
print('missing from ours:', sorted(hymnalnet - ours))
print('in ours but not in hymnalnet index (likely just index-scrape gaps, not deletions):', sorted(ours - hymnalnet))
"
```

This is exactly how NS1128 (and the rest of a 72-hymn gap, mostly a contiguous `NS1092`–`NS1161` block plus two standalone IDs) was found on 2026-09-05: Victor reported one specific missing hymn, but rather than hand-adding just that one, the first-line index confirmed it was part of a real unsynced range, so the fix was a proper range-sync (new `Extract*.groovy` script covering the gap, following the existing pattern) rather than a one-off fix. Cross-check a handful of the "in ours but not indexed" IDs before assuming they're fine — the first-line index can simply omit an entry it hasn't got a first line for, so don't treat that list as hymns to delete.

After extraction: `Dao.save()` auto-maintains **reciprocal `Related` links** — if the newly-fetched (or re-provisioned) hymn has `parentHymn` set, saving it also adds its own ID into the parent's `related` set automatically (see `Dao.java`'s `save(HymnsEntity)`). So wiring a translation to its newly-added English parent is usually just: add `Related: NS<n>` to the translation's source line and re-run its owning `Provision*` script — no separate manual DB edit needed for the reciprocal side.

## Verifying a fix without building the app

```bash
sqlite3 app/src/main/assets/hymns.sqlite "SELECT _id, tune, related FROM hymns WHERE _id='G2163'"
sqlite3 app/src/main/assets/hymns.sqlite "SELECT no, text FROM stanza WHERE parent_hymn='G2163' ORDER BY n_order"
```

## Git hygiene for this workflow

- Never `git add .` / `git add -A` — this repo commonly has untracked build/IDE artifacts (and has had a stray `.pem` certificate) sitting in the working tree. Stage the specific files you changed (e.g. `sqlite/hymns.sql`, the `.txt` resource, the `.groovy` script).
- Commit only `sqlite/hymns.sql`, never `sqlite/hymns.sqlite` or `app/src/main/assets/hymns.sqlite` (already gitignored, but double-check `git status` before committing if something looks off).
- Only commit/push when the user asks in that turn — a prior approval doesn't carry forward.
