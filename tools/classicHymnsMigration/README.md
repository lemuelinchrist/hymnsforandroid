# classicHymnsMigration

Replace the English hymns' hymnal.net sheets with our own **classical hymnary** sheets, made from the MIDI files
(which are the standard four-part hymnal setting), a little each day. When a tune's sheets are done and nothing else plays
its MIDI, the MIDI is archived (`archive/midi/`) and the file leaves the app.

- `PLAN.md`: why, what we know, the decisions, the pipeline, the daily routine. **Read this first.**
- `midi/`: copies of the 874 English tunes' MIDI files (`m<tune>.mid`, 1.5 MB). The originals stay in
  `app/src/main/res/raw` until their sheets replace them.
- `INDEX.tsv`: one row per tune (the unit of work): its English hymns, key, time, bars, tempo, voices, off-grid notes, tempo dips
  (fermatas), and `needs care`. Made by `tools/make_index.py` (re-run it; it never touches STATUS.tsv).
- `STATUS.tsv`: where each tune is (`todo` is implied; list only tunes that are `in progress`, `drafted`, `imported`).
- `tools/`: scripts: `make_index.py`; `midi_to_sheet.py` (a new sheet from the MIDI: melody and chords, for the hymns whose MIDI lines up with the sheet on
  the sixteenth grid); `midi_align.py` (the old sheet keeps its notes and words, only the chords come from the MIDI, lined up with the melody note for note;
  for the rest); `review_server.py` with `review_page.html` (old and new sheet side by side).
- State on 2026-11-26: 1,333 of the 1,362 English hymns have a sheet made from the MIDI (978 by `midi_to_sheet.py`, 355 by `midi_align.py`), E142 was
  made by hand, and 28 stay on their hymnal.net sheets because no MIDI has their melody (`STATUS.tsv`, state `skipped`).

Daily (while there is a tune left): pick the next tune from `INDEX.tsv` (the ones without `needs care`, the most English hymns first), follow PLAN.md section 5,
update `STATUS.tsv`, commit on `media/work`.
