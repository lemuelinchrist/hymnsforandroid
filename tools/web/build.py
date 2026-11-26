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
import html
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
RES = os.path.join(ROOT, 'app', 'src', 'main', 'res')
STRINGS = os.path.join(RES, 'values', 'strings.xml')
APP_GRADLE = os.path.join(ROOT, 'app', 'build.gradle')
# the books whose MIDI files are deprecated: their Play button plays the sheet (a shared tune file stays for other books)
SHEET_ONLY_GROUPS = ('NS', 'BF', 'CH')
RAW = os.path.join(ROOT, 'app', 'src', 'main', 'res', 'raw')
MUSIC = os.path.join(ROOT, 'tools', 'lead-sheet-editor', 'music.js')
APP_ICON = os.path.join(ROOT, 'app', 'src', 'main', 'res', 'drawable-xhdpi', 'icon.png')
DIST = os.path.join(HERE, 'dist')

ACCENTS = re.compile('[̀-ͯ]')
TAGS = re.compile(r'<!--.*?-->|<[^>]*>')

# What the web app adds to HymnGroup.java for a hymnal: the text language, and a darker day colour where the app's is
# too light for text on white. The names come from the app (read_groups): the name in the hymnal's own language from
# the native_<code> strings, and HymnGroup.java's English name for the cards when it differs.
DISPLAY = {
    'C': {'lang': 'zh-Hant', 'cjk': True},
    'CS': {'lang': 'zh-Hant', 'cjk': True},
    'Z': {'lang': 'zh-Hans', 'cjk': True},
    'ZS': {'lang': 'zh-Hans', 'cjk': True},
    'CB': {'lang': 'ceb', 'day': '#E67A00'},
    'T': {'lang': 'tl', 'day': '#00897B'},
    'FR': {'lang': 'fr'},
    'FRY': {'lang': 'fr'},
    'S': {'lang': 'es'},
    'SY': {'lang': 'es'},
    'K': {'lang': 'ko', 'cjk': True},
    'G': {'lang': 'de', 'day': '#F4511E'},
    'GY': {'lang': 'de', 'day': '#F4511E'},
    'J': {'lang': 'ja', 'cjk': True, 'day': '#689F38'},
    'I': {'lang': 'id'},
    'CH': {'day': '#8D9124'},
    'F': {'lang': 'fa'},
    'SK': {'lang': 'sk'},
    'GK': {'lang': 'el', 'day': '#0288D1'},
    'SW': {'lang': 'sw'},
    'RUS': {'lang': 'ru'},
    'BUR': {'lang': 'my'},
    'TA': {'lang': 'ta'},
    'UR': {'lang': 'ur'},
    'KI': {'lang': 'ki', 'day': '#E65100'},
    'POR': {'lang': 'pt'},
    'POY': {'lang': 'pt'},
    'POL': {'lang': 'pl'},
}


def norm(text):
    """Search form of a text: no tags, no accents, lower case, words separated by single spaces.
    Must stay identical to norm() in src/db.js."""
    if not text:
        return ''
    text = TAGS.sub(' ', text).replace('&nbsp;', ' ').replace('&amp;', '&')
    text = unicodedata.normalize('NFC', ACCENTS.sub('', unicodedata.normalize('NFD', text)))
    text = text.lower().replace('ς', 'σ')
    # keep letters, digits and marks (the vowel signs of Tamil, Burmese...), like [^\p{L}\p{M}\p{N}] in src/db.js
    return ' '.join(''.join(c if unicodedata.category(c)[0] in 'LMN' else ' ' for c in text).split())


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


def read_names():
    """The app's book and language names in each language of the app, from res/values-*/strings.xml:
    {'zh-Hant': {'book': {'c': '中文（繁體）', ...}, 'language': {'c': '中文', ...}, 'first': 'C'}}.
    'first' is the book a new user starts in (the first_hymn string). English is not listed: HymnGroup.java has it."""
    names = {}
    for folder in sorted(os.listdir(RES)):
        m = re.match(r'values-(.+)$', folder)
        path = os.path.join(RES, folder, 'strings.xml')
        if not m or not os.path.exists(path) or not m.group(1).startswith('b+'):
            continue
        tag = m.group(1).replace('b+', '').replace('+', '-')
        text = open(path, encoding='utf-8').read()
        found = {k: html.unescape(v).replace("\\'", "'") for k, v in
                 re.findall(r'<string name="([a-z_]+)"[^>]*>([^<]*)</string>', text)}
        entry = {'book': {}, 'language': {}}
        for key, value in found.items():
            for kind in ('book', 'language'):
                if key.startswith(kind + '_'):
                    entry[kind][key[len(kind) + 1:]] = value
        first = re.match(r'[A-Za-z]+', found.get('first_hymn', ''))
        if first:
            entry['first'] = first.group(0).upper()
        names[tag] = entry
    return names


def read_groups():
    """The hymnals as HymnGroup.java defines them, in its order: code, name, day and night colour, text direction;
    the name in the hymnal's own language from the app's native_<code> strings, with the English name as 'long'."""
    src = open(ENUM, encoding='utf-8').read()
    native = {m.group(1): html.unescape(m.group(2)) for m in
              re.finditer(r'<string name="native_([a-z]+)"[^>]*>([^<]*)</string>', open(STRINGS, encoding='utf-8').read())}
    rgb = r'Color\.rgb\(\s*0x([0-9A-Fa-f]{2})\s*,\s*0x([0-9A-Fa-f]{2})\s*,\s*0x([0-9A-Fa-f]{2})\s*\)'
    pattern = re.compile(r'^\s+([A-Z]{1,3})\(\s*"([^"]+)"\s*,\s*' + rgb + r'\s*,\s*' + rgb + r'\s*,\s*Gravity\.(\w+)\s*\)', re.M)
    groups = []
    for m in pattern.finditer(src):
        code, name = m.group(1), m.group(2)
        g = {'code': code, 'name': name,
             'day': '#' + ''.join(m.group(i) for i in (3, 4, 5)).upper(),
             'night': '#' + ''.join(m.group(i) for i in (6, 7, 8)).upper()}
        if m.group(9) == 'RIGHT':
            g['rtl'] = True
        g.update(DISPLAY.get(code, {}))
        own = native.get(code.lower())
        if own and own != name:
            g['name'], g['long'] = own, name
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
    for (sql,) in db.execute("select sql from src.sqlite_master where type = 'table' and name in ('hymns', 'stanza', 'link')"
                             ).fetchall():
        db.execute(sql)
    db.execute('create index stanza_hymn on stanza (parent_hymn, n_order)')
    db.execute('insert into hymns select * from src.hymns')
    db.execute('insert into stanza select * from src.stanza')
    db.execute('insert into link select * from src.link')
    # the old name and shape of the piano videos (table `tune`), for pages still running the previous build while the new
    # data downloads; they reload into the new build within seconds. Safe to remove in a later version.
    db.execute("create view tune as select hymn_id as _id, label as comment,"
               " replace(url, 'https://www.youtube.com/watch?v=', '') as youtube_link from link where kind = 'piano' order by id")

    # one row per hymn, in search form: the first lines, subject, author and composer, time, key, tune and meter, and all its
    # stanzas. A hymn with a parent takes the parent's author, composer, key, tune, meter, time, subject and stanzas where it has
    # none, as on its page (SearchIndex.build in the app)
    db.execute('create table search (id text, grp text, first text, title text, chorus text, subject text, people text,'
               ' music text, body text)')
    stanzas = {}
    for pid, text in db.execute('select parent_hymn, text from stanza order by parent_hymn, n_order'):
        stanzas.setdefault(pid, []).append(norm(text))
    cols = ['hymn_group', 'first_stanza_line', 'first_chorus_line', 'main_category', 'sub_category', 'author',
            'composer', 'key', 'tune', 'parent_hymn', 'meter', 'time', 'new_tune', 'title']
    hymns = {r[0]: dict(zip(cols, [str(v or '').strip() for v in r[1:]]))
             for r in db.execute('select _id, ' + ', '.join(cols) + ' from hymns')}

    def inherited(hid):
        h = dict(hymns[hid])
        body = stanzas.get(hid)
        own_tune = False
        cur_new_tune = h['new_tune'] == '1'
        parent, depth = h['parent_hymn'], 0
        while parent in hymns and depth < 10:
            p = hymns[parent]
            if cur_new_tune and p['new_tune'] != '1':
                own_tune = True
            fields = ('author', 'meter', 'title') if own_tune else ('author', 'composer', 'key', 'tune', 'meter', 'time', 'title')
            for f in fields:
                h[f] = h[f] or p[f]
            if not h['main_category']:
                h['main_category'], h['sub_category'] = p['main_category'], p['sub_category']
            body = body or stanzas.get(parent)
            cur_new_tune = p['new_tune'] == '1'
            parent, depth = p['parent_hymn'], depth + 1
        h['body'] = ' | '.join(body or [])
        return h

    rows = []
    for hid in hymns:
        h = inherited(hid)
        # a New Tune's first lines end in " (New Tune)" in the search, so it finds them so (the data has no such text)
        tag = ' (New Tune)' if h['new_tune'] == '1' else ''
        first, chorus = [(h[k] + tag) if h[k] else h[k] for k in ('first_stanza_line', 'first_chorus_line')]
        rows.append((hid, h['hymn_group'], norm(first), norm(h['title']), norm(chorus),
                     norm(h['main_category'] + ' ' + h['sub_category']), norm(h['author'] + ' ' + h['composer']),
                     norm(h['time'] + ' ' + h['key'] + ' ' + h['tune'] + ' ' + h['meter']), h['body']))
    db.executemany('insert into search values (?, ?, ?, ?, ?, ?, ?, ?, ?)', rows)
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


def split_id(hid, group_order):
    m = re.match(r'^([A-Z]{1,3})(\d+)$', hid or '')
    if not m or m.group(1) not in group_order:
        return None
    return m.group(1), int(m.group(2))


def plain_text(html_text):
    t = re.sub(r'<!--[\s\S]*?-->', '', html_text or '')
    t = re.sub(r'<br\s*/?>', '\n', t, flags=re.I)
    t = re.sub(r'<[^>]*>', '', t)
    return t.replace('&nbsp;', ' ').replace('&amp;', '&').replace('&lt;', '<').replace('&gt;', '>').strip()


def build_hymn_shards(assets, groups, sheet_ids, lyric_ids, tunes):
    """Pre-resolved ~100-hymn shards (<group>-<bucket>.json.gz) and per-book counts, so opening a shared hymn link
    or the home screen never waits for the 14 MB SQLite database."""
    group_order = {g['code']: i for i, g in enumerate(groups)}
    con = sqlite3.connect(os.path.join(assets, 'hymns.sqlite'))
    con.row_factory = sqlite3.Row
    raw = {r['_id']: dict(r) for r in con.execute('select * from hymns')}
    stanzas = {}
    for r in con.execute('select parent_hymn, no, text, note from stanza order by parent_hymn, n_order'):
        stanzas.setdefault(r['parent_hymn'], []).append({'no': r['no'], 'text': r['text'], 'note': r['note']})
    links = {}
    for r in con.execute('select hymn_id, kind, label, album, instrumental, url from link order by hymn_id, n_order'):
        links.setdefault(r['hymn_id'], []).append(dict(r))
    con.close()

    def related_ids(s):
        return [x.strip().upper() for x in (s or '').split(',') if x.strip()]

    inherited_fields = ('author', 'composer', 'time', 'tune', 'key', 'meter', 'verse')
    tune_fields = {'composer', 'time', 'tune', 'key'}
    resolved = {}

    def tunes_differ(a, b):
        ta, tb = (a or '').strip(), (b or '').strip()
        if not ta or ta == '0' or not tb or tb == '0':
            return False
        return ta != tb and not ta.startswith(tb) and not tb.startswith(ta)

    sheets_by_tune = {}
    for hid, row in raw.items():
        if hid in sheet_ids:
            t = (row.get('tune') or '').strip()
            if t and t != '0':
                sheets_by_tune.setdefault(t, []).append(hid)

    def find_sheet_by_tune(h):
        t = (h.get('tune') or '').strip()
        cands = sheets_by_tune.get(t) if (t and t != '0') else None
        if not cands:
            return None
        grp = h['group']
        twin_id = ('C' + str(h['no'])) if grp == 'Z' else (('CS' + str(h['no'])) if grp == 'ZS' else None)
        is_zh = grp in ('C', 'CS', 'Z', 'ZS')
        pid = h['parentId']
        best, best_key = None, None
        for cid in cands:
            if cid == h['id']:
                continue
            crow = raw[cid]
            cgrp = crow['hymn_group']
            if cid == twin_id:
                rank = 0
            elif cgrp == 'BF' and pid and crow.get('parent_hymn') == pid:
                rank = 1
            elif is_zh:
                rank = 2 if cgrp in ('C', 'CS') else (3 if cgrp == 'BF' else (4 if cgrp == 'E' else (5 if cgrp == 'NS' else 6)))
            else:
                rank = 2 if cgrp == 'E' else (3 if cgrp == 'BF' else (4 if cgrp == 'NS' else (5 if cgrp == 'CH' else (6 if cgrp in ('C', 'CS') else 7))))
            try:
                cno = int(crow['no'])
            except Exception:
                cno = 10**9
            key = (rank, cno)
            if best_key is None or key < best_key:
                best_key = key
                best = cid
        return best

    def resolve(hid, seen):
        if hid in resolved:
            return resolved[hid]
        if hid in seen or hid not in raw:
            return None
        row = raw[hid]
        seen = seen | {hid}
        own_rel = [r for r in related_ids(row.get('related')) if r != hid]
        h = {
            'id': hid, 'group': row['hymn_group'], 'no': row['no'],
            'parentId': row.get('parent_hymn') or None,
            'first': row.get('first_stanza_line'), 'chorus': row.get('first_chorus_line'),
            'title': row.get('title') or None,
            'category': row.get('main_category'), 'subcategory': row.get('sub_category'),
            'stanzas': stanzas.get(hid, []), 'related': own_rel,
            'newTune': row.get('new_tune') == 1,
        }
        for f in inherited_fields:
            h[f] = row.get(f)
        pid = h['parentId']
        parent = resolve(pid, seen) if pid and pid != hid else None
        h['ownTune'] = bool(parent and ((row.get('new_tune') == 1 and not parent['newTune'])
                                        or tunes_differ(h['tune'], parent['tune'])))
        if parent:
            for f in inherited_fields:
                if not h[f] and not (h['ownTune'] and f in tune_fields):
                    h[f] = parent[f]
            if not h['title']:
                h['title'] = parent['title'] or None
            if not h['category']:
                h['category'], h['subcategory'] = parent['category'], parent['subcategory']
            if not h['stanzas']:
                h['stanzas'] = parent['stanzas']
            rel_set = set(own_rel)
            rel_list = list(own_rel)
            for r in parent['related']:
                if r != hid and r not in rel_set:
                    rel_set.add(r)
                    rel_list.append(r)
            h['related'] = rel_list
        if not h['first'] and h['stanzas']:
            h['first'] = plain_text(h['stanzas'][0]['text']).split('\n')[0]
        if hid in sheet_ids:
            h['sheetId'] = hid
        elif parent and not h['ownTune']:
            h['sheetId'] = parent['sheetId']
        elif h['ownTune']:
            h['sheetId'] = find_sheet_by_tune(h)
        else:
            h['sheetId'] = None
        if not h['sheetId']:
            h['sheetId'] = find_sheet_by_tune(h)   # none of its own or its parent's (or no parent): a same-tune sheet
        h['lyricsId'] = hid if (h['sheetId'] and h['sheetId'] != hid and hid in lyric_ids) else None
        resolved[hid] = h
        return h

    for hid in sorted(raw):
        resolve(hid, set())

    # neighbours, counts, children, raw tune map
    by_group = {}
    children = {}
    by_raw_tune = {}
    for hid, h in resolved.items():
        by_group.setdefault(h['group'], []).append(hid)
        pid = raw[hid].get('parent_hymn')
        if pid:
            children.setdefault(pid, []).append(hid)
        t = (raw[hid].get('tune') or '').strip()
        if t:
            by_raw_tune.setdefault(t, []).append((hid, pid))

    counts = {g: len(ids) for g, ids in sorted(by_group.items())}
    prev_next = {}
    for g, ids in by_group.items():
        ids.sort(key=lambda i: int(resolved[i]['no']))
        for idx, hid in enumerate(ids):
            prev_next[hid] = (ids[idx - 1] if idx > 0 else None, ids[idx + 1] if idx + 1 < len(ids) else None)

    def get_videos(hid, h):
        for candidate in [hid, None if h['ownTune'] else h['parentId']]:
            if not candidate:
                continue
            out = [{'url': (x['url'] or '').strip(), 'label': (x['label'] or '').strip()}
                   for x in links.get(candidate, ()) if x['kind'] == 'piano' and (x['url'] or '').strip()]
            if out:
                return out
        return []

    def get_recordings(hid):
        recs = [x for x in links.get(hid, ()) if x['kind'] in ('youtube', 'soundcloud') and x['instrumental'] != 1 and (x['url'] or '').strip()]
        recs.sort(key=lambda x: x['kind'], reverse=True)   # youtube before soundcloud, preserving n_order (Python sort is stable)
        return [{'kind': x['kind'], 'label': (x['label'] or '').strip(), 'album': (x['album'] or '').strip(),
                 'instrumental': x['instrumental'] == 1, 'url': (x['url'] or '').strip()} for x in recs]

    def get_instrumentals(tune_code):
        if not tune_code or tune_code == '0':
            return []
        recs = [x for x in links.get(tune_code, ()) if x['kind'] in ('youtube', 'soundcloud') and x['instrumental'] == 1 and (x['url'] or '').strip()]
        recs.sort(key=lambda x: x['kind'], reverse=True)
        return [{'kind': x['kind'], 'label': (x['label'] or '').strip(), 'album': (x['album'] or '').strip(),
                 'instrumental': True, 'url': (x['url'] or '').strip()} for x in recs]

    def get_inherited_links(hid, h, recs):
        if recs or h['ownTune']:
            return None
        pid = h['parentId']
        for _ in range(5):
            if not pid or pid == hid:
                break
            plist = get_recordings(pid)
            if plist:
                return {'from': pid, 'recordings': plist}
            prow = raw.get(pid)
            up = prow and prow.get('parent_hymn') and raw.get(prow['parent_hymn'])
            if prow and prow.get('new_tune') == 1 and up and up.get('new_tune') != 1:
                return None
            pid = prow and prow.get('parent_hymn')
        return None

    def get_new_tunes(hid):
        nt = [cid for cid in children.get(hid, ()) if raw[cid].get('new_tune') == 1 and raw[cid]['hymn_group'] == 'BF']
        nt.sort(key=lambda cid: int(raw[cid]['no']))
        return [{'id': cid, 'recordings': get_recordings(cid) + get_instrumentals((resolved[cid]['tune'] or '').strip())} for cid in nt]

    fam_cache = {}

    def get_family(hid):
        if hid in fam_cache:
            return fam_cache[hid]
        h = resolved[hid]
        root = hid
        cur = h
        for _ in range(10):
            if not cur or not cur['parentId'] or cur['parentId'] == cur['id']:
                break
            root = cur['parentId']
            cur = resolved.get(root)
        ids = {root, *h['related']}
        queue, visited = [root], {root}
        i = 0
        while i < len(queue) and i < 200:
            qid = queue[i]
            i += 1
            qrow = raw.get(qid)
            if qrow:
                ids.update(related_ids(qrow.get('related')))
            for cid in children.get(qid, ()):
                ids.add(cid)
                if cid not in visited:
                    visited.add(cid)
                    queue.append(cid)
        out = []
        for fid in ids:
            sp = split_id(fid, group_order)
            if sp and fid in resolved:
                out.append((group_order[sp[0]], sp[1], fid))
        out.sort()
        res = [fid for _, _, fid in out]
        fam_cache[hid] = res
        return res

    def related_in(root_id, grp):
        for fid in get_family(root_id):
            if fid != root_id and resolved[fid]['group'] == grp:
                return fid
        return None

    def summary(fid):
        x = resolved[fid]
        return {'id': x['id'], 'group': x['group'], 'no': x['no'], 'first': x['first']}

    shards, skipped = {}, []
    for hid, h in resolved.items():
        sp = split_id(hid, group_order)
        if not sp:
            skipped.append(hid)
            continue
        grp, no_int = sp
        recs = get_recordings(hid)
        tune_code = (h['tune'] or '').strip()
        mine = h['parentId'] or hid
        roots, seen_roots = [], set()
        if tune_code and tune_code != '0':
            for r_id, r_parent in by_raw_tune.get(tune_code, ()):
                root = r_parent or r_id
                if root != mine and root in resolved and root not in seen_roots:
                    seen_roots.add(root)
                    roots.append(root)
        same_tune = []
        for root in roots:
            rsp = split_id(root, group_order)
            pick = root if (rsp and rsp[0] == grp) else related_in(root, grp)
            if pick:
                if pick != hid:
                    same_tune.append({'d': summary(pick)})
            else:
                same_tune.append({'r': root, 'f': [summary(fid) for fid in get_family(root)]})

        pv, nx = prev_next[hid]
        rec = dict(h)
        tkey = tune_code.lower()
        rec['_tuneFile'] = tunes.get(tkey) if (tkey and tkey != '0') else None
        if rec.get('group') in SHEET_ONLY_GROUPS and rec.get('sheetId'):
            rec['_tuneFile'] = None   # New Songs, Be Filled and Children's play their sheet, never a MIDI file (2026-11-24)
        rec['_prev'], rec['_next'] = pv, nx
        rec['_family'] = get_family(hid)
        rec['_videos'] = get_videos(hid, h)
        rec['_recordings'] = recs
        rec['_instrumentals'] = get_instrumentals(tune_code)
        rec['_inheritedLinks'] = get_inherited_links(hid, h, recs)
        rec['_newTunes'] = get_new_tunes(hid)
        rec['_sameTune'] = same_tune
        shards.setdefault((grp, no_int // 100), {})[hid] = rec

    if skipped:
        print('WARNING: %d hymn(s) excluded from shards (unrecognized ID format): %s' % (len(skipped), ', '.join(sorted(skipped)[:20])),
              file=sys.stderr)

    # Hash serialized shard contents (which encode DB + sheets + lyrics + tunes) so changes to sheets or MIDI
    # invalidate stale shards even when hymns.sqlite is unchanged.
    packed_shards = []
    shard_buckets = {}
    h_all = hashlib.sha256()
    for (grp, bucket), items in sorted(shards.items()):
        data = json.dumps(items, ensure_ascii=False, separators=(',', ':'), sort_keys=True).encode('utf-8')
        h_all.update(('%s-%d\0' % (grp, bucket)).encode('utf-8'))
        h_all.update(data)
        packed_shards.append((grp, bucket, gzip.compress(data, 9, mtime=0)))
        shard_buckets.setdefault(grp, []).append(bucket)
    hymns_dir = 'hymns/' + h_all.hexdigest()[:10]
    for grp, bucket, gz in packed_shards:
        write(os.path.join(DIST, hymns_dir, '%s-%d.json.gz' % (grp, bucket)), gz)
    return hymns_dir, shard_buckets, counts


def group_of(hymn_id):
    m = re.match(r'^([A-Z]{1,3})\d', hymn_id)
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
    for name in sorted(os.listdir(RAW)) if os.path.isdir(RAW) else []:   # no tune files since 2026-11-26: every hymn plays its sheet
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
    # the rules of the piano part ("Both hands") are the lead sheet editor's: one file for both
    shutil.copyfile(MUSIC, os.path.join(DIST, 'music.js'))

    groups = read_groups()
    names = read_names()
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
    hymns_dir, shard_buckets, counts = build_hymn_shards(args.assets, groups, set(sheet_ids), set(lyric_ids), tunes)
    version['hymnsDir'] = hymns_dir
    version['counts'] = counts
    version['shards'] = shard_buckets
    print('shards: %d in %s/' % (sum(len(v) for v in shard_buckets.values()), hymns_dir))
    index = json.dumps({'sheets': sheet_ids, 'lyrics': lyric_ids, 'tunes': tunes}, separators=(',', ':')).encode('utf-8')
    version['indexFile'] = 'data/index-%s.json' % short_hash(index)
    write(os.path.join(DIST, version['indexFile']), index)
    lazy_files = {'music.js', 'sheet.js', 'sheetpanel.js', 'sheetplayer.js', 'piano.js', 'pianopanel.js', 'editor.js'}
    all_shell = sorted(os.path.relpath(os.path.join(r, n), DIST).replace(os.sep, '/')
                       for r, _, ns in os.walk(DIST) for n in ns
                       if not re.match(r'(data|sheets|lyrics|hymns|verovio|midi)/', os.path.relpath(os.path.join(r, n), DIST).replace(os.sep, '/'))
                       and n != 'sw.js')
    lazy = [p for p in all_shell if p in lazy_files or p.startswith('vendor/')]
    shell = [p for p in all_shell if p not in set(lazy)]
    version['lazy'] = lazy
    build_id = short_hash(json.dumps(version, sort_keys=True).encode() + b''.join(
        open(os.path.join(HERE, 'src', n), 'rb').read() for n in sorted(os.listdir(os.path.join(HERE, 'src')))
    ) + open(MUSIC, 'rb').read() + json.dumps([groups, names], sort_keys=True).encode())
    version['build'] = build_id
    write(os.path.join(DIST, 'data', 'version.json'), json.dumps(version, indent=1).encode('utf-8'))

    # the hymnals into groups.js, the build into the service worker
    gpath = os.path.join(DIST, 'groups.js')
    src = open(gpath, encoding='utf-8').read()
    src = src.replace('/*GROUPS*/[]', json.dumps(groups, ensure_ascii=False, indent=1)).replace('/*NAMES*/{}', json.dumps(names, ensure_ascii=False, indent=1))
    write(gpath, src.encode('utf-8'))
    data_files = [version['dbFile'], version['indexFile']] + sorted(sheets.values()) + sorted(lyrics.values()) + [
        'verovio/verovio-toolkit-wasm.js?v=' + version['verovio']]
    swpath = os.path.join(DIST, 'sw.js')
    sw = open(swpath, encoding='utf-8').read()
    sw = sw.replace("'/*BUILD*/'", json.dumps(build_id)).replace('/*SHELL*/[]', json.dumps(['./'] + shell, indent=1)) \
        .replace('/*LAZY*/[]', json.dumps(lazy, indent=1)) \
        .replace('/*DATA*/[]', json.dumps(data_files, indent=1)) \
        .replace("'/*HYMNS_DIR*/'", json.dumps(hymns_dir))
    write(swpath, sw.encode('utf-8'))

    # loose pages that are not part of the app (extra/<folder>/...), published beside it; the service worker leaves them alone
    extra = os.path.join(HERE, 'extra')
    if os.path.isdir(extra):
        shutil.copytree(extra, os.path.join(DIST, 'extra'))

    size = sum(os.path.getsize(os.path.join(r, n)) for r, _, ns in os.walk(DIST) for n in ns)
    print('build %s, %.1f MB in dist/, done in %.1fs' % (build_id, size / 1e6, time.time() - t))


if __name__ == '__main__':
    main()
