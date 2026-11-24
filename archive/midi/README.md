# Archived MIDI files (deprecated 2026-11-24)

The melody MIDI files of **New Songs (NS), Be Filled (BF) and the Children's Hymnal (CH)** are no longer shipped: those
books play their sheet music (Android `Hymn.getSheetToPlay`, web `tuneFile`). The files here are the **1,041 that no other
book used**, so they were taken out of `app/src/main/res/raw`. They are kept here, outside the app (nothing under
`archive/` is packaged or deployed), instead of being deleted.

- File names are as they were: `m<tune code>.mid`. `INDEX.tsv` lists the NS/BF/CH hymns with each tune code.
- **Exception, kept in `res/raw`:** a tune file that any other book uses (English, translations, ...) is NOT removed, even
  when an NS, BF or CH hymn uses it too (520 files). Nothing here has an English hymn's tune code (checked 2026-11-24).
- To bring a file back: copy it to `app/src/main/res/raw/`. The NS, BF and CH hymns still play their sheet, so also
  remove them from `Hymn.playsSheetOnly` and the web `SHEET_ONLY_GROUPS`/`tuneFile` rule.
- Some codes are wrong in hymnal.net's data (NS10087's was NS39's, NS851 shared NS859's); the file is the melody of the
  hymn named in its INDEX row only when the code is right. See `tools/svg-to-lilypond/DESIGN.md` §17, 2026-11-24.
- Not made again: `generate-midi` and `tools/hymn-midi` only make files to listen to; none goes into `res/raw`.
