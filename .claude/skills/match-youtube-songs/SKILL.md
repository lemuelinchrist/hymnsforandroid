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
5 of 5 songs matched at high confidence with `gemini-3.8-flash-low`, 16-80 s and 30-50k tokens each. The full run of the Videos tab was done 2026-11-04 (245 links imported); the Releases tab was added 2026-11-05 (see "Syncing the NYCYPCD channel").

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
   he ticks one (keys 1-3), types another hymn id or lyric words, or marks it *not in our database* (N, with a note: the
   song to add later, keep these in the report), *video unavailable* (U, nothing to do), *not English* (E, for a later language) or skip (S); progress saves in
   his browser; **Export** gives a TSV (`Video, Title, Your hymn, Status, Note`) to paste back, then import the
   `hymn` rows as in step 7 and document the not-in-database ones. Not an artifact: artifact pages
   cannot embed YouTube. Lemuel found it much easier than the CSV (2026-11-04).
7. **Import** (after his OK; done for NYCYPCD 2026-11-04: `ImportNycypcdYoutube.groovy` reads `NycypcdYoutube.txt`, `hymn id TAB video id`, label NYCYPCD, Gradle `runImportNycypcdYoutube`; copy it for the next channel): a Groovy script in `databaseProvisioner` (like `YoutubePiano`) that saves `LinkEntity`
   rows with `dao.saveLink(hymnId, "youtube", url, order)`, label = album or channel name if wanted; then the usual run
   in one Gradle call (`:sqlite:exportSql`), docs, and the emulator check.

## Syncing the NYCYPCD channel (new albums, missed songs)

`tools/youtube-monitor/check_channel.py` compares the channel with everything the hymnal has accounted for and lists
what is new. Run it whenever you want to know whether NYCYPCD released something (an always-on agent could run it weekly):

    python3 -I tools/youtube-monitor/check_channel.py --releases --ytdlp <venv>/bin/yt-dlp

- **Two places hold the channel's songs.** The **Videos tab** (267 videos, full videos) and the **Releases tab** (57 albums,
  481 tracks, in many languages: English, Spanish, Portuguese, French, Czech/Slovak, Russian). The Releases tracks are
  auto-generated "Release - Topic" audio uploads, **not** in the Videos tab, with **no captions and no language field**:
  matching them is by title only (a track titled like a hymn's first or chorus line; some titles carry the hymn number,
  e.g. "(Hino 1229)", "Himnos 383"). Without `--releases` the script checks the Videos tab only (one request).
- **The RSS feed does not work** (404). The script uses `yt-dlp --flat-playlist` on the `/videos` and `/releases` tabs;
  `--releases` lists each album with a 4 s pause and caches the tracks in `tools/youtube-monitor/nycypcd_releases.tsv`
  (resumable; delete it to refresh).
- **What counts as accounted for** (the script prints the rest as NEW, exit code 1): the video ids in
  `databaseProvisioner/src/main/resources/NycypcdYoutube.txt` (`hymn id TAB video id`, matched; a third column is the
  link's own label instead of NYCYPCD, e.g. `NS10052  oRP-lXV_b9o  Howard Higashi`, the composer's own recording) and
  those in `tools/youtube-monitor/nycypcd_known.tsv` with a status: `not-in-database` (song to add to the hymnal later),
  `unavailable`, `duplicate` (dropped because its hymn already had a link, kept here so it is never reviewed again),
  `other-language` (skipped until that language is added), `pending-translation` (a recording in another language whose
  title matches a translated hymn exactly: listed in `nycypcd_pending_translations.tsv`, not imported until the translators have
  checked it), `not-a-song`.
- **Official channel**: checked 2026-11-05: nycypcd.org links to `youtube.com/user/nycypcd`, which is channel
  `UC_1giUVT14MRXyEFtQZgmKQ` (@NYCYPCD), whose videos point back to nycypcd.org ("Buy the CD").

### Steps for a sync
1. Run the checker (above). New videos or tracks are printed with title and (for tracks) album.
2. Match the new ones. For titles: `python3 -I tools/youtube-monitor/match_titles.py new.json out.tsv` (`new.json` from the checker's
   `--json`): exact title + one hymn = `import` (no link yet) or `duplicate` (the hymn already has one); everything else is `review`.
   A recording in another language goes on the **translated hymn itself** (S432, POR432...), not on its English parent, and is held
   in `nycypcd_pending_translations.tsv` until the translators have checked it. Older notes: Videos with captions: steps 3-5 of this skill. Releases tracks (no captions): by title against the first
   stanza and chorus lines of all hymns (a scratch script; exact title = high, prefix = review), collapsing a hymn and its
   New Tune copy to the root hymn (`parent_hymn`). Non-English tracks can match hymns of that language's group, or its English
   parent through the hymn number in the title.
3. Review page (step 6b) for everything that is not an exact match. **Build it from a new work folder**; the page keeps
   answers in the browser per video list (since 2026-11-05; before, one fixed key made a new list crash with an empty page
   when an old position was saved). Lemuel reads **Export** (or the answers can be read from the page's `ans`, `notes` and `ROWS`
   variables with the Chrome tool, from a new tab group: the earlier session's tabs are invisible).
4. Apply his answers:
   - a hymn that **has no NYCYPCD link yet**: add `hymn id TAB video id` to `NycypcdYoutube.txt`; several videos for one hymn
     are fine (order 1, 2, ...), give a recording by someone else its own label in a third column;
   - a hymn that **already has a link**: drop the new one and record the video id in `nycypcd_known.tsv` as `duplicate`, so
     the next sync does not ask again (unless Lemuel says to keep both, as for the composer's own recording);
   - *not in our database* -> `not-in-database` (note the song to add later); *unavailable* -> `unavailable`; skipped ones
     (other language) -> `other-language`.
5. Import and export in one Gradle call from WSL: `JAVA_HOME=/home/lemue/.jdk ./gradlew :databaseProvisioner:runImportNycypcdYoutube :sqlite:exportSql`
   (about 2 minutes; the import resets the database from `hymns.sql` first and deletes the NYCYPCD rows, so it is re-runnable).
   Check `select count(*) from link where kind='youtube' and label='NYCYPCD'` and `pragma integrity_check`, run the checker
   again (the new ones must be gone from NEW) and commit `NycypcdYoutube.txt`, `nycypcd_known.tsv` and `sqlite/hymns.sql`.
6. In the app the hymn page's "LISTEN AND LINKS" card shows each link by its label; two links with the same label read
   "NYCYPCD ↗ · NYCYPCD ↗", so give a second recording a distinct label.

Status 2026-11-08: NYCYPCD has 371 links (the monitor lists what is still NEW); `recordings.tsv` shows what is linked, known or unmatched on every channel.

## "- Topic" channels (LSM, 臺灣福音書房)

A publisher's "- Topic" channel (auto-generated music) has no Videos/Releases/Playlists tab for yt-dlp. List its albums
with `python3 -I tools/youtube-monitor/topic_albums.py <channel id>`, then each album with `yt-dlp --flat-playlist`.
Tracks have no captions: match by title. Links go in `NycypcdYoutube.txt` with the label in the third column; what is
accounted for but not linked goes in `tools/youtube-monitor/<channel>_known.tsv`.

- **LSM** (Living Stream Ministry - Topic, UCrr3HofwiRkJBR-WgUixRlQ), English: 193 links, label `LSM` (2026-11-07), `lsm_known.tsv`.
- **臺灣福音書房** (Taiwan Gospel Book Room - Topic, UCYE5AHiolvE8tj-LYgPuzig, some albums under UCZolsL-QScygLdBTc36TbUQ),
  Chinese, 70 albums: 293 sung links (labels `臺灣福音書房`, `臺灣福音書房 2`) and 103 instrumental (`臺灣福音書房 (Instrumental)`)
  on C/CS hymns (2026-11-07), `tgb_known.tsv`; 9 more on 2026-11-08 (405 in all, see the official channel below). Lessons: many titles are Simplified Chinese (convert with OpenCC `s2t` before comparing
  with the Traditional C/CS lines) and many carry the number, `（诗歌227）` = C227, `（补充本839）` = CS839 (reliable even when
  the title is a subject, not the first line). 讚美詩集 / Hymns of Praise is an instrumental series: label it. Children's series (兒童教材詩歌集, 兒童詩歌, 性格的培養詩歌集) are left out: the songs are
  simplified for children. Limit per Chinese hymn (Lemuel 2026-11-07): at most 2 sung recordings + 1 instrumental; a second sung one gets its own label so the links card does not show the same label twice. The official channel 臺灣福音書房
  (UCW4K7RJzb3bhrBgbhT2OBLA) is mostly messages and training videos (615 videos). Done 2026-11-08: the 5 plain hymn videos with the number
  in the title are linked (label `臺灣福音書房`); 4 of the 12 "唱詩人選輯" tracks (the hymn's title is inside the hymn, not its first line)
  were confirmed by ear and linked, 8 were rejected; the 39 kids' action-song videos of regular hymns are NOT linked (children sing them)
  but saved in `tools/youtube-monitor/tgb_kids_series.tsv` for later.
- **Loving the Lord - Topic** (UCF0V197WENYJAGHzYRFbUog), English, 11 albums, 265 tracks: 139 links, label `Loving the Lord` (`... 2` for a second
  sung one, `(Instrumental)`), 2026-11-08, from titles with the number ("(Hymn 1151)", "Hymns 251", "- Hymn 166") and exact first lines;
  71 uncertain titles went to a review page (answers still to be read). YouTube's metadata says "℗ Loving the Lord"; the 7 of its 11 albums that
  the Joseph's Storehouses channel (@JosephsStorehouses, 994 videos, 63 playlists, some are conference messages) lists as "... (by Hymn CDs)"
  are marked with the studio Hymn CDs in `recordings.tsv` (no official Hymn CDs channel found). Not yet looked at: Joseph's Storehouses itself and
  the **NYCYPCD English** channel (@nycypcd-english, UCcS0QoAJh3PucoYLQXJG2bg, 280 videos titled like "Drink! A River - H 1151", "... - NS 868").
- **Melody of Lilies** (@MelodyofLilies; Releases tab 23 albums + 11 playlists + 50 videos, 86 unique tracks; mostly the group's own songs, not hymnal hymns), English, a
  popular Recovery producer: 17 links, label `Melody of Lilies` (2026-11-08): 6 exact titles + 11 confirmed by ear; the other ~50 titles matched no hymn (`melodyoflilies_known.tsv`, `recordings.tsv`).
- **Joseph's Storehouses** (@JosephsStorehouses, 994 videos in 63 playlists, 2026-11-08): saints' groups and CDs, not an official publisher (the playlists name the
  group: "(by Boston, Cambridge, Newton)", "(by ATX YP)"...; 7 are the Hymn CDs albums, the same recordings as Loving the Lord, so not linked twice) plus
  messages and kids' songs (left out). 211 links, label `Joseph's Storehouses` (`2`, `(Instrumental)`) from exact titles (max 2 sung + 1 instrumental per hymn).
  Still open: 301 videos with only a partial title match, which Lemuel wants to try by downloading and transcribing the lyrics (to be discussed); 436 match nothing.
- **Rules that held for the Topic channels**: a number in the title (`Hymn N`, `Hymns N`, `诗歌N`) is reliable; a track titled "- New Tune" belongs to
  the New Tune hymn (e.g. BF345), never to the root hymn, so it is not linked to the root; an instrumental track gets the label `<name> (Instrumental)`
  (max 1 per hymn); sung ones max 2 per hymn per channel; English hymns may carry links from several channels (NYCYPCD + LSM + others).
  Re-provisioning drops the links: run `runImportNycypcdYoutube` after it. The import renumbers the link row ids, so the raw diff of `sqlite/hymns.sql`
  is huge; check the real one with `grep '^INSERT INTO link ' sqlite/hymns.sql | sed -E "s/^INSERT INTO link VALUES\([0-9]+,//" | sort` against the old file.
- **Keep the source of every recording** (Lemuel 2026-11-08): `tools/youtube-monitor/recordings.tsv` has album, channel and publisher of every track, linked or not, so unlinked songs can be linked when their hymn arrives. Add a new channel's rows when importing it (`python3 -I tools/youtube-monitor/build_recordings.py --tracks ...`, see its docstring; without arguments it refreshes the statuses).
- Review pages for another language: `REVIEW_GROUPS=C,CS python3 scripts/build_review.py ...` so that typing a C/CS id
  under "Another hymn" finds it.

## Matching by transcribed lyrics (no captions, partial titles)

For videos whose title matches a hymn only in part (or not at all) and that have no usable captions, transcribe the audio instead (Lemuel, 2026-11-08):
`tools/audio-transcribe/batch_lyrics.py <work>` (audio files in `<work>/in/`, the file stem is the video id: ffmpeg, Demucs vocals stem, Whisper turbo on the GPU,
seconds per song) then `match_lyrics.py <work>/lyrics` (share of the song's word pairs found in each hymn's lyrics). Accept a match automatically when the top hymn scores
0.5+ AND leads the second by 0.2+ (and, when the title named candidates, is one of them); everything else goes to a review page; below 0.25 with no title candidate
is probably not in the hymnal. Hold back titles with "New Tune" / "Alternate Tune" (a different tune than the hymn's page). On the first run 41 of 55 local songs and
25 of 40 downloaded songs were accepted automatically.
- **Audio without YouTube**: Lemuel's own collection (`G:\My Drive\Archives\Hymns`, ~2,800 ogg files in album folders; not mounted in WSL, read it with
  `powershell.exe`). Use a local file only when the album folder has the same name as the YouTube playlist AND the track title equals the video title; the same title in
  another album is NOT used (a different recording).
- **Downloading audio from YouTube without being blocked**: the lowest-quality audio only (`-f worstaudio`, 1-2 MB), ONE process, a random 30-90 s pause, `timeout 120`,
  stop (or sleep an hour) after 4 failures in a row, resume by skipping files that exist. About 1 song per minute worked without a single error. For hundreds of songs
  hand it to the always-on `media` host (brief `~/joseph/TASK.md`, script `~/joseph/dl.sh`; skill media-resident-agent-setup) and `rsync` the files back.
- Do not `pkill -f` a pattern that occurs in your own command line (it kills your shell, exit 144).

## Traps
- Titles are song names, not hymn numbers; several hymns share a first line (a hymn and its Be Filled / New Songs copy):
  collapse to the root hymn (`parent_hymn`) before counting candidates.
- Auto-captions of singing are noisy; the group repeats choruses and reorders stanzas. Matching is by words, not by tune.
- The channel's description lists albums and years (`yt-dlp --skip-download --print description <url>`), useful for labels.
