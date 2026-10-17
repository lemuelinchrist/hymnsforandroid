"""Fit the French verse 1 / chorus of a hymn under the notes of its English sheet.

For every French hymn (FR<n>) whose sheet is borrowed from an English hymn (E<m>), this reads
  - the notes that carry a syllable in app/src/main/assets/sheetMei/<parent>.mei
  - the English stanza lines (database) to find how many notes each phrase has
  - the French stanza lines (database)
and picks, for every French word, a way of singing it (french.py) so that each phrase fills exactly its notes.
When the French has a few syllables too few or too many, a syllable is held over two notes or two weak syllables
share a note (what a choir does); those hymns are marked 'adapted' for a French speaker to look at.

Output: app/src/main/assets/sheetLyrics/FR<n>.json, sheet-lyrics/review/ (what to look at), build/report.csv.
usage: python3 align.py [FR1 FR2 ...]      overrides: sheet-lyrics/overrides/FR<n>.txt (see README.md)
"""
import argparse
import csv
import json
import os
import re
import sqlite3
import sys
import unicodedata
import xml.etree.ElementTree as ET
from functools import lru_cache

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
DB = os.path.join(ROOT, 'app/src/main/assets/hymns.sqlite')
MEI = os.path.join(ROOT, 'app/src/main/assets/sheetMei')
OUT = os.path.join(ROOT, 'app/src/main/assets/sheetLyrics')
OVERRIDES = os.path.join(HERE, 'overrides')
REVIEW_DIR = os.path.join(HERE, 'review')
sys.path.insert(0, HERE)
from french import word_readings  # noqa: E402
import chinese  # noqa: E402

NS = {'m': 'http://www.music-encoding.org/ns/mei'}
XMLID = '{http://www.w3.org/XML/1998/namespace}id'
VOWEL_LETTERS = r'aeiouyàâäéèêëîïôöùûüœæ'
MAX_ADJUST = 3          # most syllables held or merged in one phrase
HOLD_COST, MERGE_COST = 3, 5
JOIN = '‿'         # a tie under one note: two syllables sung on it
WEAK = {'e', 'es', 'le', 'la', 'de', 'je', 'me', 'te', 'se', 'ne', 'ce', 'que', 'ent', 'les', 'des', 'tes', 'mes', 'ses', 'et', 'est', 'ou'}


# ------------------------------------------------------------------ reading the data
def letters(s):
    """The letters of a text in any script (accents dropped), for comparing a database line with the syllables of a sheet."""
    s = unicodedata.normalize('NFD', s.lower())
    return ''.join(c for c in s if unicodedata.category(c)[0] in 'LN' and unicodedata.category(c) != 'Mn')


def db_stanzas(c, hid):
    out = {}
    for no, text in c.execute("select no,text from stanza where parent_hymn=? order by n_order", (hid,)):
        lines = [l.replace('\xa0', ' ').strip() for l in text.split('<br/>')]
        out[no] = [l for l in lines if l]
    return out


def mei_slots(path):
    """Notes that carry a syllable of verse 1, in order: [{id, label, text, wordpos, dur}]."""
    root = ET.parse(path).getroot()
    slots = []
    for note in root.iter('{%s}note' % NS['m']):
        v = None
        for verse in note.findall('m:verse', NS):
            if verse.get('n') == '1':
                v = verse
        if v is None:
            continue
        syl = v.find('m:syl', NS)
        if syl is None:
            continue
        label = v.find('m:label', NS)
        try:
            dur = int(note.get('dur') or 4)
        except ValueError:
            dur = 4
        slots.append({'id': note.get(XMLID), 'label': label.text if label is not None else None,
                      'text': (syl.text or ''), 'wordpos': syl.get('wordpos'), 'dur': dur})
    return slots


def segments(slots):
    """Split the syllable-bearing notes into the lyric blocks '1.', '(C)' ... in order."""
    segs = []
    for s in slots:
        if s['label'] or not segs:
            segs.append({'label': s['label'] or '1.', 'slots': []})
        segs[-1]['slots'].append(s)
    return segs


def english_words(slots):
    words, cur = [], []
    for s in slots:
        cur.append(s)
        if s['wordpos'] in (None, 't'):
            words.append(cur)
            cur = []
    if cur:
        words.append(cur)
    return words


def english_lines(slots, lines, allow_more=False):
    """Slots per English line, matching the database line text against the syllables letter by letter."""
    words = english_words(slots)
    result, wi = [], 0
    for line in lines:
        need = len(letters(line))
        got = cnt = 0
        while wi < len(words) and got < need:
            got += len(letters(''.join(s['text'] for s in words[wi])))
            cnt += len(words[wi])
            wi += 1
        if got != need:
            return None, 'English line "%s" does not match the notes' % line
        result.append(cnt)
    if wi != len(words) and not allow_more:
        return None, 'English text is shorter than the notes (%d words left)' % (len(words) - wi)
    return result, None


def punctuation_groups(slots):
    """Fallback when the English text does not explain the notes (repeats): a phrase ends at a word ending in , ; . ! ? : or a dash."""
    groups, cnt = [], 0
    for w in english_words(slots):
        cnt += len(w)
        if re.search(r'[,;.!?:—–)”’\']\s*$', ''.join(s['text'] for s in w)):
            groups.append(cnt)
            cnt = 0
    if cnt:
        groups.append(cnt)
    return groups


def phrase_sequence(slots, en, key):
    """Follow the music: which stanza line does each phrase sing? The syllables of the English sheet are matched, letter by
    letter, against the lines of its stanza (and chorus); a repeat shows up as a line used again.
    Returns [(stanza, line index, number of notes)] or None when the text does not explain the notes."""
    cands = []
    for k in (key, 'chorus'):
        if k and k in en:
            for i, line in enumerate(en[k]):
                cands.append((k, i, letters(line)))
    if not cands:
        return None
    words = english_words(slots)
    wl = [letters(''.join(s['text'] for s in w)) for w in words]
    seq, wi, last = [], 0, None
    while wi < len(words):
        found = None
        acc = ''
        for m in range(1, min(len(words) - wi, 14) + 1):
            acc += wl[wi + m - 1]
            if not acc:
                continue
            hits = [cd for cd in cands if cd[2] == acc]
            if hits:
                nxt = (last[0], last[1] + 1) if last else (cands[0][0], 0)
                pick = next((h for h in hits if (h[0], h[1]) == nxt), None)
                if pick is None:
                    pick = hits[0]
                found = (m, pick)
                break
        if not found:
            return None
        m, pick = found
        seq.append((pick[0], pick[1], sum(len(w) for w in words[wi:wi + m])))
        last = (pick[0], pick[1])
        wi += m
    return seq


def repeated_lines(slots, en, fr, key):
    """Target-language lines in the order the music sings them, with the notes of each, when the music repeats lines the
    target stanza prints once, or the target stanza has fewer lines than the English one (a Chinese line often covers two
    English lines). Needs the line counts to be a whole multiple. Returns (notes per line, lines) or None."""
    seq = phrase_sequence(slots, en, key)
    if not seq:
        return None
    ratio = {}
    for k in {k for k, _, _ in seq}:
        e, f = len(en.get(k, [])), len(fr.get(k, []))
        if not f or e % f:
            return None
        ratio[k] = e // f
    repeats = len({(k, i) for k, i, _ in seq}) != len(seq)
    if not repeats and all(r == 1 for r in ratio.values()):
        return None                                    # the usual way works
    groups, lines, prev = [], [], None
    for k, i, n in seq:
        ti = i // ratio[k]
        if prev == (k, ti) and ratio[k] > 1 and groups:
            groups[-1] += n                            # the second half of a line that covers two English lines
        else:
            groups.append(n)
            lines.append(fr[k][ti])
        prev = (k, ti)
    return groups, lines


def english_groups(slots, en, key):
    """Slot counts per English phrase: the stanza's lines, then the chorus' lines when notes are left, then the rest by punctuation."""
    lines = list(en.get(key, []))
    per_line, err = (None, 'no English stanza %s in the database' % key) if not lines else english_lines(slots, lines, allow_more=True)
    if err:
        return None, False, err
    used = sum(per_line)
    if used < len(slots):
        rest = slots[used:]
        if key != 'chorus' and en.get('chorus'):
            more, err2 = english_lines(rest, en['chorus'])
            if not err2:
                return per_line + more, True, None
        per_line = per_line + punctuation_groups(rest)
    return per_line, False, None


# ------------------------------------------------------------------ French words
TOKEN = re.compile(r"\S+")
PUNCT = re.compile(r"^([^\wà-ÿœŒ]*)(.*?)([^\wà-ÿœŒ]*)$", re.S)


def tokens(line):
    """Words of a French line: [(prefix, core, suffix)]; hyphenated compounds are separate words (joined again later)."""
    line = re.sub(r"(?<=\w)\s*([’'])\s+(?=\w)", r'\1', line)     # data typos like "L' Agneau"
    line = re.sub(r"(?<=\w)\s+([’'])(?=\w)", r'\1', line)         # and "L 'Esprit"
    out = []
    for raw in TOKEN.findall(line):
        parts = raw.split('-') if re.search(r'\w-\w', raw) else [raw]
        merged = []
        for part in parts:                                     # a-t-il: the euphonic t goes with il
            if merged and merged[-1].lower() in ('t', 'n\u2019a-t', "n'a-t"):
                merged[-1] = merged[-1] + '-' + part
            else:
                merged.append(part)
        parts = merged
        for k, part in enumerate(parts):
            pre, core, suf = PUNCT.match(part).groups()
            if k < len(parts) - 1:
                suf = suf + '-'
            if core:
                out.append((pre, core, suf))
            elif out:
                p, c, s = out[-1]
                out[-1] = (p, c, s + pre + suf)
    return out


def french_options(lines):
    flat = []
    for line in lines:
        toks = tokens(line)
        for i, tk in enumerate(toks):
            flat.append((tk, i == len(toks) - 1))
    options = []
    for idx, ((pre, core, suf), last) in enumerate(flat):
        nxt = None
        if not last and idx + 1 < len(flat):
            nxt = flat[idx + 1][0][1]
        reads = [(s, c, t) for s, c, t in word_readings(core, nxt, line_end=last) if s]
        options.append((pre, core, suf, reads, last))
    return options


LANG = {'name': 'fr'}


def word_options(lines):
    """The words of the lines with their possible sung readings, for the language being processed."""
    return chinese.options(lines) if LANG['name'] == 'zh' else french_options(lines)


# ------------------------------------------------------------------ fitting
def fit_strict(lines, groups, adjust):
    """Spread the words of the French `lines` over the phrases `groups` (notes per phrase); every phrase break falls between
    two words. With adjust, a phrase may be up to MAX_ADJUST syllables short (a syllable is held) or long (two share a note).
    Returns [(words of syllables, syllable count, notes)] per phrase, or (None, why)."""
    BREAK = 4
    opts = word_options(lines)
    n = len(opts)
    lo = sum(min(len(r[0]) for r in o[3]) for o in opts)
    hi = sum(max(len(r[0]) for r in o[3]) for o in opts)
    total = sum(groups)
    slack = sum(min(MAX_ADJUST, g // 3) for g in groups) if adjust else 0
    if not (lo - slack <= total <= hi + slack):
        return None, 'French has %d-%d syllables for %d note slots' % (lo, hi, total)
    line_start = [True] + [opts[i - 1][4] for i in range(1, n)] + [True]

    @lru_cache(maxsize=None)
    def span(i, s):
        res = {}
        states = {0: (0, 0, ())}
        allow = min(MAX_ADJUST, s // 3) if adjust else 0       # a short phrase can hardly take a hold or a merge
        top = s + allow
        for j in range(i, n):
            nxt = {}
            for cnt, (cost, tie, chosen) in states.items():
                for syl, c, tt in opts[j][3]:
                    k = cnt + len(syl)
                    if k > top:
                        continue
                    cand = (cost + c, tie + tt, chosen + (tuple(syl),))
                    if k not in nxt or cand[:2] < nxt[k][:2]:
                        nxt[k] = cand
            states = nxt
            best = None
            for cnt, (cost, tie, chosen) in states.items():
                d = cnt - s
                if abs(d) > allow:
                    continue
                extra = (HOLD_COST if d < 0 else MERGE_COST) * abs(d)
                cand = (cost + extra, tie, chosen)
                if best is None or cand[:2] < best[:2]:
                    best = cand
            if best:
                res[j + 1] = best
            if not states:
                break
        return res

    @lru_cache(maxsize=None)
    def best(i, g):
        if g == len(groups):
            return (0, 0, ()) if i == n else None
        out = None
        for j, (cost, tie, chosen) in span(i, groups[g]).items():
            rest = best(j, g + 1)
            if rest is None:
                continue
            pen = (0 if line_start[i] else BREAK) + (0 if (j == n or line_start[j]) else BREAK)
            cand = (cost + rest[0] + pen, tie + rest[1], (chosen,) + rest[2])
            if out is None or cand[:2] < out[:2]:
                out = cand
        return out

    res = best(0, 0)
    if res is None:
        return None, 'no way to spread %d-%d syllables over the phrases %s' % (lo, hi, groups)
    assignment, wi = [], 0
    for chosen, g in zip(res[2], groups):
        words = []
        for syl in chosen:
            pre, core, suf = opts[wi][0], opts[wi][1], opts[wi][2]
            syl = list(syl)
            syl[0] = pre + syl[0]
            syl[-1] = syl[-1] + suf
            words.append(syl)
            wi += 1
        assignment.append(words)
    return assignment, None


def line_counts(opts):
    states = {0: (0, 0, ())}
    for pre, core, suf, reads, last in opts:
        nxt = {}
        for cnt, (cost, tie, chosen) in states.items():
            for syl, c, tt in reads:
                k = cnt + len(syl)
                cand = (cost + c, tie + tt, chosen + (tuple(syl),))
                if k not in nxt or cand[:2] < nxt[k][:2]:
                    nxt[k] = cand
        states = nxt
    return states


def fit_relaxed(lines, groups):
    """French lines may span several phrases and words may straddle a phrase break, but every French line must end where
    a phrase ends. Returns the French lines as words of syllables."""
    per_line = []
    for line in lines:
        opts = word_options([line])
        per_line.append((opts, line_counts(opts)))
    total = sum(groups)
    ends, run = set(), 0
    for g in groups:
        run += g
        ends.add(run)
    dp = {0: (0, 0, ())}
    for opts, counts in per_line:
        nxt = {}
        for pos, (cost, tie, chosen) in dp.items():
            for k, (c, t, words) in counts.items():
                end = pos + k
                if end > total or end not in ends:
                    continue
                cand = (cost + c, tie + t, chosen + (words,))
                if end not in nxt or cand[:2] < nxt[end][:2]:
                    nxt[end] = cand
        dp = nxt
        if not dp:
            break
    if total not in dp:
        return None
    out = []
    for (opts, _), words in zip(per_line, dp[total][2]):
        line_words = []
        for (pre, core, suf, reads, last), syl in zip(opts, words):
            syl = list(syl)
            syl[0] = pre + syl[0]
            syl[-1] = syl[-1] + suf
            line_words.append(syl)
        out.append(line_words)
    return out


# ------------------------------------------------------------------ putting syllables on notes
def to_tokens(words):
    """Flat list of syllables with word boundaries: [{'t': text, 'ws': starts a word, 'we': ends a word}]."""
    toks = []
    for w in words:
        for j, s in enumerate(w):
            toks.append({'t': s, 'ws': j == 0, 'we': j == len(w) - 1})
    return toks


def is_weak(text):
    core = re.sub(r'[^\wà-ÿœ]', '', text.lower())
    return core in WEAK


def dur_hold_score(dur):
    return 0 if dur <= 2 else (1 if dur == 4 else 3)


def dur_merge_score(dur):
    return 0 if dur >= 8 else (1 if dur == 4 else 3)


def place(tokens_, group_slots):
    """Put the tokens (syllables) on the notes of a phrase. Fewer tokens than notes: hold some syllables over two notes;
    more: merge weak neighbours. Returns [(token, [note slot, ...])] and (holds, merges)."""
    s, t = len(group_slots), len(tokens_)
    if t == s:
        return [(tok, [group_slots[i]]) for i, tok in enumerate(tokens_)], (0, 0)
    INF = 10 ** 9
    if t < s:                                     # hold k syllables
        k = s - t
        # dp[j][h] = best score placing the first j tokens with h holds
        dp = [[(INF, None)] * (k + 1) for _ in range(t + 1)]
        dp[0][0] = (0, None)
        for j in range(t):
            for h in range(k + 1):
                if dp[j][h][0] >= INF:
                    continue
                base = dp[j][h][0]
                p = j + h                          # first note of token j
                if p < s:                          # no hold
                    cand = base + (0 if True else 0)
                    if cand < dp[j + 1][h][0]:
                        dp[j + 1][h] = (cand, (j, h, False))
                if h < k and p + 1 < s:            # hold over notes p and p+1
                    sc = (0 if tokens_[j]['we'] else 3) + dur_hold_score(group_slots[p + 1]['dur']) + 1   # the added note should be a long one
                    if base + sc < dp[j + 1][h + 1][0]:
                        dp[j + 1][h + 1] = (base + sc, (j, h, True))
        if dp[t][k][0] >= INF:
            return None, None
        holds, j, h = set(), t, k
        while j > 0:
            _, (pj, ph, was) = dp[j][h]
            if was:
                holds.add(pj)
            j, h = pj, ph
        out, p = [], 0
        for j, tok in enumerate(tokens_):
            if j in holds:
                out.append((tok, [group_slots[p], group_slots[p + 1]]))
                p += 2
            else:
                out.append((tok, [group_slots[p]]))
                p += 1
        return out, (k, 0)
    k = t - s                                      # merge k pairs
    dp = [[(INF, None)] * (k + 1) for _ in range(t + 1)]
    dp[0][0] = (0, None)
    for j in range(t):
        for m in range(k + 1):
            if dp[j][m][0] >= INF:
                continue
            base = dp[j][m][0]
            if base < dp[j + 1][m][0]:
                dp[j + 1][m] = (base, (j, m, False))
            if m < k and j + 1 < t:
                p = j - m
                sc = (0 if (is_weak(tokens_[j]['t']) or is_weak(tokens_[j + 1]['t'])) else 5) + dur_merge_score(group_slots[min(p, s - 1)]['dur'])
                if base + sc < dp[min(j + 2, t)][m + 1][0]:
                    dp[min(j + 2, t)][m + 1] = (base + sc, (j, m, True))
    if dp[t][k][0] >= INF:
        return None, None
    merges, j, m = [], t, k
    while j > 0:
        _, (pj, pm, was) = dp[j][m]
        if was:
            merges.append(pj)
        j, m = pj, pm
    merges = set(merges)
    out, p, j = [], 0, 0
    while j < t:
        if j in merges:
            a, b = tokens_[j], tokens_[j + 1]
            tok = {'t': a['t'] + JOIN + b['t'], 'ws': a['ws'], 'we': b['we']}
            out.append((tok, [group_slots[p]]))
            j += 2
        else:
            out.append((tokens_[j], [group_slots[p]]))
            j += 1
        p += 1
    return out, (0, k)


def etext(v):
    return v if isinstance(v, str) else v[0]


def ewordpos(v):
    return None if isinstance(v, str) else v[1]


def eheld(v):
    return not isinstance(v, str) and len(v) > 2


def write_notes(placed, syl_out, compound=True):
    """placed: [(token, [slots])] over a whole block; writes the overlay entries with word positions."""
    toks = [dict(tok) for tok, _ in placed]
    for i, tok in enumerate(toks):                # a compound (grand-route, Jésus-Christ) is one word
        if compound and tok['we'] and tok['t'].endswith('-') and i + 1 < len(toks):
            tok['t'] = tok['t'][:-1]
            tok['we'] = False
            toks[i + 1]['ws'] = False
    for tok, (_, slots) in zip(toks, placed):
        if tok['ws'] and tok['we']:
            pw = None
        elif tok['ws']:
            pw = 'i'
        elif tok['we']:
            pw = 't'
        else:
            pw = 'm'
        held = len(slots) > 1
        entry = tok['t'] if (pw is None and not held) else [tok['t'], pw]     # a bare string: a whole word on one note
        if held:
            entry.append('u')                      # an extender line over the next note
        syl_out[slots[0]['id']] = entry
        for extra in slots[1:]:
            syl_out[extra['id']] = 0               # the held note shows no syllable of its own


# ------------------------------------------------------------------ hand-made lines
def override_lines(hid):
    """overrides/FR1.txt: '== 1.' starts a block; one line per phrase: words separated by spaces, syllables by '-'
    ('|' = a hyphen inside the text), a syllable ending in '_' is held over two notes, two syllables under one note are
    joined with the tie sign. Lines starting with # are comments."""
    path = os.path.join(OVERRIDES, hid + '.txt')
    if not os.path.exists(path):
        return {}
    blocks, cur = {}, None
    for raw in open(path, encoding='utf8'):
        raw = raw.rstrip('\n')
        if raw.startswith('#'):
            continue
        if raw.startswith('=='):
            cur = raw[2:].strip()
            blocks[cur] = []
        elif cur is not None:
            blocks[cur].append(raw.strip())
    return blocks


def parse_override_line(line):
    """-> [token], notes used. A word that ends in '-' goes on in the next line (the caller joins them)."""
    toks = []
    for w in line.split():
        cont = w.endswith('-') and not w.endswith('|-')
        parts = [p for p in w.rstrip('-').split('-')]
        for j, p in enumerate(parts):
            hold = p.endswith('_')
            text = p.rstrip('_').replace('|', '-')
            toks.append({'t': text, 'ws': j == 0, 'we': j == len(parts) - 1 and not cont, 'hold': hold})
    notes = sum(2 if t['hold'] else 1 for t in toks)
    return toks, notes


def label_to_stanza(label):
    if label == '(C)':
        return 'chorus'
    m = re.match(r'(\d+)\.', label or '')
    return m.group(1) if m else None


# ------------------------------------------------------------------ one hymn
def build(c, hid):
    row = c.execute("select parent_hymn,first_stanza_line from hymns where _id=?", (hid,)).fetchone()
    parent = row[0]
    if not parent:
        return None, 'no English hymn to borrow the sheet from', None
    path = os.path.join(MEI, parent + '.mei')
    if not os.path.exists(path):
        return None, 'the English hymn %s has no sheet' % parent, None
    segs = segments(mei_slots(path))
    en = db_stanzas(c, parent)
    fr = db_stanzas(c, hid)
    if not en.get('chorus'):                        # an unlabeled repeat: part of the previous block
        merged = []
        for s in segs:
            if s['label'] == '(C)' and merged:
                merged[-1]['slots'] += s['slots']
            else:
                merged.append(s)
        segs = merged
    if en.get('chorus') and not fr.get('chorus') and fr.get('1') and len(fr['1']) == len(en.get('1', [])) + len(en['chorus']):
        fr = dict(fr)                               # the French put the chorus inside stanza 1
        cut = len(en.get('1', []))
        fr['chorus'] = fr['1'][cut:]
        fr['1'] = fr['1'][:cut]
    if not en.get('chorus') and fr.get('chorus') and fr.get('1') and len(en.get('1', [])) == len(fr['1']) + len(fr['chorus']):
        fr = dict(fr)                               # the English print the chorus inside stanza 1, the target apart from it
        fr['1'] = fr['1'] + fr['chorus']
        del fr['chorus']
    ov = override_lines(hid)
    syl_out, problems, review = {}, [], {}
    adjust = {'hold': 0, 'merge': 0}
    quality = 'exact'
    for seg in segs:
        key = label_to_stanza(seg['label'])
        groups, used_chorus, err = english_groups(seg['slots'], en, key)
        if err:
            groups, used_chorus = punctuation_groups(seg['slots']), False
        fr_lines = list(fr.get(key, []))
        if used_chorus:
            fr_lines += fr.get('chorus', [])
        placed = []
        repeated = repeated_lines(seg['slots'], en, fr, key) if seg['label'] not in ov else None
        if repeated:
            groups, fr_lines = repeated
        if seg['label'] in ov:                                   # a hand-made block
            lines = ov[seg['label']]
            if len(lines) != len(groups):
                problems.append('%s: override has %d lines, the music %d phrases' % (seg['label'], len(lines), len(groups)))
                continue
            pos, ok = 0, True
            for line, g in zip(lines, groups):
                toks, notes = parse_override_line(line)
                if notes != g:
                    problems.append('%s: override line "%s" uses %d notes, the music has %d' % (seg['label'], line, notes, g))
                    ok = False
                    break
                for t in toks:
                    n = 2 if t['hold'] else 1
                    placed.append((t, seg['slots'][pos:pos + n]))
                    pos += n
            if not ok:
                continue
            quality = 'check' if quality == 'exact' else quality
            write_notes(placed, syl_out, LANG['name'] == 'fr')
            continue
        if not fr_lines:
            problems.append('%s: the French hymn has no stanza %s' % (seg['label'], key))
            continue
        assignment, why = fit_strict(fr_lines, groups, adjust=False)
        tier = 'exact'
        if assignment is None:
            assignment, why = fit_strict(fr_lines, groups, adjust=True)
            tier = 'adapted'
        if assignment is None:
            relaxed = fit_relaxed(fr_lines, groups)
            if relaxed is not None:
                flat = [w for line in relaxed for w in line]
                assignment, tier = None, 'check'
                toks = to_tokens(flat)
                pos = 0
                for tok in toks:
                    placed.append((tok, [seg['slots'][pos]]))
                    pos += 1
                quality = 'check' if quality == 'exact' else quality
                write_notes(placed, syl_out, LANG['name'] == 'fr')
                continue
            problems.append('%s: %s (French: %s)' % (seg['label'], why, ' / '.join(fr_lines)[:160]))
            review[seg['label']] = (groups, fr_lines, seg, en.get(key, []))
            continue
        pos = 0
        for words, g in zip(assignment, groups):
            gslots = seg['slots'][pos:pos + g]
            pos += g
            placed_group, adj = place(to_tokens(words), gslots)
            if placed_group is None:
                problems.append('%s: could not place the syllables of a phrase' % seg['label'])
                break
            adjust['hold'] += adj[0]
            adjust['merge'] += adj[1]
            placed += placed_group
        else:
            review_seg = (groups, fr_lines, seg, en.get(key, []))
            review.setdefault(seg['label'], review_seg)
            if tier == 'adapted' and (adjust['hold'] or adjust['merge']):
                quality = 'adapted'
            write_notes(placed, syl_out, LANG['name'] == 'fr')
            continue
    total_notes = sum(len(s['slots']) for s in segs)
    if adjust['hold'] + adjust['merge'] > max(3, 0.15 * total_notes):
        problems.append('adapting would change %d of %d notes (the French text and the music differ too much)' % (
            adjust['hold'] + adjust['merge'], total_notes))
        review = review or {}
    if problems:
        return None, problems, review
    under = {label_to_stanza(s['label']) for s in segs}
    verses = [{'label': no + '.', 'lines': lines} for no, lines in fr.items() if no.isdigit() and no not in under]
    title = (row[1] or '').replace('\xa0', ' ').strip().rstrip(' ,;:.!?»\u3001\u3002\uff0c\uff1b\uff1a\uff01\uff1f')
    subtitle = ''
    if LANG['name'] == 'zh':                       # the Chinese categories are fine to show (the French ones are not accented)
        cats = c.execute("select main_category,sub_category from hymns where _id=?", (hid,)).fetchone()
        subtitle = '\uff0d'.join(x for x in cats if x)
    if LANG['name'] == 'fr':                       # a syllable with no vowel is a sign of a bad split
        for v in syl_out.values():
            if v and not re.search('[%s]' % VOWEL_LETTERS, etext(v).lower()):
                return None, ['suspicious syllable "%s"' % etext(v)], review
    return {'parent': parent, 'quality': quality, 'adjust': adjust, 'title': title, 'subtitle': subtitle,
            'syl': syl_out, 'verses': verses}, [], review


# ------------------------------------------------------------------ review files
def closest_reading(lines, slots):
    opts = word_options(lines)
    states = {0: (0, 0, ())}
    for pre, core, suf, reads, last in opts:
        nxt = {}
        for cnt, (cost, tie, chosen) in states.items():
            for syl, c, tt in reads:
                k = cnt + len(syl)
                cand = (cost + c, tie + tt, chosen + ((pre, tuple(syl), suf),))
                if k not in nxt or cand[:2] < nxt[k][:2]:
                    nxt[k] = cand
        states = nxt
    best = min(states, key=lambda k: (abs(k - slots), states[k][:2]))
    return best, states[best][2]


def write_review(hid, parent, title, review, problems):
    """A hand-editable file per hymn: for every English phrase the note count and a French suggestion."""
    os.makedirs(REVIEW_DIR, exist_ok=True)
    out = ['# %s  (sheet of %s)  %s' % (hid, parent, title), '# What is wrong:']
    out += ['#   ' + p for p in problems]
    out += ['#', '# Edit the French line under each English phrase so that it uses exactly as many notes as the phrase has.',
            '# Write syllables joined by - ; a hyphen that really belongs to the word: | ; a syllable held over two notes ends with _ ;',
            '# two syllables sung on one note are joined with the tie sign (‿); a word that goes on in the next line ends with -',
            '# Then copy this file to sheet-lyrics/overrides/%s.txt and run:  python3 sheet-lyrics/align.py %s' % (hid, hid), '']
    for label, (groups, fr_lines, seg, en_lines) in review.items():
        slots = sum(groups)
        n, words = closest_reading(fr_lines, slots)
        flat = []
        for pre, syl, suf in words:
            s = list(syl)
            s[0] = pre + s[0]
            s[-1] = s[-1] + suf
            flat.append(s)
        out += ['== %s' % label, '# French text: %s' % ' / '.join(fr_lines),
                '# %d notes in all; this suggestion has %d syllables' % (slots, n)]
        wi = 0
        en_all = list(en_lines)
        for gi, g in enumerate(groups):
            line, got = [], 0
            while wi < len(flat) and got < g:
                w = flat[wi]
                take = min(len(w), g - got)
                piece = '-'.join(x.replace('-', '|') for x in w[:take])
                if take < len(w):
                    piece += '-'
                    flat[wi] = w[take:]
                else:
                    wi += 1
                line.append(piece)
                got += take
            if gi == len(groups) - 1 and wi < len(flat):
                for w in flat[wi:]:
                    line.append('-'.join(w) + '  #EXTRA')
            en = en_all[gi] if gi < len(en_all) else ''
            out.append('# %d notes%s' % (g, ('  | ' + en) if en else ''))
            out.append(' '.join(line))
            if got != g:
                out.append('# ??? only %d syllables for %d notes' % (got, g))
        out.append('')
    open(os.path.join(REVIEW_DIR, hid + '.txt'), 'w', encoding='utf8').write('\n'.join(out))


def describe_adapted(c, hid, result):
    """review/FR<n>.txt for an adapted hymn: the French under each English phrase, holds shown as _ and merges as the tie sign."""
    parent = result['parent']
    slots = mei_slots(os.path.join(MEI, parent + '.mei'))
    syl = result['syl']
    lines, cur, held = [], [], 0
    out = ['# %s (sheet of %s) %s' % (hid, parent, result['title']),
           '# Adapted by code: %d syllable(s) held over two notes (shown with _), %d times two syllables share a note (shown with the tie sign).' % (
               result['adjust']['hold'], result['adjust']['merge']),
           '# Please check the places marked with _ or the tie sign; fix them by copying this file to overrides/ (see README.md).', '']
    en = db_stanzas(c, parent)
    segs = segments(slots)
    for seg in segs:
        out.append('== %s' % seg['label'])
        text = []
        for s in seg['slots']:
            v = syl.get(s['id'])
            if v == 0:
                continue
            piece = etext(v) + ('_' if eheld(v) else '')
            if ewordpos(v) in ('i', 'm'):
                piece += '-'
            else:
                piece += ' '
            text.append(piece)
        out.append(''.join(text).replace('- ', '-').strip())
        out.append('')
    open(os.path.join(REVIEW_DIR, hid + '.txt'), 'w', encoding='utf8').write('\n'.join(out))


def reason(details):
    m = re.search(r'French has (\d+)-(\d+) syllables for (\d+) note slots', details)
    if not m:
        return details.split(' | ')[0][:110]
    lo, hi, slots = map(int, m.groups())
    if slots > hi + 3:
        return 'the music has %d notes but the French text only %d-%d syllables (repeats not in the text?)' % (slots, lo, hi)
    if slots < lo - 3:
        return 'the French text has %d-%d syllables but the music only %d notes' % (lo, hi, slots)
    return 'close: %d notes, French %d-%d syllables, but the lines do not line up with the phrases' % (slots, lo, hi)


def write_index(rows):
    os.makedirs(REVIEW_DIR, exist_ok=True)
    done = [r for r in rows if r[1] in ('ok', 'adapted', 'check')]
    out = ['# French sheet lyrics: what a French speaker should look at', '',
           'Made by `python3 sheet-lyrics/align.py` (see ../README.md). %d of %d French hymns have French lyrics under the notes.' % (len(done), len(rows)), '']
    adapted = [r for r in rows if r[1] == 'adapted']
    check = [r for r in rows if r[1] == 'check']
    review = [r for r in rows if r[1] == 'needs-review']
    nosheet = [r for r in rows if r[1] == 'no-sheet']
    out += ['## Needs a person (%d): these still show the English sheet' % len(review), '',
            '| Hymn | Sheet of | File | Why |', '|---|---|---|---|']
    for h, st, parent, det in review:
        out.append('| %s | %s | [%s.txt](%s.txt) | %s |' % (h, parent, h, h, reason(det)))
    out += ['', '## Adapted by code, please check (%d)' % len(adapted), '',
            'A syllable is held over two notes (_) or two weak syllables share a note. Each has a file showing the result.', '',
            ', '.join('[%s](%s.txt)' % (r[0], r[0]) for r in adapted) or '(none)', '',
            '## Fits, but phrases and French lines do not end together (%d)' % len(check), '', ', '.join(r[0] for r in check) or '(none)', '',
            '## No sheet at all (%d)' % len(nosheet), '',
            'These French hymns have no English hymn to borrow a sheet from, or that hymn has no sheet: %s' % ', '.join(r[0] for r in nosheet), '']
    open(os.path.join(REVIEW_DIR, 'INDEX.md'), 'w', encoding='utf8').write('\n'.join(out))


LANGUAGES = {'fr': ['FR', 'FY'], 'zh': ['C', 'Z', 'CS', 'ZS']}


def main():
    global REVIEW_DIR
    ap = argparse.ArgumentParser()
    ap.add_argument('ids', nargs='*')
    ap.add_argument('--lang', choices=sorted(LANGUAGES), default='fr')
    ap.add_argument('--report')
    a = ap.parse_args()
    LANG['name'] = a.lang
    if a.lang != 'fr':
        REVIEW_DIR = os.path.join(HERE, 'review', a.lang)
    report = a.report or os.path.join(HERE, 'build', 'report_%s.csv' % a.lang)
    c = sqlite3.connect(DB)
    if a.ids:
        ids = a.ids
    else:
        marks = ','.join("'%s'" % g for g in LANGUAGES[a.lang])
        ids = [r[0] for r in c.execute("select _id from hymns where hymn_group in (%s) order by hymn_group, cast(no as int)" % marks)
               if not os.path.exists(os.path.join(MEI, r[0] + '.mei'))]       # a hymn with a sheet of its own keeps it
    os.makedirs(os.path.dirname(report), exist_ok=True)
    os.makedirs(OUT, exist_ok=True)
    os.makedirs(REVIEW_DIR, exist_ok=True)
    rows = []
    for hid in ids:
        result, problems, review = build(c, hid)
        for stale in (os.path.join(OUT, hid + '.json'), os.path.join(REVIEW_DIR, hid + '.txt')):
            if os.path.exists(stale):
                os.remove(stale)
        if result is None:
            if isinstance(problems, str):
                rows.append((hid, 'no-sheet', '', problems))
                continue
            parent = c.execute("select parent_hymn from hymns where _id=?", (hid,)).fetchone()[0]
            rows.append((hid, 'needs-review', parent, ' | '.join(problems)))
            if review:
                title = (c.execute("select first_stanza_line from hymns where _id=?", (hid,)).fetchone()[0] or '')
                write_review(hid, parent, title, review, problems)
            continue
        json.dump({'hymn': hid, **result}, open(os.path.join(OUT, hid + '.json'), 'w', encoding='utf8'),
                  ensure_ascii=False, separators=(',', ':'))
        rows.append((hid, result['quality'] if result['quality'] != 'exact' else 'ok', result['parent'], ''))
        if result['quality'] == 'adapted':
            describe_adapted(c, hid, result)
    with open(report, 'w', newline='', encoding='utf8') as f:
        w = csv.writer(f)
        w.writerow(['hymn', 'status', 'parent', 'details'])
        w.writerows(rows)
    import collections
    print(collections.Counter(r[1] for r in rows))
    if not a.ids:
        write_index(rows)


if __name__ == '__main__':
    main()
