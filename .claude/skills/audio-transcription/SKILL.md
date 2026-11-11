---
name: audio-transcription
description: Use when a recording (a YouTube video or an mp3) of a song should become sheet music, a melody MIDI or a lead sheet with words and chords, for example a song we have no sheet for; or when refining such a draft with the user's clues ("the first two notes are one quarter note"). Runs the tools/audio-transcribe pipeline on the GPU (Demucs, CREPE, Whisper, MMS_FA forced alignment, LilyPond).
---

# Transcribing a recording into a lead sheet

The scripts and their full description are in `tools/audio-transcribe/` (read its README first). This skill is the
workflow around them.

## Environment

- Python: `/home/lemue/venvs/transcribe/bin/python` (venv outside the repo; setup in the README). Check the GPU with
  `nvidia-smi` (RTX 5080, seen from WSL); PyTorch must be a cu128 build.
- Audio on Google Drive (`G:`) is not mounted in WSL: copy it in with
  `powershell.exe -NoProfile -Command "Copy-Item -LiteralPath 'G:\...\x.ogg' -Destination 'C:\...\temp\transcribe\<song>\source.ogg'"`.
- Work folder per song: `temp/transcribe/<song>/` (`temp/` is not tracked; the audio and stems are someone else's
  recording and must never be committed).

## First: the words

Before transcribing, **ask the user for the lyrics** (or which hymn it is), unless they already gave them. Known words
make the sheet much more accurate: Whisper mishears a choir ("Sunir and Irma" for "Senir and Hermon"), and every wrong
word puts syllables, and so notes, in the wrong place.
- A hymn in the app: its stanzas are in the database,
  `sqlite3 app/src/main/assets/hymns.sqlite "select no, text from stanza where parent_hymn='BF354' order by n_order"`
  (lines are split by `<br/>`). Search by a first line with `select _id, first_stanza_line from hymns where first_stanza_line like '%...%'`.
- Otherwise the user's text, or none (then Whisper's words, fixed in `words`).
Ask also how the song is built if it is not clear (one stanza? a chorus?): transcribe **one pass** of it, not the whole
recording; a part sung again only serves to check the first (repeats must agree).

## Steps

```sh
V=/home/lemue/venvs/transcribe/bin; T=tools/audio-transcribe; D=temp/transcribe/<song>
$V/python $T/prepare.py $D --url "https://www.youtube.com/watch?v=<id>"     # or --audio file.mp3
$V/python $T/crepe_melody.py $D
$V/python $T/lyrics.py $D                    # then read $D/lyrics.txt: where each line starts, the structure
$V/python $T/new_sheet_config.py $D --title "<title>"
#   edit $D/sheet.json: "lines" = the known words, one line each with its start from lyrics.txt ("end" on the last);
#   sections (one pass of the stanza; "repeat": 2 for a part sung twice); "hyphens" for names pyphen leaves whole
$V/python $T/align_words.py $D
$V/python $T/make_sheet.py $D                # sheet.pdf / .png / .musicxml / .midi
$V/python $T/show.py $D                      # bar by bar, to review
$V/python $T/grid.py $D <s> [<s> ...]          # the raw pitch per eighth, every stanza side by side: must agree with show.py
```

Look at `sheet.png` with the Read tool and review with `show.py`. `make_sheet.py` prints per section the syllables, how many
were placed and any lost (must be none).

Give the user: `sheet.pdf` (to read), `sheet.musicxml` (MuseScore 4 is installed on Windows: to fix notes by ear),
`sheet.midi`, and say plainly what is uncertain (bars, why).

## Reviewing without ears

The model cannot listen, so check the draft against itself:
- **Repeats must agree.** A part sung twice (a verse repeated, a line sung again) should give the same notes both times;
  where they differ, one is wrong. Compare the bars with `show.py`.
- **Syllables on notes**: almost every note of a hymn carries one syllable; many melisma notes (`_` in `show.py`) in a
  line mean the alignment or the note cutting is off there.
- **The tuning line** `crepe_melody.py` prints: tens of cents means an old or sunk recording; it is taken out.
- **Raw data** for one spot: notes of the melody MIDI, `pitch.npz` (time, f0, confidence every 10 ms), `beats.npy`,
  `syllables.json`. A short Python look at 2-3 seconds around the bar usually shows the cause.

- **A hymn with several stanzas: every stanza is a repeat.** Run each stanza through align and make_sheet (its words
  as `lines`, its seconds as sections) and compare the bars; a per-syllable look at `pitch.npz` in its raw octave,
  against `beats.npy`, shows what the passes agree on. Put what the majority says into the section's `fix`.
- **A part whose raw pitches are steadily outside the scale** (G sharp, D sharp in a D major song) is in another key,
  not sliding: give the section its own `key`, `mode`, `scale`.

## Using the user's clues

The user listens and gives clues like "the first two notes are eighths but it is one quarter: 'Christ' is the G quarter,
'is' the C quarter". Do not only patch that note: find **why** the pipeline got it wrong in the raw data, fix the rule
in the script, re-run, and check the other places the rule touches (repeats must still agree). Examples so far:
- Two eighths for one quarter → CREPE's pitch wobbled a semitone for 50 ms inside the note and the note cutter split it.
  Fixed: smooth the pitch, join parts under 70 ms, start a same-pitch note only at a break in the voice.
- Words on the wrong notes → Whisper's word times drift. Fixed: forced alignment (MMS_FA) per syllable.
- G♭/E♮ in a C minor line → slides into the next note. Fixed: `scale` in sheet.json.
- Octave flips → brothers and sisters. Fixed: octave chosen per note for a smooth line inside `range`.
- Notes "all over the place", repeats disagreeing (F♯/G for one sung note) → the recording was 28 cents flat. Fixed:
  `crepe_melody.py` measures the tuning and takes it out.
- Passing slides and stray notes between the sung ones → notes are now made per syllable (`"notes": "syllables"`).
- Wrong words → for a hymn in the database, give its stanza as `lines` in sheet.json instead of Whisper's words, and
  only one pass of the stanza as the section (hence: ask for the lyrics first).
- Chords flat (one chord for bars) or odd → the bar lines were a beat off and the bass stem silent (no bass player).
  Fixed: `"bar_offset": "auto"`, bass from the accompaniment's low register, melody and key as evidence; check with
  `CHORD_DEBUG=1`. Ask the user if the key sounds right (a song ends on its tonic, mostly).
- Notes an eighth early → a syllable's time is its first consonant's. Fixed: the note starts at the voice onset.
- A line's first word placed inside the line before ("Come" inside "mountains") → the alignment window reached back
  into the previous line. Fixed: a line's window starts after the previous line's last syllable.
- A chorus written with the wrong notes throughout (G/B/D/F sharp read as D major) → the chorus is in another key.
  Fixed: a section's own `key`, `mode`, `scale`.
- A held note cut in two an octave apart → the tracker went from the brothers to the sisters. Fixed: an octave jump
  inside a syllable is one note.
- A passing note the user hears but the sheet lacks (an E between F sharp and D sharp) → shorter than `melisma_s`, so
  dropped as a slide; if it is there in every repeat it is a note: put it in with the section's `fix`
  (`"then"`: a second note on the syllable's second half).

- Line starts an octave too high (C5 B4 written for a sung C4 B3 that leaps up to A4) → the octave rule smoothed away a
  real leap. Fixed: `"octave": "sung"` in sheet.json; see the next section.

## Before giving the sheet: check it against the raw pitch of every stanza

Do this on the first draft, not after the user says the notes are wrong ("We Rest on Thee": the first sheet had every
low line start an octave up, and the stanza comparison had not shown it, because all four stanzas went through the same
rules and so agreed with each other in the same error). `show.py` on each stanza compares the pipeline with itself;
`grid.py` compares it with the recording:

```sh
$V/python $T/grid.py $D 6.07 42.59 79.00 115.82    # one time per stanza: the same sung beat in each (from syllables.json)
```

It prints, per half bar and per eighth, CREPE's pitch in its raw octave and the strongest pitches of the vocals stem,
for each stanza. It uses neither the words nor their alignment. Read it against `show.py`, bar by bar:
- **Octave.** A note the grid has an octave away from the sheet (B3 against B4) is the octave rule at work. Decide which
  it is from the vocals stem: a sung B3 comes with F♯5 (its third harmonic), and when the next note is A4 with no A3
  under it, one voice really leaps. One voice, no doubling → `"octave": "sung"` (and a `range` that reaches the low
  notes). Brothers and sisters an octave apart → leave the rule on.
- **An eighth the sheet does not have.** A pitch that fills an eighth in most stanzas but is missing in the sheet is a
  note under `melisma_s`: a pickup of two eighths on one syllable (D4 C4 before the B3), a line's last syllable falling
  a step (A then G), a turn (F♯ then G). Put it in with `"then"` in the section's `fix`. "B4/A" in one eighth is a
  short note or a slide, not a second eighth.
- **Syllables an eighth late or early.** Where one stanza's `show.py` has a line's notes one eighth off from the grid
  and from the other stanzas (a long first note, the rest squeezed), the alignment slipped a syllable: `"shift"` them.
- **Lengths.** A long note followed by a pickup: the grid shows how many eighths each really has (a quarter and a
  two-eighth pickup, not a dotted quarter and one eighth).
- **A repeat that is not the same.** Lines sung again may start or end differently (the second time like another line;
  an ending on the tonic instead of the second). If every stanza does it, it is the tune: write the lines out, no
  `repeat`.
- **A note split between two pitches in the stanzas' vote** (2 against 2): print the pitch every 40 ms inside that
  syllable in each stanza; it usually is a slide or a turn that all stanzas sing alike, cut differently.
- **Chords.** `CHORD_DEBUG=1` scores close together and a chord foreign to the key (A7 in G major) with no sign of its
  third in the accompaniment: prefer the key's chord (`"chord_weights": {"key": 0.6}`) and tell the user the chords
  are weak.

Then say in the report what the stanzas agree on and what stays open (slides, sixteenths the eighth grid cannot write).

**When the user hears another note than the sheet has**, look at every voice, not only the tracked melody: a CQT
(librosa, 36 bins per octave, averaged per half beat from `beats.npy`) of the vocals stem, of `other.wav` and of
`source.wav` at that spot, in each repeat. It shows whether a second voice sings the note, whether it is the
accompaniment's (a guitar holding the third above the voice), or whether the pitch tracker dropped it. Say what the
recording shows either way, and leave the choice to the user's ear.

A clue that is a one-off (a word misheard, a section limit, one note's pitch or start: the section's `fix`) goes into
`sheet.json`. Last-mile corrections the rules
cannot reach are best made by the user in MuseScore on `sheet.musicxml`.

## Traps

- music21 caches parsed files: `show.py` parses with `forceSource=True`, or it may show an older sheet.
- `pkill -f yt-dlp` kills your own shell if its command line contains "yt-dlp": use `pkill -f "[y]t-dlp"`.
- Whisper calls `ffmpeg` by name: `lyrics.py` links imageio-ffmpeg's binary into the venv's `bin/`.
- python-ly's MusicXML export loses the lyric text and turns chord names into a second part: `make_sheet.py` exports the
  melody alone and puts the words and chord symbols back with music21. Keep it that way.
- Basic Pitch was tried first (polyphonic, noisy on a choir); CREPE replaced it. Basic Pitch needs TensorFlow or the
  ONNX model and `--no-deps` installs; not in the requirements any more.
- YouTube auto-captions often do not exist for music; Whisper on the vocals stem is the way to the words.
- A sheet transcribed from someone's recording is a derivative of their arrangement: ask the user before anything goes
  into the app.
