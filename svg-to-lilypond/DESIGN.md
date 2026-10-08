# SVG → LilyPond Converter: Technical Design & Report

Living document. Records **what we've learned** about the hymnal.net lead-sheet SVGs and **how the
converter is designed**. Update it whenever something new is learned, so nothing gets lost between sessions.

- Started: 2026-10-02
- Last updated: 2026-10-05 (end of session 2)
- Status: **converter working for piano and guitar sheets** (§18). 96.8% of piano and 96.5% of guitar sheets
  convert and verify (§18 results). Everything is committed and pushed (latest: `64db0472`); generated
  output lives in the git-ignored `build/` folder.

---

## 1. Goal

Turn every sheet-music SVG shipped in the app (`app/src/main/assets/pianoSvg/*.svg`, `guitarSvg/*.svg`)
into a **LilyPond source file (`.ly`)**. Requirements:

1. **No musical data is lost.** This covers notes, rhythm, chords, lyrics (all verses), and repeats and
   endings. It also covers marks and texts, title and subtitle, the hymn number and the copyright footer.
2. **Re-rendering the `.ly` gives a page visually equivalent to the original.** The target is not
   byte-identical; see §8.
3. **Machine-readable.** Other formats (MusicXML, ABC, MIDI) can be derived from the same intermediate
   model.
4. **Repeatable for future files.** New SVGs keep arriving from hymnal.net syncs, so conversion must be a
   deterministic script, wrapped in a Claude skill (§12). It must not depend on case-by-case judgement.

Non-goal: OCR or vision models. `music-transcriber/` tried that and was unreliable. These SVGs are vector
output with exact coordinates, so no recognition guesswork is needed.

---

## 2. Key facts about the source SVGs

| Fact | Detail |
|---|---|
| Generator | **LilyPond**, several versions over the years. There's no version stamp in the files. |
| Page | Always US Letter, `viewBox 0 0 153.5737 198.7425`, one page (`<!-- Page: 1/1 -->` when present). |
| Units | 1 SVG user unit = **1 staff space**. Staff lines are exactly 1.0 apart, and y grows downward. Staff size is 16 pt (1 unit ≈ 1.406 mm). |
| Two formats | **old**: 5,590 files. Each element has its own `transform="translate(..)"` and fonts are named `Century Schoolbook L`. **new**: 826 files, all E/NS. Elements are wrapped in `<g transform>`, there's a `<style>` block, and fonts are named `serif`. The new format is what LilyPond 2.24 writes. |
| Music glyphs | Drawn as `<path>` **outlines** with `scale(0.0040,-0.0040)`, i.e. Emmentaler font units. Reduced-size glyphs use 0.0032 (accidentals inside chord names) and 0.0025 (volta numbers). |
| Other shapes | Staff lines are `<line>`. Stems, bar lines, ledger lines and lyric hyphens are `<rect>`. Beams are `<polygon>`. Slurs and ties are `<path>` without scale, in absolute coordinates. Volta brackets are `<line>`. |
| Text | Real `<text>`/`<tspan>` elements, so they can be read directly. Each **font size identifies a role** (table in §4.4). |

### Corpus inventory (2026-10-03)

| | piano | guitar |
|---|---|---|
| files | 3,191 | 3,259 |
| **broken: HTML "Error" pages saved as .svg** | 17 | 17 |
| parseable | 3,174 | 3,242 |
| **after cleanup (2026-10-04, §11)** | **3,179** | **3,179** |

- **Broken assets (the app ships these as sheet music):** BF413, NS196, NS215, NS236, NS260, NS274,
  NS335, NS342, NS346, NS347, NS349, NS389, NS10061, NS10064, NS10068, NS10072, NS10073. The same set
  is broken in both folders.
- **72 guitar files have no piano counterpart.** The causes:
  - Duplicate downloads such as `E555 (1).svg`.
  - Case mismatch: `pianoSvg/e20.svg` vs `guitarSvg/E20.svg`. Android asset lookup is case-sensitive,
    so `e20/e191/e1024.svg` are probably unreachable from the app.
  - Some genuinely guitar-only files.
- **Piano and guitar give the same melody** in 3,163 of 3,170 pairs (same counts of noteheads, flags,
  rests, dots and naturals). 7 pairs differ and need a closer look: E505, E839, E870, E909, NS170,
  NS371, NS522.
- By hymn group (piano): E 1,359 · NS 1,241 · CS 291 · C 124 · BF 99 · CH 74 · (lowercase e 3). Every
  other language has no SVGs of its own and inherits from its English parent at runtime.

---

## 3. Glyph catalog

There are only **184 distinct glyph outlines** across all 6,416 parseable files. Glyphs are identified by
`md5(whitespace-normalized d)[:8]`.

**Gotcha:** raw files contain newlines inside `d="…"`. XML parsing turns them into spaces, so you must
normalize whitespace before hashing, or the same glyph gets two ids.

Names were assigned automatically (`tools/glyph_names.py`):
1. Rasterize each outline and every glyph of LilyPond 2.24.3's own `emmentaler-20.otf`.
2. Match them by bitmap IoU × bbox-size similarity × origin offset.
3. Restrict candidates to glyphs plausible on a lead sheet. Without this, chant and shape-note glyphs
   win false matches.

Result:
- **All 184 matched.** The lowest score is 0.50, and every match is well clear of the runner-up (≤0.12
  for the weakest case).
- Every name was **visually verified** on a labelled contact sheet (`build/glyph_named.png`, rebuild with
  the commands in §16).
- Output: `data/glyph_names.json`.

What the corpus contains (useful bounds for the recognizer):

| Class | Glyphs present | Notes |
|---|---|---|
| Clefs | `clefs.G` only | **No bass or C clefs anywhere.** Every sheet is one treble staff. |
| Noteheads | `s0` whole, `s1` half, `s2` black, `s2cross` (1 file: NS812, spoken notes) | |
| Flags | `u3/d3` (8th), `u4/d4` (16th) | No 32nds. |
| Rests | `rests.0, 1, 2, 3, 4` (whole … 16th), `M2` | |
| Accidentals | flat, sharp, natural, doublesharp (3 files) | Scale 0.0040 = on the staff; **0.0032 = inside a chord name**. |
| Dots | `dots.dot` | Duration dots *and* repeat-sign dots. |
| Time signatures | `timesig.C44` (C), `timesig.C22` (¢), digits | Digits at 0.0040 = time signature; **digits at 0.0025 = volta numbers**. |
| Scripts | `ufermata` (421 piano files), `segno` (4 files) | No coda. |
| Misc | small `period` and `hyphen` | Parts of volta labels such as "1.–2.". |

**Monophony:** stacked noteheads (two heads at the same x) occur in exactly **one** file (a guitar file).
So the melody is a single voice everywhere: no chords and no second voice on the staff. That makes the
recognizer much simpler.

---

## 4. Recognition rules (SVG primitives → music)

All coordinates are absolute, after composing nested transforms (`tools/svgscan.py`).

### 4.1 Layout skeleton
- **Staves:** groups of 5 `<line>`s with 1.0 spacing and length > 20 (`svgscan.staves()`). One staff
  per system.
- **Bar lines:** `rect` with h = 4.0 spanning the staff.
  - w ≈ 0.22: normal bar line
  - w ≈ 0.7: thick (final or repeat)
  - two thin ones close together: double bar
  - `dots.dot` at staff positions ±0.5 around the middle line beside a thick bar: repeat sign, open
    or close depending on which side the dots are
- **Measures** are the spans between bar lines. Bar-number texts (size 1.75, at system start) confirm
  the numbering.

### 4.2 Notes
- **Pitch:** a notehead's y relative to the staff gives the step: `(bottom_line_y − y)/0.5` steps above
  E4 (treble clef only). Then apply, in order:
  1. the key signature (accidentals between the clef and the time signature at system start)
  2. explicit accidentals earlier in the same measure
  3. ties carrying an accidental across a bar line
- **Duration:**
  - The head shape gives whole, half or filled.
  - A filled head with no flag or beam is a quarter.
  - Each flag or beam crossing the stem halves the value: count `flags.*3/4`, or count beam polygons
    intersecting the stem rect at its far end.
  - `dots.dot` right of the head, on the same staff line or space, makes it dotted.
- **Stems:** `rect` w ≈ 0.15–0.17, h ≈ 2.7–3.8, touching the notehead's left edge (stem down) or right
  edge (stem up).
- **Ledger lines:** `rect` ≈ 1.95 × 0.2 inside or adjacent to the staff area (*inferred from NS948; confirm in the
  recognizer*). Use them only for
  plausibility checks; pitch already comes from y.
- **Rests:** glyph type gives the value, plus a dot if present.
- **Ties vs slurs:** both are absolute `<path>` curves.
  - Tie: endpoints at two consecutive noteheads of the same pitch.
  - Slur: any other pair. The slur also defines a lyric melisma.
- **Tuplets:** an italic "3" (size 1.75 italic) above or below a group, with or without a bracket
  (`<line>`s). Scale the enclosed durations by 2/3.
- **Grace notes:** not seen yet. Small noteheads would show a different scale; watch for this.

### 4.3 Marks
- **Voltas:** small digits, periods and hyphens at scale 0.0025 ("1.", "1.–2.", "3.") with a bracket
  made of `<line>`s (w ≈ 0.205) above the staff. Record the start/end measure and label.
- **Rehearsal / section marks:** boxed bold text such as "Chorus", "Bridge" or "副". The box is 4
  thin lines or rects around the text.
- **Navigation:** `segno` glyph, plus italic or plain texts "Fine" and "D.S. al Fine". Keep them
  verbatim, duplicates included: CH39 really prints "D.S. al Fine" twice.
- **Fermata:** `scripts.ufermata` above a note or rest.

### 4.4 Text roles (by font size, in staff units)

| size | family | role |
|---|---|---|
| 3.11 bold | serif | title |
| 2.20 bold | serif | subtitle (category). Also verse numbers "2." etc. in the verse block. |
| 5.87 | serif | hymn number, top right (e.g. "1", or "Cs308" in CS files) |
| 2.47 | serif | **lyrics** under the staff, plus stanza labels "1." (bold) and "(C)" |
| 2.20 | serif | verse text block below the music, and texts such as "(Look away!)" |
| 1.96 | sans-serif | **chord names**. Accidentals in them are glyphs at scale 0.0032. |
| 1.39 | sans-serif | chord **superscripts** ("7", "sus4", "m7"…), raised |
| 1.75 | serif | bar numbers; italic = tuplet numbers and instructions |
| italic, various | serif | instructions ("(Guitar: Capo 1)", "(Repeat)", "Chorus Parts 1 and 2 can be sung together.") |
| 2.20 | Trebuchet MS | footer "www.hymnal.net" plus optional copyright ("©2022 Melody of Lilies. Used by Permission.") |

### 4.5 Chord names
- Cluster sans-serif texts, chord-scale accidental glyphs and superscripts by x into one symbol
  (E1 example: `'B' + flat glyph + '7'` → B♭7).
- Attach each chord to the note or rest column at the same x (chord names are left-aligned to the note
  column).
- Parse into chordmode, e.g. `Fm7/A♭` → `f:m7/aes` and `B♭sus4` → `bes:sus4`.
- Unknown spellings must be kept verbatim. Don't guess. In the worst case, emit them as `\markup`.

### 4.6 Lyrics
- **Lines:** lyric texts (size 2.47) under a staff, clustered by y offset from the staff. Each distinct
  y is one lyric line (verse). There are **up to 3 lines per system** (54 NS and 0 E files have ≥2).
- **Syllable → note:** LilyPond centres each syllable on its notehead, so assign each syllable to the
  nearest note by x centre.
  - Notes with no syllable are melisma continuations (under a slur or extender) or `\skip`s.
- **Hyphens** are `rect` 0.66 × 0.2 between syllables, giving `--` (*inferred: E1 has exactly 6 such rects and 6
  hyphens; confirm in the recognizer*). **Extenders** are longer thin
  rects, giving `__`.
- **Stanza labels** ("1.", "2.", "(C)") sit left of the first syllable, at system start or mid-song
  (NS812 has "3." at bar 26).
- **Verse blocks** below the music are columns of size-2.2 text with bold numbers. Keep the line breaks.

---

## 5. Hard cases

`tools/features.py` → `data/features.csv` and `data/difficulty_ranking.json`. Every file gets a
difficulty score from weighted feature flags.

Mean difficulty by group: **NS 1.65** · CS 0.99 · CH 0.92 · C 0.46 · E 0.43 · BF 0.28.

| Feature (piano files) | NS (1,225) | E (1,359) | all |
|---|---|---|---|
| time-signature changes | 17 | 23 | — |
| voltas (small digits) | 63 | 0 | 74 |
| 16th notes | 28 | 23 | 61 |
| ≥2 lyric lines under the staff | 54 | 0 | — |
| repeats (≥3 thick bar lines) | 33 | 0 | — |
| segno | 3 | 0 | 4 |
| naturals | 69 | 262 | 404 |
| italic instructions | 187 | 45 | 270 |
| fermatas | | | 421 |
| double sharps | | | 3 |
| cross noteheads | | | 1 (NS812) |

Reference test set, reviewed visually (renders in `build/hard/`):

| File | Why it's hard |
|---|---|
| **NS948** | Pickup bar, `|:` … `:|` repeat with "1.–2." and "3." endings, 3 verses under the staff, triplet, boxed "Chorus", "(C)" label, extra lyric "(Look away!)" under a final rest, copyright footer. New format. |
| **CS308** | Chinese lyrics, 1./2. endings, **4/4 → 2/4 → 4/4**, sus4 and slash chords, ties across bar lines, verse "3." starting mid-line, number shown as "Cs308". |
| **NS812** | **Cross noteheads** (spoken), boxed "Chorus"/"Bridge", repeat end with no matching start, lyric lines that differ only in places, verse 3 mid-song. |
| **CH39** | **Segno, "Fine", "D.S. al Fine" (printed twice)**, triplet over quarters, 4/4 → 2/4 → 4/4, fermatas, 16ths, accidental (♯G), double bar. |
| NS970, NS540, NS813, NS884, CS313, CS873 | Voltas, multiple lyric lines, instructions. |
| E1 | Baseline easy case. Hand transcription exists (`experiments/`). |

---

## 6. Architecture

```
SVG ──(A) svgscan.parse──▶ primitives ──(B) recognize──▶ IR (JSON) ──(C) emit──▶ .ly ──(D) lilypond──▶ SVG'
                                                            │                                        │
                                                            └──────────(E) verify ◀──────────────────┘
```

- **A. Parse** (`tools/svgscan.py`, done): absolute primitives (lines, rects, glyphs + gid, curves,
  polygons, texts). Handles both formats and rejects HTML impostors.
- **B. Recognize** (to build): applies §4 per system. Output is the **IR** (§7). It must be strict:
  - Any primitive left unexplained is an error, not something to ignore silently.
  - Every IR element keeps the source primitive indices. This allows debugging and lets us pin
    layout later.
- **C. Emit** (to build): IR → `.ly` from a template (§8). Pure function with no layout guessing.
- **D. Render:** `lilypond -dbackend=svg`, version pinned (2.24.3 today).
- **E. Verify** (§9): accept, reject, or "accept with warnings" per file, with a report.

**Language: Python 3** (already used here). Only the standard library plus `fontTools`, `numpy` and
`Pillow` (glyph naming only). The runtime converter needs only the stdlib and `data/glyph_names.json`.

---

## 7. Intermediate representation (IR)

One JSON per source SVG. It's the single machine-readable truth; `.ly`, MusicXML and ABC are all
derived from it. Draft:

```json
{
  "source": "pianoSvg/E1.svg", "variant": "piano", "format": "old",
  "header": {"title": "Glory be to God the Father", "subtitle": "Blessing of the Trinity—His Plan",
             "number": "1", "footer": "www.hymnal.net", "instructions": []},
  "global": {"clef": "treble", "key": {"tonic": "aes", "mode": "major", "accidentals": -4},
             "time": {"num": 4, "den": 4, "symbol": "C"}, "partial": null},
  "systems": [{"first_measure": 1, "measures": [1,2,3,4]}, {"first_measure": 5, "measures": [5,6,7,8]}],
  "measures": [
    {"n": 1, "time": null, "barline_end": "|",
     "events": [
       {"type": "note", "pitch": "ees'", "dur": "4", "dots": 0, "tie": false, "slur": null,
        "chord": "aes", "lyrics": [{"line": 0, "text": "Glo", "hyphen": true}], "src": [12, 40]},
       ...]}
  ],
  "repeats": [], "voltas": [], "marks": [],
  "lyric_lines": [{"stanza": "1.", "systems": [0, 1]}],
  "verses_block": [{"number": "2.", "lines": ["As we view the vast creation,", "..."]}],
  "layout": {"staff_tops": [22.967, 35.836], "title_y": 9.63, "verses_y": 52.84, "footer_y": 189.42}
}
```

---

## 8. LilyPond output template

These settings came from the hand-written E1 experiments (`experiments/E1_*_variant.ly`). Two
independent attempts (Opus and Sonnet sessions) reached the same conclusions:

- `#(set-global-staff-size 16)`, letter paper, `left-margin 12.7mm`, `line-width 194.3mm`,
  `indent 0`. Fonts: `#:roman "Century Schoolbook L" #:sans "sans-serif"`.
- **Font sizes match exactly:**
  - title `\fontsize #3 \bold` (3.1113)
  - subtitle bold at size 0 (2.1999)
  - number `\fontsize #8.5` (5.8739)
  - chord names `ChordName.font-size = -1` (1.9603)
  - lyrics at the default size (2.4695)
- **Vertical layout:**
  - Set explicit `markup-system-spacing`, `system-system-spacing` and `score-markup-spacing` with
    `basic-distance 0` and measured `padding`, plus `stretchability 0`.
  - Recompute these per file from the IR's `layout` positions, rather than hard-coding them.
  - Verse block: `baseline-skip 3` inside a verse and `13.5` between verses (E1).
  - Prefer this padding/baseline-skip approach over trial-and-error `\vspace`/`\raise`, which doesn't
    generalize. That was the Sonnet variant; it matched pixels better on E1 but was tuned by hand.
- **Line breaks:** one `\break` per original system, with `ragged-last = ##f`.
- **Footer:** `oddFooterMarkup` with `font-name "Trebuchet MS"`. Trebuchet isn't installed on this
  machine, so its width can't be checked here. Don't hand-tune footer offsets.
- Lyric melisma via slurs (automatic). **No `__` extender** unless the original has one.
- Verse lines must not carry trailing spaces. In the Opus variant they shifted the centred block by
  0.25 units.

**Fidelity reached on E1** (2.24.3 render vs the original):
- Title, subtitle, number, staves and lyrics are within 0.03 units, and font sizes are identical to 4
  digits.
- **Horizontal note spacing differs** (bar lines at 53.4 vs 52.0 …). This comes from LilyPond 2.24 and
  appears identically in both variants. The original old-format files came from an older LilyPond with
  different spacing defaults.
- Pixel diff (1600 px wide, fuzz 25%): 37k–70k differing pixels, against about 61k ink pixels in the
  original. This is dominated by the spacing shift.

**Decision proposed:** aim for **semantic fidelity**, enforced by verification (§9), plus visual
equivalence (same systems, line breaks and texts). Don't aim for pixel identity.
- Exact note x-positions *could* be pinned (e.g. `\override NoteColumn.X-offset` or explicit spacing
  from the IR), but that makes the `.ly` ugly and fragile.
- Revisit only if visual identity turns out to matter.
- Note: the **new-format files are LilyPond 2.24 output**. All 7 glyph outlines LilyPond 2.24.3 used
  in E1 also appear in the corpus, so those 826 files may round-trip much closer.

---

## 9. Verification (what "converted correctly" means)

| # | Check | Strength |
|---|---|---|
| V1 | **Measure arithmetic:** each measure's durations sum to its time signature. Allowed exceptions: pickup bar, and the final bar completing the pickup. | strong, internal |
| V2 | **Semantic round-trip:** render the `.ly` → parse with the same `svgscan` + recognizer → IR' must equal the IR. Same notes, durations, chords, lyrics, marks, systems. | strongest; font-independent |
| V3 | **Tune code:** `hymns.tune` in the DB is the melody's opening as **scale degrees** (E1 `5553216153222` = E♭ E♭ E♭ C B♭ A♭ F A♭ E♭ C B♭ B♭ B♭ in A♭). Convert the IR melody to degrees and compare prefixes. Verified on E1 only so far. | strong, independent source. 3,172 of 3,191 piano sheets have a tune code. |
| V4 | **MIDI:** `res/raw/m<tune>.mid` is 4-part harmony in one track. The melody is the top voice (highest note per onset), verified on E1. Compare the pitch sequence, allowing for repeats being unrolled. 3,024 piano sheets have a MIDI file. | advisory (MIDI may expand repeats or differ in arrangement) |
| V5 | DB `key` and `time` vs the IR | advisory. The DB has errors: CS308 is "F大調" vs 3 flats on the sheet. |
| V6 | Pixel diff and side-by-side contact sheet for human spot checks | advisory |
| V7 | Piano vs guitar IRs: identical except chords and capo text. Guitar chords = piano chords transposed by −capo semitones. | strong |

A file is **accepted** only if V1, V2 and V7 pass and V3 passes (or has no tune code). Everything else
goes into a review report with the reason.

---

## 10. Piano vs guitar

The two variants differ in **chord names** (transposed for capo), an italic "(Guitar: Capo N)" line,
and small typographic differences such as "Trinity — His Plan" with spaces.

- **Decided (2026-10-08, Lemuel): one source per hymn, the piano `.ly`.** The guitar sheet is derived from it by a
  conservative conversion step (§10.2). Guitar charts for E may be a little busier than hymnal.net's guitar sheets;
  that is accepted. This replaces the 2026-10-04 decision of two independent `.ly` files per hymn. Lemuel
  reviewed side-by-sides (E1, C103, NS160, NS576, E118) and found the derived chords *better* than hymnal.net's
  (E1 matches how he plays it): the fuller piano harmony is wanted, so the conversion is not made more aggressive.
  `ly/guitar/` was removed from the working tree the same day (history before this commit has it, e.g. for `--check`).

### 10.1 What the two variants share (measured 2026-10-08 on all 3,179 `ly/` pairs)

**Melody, rhythm and lyrics are the same.** Pitches and durations are identical in 3,158 pairs. 18 guitar sheets are
written in another key instead of using a capo (E13, E36, E39, E46, E56, E87, E112, E205, E222, E386, E474, E578,
E810, E905, E1020, E1163, E1290, E1311). 3 differ in one note (E8 tie vs slur, E630 and E902 an octave), most likely a
slip in one of the original sheets. Other textual differences are converter details (a `_` skip moved inside a
melisma, a markup attached one note later). The guitar sheet is **not** a simplified copy of the piano sheet; only
the chord line differs.

**Chords** (guitar compared with the piano chords moved down by the capo):

| Relation | Hymns |
|---|---|
| Exactly the transposed piano chords | 541 |
| Same, some chord changes left out | 32 |
| Same chords, simplified (slash bass or extension dropped) | 1,462 |
| A different, simpler harmony in places | 1,142 |

- After moving down by the capo, dropping the slash bass and merging repeated chords, 1,909 of 3,175 hymns (60%) have
  exactly the guitar sheet's chord changes, and 94.8% of all guitar chord symbols (77,767 of 82,004) are the same
  root and major/minor. The derived chart prints 9,810 chord changes that the guitar sheets leave out.
- The simplification is almost only in **E**: the guitar keeps every piano chord change in 98% of BF, 95% CH, 92% NS,
  86% CS, 77% C, but only **20% of E** hymns (75% of E chord changes). Example E118: piano "G/B D G" (moving bass under
  a held G), "Am/C", a short "C" at the end of bar 7, "D/F♯ G" (passing), "D/A A7" → guitar keeps G, Am, drops the C
  and the passing chords, "A7".
- **Rules for passing chords don't help.** Tested against the guitar sheets: drop chords of 1/8 or less; drop short
  chords on weak beats; drop a short chord between two identical chords; drop "X/5th → V". None agrees better than
  keeping every chord (88.5% of keep/drop decisions); each removes about as many chords the guitar keeps as it removes
  chords it leaves out. The guitar arrangers were not consistent. Only "1/8 or less" is nearly safe (383 right, 102
  wrong).
- **Capo follows from the piano key** (most common choice per key = the guitar sheet's in 3,102 of 3,179):

| Piano key | F | D | E♭ | C | G | B♭ | A♭ | A | E | D♭ | B |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Hymns | 811 | 441 | 433 | 429 | 396 | 244 | 223 | 84 | 68 | 37 | 12 |
| Capo | 3 | 0 | 1 | 0 | 0 | 3 | 1 | 0 | 2 | 1 | 4 |

  Minor keys: not seen in the corpus as `\key … \minor` so far; if one appears, use the capo of its relative major.
- **Capo text:** C and CS sheets carry "(吉他: Capo N)" / "(吉他)" as a markup on the first note (413 files); all other
  groups carry "(Guitar: Capo N)" / "(Guitar)" as a line under the title (2,762 files; E1 is one of the 2 E files
  with the markup form). Capo 0 prints "(Guitar)" / "(吉他)".

### 10.2 Guitar conversion (piano `.ly` → guitar `.ly`)

Only steps that cannot drop a chord the guitar sheets keep:
1. Capo from the key table above.
2. Chords moved down by the capo **by interval**, so spelling stays right (capo 1 = minor second down, 2 = major
   second, 3 = minor third, 4 = major third). Melody and key unchanged.
3. Slash basses removed (G/B → G).
4. Repeated chords merged: a chord equal to the one sounding is replaced by a spacer (`s`) of the same length.
5. Capo text added as on the existing guitar sheets (§10.1).

6. A chord at the **start of a system** is always printed, even when it repeats the one sounding (the original sheets
   do this too).
7. **Page fit:** if the extra capo line pushes a sheet onto a second page, it is derived again with the gap above the
   verse block (`score-markup-spacing`) 2.5 staff spaces smaller, as hymnal.net's own guitar sheets do (NS576: 12.00
   on their guitar sheet vs 14.35 on the piano sheet).

Not done (for now): weak-beat and passing-chord rules, dropping 7ths and other extensions. Optional, off by default:
drop chords of 1/8 or less (`--drop-short`).

Tool: `tools/guitar_from_piano.py` (`--all` derive into `build/guitar_derived/`, `--compile` render with the page-fit
fallback into `build/guitar_derived_svg/`, `--check` compare with `ly/guitar/`, which is no longer in the tree: restore it with `git checkout 1fcdba84 -- ly/guitar`).

**First full run (2026-10-08, local, LilyPond 2.24.3, 12 processes, ~40 min):**
- All 3,179 derived sheets compile; 3,174 on one page as derived, 5 needed the page-fit fallback (NS10025, NS1058,
  NS1124, NS576, NS746), then one page. LilyPond warnings are the same as for the piano `.ly` (checked file by file on
  the 27 sheets that have any).
- Capo: 0 → 1,350, 1 → 693, 2 → 68, 3 → 1,055, 4 → 13. Same capo as the hymnal.net guitar sheet: 3,105 of 3,179.
  The 74 others (listed by `--check`) are mostly guitar sheets without a capo in a key the table puts a capo on (e.g.
  NS1126 B♭ without capo), the 18 sheets written in another key, and hymns with a key change.
- Chords, for the 3,105 with the same capo: 1,822 have exactly the guitar sheet's chord changes; 163 have them plus
  extra changes; 1,120 differ in some chords (the "different, simpler harmony" class of §10.1). 95.2% of the guitar
  sheets' chord symbols are reproduced (76,454 of 80,334, root + major/minor); 9,901 extra chord changes are printed.
- **hymnal.net error found:** NS160's guitar sheet says capo 4 but prints D♯-major chords (would sound 3 semitones too
  high). The derived sheet has D-major chords with capo 4, which is right.
- Looked at by eye: E118 (extra chords exactly the expected ones: bar 2 "D G", bar 7 "C", bar 15 "G D", bar 24 "G"),
  E5, C1002 (capo marker identical to the original), NS576 (tight fallback; looks fine).

## 11. Asset problems found, and fixed 2026-10-04

Committed and pushed as `1e727e1e` (2026-10-04): 92 deleted, 24 replaced, 4 renamed. See
`git show --stat 1e727e1e`. Afterwards there are 3,179 piano + 3,179 guitar files:
every hymn has both, none are HTML, and there are no odd names. All pairs agree note-for-note.

| Problem | Finding | Fix |
|---|---|---|
| **HTML error pages saved as `.svg`** (17 hymns × 2) | The app's existence check (`Hymn.java:324`) passes, so it opened an error page as sheet music. Checked each hymn on hymnal.net (`tools/asset_audit.py`). | **Re-downloaded 5:** NS236, NS335, NS342, NS347, NS349. Identity verified: SVG lyrics = our DB first line. **Deleted 12** (BF413, NS196, NS215, NS260, NS274, NS346, NS389, NS10061/64/68/72/73): hymnal.net has no sheet music for them. In the app the sheet button stays visible; tapping it shows the toast "Sorry! sheet music not available" (previously it opened an error page). |
| **Lowercase file names** `pianoSvg/e20, e191, e1024`, `guitarSvg/e646` | The app's lookup is an exact, case-sensitive `equals(hymnId+".svg")`, so these sheets never showed. Content matched hymnal.net. | Renamed to `E…` with a two-step `git mv`. Needed because `/mnt/c` is case-insensitive and git has `core.ignorecase`. |
| **68 `guitarSvg/* (1).svg` duplicates** | Never loaded by the app. 3 identical to the base file. 60 an older/alternative version (hymnal.net now serves the base version). 5 match neither, because hymnal.net changed again: E756, E909, NS1, NS123, NS188. | Deleted all 68. No change in app behavior. |
| **7 piano/guitar pairs with different melodies** (E505, E839, E870, E909, NS170, NS371, NS522) | One side was stale. | Replaced both files with hymnal.net's current version (identity verified). |

**Verified on the emulator (2026-10-04, Pixel 9 Pro XL, debug build v5.4.6):**
- NS236 (restored) renders its sheet.
- NS196 (deleted) shows the "not available" toast.
- E20 (renamed) now opens its sheet.
- Not individually tested: the other restored hymns, the guitar variant, and the 7 refreshed pairs.

Still open (not fixed):
1. **NS389 identity mismatch:** hymnal.net's `ns/389` is now "For we by the Spirit (Gal. 5:5-6)",
   but our DB NS389 is "The Lord is my greatest love". The NS numbering has drifted for at least this
   hymn. Belongs to the New Songs sync work (see the `hymn-provisioning` skill).
2. **Stale sheets in general:** E756, E909, NS1, NS123 and NS188 differ from hymnal.net today (E909 is
   now refreshed). There are probably more across the corpus. A full refresh audit would mean
   downloading all ~6,400 files; not done.
3. **Dead `sheet_music_link`s** in the DB for the 12 deleted hymns. The "open on hymnal.net" share
   action will 404.
4. **Scrambled text from hymnal.net "new tune" pages:** `nt/` page titles come back word-scrambled
   ("the We're Hebrews our is name river-crossers"). BF413's `first_stanza_line` in our DB is scrambled
   the same way. Other BF hymns may be affected; worth checking.
5. **New-format SVGs use the generic `font-family="serif"`.** Renderers substitute a wider font, so
   lyric syllables overlap ("Lord,write Your", "inscribeon"). **Confirmed in the Android WebView** on
   NS236 (2026-10-04), so this is a real app defect for the 826 new-format files.
   Regenerating from `.ly` (§15) would fix it.
7. **DB key error seen in the app:** NS236's info card says "C Major" while its sheet is in A major
   (3 sharps). Same class of error as CS308 (V5, §9). Don't trust the DB `key` column.
6. **A third SVG flavour exists:** hymnal.net's *current* downloads use `font-family="sans"` for chord
   names (ours use `sans-serif`). The recognizer must accept both.

---

## 12. Claude skill for future files (planned)

New SVGs arrive via the hymnal.net sync (`HymnalNetExtractor` → `databaseProvisioner/data/{pianoSvg,guitarSvg}/`
→ copied into `app/src/main/assets/`). The skill makes converting them a single step.

- **Location:** `.claude/skills/svg-to-lilypond/SKILL.md`, alongside the existing `hymn-provisioning`
  skill.
- **Trigger:** "convert new sheet music", "make .ly for NS1162", or after a New Songs sync.
- **Steps** (the skill only orchestrates; all logic lives in `tools/`):
  1. `python3 svg-to-lilypond/tools/convert.py <svg files or hymn ids>`. Runs A→E and writes
     `.ly` + IR + a verification report.
  2. Read the report. For each failure, show the user the original and re-rendered side by side
     (render via `rsvg-convert`) and explain the failing check.
  3. Never hand-edit generated `.ly` silently. Fixes go into the recognizer, plus a regression test
     with that SVG.
  4. Pre-checks: reject HTML impostors, warn about missing piano/guitar partners, run the glyph
     catalog. **An unknown glyph id means a new LilyPond version or new notation.** Re-run
     `glyph_names.py` and update §3.
- **Regression suite:** the reference test set (§5) plus every file that ever failed. The full corpus
  is run as a slow "everything still converts" job.

---

## 13. Decisions (user, 2026-10-04)

1. **Outputs are build artifacts for now:** generated into `svg-to-lilypond/build/` (git-ignored),
   cheap to regenerate. They'll be committed later, once they're integrated into the app.
2. **Fidelity target confirmed:** semantic + visual equivalence with the same fixed layout (§8), not
   pixel identity. Screen-adaptive layout is a future goal (§15).
3. **Two independent `.ly` files** (piano, guitar) per hymn for now. A single source is a future goal.
   *Superseded 2026-10-08:* one source, the piano `.ly`; guitar derived (§10).
4. **Asset fixes: done** in this task (§11).
5. **End goal: the app ships sheet music rendered from `.ly`.** See §15.

---

## 14. Plan / milestones

1. **Recognizer v0** for the easy subset (E, BF): staves, bar lines, notes and durations, key/time,
   chords, a single lyric line, verse block. Target: V1 + V2 + V3 pass on ≥95% of E.
2. Lyrics: multiple lines, stanza labels, hyphens and extenders, mid-song verse labels.
3. Repeats, voltas, time changes, tuplets, fermatas, segno, Fine/D.S., marks, instructions. Hard set
   (§5) passes.
4. Guitar variant + V7. Full-corpus run, failure report, fix loop.
5. MusicXML/ABC export from IR (optional) and V4 MIDI check.
6. Write the skill (§12) and document in `AGENTS.md`.

---

## 15. Future goals (not in current scope; keep in mind when designing)

From the user, 2026-10-04. The current converter should not block these:
- **App renders from `.ly`:** the app ships sheet music generated from LilyPond sources rather than
  hymnal.net's SVGs. This also fixes font issues (§11.5).
- **Transposition:** let the user change key. LilyPond `\transpose` makes this trivial, *if* the IR/`.ly`
  keeps pitches and chords as real music (not text). Another reason chords must go through chordmode
  rather than `\markup` wherever possible (§4.5).
- **Screen-adaptive layout:** reflow to screen width instead of the fixed letter-page systems. So keep
  **line breaks in the layout section only** (one `\break` list), never mixed into the music, so they
  can be dropped.
- **Guitar "chords only" view:** hide melody notes for guitarists and show chords + lyrics. Keep chords,
  melody and lyrics as separate variables in the `.ly` (`harmonies`, `melody`, `verseN`).
- **Single source per hymn:** decided 2026-10-08: the piano `.ly` is the source, guitar is derived (§10).

### 15.1 App-readiness prototype (2026-10-05, media host; no app code touched)
Question: can the app ship sheets rendered from our `.ly`? Three things were checked on LilyPond 2.24.4.

**(a) Fonts / "serif" overlap in the WebView.** The app loads each sheet with
`webview.loadUrl("file:///android_asset/<folder>/<id>.svg")` (SheetMusicActivity), so the SVG itself must be
self-sufficient. LilyPond's SVG backend already converts *music* glyphs to paths, but lyrics, chords, titles are
`<text font-family=...>` and there is **no LilyPond option to outline them** (`lilypond -dhelp`: `svg-woff` only changes how
music glyphs are referenced, `music-strings-to-paths` only affects music-font strings; no PDF/Ghostscript SVG device on
this host either). Routes tried:
1. `rsvg-convert -f svg`: works (cairo outlines everything) but 37 KB -> 617 KB per sheet (every notehead as absolute
   path data). Rejected.
2. **`tools/svg_text_to_paths.py`** (new): replaces each `<text>` by `<use xlink:href>` references to glyph outlines
   from the real fonts (Century Schoolbook L -> URW C059, sans-serif/Trebuchet -> DejaVu Sans, CJK fallback ->
   Droid Sans Fallback), each glyph defined once per file in `<defs>`. Needs only fontTools. Tested on 20 sheets
   (12 piano, 8 guitar, incl. Chinese C439/CS308, the large NS123, E1242): 0 `<text>` left in every file, all render
   in rsvg; pixel difference from the text version is 0.3-1% of pixels (no kerning pairs are applied; sub-0.1 staff
   space drift on long words; visually identical side by side), Chinese sheets differ more only because the
   reference render used another CJK font. Runs in ~0.02 s per file.
3. Not tested (no emulator on this host): `@font-face` with the fonts shipped once as app assets and referenced from
   each SVG's `<style>`. Zero per-file cost, but a WebView loading `file:///android_asset` SVGs may refuse a font
   from another `file://` URL. Worth an emulator test before choosing; a `data:` URI font per file always works but
   costs about as much as route 2.
The fonts' licences allow embedding glyph outlines in documents (URW fonts: GPL/AGPL with font exception; DejaVu: free).
Caveat: nothing here was run in a real Android WebView; the claim "no installed fonts needed" rests on the files
containing no text at all.

**Emulator attempt (2026-10-05, media host): inconclusive, and why.** Installed in user space under
`/home/lemuel/android-sdk`: `emulator` 37.2.12 and `system-images;android-34;default;x86_64` (about 2.5 GB), AVD `hymns34`.
`/dev/kvm` exists but belongs to group `kvm` and user `lemuel` is not in it, so the emulator ran in pure software
(`-accel off`): ~7-25 min to boot, host load average 16 on 8 cores, repeated "System UI / system isn't responding"
dialogs, host-side graphics crash with `-gpu swiftshader_indirect`, and the sheet never rendered. Stopped to protect the
shared host. What did work: the debug APK builds from a detached worktree (`git worktree add --detach <dir> HEAD`,
copy `local.properties`), installs, and `SheetMusicActivity` starts directly with
`adb shell am start -n com.lemuelinchrist.android.hymns/.content.sheetmusic.SheetMusicActivity -e selectedHymnId <ID>`
(opens `file:///android_asset/pianoSvg/<ID>.svg`).
Test plan once KVM is available (user action: `sudo usermod -aG kvm lemuel`, then restart the agent so the group applies):
in the worktree overwrite five asset slots with one hymn (E505, a sheet whose original says `font-family="serif"`):
E1 = shipped original (baseline), E2 = our render (text), E3 = `svg_text_to_paths` output, E4 = our render +
`@font-face` with `url(../fonts/C059-*.otf)` (fonts copied to `assets/fonts/`), E5 = our render + `@font-face` with
`data:` URI fonts; build, install, start each id, screenshot with `adb exec-out screencap -p`. Expected: E2 and E1 show the
overlap, E3 and E5 are correct; E4 is the unknown. The test assets and APK from this attempt were built in the
session scratchpad and are not in the repo. A desktop Chromium run would be only a proxy (WebView treats
`file:///android_asset` specially).

**(b) Sizes.** Shipped originals (accepted sheets): mean 102 KB raw, 8.8 KB gzipped (the APK stores assets deflated);
folders 320 MB piano / 295 MB guitar on disk. Our renders: mean 117 KB raw, 9.5 KB gz (+14% raw, +8% gz; 365 MB piano
build folder). With text outlined (route 2) the 20 test sheets grew 166 -> 230 KB raw and 13 -> 33 KB gz on average
(the sample leans to big sheets). Extrapolated to the corpus: about +55 KB raw / +20 KB gz per sheet, i.e. roughly
530 MB raw and ~90 MB deflated per variant versus 320 MB / ~27 MB today (estimate, not measured on a full run).
For comparison the `.ly` source is 4.5 KB per sheet (28 MB for both variants raw), but the app cannot run LilyPond.
Ways to cut it if size matters: ship the fonts once (3 above), round the glyph path coordinates, or outline only
lyric/chord words that occur in several sheets via shared symbols (not possible across files).

**(c) Transposition.** `tools/transpose_check.py` wraps melody and chords in `\transpose c <to>`, re-renders, reads the
render back with the recognizer and checks (1) every note, every chord root and slash-chord bass, and the key tonic
moved by the same number of semitones, (2) everything else is unchanged (durations, ties, slurs, beams, lyrics, marks,
repeats, voltas, bar types, chord order and qualities) using the converter's own `compare_ir` with pitches neutralised,
(3) transposing back gives exactly the original IR. Results on 11 hymns (piano E625 slash chords, NS516 repeat + volta +
Ab key, E751 sharps, E26 four sharps with double sharps, NS499 ties and dashed ties, E1 pickup, BF3, E643 in 6/4,
NS948 repeats/voltas, CS308 Chinese; guitar E5 capo 3, NS534) at +2, +5, -2 semitones (and +6 on 6 of them): **all OK**,
one page each, e.g. NS516 Ab -> Bb with `Eb/G` -> `F/A`, `Fm` -> `Gm`, volta brackets intact (viewed). What does not
work or needs care:
- c -> ges (+6, six or seven flats, double flats appear) renders fine in LilyPond but three of six sheets failed
  *our checker* with two unknown glyph ids (probably double flat / large key signature shapes): needs a glyph census
  of transposed renders before extreme keys can be verified automatically.
- `\transpose` picks sharp/flat spelling itself (a "Gb" hymn may come out as "F#"); to force a spelling use the
  target pitch (`ges` vs `fis`).
- Guitar sheets already contain the capo transposition and a "(Guitar: Capo N)" title line: transposing a guitar
  sheet needs the capo number recomputed (or guitar chords derived from the piano chords, section 15 "Single source").
- Playback: the MIDI file is fixed per tune code, so audio will not follow a transposed sheet.
- The text of the title block and verses is not transposed (no pitch content); the hymn's key in the database is not touched.

**Recommended next steps.** (1) Decide the font route with an emulator test (route 3 vs 2), then add
`svg_text_to_paths` as the last step of the pipeline for any sheets that ship. (2) Keep shipping the original SVG for the
~100 REVIEW sheets per variant; only swap accepted ones (list in `ly/status.csv`). (3) For transposition in the app a
server/offline step is needed (LilyPond cannot run on the phone): pre-render the 12 keys for chosen hymns, or move
to an in-app renderer (e.g. verovio/MusicXML) - a separate project; the `.ly` files are the right archival source for either.
(4) Add a geometry check (no ink outside the page, no overlapping text) to the acceptance tests before shipping renders.
(4a) Done on branch `media/pagefit`: `tools/pagefit.py` (ink margin per page edge, relative to the original) is part of `convert.py`; not yet run over the full corpus, overlapping text is still unchecked.

**Leftover sheets (2026-10-06, branch `media/leftovers`).** All 28 leftover sheets convert now; `regress.py` 85/85. Fixes:
chord names with a raised suffix (`Aadd9`, `\\once \\override ChordName.text`); double-sharp/flat chord roots (new glyph id registered by hand);
the old chord font name `LilyPond Sans Serif` (`svgscan.is_sans`); chords printed after the staff ends (`ir['tail_chords']`, emitted as quarter
notes in the chord line only); degree sign as a diminished chord; tempo mark (`ir['tempo']`, `\\tempo`); cross noteheads; longer-than-signature
bars (`\\set Timing.measureLength`); italic lyric syllables; small italic footnotes in the verse column; a silent first bar with a chord
(hidden whole-bar rest `s1` and `\\partial` for the pickup that follows); a stacked-mark band of 11 spaces; title face `Arial Heavy`; capo line
without italics; and a bottom-margin retry (9, 6, 3 mm) when a tall sheet spills onto a second page. The full run on `media/work` predates these
fixes: merge `media/leftovers`, then run the full batch again.

**Order of work (decided 2026-10-06).** First finish the conversion: full run with the page-fit check, then the leftover sheets
(`data/leftovers.txt`), then the tune-code list. **Last, deferred:** the in-app viewer that replaces shipped SVGs
(owner's plan: smaller app). Candidates: Verovio via MusicXML (proof of concept first) or a custom `Canvas` renderer
over the IR with the music font shipped once. This supersedes the font-route decision in (1) if the viewer goes ahead.

---

## 18. Implementation status and findings (2026-10-05)

> **Current status (2026-10-07, clean full run on `media/fix5` code = 01146a30, `regress.py` 94/94): read this first.**
> **Piano 3,179 / guitar 3,179 of 3,179 sheets accepted (100%).** Clean `ACCEPT` 3,099 piano / 3,096 guitar;
> `ACCEPT_DB_MISMATCH` 74 / 77; `ACCEPT_SOURCE_BAR_SUM` 6 / 6. No sheet accepted on the earlier run is lost. `data/leftovers.txt` is
> empty (known imperfections listed there). Accepted `.ly` sources: `ly/` (6,358 files, `ly/status.csv`). Branch not merged to master.
> Details: "Clean full run on media/fix5 (2026-10-07)" below.
>
> **Open, in the owner's order:** (1) the full-run report above; (2) `build/db_tune_mismatches.txt` (48 hymns whose database
> tune code disagrees with sheet and MIDI; needs the owner's review, the database must not be changed without it);
> (3) last and deferred: the in-app viewer that replaces shipped SVGs (Verovio via MusicXML as a proof of concept, or a custom
> `Canvas` renderer over the IR; this also settles the font route, section 15.1). Known imperfections: NS10025 guitar (tight
> spacing) and NS746 (its "Note on ..." box loses its italics). Details of the fixes: "Leftover sheets (2026-10-06)" below.
> The older "Results (full run, 2026-10-05)" table, the first REVIEW-reasons table and "Known unresolved cases" further down are
> **historical**. App-readiness findings (fonts, sizes, transposition, emulator attempt): section 15.1.
>
> **Fixes after the 2026-10-07 full run (branch `media/fix5`, not yet re-run on the whole corpus):** the nine sheets that
> regressed or failed the page-fit check (NS281 CS744 both variants, E149 piano, E1076 and E1261 both variants) convert again,
> `regress.py` 94/94. Causes: the measure-length rule only handled bars longer than the time signature (now every bar whose
> length differs, so a 9/8 bar followed by a 7/8 bar keeps the original's bar lines); a footnote moved into the verse column
> must be short (< 40 units); a footnote wider than the page shrinks to fit; a very dense system falls back to tighter lyric
> spacing (0.6, then 0.3) when the page-fit check is what fails. The bar-length rule touches every sheet with an irregular
> bar, so re-run at least those (compute the list from `build/ir`) before trusting the 9 / 9 result.
>
> **Continuing on another machine.** `git switch media/work` (branch on GitHub, not merged to master). Needs
> LilyPond 2.24.x, rsvg-convert, ImageMagick, sqlite3 and Python 3 with numpy, Pillow, fontTools (see the skill file
> `.claude/skills/svg-to-lilypond/SKILL.md`). `build/` is not in git: to look at a sheet run
> `cd svg-to-lilypond && python3 tools/convert.py --variant piano ../app/src/main/assets/pianoSvg/NS349.svg`
> then `python3 tools/compare_png.py NS349` and open `build/compare/piano_NS349.png` (left = original, right = ours).
> `python3 tools/regress.py -j 4` (69 sheets, ~3 min) must print `69/69 as expected` after any change to the tools.
> Glyph shapes can differ with the LilyPond version: if a new version reports `unknown glyph ids`, follow the skill file
> section 4. Not committed on purpose: `local.properties` (SDK path), signing keys.

### How to run
`python3 tools/convert.py --group E [-j 14]` (piano), or `python3 tools/convert.py path/to/X.svg ...`.
Outputs in `build/`: `ir/` (JSON), `ly/` (LilyPond), `svg/` (our re-render), `report_<group>_piano.json`.
Statuses: `ACCEPT` (all checks pass), `REVIEW` (something to look at), `recognition_error`, `render_error`.
Whole English set takes ~5 min on 14 processes.

### Results (full run, 2026-10-05, after all fixes) - HISTORICAL, superseded by the current status above
Status meanings:
- `ACCEPT`: every check passes.
- `ACCEPT_DB_MISMATCH`: converted and internally consistent (bars add up, re-render reads back the same, no
  symbol missing), but the *database* disagrees on the tune code or lyric words. The DB is usually the wrong
  one (see findings), but these are the files to spot-check.
- `ACCEPT_TAIL_UNVERIFIED`: the original SVG overflows its page; only page 1 of our render was compared.
- `REVIEW`: a concrete check failed (reasons below). Not silently converted.

| | Piano | Guitar |
|---|---|---|
| files | 3,179 | 3,179 |
| `ACCEPT` | 2,940 | 2,886 |
| `ACCEPT_DB_MISMATCH` | 116 | 160 |
| `ACCEPT_TAIL_UNVERIFIED` | 21 | 22 |
| **accepted in total** | **3,077 (96.8%)** | **3,068 (96.5%)** |
| `REVIEW` + errors | 102 | 111 |

By group (piano accepted of total): E 1,350/1,362 (99.1%), NS 1,157/1,230 (94.1%), CS 284/291, BF 97/98,
C 121/124, CH 68/74. Guitar is within a point of piano in every group.

What `ACCEPT` requires: V1 bars add up (with time changes); V2 our render reads back as the same music and text
(incl. bar types, voltas, marks, fermatas, chord order); V3/V4 tune code or MIDI (soft-tolerant); V8 lyric words;
a *model-free coverage check* (same number of noteheads/rests/scripts/dots/accidentals/chord characters in the
original and our render); no warnings, no unplaced text, one page.

Remaining `REVIEW` reasons, piano (guitar is similar):
| Count | Reason |
|---|---|
| 16 | round-trip event differs (E1337, NS299, NS376 ...): ties/slurs/marks that read differently in a re-render |
| 16 | bar line / volta end lands on a different measure in the re-render (NS32, NS170, NS216 ...) |
| 13 | bar sum: tuplet or duration shapes not understood, e.g. a bracket over 4 notes, mixed beamed/tied groups (NS32, NS121, NS445 ...) |
| 7 | key-signature change whose cancellation prints differently (E323, E924, E1337) |
| 7 | dot count differs (dotted whole notes: E522, E887, E983) |
| 6 | a curve whose ends can't be matched to notes (E1170, NS145, NS231) |
| 5 | exotic chord (add9, diminished over bass, Eb#/G): NS876, CS107 |
| 4 | two curves open across a system break (E1340, NS127, NS410) |
| 2 | one emit error (NS746) and one unsupported notehead (NS812: cross noteheads for spoken text) |

### Full run after the visual-review fixes (2026-10-05, media host, LilyPond 2.24.4, `-j 8` under nice)
| | Piano | Guitar |
|---|---|---|
| files | 3,179 | 3,179 |
| `ACCEPT` | 3,001 (was 2,940) | 2,989 (was 2,886) |
| `ACCEPT_DB_MISMATCH` | 79 (was 116) | 82 (was 160) |
| `ACCEPT_TAIL_UNVERIFIED` | 0 (was 21) | 0 (was 22) |
| **accepted in total** | **3,080 (96.9%)** | **3,071 (96.6%)** |
| `REVIEW` | 97 | 106 |
| `recognition_error` / `emit_error` | 1 / 1 (NS812, NS746) | 1 / 1 |

Changes behind the numbers: no sheet spills to a second page any more (staff size from the viewBox), so the
`TAIL_UNVERIFIED` tier is empty and those 43 sheets are now fully verified; the hyphen repair removed ~40-80 false
`DB_MISMATCH`es. 264 piano / 296 guitar sheets (8-9%) are rendered with LilyPond's own word spacing because the wider
spacing made a dense system overflow (`lyric_space: "default"` in the report).
The first pass of this run ended with 30 piano + 30 guitar `roundtrip_recognition_error` (unknown glyph ids in
renders at other staff sizes: flags d3/d4/u4, digits, rests.4, natural at scale 0.0040); after naming them (census +
`glyph_names.py`, all scores 0.77-0.92) 58 of the 60 convert and are accepted. The REVIEW list is otherwise the old one
(round-trip differences, bar sums, volta placement, dotted whole notes, key cancellation, curves); NS349 (3/2 bar) and
NS10082 (Chorus mark on a rest) are the two that the glyph update exposed. Timing: ~75 min E, ~2 h NS, ~12 min each
for CS/BF/C/CH per variant at `-j 8` (about 3x slower than the old `-j 14` figures: fewer cores, nice, retries).
Open question: the earlier table listed 7 dot-count and 7 key-change REVIEWs; this run has E522 E887 E983 E1097 E1186
E1250 (dots) and E323 E879 E924 (flats/naturals), consistent with that, but I did not diff against the old reports
(they were not kept), so a regression among them is not excluded.

### Clean full run on media/fix5 (2026-10-07, media host)

All groups, both variants, `-j 8` under `nice`, 02:28-10:02 (about 7.5 h), baseline = the earlier 2026-10-07 reports.
- **Totals:** piano 3,099 ACCEPT + 74 ACCEPT_DB_MISMATCH + 6 ACCEPT_SOURCE_BAR_SUM = 3,179; guitar 3,096 + 77 + 6 = 3,179.
  No REVIEW, no errors, no page-fit problems, no multi-page sheets.
- **Accepted before and not now:** none. **Tier changes among accepted sheets:** none.
- **The 9 former failures** all convert: piano E149 (tight 0.3), E1076, E1261, NS281 (SOURCE_BAR_SUM), CS744 (SOURCE_BAR_SUM, default spacing);
  guitar E1076, E1261, NS281, CS744 (E149 guitar already passed with default spacing).
- **Lyric spacing:** piano wide 2,711 / default 467 / tight 0.3 one (E149) / tight 0.6 none; guitar wide 2,711 / default 468 / no tight.
- **Looked at by eye (E149, NS281, CS744 piano; E1261 guitar):** layout close to the original. Imperfections seen, not fixed:
  CS744 (and NS121) have no final bar line; E1261 footnote sits directly under the last verse line (original leaves a gap);
  E149 piano with tight spacing runs a few syllables together ("Ten thou-sand heav'n-ly", "Sound the note").
- **Accepted with a squeezed-note count above 0** (accepted, but worth a look): piano E17 E608 E1107 E1110 NS320 NS368 NS682 NS791;
  guitar E1137 NS320 NS368 NS682 NS791 NS10082.

### Full run with page fit and leftovers (2026-10-07, media host)
Code: `media/work` at 5080fdbc (page-fit check `tools/pagefit.py` + the 4 "leftovers" commits). Same rules as before (`-j 8`,
nice, one batch; ~3.5 h per variant). Baseline for the diff: the 3,166 piano / 3,164 guitar reports of 2026-10-06.

| | Piano | Guitar |
|---|---|---|
| `ACCEPT` (clean) | 3,096 | 3,094 |
| `ACCEPT_DB_MISMATCH` | 74 | 77 |
| `ACCEPT_SOURCE_BAR_SUM` | 4 (NS121 NS202 NS349 NS746) | 4 (same) |
| **accepted in total** | **3,174 (99.84%)** | **3,175 (99.87%)** |
| `REVIEW` | 5 | 4 |
| newly accepted vs baseline | 13 | 15 |
| accepted before, not now | 5 | 4 |
| sheets rendered with LilyPond's own word spacing | 466 (14.7%) | 467 |

The 13 piano / 15 guitar former leftovers (CS107 CS602 CS710 CH52 NS349 NS407 NS531 NS746 NS812 NS876 NS1152 NS10025
C316, plus NS160 NS471 on guitar) are all accepted now. The share of sheets that fall back to the default word spacing
rose from ~9% to ~15%: the page-fit check turns a wide-spacing overflow into REVIEW, and the fallback then rescues it.

**Accepted before, not accepted now (all looked at by eye):**
| Sheet | Variant | Reason |
|---|---|---|
| E149 | piano | page fit only: line 2 runs off the right edge (ink 0.0 from the right edge, original 6.3); guitar E149 passes |
| E1076 | both | page fit only: the verse columns and the long footnote run off the right edge (0.0); the original itself is cut off at the left edge (0.0), so its own margin is no help |
| E1261 | both | page fit only: verse text shifted left, stanza numbers off the left edge (0.2) and a non-italic footnote running off the right (0.0); original margins 7.2 / 6.3 |
| NS281 | both | **regression**: a stray bar line after the first note of line 2 (measures per system `[5,3,4,5]` vs the original `[5,4,5,6]`); was in `ACCEPT_SOURCE_BAR_SUM`. Likely the new lead-bar handling in system 0 |
| CS744 | both | same kind of bar-count difference as NS281 (measures 21/22/28) plus ink 0.0-0.5 from the right edge; was in `ACCEPT_SOURCE_BAR_SUM` |

**Is the page-fit check too strict?** No. In every sheet examined (E149, E1076, E1261) ink really touched or crossed the page
edge and the sheet was visibly wrong; the check found them where no other check could. `MIN_MARGIN` stays 2.0. The three
`E` sheets fail ONLY the page-fit check (so do E1076/E1261 on guitar); the footnote handling in verse columns is the likely
common cause (footnote not italic, no line width limit, columns shifted). Not fixed yet (as instructed); next fixes: the
footnote width, NS281/CS744 lead bars, E149 piano spacing.

### Review tail, task 3 (2026-10-05/06, media host): 99.6% accepted
Final full run on LilyPond 2.24.4 (`-j 8`, nice; E 1 h, NS 2 h, CS/BF/C/CH ~12 min each per variant) plus the re-test of
the two regressions it showed:

| | Piano | Guitar |
|---|---|---|
| files | 3,179 | 3,179 |
| `ACCEPT` (clean) | 3,089 | 3,084 |
| `ACCEPT_DB_MISMATCH` | 73 | 76 |
| `ACCEPT_SOURCE_BAR_SUM` (new tier) | 4 | 4 |
| **accepted in total** | **3,166 (99.59%)** | **3,164 (99.53%)** |
| `REVIEW` | 11 | 13 |
| no `.ly` (`recognition_error` / `emit_error`) | 2 (NS812, NS746) | 2 |

(Before this task: piano 3,080, guitar 3,071; at the very start of the media-host session 3,077 / 3,068.) Every sheet of
E is accepted in both variants; all of BF is accepted. 268 piano / 303 guitar sheets (~9%) use LilyPond's own word
spacing (wide spacing made a dense system overflow).

**New tier `ACCEPT_SOURCE_BAR_SUM`** (NS121 NS202 NS281 CS744): the only failing check is the bar arithmetic (V1), while the
round trip, the model-free symbol counts and the warnings all pass: the original prints bars that do not add up (a short
final bar, a mis-barred source) and our `.ly` reproduces it glyph for glyph. Counted as accepted but kept apart from `ACCEPT`.

**Defects fixed (each found on real sheets; all in `recognize.py` unless noted):**
| Defect | Sheets | Fix |
|---|---|---|
| Tuplet whose bracket covers more events than its digit (3 over quarter, quarter, two eighths) | NS32 NS445 NS584 NS624 NS712 CS1003 | the group is the events under the bracket (its end ticks are two horizontal pieces either side of the digit); unit check: written total / n must be a power of two |
| Repeat-sign dots read as a rest's augmentation dot | NS10046 | a vertical pair of dots is never an augmentation dot |
| Dotted whole rest lost its dot | E522 E887 E983 E1097 E1186 E1250 | its dot sits half a space *below* the rest origin |
| **Key change in the middle of a line was forgotten on the next system**: notes read with the old key's accidentals (a real musical error, caught only by the symbol-count check) | E323 E879 E924 NS732 NS10049 (+ guitar) | each system starts from the key current at the end of the previous one |
| Curves leaving a line: a tie and a slur on the same note | E1170 NS145 NS231 NS413 NS537 NS1064 E1340 NS127 NS410 NS10075 | `state['open']` is a list; open curves are paired with arriving ones biggest to biggest; **two long pieces with one origin are two curves** (only >= 3 pieces, or 2 tiny ones, are one dashed curve); the flag "can be a tie" belongs to the open curve, not the note (a shared note lost it: NS160, NS402) |
| Tie vs slur | NS504 NS533 NS786 BF446 | a tie needs adjacent *events* (no rest, no note between); over a line break last event to first event; a half-tie stub at a line start begins only 1.1 before the first note (arrival test is `x0 < first_x - 0.4`) |
| Slur lifted above a tuplet bracket assigned to the system above | NS806 | a curve between two systems goes to the system whose noteheads it joins |
| Chord names above three stacked boxed marks not found | E1337 | chord band extended from 12 to 19 spaces above the staff |
| Two chord changes inside one long note snapped to the same beat | E16 E539 E760 E1072 (guitar) | the later one takes the next free sixteenth |
| Diminished chord inside a note: LilyPond draws the "o" as a glyph | NS376 | the comparison ignores "o" for chord changes inside a note too (it already did for the chord on a note) |
| Volta bracket continuing over a line break (a tick at the break is not an end) | NS170 NS216 NS679 NS749 NS863 NS970 NS1038 NS1040 NS965 CS928 | an unlabeled bracket at the very start of a line cancels the previous line's "end" |
| Indented refrain paragraphs and unnumbered blocks (Bridge, Ending, children's songs) in the verse area | NS750 and ~30 more (NS540 NS626 NS639 NS890 NS10042 CS149 CH35 CH46 CH55 CH56 CH59 ...) | lines belong to the nearest column to their left (indent up to 20); unmatched lines form unnumbered blocks emitted as plain columns |
| Verse block too close to the last staff lost its stanza numbers (the threshold was 14 below the staff), which also made the layout calibration chase the wrong line | NS506 NS972 NS1032 NS1068 NS1144 E1337 | threshold 10 |

**Still `REVIEW` / no `.ly` (13 piano, 15 guitar; each with a reason):**
- *Source quirks our `.ly` cannot show:* CS107 CS602 CS710 CH52 print chord names over bars that have no notes (a chord
  needs a note); NS349 lacks a bar line after a fermata (LilyPond draws the bar by itself; would need cadenza mode).
- *Not modelled:* NS812 cross noteheads (spoken text); NS746 no time signature; NS531 (`##` chord), NS876 (`add9`), guitar
  NS160 (`F?m`) exotic chords; NS471 guitar (stacked marks `3.` `3.` `4.` `4.` on one note).
- *Text we do not place:* NS407 (instruction syllables above the music), NS1152 (`°` marks), NS10025 (one line of text),
  C316 (footnotes below the music).

**Lessons worth keeping**
- The model-free symbol counts (coverage) found the key-change error that every model-based check missed. Keep them.
- Anything in `recognize.py` that compares "nearest note by x" fails for objects drawn very close together (short ties,
  half-tie stubs, two curves on one note): check geometry (which end, which side) before guessing.
- LilyPond's `\vspace` inside a `\column` costs a whole extra baseline; use `\translate` to shift lines.
- A full run takes ~6.5 h at `-j 8` under nice; re-running only the previous REVIEW list (about 100 sheets per variant)
  takes ~15 minutes and is the right loop while fixing; validate with a full run at the end and diff against the saved
  reports (`build/prev_reports/`) so a regression is caught (NS160 and NS402 were).

**Task 4 (report only): database tune codes.** `tools/tune_mismatch_report.py` writes `build/db_tune_mismatches.txt`: 48
hymns whose database tune code disagrees with the melody on the sheet *and* with the MIDI top voice (e.g. CH7: code
`11111111555511`, our reading `66666666333366`: the same shape on another reference note, probably a different key
convention; BF135: `465341653` vs `132715327`). Both variants agree for every one. The database was not touched; the tune
code names the MIDI file, so changing one can break playback. Treat the list as "worth a human look", not as proof the
database is wrong: some are probably our reading of the key.

### Visual review 2026-10-05 (task 1 of the media-host session)
Method: 140 random sheets (70 piano, 70 guitar; seed fixed, lists in `build/sample_*.txt`) were converted on LilyPond
2.24.4, 36 side-by-side images viewed (21 piano, 15 guitar) with `tools/compare_png.py`, plus the two known
`TAIL_UNVERIFIED` files NS523 and E1242. Statuses of the 140: 138 `ACCEPT`, 2 `ACCEPT_TAIL_UNVERIFIED` (NS523, E1242);
no `ACCEPT_DB_MISMATCH` fell into the sample (they are ~4%), so that tier was only seen via E1242-guitar. Music
(notes, pitches, beams, ties, slurs, chords, key/time, repeats, voltas, fermatas, title block, footer) looked right on
every image. What was **wrong** (all found by eye, none by the automatic checks):

| # | Defect | How common | Fix |
|---|---|---|---|
| 1 | **Sheets typeset on a smaller staff size were rendered at size 16.** The originals have `viewBox` widths 163.8 / 169.5 / 175.5 / 182.0 / 189.0 / 204.8 instead of 153.57 (staff size 13-15.3 pt on the same Letter page, so more bars fit per line). We forced the original line breaks onto a size-16 page: lines overflow, LilyPond squeezes notes or the staff runs off the page. E1242-guitar was `ACCEPT` while its last system left the page; NS523/E1242 spilled to page 2 (`ACCEPT_TAIL_UNVERIFIED`). | 281 of 3,179 sheets per variant (8.8%), both variants | `recognize` records `page_w` from the viewBox; `emit_ly` sets `set-global-staff-size = 16*153.5737/page_w` and converts mm with `215.9/page_w`. NS523, NS123, E1242 now render on one page and are fully verified (`ACCEPT`). |
| 2 | **"Chorus" (boxed) marks collided with the lyrics of the system above.** The original has chord names above the box above the staff; our `\mark` went above the chord row. | every sheet with a boxed mark (~10-15%) | marks are emitted as `^\markup` scripts on the note (centred), except on notes that also carry a fermata (kept as `\mark`: a script stacks over the fermata and moves it). |
| 3 | **Dashed ties printed solid** (NS499: `F.~F` with a dashed tie in the original). Only dashed *slurs* were modelled. | rare (a few sheets) | `tie_dashed` flag in recognize/IR, `\once \tieDashed` in emit. |
| 4 | **Lyric words run together** ("ThatGod", "Whichfor") and **hyphens vanished** in tight syllables ("decreas-ing", "children"): 2.24 packs lyrics tighter than the originals. | very common (most sheets, mildly) | `LyricSpace.minimum-distance = 2.5` and `LyricHyphen.minimum-distance = 0.6` in the Lyrics context. A dense system then overflows and LilyPond squeezes the notes (NS123 had a dotted half 2.7 from its rest instead of 5.7), which the checks do not see, so `convert.py` now (a) computes `squeezed` (neighbouring events less than half as far apart as in the original) and (b) re-converts with LilyPond's own word spacing (hyphen fix kept) when the wide version ends in REVIEW or is squeezed. |
| 5 | **Indented refrain paragraphs inside a verse lost their gap and indent** (NS534 "(They said:)", E1242, C439...). The IR kept only the text lines. | sheets with a refrain in the verse block (est. 3-5%) | stanza lines now carry `pos` (x, y); `stanza_body` rebuilds the gap and indent with `\translate` (a `\vspace` inside a `\column` costs an extra whole line). `convert.compare_ir` ignores `pos`. |
| 6 | `repair_hyphens` did not join a word when one of its hyphens was already present ("de-creas-ing" lost the first). | rare | any missing hyphen in the DB-proven word is restored. |

Also fixed on the way: `glyph_names.py` had the 2.24.3 font path hard-coded and silently did nothing on this host
(2.24.4) - now globbed; one new glyph id `0e14944b` = `scripts.ufermata` (score 0.745, runner-up 0.18) at staff size 13
in 2.24.4 renders (merged into `data/glyph_names.json`; `data/glyph_census.json` was regenerated from the current
corpus plus the renders in `build/svg`, which is why it shrank). `convert.py`'s layout search now remembers its best
one-page attempt and returns to it when a correction overshoots onto a second page.

Not fixed, noted: (a) chord names sit a little lower and closer to the lyric line above than in the original on sheets
with a boxed mark (cosmetic); (b) an `ACCEPT` does not check page geometry: add a bounding-box test if renders are ever
shipped (defect 1 would have been caught by "no ink right of the right margin"); (c) horizontal spacing differs
slightly everywhere (accepted by design); (d) `ACCEPT_DB_MISMATCH` was not covered by this random sample, see task 4.

### Pipeline modules
`svgscan.py` (primitives) -> `recognize.py` (IR) -> `emit_ly.py` (.ly) -> LilyPond -> `recognize.py` ->
`convert.py` (compare IR vs IR', layout calibration) with `verify.py` (V1, V3, V8, hyphen repair).
`batch.py` runs recognition + V1/V3 only (fast, no rendering).

### Findings that changed the design (each cost real debugging time)
**Recognition**
- Stems can be up to ~6 units long (low notes); beam polygons cover stems, and a 16th's secondary beam sits
  ~0.9 from the stem tip (tolerance must be ~2.3). Dots for notes below the staff sit up to top+8.
- A tie/slur is a closed shape: use the **x extent of the whole path**. A dashed slur is several tiny pieces
  sharing one origin: merge by origin, flag `dashed`, emit `\slurDashed`. A curve that runs past the
  last note continues on the next system: carry it across.
- Chord names: a new chord starts at a root letter (A-G) not preceded by '/'; accidentals are separate
  glyphs at scale 0.0032. The chord row rises (up to ~12 above the staff) when a boxed mark is above it,
  so the search band must be wide. Qualities in the corpus: '', m, 7, m7, sus4, sus2, maj7, +, o, o7, m6, 6.
- Time signature changes are common (also at the start of a later system): cluster time glyphs by x, record
  `time_change` on the measure, and check bars against the current time.
- Triplets: italic digit; group of N consecutive events nearest the digit's centre; durations scale by den/N.
- Marks above the staff: Chorus, Bridge, Bro:/Sis:/All:, Part 1, Fine, D.C. ... A box is four 0.116-thin rects.
  Stanza labels ("1.", "(C)") share a baseline with a lyric line; tell them apart from marks that way.
- Lyric syllable -> note: monotone DP on |syllable centre - head centre| using real font widths (C059
  stands in for Century Schoolbook L). LilyPond shifts syllables away from collisions, so **x-based
  assignment from a re-render is unreliable**; compare syllable text order in V2 instead.
- Originals omit hyphens drawn too tightly, and 2.24 shortens hyphens (0.5 wide). Hyphen flags are
  repaired from DB words (`verify.repair_hyphens`).

**Verification**
- DB tune codes count a tied pair once, are sometimes just wrong (E534: the sheet clearly shows G = degree
  3, code says 4), and for C (Chinese) have a leading space. V3 has `exact | soft | fail`.
- V8 (words rebuilt from syllables must exist in the DB stanza text) is the best lyric check.
- Compare re-renders on **text and music only**; layout numbers differ because the originals came from
  another LilyPond version.

**LilyPond pitfalls**
- `\partial` takes ONE duration: 5/16 must be `16*5`, not `4 16`.
- With `\autoBeamOff`, manually beamed notes count as a lyric melisma. We avoid the issue by emitting one
  lyric token per note (syllable or `_`) with `\set ignoreMelismata = ##t`.
- `\addlyrics { \verseOne }` needs the backslash.
- Extra automatic line breaks appear because 2.24 spaces notes wider: forbid them with
  `NonMusicalPaperColumn.line-break-permission = ##f` and give one `\break` per original system.
- Python `%` formatting: any `%` in a LilyPond comment inside a %-format template must be `%%`.
- Output goes to `build/` (not /tmp): temp dirs are on another filesystem and `os.replace` fails.
- Glob `E1*.svg` also matches E10.svg: match output names exactly (multi-page output is `X-1.svg`).
- Glyph shapes change per LilyPond version: after rendering, rerun `glyph_census.py` + `glyph_names.py`
  (the census now includes `build/svg/`). New shapes of known symbols are normal.

**Layout**
- Fixed formulas for title/staff/verse spacing don't survive different title blocks (CH has no hymn
  number). `convert.py` now renders, measures the staff/title/verse positions of the result, and corrects
  `top-margin`, `\vspace`, `system-system-spacing`, `score-markup-spacing` (max 2 corrections). Median
  residual is 0.01 staff spaces.

**Added in session 2 (each learned the hard way)**
- **Honesty gap found via the side-by-side of NS948: repeats, voltas and the final thick bar were silently
  missing** because V2 compared only what the IR models. Fix: the **model-free coverage check** (symbol counts in
  original vs render) now forces `REVIEW` for anything printed but not modelled. Keep it.
- Bar lines: group thin (T) / thick (K) rects and repeat dot *pairs* (D) by x; signatures T, TT, TK, DTK (`:|.`),
  KTD (`.|:`), DTKTD. A start-repeat drawn at the start of a line belongs to the previous system's last bar.
  A single dot near the middle of the staff is a note dot; a vertically aligned pair is a repeat sign.
- Voltas: long thin horizontal line above the staff (stroke ~0.205) with end ticks, label as tiny digit glyphs
  ("1.–2." is `one period hyphen hyphen two period`). Emit with `\set Score.repeatCommands = #'((volta "1.–2."))`
  and `((volta #f))` after the bar (combine end+start in one command). LilyPond draws the en dash differently:
  compare labels without dashes.
- Chord names are placed by *time*: a chord can sit mid-way through a sustained note. Attach to a note if one
  starts there, else record an offset inside the note (beat-snapped from x). An early chord drawn left of the
  next note belongs to that note unless that note already has its own chord. The x->time mapping differs per
  LilyPond version, so V2 compares only the chord *order* inside a note; offsets are estimates.
- Fermatas are centred on notes (`^\fermata`); segno/coda are signs (`\musicglyph`); several marks on one note
  must be emitted as one stacked `\mark \markup { \column { ... } }` (one `\mark` per moment).
- Key changes occur at line starts *and* mid-line right after a bar: scan every boundary for key-signature
  accidentals (>= 2 units left of the next note), compare with the current key, emit `\key`.
- `(Guitar)`, `(Guitar: Capo N)` and similar italic lines belong in the title block (`\fill-line` under the title).
- The subtitle is exactly 3.5 below the title baseline: use that, not the distance to the staff.
- `hymns.sqlite` is **rewritten by Gradle/IDE builds** while we run (it was corrupted mid-batch once). The checks
  now read a private snapshot `build/hymns_snapshot.sqlite` built from the committed `sqlite/hymns.sql`
  (auto-rebuilt when older than the dump). Never point batch tools at the shared file.
- Layout self-calibration: the first-staff position responds to `\vspace` non-linearly and negative values clamp,
  so use a bracketing search (`next_vspace`), up to 8 corrections. `markup-system-spacing` does NOT move the
  first staff after a custom `bookTitleMarkup`.
- Boxes (`\box`) get different padding in LilyPond 2.24: detect a box by a thin horizontal rect above and below
  the text, both about text-wide, not by exact offsets.
- Time per run: piano all groups ~25 min, guitar ~25 min on 15 processes. `tools/regress.py` (36 files) ~1 min.

### Known unresolved cases
E1242 and ~20 NS sheets (the original SVG overflows its page; the rest is on our page 2 and is not compared),
E635/E871/E1240 (syllables of one word on different lyric rows), tune-code disagreements (the DB is wrong
where checked by eye; see `ACCEPT_DB_MISMATCH`), and the REVIEW table above.

---

## 16. Tools & data in this folder

| Path | What |
|---|---|
| `tools/svgscan.py` | SVG → absolute primitives; `staves()`. `python3 tools/svgscan.py file.svg` prints a summary. |
| `tools/glyph_census.py` | Collects all glyph outlines → `data/glyph_census.json`, contact sheets in `build/`. |
| `tools/glyph_names.py` | Names glyphs against Emmentaler → `data/glyph_names.json` (+ table in `build/glyph_names.txt`). |
| `tools/recognize.py`, `emit_ly.py`, `verify.py`, `convert.py`, `batch.py` | The converter (§18). |
| `tools/features.py` | Per-file features → `data/features.csv`. The scoring in §5 was done ad hoc from this CSV. |
| `tools/asset_audit.py` | `dups`: compare `* (1).svg` duplicates with base and live. `pairs ID…`: piano vs guitar vs live note counts. Live downloads cached in `build/fresh/`. |
| `data/difficulty_ranking.json` | Piano files sorted by difficulty score. |
| `experiments/E1_opus_variant.ly`, `E1_sonnet_variant.ly` | Hand-written E1 transcriptions (layout experiments, §8). |
| `experiments/cmp.py`, `report.py`, `glyphs.py` | Early comparison helpers from the E1 experiment (superseded by `tools/`). |
| `ly/` | **Committed** generated `.ly` for the accepted sheets (3,179 piano, 3,179 guitar) + `status.csv` + README. Never hand-edit; refresh after significant converter changes. |
| `tools/tune_mismatch_report.py` | Lists hymns whose DB tune code disagrees with the sheet (writes `build/db_tune_mismatches.txt`). |
| `tools/svg_text_to_paths.py` | Outlines the `<text>` of a LilyPond SVG so it needs no installed fonts (section 15.1). |
| `tools/guitar_from_piano.py` | Derives the guitar `.ly` from the piano `.ly` (section 10.2): `--all`, `--compile`, `--check`. |
| `tools/transpose_check.py` | `\transpose` round-trip and semitone check for converted hymns (section 15.1). |
| `build/` | Generated renders, contact sheets. Git-ignored and safe to delete. |

Rebuild everything: `cd svg-to-lilypond && python3 tools/glyph_census.py && python3 tools/glyph_names.py > build/glyph_names.txt && python3 tools/features.py`
(about 40 s). Environment: LilyPond 2.24.3 (`/usr/bin/lilypond`, apt), `rsvg-convert`, ImageMagick,
Python 3.12 with fontTools/numpy/Pillow.

---

## 17. Log

- **2026-10-02:** Discovered the SVGs are LilyPond vector output. A throwaway decode of E1 confirmed
  that pitch = staff-line arithmetic. Chose LilyPond as the target over ABC/MusicXML, because only
  LilyPond can regenerate the same engraving.
- **2026-10-03:** LilyPond 2.24.3 installed. Two independent hand transcriptions of E1 reached
  near-identical renders; findings in §8. Full corpus survey:
  - 184 glyphs, all named
  - 2 SVG formats
  - 34 broken HTML assets
  - piano/guitar consistency
  - DB tune code = scale-degree melody (V3)
  - MIDI = 4-part harmony, melody = top voice (V4)
  - difficulty ranking: NS hardest

  Wrote this document.
- **2026-10-04:** User decisions recorded (§13), future goals added (§15). Asset cleanup (§11):
  - re-downloaded 5 hymns
  - deleted 12 error pages with no sheet available
  - fixed 4 case-mismatched names
  - deleted 68 `(1)` duplicates
  - refreshed 7 inconsistent pairs

  Committed as `1e727e1e`. Found: NS389 identity drift, scrambled `nt/` page text, a third SVG flavour
  (`font-family="sans"`).
- **2026-10-04 (later):** Emulator check of the asset fixes (§11). Corrected an earlier claim: the app does not
  hide the sheet button for missing sheets, it shows a toast. Confirmed the serif-font overlap in the
  Android WebView. Build note: from WSL, build with `cmd.exe /c "set JAVA_HOME=C:\Users\lemue\.jdks\ms-17.0.16&& gradlew.bat :app:assembleDebug"`.
- **2026-10-05 (media host, visual review):** see section 18 "Visual review 2026-10-05". Six defects found and fixed by eye (staff size from viewBox, boxed marks as scripts, dashed ties, lyric spacing + hyphens with automatic fallback, verse-block refrains, hyphen repair); regression list now 43 entries, all as expected.
- **2026-10-05 (media host, full run):** piano 3,080/3,179, guitar 3,071/3,179 accepted; strict ACCEPT 3,001 / 2,989; TAIL_UNVERIFIED tier empty. New glyph ids named. See section 18.
- **2026-10-05 (media host):** accepted `.ly` files committed under `svg-to-lilypond/ly/` (user decision: they took ~6.5 h to build). REVIEW sheets stay in `build/`.
- **2026-10-05 (media host, task 2):** app-readiness prototype: text-as-outline tool, size comparison, `\transpose` checked on 11 hymns; report in section 15.1.
- **2026-10-05/06 (media host, task 3):** review tail worked class by class (bar sums, tuplet brackets, dots, key changes across systems, curves across line breaks, voltas, verse blocks). Final: piano 3,166/3,179, guitar 3,164/3,179; new tier `ACCEPT_SOURCE_BAR_SUM`; 13+15 sheets left with reasons. Task 4 list written. See section 18.
- **2026-10-05 (session 2):** Built the converter (recognize / emit / verify / convert), tests and tools; findings in §18.
  English piano 1,350/1,362 accepted; all groups piano 3,077/3,179 and guitar 3,068/3,179. Wrote the Claude skill
  (`.claude/skills/svg-to-lilypond/SKILL.md`). Corrected an overstatement along the way: the first New Songs run had
  counted sheets as accepted that lacked repeats and voltas; the coverage check was added to prevent that.
- **2026-10-08:** Piano vs guitar measured on all 3,179 `ly/` pairs (§10.1). Lemuel decided: piano `.ly` only, guitar
  derived by a conservative conversion (§10.2), slightly busier E charts accepted. `tools/guitar_from_piano.py` written;
  first full run: all 3,179 derived sheets compile on one page (5 with the page-fit fallback); results in §10.2.
  Side-by-sides: Lemuel prefers the derived chords to hymnal.net's guitar sheets. Capo text for C/CS moved from the
  first note to its own line under the title (as in hymnal.net's sheets; the first-note markup collided with the first
  chord); all 415 C/CS sheets still fit one page. `ly/guitar/` and its `status.csv` rows removed; the guitar `.ly` is
  now derived on demand and not stored.