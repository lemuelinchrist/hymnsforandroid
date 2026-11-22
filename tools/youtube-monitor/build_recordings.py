#!/usr/bin/env python3
"""Keep tools/youtube-monitor/recordings.tsv: where every recording we looked at came from.

  python3 -I tools/youtube-monitor/build_recordings.py                      # refresh status/hymns of every row
  python3 -I tools/youtube-monitor/build_recordings.py --tracks t.txt --channel "X - Topic" --publisher "X"
        [--studio-albums "Album A,Album B" --studio "Hymn CDs"]

t.txt: lines `album id|album name|video id|title` (list the albums with topic_albums.py, each with
`yt-dlp --flat-playlist --print "%(playlist_id)s|%(playlist_title)s|%(id)s|%(title)s" <playlist url>`).
New video ids are added (existing rows keep their album/channel). Then every row's status and hymns are recomputed from
databaseProvisioner/src/main/resources/NycypcdYoutube.txt (linked) and the *_known.tsv files (their status), else `unmatched`.
Columns: video id, status, hymns, link label, album, album id, channel, publisher/studio (blank when unknown), title, note,
platform (youtube / soundcloud), url, instrumental (1 or empty), language (the language the recording is sung in, English name; see guess_language:
filled once and then kept, so a hand-set value stays; blank = not known yet), priority (1 = LSM/NYCYPCD/TWGBR, 2 = Melody of Lilies, 3 = others, 5 = low-quality; filled once and kept).

SoundCloud links (Lemuel 2026-11-19, option "mirror"): the database is the source of truth for them (the `link` table, kind
soundcloud: the youth books' provisioners and links added by hand). Every run rewrites the soundcloud rows of this file from
app/src/main/assets/hymns.sqlite, so edit the database (and export it), never those rows. Their `video id` is the URL path
(`user/track`, the key of the row), status is always `linked`, channel `SoundCloud: <user>`, title the track part of the path.
"""
import argparse, collections, csv, os

R = os.path.dirname(os.path.abspath(__file__)) + "/"
REPO = os.path.dirname(os.path.dirname(R.rstrip("/")))
OUT = R + "recordings.tsv"
HEAD = ["video id", "status", "hymns", "link label", "album / playlist", "album id", "youtube channel", "publisher / studio", "title", "note",
        "platform", "url", "instrumental", "language", "priority"]
DB = REPO + "/app/src/main/assets/hymns.sqlite"


def tsv(path):
    for l in open(path, encoding="utf8"):
        if l.strip() and not l.startswith("#"):
            yield l.rstrip("\n").split("\t")


GROUP_LANGUAGE = {"E": "English", "NS": "English", "BF": "English", "CH": "English", "C": "Chinese", "CS": "Chinese", "Z": "Chinese", "ZS": "Chinese",
                  "CB": "Cebuano", "FR": "French", "FRY": "French", "S": "Spanish", "SY": "Spanish", "K": "Korean", "G": "German", "GY": "German",
                  "J": "Japanese", "I": "Indonesian", "F": "Farsi", "SK": "Slovak", "GK": "Greek", "SW": "Kiswahili", "RUS": "Russian", "BUR": "Burmese",
                  "TA": "Tamil", "UR": "Urdu", "KI": "Kikuyu", "POR": "Portuguese", "POY": "Portuguese", "POL": "Polish"}   # T (Tagalog) is left out: T10xxx are English songs
ENGLISH_CHANNELS = ("Joseph's Storehouses", "Melody of Lilies", "Living Stream Ministry - Topic", "Loving the Lord - Topic", "Hymn Singing", "HymnsForAndroid")


def guess_language(r):
    """Chinese when the title or album has Chinese characters or the channel is Taiwan Gospel Book Room's; else the language of the
    first linked hymn's book; else English for the channels that only sing English; else blank (NYCYPCD and SoundCloud sing many)."""
    import re
    if re.search(r"[\u4e00-\u9fff]", r[8] + r[4]) or "Taiwan Gospel" in r[6] or "臺灣福音書房" in r[6] or "召會詩歌" in r[6]: return "Chinese"
    for h in r[2].split():
        g = re.match(r"[A-Z]+", h)
        if g and g.group(0) in GROUP_LANGUAGE: return GROUP_LANGUAGE[g.group(0)]
    if r[6] in ENGLISH_CHANNELS: return "English"
    return ""


PRIORITY_1_SOURCES = {
    "NYCYPCD",
    "Living Stream Ministry - Topic", "Living Stream Ministry", "LSM", "SoundCloud: livingstreamministry",
    "Taiwan Gospel Book Room - Topic", "臺灣福音書房 (official channel)", "Taiwan Gospel Book Room", "臺灣福音書房",
}


def default_priority(r):
    """1 = LSM / NYCYPCD / Taiwan Gospel Book Room, 2 = Melody of Lilies, 3 = everything else."""
    sources = {r[3].strip(), r[6].strip(), r[7].strip()}
    if sources & PRIORITY_1_SOURCES:
        return "1"
    if "Melody of Lilies" in sources:
        return "2"
    return "3"


def soundcloud_rows():
    """The database's soundcloud links as rows of this file (empty list when there is no database)."""
    if not os.path.exists(DB): return []
    import sqlite3, re
    out = []
    for hymn, label, album, url, inst in sqlite3.connect(DB).execute(
            "select hymn_id, label, album, url, instrumental from link where kind='soundcloud' order by hymn_id, n_order"):
        path = re.sub(r"^https?://(www\.)?soundcloud\.com/", "", url).split("?")[0].strip("/")
        note = ""
        if not path: path, note = "(no url)/" + hymn, "the database row has an empty url"
        user = path.split("/")[0]
        title = path.split("/")[-1].replace("-", " ")
        out.append([path, "linked", hymn, label or "", album or "", "", "SoundCloud: " + user, "", title, note, "soundcloud", url, "1" if inst else "", "", ""])
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--tracks"); ap.add_argument("--channel"); ap.add_argument("--publisher", default="")
    ap.add_argument("--studio-albums", default=""); ap.add_argument("--studio", default="")
    a = ap.parse_args()
    rows = collections.OrderedDict(); old_lang = {}; old_prio = {}
    if os.path.exists(OUT):
        for p in list(csv.reader(open(OUT, encoding="utf8"), delimiter="\t"))[1:]:
            p += [""] * (len(HEAD) - len(p)); old_lang[p[0]] = p[13]; old_prio[p[0]] = p[14]
            if p[10] != "soundcloud":      # the soundcloud rows are rebuilt from the database below
                rows[p[0]] = p
    if a.tracks:
        studio = {x.strip().lower() for x in a.studio_albums.split(",") if x.strip()}
        for l in open(a.tracks, encoding="utf8"):
            aid, al, v, t = l.rstrip("\n").split("|", 3)
            if v not in rows:
                pub = a.studio if al.lower() in studio else a.publisher
                rows[v] = [v, "", "", "", al, aid, a.channel, pub, t, "", "youtube", "", "", "", ""]
    linked, label, instr = collections.defaultdict(list), {}, set()
    for p in tsv(REPO + "/databaseProvisioner/src/main/resources/NycypcdYoutube.txt"):
        linked[p[1]].append(p[0]); label.setdefault(p[1], p[2] if len(p) > 2 else "NYCYPCD")
        if len(p) > 4 and p[4].strip() == "instrumental": instr.add(p[1])
    known = {}
    for f in ("nycypcd_known", "lsm_known", "tgb_known", "lovingthelord_known", "melodyoflilies_known", "josephs_known", "hymnsinging_known"):
        for p in tsv(R + f + ".tsv"):
            known[p[0]] = (p[1], " ".join(p[2:]))
    for p in tsv(R + "tgb_kids_series.tsv"):  # videoId, hymn, title, has-link
        known.setdefault(p[0], ("kids-series", p[1] + " (official channel)"))
    for v, r in rows.items():
        r[1] = "linked" if v in linked else (known[v][0] if v in known else "unmatched")
        r[2] = " ".join(sorted(set(linked.get(v, []))))
        r[3] = label.get(v, "")
        if v in known:
            r[9] = known[v][1]
        r[10], r[11], r[12] = "youtube", "https://www.youtube.com/watch?v=" + v, "1" if v in instr else ""
    sc = soundcloud_rows()
    for r in sc:
        if r[0] in rows and rows[r[0]][10] == "soundcloud":      # the same track linked to several hymns
            rows[r[0]][2] = " ".join(sorted(set(rows[r[0]][2].split() + [r[2]])))
        else: rows[r[0]] = r
    for v, r in rows.items():
        r[13] = old_lang.get(v) or r[13] or guess_language(r)
        r[14] = old_prio.get(v) or r[14] or default_priority(r)
    missing = [v for v in linked if v not in rows]
    out = csv.writer(open(OUT, "w", newline="", encoding="utf8"), delimiter="\t", lineterminator="\n")
    out.writerow(HEAD)
    for r in rows.values():
        out.writerow(r)
    print(len(rows), "rows;", dict(collections.Counter(r[1] for r in rows.values())), "; soundcloud:", len(sc))
    if missing:
        print("linked videos with no row (add their channel's tracks):", missing[:20], len(missing))


if __name__ == "__main__":
    main()
