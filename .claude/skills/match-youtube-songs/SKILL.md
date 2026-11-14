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

**Before proposing any next source, read the current version's report ("Hymns For Android vX.Y Report", Claude Docs) and `recordings.tsv`: the lists in this file go stale.**

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
   **If it stops with `UNIQUE constraint failed: link.id`**, a link row was added by hand without moving the `link` counter:
   see "rows added by hand need the `SEQUENCE` counters moved too" in the `hymn-provisioning` skill (set `SEQ_COUNT` to `max(id)`
   in `sqlite/hymns.sql`, then run again; the import rebuilds the database from `hymns.sql` first, so a fix only in the app's
   `hymns.sqlite` is lost). **Any link you insert yourself** (a SoundCloud link, a one-off video) takes `SEQ_COUNT + 1` as its id
   and then sets `SEQ_COUNT` to it, in the same step, before `:sqlite:exportSql`.
   Check `select count(*) from link where kind='youtube' and label='NYCYPCD'` and `pragma integrity_check`, run the checker
   again (the new ones must be gone from NEW) and commit `NycypcdYoutube.txt`, `nycypcd_known.tsv` and `sqlite/hymns.sql`.
6. In the app the hymn page's "LISTEN AND LINKS" card shows each link by its label; two links with the same label read
   "NYCYPCD ↗ · NYCYPCD ↗", so give a second recording a distinct label.

Status 2026-11-08: NYCYPCD has 371 links (the monitor lists what is still NEW); `recordings.tsv` shows what is linked, known or unmatched on every channel.

### Checking all monitored channels (except Hymn Singing)

`tools/youtube-monitor/check_all_channels.py` checks all 8 monitored channels (`nycypcd`, `lsm`, `tgb-topic`, `loving-the-lord`, `josephs`, `melody-of-lilies`, `tgb-official`, `hymnsforandroid`; **Hymn Singing** is excluded):

    ~/.venvs/hymns-yt/bin/python tools/youtube-monitor/check_all_channels.py [--channel <key>] [--json out.json]

- Regular channels are listed with `yt-dlp --flat-playlist` (`/videos`, plus `/releases` / `/playlists` where configured); `- Topic` channels use `topic_albums.py` + `yt-dlp`, skipping immutable `OLAK5uy_` albums already in `recordings.tsv` (pass `--refresh-albums` to re-list them).
- Accounted-for IDs come from `NycypcdYoutube.txt`, each channel's `*_known.tsv` / `tgb_kids_series.tsv`, and `recordings.tsv` (so previously-seen `unmatched` videos are not re-reported; pass `--no-recordings` to include them). Exit 0 = no new videos, 1 = new videos found, 2 = listing error. Use `--list` to see the channel keys.

### Checking all monitored channels (except Hymn Singing)

`tools/youtube-monitor/check_all_channels.py` checks all 8 monitored channels (`nycypcd`, `lsm`, `tgb-topic`, `loving-the-lord`, `josephs`, `melody-of-lilies`, `tgb-official`, `hymnsforandroid`; **Hymn Singing** is excluded):

    ~/.venvs/hymns-yt/bin/python tools/youtube-monitor/check_all_channels.py [--channel <key>] [--json out.json]

- Regular channels are listed with `yt-dlp --flat-playlist` (`/videos`, plus `/releases` / `/playlists` where configured); `- Topic` channels use `topic_albums.py` + `yt-dlp`, skipping immutable `OLAK5uy_` albums already in `recordings.tsv` (pass `--refresh-albums` to re-list them).
- Accounted-for IDs come from `NycypcdYoutube.txt`, each channel's `*_known.tsv` / `tgb_kids_series.tsv`, and `recordings.tsv` (so previously-seen `unmatched` videos are not re-reported; pass `--no-recordings` to include them). Exit 0 = no new videos, 1 = new videos found, 2 = listing error. Use `--list` to see the channel keys.

## SoundCloud links

Both apps show `soundcloud` link rows (a SoundCloud icon and the label, in the same "Listen and links" card as YouTube; the
Android app and the web app open the link outside the app). There is no import tool for them yet (the youth books' rows were
written by their provisioners through `Dao.saveLink`): insert a row `kind='soundcloud'` with the id rule above (`SEQ_COUNT + 1`,
then move the counter), `label` = the publisher, `album` if known, and `n_order` after the hymn's other recordings.

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
  71 uncertain titles went to a review page (reviewed; only the 4 albums Joseph's Storehouses does not have). YouTube's metadata says "℗ Loving the Lord"; the 7 of its 11 albums that
  the Joseph's Storehouses channel (@JosephsStorehouses, 994 videos, 63 playlists, some are conference messages) lists as "... (by Hymn CDs)"
  are marked with the studio Hymn CDs in `recordings.tsv` (no official Hymn CDs channel found). The **NYCYPCD English** channel (@nycypcd-english, UCcS0QoAJh3PucoYLQXJG2bg, 280 videos titled like "Drink! A River - H 1151") was checked 2026-11-08 and
  DROPPED: 227 of its 280 titles are tracks we already have. Do not offer it again.
- **Melody of Lilies** (@MelodyofLilies; Releases tab 23 albums + 11 playlists + 50 videos, 86 unique tracks; mostly the group's own songs, not hymnal hymns), English, a
  popular Recovery producer: 17 links, label `Melody of Lilies` (2026-11-08): 6 exact titles + 11 confirmed by ear; the other ~50 titles matched no hymn (`melodyoflilies_known.tsv`, `recordings.tsv`).
- **Hymn Singing** (@hymnsingingLR, UCk5QAUglOYFgfm07VLj5ysQ; 220 videos; playlists Hymns, New Song, Be Filled, New Tune, Tagalog Hymns, Tour of a Lifetime): saints' groups singing
  in meetings (the quality varies; Lemuel judged only the playlist **Hymns**, PL1twdZLXinrqYc3oNlygRE_4A5NEgsZAK, good enough). 38 links, label `Hymn Singing`, album `Hymns` (2026-11-12): the hymns of that playlist
  that had no recording (28 with only a piano video, 10 with no link at all; one video per hymn), from the number and first line in the titles. The playlist videos have **no captions**
  (not even automatic ones), so the caption check cannot run; the other playlists have captions and a subject title ("NS 750 - Pathway of Life"): 19 were confirmed by agy, then dropped
  as Lemuel scoped the run to the Hymns playlist. A title's number can be wrong (NS 697 is NS897, NS 378 is E378). `hymnsinging_known.tsv` holds the two duplicate videos. "No links" means no sung recording: a piano video alone does not count.
- **Joseph's Storehouses** (@JosephsStorehouses, 994 videos in 63 playlists, 2026-11-08): saints' groups and CDs, not an official publisher (the playlists name the
  group: "(by Boston, Cambridge, Newton)", "(by ATX YP)"...; 7 are the Hymn CDs albums, the same recordings as Loving the Lord, so not linked twice) plus
  messages and kids' songs (left out). 211 links, label `Joseph's Storehouses` (`2`, `(Instrumental)`) from exact titles (max 2 sung + 1 instrumental per hymn).
  The 301 partial-title videos were transcribed and matched 2026-11-08/09 (about 324 links in all, 113 more in v5.9.4). Only 29 poor transcriptions (mostly instrumentals) and ~300 videos with no title match and no local copy remain, nothing planned.
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
- **Albums that are not online at all** (2026-11-10): Lemuel uploads them to his own channel (HymnsForAndroid). Make one video per track (a still card
  with the album title, Joseph's Storehouses style: 1920x1080, ffmpeg `-loop 1 -i card.png -i track.ogg -tune stillimage -shortest`), he uploads them,
  then in Studio each gets its title (no track number), the album playlist, "not made for kids" and Public. Link with the publisher = the group
  (e.g. `Irvine YP`) and album = the album name, in `NycypcdYoutube.txt` and `recordings.tsv` (channel `HymnsForAndroid`). First: "Strength For the Day -
  Irvine YP July 1999", 13 links. YouTube allows only a few uploads a day until the channel's identity is verified.
  - Each album gets its **own card colour** (Lemuel 2026-11-10), so the playlists look different. White Georgia Italic title on a coloured
    1080x1080 square centred on black. The output files carry **no track-number prefix** (he wants the file name to be the YouTube title); keep the
    album order from the original files, which still have their numbers, when filling a playlist.
  - The YouTube Data API is not used for uploads: videos uploaded through an unaudited API project stay private, and the default quota allows about
    6 uploads a day. Uploading in Studio (up to 15 files at once) is the way.
  - Recordings by saints may sing a **New Tune**: never link to the E hymn without asking. Hymn numbers in the old file names can be wrong
    (one "Hast thou heard Him" track said H556; it is E437, and 556 is "Thy name is sweet"): check every number against the lyrics.
  - Songs with no title match: transcribe the local copy with Whisper (the audio-transcription skill's venv, with its `bin/` on `PATH`, because Whisper calls `ffmpeg`)
    and search the stanzas for a distinctive line.
- **Which hymn id to propose** (Lemuel 2026-11-10): New Songs are the parents of the BF (Be Filled) songs, so a BF song whose `parent_hymn` is an NS
  song is linked to the **NS** id (NS232, not BF339). Propose BF only when the BF song has no NS parent (BF153, BF154) or when it is a New Tune of an
  E hymn (BF152 under E437). Look up `parent_hymn` of every BF candidate before proposing.
- **The Something New albums sing New Tunes only** (Lemuel 2026-11-10): link a hymn track to its BF New Tune; when the E hymn has none yet,
  create one (a `hymns` row: `hymn_group` BF, `parent_hymn` = the E hymn, `new_tune` = 1, first line copied, words inherited; add the BF id to the
  E hymn's `related`). A song not in the hymnal at all becomes a BF song with no parent and its own stanzas (words from the transcription, checked
  by Lemuel). New BF numbers fill the free numbers above 435 first (left by removed duplicates), lowest first; BF385-400 is left alone.
  Edit `app/src/main/assets/hymns.sqlite`, run `:sqlite:exportSql` **before** `runImportNycypcdYoutube` (it starts with `importSql`, which rebuilds
  the database from `hymns.sql` and drops unexported edits).
- **Downloading audio from YouTube without being blocked**: the lowest-quality audio only (`-f worstaudio`, 1-2 MB), ONE process, a random 30-90 s pause, `timeout 120`,
  stop (or sleep an hour) after 4 failures in a row, resume by skipping files that exist. About 1 song per minute worked without a single error. For hundreds of songs
  hand it to the always-on `media` host (brief `~/joseph/TASK.md`, script `~/joseph/dl.sh`; skill media-resident-agent-setup) and `rsync` the files back.
- Do not `pkill -f` a pattern that occurs in your own command line (it kills your shell, exit 144).

## Updating HymnsForAndroid video titles & descriptions

Once all lyrics are in `app/src/main/assets/hymns.sqlite`, `tools/youtube-monitor/update_descriptions.py` updates the title and description of every `HymnsForAndroid` video in `recordings.tsv`:

- **Environment & credentials** (kept outside the repo, `chmod 600`):
  - Python venv: `~/.venvs/hymns-yt` (`google-api-python-client`, `google-auth-oauthlib`).
  - OAuth Desktop client JSON: `~/.config/hymnsforandroid/client_secret.json` (Google Cloud project `HymnsForAndroid-YouTube`, YouTube Data API v3 enabled, app in Testing mode with the channel owner's email under Test users).
  - Cached OAuth token: `~/.config/hymnsforandroid/youtube_token.json` (scope `youtube.force-ssl`). If re-auth is needed from WSL, `run_local_server(port=0)` prints the `accounts.google.com` URL to open in Windows Chrome.
- **Format**:
  - **Title**: appends ` - <ID>` (e.g., `Strength for the Day - BF169`) unless the title already ends with `<ID>` (checked against YouTube's 100-char limit).
  - **Description** (overwrites existing):
    - First line: `<ID> Hymn & Sheet Music: https://lemuelinchrist.github.io/hymnsforandroid/#/h/<ID>` if `app/src/main/assets/sheetMei/<ID>.mei` exists, else `<ID> Hymn: https://lemuelinchrist.github.io/hymnsforandroid/#/h/<ID>`.
    - Stanzas from `hymns.sqlite` (falling back through `parent_hymn`, `<br/>` -> newline, `chorus` -> `Chorus`, omitting labels for `-`/`beginning-note`/`end-note`/`verse`).
    - Footer: `---` and `Hymns For Android Web App: https://lemuelinchrist.github.io/hymnsforandroid/`.
- **Commands**:
  - Dry run: `~/.venvs/hymns-yt/bin/python tools/youtube-monitor/update_descriptions.py --video <VIDEO_ID> --show`
  - Single-video test: `~/.venvs/hymns-yt/bin/python tools/youtube-monitor/update_descriptions.py --video <VIDEO_ID> --apply`
  - Full run: `~/.venvs/hymns-yt/bin/python tools/youtube-monitor/update_descriptions.py --apply`
- **Quota & safety**: `videos.list` is batched (50 IDs/call), unchanged videos (matching title and description) are skipped, and existing `categoryId`, `tags`, `defaultLanguage`, and `defaultAudioLanguage` are preserved. Each `videos.update` costs 50 quota units (default 10,000/day, so ~146 videos fit in one day). Tested 2026-11-14 on `hwvmdDKP9q4` (`BF169`).

## Updating HymnsForAndroid video titles & descriptions

Once all lyrics are in `app/src/main/assets/hymns.sqlite`, `tools/youtube-monitor/update_descriptions.py` updates the title and description of every `HymnsForAndroid` video in `recordings.tsv`:

- **Environment & credentials** (kept outside the repo, `chmod 600`):
  - Python venv: `~/.venvs/hymns-yt` (`google-api-python-client`, `google-auth-oauthlib`).
  - OAuth Desktop client JSON: `~/.config/hymnsforandroid/client_secret.json` (Google Cloud project `HymnsForAndroid-YouTube`, YouTube Data API v3 enabled, app in Testing mode with the channel owner's email under Test users).
  - Cached OAuth token: `~/.config/hymnsforandroid/youtube_token.json` (scope `youtube.force-ssl`). If re-auth is needed from WSL, `run_local_server(port=0)` prints the `accounts.google.com` URL to open in Windows Chrome.
- **Format**:
  - **Title**: appends ` - <ID>` (e.g., `Strength for the Day - BF169`) unless the title already ends with `<ID>` (checked against YouTube's 100-char limit).
  - **Description** (overwrites existing):
    - First line: `<ID> Hymn & Sheet Music: https://lemuelinchrist.github.io/hymnsforandroid/#/h/<ID>` if `app/src/main/assets/sheetMei/<ID>.mei` exists, else `<ID> Hymn: https://lemuelinchrist.github.io/hymnsforandroid/#/h/<ID>`.
    - Stanzas from `hymns.sqlite` (falling back through `parent_hymn`, `<br/>` -> newline, `chorus` -> `Chorus`, omitting labels for `-`/`beginning-note`/`end-note`/`verse`).
    - Footer: `---` and `Hymns For Android Web App: https://lemuelinchrist.github.io/hymnsforandroid/`.
- **Commands**:
  - Dry run: `~/.venvs/hymns-yt/bin/python tools/youtube-monitor/update_descriptions.py --video <VIDEO_ID> --show`
  - Single-video test: `~/.venvs/hymns-yt/bin/python tools/youtube-monitor/update_descriptions.py --video <VIDEO_ID> --apply`
  - Full run: `~/.venvs/hymns-yt/bin/python tools/youtube-monitor/update_descriptions.py --apply`
- **Quota & safety**: `videos.list` is batched (50 IDs/call), unchanged videos (matching title and description) are skipped, and existing `categoryId`, `tags`, `defaultLanguage`, and `defaultAudioLanguage` are preserved. Each `videos.update` costs 50 quota units (default 10,000/day, so ~146 videos fit in one day). Tested 2026-11-14 on `hwvmdDKP9q4` (`BF169`).

## Link labels and columns (Lemuel, 2026-11-09)
A link row has the **publisher** (`label`: who made the recording), the **album** (`album`) and an `instrumental` flag; the card shows the publisher, else the album, never the
YouTube channel (so not "Joseph's Storehouses"; a playlist "X (by Group)" gives the group as the publisher and X as the album). `NycypcdYoutube.txt` lines are
`hymn id TAB video id TAB publisher TAB album TAB instrumental`; write a new line as `hymn TAB video` or with the placeholder publisher "Joseph's Storehouses", then run
`python3 -I tools/youtube-monitor/link_meta.py`, which rewrites every line from `recordings.tsv` (and drops a recording of the same title in the same album as one the hymn already has).
There is no cap on the number of recordings per hymn any more: the card shows 3 and "Show N more". Importing needs the three columns in the DB: `JAVA_HOME=/home/lemue/.jdk ./gradlew :databaseProvisioner:runImportNycypcdYoutube :sqlite:exportSql`.
NYCYPCD, LSM (written "Living Stream Ministry"), Melody of Lilies and 臺灣福音書房 keep their publisher names.

## Finding recordings by hymn number (English hymns with no sung link; Lemuel, 2026-11-14)

For English hymns (and later the songs) that have no sung recording yet (a piano video does not count), search YouTube and SoundCloud
with the hymn number and first line, and let Lemuel choose. Pilot: E4-E40, the first 20 with no link; 16 links imported.
Only recordings by saints of the Lord's Recovery are wanted; a title or description that names the hymn number is the sign.
Scripts in `scripts/` (work in a scratchpad folder):
1. `python3 search_links.py <tag> E41 E42 ...` (`yt-dlp` search with full metadata: `ytsearch8:` for "Hymn N first line", "Hymns N", "first line HN";
   `scsearch8:` for the first two; about 15-25 hits per hymn, 4 processes in parallel were fine) -> `res2_<tag>.json`.
2. `python3 filter_links.py` keeps a hit only if (a) title or description has the number in a hymn form (`Hymn 4`, `Hymns 4`, `H4`, `#4`, `E4`; a bare "4"
   gives false hits like "Red Dirt Hymns 4"), (b) most of the first line's first words are in title+description (otherwise "Orchestra Hymns 5"
   passes), (c) the title and the channel do not say piano/instrumental/organ/karaoke, and (d) 1-15 minutes. The unfiltered search gave 204 candidates
   for 20 hymns, the filter 69 (Lemuel: "not bad", then stricter). Some outsiders still pass (a bed-and-breakfast channel); the choice is his.
3. `python3 build_links_review.py` -> `review.html`, serve with `python3 -m http.server 8766 --bind 127.0.0.1`. The reviewer is hymn-centred (the opposite of
   `build_review.py`): the lyrics stay on the left, the candidate links on the right with a tick box (several per hymn), a "Load player"
   button (YouTube and SoundCloud widget), **Sung / Instrumental** per link (default sung), a box "My own link(s)" (one per line; write `instrumental` after a link),
   "None fits", and **Export** (TSV `Hymn, Kind, Id, Title, Channel, Type, Note`). Answers are saved in his browser; the Chrome tool is blocked from
   reading them ("Cookie/query string data"), so he pastes the export.
4. **Import** the answers: a one-off recording without album or playlist is labelled **"YouTube 1", "YouTube 2"** (per hymn, in his order) or
   **"SoundCloud 1"**, no album, `instrumental` flag where chosen.
   - YouTube: a line `hymn TAB video TAB YouTube 1 TAB (empty album) TAB instrumental` in `NycypcdYoutube.txt` (it must be there: the import deletes every
     youtube row with a label), a row in `recordings.tsv`, then `runImportNycypcdYoutube :sqlite:exportSql`.
   - SoundCloud: the search only gives an internal id: get the permalink with
     `yt-dlp --skip-download --print "%(webpage_url)s | %(title)s" https://api.soundcloud.com/tracks/<id>`; strip `?si=...&utm_...` from pasted links.
     Insert the row by hand (`kind='soundcloud'`, id `SEQ_COUNT+1`, move the `link` counter, `n_order` 1...), run `:sqlite:exportSql` **first**,
     then the import (the import starts with `importSql` and would drop an unexported edit).
5. Check a doubtful case by ear/lyrics before arguing: E1 and E9 share the first line "Glory be to God the Father"; the LSM track of that name is E1's words
   ("As we view the vast creation"), confirmed by transcription; E9 (the doxology) still has no recording.

Status 2026-11-14: E4-E40 done (E8, E9, E14, E29, E34, E37, E38: none fits). 924 English hymns without a sung link remain (13 of the 20 got one); the next 20 would be E41 on. On hold.

## Hymns without links: search Lemuel's local collection (2026-11-14)

`G:\My Drive\Archives\Hymns\Hymns Ogg 1` (828 files in ~45 album folders, some with sub-folders; read it with `powershell.exe`, copy to `C:\Temp\hymnlocal`).
Find tracks for hymns/songs that have no sung link, then he uploads whole albums:
1. Match file names to the first lines/chorus lines of E/NS/BF hymns (first 3-4 words) and keep those whose hymn (and its New Tunes) has no
   sung link; skip the albums already uploaded and the children's album. Copy those tracks as `tNNN.ogg`, transcribe them
   (`batch_lyrics.py`) and match (`match_lyrics.py`): 0.5+ with a 0.2 lead = high confidence. Of 153 transcribed tracks, 41 were high confidence for 40 hymns.
2. Lemuel picks the albums (most high-confidence tracks first). `scripts/make_album_videos.py <folder> <out> "<Album>" "#rrggbb"` builds one 1080p still-card
   mp4 per track in `C:\Users\lemue\Videos\<Album>` (title = file name without number prefix and `(#N)` tag; own card colour per album: teal `#1f7a6b`
   A Joyful Way to Drink, burgundy `#8c2f39` Pressing On 1999). He uploads them to the HymnsForAndroid channel with a playlist per album.
3. Match **every** video of the uploaded playlists (`yt-dlp --flat-playlist` on the playlist, map file to video id by title), transcribe the album,
   match: the old `(#N)` tags in file names agree with the words when the score is weak (they can be wrong: "Hallelujah to the Lamb (#921)" is E551),
   check weak scores by reading the transcript against the hymn's chorus ("Breathing" 0.28 is NS77). Link all tracks, also to hymns that already have links
   (no cap), publisher empty, album = playlist title; ask before linking an E hymn that has a New Tune (BF child) when the tune is unclear.
   Import as in the Link labels section (`hymn TAB video TAB TAB album TAB`).
   Done: Pressing On 1999 and A Joyful Way To Drink (41 links; "If in all I do" is not in the hymnal; Intro/Exit skipped). Titles and descriptions of the 41 videos were updated with `update_descriptions.py` (2026-11-14). Lemuel decided NOT to upload the other albums of the collection (low-quality recordings): do not offer them again.

## Traps
- Titles are song names, not hymn numbers; several hymns share a first line (a hymn and its Be Filled / New Songs copy):
  collapse to the root hymn (`parent_hymn`) before counting candidates.
- Auto-captions of singing are noisy; the group repeats choruses and reorders stanzas. Matching is by words, not by tune.
- The channel's description lists albums and years (`yt-dlp --skip-download --print description <url>`), useful for labels.
