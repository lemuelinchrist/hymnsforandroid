#!/usr/bin/env python3
"""Builds dist/, the folder serve.py serves.

    python3 build.py [--assets <app assets folder>]

- src/ and vendor/ are copied as they are.
- data/hymns.sqlite is the app's database with only the tables the web app reads, plus a `search` table of
  normalised text (see norm()), gzipped.
- sheets/<id>.mei.gz are the app's sheetMei files, gzipped; data/sheets.json lists their IDs.
- verovio/ is the app's Verovio build, gzipped.
- data/version.json lets the browser keep the database between visits until it changes.

Big files are stored gzipped only; serve.py sends them as they are to browsers (all accept gzip).
Unchanged sheets are skipped, so a rebuild after a database change takes a few seconds.
"""
import argparse
import gzip
import hashlib
import json
import os
import re
import shutil
import sqlite3
import sys
import time
import unicodedata

HERE = os.path.dirname(os.path.abspath(__file__))
DEFAULT_ASSETS = os.path.normpath(os.path.join(HERE, '..', '..', 'app', 'src', 'main', 'assets'))
DIST = os.path.join(HERE, 'dist')

ACCENTS = re.compile('[̀-ͯ]')
NON_WORD = re.compile(r'[\W_]+')
TAGS = re.compile(r'<!--.*?-->|<[^>]*>')


def norm(text):
    """Search form of a text: no tags, no accents, lower case, words separated by single spaces.
    Must stay identical to norm() in src/db.js."""
    if not text:
        return ''
    text = TAGS.sub(' ', text).replace('&nbsp;', ' ').replace('&amp;', '&')
    text = unicodedata.normalize('NFC', ACCENTS.sub('', unicodedata.normalize('NFD', text)))
    text = text.lower().replace('ς', 'σ')
    return NON_WORD.sub(' ', text).strip()


def gz_write(path, data):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'wb') as f:
        f.write(gzip.compress(data, 9, mtime=0))


def copy_tree(src, dst):
    for root, _, files in os.walk(src):
        for name in files:
            s = os.path.join(root, name)
            d = os.path.join(dst, os.path.relpath(s, src))
            os.makedirs(os.path.dirname(d), exist_ok=True)
            shutil.copyfile(s, d)


def build_db(assets):
    src = os.path.join(assets, 'hymns.sqlite')
    out = os.path.join(DIST, 'data', 'hymns.sqlite.gz')
    old = os.path.join(DIST, 'data', 'version.json')
    # unchanged since the last build (same database, same build script): keep it
    if os.path.exists(out) and os.path.exists(old) and \
            os.stat(out).st_mtime > max(os.stat(src).st_mtime, os.stat(__file__).st_mtime):
        with open(old) as f:
            v = json.load(f)
        if 'db' in v:
            return {k: v[k] for k in ('db', 'dbSize', 'hymns')}
    tmp = os.path.join(DIST, 'data', 'hymns.tmp.sqlite')
    os.makedirs(os.path.dirname(tmp), exist_ok=True)
    if os.path.exists(tmp):
        os.remove(tmp)
    db = sqlite3.connect(tmp)
    db.execute('attach ? as src', (src,))
    # the tables, and only the index the web app uses (the stanzas of a hymn); fewer bytes to download
    for (sql,) in db.execute("select sql from src.sqlite_master where type = 'table' and name in ('hymns', 'stanza')"
                             ).fetchall():
        db.execute(sql)
    db.execute('create index stanza_hymn on stanza (parent_hymn, n_order)')
    db.execute('insert into hymns select * from src.hymns')
    db.execute('insert into stanza select * from src.stanza')

    # one row per hymn: the first lines and all of its own stanzas, in search form
    db.execute('create table search (id text, grp text, first text, chorus text, body text)')
    stanzas = {}
    for pid, text in db.execute('select parent_hymn, text from stanza order by parent_hymn, n_order'):
        stanzas.setdefault(pid, []).append(norm(text))
    rows = [(hid, grp, norm(first), norm(chorus), ' | '.join(stanzas.get(hid, [])))
            for hid, grp, first, chorus in db.execute(
                'select _id, hymn_group, first_stanza_line, first_chorus_line from hymns')]
    db.executemany('insert into search values (?, ?, ?, ?, ?)', rows)
    db.commit()
    db.execute('detach src')
    db.execute('vacuum')
    db.close()

    with open(tmp, 'rb') as f:
        data = f.read()
    os.remove(tmp)
    gz_write(out, data)
    return {'db': hashlib.sha1(data).hexdigest()[:12], 'dbSize': len(data), 'hymns': len(rows)}


def build_sheets(assets):
    src = os.path.join(assets, 'sheetMei')
    dst = os.path.join(DIST, 'sheets')
    os.makedirs(dst, exist_ok=True)
    ids, written = [], 0
    for name in sorted(os.listdir(src)):
        if not name.endswith('.mei'):
            continue
        ids.append(name[:-4])
        s = os.path.join(src, name)
        d = os.path.join(dst, name + '.gz')
        st = os.stat(s)
        if os.path.exists(d) and os.stat(d).st_mtime >= st.st_mtime:
            continue
        with open(s, 'rb') as f:
            gz_write(d, f.read())
        written += 1
    wanted = {i + '.mei.gz' for i in ids}
    for name in os.listdir(dst):
        if name not in wanted:
            os.remove(os.path.join(dst, name))
    with open(os.path.join(DIST, 'data', 'sheets.json'), 'w') as f:
        json.dump(ids, f, separators=(',', ':'))
    return len(ids), written


def build_verovio(assets):
    src = os.path.join(assets, 'viewer')
    with open(os.path.join(src, 'verovio-toolkit-wasm.js'), 'rb') as f:
        data = f.read()
    gz_write(os.path.join(DIST, 'verovio', 'verovio-toolkit-wasm.js.gz'), data)
    shutil.copyfile(os.path.join(src, 'VEROVIO-NOTICE.txt'), os.path.join(DIST, 'verovio', 'VEROVIO-NOTICE.txt'))
    return hashlib.sha1(data).hexdigest()[:12]


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('--assets', default=DEFAULT_ASSETS, help='the Android app assets folder (default: %(default)s)')
    args = ap.parse_args()
    if not os.path.exists(os.path.join(args.assets, 'hymns.sqlite')):
        sys.exit('No hymns.sqlite in ' + args.assets)

    t = time.time()
    os.makedirs(DIST, exist_ok=True)
    copy_tree(os.path.join(HERE, 'src'), DIST)
    copy_tree(os.path.join(HERE, 'vendor'), os.path.join(DIST, 'vendor'))
    version = build_db(args.assets)
    print('database: %(hymns)d hymns, %(dbSize)d bytes, version %(db)s' % version)
    count, written = build_sheets(args.assets)
    print('sheets: %d (%d new or changed)' % (count, written))
    version['verovio'] = build_verovio(args.assets)
    version['built'] = time.strftime('%Y-%m-%d %H:%M')
    with open(os.path.join(DIST, 'data', 'version.json'), 'w') as f:
        json.dump(version, f)
    print('done in %.1fs: %s' % (time.time() - t, DIST))


if __name__ == '__main__':
    main()
