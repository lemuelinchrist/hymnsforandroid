"""Verification checks on an IR (DESIGN.md §9).

V1 measure arithmetic, V3 tune code vs database.
"""
import os
import re
import sqlite3
from fractions import Fraction

HERE = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
SQL_DUMP = os.path.join(HERE, '..', 'sqlite/hymns.sql')
DB = os.path.join(HERE, 'build', 'hymns_snapshot.sqlite')     # private copy: the shared hymns.sqlite is rewritten by Gradle builds


def ensure_snapshot():
    """(Re)build build/hymns_snapshot.sqlite from the committed sqlite/hymns.sql if missing or older than it."""
    import subprocess
    if os.path.exists(DB) and os.path.getmtime(DB) >= os.path.getmtime(SQL_DUMP):
        return
    os.makedirs(os.path.dirname(DB), exist_ok=True)
    tmp = DB + '.tmp'
    if os.path.exists(tmp):
        os.remove(tmp)
    with open(SQL_DUMP, 'rb') as fh:
        subprocess.run(['sqlite3', tmp], stdin=fh, check=True)
    os.replace(tmp, DB)


ensure_snapshot()
LETTERS = 'CDEFGAB'

_db = None


def tune_of(hymn_id):
    global _db
    if _db is None:
        _db = sqlite3.connect(DB)
    r = _db.execute('select tune from hymns where _id=?', (hymn_id,)).fetchone()
    return r[0].strip() if r and r[0] and r[0].strip() else None


def dur_of(e):
    d = Fraction(1, e['dur'])
    d = d * (2 - Fraction(1, 2 ** e['dots'])) if e['dots'] else d
    if e.get('tuplet'):
        d = d * Fraction(e['tuplet']['den'], e['tuplet']['num'])
    return d


def v1_measures(ir):
    """Return list of problems. Partial first measure (pickup) and last measure completing it are allowed."""
    t0 = ir['time']
    if not t0:
        return ['no time signature']
    cur = Fraction(t0['num'], t0['den'])
    fulls, sums = [], []
    for m in ir['measures']:
        if m.get('time_change'):
            tc = m['time_change']
            cur = Fraction(tc['num'], tc['den'])
        fulls.append(cur)
        sums.append(sum((dur_of(e) for e in m['events']), Fraction(0)))
    probs = []
    for i, (m, s, full) in enumerate(zip(ir['measures'], sums, fulls)):
        if s == full:
            continue
        if i == 0 and s < full:
            continue                                   # pickup
        if i == len(sums) - 1 and sums[0] < fulls[0] and sums[0] + s == fulls[0]:
            continue                                   # completes the pickup
        probs.append('measure %d (system %d) has %s, expected %s' % (m['n'], m['system'], s, full))
    return probs


def degrees(ir):
    key = ir['key']
    tonic = key['tonic'][0]
    ti = LETTERS.index(tonic)
    out = []
    prev_tied = False
    for m in ir['measures']:
        for e in m['events']:
            if e['kind'] != 'note':
                continue
            if not prev_tied:                       # the tune code counts a tied pair once
                out.append(str((LETTERS.index(e['letter']) - ti) % 7 + 1))
            prev_tied = e['tie']
    return ''.join(out)


def edit_distance(a, b):
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        cur = [i]
        for j, cb in enumerate(b, 1):
            cur.append(min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (ca != cb)))
        prev = cur
    return prev[-1]


def v3_tune(ir, hymn_id):
    """None = no tune code; else (status, tune, got) with status 'exact' | 'soft' | 'fail'.

    'soft' = within a couple of edits (substitution, inserted or dropped digit) over a code of >= 12 digits:
    the database tune code itself has typos (verified by eye on E534: the sheet shows G = degree 3, the code
    says 4), and counts repeated notes inconsistently."""
    tune = tune_of(hymn_id)
    if not tune:
        return None
    got = degrees(ir)
    n = min(len(tune), len(got))
    if n < min(len(tune), 8):
        return 'fail', tune, got[:len(tune)]
    a, b = tune[:n + 2], got[:n + 2]
    if tune[:n] == got[:n]:
        return 'exact', tune, got[:len(tune)]
    d = min(edit_distance(tune[:n], got[:n + k]) for k in (-1, 0, 1, 2) if n + k > 0)
    if n >= 12 and d <= max(2, n // 14):
        return 'soft', tune, got[:len(tune)]
    return 'fail', tune, got[:len(tune)]

def _norm_word(w):
    w = w.lower().replace('\u2019', "'").replace('\u2018', "'")
    return re.sub(r"[^a-z0-9']", '', w).strip("'")


def db_words(hymn_id):
    global _db
    if _db is None:
        _db = sqlite3.connect(DB)
    words = set()
    for (text,) in _db.execute('select text from stanza where parent_hymn=?', (hymn_id,)):
        text = re.sub(r'<[^>]+>', ' ', text or '')
        for w in re.split(r'[\s\u2014\u2013-]+', text):
            n = _norm_word(w)
            if n:
                words.add(n)
    return words


def ir_words(ir):
    """Rebuild printed words from syllables: a syllable followed by a hyphen continues the word."""
    lines = {}
    for m in ir['measures']:
        for e in m['events']:
            for k, v in (e.get('lyrics') or {}).items():
                lines.setdefault(int(k), []).append((v['text'], v['hyphen']))
    out = []
    for k in sorted(lines):
        cur = ''
        for text, hy in lines[k]:
            cur += text
            if not hy:
                for w in re.split(r'[\u2014\u2013]+', cur):
                    n = _norm_word(w)
                    if n:
                        out.append(n)
                cur = ''
        if cur:
            out.append(_norm_word(cur))
    return out


def v8_lyrics(ir, hymn_id):
    """None = nothing to check; else list of IR words that don't occur in the database stanzas."""
    dbw = db_words(hymn_id)
    if not dbw:
        return None
    words = ir_words(ir)
    if not words:
        return None
    return [w for w in words if w not in dbw]


def repair_hyphens(ir, hymn_id):
    """Original sheets omit a hyphen when syllables are tightly spaced. Where the database proves that
    consecutive syllables form one word (and at least one piece is not a word by itself), restore the
    hyphen flag. Returns the number of hyphens restored."""
    dbw = db_words(hymn_id)
    if not dbw:
        return 0
    lines = {}
    for m in ir['measures']:
        for e in m['events']:
            for k, v in (e.get('lyrics') or {}).items():
                lines.setdefault(int(k), []).append(v)
    fixed = 0
    for syls in lines.values():
        i = 0
        while i < len(syls):
            done = False
            acc = ''
            for L in range(1, 5):
                if i + L > len(syls):
                    break
                acc += _norm_word(syls[i + L - 1]['text'])
                if L >= 2 and acc in dbw and any(not syls[j]['hyphen'] for j in range(i, i + L - 1)) and \
                        any(_norm_word(syls[j]['text']) not in dbw for j in range(i, i + L)):
                    for j in range(i, i + L - 1):
                        if not syls[j]['hyphen']:
                            syls[j]['hyphen'] = True
                            fixed += 1
                    i += L
                    done = True
                    break
            if not done:
                i += 1
    return fixed


# ---------------------------------------------------------------- V4: MIDI melody (top voice)
import struct

RAW = os.path.join(HERE, '..', 'app/src/main/res/raw')
PC = {'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11}


def midi_top_voice(path):
    """Highest note-on pitch at each onset tick, in time order."""
    b = open(path, 'rb').read()
    ntr = struct.unpack('>H', b[10:12])[0]
    i = 14
    onsets = {}
    for _ in range(ntr):
        ln = struct.unpack('>I', b[i + 4:i + 8])[0]
        j, end, run, tick = i + 8, i + 8 + ln, None, 0
        while j < end:
            val = 0
            while True:
                c = b[j]
                j += 1
                val = (val << 7) | (c & 127)
                if c < 128:
                    break
            tick += val
            st = b[j]
            if st == 0xFF:
                n, k = 0, j + 2
                while True:
                    c = b[k]
                    k += 1
                    n = (n << 7) | (c & 127)
                    if c < 128:
                        break
                j = k + n
                continue
            if st in (0xF0, 0xF7):
                j += 2 + b[j + 1]
                continue
            if st >= 0x80:
                run = st
                j += 1
            hi = run >> 4
            if hi in (0xC, 0xD):
                j += 1
                continue
            d1, d2 = b[j], b[j + 1]
            j += 2
            if hi == 9 and d2 > 0:
                onsets[tick] = max(onsets.get(tick, 0), d1)
        i = end
    return [onsets[t] for t in sorted(onsets)]


def ir_pitches(ir, collapse_ties=False):
    out, prev_tied = [], False
    for m in ir['measures']:
        for e in m['events']:
            if e['kind'] != 'note':
                continue
            if not (collapse_ties and prev_tied):
                out.append(12 * (e['octave'] + 1) + PC[e['letter']] + e['alter'])
            prev_tied = e['tie']
    return out


def v4_midi(ir, hymn_id):
    """None = no MIDI; else (status, mismatches, n). Compares pitch classes of our melody with the MIDI top voice
    over the shorter length (the MIDI may stop early or repeat)."""
    tune = tune_of(hymn_id)
    if not tune:
        return None
    path = os.path.join(RAW, 'm%s.mid' % tune)
    if not os.path.exists(path):
        return None
    try:
        mel = midi_top_voice(path)
    except Exception:  # noqa: BLE001
        return None
    ours = ir_pitches(ir, collapse_ties=True)
    if min(len(mel), len(ours)) < 9:
        return None
    # the MIDI is stored in one fixed key per tune: compare intervals, which survive transposition
    im = [b - a for a, b in zip(mel, mel[1:])]
    io = [b - a for a, b in zip(ours, ours[1:])]
    n = min(len(im), len(io))
    bad = sum(1 for a, b in zip(im[:n], io[:n]) if a != b)
    return ('exact' if bad == 0 else 'soft' if bad <= 2 else 'fail'), bad, n


def v8_ok(miss, words):
    """Lyric words absent from the database: tolerate a few (spelling variants, partial DB text)."""
    if miss is None:
        return True
    return len(set(miss)) <= max(2, int(0.05 * len(set(words))))
