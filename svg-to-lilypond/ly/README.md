# Generated LilyPond sources (accepted sheets only)

One piano `.ly` per hymn (`piano/`), written by `tools/convert.py` from the shipped
`app/src/main/assets/pianoSvg/*.svg`, with LilyPond 2.24.3. There is no stored guitar variant: since 2026-10-08 it is
derived from the piano file on demand by `tools/guitar_from_piano.py` (capo, transposed chords, light simplification;
DESIGN.md section 10). Only sheets whose re-render read back identical
to the original (`ACCEPT`, `ACCEPT_DB_MISMATCH`) are here; sheets still in `REVIEW` stay in the git-ignored `build/`.

- **Generated: never hand-edit.** Fix `tools/recognize.py` / `emit_ly.py` / `verify.py` and re-run
  (`python3 tools/convert.py --group NS --variant piano -j 8`), then refresh this folder.
- `status.csv`: status per file, whether it uses the wider lyric word spacing (`wide`), LilyPond's own (`default`) or the tight fallback (`tight 0.6`, `tight 0.3`),
  and the converter commit that produced it.
- Commit a refresh only after a significant converter change (a full regeneration rewrites most files).
- Results and known gaps: `../DESIGN.md` section 18.
