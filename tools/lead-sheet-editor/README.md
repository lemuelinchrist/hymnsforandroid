# Lead sheet editor

A small web app to correct a lead sheet (melody, words, chords) by hand and by ear, without MuseScore or any other
notation program. It was made for the drafts that `tools/audio-transcribe` writes from a recording, which always need
a last pass by someone who can listen.

It is built for two editors at once: the person in the browser and an agent (or anyone with a text editor) working on
the same file. The sheet is one JSON file per song; the page saves every change into it and shows within two seconds
what anyone else wrote into it.

## Use

```sh
python3 tools/lead-sheet-editor/server.py                # http://localhost:8777/ ; --port, --root (default temp/transcribe)
/home/lemue/venvs/transcribe/bin/python tools/lead-sheet-editor/from_musicxml.py temp/transcribe/<song>   # sheet.musicxml -> leadsheet.json
```

The server only listens on this computer (127.0.0.1) and needs nothing but Python 3. `from_musicxml.py` needs music21
(the transcribe venv has it); it does not replace a `leadsheet.json` that exists unless `--force` is given, since the
file may hold hand edits. The page draws with the app's own Verovio (`app/src/main/assets/viewer/verovio-toolkit-wasm.js`).

In the page: click a note, then
- **pitch**: ↑ ↓ one step of the key, Shift for a semitone, Ctrl for an octave, or the letter A–G;
- **length**: the buttons, or 3 (16th) 4 (8th) 5 (quarter) 6 (half) 7 (whole) and `.` for a dot;
- **notes**: N a new note after it, S split it in two, R note ↔ rest, Delete;
- **words**: Enter, type the syllable, Space for the next note; `-` when the word goes on (`De-` `fend-` `er`); a note
  left empty is sung on the syllable before it and gets a slur;
- **chord** (H) and a **comment** on the note; "Notes between us" for anything longer;
- **Play** (Space) plays the melody from the chosen note; the recording, when the song folder has it, plays beside it;
- Undo / Redo, Key − / + (transposes notes and chords), + Verse, Print / PDF, and the sheet as MEI or MIDI.

Bar lines, ties over a bar line, beams and accidentals are not edited: they follow from the notes, the time signature
and the upbeat (the length of the first, incomplete bar).

## Working together on one sheet

- The page saves half a second after each change (`Saved` at the top right) and keeps the version before each save in
  `<song>/leadsheet.history/` (the last 200).
- A change made in the file from outside appears in the page by itself; the notes that changed are **blue** until the
  next edit, and one Undo goes back to what was there before. Notes with a comment are **orange**.
- If both write at the same moment, the file wins and the page says so: the change in the page is not saved over it.
- An agent reads `leadsheet.json` (the `message`, each note's `c` comment, the notes themselves), compares it with the
  newest file in `leadsheet.history/` to see what the person changed, and writes its own changes with `server.dump`
  (one note per line, so diffs read as a list of notes). It answers in `message` or in a note's `c`.

## leadsheet.json

| Key | Meaning |
|---|---|
| `title`, `key` (`"G"`, `"Bb"`, `"F#"`), `mode`, `time` (`[4, 4]`), `tempo` | the head of the sheet |
| `pickup` | length of the upbeat bar in sixteenths, 0 for none |
| `message` | notes between the editors |
| `notes` | the melody in order: `{"p": 67, "d": 4, "w": ["Thee"], "ch": "G", "c": "comment"}` |
| a note's `p` | MIDI pitch (60 = middle C), `null` for a rest |
| `d` | length in sixteenths (2 = eighth, 4 = quarter, 6 = dotted quarter); any length, the page writes ties where needed |
| `w` | the syllable, one per verse; ends in `-` when the word goes on; `""` = held from the note before |
| `ch`, `c`, `e` | chord symbol above the note; a comment; `true` to spell the note the other way (D♭ for C♯) |

## Limits

One voice, one staff; no triplets, no repeats or endings (write the lines out); the keys with up to six sharps or
five flats. A sheet from someone's recording is a derivative of their arrangement: it stays in `temp/` (not tracked)
until the owner decides what goes into the app.
