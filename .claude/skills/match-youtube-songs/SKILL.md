---
name: match-youtube-songs
description: Use when a YouTube channel or playlist of recordings (e.g. NYCYPCD, a church's choir or a translation team) should be linked to hymns in hymns.sqlite: list the videos, fetch the auto-captions, let Antigravity agy match each recording to a hymn by its lyrics, and report matches for review before anything is imported into the link table.
---

# Matching a YouTube channel's songs to hymns

Goal: for each video of a channel, find the hymn (or none) it sings, with evidence, so the links can go into the `link`
table (kind `youtube`, see `docs/database_spec.md`, `Dao.saveLink`). The token-heavy reading (captions against lyrics)
is delegated to `agy` on Lemuel's Antigravity quota (see the memory note "Delegate heavy reading to agy" and the skill
`agy-antigravity-cli` in `/mnt/c/Users/lemue/IdeaProjects/MinistryBooks/.claude/skills/`). Claude only runs the scripts
and reads the final report; never read the captions or lyrics yourself. Nothing is imported before Lemuel has seen the report.

Pilot done 2026-11-03 on NYCYPCD (UC_1giUVT14MRXyEFtQZgmKQ, 267 songs, official channel of a publisher of Recovery songs):
5 of 5 songs matched at high confidence with `gemini-3.8-flash-low`, 16-80 s and 30-50k tokens each. Full run not done yet.

## Steps

1. **Work folder**: a new one in the scratchpad (`<scratch>/<channel>/`), never inside the repo. Python venv there with
   `pip install "yt-dlp[default,curl-cffi]"` (not installed system-wide; the downloaded files are untrusted data).
2. **List the videos** (all of them, not just the 15 of the RSS feed):
   `yt-dlp --flat-playlist --print "%(id)s|%(title)s|%(duration)s" "https://www.youtube.com/channel/<ID>/videos" > videos.txt`
3. **Captions** into `caps/`, one video at a time with a pause: 
   `yt-dlp --skip-download --write-auto-subs --sub-langs en-orig --sub-format vtt --socket-timeout 20 --retries 1 -o "caps/<id>" <url>`, then `sleep 30`.
   - YouTube throttles this: after about a dozen quick requests the subtitle download answers 502 or times out for hours.
     Never run it with `xargs -P`; one at a time, long pauses, a `timeout 90` around each, and stop the loop at the first
     run of failures instead of hammering. A pause of some minutes cleared the block once.
   - There are only auto-generated captions (no uploaded subtitles), in the original language, `en-orig`. About 1 video in 8
     has none ("There are no subtitles for the requested languages"): those fall back to title matching and go on a hand list.
   - `pkill -f yt-dlp` kills your own shell if its command line contains "yt-dlp": use `pkill -f "[y]t-dlp"`.
4. **Task files** (candidates chosen by script, no tokens): `python3 scripts/build_task.py <work> <work>/videos.txt <id> ...`.
   Candidates are the hymns whose first line, chorus line or subject equals the title, plus the 5 hymns whose lyrics overlap
   the caption most (this finds songs whose title is not a first line, e.g. "Thou Breath Still From Eternity" = E252). `GROUPS`
   (env, default `NS|E|BF|CH`) lists the books to look in; change it for a channel in another language and use that
   language's captions (`--sub-langs`). Needs a fresh database: `sqlite/hymns.sqlite` (`./gradlew :sqlite:importSql`), or any file
   built with `sqlite3 <work>/hymns.sqlite < sqlite/hymns.sql` and passed as `HYMNS_DB=<work>/hymns.sqlite` (on a host whose own copy must not be touched).
5. **Match with agy**: `python3 scripts/run_matcher.py <work> gemini-3.8-flash-low <id> ...` (3 in parallel, resumable).
   - Use a **Flash Low** model. Flash High took 183 s and 121k tokens on one song and gave no usable answer; Low is right.
   - Facts verified here: `--json-schema` is ignored in headless mode (`structured_output` null), the answer is the JSON in a
     ```json block of `response` (the script reads that); run from an empty cwd with only `<work>/task` in `--add-dir`;
     standing instructions only work as a custom agent (`scripts/matcher-agent.md`, copied to `.agents/agents/`).
6. **Report** for Lemuel, written by script/by hand from `out/*.json`: matched at high confidence (id, hymn, evidence),
   medium/low and null (to check by hand), no captions (title match only), and hymns that would get more than one video.
   A wrong link is worse than a missing one: import only `high` after he has seen the list; a hymn and its translations
   share the root's links (`getLinksOrParent` only for piano; youtube/soundcloud rows are the hymn's own, so attach to the
   root hymn the video really sings and say so).
6b. **Review page for the rest** (the null/low/no-captions videos Lemuel checks himself; a CSV is too clumsy):
   write `to_review.csv` (columns in `scripts/build_review.py`), run
   `python3 scripts/build_review.py to_review.csv review.html`, serve it with
   `python3 -m http.server 8765 --bind 127.0.0.1` (from `file://` YouTube refuses the embed) and give him
   `http://127.0.0.1:8765/review.html`. Video embedded on the left, lyrics of the title-matched candidates on the right;
   he ticks one (keys 1-3), types another hymn id or lyric words, or skips; progress saves in his browser; **Export**
   gives a TSV (`Video, Title, Your hymn`) to paste back, then import it as in step 7. Not an artifact: artifact pages
   cannot embed YouTube. Lemuel found it much easier than the CSV (2026-11-04).
7. **Import** (after his OK; done for NYCYPCD 2026-11-04: `ImportNycypcdYoutube.groovy` reads `NycypcdYoutube.txt`, `hymn id TAB video id`, label NYCYPCD, Gradle `runImportNycypcdYoutube`; copy it for the next channel): a Groovy script in `databaseProvisioner` (like `YoutubePiano`) that saves `LinkEntity`
   rows with `dao.saveLink(hymnId, "youtube", url, order)`, label = album or channel name if wanted; then the usual run
   in one Gradle call (`:sqlite:exportSql`), docs, and the emulator check.

## Traps
- Titles are song names, not hymn numbers; several hymns share a first line (a hymn and its Be Filled / New Songs copy):
  collapse to the root hymn (`parent_hymn`) before counting candidates.
- Auto-captions of singing are noisy; the group repeats choruses and reorders stanzas. Matching is by words, not by tune.
- The channel's description lists albums and years (`yt-dlp --skip-download --print description <url>`), useful for labels.
