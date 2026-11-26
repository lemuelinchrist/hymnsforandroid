# Classic hymns migration: plan (started 2026-11-24)

## 1. Goal
The English hymns' sheets come from hymnal.net's lead sheets: a melody with modern chord symbols (sus2, 7ths, 9ths ...). Lemuel
prefers the **purer classical hymnary** way of playing (the four-part settings in the hymnal), and the English MIDI files
already are that. So: make our own sheets from the MIDIs, replace the hymnal.net sheets, and once nothing needs a MIDI
any more, drop the MIDI files (archive them). It is a long project; we do a little every day and import sheet by sheet.

## 2. What we know (measured 2026-11-24)
- 1,362 English hymns, **874 distinct tunes**, every one with a MIDI (1.5 MB in all). **9,872 hymns in all books use an
  English tune code** (POR 1,354, S 884, RUS 798, C and Z 711 each ...), so a tune's sheet matters beyond English.
- Each MIDI is **one track of four-part harmony** (about 3.5 notes at once, 4 voices in 641 tunes, 5-7 in 215, one voice in
  14), one velocity (100), 120 ticks per quarter note, no lyrics, no chord symbols, no repeat or voice marks.
- 816 of 874 tunes sit on a sixteenth-note grid; 58 are off it (triplets or humanised): see `off 16th grid` in `INDEX.tsv`.
- 297 tunes use a **tempo dip** (to about 35 BPM for a moment) as a fermata or a ritard: the sheet needs a real fermata.
- Some MIDIs play every verse in a row (569 of the 1,362 hymns' MIDIs hold far more notes than one verse of our sheet): the
  sheet has to fold them back into one verse with repeats. E142's has one verse (16 bars).
- Our current E sheets are lead sheets: one staff, melody, chord symbols, lyrics. The guitar view, Chords only, chord
  editing, transposing by chord and Both hands are all derived from the chord symbols (DESIGN.md of svg-to-lilypond, section 19).
- **E142** (the copy on master, committed 2026-11-19): our own sheet in E major, 16 bars, `midi.bpm` 104 (the MIDI is 130 BPM).
  Compared with the MIDI (2026-11-24): the melody equals the MIDI's top voice at 51 of 55 notes. The differences: bar 4 beat 3 and
  bar 8 beat 3 repeat the held note (the MIDI holds it for 3 beats); the sheet has no note where the MIDI has E4 at bar 13 beat 2
  and A3 at bar 15 beat 4.5. Its chord symbols differ from the MIDI's harmony in about half the bars (Bsus2 where the MIDI has B
  major, G♯m7 where it has E/G♯, B9/A, AMaj7): chord symbols are a lead-sheet reading, not the four voices. The four spots
  are worth checking by ear and against the notation. If a newer E142 is on the PC, push it.

## 3. Decisions (proposed defaults; change them here)
1. **The unit is the tune**, not the hymn: a tune's music is made once, then each English hymn that has it gets that music with its own words
   (the words are placed with `tools/sheet-lyrics/align.py`, as for translations). Check the other books afterwards.
2. **What the new sheet is**: a **four-part score** (soprano and alto on the upper staff, tenor and bass on the lower), with the
   words under the soprano. It is stored as MEI like our other sheets, marked `Hymns For Android` as source.
3. **Chord symbols stay available.** The guitar sheet, Chords only, chord editing and transposing need them. They are derived
   from the four voices (simple triads and sevenths where the voices say so, a slash bass for inversions), then reviewed by hand. No sus2, 9ths
   or added tones unless the voices have them. This makes them differ from hymnal.net's: intended.
4. **Playing**: the player plays all four voices of the sheet as written (the classical hymnary sound), with the sheet's own tempo
   and real fermatas. The lead-sheet "Both hands" accompaniments stay for sheets without a score.
5. **Unlocking per tune**: the new sheet replaces the old one only when it passes the checks in section 5. Until then nothing changes.

## 3b. Two ways to make the music: from the MIDI, or by hand
Route **M** (the MIDI) is in section 5. Route **H** (by hand, as E142 was made): enter the notes, words, fermatas and repeat marks
yourself in the lead-sheet editor or LilyPond. Use whichever is easier **per tune**, and use the other to check:
- **H with M as the check:** run `check_tune.py` against the MIDI: any note that differs is a typo in one of them, to settle by ear.
- **M with H as the check:** the draft from the MIDI, then compare the words, fermatas and repeats by eye.
- **Hard MIDIs** (the `needs care` rows: tempo dips, 5-7 voices, off-grid notes, one voice) go route H first.

## 4. Work that has to happen once (before the daily imports can pay off)
These are the viewer and player changes; each is its own task and can be done while the daily work goes on.
1. **Viewer**: show a two-staff four-part sheet with the words under it, on a phone (Verovio does it; our layout code assumes one staff).
2. **Player**: `scoreOf` plays the melody and builds the left hand; it must play every note of every voice of a score, with
   highlighting by the soprano's notes, transposing, the tempo slider and fermatas.
3. **Chords**: the guitar sheet and Chords only read `<harm>` per bar from the score; check they still work, and that editing chords
   in a four-part sheet is sensible (it changes the symbols, not the notes).
4. **MIDI -> draft** tool (`tools/midi_to_draft.py`): quantise, split the voices (soprano from the top note, bass from the
   lowest, alto and tenor between; check against the 4-voice tunes first), find the bars and pickup, tie across bars,
   fold repeated verses, turn tempo dips into fermatas, derive chords, write MEI (or LilyPond that `ly_to_mei.py` converts).
5. **Checks** (`tools/check_tune.py`): the sheet's notes equal the MIDI's note for note (pitch and time, after unrolling), the bars add up,
   the key and time match the MIDI and the database, every stanza's syllables fit the soprano notes (`align.py`).

## 5. Per tune (the daily routine)
1. Pick the next tune in `INDEX.tsv`: tunes without `needs care` first, the most English hymns first. Set it `in progress` in `STATUS.tsv`.
2. Make the draft from `midi/m<tune>.mid`: `python3 tools/midi_to_sheet.py <hymn> [--write]` (2026-11-26) keeps the old sheet's header, bars and words, takes the
   melody (top voice) and the chords (named from the four voices) from the MIDI, and says what differs from the old sheet; it refuses repeats, fermatas,
   rests and mismatched lengths, which go by hand. Run it for each English hymn of the tune. First five tunes (22 hymns) done with it.
3. Look at it and listen to it; fix what the draft got wrong (voices, rests, ties, the fermatas).
4. Run the checks. Keep the original MIDI's tempo as `midi.bpm`.
5. Import: write `app/src/main/assets/sheetMei/<hymn>.mei` for each English hymn of the tune (its own words), keep the hymn's id, source
   `Hymns For Android`; the guitar sheet is derived. Rebuild the web app's data (`python3 tools/web/build.py`) to see it.
6. Mark the tune `imported` in `STATUS.tsv` and commit on `media/work` (small commit per tune). Push and deploy when Lemuel says.
7. **MIDI files in the app**: none since 2026-11-26. Every hymn plays its sheet, and the English MIDIs are only here in `midi/`, as the reference for the sheets.
   Every English sheet names the Chorale accompaniment as its start (`<identifier type="hands">dynamic/chorale/half rh=1:beat</identifier>`);
   keep that line in each new sheet.

## 6. Order of work
1. E142's tune (in progress): finish it by hand as the pilot; it decides the sheet format (section 3) and tests section 4.
2. Make sections 4.1-4.3 work with E142's sheet on the phone and the web app.
3. Write the MIDI -> draft tool and test it on the 20 easiest tunes (one velocity, 4 voices, on the grid, no dips, 16 bars); compare with E142's hand work.
4. Daily: import tunes in the order of section 5, the easiest first; the `needs care` ones (tempo dips, 5-7 voices, off-grid, one-voice) later,
   by hand with the draft as a start.
5. When a book's tunes are all done, look at that book (the translations of those hymns borrow the English sheet, or have their own).

## 7. Open questions for Lemuel
- A four-part score on a phone: is the grand staff readable enough, or should the viewer offer a lead-sheet view derived from it as well (melody + the derived chords)?
- Should the sheet keep the first verse's words only, or all stanzas under the notes as the hymnal prints them?
- The MIDI tempo (130 for E142) or the sheet's old one (104)? The old MIDI tempos are hymnal.net's.
- Translations with their own sheets (C, S ...): move them to the new music too, or leave them?
