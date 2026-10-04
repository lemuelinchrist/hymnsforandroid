# SVG → LilyPond Converter: Technical Design & Report

Living document. Records **what we've learned** about the hymnal.net lead-sheet SVGs and **how the
converter is designed**. Update it whenever something new is learned, so nothing gets lost between sessions.

- Started: 2026-10-02
- Last updated: 2026-10-05 (end of session 2)
- Status: **converter working for piano and guitar sheets** (§18). 96.8% of piano and 96.5% of guitar sheets
  convert and verify (§18 results). Asset cleanup pushed (`1e727e1e`) and the design/tools committed
  (`f2d219ff`); the converter itself, the skill and this update are **uncommitted**.

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

- **Capo** appears on guitar sheets as follows: none 1,426, 3 → 1,056, 1 → 677, 2 → 71, 4 → 12. With no
  capo, the guitar chords presumably equal the piano chords. Verify this with V7.
- **Decided (2026-10-04): two independent `.ly` files per hymn**, one per SVG
  (`ly/piano/E1.ly`, `ly/guitar/E1.ly`). This means some duplication. A single shared source is a
  future goal (§15).
- Guitar chords are stored as printed, not computed by transposition, because enharmonic spelling may
  differ. Verify against transposition anyway (V7).
- After the 2026-10-04 asset cleanup, every hymn has exactly one piano and one guitar SVG, and all
  3,179 pairs agree note-for-note.

---

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
- **Single source per hymn:** merge piano/guitar into one `.ly` (guitar = piano chords transposed by
  capo, plus capo text). Blocked until V7 shows how often guitar chords are exactly the transposed
  piano chords.

---

## 18. Implementation status and findings (2026-10-05)

### How to run
`python3 tools/convert.py --group E [-j 14]` (piano), or `python3 tools/convert.py path/to/X.svg ...`.
Outputs in `build/`: `ir/` (JSON), `ly/` (LilyPond), `svg/` (our re-render), `report_<group>_piano.json`.
Statuses: `ACCEPT` (all checks pass), `REVIEW` (something to look at), `recognition_error`, `render_error`.
Whole English set takes ~5 min on 14 processes.

### Results (full run, 2026-10-05, after all fixes)
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
- **2026-10-05 (session 2):** Built the converter (recognize / emit / verify / convert), tests and tools; findings in §18.
  English piano 1,350/1,362 accepted; all groups piano 3,077/3,179 and guitar 3,068/3,179. Wrote the Claude skill
  (`.claude/skills/svg-to-lilypond/SKILL.md`). Corrected an overstatement along the way: the first New Songs run had
  counted sheets as accepted that lacked repeats and voltas; the coverage check was added to prevent that.
