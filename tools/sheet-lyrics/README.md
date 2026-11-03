# French lyrics under the sheet music

A French hymn (FR<n>) borrows the sheet of its English hymn, so its sheet used to show English words.
This folder puts the French words under the notes, without making a second copy of every sheet.

```
python3 tools/sheet-lyrics/align.py            # all French hymns: writes app/src/main/assets/sheetLyrics/FR<n>.json + review/
python3 tools/sheet-lyrics/align.py FR10 FR16  # just these
python3 tools/sheet-lyrics/test_french.py      # checks of the syllable splitter
```

## How it works

1. `french.py` gives every French word a few *readings*: its syllables as sung. A final silent -e may be sung or not
   (*no-tre* / *notre*), *ion* may be one or two syllables, and so on. Each reading has a cost.
2. `align.py` reads the notes of the English sheet (`sheetMei/<parent>.mei`; only notes that carry a syllable count),
   finds how many notes each English phrase has (from the English stanza in the database), and picks one reading per
   French word so that the French fills exactly those notes. Cheapest combination wins.
3. The result is `sheetLyrics/FR<n>.json`: the syllable for each note id, the title, and verses 2, 3... (plain text below
   the staff, taken from the database as they are). The viewer (`assets/viewer/viewer.js`, `applyLyrics`) swaps them into
   the English MEI before drawing, when the app opens the sheet from a French hymn (`?lyrics=FR<n>`).
   Hymns with no overlay file just show the English sheet.

Only verse 1 and the chorus sit under the notes. The subtitle (the category) is left out of French sheets because the
database has it in capitals without accents.

## What a choir would do (adapted hymns)

A translation often has a syllable more or less than the music. When a phrase is off by a few syllables the tool does what a
choir does: **a syllable is held over two notes** (it picks the end of a word on a long note; the viewer draws an extender line),
or **two weak syllables share one note** (a silent -e before another word: `la‿chair`). It never changes any French word.
Those hymns are `adapted` in the report, and `review/FR<n>.txt` shows the result with `_` for a held syllable and `‿` for a
shared note, for a French speaker to check. If more than 15% of a hymn's notes would have to change, the hymn is left in English.

## What the tool cannot decide

Some translations differ too much from the music: the French text is much shorter or longer than the notes, or the music
repeats words the stanza text does not spell out. Those hymns get **no overlay** (they keep the English sheet) and a file
`review/FR<n>.txt` with each English phrase, its number of notes, and a French suggestion. See `review/INDEX.md` for the list.

To fix one: open the file, edit the French under each phrase so that it has exactly as many syllables as there are notes,
and run `python3 tools/sheet-lyrics/align.py FR<n>`. Edit **a copy in `overrides/`** (same name): `overrides/FR<n>.txt` wins over the
database. Syllables are joined by `-`, a hyphen that really belongs to the word is written `|`, a syllable held over two notes
ends with `_`, two syllables sung on one note are joined with `‿`, and a word that goes on in the next line ends with `-`.
Every phrase line must use exactly as many notes as the English phrase above it has.

`check` in the report means the French fits the notes but its lines do not end where the English phrases end.
