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
- `tools/`: scripts (`make_index.py` now; the MIDI -> draft and the checks as they are written).

Daily: pick the next tune from `INDEX.tsv` (the ones without `needs care`, the most English hymns first), follow PLAN.md section 5,
update `STATUS.tsv`, commit on `media/work`.
