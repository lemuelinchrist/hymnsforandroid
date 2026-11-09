#!/usr/bin/env python3
"""The label a YouTube link shows in the app: the PUBLISHER of the recording, else its album / playlist, never the channel
(Lemuel, 2026-11-09). Source: recordings.tsv (publisher / studio, album / playlist). "Album (by X)" playlists name X as the
publisher. A second link with the same label on one hymn gets " 2"; instrumentals get " (Instrumental)".

  python3 -I tools/youtube-monitor/link_labels.py          # rewrite the third column of the Joseph's Storehouses and
                                                           # Loving the Lord lines of NycypcdYoutube.txt
Other channels keep their established label (NYCYPCD, LSM, Melody of Lilies, 臺灣福音書房)."""
import csv, re, pathlib, collections
HERE = pathlib.Path(__file__).resolve().parent
TXT = HERE.parents[1] / 'databaseProvisioner/src/main/resources/NycypcdYoutube.txt'
OLD = ("Joseph's Storehouses", 'Loving the Lord')

def label_of(rec):
    m = re.search(r'\(by (.+)\)\s*$', rec['album / playlist'])
    if m: return m.group(1).strip()
    return (rec['publisher / studio'] or rec['album / playlist'] or '').strip()

def main():
    rec = {r['video id']: r for r in csv.DictReader(open(HERE / 'recordings.tsv', encoding='utf8'), delimiter='\t')}
    lines = TXT.read_text(encoding='utf8').split('\n'); out = []; seen = collections.Counter(); n = 0
    for l in lines:
        p = l.split('\t')
        if len(p) == 3 and not l.startswith('#') and p[2].startswith(OLD):
            r = rec.get(p[1]); lab = label_of(r) if r else ''
            if not lab: print('no publisher or album, label kept:', p[0], p[1], p[2]); continue
            inst = '(Instrumental)' in p[2]
            base = lab + (' (Instrumental)' if inst else '')
            seen[(p[0], base)] += 1
            if seen[(p[0], base)] > 1: base += f' {seen[(p[0], base)]}'
            p[2] = base; n += 1; l = '\t'.join(p)
        out.append(l)
    TXT.write_text('\n'.join(out), encoding='utf8'); print(n, 'lines relabelled')
if __name__ == '__main__': main()
