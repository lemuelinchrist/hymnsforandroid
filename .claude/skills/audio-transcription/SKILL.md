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
- Work folder per song: `temp/transcribe/<song>/` (`temp/` is not tracked; the audio and stems are someone else's
  recording and must never be committed). `temp/transcribe/christ_is_everything/` is the first song done.

## Steps

```sh
V=/home/lemue/venvs/transcribe/bin; T=tools/audio-transcribe; D=temp/transcribe/<song>
$V/python $T/prepare.py $D --url "https://www.youtube.com/watch?v=<id>"     # or --audio file.mp3
$V/python $T/crepe_melody.py $D
$V/python $T/lyrics.py $D                    # then read $D/lyrics.txt: the structure of the song
$V/python $T/new_sheet_config.py $D --title "<title>"
#   edit $D/sheet.json: sections (one pass of each part; "repeat": 2 for a part sung twice), misheard words
$V/python $T/align_words.py $D
$V/python $T/make_sheet.py $D                # sheet.pdf / .png / .musicxml / .midi
$V/python $T/show.py $D                      # bar by bar, to review
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
- **Raw data** for one spot: notes of the melody MIDI, `pitch.npz` (time, f0, confidence every 10 ms), `beats.npy`,
  `syllables.json`. A short Python look at 2-3 seconds around the bar usually shows the cause.

## Using the user's clues

The user listens and gives clues like "the first two notes are eighths but it is one quarter: 'Christ' is the G quarter,
'is' the C quarter". Do not only patch that note: find **why** the pipeline got it wrong in the raw data, fix the rule
in the script, re-run, and check the other places the rule touches (repeats must still agree). Examples so far:
- Two eighths for one quarter → CREPE's pitch wobbled a semitone for 50 ms inside the note and the note cutter split it.
  Fixed: smooth the pitch, join parts under 70 ms, start a same-pitch note only at a break in the voice.
- Words on the wrong notes → Whisper's word times drift. Fixed: forced alignment (MMS_FA) per syllable.
- G♭/E♮ in a C minor line → slides into the next note. Fixed: `scale` in sheet.json.
- Octave flips → brothers and sisters. Fixed: octave chosen per note for a smooth line inside `range`.
A clue that is a one-off (a word misheard, a section limit) goes into `sheet.json`. Last-mile corrections the rules
cannot reach are best made by the user in MuseScore on `sheet.musicxml`.

## Traps

- `pkill -f yt-dlp` kills your own shell if its command line contains "yt-dlp": use `pkill -f "[y]t-dlp"`.
- Whisper calls `ffmpeg` by name: `lyrics.py` links imageio-ffmpeg's binary into the venv's `bin/`.
- python-ly's MusicXML export loses the lyric text and turns chord names into a second part: `make_sheet.py` exports the
  melody alone and puts the words and chord symbols back with music21. Keep it that way.
- Basic Pitch was tried first (polyphonic, noisy on a choir); CREPE replaced it. Basic Pitch needs TensorFlow or the
  ONNX model and `--no-deps` installs; not in the requirements any more.
- YouTube auto-captions often do not exist for music; Whisper on the vocals stem is the way to the words.
- A sheet transcribed from someone's recording is a derivative of their arrangement: ask the user before anything goes
  into the app.
