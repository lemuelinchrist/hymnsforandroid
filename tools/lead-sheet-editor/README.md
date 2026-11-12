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

## Guide: correcting a sheet step by step

### 1. Open the sheet

1. Start the server (first command above) and leave its window open. It prints the address.
2. Open http://localhost:8777/ in the browser. **Song** at the top left chooses among the songs that have a
   `leadsheet.json`; the address keeps the choice (`?song=<folder>`), so it can be bookmarked.
3. A song that is not in the list has no `leadsheet.json` yet: make it with `from_musicxml.py` (second command above)
   and reload the page.

The top right always says where the sheet stands: `Loaded`, `Saving…`, `Saved 9:41:07 PM`, or
`Updated from the file …` when someone else changed it. Red text there means the change was **not** saved (the server
is not running, or the file was changed at the same moment).

### 2. Listen and find the wrong note

1. Start the recording in **The recording** card and follow the sheet.
2. Click a note and press **Space** (or **▶ Play**): the sheet plays from that note, and the note being played turns
   green. Space again stops it. Clicking a note also sounds it once.
3. Play the same line in the recording and in the sheet, one after the other, until you hear where they differ.

### 3. Fix a wrong pitch

Click the note (it turns red), then:

| To do this | Press | Or click |
|---|---|---|
| one step higher or lower in the key (G → A → B → C) | ↑ ↓ | ↑ ↓ |
| a semitone higher or lower (G → G♯) | Shift ↑ ↓ | ♯ ♭ |
| an octave higher or lower | Ctrl ↑ ↓ | 8↑ 8↓ |
| a named note, the nearest one (the key's F is F♯ in G major) | A to G | |
| write C♯ as D♭ or the other way | | ♯↔♭ |

Each change sounds the new pitch. ← and → go to the note before and after, so a whole line can be walked with the
keyboard: → ↑ → → ↓ ...

### 4. Fix a wrong length

Click the note and choose its length: the **Length** buttons, or the keys **3** (16th), **4** (8th), **5** (quarter),
**6** (half), **7** (whole); **.** adds or removes the dot. The button of the note's present length is dark.

Changing a length moves everything after it, so fix lengths in pairs. Example, a sheet has two even eighths where
the singer is short on the first and early on the second:

1. click the first, press **3** (it becomes a 16th);
2. click the second, press **.** on an eighth (it becomes a dotted eighth).

The bar is full again. A bar that looks wrong after a change (a tie into the next bar, rests at the end of the sheet)
is the page telling that the lengths before it no longer add up.

A long note that crosses a bar line is still one note here: give it its whole length and the page draws the tie.

### 5. Add, remove and split notes

- **A note is missing**: click the note before it and press **N** (or **+ After**; **+ Before** for the other side).
  The new note copies the pitch and length of the chosen one: correct them as in steps 3 and 4.
- **A note too many**: click it and press **Delete**.
- **One note should be two** (a syllable sung on two notes): click it and press **S**. It is cut into two halves of the
  same pitch; move the second one with ↑ ↓. The second half has no word, so it is slurred to the first.
- **A rest**: click the note and press **R**. R again makes it a note.

### 6. Words

1. Click the note where the words start and press **Enter**: the cursor is in the **Word** box.
2. Type the syllable and press **Space**: it is written and the next note is chosen. Type the next one.
3. Inside a word press **-** in place of Space: `De-` `fend-` `er` is written as De - fend - er.
4. A note that carries on the syllable before it stays **empty**: just press Space on it.
5. **Esc** leaves the box.

**+ Verse** adds another line of words under the notes (stanza 2 under stanza 1); the card then has a box per verse.

### 7. Chords

Click the note the chord starts on, press **H**, type the chord (`G`, `Am`, `D7`, `G/B`, `F#m`, `Bb`) and press Enter.
An empty box removes the chord. **Key −** and **Key +** move the whole song a semitone, notes and chords together.

### 8. The head of the sheet

Title, key, time signature and tempo are in the top bar. **Upbeat** is the length of the first, incomplete bar in
eighth notes (`1` for a single eighth note before the first bar line, `0` when the song starts on beat 1). If every
bar line sits in the wrong place, the upbeat is what to change, not the notes.

### 9. When something went wrong

**Undo** (Ctrl Z) takes back one change at a time, also a change that came from the file; **Redo** is Ctrl Y. Older
versions are in the song's `leadsheet.history/` folder, one file per save, named by date and time: copy one over
`leadsheet.json` to go back to it.

### 10. Take the sheet out

- **Print / PDF** prints the sheet alone (choose "Save as PDF" in the print window).
- **MIDI** downloads the melody; **MEI** downloads the sheet in the format the app's sheet viewer reads.
- Nothing needs saving by hand: the sheet is already in `leadsheet.json`.

### 11. Asking the other editor

To leave a question on one note, click it and write in **Comment** ("too high?", "is this an eighth?"): the note turns
orange and the comment is listed under **Notes between us**, where a click on it goes to the note. Longer things go in
the box there. The other editor reads both in the file, changes the notes or answers in the same places, and those
changes show up blue in the page.

## Taking the sheet into the app's tools

Every save also writes `<song>/leadsheet.mei`, the sheet in the form of the app's own sheets (`assets/sheetMei`: key
as `key.sig`, chords with a `tstamp`). `tools/hymn-midi/make_midi.py <song>/leadsheet.mei out.mid <bpm>` makes the piano
MIDI from it (the `generate-midi` skill); copying it into the app (`sheetMei/<id>.mei`, the hymn's tune code,
`res/raw/m<tune>.mid`) is a separate step.

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

## Putting the sheet into the app

`leadsheet.mei` is only the music. `python3 tools/lead-sheet-editor/finish_mei.py leadsheet.mei <id> <parent id> "<title>" > app/src/main/assets/sheetMei/<id>.mei` adds the header (subtitle and number from the parent's sheet) and the parent's later stanzas (`<back>`, the only place the viewer takes the stanzas below the notes from), and prints every bar's length so a wrong bar shows.
