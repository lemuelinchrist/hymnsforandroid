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
| `beats_per_bar`, `bar_offset` | 4 and 1 for 4/4 with bars starting on beat 1 of the tracked beats; change `bar_offset` when the barlines fall half a bar off |
| `scale` | pitch classes allowed (0 = C); a note outside moves to the nearest one (sliding singers). Minor keys keep the leading tone |
| `range` | MIDI range of the written melody (58-77 = B♭3-F5): every note's octave is chosen inside it, the line moving smoothly |
| `words` | fixes for misheard words, `{"history production": "His reproduction"}` |
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
  Syllables come from pyphen. The syllable-to-note match is a dynamic programme over the whole section.
- **Octave and key.** A choir sings the melody in two octaves; the sheet writes one. Out-of-key notes are almost always
  slides.
- **Chords** are a simple chroma-template guess (major, minor, dominant 7) per half bar: a slash chord or a passing
  chord comes out as a neighbouring triad ("Bm" for Cm over B).

## Known limits

- Rhythm is snapped to eighths: dotted rhythms and triplets need checking.
- Where voices overlap (call and answer, a descant) the line can jump between voices.
- A short instrumental part with no singing gives no notes; leave it out of the sections.
