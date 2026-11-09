#!/usr/bin/env python3
"""Fill the columns of NycypcdYoutube.txt that the links card shows (Lemuel, 2026-11-09):

  hymn id TAB video id TAB publisher TAB album TAB instrumental

publisher = who made the recording (NYCYPCD, Hymn CDs, Living Stream Ministry, the group of a "Playlist (by Group)", ...; empty
when unknown); album = its album or playlist (without "(by Group)"); the last column is `instrumental` or empty. The card shows
the publisher, else the album, never the YouTube channel. Source: recordings.tsv. Lines of the Joseph's Storehouses and Loving the
Lord channels are rebuilt from it; the other lines keep their label (the Chinese 臺灣福音書房, NYCYPCD, ...; "LSM" is written out)
and get their album.

  python3 -I tools/youtube-monitor/link_meta.py            # rewrite NycypcdYoutube.txt
  python3 -I tools/youtube-monitor/link_meta.py --check    # only print the duplicates that would be dropped

Duplicates: the same hymn with a recording of the same title in the same album twice (a re-upload) keeps the first one.
Old three-column lines are read too (a label with " (Instrumental)" or a trailing " 2" is cleaned)."""
import csv, re, sys, pathlib, collections
HERE = pathlib.Path(__file__).resolve().parent
TXT = HERE.parents[1] / 'databaseProvisioner/src/main/resources/NycypcdYoutube.txt'
CHANNELS = ("Joseph's Storehouses", 'Loving the Lord - Topic')
NAMES = {'LSM': 'Living Stream Ministry'}

def norm(s): return re.sub(r'[^a-z0-9]+', '', (s or '').lower())

def by_group(album):
    m = re.search(r'\(by (.+)\)\s*$', album)
    return (m.group(1).strip(), album[:m.start()].strip()) if m else (None, album.strip())

def main():
    check = '--check' in sys.argv
    rec = {r['video id']: r for r in csv.DictReader(open(HERE / 'recordings.tsv', encoding='utf8'), delimiter='\t')}
    out, seen, dropped = [], set(), []
    for line in TXT.read_text(encoding='utf8').split('\n'):
        p = line.split('\t')
        if line.startswith('#') or len(p) < 2 or not line.strip():
            out.append(line); continue
        hymn, vid = p[0], p[1]
        old = p[2].strip() if len(p) > 2 else 'NYCYPCD'
        inst = '(Instrumental)' in old or (len(p) > 4 and p[4] == 'instrumental')
        old = re.sub(r'\s*\(Instrumental\)', '', old); old = re.sub(r' 2$', '', old)
        r = rec.get(vid, {})
        album = r.get('album / playlist', '')
        if r.get('youtube channel') in CHANNELS:
            group, album = by_group(album)
            pub = group or r.get('publisher / studio', '') or ''
        else:
            pub = NAMES.get(old, old)
            if len(p) > 3: album = p[3]
            group, album = by_group(album)
        title = norm(r.get('title', ''))
        key = (hymn, title, norm(album))
        if title and key in seen:
            dropped.append((hymn, vid, r.get('title'))); continue
        seen.add(key)
        out.append('\t'.join([hymn, vid, pub, album, 'instrumental' if inst else '']))
    for d in dropped: print('duplicate dropped:', *d)
    if not check:
        TXT.write_text('\n'.join(out), encoding='utf8'); print(len(out), 'lines written')
if __name__ == '__main__': main()
