# Chord edits put into the sheets

Chords changed by pianists in the web app (`tools/web`, Edit chords on a piano sheet) or the Android app (on tablets;
Settings → Chord Edits → Export) and sent in as an exported file
(`hymns-chord-edits-<date>.json`). One file per sheet, `<id>.json`, made by `tools/chord_edits.py import`:

```json
{"sheet": "E8",
 "bars": {"2": {"was": [[3, "Em"]], "chords": [[2.5, "A7"], [3, "Em"]]}},
 "history": [{"imported": "2026-10-20", "file": "hymns-chord-edits-2026-10-20.json", "bars": ["2"]}]}
```

A bar is the nth measure of the sheet (1 = the first; a pickup counts), a beat the MEI `tstamp` (1 = the first beat, in
the meter's unit), `chords` the bar's chords after the edit, `was` its chords before.

**These files are the source of the edits**: the `.ly` files in `../ly/piano/` are generated and a converter refresh
rewrites them, so after any refresh run

```bash
python3 tools/svg-to-lilypond/tools/chord_edits.py check    # which edits are missing from their .ly
python3 tools/svg-to-lilypond/tools/chord_edits.py apply    # put them in again (.ly and app/src/main/assets/sheetMei)
```

A bar is only changed while it still has the chords the edit was made on (`was`); otherwise `apply` reports a conflict
and leaves the bar alone (look at it by hand: the refresh changed that bar's chords). Edited bars differ from the
hymnal.net SVGs on purpose.
