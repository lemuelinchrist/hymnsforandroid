# Lessons and findings (2026-11-24 to 2026-11-28)

What we learned while making the English sheets from the MIDIs: the taste we aim for, how the MIDI gets misread, the tool bugs
found (all fixed), what was tried and undone, and how to redo a hymn. Read this before touching a hymn's chords again.
The commits named here hold the details (`git show <hash>`).

## 1. The taste: what a good chord sheet is here
- **Clean classic four-part hymnal harmony.** "Complex doesn't always mean good." The aim is the hymnal's own setting, with
  enough movement to sound good and still be easy to play on the piano. Not the lead-sheet style (sus2, add9, maj7 and 7ths
  everywhere, ii-V on every bar).
- **Keep the real moves**: walking basses (E245 bars 23-24, E1130 E♭-G♭-F), secondary dominants (E884's C → C/E, B♭7 → E♭m),
  4-3 suspensions at cadences, V-I and ii-V-I at the ends of lines.
- **Remove the noise**: a sus or add chord flickering on a half beat, a chord for every passing note, a chord that changes and
  comes back within a beat.
- **When two readings differ, take the cleaner one.** Reference pairs from the listening review (2026-11-27): E594 is better
  than E663 (same melody: E663 has some nice chords but also noise), and E340 (plain, classic) is better than E580 (complex in
  the wrong way). E663 and E1063 now take E594's chords.
- **Endings close V (or ii-V) → I on the home chord.** A vi → I, a iii → I or a final IV/I "Amen" chord sounds wrong. An
  ending over a held tonic bass (a pedal) is fine when the MIDI plays it.
- **Diminished chords** are written as the plain chord they stand for (G♯dim → E/G♯, Edim/B♭ → C7/B♭): pianists read those
  more easily (`tools/simplify_dim.py`, 55774dcda, kept after a side-by-side review).
- **A rule that fits one bar is not a general rule.** C♯m7/E → E was right in E541/E751 bar 15 (an E over a walking bass), but
  "a minor seventh over its own third is the relative major" for all sheets was wrong and was reverted (107754758, af748dc0c).
  Look at the context before turning a fix into a rule.

## 2. How the MIDI gets misread (and how to spot it)
The MIDIs are four-part settings played as one track. A chord named from "the notes sounding at the beat" is wrong in these
cases, all found by ear and fixed in bulk:

| Misreading | What the MIDI really does | Found in | Fix |
|---|---|---|---|
| iii or vi just before the last chord | the V with its 6th in the melody (named iii/5), or the tonic arriving half a beat early (named vi) | E1349, E245, 38 hymns (51cf4c03f) | V (V7 where the 7th sounds) carries to the end |
| a minor chord on the 3rd, or a 7th on the 6th, over the dominant bass before V or I | the V with its 6th in the melody | E235 (E7/D was D7), 114 hymns (65fd00b1d) | write V / V7, or drop it if the V before goes on |
| a final IV over the tonic ("Amen") | the Amen chord under the closing fermata | 15 hymns (f8cf4606d) | left out: end on I |
| major chord on a bare fifth or octave | no third sounds yet; it comes in a moment later | E715's A on "tears" (Am), E1243 in F minor played as F major, 178 chords (386848626) | the key's own quality: ii, iii, vi minor (i, iv in minor). `midi_align.py BARE=<file>` lists them |
| inversions jumping under one chord | a bass played in broken chords, like a piano part | E245 (5138459a1) | a bass leap under the same chord is not a change |
| chords on passing notes | the melody or an inner voice passing | E715 bars 2 and 6, E720 | keep only real harmonic moves |
| no chord at all in the first bars | the MIDI plays the opening in unison or octaves | E834 bars 1-2 and 106 more (6d41f9df5) | the old sheet's chords kept there |
| an E7/D in a hymn in G | a D7 with its 6th in the melody | E235 | V7 |

When a hymn sounds wrong, suspect first: the chord just before the last one, any chord that is not diatonic, and anything on a half beat.

## 3. Tool bugs found (all fixed; worth knowing if an old sheet looks odd)
- **Triplets** (2026-11-28): `midi_align.py` read a tuplet at its written length (three quarters, not two), so the chords
  after a triplet came half a beat late or past the end of the bar (an F♯m in E337, D♭/F in E303). E152 by hand (1036dbfc0) and 16 more by
  `tools/tuplet_chords.py` (7b0e2095d). `read_old` in `midi_to_sheet.py` now counts tuplets. Check: no E or NS sheet has a chord past
  its bar's end.
- **Chord order**: `add_offbeat.py` put the chords it added at the end of the bar's list; the viewer, Simplify and the player
  expect time order. 786 bars in 245 sheets were sorted (953cb6744); Simplify sorts by itself as well.
- **6/8, 9/8, 12/8**: chord positions are counted in the meter's unit (eighths), not the dotted beat (6a3e72975). `add_offbeat.py`
  samples every eighth there (`SUB=3`).
- **Jittery voices**: a hand-played MIDI starts its voices a few ticks apart; they count as one onset, and only exact pitch matches
  fix the time map (90439b206, E20 "stand").
- **A chord between two beats** goes at the melody note it starts with (d202c6134, E16 bar 8).
- **Low bass notes** taken as melody (E1151, E1024): left out (6f37b3355).
- **Tempo**: `midi.bpm` is always quarter notes a minute, whatever the meter. A MIDI that counts half notes doubles the tempo (E25 and E52
  at 154 → 92). The user sets tempos by ear: E154 120, E152 130, E889 and its tune 110, E25/E52 92.
- **Ties**: a slur over notes of one pitch with no syllable on the later ones is a tie (5e6ceaf37); otherwise the player strikes the note again.

## 4. What was tried and undone
- **One chord per beat, named by the notes that last** (`chords.py`, 92587d667): cleaner, but it lost the colour of the four parts
  and the user disliked it ("the playing feels less colorful"). Reverted in dbed5ccc6. Clean up noise by hand, hymn by hand, instead.
- **Relative-major rule** for minor sevenths over their third: reverted (see 1).
- **Stretching a fermata note by hand** (E384 bar 15): reverted. The sheet keeps its written lengths.

## 5. How to redo a hymn's chords by hand (the E1130 way)
1. `python3 tools/show_hymn.py E152` (add `SUB=2` for every half beat): the bars, the sheet's chords and what the MIDI plays on each beat.
   For a bar with a tuplet, check the times by the notes' real positions. The samples blur where the voices move every half beat
   (they catch the old and the new notes together); for a MIDI on the grid (`off 16th grid` 0% in `INDEX.tsv`) read the voices exactly with
   `python3 tools/midi_voices.py <tune> <pickup quarters> <quarters a bar> [0.5]` (E74, E659, E1313), or better
   `python3 tools/read_hymn.py <hymn>`: the same voices laid bar by bar under the sheet's melody and chords, already in the sheet's key,
   with a check that the top voice is the melody (if most bars differ, the MIDI does not line up by time: E406). The MIDI can be in another key than
   the sheet (E659's in G for a sheet in F): transpose the reading.
2. Read it beat by beat. Name the chord of the four voices, skip passing notes, and keep the moves in section 1.
3. `python3 tools/set_chords.py E152 "1: 1 Fm, 2 Fm/A♭, 3 C, 4 D♭; 2: 1 C, 3 Fm"`. It writes into the hymns of the same tune that have the
   same melody too (it compares pitch, octave and duration, not other attributes).
4. Rebuild (`python3 tools/web/build.py`) and listen on the local server before committing.

Other sources, by how well they worked:
- **A photo of the hymnal page** is the most accurate (E223, E1201, E346, E384, E577): read the four parts bar by bar. Pages are often in
  another key than our sheet: keep our key and transpose the reading.
- **Another hymn with the same melody** whose chords are better (E30, E11 and E865 take E884's; E841 takes E439's; E663 takes E594's).
- A MIDI of another tune with the same melody: `MIDI_TUNE=<hymn>=<tune>` (E1356, E811, E897).

## 6. Player, viewer and Simplify facts the sheets rely on
- **Off-beat chords sound** where they are written (2eb30da7e). Of two chords closer than an eighth, the one on the beat wins.
  A chord that never sounds is hidden in the viewer.
- **Overlapping chord labels**: the viewer hides the less important label (the bar's first beat, then other beats, then off-beats).
- **Transposing**: Verovio's transposition ignores the key signature, so the viewer first writes the implied accidental onto every note
  (`spellOut` in piano.js). Checked across all 1,362 hymns at +1, -1, +2 and +5.
- **Simplify** (tools/web/src/simplify.js, 24c88a601): both levels keep every chord on degrees 1, 2, 4, 5 and 6, and every secondary
  dominant, so the hymn stays recognizable. Medium uses light shapes, keeps the slash bass, and has at most 3 changes a bar. Easy uses
  plain triads, turns colour chords into the nearest main chord, and has at most one change a beat (a V into I may be half a beat). The
  key comes from the key signature, plus the last chord for minor. So a sheet with a wrong key signature or a wrong last chord simplifies badly.

## 6b. Three levels with the four voices (pilot, 2026-11-28)
Decided after batch 3: the cleaned chords lost complexity, so a sheet keeps the MIDI's four voices and three levels share them.
- **Original**: the raw, unedited voices (soprano and alto on the treble staff, tenor and bass on the bass staff) and chords named from
  them exactly as they sound (`<harm>` with no type). Never edited by hand: a wrong Original chord means wrong notes or a naming bug.
- **Medium**: the melody with simplified chords (`<harm type="medium">`): the hand clean-ups of batches 1-3 are this. Sheets without
  hand-made Medium chords get them from simplify.js, which since this day has no limit on chord changes a bar.
- **Easy**: worked out from Medium (simplify.js).
- Medium is the default level; the guitar sheet uses Medium's chords. Chorale plays the four voices at every level (the hymnal's own
  parts); Flowing, the guitar and the rest play the chords of the level shown. Chord editing is off on voiced sheets for now.
- `tools/add_voices.py <hymn>... --write` adds the voices: only on-grid MIDIs that play the sheet once, the melody the top voice in every
  bar; tuplets, repeats and endings are refused. Pilot: E789, E149, E602, E803, E743 and their tune-mates (14 sheets). E889's family
  points at another tune entry and did not line up.

## 7. Open items (2026-11-28)
- Noisiest hymns still to clean by hand: 151 (98 tunes) score above 1.0, 35 above 1.5. Done so far: batch 1 (6dde673ab, E1130 and 11 tunes),
  batch 2 (2026-11-28: E287, E1334, E1311, E952, E74, E659, E1313), batch 3 (2026-11-28: 19 tunes, 40 sheets: E702, E149, E789, E743,
  E844, E803, E335, E418, E190, E1151, E1196, E344, E1243, E1302, E592, E943, E713, E602, E921 and their tune-mates). E702 sounded good
  but was cleaned too, to be easier to play. E406 left alone: its MIDI is played too freely to line up (do it from the hymnal page).
- Common noise in batch 2: a chromatic or neighbour-note melody over a held bass read as a new chord on every half beat (E1334's C-D♭-D-E♭
  over A♭ gave A♭sus4, E/A♭, A♭), sus2/sus4/Maj7 named from passing notes, 16th-note chords at the end of a bar, and the chord with
  its 6th in the melody named as the relative minor (E659's B♭ as Gm/B♭, E1313's D as Bm/D).
- Batch 3 patterns: a waltz or "oom-pah" piano part (E702: bass and chord on beat 1, two voices in thirds after) is one chord a bar; a broken
  bass alternating root and fifth (E844: C-G-C-G) is one chord; a drone of open fifths (E1243) gives Fm or B♭m a bar, the passing notes
  above it are not chords; a piano MIDI with five or six notes puts accompaniment above the melody (E190): read the bass and chord tones.
  Diminished chords follow the rule of section 1 (E°7 → C7/E, A°7 → F7/A, G♯°7 → E7/G♯); the converter often spelled them as nonsense
  (G♭7/E, A/D♭, A♭7/F♯). The last bar follows section 1 too: no IV over the tonic before the final chord (E190).
- Hymnal page photos needed: E1340 (12/8 or 3/4?), E379/E393, E598, E993, E1296.
- Spots for a listen: E577 bars 5-8 and 14; E384 bars 4, 7, 8, 12, 15; E1353 bars 7 and 13; E1226/E1354 bar 1; E715 bar 3 (D/A or D7/A?);
  the dominant endings of E75/E1108.
- Optional: respell 411 slash chords spelled the wrong way; the half-beat pass for the `midi_to_sheet.py` hymns; fermatas in playback.

## 8. Voices for every English hymn (branch voices/original, 2026-11-28)

- `add_voices.py` was run over all English sheets: 1,130 now have their four voices (the pilot 14 included); 197 were refused because
  more than 2 melody notes are not the MIDI's top voice (the MIDI is another arrangement, or in another key/layout), 21 for tuplets,
  repeats or endings. Those keep the melody-only sheet and need a look by hand (or the printed page).
- A melody note an octave off the MIDI's top is accepted (same voice); up to 2 notes with another pitch class are accepted and
  reported ("N melody notes differ from the MIDI top"): look at those bars when listening.
- Medium chords: hymns cleaned by hand (hand_medium.txt, from batches 1-3 and the earlier hand work) are filed as `<harm type="medium">`;
  all the others as `type="medium-auto"`: the converter's chords, from which the player and viewer work Medium out with Simplify, as before.
  A hymn becomes hand-made Medium by editing its `medium-auto` harms and renaming the type to `medium`.
- Sheets grew from 48 to 63 MB.
- Review player (branch voices/original only, never for master): the level menu of a voiced sheet has "Review: hear the chords". On, Chorale
  plays the chords of the level shown (Medium or Easy, as a sheet without voices would) instead of the four voices, so wrong chords can
  be heard. It is kept in localStorage `hfw.reviewChords`. 45 more sheets lined up when add_voices tried the transposition with the
  fewest melody notes off; of the 152 still refused, about 85 have a MIDI that is another setting (under 40% of the melody matches): they need the printed page.
- **Not every MIDI is a four-part setting** (found on E33, 2026-11-28): some are a piano accompaniment (broken chords, sixteenths in the
  lower voices) or one line only; ranking their simultaneous notes gives nonsense voices. add_voices.py now refuses a MIDI unless the
  tenor and bass have 1.6-2.5 notes per melody note and at most 25% sixteenths (a chorale: about 2.0 and none; E33 had 3.3 and 41%).
  207 sheets that the first roll-out had voiced were put back to their melody-only sheets (kept in the commit history; list: this commit's message).
