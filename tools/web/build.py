#!/usr/bin/env python3
"""Builds dist/: the Hymns web app (a PWA), as static files for GitHub Pages or any web server.

    python3 tools/web/build.py [--assets <app assets folder>]

Everything comes from the Android app (app/src/main/assets and HymnGroup.java), so the web app shows the same data:

- src/ and vendor/ are copied; groups.js gets the hymnals from HymnGroup.java (order, names, colours).
- data/hymns-<hash>.sqlite.gz: the app's database with only the tables the web app reads, plus a `search` table of
  normalised text (see norm()). The browser unpacks it (DecompressionStream) and keeps it in IndexedDB.
- sheets/<group>-<hash>.json.gz: the app's sheetMei files, one pack per hymnal ({hymn id: MEI text}).
- lyrics/<group>-<hash>.json.gz: the app's sheetLyrics files (translated words under a borrowed sheet), same packing.
- verovio/: the app's Verovio build (the web server compresses it on the way).
- data/version.json says which files are current; sw.js (the service worker) and the manifest are written for this
  build, so a new build is picked up by installed apps.

Hashed file names never change content, so the service worker can keep them for offline use without asking again.
GitHub Pages does not send .gz files as compressed responses, so the app unpacks them itself.
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
ROOT = os.path.normpath(os.path.join(HERE, '..', '..'))
DEFAULT_ASSETS = os.path.join(ROOT, 'app', 'src', 'main', 'assets')
ENUM = os.path.join(ROOT, 'app', 'src', 'main', 'java', 'com', 'lemuelinchrist', 'android', 'hymns', 'HymnGroup.java')
APP_GRADLE = os.path.join(ROOT, 'app', 'build.gradle')
RAW = os.path.join(ROOT, 'app', 'src', 'main', 'res', 'raw')
APP_ICON = os.path.join(ROOT, 'app', 'src', 'main', 'res', 'drawable-xhdpi', 'icon.png')
DIST = os.path.join(HERE, 'dist')

ACCENTS = re.compile('[̀-ͯ]')
NON_WORD = re.compile(r'[\W_]+')
TAGS = re.compile(r'<!--.*?-->|<[^>]*>')

# How the web app names a hymnal, where it differs from HymnGroup.java (the app's drawer names): the name in the
# hymnal's own language, an English name for the cards, the text language, and a darker day colour where the app's
# is too light for text on white. A hymnal added to HymnGroup.java appears with its app name and colours.
DISPLAY = {
    'C': {'name': '中文 (繁)', 'long': 'Chinese (Traditional)', 'lang': 'zh-Hant', 'cjk': True},
    'CS': {'name': '補充本 (繁)', 'long': 'Chinese Supplement (Traditional)', 'lang': 'zh-Hant', 'cjk': True},
    'Z': {'name': '中文 (简)', 'long': 'Chinese (Simplified)', 'lang': 'zh-Hans', 'cjk': True},
    'ZS': {'name': '补充本 (简)', 'long': 'Chinese Supplement (Simplified)', 'lang': 'zh-Hans', 'cjk': True},
    'CB': {'lang': 'ceb', 'day': '#E67A00'},
    'T': {'lang': 'tl', 'day': '#00897B'},
    'FR': {'name': 'Français', 'long': 'French', 'lang': 'fr'},
    'FY': {'name': 'Français (jeunes)', 'long': 'French Youth', 'lang': 'fr'},
    'S': {'name': 'Español', 'long': 'Spanish', 'lang': 'es'},
    'SY': {'name': 'Español (jóvenes)', 'long': 'Spanish Youth', 'lang': 'es'},
    'K': {'name': '한국어', 'long': 'Korean', 'lang': 'ko', 'cjk': True},
    'G': {'name': 'Deutsch', 'long': 'German', 'lang': 'de', 'day': '#F4511E'},
    'GY': {'name': 'Deutsch (Jugend)', 'long': 'German Youth', 'lang': 'de', 'day': '#F4511E'},
    'J': {'name': '日本語', 'long': 'Japanese', 'lang': 'ja', 'cjk': True, 'day': '#689F38'},
    'I': {'name': 'B. Indonesia', 'long': 'Indonesian', 'lang': 'id'},
    'CH': {'day': '#8D9124'},
    'F': {'name': 'فارسی', 'long': 'Farsi', 'lang': 'fa'},
    'SK': {'name': 'Slovenčina', 'long': 'Slovak', 'lang': 'sk'},
    'GK': {'name': 'Ελληνικά', 'long': 'Greek', 'lang': 'el', 'day': '#0288D1'},
    'SW': {'lang': 'sw'},
}


def norm(text):
    """Search form of a text: no tags, no accents, lower case, words separated by single spaces.
    Must stay identical to norm() in src/db.js."""
    if not text:
        return ''
    text = TAGS.sub(' ', text).replace('&nbsp;', ' ').replace('&amp;', '&')
    text = unicodedata.normalize('NFC', ACCENTS.sub('', unicodedata.normalize('NFD', text)))
    text = text.lower().replace('ς', 'σ')
    return NON_WORD.sub(' ', text).strip()


def short_hash(data):
    return hashlib.sha1(data).hexdigest()[:10]


def write(path, data):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'wb') as f:
        f.write(data)


def copy_tree(src, dst):
    for root, _, files in os.walk(src):
        for name in files:
            s = os.path.join(root, name)
            d = os.path.join(dst, os.path.relpath(s, src))
            os.makedirs(os.path.dirname(d), exist_ok=True)
            shutil.copyfile(s, d)


def read_groups():
    """The hymnals as HymnGroup.java defines them, in its order: code, name, day and night colour, text direction."""
    src = open(ENUM, encoding='utf-8').read()
    rgb = r'Color\.rgb\(\s*0x([0-9A-Fa-f]{2})\s*,\s*0x([0-9A-Fa-f]{2})\s*,\s*0x([0-9A-Fa-f]{2})\s*\)'
    pattern = re.compile(r'^\s+([A-Z]{1,2})\(\s*"([^"]+)"\s*,\s*' + rgb + r'\s*,\s*' + rgb + r'\s*,\s*Gravity\.(\w+)\s*\)', re.M)
    groups = []
    for m in pattern.finditer(src):
        code, name = m.group(1), m.group(2)
        g = {'code': code, 'name': name,
             'day': '#' + ''.join(m.group(i) for i in (3, 4, 5)).upper(),
             'night': '#' + ''.join(m.group(i) for i in (6, 7, 8)).upper()}
        if m.group(9) == 'RIGHT':
            g['rtl'] = True
        g.update(DISPLAY.get(code, {}))
        groups.append(g)
    if len(groups) < 20:
        sys.exit('Could not read the hymnals from ' + ENUM)
    return groups


def app_version():
    m = re.search(r'hymnAppVersion\s*=\s*"([^"]+)"', open(APP_GRADLE, encoding='utf-8').read())
    return m.group(1) if m else ''


def build_db(assets):
    src = os.path.join(assets, 'hymns.sqlite')
    tmp = os.path.join(DIST, 'hymns.tmp.sqlite')
    db = sqlite3.connect(tmp)
    db.execute('attach ? as src', (src,))
    # the tables, and only the index the web app uses (the stanzas of a hymn); fewer bytes to download
    for (sql,) in db.execute("select sql from src.sqlite_master where type = 'table' and name in ('hymns', 'stanza', 'tune')"
                             ).fetchall():
        db.execute(sql)
    db.execute('create index stanza_hymn on stanza (parent_hymn, n_order)')
    db.execute('insert into hymns select * from src.hymns')
    db.execute('insert into stanza select * from src.stanza')
    db.execute('insert into tune select * from src.tune')

    # one row per hymn: the first lines and all of its own stanzas, in search form
    db.execute('create table search (id text, grp text, first text, chorus text, body text)')
    stanzas = {}
    for pid, text in db.execute('select parent_hymn, text from stanza order by parent_hymn, n_order'):
        stanzas.setdefault(pid, []).append(norm(text))
    rows = [(hid, grp, norm(first), norm(chorus), ' | '.join(stanzas.get(hid, [])))
            for hid, grp, first, chorus in db.execute(
                'select _id, hymn_group, first_stanza_line, first_chorus_line from hymns')]
    db.executemany('insert into search values (?, ?, ?, ?, ?)', rows)
    groups_in_db = sorted({r[1] for r in rows})
    db.commit()
    db.execute('detach src')
    db.execute('vacuum')
    db.close()

    with open(tmp, 'rb') as f:
        data = f.read()
    os.remove(tmp)
    h = short_hash(data)
    name = 'data/hymns-%s.sqlite.gz' % h
    packed = gzip.compress(data, 9, mtime=0)
    write(os.path.join(DIST, name), packed)
    return {'db': h, 'dbFile': name, 'dbSize': len(data), 'dbGzSize': len(packed), 'hymns': len(rows)}, groups_in_db


def group_of(hymn_id):
    m = re.match(r'^([A-Z]{1,2})\d', hymn_id)
    return m.group(1) if m else None


def build_packs(folder, ext, out_dir, parse):
    """One gzipped JSON file per hymnal: {hymn id: content}. Returns ({group: file}, [ids])."""
    by_group = {}
    for name in sorted(os.listdir(folder)):
        if not name.endswith(ext):
            continue
        hid = name[:-len(ext)]
        g = group_of(hid)
        if not g:
            continue
        with open(os.path.join(folder, name), encoding='utf-8') as f:
            by_group.setdefault(g, {})[hid] = parse(f.read())
    files, ids = {}, []
    for g, items in sorted(by_group.items()):
        data = json.dumps(items, ensure_ascii=False, separators=(',', ':'), sort_keys=True).encode('utf-8')
        rel = '%s/%s-%s.json.gz' % (out_dir, g, short_hash(data))
        write(os.path.join(DIST, rel), gzip.compress(data, 9, mtime=0))
        files[g] = rel
        ids.extend(items)
    return files, sorted(ids)


def build_tunes():
    """The app's tunes (res/raw/m<tune>.mid, one .mp3), for the Play button: midi/<hash>.<ext>, and
    {tune code (lower case): file} for the index. A file that is not a MIDI file or an MP3 is left out."""
    tunes, bad = {}, []
    for name in sorted(os.listdir(RAW)):
        m = re.match(r'^m([0-9a-z]+)\.(mid|mp3)$', name)
        if not m:
            continue
        with open(os.path.join(RAW, name), 'rb') as f:
            data = f.read()
        if not (data[:4] == b'MThd' or (m.group(2) == 'mp3' and (data[:3] == b'ID3' or data[:2] == b'\xff\xfb'))):
            bad.append(name)
            continue
        rel = 'midi/%s.%s' % (short_hash(data), m.group(2))
        write(os.path.join(DIST, rel), data)
        tunes[m.group(1)] = rel
    if bad:
        print('WARNING: %d tune files are not MIDI files (they do not play in the app either): %s' % (len(bad), ', '.join(bad)),
              file=sys.stderr)
    return tunes


def build_verovio(assets):
    src = os.path.join(assets, 'viewer')
    with open(os.path.join(src, 'verovio-toolkit-wasm.js'), 'rb') as f:
        data = f.read()
    write(os.path.join(DIST, 'verovio', 'verovio-toolkit-wasm.js'), data)
    shutil.copyfile(os.path.join(src, 'VEROVIO-NOTICE.txt'), os.path.join(DIST, 'verovio', 'VEROVIO-NOTICE.txt'))
    return short_hash(data)


def build_icons():
    """Home-screen icons: the Android app's icon (a light serif H on dark grey), with the tile filling the whole icon,
    since iOS rounds the corners itself and Android masks maskable icons. The H is taken from the app's icon."""
    from PIL import Image
    app = Image.open(APP_ICON).convert('RGBA')
    letter = app.crop((84, 81, 280, 273))            # the H on its dark background (H at 90-273 x 87-266)
    out = os.path.join(DIST, 'icons')
    os.makedirs(out, exist_ok=True)
    for size, name, share in ((180, 'apple-touch-icon.png', 0.56), (192, 'icon-192.png', 0.56),
                              (512, 'icon-512.png', 0.56), (512, 'icon-maskable-512.png', 0.46)):
        bg = Image.new('RGBA', (size, size), (64, 64, 64, 255))
        w = int(size * share)
        h = int(w * letter.height / letter.width)
        bg.alpha_composite(letter.resize((w, h), Image.LANCZOS), ((size - w) // 2, (size - h) // 2))
        bg.convert('RGB').save(os.path.join(out, name), optimize=True)
    # the small icon in the page: the same tile
    bg = Image.new('RGBA', (64, 64), (64, 64, 64, 255))
    bg.alpha_composite(letter.resize((36, 35), Image.LANCZOS), (14, 14))
    bg.convert('RGB').save(os.path.join(out, 'icon-64.png'), optimize=True)


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('--assets', default=DEFAULT_ASSETS, help='the Android app assets folder (default: %(default)s)')
    args = ap.parse_args()
    if not os.path.exists(os.path.join(args.assets, 'hymns.sqlite')):
        sys.exit('No hymns.sqlite in ' + args.assets + ' (run ./gradlew :sqlite:importSql, or '
                 'sqlite3 app/src/main/assets/hymns.sqlite < sqlite/hymns.sql)')

    t = time.time()
    if os.path.exists(DIST):
        shutil.rmtree(DIST)
    os.makedirs(DIST)
    copy_tree(os.path.join(HERE, 'src'), DIST)
    copy_tree(os.path.join(HERE, 'vendor'), os.path.join(DIST, 'vendor'))

    groups = read_groups()
    version, in_db = build_db(args.assets)
    known = {g['code'] for g in groups}
    for g in in_db:
        if g not in known:
            print('WARNING: hymnal %s is in the database but not in HymnGroup.java; it is left out' % g, file=sys.stderr)
    groups = [g for g in groups if g['code'] in in_db]
    print('database: %(hymns)d hymns, %(dbSize)d bytes' % version)

    sheets, sheet_ids = build_packs(os.path.join(args.assets, 'sheetMei'), '.mei', 'sheets', lambda s: s)
    lyrics, lyric_ids = build_packs(os.path.join(args.assets, 'sheetLyrics'), '.json', 'lyrics', json.loads)
    print('sheets: %d in %d packs; sheet lyrics: %d in %d packs' % (len(sheet_ids), len(sheets), len(lyric_ids), len(lyrics)))
    version['verovio'] = build_verovio(args.assets)
    tunes = build_tunes()
    print('tunes: %d' % len(tunes))
    build_icons()

    version.update({'sheets': sheets, 'lyrics': lyrics, 'app': app_version(), 'built': time.strftime('%Y-%m-%d %H:%M')})
    index = json.dumps({'sheets': sheet_ids, 'lyrics': lyric_ids, 'tunes': tunes}, separators=(',', ':')).encode('utf-8')
    version['indexFile'] = 'data/index-%s.json' % short_hash(index)
    write(os.path.join(DIST, version['indexFile']), index)
    build_id = short_hash(json.dumps(version, sort_keys=True).encode() + b''.join(
        open(os.path.join(HERE, 'src', n), 'rb').read() for n in sorted(os.listdir(os.path.join(HERE, 'src')))))
    version['build'] = build_id
    write(os.path.join(DIST, 'data', 'version.json'), json.dumps(version, indent=1).encode('utf-8'))

    # the hymnals into groups.js, the build into the service worker
    gpath = os.path.join(DIST, 'groups.js')
    src = open(gpath, encoding='utf-8').read()
    write(gpath, src.replace('/*GROUPS*/[]', json.dumps(groups, ensure_ascii=False, indent=1)).encode('utf-8'))
    shell = sorted(os.path.relpath(os.path.join(r, n), DIST).replace(os.sep, '/')
                   for r, _, ns in os.walk(DIST) for n in ns
                   if not re.match(r'(data|sheets|lyrics|verovio|midi)/', os.path.relpath(os.path.join(r, n), DIST).replace(os.sep, '/'))
                   and n != 'sw.js')
    data_files = [version['dbFile'], version['indexFile']] + sorted(sheets.values()) + sorted(lyrics.values()) + [
        'verovio/verovio-toolkit-wasm.js?v=' + version['verovio']]
    swpath = os.path.join(DIST, 'sw.js')
    sw = open(swpath, encoding='utf-8').read()
    sw = sw.replace("'/*BUILD*/'", json.dumps(build_id)).replace('/*SHELL*/[]', json.dumps(['./'] + shell, indent=1)) \
        .replace('/*DATA*/[]', json.dumps(data_files, indent=1))
    write(swpath, sw.encode('utf-8'))

    size = sum(os.path.getsize(os.path.join(r, n)) for r, _, ns in os.walk(DIST) for n in ns)
    print('build %s, %.1f MB in dist/, done in %.1fs' % (build_id, size / 1e6, time.time() - t))


if __name__ == '__main__':
    main()
