# Lead sheet editor

A small web app to correct a lead sheet (melody, words, chords) by hand and by ear, and to make a piano part of it (a
left hand from the chords, notes added under the melody), without MuseScore or any other notation program. It was made for the drafts that `tools/audio-transcribe` writes from a
recording, which always need a last pass by someone who can listen.

It is built for two editors at once: the person in the browser and an agent (or anyone with a text editor) working on
the same file. The sheet is one JSON file per song; the page saves every change into it and shows within two seconds
what anyone else wrote into it.

## Use

```sh
python3 tools/lead-sheet-editor/server.py                # http://localhost:8777/ ; --port, --root (default temp/transcribe)
/home/lemue/venvs/transcribe/bin/python tools/lead-sheet-editor/from_musicxml.py temp/transcribe/<song>   # sheet.musicxml -> leadsheet.json
node tools/lead-sheet-editor/test_music.js               # the tests of the logic (music.js)
```

The server only listens on this computer (127.0.0.1) and needs nothing but Python 3. `from_musicxml.py` needs music21
(the transcribe venv has it); it does not replace a `leadsheet.json` that exists unless `--force` is given, since the
file may hold hand edits. The page draws with the app's own Verovio (`app/src/main/assets/viewer/verovio-toolkit-wasm.js`).

## The page

- **Top bar**: the song, its title, whether the sheet is saved, Undo / Redo, **Versions** (every save keeps the version
  before it; any of them can be brought back), **Save as** (Print / PDF, the lead sheet as MEI, the sheet with the piano
  part as MEI, MIDI), the keys (**?**) and light / dark.
- **Second bar**: key (− and + move the whole song a semitone, notes and chords), time, upbeat, tempo; on the right what
  the sheet shows: the beat counting (**1 & 2 &**), the **piano part** (the left hand's staff and the notes added to the
  right hand; off, it is the lead sheet alone), and its size.
- **One page for everything** (there is no switch between melody and chords): notes, words, chords and the piano part
  are all at hand at once. The keys mean notes: ↑ ↓, A–G, 3–7, N, S, T, R, Delete. Chords: **H** opens the chord box,
  **Alt** + A–G starts one, **Alt** + 1–7 puts a chord of the key, **[** and **]** go to the chord before and after,
  **Alt Delete** removes it. The side panel has the chord builder and a card for each hand.
- **The sheet** in the middle, the **side panel** on the right (the chosen note, the hands, notes between the editors).
- **Bottom**: the player, then **the recording** as one bar across the whole width (play / pause, ▶ From this note,
  speed, Follow, **Go to this note**, and a long slider to jump anywhere in the song: grey lines are the places set by
  ear, the red one is the chosen note), then the keyboard. The player (Play, Loop, Click, speed, which parts sound, piano or organ tone) and a **keyboard** that shows
  what sounds at the chosen note: the melody note red, the piano part green, the notes of the chord with a dot. A click
  on a key sets the chosen note to it; Shift and a key below the melody adds or removes a right-hand note.

## Guide: correcting a sheet step by step

### 1. Open the sheet

1. Start the server (first command above) and leave its window open. It prints the address.
2. Open http://localhost:8777/ in the browser. The list at the top left chooses among the songs that have a
   `leadsheet.json`; the address keeps the choice (`?song=<folder>`), so it can be bookmarked.
3. A song that is not in the list has no `leadsheet.json` yet: make it with `from_musicxml.py` (second command above)
   and reload the page.

The top right always says where the sheet stands: `Loaded`, `Saving…`, `Saved 9:41:07 PM`, or
`Updated from the file …` when someone else changed it. A red message there means the change was **not** saved (the
server is not running, or the file was changed at the same moment).

### 2. Listen and find the wrong note

1. Click a note and press **P** (or **▶ From this note** in the recording bar): the recording plays from that note.
   P again stops it. While it plays, the note it has reached is purple in the sheet (**Follow**), and ½× or ¾× slows it
   down without changing the pitch.
2. Press **Space** (or **▶ Play**): the sheet plays from the chosen note, and the note being played turns green. Space
   again stops it. Clicking a note also sounds it once.
3. **Loop** (L) repeats the bar of the chosen note, or the notes chosen (Shift ← → or Shift click chooses several),
   until Space. **Click** (M) adds a click on every beat. The speed can be halved; **Organ** in place of Piano holds
   every note at full strength for its whole length, which shows wrong lengths better.

**Where the recording is.** The page knows the tempo and, from the transcription, where the singing starts; that is
enough to land near the chosen note. To make it exact: pause the recording right where the chosen note starts and press
**This note is here**. One such place sets the start; two or more (say, the first note of each line) make the page
follow a recording that speeds up or slows down. They are kept in the sheet (`sync`).

### 3. Fix a wrong pitch

Click the note (it turns red), then:

| To do this | Press | Or click |
|---|---|---|
| one step higher or lower in the key (G → A → B → C) | ↑ ↓ | ↑ ↓ |
| a semitone higher or lower (G → G♯) | Shift ↑ ↓ | ♯ ♭ |
| an octave higher or lower | Ctrl ↑ ↓ | 8↑ 8↓ |
| a named note, the nearest one (the key's F is F♯ in G major) | A to G | a key of the keyboard |
| write C♯ as D♭ or the other way | | ♯↔♭ |

Each change sounds the new pitch. ← and → go to the note before and after, Tab and Shift Tab to the next bar and the
one before, so a whole line can be walked with the keyboard: → ↑ → → ↓ ...

With several notes chosen, the same keys move all of them (a line an octave too low: choose it, Ctrl ↑).

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

### 5. Add, remove, split and copy notes

- **A note is missing**: click the note before it and press **N** (or **+ After**; **+ Before** for the other side).
  The new note copies the pitch and length of the chosen one: correct them as in steps 3 and 4.
- **A note too many**: click it and press **Delete**.
- **One note should be two** (a syllable sung on two notes): click it and press **S**. It is cut into two halves of the
  same pitch; move the second one with ↑ ↓. The second half has no word, so it is slurred to the first.
- **A note held on, not sung again** (a tie, for example a long note under which the chord changes): make it two
  notes (**S**), click the second and press **T** (or **Tie**). It takes the pitch of the note before it, is drawn tied
  to it and is not played again; its own chord stays on it. T again makes it a separate note. In the file: `"tie": true`.
  A long note that only crosses a bar line needs none of this (step 4).
- **A rest**: click the note and press **R**. R again makes it a note.
- **A line that comes again**: choose its notes (Shift →, or Shift click on the last one), **Ctrl C**, click the note it
  should follow, **Ctrl V**. The notes come with their chords and without their words, since a repeated line is mostly
  sung to other words. Ctrl X cuts, Esc goes back to one chosen note.

### 6. Words

1. Click the note where the words start and press **Enter**: the cursor is in the **Word** box.
2. Type the syllable and press **Space**: it is written and the next note is chosen. Type the next one.
3. Inside a word press **-** in place of Space: `De-` `fend-` `er` is written as De - fend - er.
4. A note that carries on the syllable before it stays **empty**: just press Space on it.
5. **Esc** leaves the box.

The **Word** box is in the side panel in both ways of working; Enter in it opens
the chord box, and Space and `-` go on from note to note as above.

**+ Verse** adds another line of words under the notes (stanza 2 under stanza 1); the card then has a box per verse.

### 7. Chords

Click the note the chord starts on. Then, the fastest way first:

- **Alt 1 to 7** puts a chord of the key: the number on each **In key** button (in G major 1 = G, 2 = Am, 3 = Bm, 4 = C,
  5 = D, 6 = Em, 7 = D7). A green line under a button means that chord holds most of the melody from here to the next
  chord: a hint for where no chord is known yet, not a rule.
- **Alt A to G** (or **H**) starts typing one: the chord box opens with the letter, go on with `m`, `7`, `sus4`, `/B` and press Enter.
- **Root / Type / Bass**: the same buttons as the app's chord editor (`C`–`B` + `♭`/`♯`, the types `maj`, `m`, `7`,
  `maj7`, `m7`, `6`, `9`, `add9`, `sus4`, `sus2`, `7sus4`, `dim`, `dim7`, `m7b5`, `aug`, and a bass note).
- **Tab** goes to the next bar (also from the chord box), **[** **]** to the chord before and after, **Alt Delete** removes the
  chord of the chosen note.

So a song whose chords change with the bar is: `1` Tab `4` Tab `5` Tab `1` ... The chord box is always there too
(**H**), for a chord noticed on the way.

A chord can sit on any note or rest. Where it should change under a held note, split the note and tie the halves (step 5).

### 8. The left hand

The chords can be played: the card **Left hand** chooses how, and a second staff in the bass
clef shows it. Nothing is written by hand for this; the staff follows the chords, also when they change later.

| Style | What it plays | Choices |
|---|---|---|
| **Strike** | the chord in one stroke | Two notes (root and fifth), Three notes (the triad), Open (root, fifth, octave), Hymn (root and fifth where the chord starts, third and fifth higher up in the bars it lasts); Held, Twice a bar, Every beat |
| **Bass + chord** | a bass note, then the chord | by the time signature: Root and fifth, Bass and chords, Slow, In eighths; in three, Waltz |
| **Arpeggio** | the chord one note at a time (bass rings underneath) | Flowing (full-bar arch with warm 9th), Ballad (syncopated breathing), Open, Wide (to the tenth), Broken chord, Alberti, Rise and hold; in quarters, eighths or sixteenths |
| **Dynamic** | musical patterns that breathe and move | Adaptive (calm while the melody moves; from the beat where the melody holds a note or rests to the end of the chord, at least half a bar, an arpeggio fill), Rolled (soft upward harp-like chords), Pulse (contemporary ballad groove), Walking (bass steps smoothly into each chord), Chorale (bass and tenor, as in a hymnal: where one of them leaps a third into the next chord it walks through the note of the key between on the last beat (`passing: 2`, the web app's More walking: both voices, a fourth in two steps, and the bass to another note of a long chord halfway); with Two notes in the right hand it is four-part harmony) |
| **Own** | a pattern typed by hand | see below |

Under the styles: **▼ ▲** move the whole left hand an octave (the note between them is the lowest bass note),
**Pedal** lets the notes ring until the chord or the bar ends (`con pedale` on the sheet), **Held ending** makes the last
bar one held chord. Choosing a style plays the bar of the chosen note, to hear it.

**A different pattern for a part of the song.** **Applies to** says where a choice goes: the **Whole song**, **From
this note** on (a chorus played fuller than the verse), or **This bar** alone (one held chord before the chorus). The
places are listed under it and marked in green on the sheet; ✕ takes one out. **None** from a note on makes the left
hand silent there.

**What it does by itself**: the upbeat bar stays empty; a pattern starts again with every chord and every bar; the left
hand moves on the beat (a chord on a note that comes in early and is held over the beat starts with that beat); and a
figure that would reach the melody goes down an octave, whole, so the hands do not cross; but never below E2 (the bass) or C3 (the chord in the middle), so a hymn with a low melody does not get a muddy left hand.

**A pattern written by hand.** Every style is a line of text, shown in the **Pattern** box: steps of the same length
(the list beside it: eighths, quarters ..., or *held* for one step that lasts).

| In a step | Meaning |
|---|---|
| `1` `3` `5` `7` `8` `9` `10` `12` | the notes of the chord counted up from the bass: `8` is the octave, `9` the warm ninth above it, `10` the third above it |
| `c` `C` | the chord in the middle of the keyboard: `c` two notes (the third with the fifth, or with the seventh), `C` all of them |
| `w` | a smooth walking/connecting bass step leading into the next chord's bass |
| `t` | the tenor: one note of the chord under the right hand, moving as little as it can, rather the third or fifth than the bass's or the melody's note (Chorale is `1+t`: bass and tenor, as a hymnal's left hand) |
| `1+5` | together |
| `-` `.` | the step before goes on; silence |
| `A \| B` | A in the bar where the chord starts, B in the bars it lasts |

`1 5 8 5` in eighths is the open arpeggio, `1 c c` in quarters a waltz, `1+5 | c` held the hymn style,
`1 - 5 8 10 - 8 5` a slower figure of its own.

**Writing it out.** When the pattern is nearly right but single notes should be different, **Write it out as notes…**
turns the left hand into notes of its own. From then on they are changed like melody notes (click one; ↑ ↓, the lengths,
S, T, R, Delete, Ctrl C / V); on a chord, a click on one of its notes chooses that note alone, a second click the whole
chord again; **Shift A–G** or a key of the keyboard adds a note to the chord. The chords no longer move a written-out
left hand: **This bar from the chords again** makes the chosen bars anew, **Back to the pattern** drops the written
notes. This is the way to a full piano sheet: let the pattern do most of it, then write the rest.

### 9. The right hand

The melody can carry more than one note: the card **Right hand** adds notes of the chord under it.

- **Melody alone**, **Two notes** (one note added) or **Three notes** (two added).
- Where: **Where a chord starts** (the lightest: one fuller note with each chord), **On the beat** (the notes that start
  on a beat, and the long ones), **Long notes** (two beats or more), **Every note**.

The added notes are the nearest notes of the chord from a third below the melody down (never as close as a second,
never below the F under middle C), so a note with no chord over it yet gets none. They are green on the sheet, they
sound with the piano part, and the left hand stays under them.

**One note by hand**: click the note and click a key of the keyboard below the melody: that note is added, or taken
away if it was there. A note set by hand keeps its added notes whatever the card says (`h` in the file);
**These notes as the choice above says** gives the chosen notes back to the card.

### 10. The head of the sheet

Title, key, time signature and tempo are in the top bars. **Upbeat** is the length of the first, incomplete bar in
eighth notes (`1` for a single eighth note before the first bar line, `0` when the song starts on beat 1). If every
bar line sits in the wrong place, the upbeat is what to change, not the notes.

### 11. When something went wrong

**Undo** (Ctrl Z) takes back one change at a time, also a change that came from the file; **Redo** is Ctrl Y.
**Versions** lists the sheet as it was before each save (the last 200, in the song's `leadsheet.history/` folder): a
click brings one back, and Undo returns from it.

### 12. Take the sheet out

- **Print / PDF** prints the sheet as it is on the page, with or without the piano part (choose "Save as PDF" in the
  print window).
- **Lead sheet** downloads the melody, words and chords as MEI, the format the app's sheet viewer reads; **With the
  piano part** the same with both hands; **MIDI** what is on the page.
- Nothing needs saving by hand: the sheet is already in `leadsheet.json`, and beside it `leadsheet.mei` and, when it
  has a piano part, `piano.mei`.

### 13. Asking the other editor

To leave a question on one note, click it and write in **Comment** ("too high?", "is this an eighth?"): the note turns
orange and the comment is listed under **Notes between us**, where a click on it goes to the note. Longer things go in
the box there. The other editor reads both in the file, changes the notes or answers in the same places, and those
changes show up blue in the page.

## Taking the sheet into the app's tools

Every save also writes `<song>/leadsheet.mei`, the sheet in the form of the app's own sheets (`assets/sheetMei`: key
as `key.sig`, chords with a `tstamp` and written with ♯ and ♭, as the other sheets do: the viewer's guitar view moves them by those signs; the viewer reads `#` and `b` too). It is always the lead sheet alone, whatever the page shows.
`tools/hymn-midi/make_midi.py <song>/leadsheet.mei out.mid <bpm>` makes the piano MIDI from it (the `generate-midi`
skill); copying it into the app (`sheetMei/<id>.mei`, the hymn's tune code, `res/raw/m<tune>.mid`) is a separate step.

`leadsheet_to_midi.py <song>/leadsheet.json out.mid [bpm]` writes the melody and the left hand as a MIDI file (the editor's own
playback, run under Node; used for a song's `res/raw/m<tune>.mid`).

`piano.mei` is the same music with the piano part: a second staff (`<staffDef n="2">`, bass clef, in a brace) for the
left hand, and the right hand's added notes as chords with the melody on top (`<note type="fill">` for each added one).
One MEI file can hold both kinds of sheet: the lead sheet is the piano sheet without staff 2 and without the `fill`
notes, and everything else (bars, words, chords, ids) is the same in both. **The app's viewer does not know a second
staff yet** (its chords-over-words view and its chord editor read every staff as the melody), so `piano.mei` does not
go into `sheetMei/` until the viewer has a way to leave the piano part out; until then it is for printing, for MIDI and
for other notation programs. (The web app has a piano part of its own for every hymn, made from the chords when the
sheet is shown: "Both hands", `tools/web/README.md`. It does not read `piano.mei`.)

## Working together on one sheet

- The page saves half a second after each change (`Saved` at the top right) and keeps the version before each save in
  `<song>/leadsheet.history/` (the last 200).
- A change made in the file from outside appears in the page by itself; the notes that changed are **blue** until the
  next edit, and one Undo goes back to what was there before. Notes with a comment are **orange**.
- If both write at the same moment, the file wins and the page says so: the change in the page is not saved over it.
- An agent reads `leadsheet.json` (the `message`, each note's `c` comment, the notes themselves), compares it with the
  newest file in `leadsheet.history/` to see what the person changed, and writes its own changes with `server.dump`
  (one note per line, so diffs read as a list of notes). It answers in `message` or in a note's `c`.
- An agent gives a sheet a piano part by writing `acc` (and a note's `lh`) and `rh` into the file; `music.js` runs under
  Node, so `require('./music.js').accompany(sheet)` and `.rightHand(sheet)` show the notes they give without a browser
  (see `test_music.js`).

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
| `tie` | `true`: this note is the note before it held on (same pitch): drawn tied, not played again |
| `ch`, `c`, `e` | chord symbol above the note; a comment; `true` to spell the note the other way (D♭ for C♯) |
| `acc` | the left hand's pattern for the whole song: `{"pat": "1 5 8 5", "rate": 2, "low": 36, "pedal": true, "end": false, "style": "arp/open"}`. `pat` as in step 8; `rate` the length of a step in sixteenths (0 = one held step); `low` the lowest bass note (MIDI, 40 = E2 is the default: the bass is the first such note from there up; below it the sound is muddy and distorts); `end: false` plays the pattern to the end in place of a held last chord; `style` only tells the page which button to light. No `acc`: no left hand |
| a note's `lh` | a pattern like `acc` that takes over from this note on; with `"for": "bar"` only to the end of this bar, with `"for": "chord"` to the end of the chord; `{"pat": ""}` is silence |
| `rh` | notes added to the right hand: `{"add": 1, "on": "beat"}`. `add` 1 or 2 notes of the chord under the melody; `on` which notes get them: `"chord"` (where a chord starts), `"beat"` (on a beat, and long ones), `"long"` (two beats or more), `"all"` |
| a note's `h` | its added notes set by hand, a list of pitches below the melody (`[]`: none); it goes before `rh` |
| `left` | a left hand written out, in order from the first note of the song: `{"p": [43, 50], "d": 8}`, `p` a list of pitches or `null`; `tie` as for the melody. While it is there, `acc` and `lh` are not played |
| `sync` | where the recording is: `[[sixteenths from the first note, seconds], ...]`, places set by ear |

## The files

| File | What it is |
|---|---|
| `server.py` | the local server: the page, the sheets, their history, the recording |
| `index.html`, `editor.css` | the page |
| `music.js` | the logic, with no page in it: keys and chords, bars, MEI, the left hand from the patterns, the right hand's added notes. Also runs under Node, and in the web app: its "Both hands" makes a piano part for any hymn's sheet with the same patterns (`accompanyOn`, `chordsOnBeat`, `barMei`, `fillUnder`; `tools/web/src/piano.js`), so a change here changes both |
| `sound.js` | the piano (Salamander Grand Piano MP3s from `tools/web/vendor/piano/`, with a synthesized fallback) and organ tones and the player (it schedules a little ahead of the clock, so it can loop and stop at once) |
| `editor.js` | the page's behaviour: what is chosen, the panels, every change as an undo step and a save |
| `test_music.js` | tests of `music.js`, and of its MEI through the app's Verovio |
| `from_musicxml.py`, `finish_mei.py` | a MusicXML draft into `leadsheet.json`; `leadsheet.mei` into a sheet of the app |

## Limits

One voice in each hand (the right hand's added notes move with the melody, in its rhythm); no triplets, no repeats or endings (write the lines out); the keys with up to six sharps or
five flats. A written-out left hand does not follow later changes of the melody's lengths: it keeps its own time. A
sheet from someone's recording is a derivative of their arrangement: it stays in `temp/` (not tracked) until the owner
decides what goes into the app.

## Putting the sheet into the app

`leadsheet.mei` is only the music. `python3 tools/lead-sheet-editor/finish_mei.py leadsheet.mei <id> <parent id> "<title>" [strike/two/half] > app/src/main/assets/sheetMei/<id>.mei` adds the header (subtitle and number from the parent's sheet) and the parent's later stanzas (`<back>`, the only place the viewer takes the stanzas below the notes from), and prints every bar's length so a wrong bar shows. The optional last argument is the piano part the song starts with in the apps (the editor's style as family/kind/rhythm, from `acc.style` and `acc.rate`: 0 = `held`, a bar's half = `half`, a beat = `beat`; written as `<identifier type="hands">`); `rh` notes added: `strike/two/half rh=1:beat`. Without it the hymn uses the device's Both hands choice.
