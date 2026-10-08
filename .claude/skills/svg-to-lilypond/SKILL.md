---
name: svg-to-lilypond
description: Use when new or changed lead-sheet SVGs (app/src/main/assets/pianoSvg, guitarSvg) have arrived — e.g. after a hymnal.net / New Songs sync — and need converting to LilyPond (.ly) sources, or when investigating why a sheet fails conversion or verification. Covers running the converter, reading the report, rebuilding the glyph catalog, the review workflow, and the traps already found.
---

# SVG -> LilyPond conversion

All code, data and the full technical record live in `svg-to-lilypond/`. **Read `svg-to-lilypond/DESIGN.md` §18
("Implementation status and findings") before debugging anything** — most surprises have already been found there.

The SVGs are LilyPond output (vector, exact coordinates). The converter reads them deterministically
(no OCR / vision), builds an intermediate representation (IR), writes `.ly`, renders it with LilyPond 2.24.3/2.24.4,
re-reads the render and compares. Nothing is judged by eye except failures.

## Prerequisites (check, don't assume)
- `lilypond --version` -> 2.24.3 (apt: `sudo apt install lilypond`; needs a real terminal for the password).
- `rsvg-convert`, ImageMagick `convert`, Python 3 with `fontTools numpy Pillow`.
- The checks read tune codes and lyrics from a **private snapshot** `svg-to-lilypond/build/hymns_snapshot.sqlite`, which
  is rebuilt automatically from the committed `sqlite/hymns.sql` when missing or older. (Don't point tools at
  `app/src/main/assets/hymns.sqlite`: Gradle/IDE builds rewrite it and it was once corrupted mid-run.) If new hymns
  were added to the DB, make sure `sqlite/hymns.sql` has them (`./gradlew :sqlite:exportSql`, see `hymn-provisioning`).

## 1. Check the incoming files first
- Not an HTML error page: `grep -l "<html" app/src/main/assets/pianoSvg/<ids>.svg` (hymnal.net returns HTTP 200 with a
  "page not found" page for some hymns; those were once shipped as .svg).
- Exact `<GROUP><number>.svg` names, right case (the app's asset lookup is case-sensitive), and both a piano and a guitar file.
- New files from `databaseProvisioner/data/{pianoSvg,guitarSvg}` must be copied into `app/src/main/assets/` first.

## 2. Convert
```bash
cd svg-to-lilypond
python3 tools/convert.py path/to/NS1162.svg path/to/NS1163.svg        # specific files
python3 tools/convert.py --group NS -j 14                              # a whole group (E ~5 min, NS ~12 min)
```
Outputs (git-ignored, regenerate freely): `build/ir/<variant>/<id>.json`, `build/ly/<variant>/<id>.ly`,
`build/svg/<variant>/<id>.svg` (our render), `build/report_<group-or-files>_<variant>.json`.
Never run the glyph census (below) while a batch is running.

## 3. Read the statuses
| Status | Meaning | Action |
|---|---|---|
| `ACCEPT` | bars add up, re-render reads back identical, symbol counts match, tune code and DB lyrics agree | done |
| `ACCEPT_DB_MISMATCH` | converted and internally consistent, but the database tune code / lyric words disagree (usually the DB is wrong) | done; list them for a spot check |
| `ACCEPT_TAIL_UNVERIFIED` | original SVG overflows its page; only page 1 of our render was compared | done, note it (no sheet needs this any more: staff size now follows the original viewBox) |
| `ACCEPT_SOURCE_BAR_SUM` | only the bar arithmetic fails; the round trip and symbol counts pass: the original prints bars that do not add up | done, but not musically clean: say so |
| `REVIEW` | at least one check failed — reason is the first of `v1`/`v2`/`v3`/`v8`/`warnings` in the report | see below |
| `recognition_error` | e.g. unknown glyph ids, non-treble clef, unsupported notehead/rest | see below |
| `render_error` / `emit_error` | LilyPond or the emitter failed | run `lilypond` on `build/ly/.../<id>.ly` and read the error |

Common `REVIEW` reasons and what to do:
- **tune code / lyrics disagree with the DB**: these no longer cause REVIEW (they give `ACCEPT_DB_MISMATCH`). Check by eye
  with `tools/compare_png.py <ID>` if asked. Do NOT bend the recognizer to a wrong DB code.
- **`coverage:`** (symbol counts differ between original and render): something printed was not reproduced — a key change
  whose cancellation prints differently, dotted whole notes, an exotic chord. Never ignore it.
- **`v1` bar sum**: usually a duration misread — a tuplet shape, a missing beam, a time-signature change. Look at the bar.
- **`v2` diff**: the diff text shows measure/event and the differing field; compare the two renders.
- **`unplaced text` / `instruction ... not emitted yet`**: printed text the emitter doesn't place yet (DESIGN.md §18).

## 4. Unknown glyph ids
A new LilyPond version (or a new notation feature) produces symbol shapes not yet in `data/glyph_names.json`.
```bash
cp data/glyph_names.json build/glyph_names_prev.json
python3 tools/glyph_census.py && python3 tools/glyph_names.py > build/glyph_names.txt
```
Compare old vs new JSON: every `NEW` entry should be a known symbol with a good score (>0.5) and a clear margin to the
runner-up. Look at `build/glyph_named.svg` if in doubt. Re-run the failed files afterwards.

## 5. Reviewing failures
`python3 tools/compare_png.py <ID> [--variant guitar]` -> `build/compare/<variant>_<ID>.png` (left original, right ours).
Read it with the image Read tool. Judge music and text; ignore small horizontal spacing differences (different LilyPond version).

## 6. Rules
- Never hand-edit a generated `.ly`. Fix `tools/recognize.py` / `emit_ly.py` / `verify.py`, then re-run.
- After any change to those files run the regression list: `python3 tools/regress.py` (~1 min; must print `N/N as expected`).
  Add every newly fixed file to `data/regression.txt` with its expected status.
- Generated output stays in `build/` (git-ignored) until the user decides to commit it; don't commit unless asked.
- Record new findings in `DESIGN.md` §18/§17 (log). Nothing learned should be lost between sessions.
- Python gotcha in `emit_ly.py`: any `%` inside a %-formatted template string must be `%%`.

## 7. What is and isn't modelled (be honest in reports)
Modelled and verified: pitches, durations, dots, ties, slurs (also dashed), beams, triplets, chords (incl. slash, 7, m7, sus,
maj7, dim, 9; and chord changes inside a sustained note), key and time signatures (and their changes), repeat/double/final
bars, voltas (also across a line break), text marks (boxed or not, stacked), fermatas, segno/coda, multiple lyric verses with hyphens, stanza labels,
verse block text, title/subtitle/number/footer, the "(Guitar: Capo N)" title-block line, multi-page overflow (page 1 only).
Not modelled: grace notes, cross noteheads (NS812), ornaments other than fermata, bass/other clefs, tuplets whose bracket
spans a different number of notes than its digit (NS445), `add9` and diminished-over-bass chords, chord *offsets* inside
long notes beyond beat-snapping (estimated from layout, version-dependent).
Anything unmodelled that prints must end up `REVIEW` — the coverage check exists for that. Never report a REVIEW file as converted.

## 8. Guitar sheets are derived (2026-10-08)
Only piano `.ly` files are stored in `ly/`. Guitar sheets come from `python3 tools/guitar_from_piano.py` (`--all`, `--compile`),
which picks the capo from the key, transposes the chords and removes slash basses; see DESIGN.md section 10. Don't convert
`guitarSvg` into stored `.ly` files, and don't simplify chords to match hymnal.net: the fuller chords are preferred.

## 9. Latest results (2026-10-06)
Piano 3,166/3,179 accepted (3,089 clean), guitar 3,164/3,179 (3,084 clean). The 13+15 left each have a reason in
`svg-to-lilypond/DESIGN.md` section 18 ("Review tail"). The accepted `.ly` files are committed in `svg-to-lilypond/ly/` (never hand-edit;
refresh after a significant converter change). A full run is ~3 h per variant on this host (`-j 8`, nice); while fixing,
re-run only the previous REVIEW list (~15 min) and finish with a full run, diffing against the saved reports.
