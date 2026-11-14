# YouTube channel monitor

`check_channel.py` compares the NYCYPCD channel (the recordings linked to hymns) with what the hymnal has accounted for,
so a new album or a missed song shows up. It lists the channel with `yt-dlp --flat-playlist` (one request; install
`yt-dlp` in a venv, it is not installed system-wide) and reads `NycypcdYoutube.txt` (matched to a hymn) and
`nycypcd_known.tsv` (songs not in the database, unavailable videos, non-songs).

    python3 tools/youtube-monitor/check_channel.py --releases --ytdlp /path/to/venv/bin/yt-dlp

`--releases` also lists the Releases tab (albums in many languages, audio-only uploads that are not in the Videos tab) and
caches its tracks in `nycypcd_releases.tsv`; without it only the Videos tab is checked. `NycypcdYoutube.txt` has, per line, `hymn`, `video`, `publisher`, `album`, `instrumental` (the card shows the publisher, else the album, never the channel;
`link_meta.py` fills the columns from `recordings.tsv` and drops a recording of the same title in the same album twice). Statuses in `nycypcd_known.tsv`: `not-in-database`,
`unavailable`, `duplicate` (hymn already had a link), `other-language`, `pending-translation` (see `nycypcd_pending_translations.tsv`), `not-a-song`.
`match_titles.py` matches the NEW ones to hymns by title (see its header).

Exit 0 = all accounted for, 1 = new videos listed, 2 = channel not listable. New videos go through the
`match-youtube-songs` skill; after the review add them to `NycypcdYoutube.txt` or `nycypcd_known.tsv`.

To check **all 8 monitored channels** (NYCYPCD, the three `- Topic` channels, Joseph's Storehouses, Melody of Lilies, 臺灣福音書房 official, and HymnsForAndroid; excluding Hymn Singing):

    ~/.venvs/hymns-yt/bin/python tools/youtube-monitor/check_all_channels.py [--channel <key>] [--json out.json]

## recordings.tsv: where every recording came from

`recordings.tsv` has one row per track or video of the channels we looked at (2,082 rows, 2026-11-08): video id, status
(`linked`, a status of the `*_known.tsv` files, `kids-series`, or `unmatched`), the hymns it is linked to, the link label,
the album or playlist (name and id), the YouTube channel, the publisher or studio (blank when unknown), the title and a note.
It also lists the tracks that are NOT linked, including songs not in the hymnal yet, so that they can be linked when the hymn
arrives. The database keeps the publisher (`label`), the album and the instrumental flag; this file is the record of the source (the channel). When a new channel or album is imported,
add its rows here with `build_recordings.py` (the album names come from `topic_albums.py` and `yt-dlp --flat-playlist`, or the Releases tab for NYCYPCD).
Loving the Lord - Topic: the albums that Joseph's Storehouses lists as "(by Hymn CDs)" are marked with the studio Hymn CDs.

## Updating HymnsForAndroid descriptions and titles

`update_descriptions.py` updates the title (`<title> - <ID>`) and description (web app link, sheet music note when `app/src/main/assets/sheetMei/<ID>.mei` exists, and lyrics from `hymns.sqlite`) of `HymnsForAndroid` videos in `recordings.tsv` via the YouTube Data API v3. See the `match-youtube-songs` skill for credentials, venv setup, and usage (`--video <ID> --show`, `--apply`).
