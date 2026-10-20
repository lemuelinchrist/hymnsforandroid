# Hymns for iOS (single-file web app)

`hymnal.html` is a self-contained, offline lyrics-only hymnal for iPhone (iOS 16.4+): all books, search,
favorites, pinned languages, and a link to each hymn's page on hymnal.net for sheet music and MIDI.

Build it (needs only Python 3):

    python3 tools/ios/build.py

It reads `app/src/main/assets/hymns.sqlite` and the book names/order from `HymnGroup.java`, and writes
`tools/ios/hymnal.html` (git-ignored; ~6.5 MB). Send that file to the phone (AirDrop / iCloud Drive) and open it in Files/Safari.

- `template.html` - the page (HTML/CSS/JS). `build.py` fills in the data and book list.
- New language: add it to `HymnGroup.java`. Only if hymnal.net has its own collection for it, add it to `OWN` in `build.py`.
