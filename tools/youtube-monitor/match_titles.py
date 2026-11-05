#!/usr/bin/env python3
"""Match the videos/tracks that check_channel.py reports as NEW to hymns by their title (no captions needed).

  python3 -I tools/youtube-monitor/check_channel.py --releases --json new.json   # lists the NEW ones
  python3 -I tools/youtube-monitor/match_titles.py new.json out.tsv

A title equal to a hymn's first stanza line or first chorus line (case, accents, punctuation and "(New Tune)" ignored) is
`exact`; a title that starts a line (or a line that starts the title, 12+ letters) is `prefix`; else `none`. Candidates of
every group are looked at, so a Spanish or Portuguese title finds the Spanish or Portuguese hymn. An English hymn and its New Tune
copy are collapsed to the root hymn (parent_hymn); a translation keeps its own id. out.tsv: video id, album, title, confidence, action, hymns the recording
would go on, those of them that already have an NYCYPCD link, and the groups the title matched (the language: E/NS/BF/CH
are English, S Spanish, POR/POY Portuguese, ...). Action: `import` (exact title, one hymn, no link yet), `duplicate` (that
hymn already has a link: drop it and mark it in nycypcd_known.tsv) or `review` (partial, none, or several hymns).
Reads the app database (app/src/main/assets/hymns.sqlite: run `./gradlew :sqlite:importSql` first).
"""
import collections, csv, json, os, re, sqlite3, sys, unicodedata

ENGLISH = {"E", "NS", "BF", "CH"}
REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def norm(s):
    s = unicodedata.normalize("NFKD", s or "").lower()
    s = "".join(c for c in s if not unicodedata.combining(c))
    s = re.sub(r"\(.*?\)", "", s)
    s = re.sub(r"[^a-z0-9Ѐ-ӿ ]", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def main(new_json, out_tsv):
    db = sqlite3.connect(os.path.join(REPO, "app/src/main/assets/hymns.sqlite"))
    par = dict(db.execute("select _id, parent_hymn from hymns"))
    grp = dict(db.execute("select _id, hymn_group from hymns"))
    have = collections.defaultdict(set)
    for h, url in db.execute("select hymn_id, url from link where kind='youtube' and label='NYCYPCD'"):
        have[h].add(url[-11:])
    taken = set()
    lines = []
    exact = collections.defaultdict(set)
    for _id, fs, fc in db.execute("select _id, first_stanza_line, first_chorus_line from hymns"):
        for kind, t in (("stanza", fs), ("chorus", fc)):
            n = norm(t)
            if n:
                lines.append((n, _id, kind))
                exact[n].add((_id, kind))

    def root(h):
        for _ in range(5):
            if par.get(h):
                h = par[h]
        return h

    out = csv.writer(open(out_tsv, "w", newline="", encoding="utf8"), delimiter="\t", lineterminator="\n")
    for v in json.load(open(new_json))["new"]:
        m = re.match(r"\[(.*?)\] (.*)", v["title"])
        album, title = (m.group(1), m.group(2)) if m else ("", v["title"])
        n = norm(title)
        conf, cands = "none", []
        if n in exact:
            conf, cands = "exact", sorted(exact[n])
        elif len(n) >= 8:
            c = sorted({(i, k) for l, i, k in lines if l.startswith(n) or (len(l) >= 12 and n.startswith(l))})
            if c:
                conf, cands = "prefix", c
        # the hymn the recording goes on: an English match is collapsed to its root (a hymn and its New Tune copy),
        # a translation (Spanish, Portuguese...) stays itself: its own page gets its own recording
        targets, groups = [], set()
        for i, k in cands:
            groups.add(grp.get(i))
            t = root(i) if grp.get(i) in ENGLISH else i
            if t not in targets:
                targets.append(t)
        linked = [t for t in targets if have.get(t) or t in taken]
        if conf == "exact" and len(targets) == 1:
            action = "duplicate" if linked else "import"
            taken.add(targets[0])  # a second track for the same hymn goes to review
        else:
            action = "review"
        out.writerow([v["id"], album, title, conf, action, " ".join(targets[:8]), " ".join(linked), " ".join(sorted(groups))])

if __name__ == "__main__":
    main(*sys.argv[1:3])
