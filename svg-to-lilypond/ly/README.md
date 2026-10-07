# Generated LilyPond sources (accepted sheets only)

One `.ly` per hymn and variant (`piano/`, `guitar/`), written by `tools/convert.py` from the shipped
`app/src/main/assets/{piano,guitar}Svg/*.svg`, with LilyPond 2.24.4. Only sheets whose re-render read back identical
to the original (`ACCEPT`, `ACCEPT_DB_MISMATCH`) are here; sheets still in `REVIEW` stay in the git-ignored `build/`.

- **Generated: never hand-edit.** Fix `tools/recognize.py` / `emit_ly.py` / `verify.py` and re-run
  (`python3 tools/convert.py --group NS --variant piano -j 8`), then refresh this folder.
- `status.csv`: status per file, whether it uses the wider lyric word spacing (`wide`), LilyPond's own (`default`) or the tight fallback (`tight 0.6`, `tight 0.3`),
  and the converter commit that produced it.
- Commit a refresh only after a significant converter change (a full regeneration rewrites most files).
- Results and known gaps: `../DESIGN.md` section 18.
