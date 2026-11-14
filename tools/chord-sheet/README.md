# chord-sheet

`make_chord_sheet.py` turns a song's words with `[chords]` (the songbase.life form, see the docstring) into a
**chords-only sheet**: `app/src/main/assets/sheetMei/<id>.mei`, marked `<identifier type="kind">chords</identifier>`.
It is for songs we have words and chords for but no melody yet.

```sh
python3 tools/chord-sheet/make_chord_sheet.py song.txt BF491 "Title" --source "Chords: songbase.life" \
    --mei app/src/main/assets/sheetMei/BF491.mei > song.json     # the JSON is the song for the database
```

- The sheet is one bar per line of the words; each word (or part of a word where a chord changes inside it) is a
  quarter note that only carries the syllable and the chord. Stanzas without chords go in `<back>`.
- The Android viewer (`assets/viewer/viewer.js`) and the web app (`tools/web/src/sheet.js`) always show such a sheet as
  chords over the words, with the Staff and Edit chords buttons hidden. Piano shows sounding pitch (the capo is
  added), Guitar the capo and shapes; transposing works.
- It has no tune code and no MIDI. When the melody is written (`tools/lead-sheet-editor`), the real sheet replaces the file.
- Songs and their recordings go into the database as for any new BF song (see the `match-youtube-songs` skill).
