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

## One-off fixes to a single hymn (no owning script/resource file)

Sometimes a fix is a one- or two-field correction to a single hymn that isn't covered by any `Provision*.groovy`/`.txt` pair — e.g. a hymn in the `NS` group (see table above), or any group where re-running the real provisioning script would be overkill for a single-value fix.

**Don't write a one-off `Update*.groovy` script for this**, even though older scripts like `UpdateV33.groovy`/`UpdateV34.groovy` set that precedent. A committed Groovy script for a single-hymn fix is dead weight: it doesn't get re-run automatically (unlike a real `Provision*` script wired into a Gradle task), so it just sits in the repo unless someone remembers to run it, and if a fix needs to survive future `importSql`/`exportSql` cycles, it needs to land in `hymns.sql` anyway.

Instead:
1. Query the current value(s) to confirm what needs to change (`sqlite3 app/src/main/assets/hymns.sqlite "SELECT ..."`).
2. Edit `sqlite/hymns.sql` directly — find the `INSERT INTO hymns VALUES(...)` line for that hymn ID and change the relevant field(s) in place (or the `INSERT INTO stanza`/`tune` line, if that's what needs fixing).
3. Run `./gradlew :sqlite:importSql` to rebuild `hymns.sqlite` from the edited `hymns.sql` and confirm the fix with a `sqlite3` query.
4. Commit `sqlite/hymns.sql` as-is — no script needed. Because no `Provision*` script touches that hymn's ID range, the hand-edited row survives every future re-provisioning run untouched.

This is exactly the "Manual Developer Workflow" already documented in `docs/database_spec.md` — it's the right tool for a single-hymn fix, not a new provisioning script.

## Verifying a fix without building the app

```bash
sqlite3 app/src/main/assets/hymns.sqlite "SELECT _id, tune, related FROM hymns WHERE _id='G2163'"
sqlite3 app/src/main/assets/hymns.sqlite "SELECT no, text FROM stanza WHERE parent_hymn='G2163' ORDER BY n_order"
```

## Git hygiene for this workflow

- Never `git add .` / `git add -A` — this repo commonly has untracked build/IDE artifacts (and has had a stray `.pem` certificate) sitting in the working tree. Stage the specific files you changed (e.g. `sqlite/hymns.sql`, the `.txt` resource, the `.groovy` script).
- Commit only `sqlite/hymns.sql`, never `sqlite/hymns.sqlite` or `app/src/main/assets/hymns.sqlite` (already gitignored, but double-check `git status` before committing if something looks off).
- Only commit/push when the user asks in that turn — a prior approval doesn't carry forward.
