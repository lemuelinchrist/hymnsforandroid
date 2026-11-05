# YouTube channel monitor

`check_channel.py` compares the NYCYPCD channel (the recordings linked to hymns) with what the hymnal has accounted for,
so a new album or a missed song shows up. It lists the channel with `yt-dlp --flat-playlist` (one request; install
`yt-dlp` in a venv, it is not installed system-wide) and reads `NycypcdYoutube.txt` (matched to a hymn) and
`nycypcd_known.tsv` (songs not in the database, unavailable videos, non-songs).

    python3 tools/youtube-monitor/check_channel.py --releases --ytdlp /path/to/venv/bin/yt-dlp

`--releases` also lists the Releases tab (albums in many languages, audio-only uploads that are not in the Videos tab) and
caches its tracks in `nycypcd_releases.tsv`; without it only the Videos tab is checked. A third column in
`NycypcdYoutube.txt` is the label of that link instead of NYCYPCD. Statuses in `nycypcd_known.tsv`: `not-in-database`,
`unavailable`, `duplicate` (hymn already had a link), `other-language`, `not-a-song`.

Exit 0 = all accounted for, 1 = new videos listed, 2 = channel not listable. New videos go through the
`match-youtube-songs` skill; after the review add them to `NycypcdYoutube.txt` or `nycypcd_known.tsv`.
