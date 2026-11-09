# Audio transcription: a lead sheet from a recording

Turns a recording of a song (a YouTube video or an audio file) into a draft lead sheet: melody, words under the notes,
chord symbols. It is meant for songs we have no sheet music for (for example a recording on a channel whose song is not
in the hymnal yet). The result is a **draft to check by ear**: on the first song tried (NYCYPCD, "Christ Is Everything for
God's Building", a choir with brothers and sisters and a band) it was about 90-95 % right before corrections.

Every step runs on the GPU (an RTX 5080 here; PyTorch needs CUDA 12.8 or newer for it) and takes seconds per song.

## Setup (once)

```sh
python3 -m venv /home/lemue/venvs/transcribe          # outside the repo
V=/home/lemue/venvs/transcribe/bin
$V/pip install torch torchaudio --index-url https://download.pytorch.org/whl/cu128
$V/pip install -r tools/audio-transcribe/requirements.txt
```

LilyPond (`/usr/bin/lilypond`) engraves the sheet. The models download on first use (Demucs, CREPE, Whisper turbo
1.5 GB, MMS_FA 1.2 GB) into the user's cache.

## Steps

A song gets its own work folder outside git, e.g. `temp/transcribe/<song>/` (the audio is someone else's recording:
never commit it). `D` below is that folder.

| # | Script | What it does | Writes |
|---|---|---|---|
| 1 | `prepare.py D --url <youtube url>` (or `--audio <file>`) | downloads, converts, separates the stems (Demucs `htdemucs`), tracks the beat | `source.wav`, `stems/htdemucs/source/*.wav`, `beats.npy` |
| 2 | `crepe_melody.py D` | melody of the vocals stem with CREPE: a pitch every 10 ms, cut into notes | `midi/melody_crepe.mid`, `pitch.npz` |
| 3 | `lyrics.py D` | the sung words with Whisper (turbo) | `lyrics.json`, `lyrics.txt` |
| 4 | `new_sheet_config.py D --title "..."` | key (music21 key finder), sections from the pauses | `sheet.json` (edit it) |
| 5 | `align_words.py D` | forced alignment (torchaudio MMS_FA) of the words, a time per syllable | `syllables.json` |
| 6 | `make_sheet.py D` | the lead sheet | `sheet.pdf`, `sheet.png`, `sheet.ly`, `sheet.musicxml`, `sheet.midi` |

Checking: `show.py D [first bar] [last bar]` prints the sheet bar by bar (note, length in eighths, syllable, chord);
`check_by_ear.py D melody_crepe` writes a stereo file with the vocals left and the melody as a plain tone right;
`roll.py D <from s> <to s> melody_crepe` draws a piano roll (`roll.png`).

## sheet.json

| Key | Meaning |
|---|---|
| `title` | title on the sheet |
| `midi` | the melody to use (`melody_crepe`) |
| `key`, `mode` | LilyPond key, e.g. `"c"`, `"minor"`; `"ees"`, `"major"` |
| `beats_per_bar`, `bar_offset` | 4 for 4/4; `bar_offset` `"auto"` (see below; it prints its choice) or the tracked beat the bars start on (0-3), to overrule it |
| `chord_weights` | overrides the chord evidence weights: `acc`, `bass`, `melody`, `key`, `change`, `change_mid_bar` (see `make_sheet.py`) |
| `scale` | pitch classes allowed (0 = C); a note outside moves to the nearest one (sliding singers). Minor keys keep the leading tone |
| `range` | MIDI range of the written melody (58-77 = B♭3-F5): every note's octave is chosen inside it, the line moving smoothly |
| `words` | fixes for misheard words, `{"history production": "His reproduction"}` |
| `lines` | the known words in place of Whisper's, one line each with its start: `[{"start": 54.7, "text": "Come with me from Lebanon, my bride"}, ...]` (`"end"` on the last line); the start of each from `lyrics.txt` |
| `notes` | `"syllables"` (default with `syllables.json`): one note per syllable, see below; `"pitch"`: the older way |
| `melisma_s` | how long (s) the voice must hold a second pitch inside one syllable to write it as a second note (0.25) |
| `hyphens` | syllables pyphen gets wrong, `{"Lebanon": "Leb-a-non"}` (it leaves many names whole; a possessive `s'` is always kept on the last syllable) |
| `sections` | `[{"mark": "A", "t0": 17.0, "t1": 34.5, "repeat": 2}, ...]`, seconds of the recording; keep one pass of a part sung twice and mark it `repeat` |

## How it works, and why

- **Stems first.** The vocals stem (Demucs) is clean enough for a pitch tracker; the full mix is not.
- **CREPE, not Basic Pitch, for the melody.** Basic Pitch (polyphonic) on the vocals gave many notes from the other
  voices and the reverb; CREPE follows the strongest voice and gave a clean line with all the notes.
- **A note ends where the voice breaks.** A pitch wobble (vibrato, a scoop) inside a sung note is smoothed (median over
  90 ms, parts under 70 ms join their neighbour); a repeated note on the same pitch is recognised by the short break of
  the consonant between them. Cutting at every wobble wrote one quarter note as two eighths.
- **Forced alignment for the words.** Whisper finds the words but its word times drift by up to half a second; MMS_FA
  places the known words in the audio letter by letter, so each syllable has a time within about 0.1 s of its note.
  Syllables come from pyphen. When the words are known (a hymn in the database), give them as `lines`: Whisper's
  guesses then only matter for where the lines start.
- **One note per syllable.** A hymn sings almost every syllable on one note, so the notes are made from the syllables
  (`"notes": "syllables"`, the default once `syllables.json` exists): a syllable's pitch is the semitone its voice holds
  longest between its start and the next syllable, so the scoop into it and the slide out of it do not count; it gets a
  second or third note only where the voice settles on another semitone for `melisma_s` (0.25 s) or more. Cutting the
  pitch line into notes first (`"notes": "pitch"`, the older way, then matched to the syllables by a dynamic programme)
  wrote passing slides and other voices as notes of their own: on "Come with Me from Lebanon" 82 notes for 59
  syllables, against 65 this way.
- **Tuning.** An old recording or a choir that sank can sit between two semitones (that one was 28 cents flat), and
  rounding then flips between them (F♯ and G for one sung note). `crepe_melody.py` measures the offset on the sure
  frames and takes it out (it prints it; near 0 for a recording in tune).
- **Octave and key.** A choir sings the melody in two octaves; the sheet writes one. Out-of-key notes are almost always
  slides.
- **Where the bars start.** The beat tracker finds beats, not beat 1. `"bar_offset": "auto"` takes the half-bar grid
  on which the accompaniment's chords are clearest (the harmony changes on the bar line or the half bar), then of its
  two offsets the one with more held syllables on beat 1. One beat off, chords straddle the changes and come out flat
  ("Come with Me from Lebanon": offset 1 gave G for eight bars, offset 0 the progression); on "Christ Is Everything"
  it finds the offset 1 checked by ear.
- **Chords**, one per half bar, weigh four kinds of evidence: the accompaniment's chroma against major, minor and
  dominant-7 templates; the bass (the bass stem, or the accompaniment's low register when there is no bass player: a
  silent stem scaled to its own maximum is only noise); the sung melody (chord tones on the beat count double); and the
  key (the key's own chords, then the secondary dominants; others need clear evidence). A Viterbi pass charges for
  each change, more inside a bar. `CHORD_DEBUG=1 make_sheet.py D` prints the best three per half bar to calibrate.
  The key and melody made the old "Bm" for Cm over B into G7. A slash chord still comes out as its triad.

## Known limits

- Rhythm is snapped to eighths: dotted rhythms and triplets need checking.
- Where voices overlap (call and answer, a descant) the line can jump between voices.
- A short instrumental part with no singing gives no notes; leave it out of the sections.
