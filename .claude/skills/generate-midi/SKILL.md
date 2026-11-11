---
name: generate-midi
description: Use when a hymn has a tune code but no melody MIDI in app/src/main/res/raw (the Play button says "not available"), typically after a hymnal.net sync of New Songs or New Tunes, since hymnal.net no longer serves MIDI. Generates a simple two-hand piano MIDI from our own sheet (MEI), in the style of hymnal.net's "Easy hymn style".
---

# Generate a MIDI from our sheet music

hymnal.net stopped serving `.mid` files in 2026-10 (403; its pages offer MP3 only), so a newly synced hymn gets a tune code but
no `res/raw/m<tune>.mid`, and the app's Play button shows "Sorry, hymn not available". `tools/hymn-midi/` makes the file ourselves.

## What it makes
- Input: `app/src/main/assets/sheetMei/<id>.mei`. Our sheets are **a lead sheet**: one staff, the melody and the chord symbols. There is
  **no left hand in our data** (the two-hand piano seen on hymnal.net is built there from the chords), so the left hand is generated.
- Melody: as written (ties merged, tuplets, key signature and accidentals), at ♩ = 110 by default.
- Left hand, imitating hymnal.net's "Easy hymn style": in a measure where a chord starts, the low root + fifth for three beats and the upper
  dyad (third + fifth; third + seventh for 7ths; fourth + fifth for sus) on beat 4 (4/4 only); while the chord goes on into the next measures the
  upper dyad is held for the whole measure; a chord change inside a measure gets a dyad per chord; the first (pickup) measure is one held low dyad.
- Right hand: a chord tone a third to a sixth under every melody note of two beats or longer.
- `harm` `tstamp` counts in the **meter's unit** (eighths in 6/8): the script converts to quarter beats.
- Lemuel listened to NS1162 (v2 of the style) on 2026-11-11 and approved it ("sounds really good", more variety asked, then "very good").

## Steps
1. Find what is missing (hymns whose own or inherited tune code has no file; remember tune codes can carry a leading space and the app trims them):
   `python3 tools/hymn-midi/make_missing.py <scratch dir>/midi` (needs `pretty_midi`; the audio-transcription venv has it:
   `/home/lemue/venvs/transcribe/bin/python`). It writes `m<tune lower-cased>.mid`, one per tune code, never into `res/raw`, and prints the hymns that
   have a tune but no sheet (they get no MIDI: make the sheet first, see the `svg-to-lilypond` skill) and any failures.
2. One hymn only: `python3 tools/hymn-midi/make_midi.py app/src/main/assets/sheetMei/<id>.mei out.mid [bpm]`.
3. **Listen to a few before copying**, especially a 3/4 or 6/8 hymn, a hymn with a pickup and one with fast notes; compare the notes against the sheet
   (`pretty_midi` prints them). Hymnal.net's page shows its length at its tempo (NS1162: 1:11 at ♩ = 110, ours 72 s).
4. Copy only files whose tune code has no file in `res/raw` (the `hymn-provisioning` skill: never overwrite an existing tune's MIDI, other hymns in every language use it):
   `cp -n <dir>/m*.mid app/src/main/res/raw/`. Android resource names must be lower case (the script already lowercases).
5. Re-run `make_missing.py` (it should now find nothing to make) and build; Play on one of the hymns in the emulator.
6. Update the MIDI count in `docs/HYMNAL_SPEC.md` (melodies section) when files were added.

## Limits and traps
- One style only; hymnal.net's other accompaniments (block chords, oom-pah, broken chords) would need their own left-hand generators from the chord symbols.
- The left-hand pattern in 3/4 and 6/8 is just the held dyads so far (the beat-4 pattern is 4/4 only); improve it when a listener asks.
- Tempo is fixed; if a hymn is clearly too fast or slow, pass `bpm` (hymnal.net's page shows ♩ = n).
- A tune code shared with other hymns means the file is shared: a New Tune's MIDI is made from the sheet of the first hymn that uses that code, which is the
  right one only when the hymns have the same melody (they do, by definition of the tune code).
