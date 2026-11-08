#!/usr/bin/env python3
"""Keep tools/youtube-monitor/recordings.tsv: where every recording we looked at came from.

  python3 -I tools/youtube-monitor/build_recordings.py                      # refresh status/hymns of every row
  python3 -I tools/youtube-monitor/build_recordings.py --tracks t.txt --channel "X - Topic" --publisher "X"
        [--studio-albums "Album A,Album B" --studio "Hymn CDs"]

t.txt: lines `album id|album name|video id|title` (list the albums with topic_albums.py, each with
`yt-dlp --flat-playlist --print "%(playlist_id)s|%(playlist_title)s|%(id)s|%(title)s" <playlist url>`).
New video ids are added (existing rows keep their album/channel). Then every row's status and hymns are recomputed from
databaseProvisioner/src/main/resources/NycypcdYoutube.txt (linked) and the *_known.tsv files (their status), else `unmatched`.
Columns: video id, status, hymns, link label, album, album id, channel, publisher/studio (blank when unknown), title, note.
"""
import argparse, collections, csv, os

R = os.path.dirname(os.path.abspath(__file__)) + "/"
REPO = os.path.dirname(os.path.dirname(R.rstrip("/")))
OUT = R + "recordings.tsv"
HEAD = ["video id", "status", "hymns", "link label", "album / playlist", "album id", "youtube channel", "publisher / studio", "title", "note"]


def tsv(path):
    for l in open(path, encoding="utf8"):
        if l.strip() and not l.startswith("#"):
            yield l.rstrip("\n").split("\t")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--tracks"); ap.add_argument("--channel"); ap.add_argument("--publisher", default="")
    ap.add_argument("--studio-albums", default=""); ap.add_argument("--studio", default="")
    a = ap.parse_args()
    rows = collections.OrderedDict()
    if os.path.exists(OUT):
        for p in list(csv.reader(open(OUT, encoding="utf8"), delimiter="\t"))[1:]:
            rows[p[0]] = p
    if a.tracks:
        studio = {x.strip().lower() for x in a.studio_albums.split(",") if x.strip()}
        for l in open(a.tracks, encoding="utf8"):
            aid, al, v, t = l.rstrip("\n").split("|", 3)
            if v not in rows:
                pub = a.studio if al.lower() in studio else a.publisher
                rows[v] = [v, "", "", "", al, aid, a.channel, pub, t, ""]
    linked, label = collections.defaultdict(list), {}
    for p in tsv(REPO + "/databaseProvisioner/src/main/resources/NycypcdYoutube.txt"):
        linked[p[1]].append(p[0]); label.setdefault(p[1], p[2] if len(p) > 2 else "NYCYPCD")
    known = {}
    for f in ("nycypcd_known", "lsm_known", "tgb_known", "lovingthelord_known"):
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
    missing = [v for v in linked if v not in rows]
    out = csv.writer(open(OUT, "w", newline="", encoding="utf8"), delimiter="\t", lineterminator="\n")
    out.writerow(HEAD)
    for r in rows.values():
        out.writerow(r)
    print(len(rows), "rows;", dict(collections.Counter(r[1] for r in rows.values())))
    if missing:
        print("linked videos with no row (add their channel's tracks):", missing[:20], len(missing))


if __name__ == "__main__":
    main()
