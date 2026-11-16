"""Fit French Youth (FRY) sheet lyrics to the chord placements in the French youth hymnal PDF.

Usage:
    python3 tools/sheet-lyrics/fit_fry_chords.py [--dry-run] [--pdf PATH] [HYMN_ID ...]

When the contributor PDF is available under databaseProvisioner/src/main/resources/originals/,
this script parses above-line chords and their character positions, aligns them (transposition-
invariantly) to the <harm> chords of each parent MEI sheet, fits French syllables between chord
anchors using align.py's flexible French readings and placement rules, and writes/updates
tools/sheet-lyrics/overrides/FRY*.txt for every hymn where confidence is high and chord placement
improves. Re-running tools/sheet-lyrics/align.py afterwards reproduces the updated
app/src/main/assets/sheetLyrics/FRY*.json files without needing the PDF.
"""
import argparse
import json
import os
import re
import sqlite3
import sys
import unicodedata
import xml.etree.ElementTree as ET

import pymupdf

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import align  # noqa: E402

ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
DEFAULT_PDF = os.path.join(
    ROOT, 'databaseProvisioner', 'src', 'main', 'resources', 'originals',
    'Cantique des jeunes (Recueil lyonnais 19-07-2024).pdf',
)
DB_PATH = os.path.join(ROOT, 'app', 'src', 'main', 'assets', 'hymns.sqlite')
MEI_DIR = os.path.join(ROOT, 'app', 'src', 'main', 'assets', 'sheetMei')
LYRICS_DIR = os.path.join(ROOT, 'app', 'src', 'main', 'assets', 'sheetLyrics')
OV_DIR = os.path.join(HERE, 'overrides')

NOTE_MAP = {
    'C': 0, 'C#': 1, 'Db': 1, 'D': 2, 'D#': 3, 'Eb': 3, 'E': 4, 'Fb': 4, 'E#': 5,
    'F': 5, 'F#': 6, 'Gb': 6, 'G': 7, 'G#': 8, 'Ab': 8, 'A': 9, 'A#': 10, 'Bb': 10,
    'B': 11, 'Cb': 11, 'B#': 0,
}

SINGLE_CHORD_RE = re.compile(
    r'^([A-G])(m)?([#b])?(?:(m|min|maj|dim|aug|sus|add|M)[0-9]*)?[0-9]*(?:[#b][0-9]+)?'
    r'(?:/([A-G](?:m)?[#b]?))?$'
)


def norm(text):
    """Normalize French text for accent/punctuation-insensitive comparison."""
    text = text.lower().replace('œ', 'oe').replace('æ', 'ae')
    text = unicodedata.normalize('NFKD', text)
    text = ''.join(ch for ch in text if not unicodedata.combining(ch))
    return re.sub(r'[^a-z0-9]+', ' ', text).strip()


def strip_prefix(text):
    """Remove leading stanza number or Refrain/Chorus prefix before line matching."""
    return re.sub(r'^\s*(?:\d+\s*[.)]|refrain\s*:?|chorus\s*:?|//\s*)', '', text, flags=re.I).strip()


def parse_single_chord(token):
    """Parse a chord token (supporting French Fm# spelling) into (pitch_class, quality)."""
    m = SINGLE_CHORD_RE.match(token)
    if not m:
        return None
    letter, m_before, acc, qual = m.group(1), m.group(2), m.group(3), m.group(4)
    root_str = letter + (acc or '')
    if root_str not in NOTE_MAP:
        return None
    pc = NOTE_MAP[root_str]
    is_minor = bool(m_before) or (qual in ('m', 'min'))
    is_dim = (qual == 'dim')
    return (pc, 'm' if is_minor else ('d' if is_dim else ''))


def expand_chord_token(token):
    """Parse single or hyphen-chained chords (e.g. D-G-D) into a list of (pc, quality)."""
    cleaned = token.strip('()[].,:;!?*«»')
    if not cleaned:
        return []
    parts = [p for p in re.split(r'[-–—]+', cleaned) if p]
    if not parts:
        return []
    parsed = [parse_single_chord(p) for p in parts]
    return parsed if all(x is not None for x in parsed) else []


def is_chord_words(words):
    """True when a PDF row consists of chord symbols (optionally with capo or repeat marks)."""
    joined = ' '.join(w[4] for w in words)
    cleaned_toks = re.sub(r'\(\s*capo\s*\d*\s*\)', '', joined, flags=re.I).split()
    non_dash = [t for t in cleaned_toks if not re.match(r'^[-–—/]+$', t)]
    if not non_dash:
        return False
    chord_ok = sum(1 for t in non_dash if expand_chord_token(t))
    rest = [t for t in non_dash if not expand_chord_token(t)]
    if rest and all(
        re.match(r'^\(?x?\d+x?\)?$', r, re.I) or r in ('(x', '2)', '3)', '(bis)', 'bis')
        for r in rest
    ) and chord_ok >= 1:
        return True
    return chord_ok == len(non_dash) and chord_ok >= 1


def extract_chars_in_rows(page, x_cond):
    """Extract PDF column rows from rawdict while merging subscript/superscript spans (like '7')."""
    rd = page.get_text('rawdict')
    band_lines = []
    for block in rd['blocks']:
        if block.get('type') != 0:
            continue
        for line in block['lines']:
            chars = []
            for span in line['spans']:
                for ch in span.get('chars', []):
                    x0, y0, x1, y1 = ch['bbox']
                    if x_cond(x0) and 25 <= y0 < 765:
                        chars.append((x0, y0, x1, y1, ch['c']))
            if chars:
                band_lines.append((min(c[1] for c in chars), max(c[3] for c in chars), chars))

    rows_c = []
    for ly0, ly1, chars in sorted(band_lines, key=lambda it: (round(it[0], 1), it[2][0][0])):
        placed = False
        for grp in rows_c:
            gy0, gy1, gchars = grp
            if min(gy1, ly1) - max(gy0, ly0) >= 2.5 or abs(gy0 - ly0) < 4.5:
                grp[0] = min(gy0, ly0)
                grp[1] = max(gy1, ly1)
                gchars.extend(chars)
                placed = True
                break
        if not placed:
            rows_c.append([ly0, ly1, list(chars)])

    out_rows = []
    for _, _, rc in rows_c:
        rc.sort(key=lambda c: c[0])
        words, cur_chars, prev_x1 = [], [], None
        for x0, y0, x1, y1, ch in rc:
            if ch.isspace():
                if cur_chars:
                    words.append(cur_chars)
                    cur_chars = []
                prev_x1 = x1
                continue
            if cur_chars and prev_x1 is not None and (x0 - prev_x1) > 1.8:
                words.append(cur_chars)
                cur_chars = []
            cur_chars.append((x0, y0, x1, y1, ch))
            prev_x1 = x1
        if cur_chars:
            words.append(cur_chars)
        if not words:
            continue
        wtups = [
            (wc[0][0], min(c[1] for c in wc), wc[-1][2], max(c[3] for c in wc), ''.join(c[4] for c in wc), wc)
            for wc in words
        ]
        y0 = min(w[1] for w in wtups)
        y1 = max(w[3] for w in wtups)
        rx0 = min(w[0] for w in wtups)
        rx1 = max(w[2] for w in wtups)
        txt = ' '.join(w[4] for w in wtups)
        if re.match(r'^\d{2}/\d{2}/\d{4}$', txt.strip()) and y0 > 740:
            continue
        out_rows.append((y0, y1, rx0, rx1, txt, wtups))
    return out_rows


def parse_pdf_songs(pdf_path):
    """Split pages 3..end into individual left/right column songs via title underline rules."""
    doc = pymupdf.open(pdf_path)
    songs = []
    for side, x_cond, u_cond in [
        ('L', lambda x: x < 295, lambda r: r.x0 < 290),
        ('R', lambda x: x >= 295, lambda r: r.x0 >= 290),
    ]:
        cur = None
        for pno in range(2, len(doc)):
            page = doc[pno]
            underlines = [
                dr['rect'] for dr in page.get_drawings()
                if u_cond(dr['rect']) and dr['rect'].width >= 20 and dr['rect'].height <= 3.5
                and (dr.get('fill') != (1.0, 1.0, 1.0)
                     or (dr.get('color') is not None and dr.get('color') != (1.0, 1.0, 1.0)))
            ]
            rows = extract_chars_in_rows(page, x_cond)
            prev_row_y0, prev_row_is_chord = None, False
            for y0, y1, rx0, rx1, txt, words in rows:
                row_w = max(1.0, rx1 - rx0)
                matching_u = [
                    u for u in underlines
                    if y0 <= u.y0 <= y1 + 5.0 and not (u.x1 < rx0 - 5 or u.x0 > rx1 + 5)
                ]
                is_ch = is_chord_words(words)
                is_title = False
                if matching_u and not is_ch:
                    u0 = matching_u[0]
                    gap = (y0 - prev_row_y0) if prev_row_y0 is not None else 999
                    if not prev_row_is_chord and u0.x0 <= rx0 + 6 and (
                        y0 < 75 or gap >= 16 or (u0.width / row_w) >= 0.45
                    ):
                        is_title = True
                prev_row_y0, prev_row_is_chord = y0, is_ch
                if is_title:
                    prefix_title = ''
                    if cur and cur['rows'] and cur['rows'][-1][0] == pno + 1:
                        _, prev_y0, _, prev_txt, prev_ch = cur['rows'][-1]
                        if 0 < y0 - prev_y0 <= 18.0 and not prev_ch and not re.match(r'^\d+\.', prev_txt):
                            gap_above = prev_y0 - (
                                cur['rows'][-2][1]
                                if len(cur['rows']) >= 2 and cur['rows'][-2][0] == pno + 1
                                else 0
                            )
                            if gap_above >= 20 or len(cur['rows']) == 1:
                                cur['rows'].pop()
                                prefix_title = prev_txt + ' '
                    if cur:
                        songs.append(cur)
                    cur = {'page': pno + 1, 'side': side, 'title': prefix_title + txt, 'rows': []}
                else:
                    if cur is None:
                        cur = {'page': pno + 1, 'side': side, 'title': '(no-title)', 'rows': []}
                    cur['rows'].append((pno + 1, y0, words, txt, is_ch))
        if cur:
            songs.append(cur)
    return songs


def extract_pdf_events_with_chars(song):
    """Return (lyric_lines, events) where each event carries (parsed_chord, raw, line_i, word_i, char_i, word_txt)."""
    lyric_lines, events = [], []
    pending_chord = None
    for pno, y0, words, txt, is_ch in song['rows']:
        if is_ch:
            pending_chord = (pno, y0, words, txt)
            continue
        li = len(lyric_lines)
        lwords = [
            w for w in words
            if not re.match(r'^\d+\.$', w[4]) and w[4] not in ('//', 'Refrain', ':')
            and any(ch.isalnum() for ch in w[4])
        ] or words
        lyric_lines.append((pno, y0, lwords, txt))
        if pending_chord is not None and pno == pending_chord[0] and (y0 - pending_chord[1]) < 24:
            _, _, crow, _ = pending_chord
            for cw in crow:
                tok = cw[4]
                if re.match(r'^capo', tok, re.I):
                    continue
                parsed_list = expand_chord_token(tok)
                if not parsed_list:
                    continue
                cx = cw[0]
                best_wi, best_dist = 0, 1e9
                for wi, lw in enumerate(lwords):
                    if lw[0] - 2.0 <= cx <= lw[2] + 2.0:
                        best_wi = wi
                        break
                    dist = min(abs(cx - lw[0]), abs(cx - lw[2]))
                    if dist < best_dist:
                        best_dist, best_wi = dist, wi
                lw = lwords[best_wi]
                best_ci, best_cd = 0, 1e9
                for ci, ch in enumerate(lw[5]):
                    if ch[0] - 1.5 <= cx <= ch[2]:
                        best_ci = ci
                        break
                    d = abs(cx - ch[0])
                    if d < best_cd:
                        best_cd, best_ci = d, ci
                wtxt = lw[4]
                for ci in range(best_ci, len(wtxt)):
                    if wtxt[ci].isalpha():
                        best_ci = ci
                        break
                events.append((parsed_list[0], tok, li, best_wi, best_ci, wtxt))
        pending_chord = None
    return lyric_lines, events


def extract_mei_slots_and_harms(mei_path):
    """Extract verse-1 sung note slots and their active <harm> chord events from MEI."""
    tree = ET.parse(mei_path)
    root = tree.getroot()
    ns = {'m': 'http://www.music-encoding.org/ns/mei'}
    meter_unit = 4
    sd = root.find('.//m:scoreDef', ns)
    if sd is not None and sd.get('meter.unit'):
        meter_unit = int(sd.get('meter.unit'))
    slots, harms, pending_harms = [], [], []
    for meas in root.findall('.//m:measure', ns):
        mn = meas.get('n', '')
        m_harms = sorted((float(h.get('tstamp', '1')), ''.join(h.itertext()).strip()) for h in meas.findall('./m:harm', ns))
        staff = meas.find('./m:staff[@n="1"]', ns)
        events = []
        if staff is not None:
            cur_beat = 1.0

            def walk(elem):
                nonlocal cur_beat
                tag = elem.tag.split('}')[-1]
                if tag in ('note', 'rest', 'space', 'chord'):
                    dur_s = elem.get('dur')
                    dur = int(dur_s) if dur_s and dur_s.isdigit() else 4
                    dots = int(elem.get('dots', '0'))
                    beats = meter_unit / dur
                    if dots == 1:
                        beats *= 1.5
                    elif dots == 2:
                        beats *= 1.75
                    if tag == 'note' and elem.find('./m:verse[@n="1"]/m:syl', ns) is not None:
                        nid = elem.get('{http://www.w3.org/XML/1998/namespace}id')
                        syl = ''.join(elem.find('./m:verse[@n="1"]/m:syl', ns).itertext())
                        events.append((cur_beat, nid, syl))
                    cur_beat += beats
                elif tag == 'tuplet':
                    num = float(elem.get('num', '3'))
                    numbase = float(elem.get('numbase', '2'))
                    scale = numbase / num
                    for ch in elem:
                        ctag = ch.tag.split('}')[-1]
                        if ctag in ('note', 'rest', 'space'):
                            dur_s = ch.get('dur')
                            dur = int(dur_s) if dur_s and dur_s.isdigit() else 4
                            beats = (meter_unit / dur) * scale
                            if ctag == 'note' and ch.find('./m:verse[@n="1"]/m:syl', ns) is not None:
                                nid = ch.get('{http://www.w3.org/XML/1998/namespace}id')
                                syl = ''.join(ch.find('./m:verse[@n="1"]/m:syl', ns).itertext())
                                events.append((cur_beat, nid, syl))
                            cur_beat += beats
                else:
                    for ch in elem:
                        walk(ch)

            for layer in staff.findall('./m:layer', ns):
                cur_beat = 1.0
                walk(layer)

        hi = 0
        for ev_beat, nid, syl in events:
            slot_idx = len(slots)
            slots.append((nid, syl, mn))
            while hi < len(m_harms) and m_harms[hi][0] <= ev_beat + 0.12:
                htxt = m_harms[hi][1]
                parsed = parse_single_chord(htxt)
                if parsed:
                    pending_harms.append((parsed, htxt, mn))
                hi += 1
            if pending_harms:
                p_chord, raw_c, cmn = pending_harms[-1]
                harms.append((slot_idx, p_chord, raw_c, cmn))
                pending_harms.clear()
        while hi < len(m_harms):
            parsed = parse_single_chord(m_harms[hi][1])
            if parsed:
                pending_harms.append((parsed, m_harms[hi][1], mn))
            hi += 1
    return slots, harms


def word_syllable_options(lines):
    """Expand French lines into per-word reading dictionaries using align.word_options."""
    opts = align.word_options(lines)
    words = []
    for pre, core, suf, reads, last in opts:
        rlist = []
        for syls, cost, tt in reads:
            toks = [
                {
                    't': (pre if si == 0 else '') + sy + (suf if si == len(syls) - 1 else ''),
                    'ws': si == 0,
                    'we': si == len(syls) - 1,
                    'last': last if si == len(syls) - 1 else False,
                }
                for si, sy in enumerate(syls)
            ]
            rlist.append((toks, cost, tt))
        words.append({'pre': pre, 'core': core, 'suf': suf, 'last': last, 'raw': pre + core + suf, 'reads': rlist})
    return words


def align_span_flex(word_specs, left_frag, right_frag, sub_slots):
    """Fit optional boundary fragments plus flexible readings for word_specs onto sub_slots."""
    n_slots = len(sub_slots)
    target_mid = n_slots - (len(left_frag) + len(right_frag))
    if target_mid < 0:
        return None, None
    dp = {0: (0.0, 0, [])}
    for ws in word_specs:
        nxt = {}
        for cnt, (sc, tt, chosen) in dp.items():
            for toks, cost, t_c in ws['reads']:
                nc = cnt + len(toks)
                if nc > n_slots * 2 + 4:
                    continue
                cand = (sc + cost * 0.3 + t_c * 0.2, tt + t_c, chosen + [toks])
                if nc not in nxt or cand[0] < nxt[nc][0]:
                    nxt[nc] = cand
        dp = nxt
    if not dp:
        return None, None
    cands = sorted(dp.keys(), key=lambda k: (abs(k - target_mid), 0 if k <= target_mid else 1, dp[k][0]))
    best_placed, best_score = None, None
    for k in cands[:8]:
        toks = list(left_frag)
        for ch_toks in dp[k][2]:
            toks.extend(ch_toks)
        toks.extend(right_frag)
        if not toks or len(toks) > 2 * n_slots:
            continue
        placed, adj = align.place(toks, sub_slots)
        if placed is None:
            continue
        sc = (adj[0] + adj[1]) * 10 + dp[k][0]
        if best_score is None or sc < best_score:
            best_score, best_placed = sc, (placed, adj)
    return best_placed if best_placed else (None, None)


def clean_override_lines_to_text(lines, db_word_set):
    """Recover plain French words from existing override lines without splitting words at '‿'."""
    buf, out = '', []
    for raw in lines:
        w = raw.replace('_', '').replace('|', '\x00')
        cont = w.rstrip().endswith('-')
        # Remove syllable separators '-' (leaving literal hyphens as \x00)
        w = w.rstrip('-').replace('-', '') if cont else w.replace('-', '')
        # Disambiguate '‿': keep together if joined token is a DB word, else split to space
        while '‿' in w:
            idx = w.index('‿')
            # Extract word fragment immediately around idx
            lstart = idx
            while lstart > 0 and not w[lstart - 1].isspace():
                lstart -= 1
            rend = idx + 1
            while rend < len(w) and not w[rend].isspace():
                rend += 1
            combined = (w[lstart:idx] + w[idx + 1:rend]).replace('\x00', '-')
            rep = '' if norm(combined) in db_word_set else ' '
            w = w[:idx] + rep + w[idx + 1:]
        w = w.replace('\x00', '-')
        buf = (buf + w.lstrip()) if buf else w
        if not cont:
            out.append(' '.join(buf.split()))
            buf = ''
    if buf:
        out.append(' '.join(buf.split()))
    return ' '.join(out)


def extract_merged_segs_and_fr(c, hid, parent, slots):
    """Mirror align.build()'s segment merging and per-segment French word resolution."""
    segs = align.segments(slots)
    en = align.db_stanzas(c, parent)
    fr = align.db_stanzas(c, hid)
    if not en.get('chorus'):
        merged = []
        for s in segs:
            if s['label'] == '(C)' and merged:
                merged[-1]['slots'] += s['slots']
            else:
                merged.append(s)
        segs = merged
    if en.get('chorus') and not fr.get('chorus') and fr.get('1') and len(fr['1']) == len(en.get('1', [])) + len(en['chorus']):
        fr = dict(fr)
        cut = len(en.get('1', []))
        fr['chorus'] = fr['1'][cut:]
        fr['1'] = fr['1'][:cut]
    if not en.get('chorus') and fr.get('chorus') and fr.get('1') and len(en.get('1', [])) == len(fr['1']) + len(fr['chorus']):
        fr = dict(fr)
        fr['1'] = fr['1'] + fr['chorus']
        del fr['chorus']

    ov = align.override_lines(hid)
    db_word_set = {norm(w) for lines in fr.values() for ln in lines for w in ln.split()}
    seen = {}
    out_segs = []
    seg_texts = []
    for seg in segs:
        lbl = seg['label']
        seen[lbl] = seen.get(lbl, 0) + 1
        nth = '%s#%d' % (lbl, seen[lbl])
        use_lbl = nth if (ov and nth in ov) else lbl
        seg = dict(seg, label=use_lbl)
        key = align.label_to_stanza(use_lbl)
        groups, used_chorus, err = align.english_groups(seg['slots'], en, key)
        if err:
            groups, used_chorus = align.punctuation_groups(seg['slots']), False
        if ov and use_lbl in ov:
            stext = clean_override_lines_to_text(ov[use_lbl], db_word_set)
        else:
            fr_lines = list(fr.get(key, []))
            if used_chorus:
                fr_lines += fr.get('chorus', [])
            repeated = align.repeated_lines(seg['slots'], en, fr, key)
            if repeated:
                # align.py skips repeated_lines once an override block exists, so keep english_groups
                # for line chunking while using the repeated French lines for sung text.
                fr_lines = repeated[1]
            stext = ' '.join(fr_lines)
        out_segs.append((seg, groups))
        seg_texts.append(stext)
    return out_segs, seg_texts


def format_placed_into_groups(placed, groups, anchor_slots=None):
    """Serialize placed syllables into one override line per phrase count in groups."""
    items = [[tok, len(sl_list)] for tok, sl_list in placed]
    cum, boundaries = 0, set()
    for g in groups[:-1]:
        cum += g
        boundaries.add(cum)
    anchor_slots = anchor_slots or set()

    def item_positions():
        pos = 0
        res = []
        for _, n in items:
            res.append(pos)
            pos += n
        return res

    # Slide any hold that straddles a phrase boundary onto the nearest n==1 note within the same span.
    for _ in range(len(items) * 2):
        positions = item_positions()
        straddle_idx = next(
            (i for i, (_, n) in enumerate(items) if n > 1 and any(positions[i] < b < positions[i] + n for b in boundaries)),
            None,
        )
        if straddle_idx is None:
            break
        n_extra = items[straddle_idx][1] - 1
        items[straddle_idx][1] = 1
        for _ in range(n_extra):
            positions = item_positions()
            cands = []
            for j, (_, n) in enumerate(items):
                if n != 1 or j == straddle_idx:
                    continue
                if (positions[j] + 1) in boundaries:
                    continue
                if any(positions[k] in anchor_slots for k in range(min(j, straddle_idx) + 1, max(j, straddle_idx) + 1)):
                    continue
                cands.append((abs(j - straddle_idx), j))
            if not cands:
                cands = [
                    (abs(j - straddle_idx), j)
                    for j, (_, n) in enumerate(items)
                    if n == 1 and j != straddle_idx and (positions[j] + 1) not in boundaries
                ]
            if not cands:
                return None
            _, target_j = min(cands)
            items[target_j][1] = 2

    lines, idx = [], 0
    for g in groups:
        parts, got = [], 0
        while idx < len(items) and got < g:
            tok, n = items[idx]
            idx += 1
            got += n
            raw_t = tok['t']
            t = raw_t.replace('-', '|')
            if n > 1:
                t += '_' * (n - 1)
            t += '-' if not tok['we'] else ' '
            parts.append(t)
        if got != g:
            return None
        line = ''.join(parts).replace('- ', '-').strip()
        _, pn = align.parse_override_line(line)
        if pn != g:
            return None
        lines.append(line)
    return lines if idx == len(items) else None


def read_existing_override_meta(hid):
    """Preserve existing # NOTE lines, @sung directive, and == +... blocks from an override file."""
    path = os.path.join(OV_DIR, hid + '.txt')
    if not os.path.exists(path):
        return [], [], []
    notes, sung_lines, plus_blocks = [], [], []
    in_plus = False
    for raw in open(path, encoding='utf8').read().splitlines():
        s = raw.strip()
        if s.startswith('== +'):
            in_plus = True
            plus_blocks.append(raw)
            continue
        if in_plus:
            if s.startswith('== ') or s.startswith('@'):
                in_plus = False
            else:
                plus_blocks.append(raw)
                continue
        if s.startswith('# NOTE:'):
            notes.append(raw)
        elif s.startswith('@sung'):
            sung_lines.append(raw)
    return notes, sung_lines, plus_blocks


def build_pdf_index(c, pdf_path, ids):
    """Parse PDF songs and match each FRY hymn uniquely to its French PDF song."""
    songs = parse_pdf_songs(pdf_path)
    pdf_info = []
    for idx, s in enumerate(songs):
        llines = [norm(txt) for _, _, _, txt, is_ch in s['rows'] if not is_ch]
        blob = ' ' + ' '.join(llines) + ' '
        fr_hits = sum(w in blob for w in (
            ' le ', ' la ', ' les ', ' de ', ' des ', ' du ', ' seigneur ', ' jesus ',
            ' dieu ', ' esprit ', ' je ', ' tu ', ' il ', ' nous ', ' est ', ' dans ',
            ' pour ', ' mon ', ' ton ', ' son ', ' un ', ' une ', ' en ', ' et ', ' a ',
        ))
        en_hits = sum(w in blob for w in (
            ' the ', ' and ', ' lord ', ' jesus ', ' god ', ' spirit ', ' my ',
            ' your ', ' you ', ' we ', ' is ', ' in ', ' for ', ' his ', ' our ', ' are ', ' with ',
        ))
        if en_hits > fr_hits + 2:
            continue
        lwords = set(' '.join(llines).split())
        tn = norm(s['title'])
        tn_clean = re.sub(r'\b(?:f\d+|capo\s*\d+|ap\s*\d+.*|ep\s*\d+.*|mt\s*\d+.*|ps\s*\d+.*)\b', '', tn).strip()
        pdf_info.append((idx, tn, tn_clean, llines, lwords))

    pdf_map = {}
    for hid in ids:
        row = c.execute('select first_stanza_line from hymns where _id=?', (hid,)).fetchone()
        if not row:
            continue
        fl = norm(row[0] or '')
        stanzas = c.execute('select text from stanza where parent_hymn=? order by n_order', (hid,)).fetchall()
        slines = [norm(ln) for st in stanzas for ln in st[0].splitlines() if len(norm(ln).split()) >= 2]
        s_words = set(' '.join(slines).split())
        best = (0, -1)
        for idx, _, tn_clean, llines, lwords in pdf_info:
            if not lwords and not tn_clean:
                continue
            th = (
                100 if (fl and tn_clean and len(tn_clean) >= 6 and fl == tn_clean)
                else (60 if fl and tn_clean and len(fl) >= 12 and (fl in tn_clean or tn_clean in fl) else 0)
            )
            lh = sum(
                1 for sl in slines[:12]
                if any(sl == ll or (len(sl) >= 14 and (sl in ll or ll in sl)) for ll in llines)
            )
            sw4 = {w for w in s_words if len(w) >= 4}
            lw4 = {w for w in lwords if len(w) >= 4}
            j = len(sw4 & lw4) / max(1, len(sw4 | lw4)) if sw4 and lw4 else 0
            sc = th + lh * 25 + int(j * 100)
            if sc > best[0]:
                best = (sc, idx)
        if best[1] >= 0:
            pdf_map[hid] = songs[best[1]]
    return pdf_map


def fit_hymn(c, hid, song):
    """Attempt chord-anchored alignment for hid. Returns (status, info, override_text_or_None)."""
    parent_row = c.execute('select parent_hymn from hymns where _id=?', (hid,)).fetchone()
    parent = (parent_row[0] if parent_row else None) or hid
    mei_path = os.path.join(MEI_DIR, parent + '.mei')
    if not os.path.exists(mei_path):
        return 'no_sheet', None, None
    slots = align.mei_slots(mei_path)
    out_segs, seg_texts = extract_merged_segs_and_fr(c, hid, parent, slots)
    segs = [s for s, _ in out_segs]
    seg_groups = [g for _, g in out_segs]
    _, harms = extract_mei_slots_and_harms(mei_path)
    if not harms:
        return 'no_harm', None, None
    pdf_llines, pdf_events = extract_pdf_events_with_chars(song)
    if not pdf_events:
        return 'no_pdf_chords', None, None
    if not seg_texts or not all(seg_texts):
        return 'no_build', None, None

    seg_offsets, all_word_specs, cur_slot = [], [], 0
    for seg_i, (seg, stext) in enumerate(zip(segs, seg_texts)):
        w0 = len(all_word_specs)
        for ws in word_syllable_options([stext]):
            all_word_specs.append((seg_i, ws))
        w1 = len(all_word_specs)
        seg_offsets.append((w0, w1, cur_slot, cur_slot + len(seg['slots'])))
        cur_slot += len(seg['slots'])

    ev_pi = {}
    for ev in pdf_events:
        ev_pi.setdefault(ev[2], []).append(ev)
    p_line_words = [[norm(w[4]) for w in l[2]] for l in pdf_llines]

    mapped = []
    total_w = max(1, len(all_word_specs))
    for seg_i, (w0, w1, _, _) in enumerate(seg_offsets):
        fwords = [norm(all_word_specs[k][1]['raw']) for k in range(w0, w1)]
        if not fwords:
            continue
        fblob = {w for w in fwords if len(w) >= 3}
        line_hits = [
            sum(1 for w in [x for x in pw if len(x) >= 3] if w in fblob)
            / max(1, len([x for x in pw if len(x) >= 3]))
            for pw in p_line_words
        ]
        pi_matches = []
        for pi, pw_list in enumerate(p_line_words):
            pw_clean = [w for w in pw_list if w]
            if not pw_clean or line_hits[pi] < 0.35:
                continue
            best_for_pi = []
            anchor_pwi, first_c = next(((i, w) for i, w in enumerate(pw_list) if len(w) >= 3), (0, pw_clean[0]))
            for anchor_k in range(len(fwords)):
                if fwords[anchor_k] != first_c and first_c not in fwords[anchor_k]:
                    continue
                fi = max(0, anchor_k - anchor_pwi - 1)
                pw2fw = {}
                for pwi, pw in enumerate(pw_list):
                    if not pw:
                        continue
                    for k in range(fi, min(len(fwords), fi + 4)):
                        if fwords[k] == pw or (len(pw) >= 3 and (pw in fwords[k] or fwords[k] in pw)):
                            pw2fw[pwi] = k
                            fi = k + 1
                            break
                if len(pw2fw) >= max(1, int(0.55 * len(pw_clean))):
                    best_for_pi.append(
                        (len(pw2fw) / len(pw_clean), min(pw2fw.values()), max(pw2fw.values()) + 1, pw2fw)
                    )
            if best_for_pi:
                pi_matches.append((pi, best_for_pi))
        cand_intervals = sorted(
            (st_i, en_i, cov, pi, pw2fw) for pi, occs in pi_matches for cov, st_i, en_i, pw2fw in occs
        )
        chosen_intervals = []
        if cand_intervals:
            m_int = len(cand_intervals)
            dp_int = [(0.0, [])] * (m_int + 1)
            for idx_i in range(m_int - 1, -1, -1):
                st_i, en_i, cov, pi, pw2fw = cand_intervals[idx_i]
                nxt_k = next((k for k in range(idx_i + 1, m_int) if cand_intervals[k][0] >= en_i), m_int)
                take_val = (en_i - st_i) * cov + dp_int[nxt_k][0]
                if take_val > dp_int[idx_i + 1][0]:
                    dp_int[idx_i] = (take_val, [(pi, pw2fw)] + dp_int[nxt_k][1])
                else:
                    dp_int[idx_i] = dp_int[idx_i + 1]
            chosen_intervals = dp_int[0][1]

        for pi, pw2fw in chosen_intervals:
            if pi not in ev_pi:
                continue
            for pc, rtok, _, pwi, ci, wtxt in ev_pi[pi]:
                fwi = pw2fw.get(pwi) or (pw2fw[min(pw2fw, key=lambda k: abs(k - pwi))] if pw2fw else None)
                if fwi is None:
                    continue
                gwi = w0 + fwi
                ws = all_word_specs[gwi][1]
                canon_toks = min(ws['reads'], key=lambda r: (r[1], r[2]))[0]
                wl = [i for i, ch in enumerate(wtxt) if ch.isalpha()]
                cil = sum(1 for i in wl if i < ci)
                totl = max(1, len(wl))
                slens = [max(1, sum(1 for ch in t['t'] if ch.isalpha())) for t in canon_toks]
                tgt = cil * sum(slens) / totl
                acc, si = 0, len(canon_toks) - 1
                for k, sl in enumerate(slens):
                    acc += sl
                    if tgt < acc - 0.15:
                        si = k
                        break
                mapped.append((pc, rtok, gwi, si, canon_toks, (gwi + si / len(canon_toks)) / total_w))

    if not mapped:
        return 'no_mapped', None, None

    n_slots = len(slots)
    best_align = None
    for sh in range(12):
        tp = [((e[0][0] + sh) % 12, e[0][1]) for e in mapped]
        m_len, p_len = len(harms), len(tp)
        dp = [[0.0] * (p_len + 1) for _ in range(m_len + 1)]
        ch = [[0] * (p_len + 1) for _ in range(m_len + 1)]
        for i in range(m_len - 1, -1, -1):
            ms, mc, _, _ = harms[i]
            mp = ms / n_slots
            for j in range(p_len - 1, -1, -1):
                pd = abs(mp - mapped[j][5])
                b = (10.0 if mc == tp[j] else (5.0 if mc[0] == tp[j][0] else 0.0)) if pd <= 0.18 else 0.0
                vm = (b + 2.0 * (1.0 - pd) + dp[i + 1][j + 1]) if b > 0 else -1e9
                if vm >= dp[i + 1][j] and vm >= dp[i][j + 1]:
                    dp[i][j], ch[i][j] = vm, 1
                elif dp[i + 1][j] >= dp[i][j + 1]:
                    dp[i][j], ch[i][j] = dp[i + 1][j], 2
                else:
                    dp[i][j], ch[i][j] = dp[i][j + 1], 3
        if best_align is None or dp[0][0] > best_align[0]:
            pairs, i, j, exact_q = [], 0, 0, 0
            while i < m_len and j < p_len:
                if ch[i][j] == 1:
                    if harms[i][1] == tp[j]:
                        exact_q += 1
                    pairs.append((harms[i][0], mapped[j][2], mapped[j][3], mapped[j][4]))
                    i += 1
                    j += 1
                elif ch[i][j] == 2:
                    i += 1
                else:
                    j += 1
            best_align = (dp[0][0], sh, pairs, exact_q)

    _, _, raw_pairs, exact_q = best_align
    cov_raw = len(raw_pairs) / max(1, min(len(harms), len(mapped)))
    eq_ratio = exact_q / max(1, len(raw_pairs))
    if len(harms) < 4 or eq_ratio < 0.50 or cov_raw < 0.45:
        return 'low_confidence', {'M': len(harms), 'raw': len(raw_pairs), 'eq': round(eq_ratio, 2)}, None

    en = align.db_stanzas(c, parent)
    cur_json_path = os.path.join(LYRICS_DIR, hid + '.json')
    cur_syl = json.load(open(cur_json_path, encoding='utf8'))['syl'] if os.path.exists(cur_json_path) else {}

    seg_blocks = []
    kept = []
    for seg_i, (w0, w1, s0, s1) in enumerate(seg_offsets):
        if w1 <= w0:
            continue
        seg = segs[seg_i]
        block_lbl = seg['label']

        seg_raw = [p for p in raw_pairs if s0 < p[0] < s1 and w0 <= p[1] < w1 and not (p[1] == w0 and p[2] == 0)]
        accepted = [(s0, w0, 0, None)]
        for s_idx, gwi, si, ctoks in seg_raw:
            ps, pw, psi, pctoks = accepted[-1]
            if s_idx <= ps or (gwi, si) <= (pw, psi):
                continue

            def eval_span(sa, wa, sia, actoks, sb, wb, sib, bctoks):
                if sb <= sa or (wa, sia) >= (wb, sib):
                    return None, None
                if wa == wb:
                    src = bctoks if actoks is None else actoks
                    toks = src[sia:sib]
                    return align.place(toks, slots[sa:sb]) if toks else (None, None)
                left_frag = actoks[sia:] if (sia > 0 and actoks is not None) else []
                mid_start = wa + 1 if sia > 0 else wa
                right_frag = bctoks[:sib] if (sib > 0 and bctoks is not None) else []
                mid_ws = [all_word_specs[k][1] for k in range(mid_start, wb)]
                return align_span_flex(mid_ws, left_frag, right_frag, slots[sa:sb])

            res_l = eval_span(ps, pw, psi, pctoks, s_idx, gwi, si, ctoks)
            res_r = eval_span(s_idx, gwi, si, ctoks, s1, w1, 0, None)
            if res_l[0] is not None and res_r[0] is not None:
                ds = s_idx - ps
                if ds >= 4 and (res_l[1][0] + res_l[1][1]) > 0.65 * ds:
                    continue
                accepted.append((s_idx, gwi, si, ctoks))
                kept.append((s_idx, ctoks[si]['t']))
        accepted.append((s1, w1, 0, None))

        one_seg = []
        for k in range(len(accepted) - 1):
            sa, wa, sia, actoks = accepted[k]
            sb, wb, sib, bctoks = accepted[k + 1]
            if wa == wb:
                src = bctoks if actoks is None else actoks
                pl, _ = align.place(src[sia:sib], slots[sa:sb])
            else:
                left_frag = actoks[sia:] if (sia > 0 and actoks is not None) else []
                mid_start = wa + 1 if sia > 0 else wa
                right_frag = bctoks[:sib] if (sib > 0 and bctoks is not None) else []
                mid_ws = [all_word_specs[idx][1] for idx in range(mid_start, wb)]
                pl, _ = align_span_flex(mid_ws, left_frag, right_frag, slots[sa:sb])
            one_seg.extend(pl)

        groups = seg_groups[seg_i]
        rel_anchors = {a[0] - s0 for a in accepted[1:-1]}
        ov_lines = format_placed_into_groups(one_seg, groups, rel_anchors)
        if ov_lines is None:
            return 'serialize_fail', {'seg': block_lbl}, None
        seg_blocks.append((block_lbl, ov_lines))

    if not (len(kept) >= 4 or (len(kept) == 3 and len(harms) == 4 and eq_ratio >= 0.99)):
        return 'low_kept', {'M': len(harms), 'kept': len(kept)}, None

    def slot_matches(syl_val, tgt_t):
        if not syl_val:
            return False
        cw = align.etext(syl_val)
        nt = norm(tgt_t)
        if not nt:
            return norm(cw) == nt
        parts = [norm(p) for p in cw.split(align.JOIN)]
        return nt in parts or norm(cw) == nt or nt in norm(cw)

    cur_wrong = sum(
        1 for s_idx, tgt_t in kept
        if not slot_matches(cur_syl.get(slots[s_idx]['id']), tgt_t)
    )
    if cur_wrong == 0:
        return 'already_aligned', {'kept': len(kept)}, None

    # Build override text preserving existing metadata
    notes, sung_lines, plus_blocks = read_existing_override_meta(hid)
    out = [
        '# %s: French fitted to the chord placements in the French youth chord hymnal PDF (%d/%d anchors adjusted).'
        % (hid, cur_wrong, len(kept)),
    ]
    for nline in notes:
        out.append(nline)
    for sline in sung_lines:
        out.append(sline)
    out.append('')
    for blk_lbl, lines in seg_blocks:
        out.append('== ' + blk_lbl)
        out.extend(lines)
        out.append('')
    if plus_blocks:
        out.extend(plus_blocks)
        if out[-1] != '':
            out.append('')
    return 'updated', {'kept': len(kept), 'fixed': cur_wrong}, '\n'.join(out)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('ids', nargs='*')
    ap.add_argument('--pdf', default=DEFAULT_PDF)
    ap.add_argument('--dry-run', action='store_true')
    args = ap.parse_args()

    align.LANG['name'] = 'fr'
    if not os.path.exists(args.pdf):
        print('PDF not found:', args.pdf, file=sys.stderr)
        sys.exit(1)

    c = sqlite3.connect(DB_PATH)
    if args.ids:
        ids = args.ids
    else:
        ids = [
            r[0] for r in c.execute(
                "select _id from hymns where hymn_group='FRY' order by cast(no as int)"
            )
            if not os.path.exists(os.path.join(MEI_DIR, r[0] + '.mei'))
        ]

    pdf_map = build_pdf_index(c, args.pdf, ids)
    import collections
    counts = collections.Counter()
    total_fixed = 0
    for hid in ids:
        if hid not in pdf_map:
            counts['pdf_unmatched'] += 1
            continue
        status, info, ov_text = fit_hymn(c, hid, pdf_map[hid])
        counts[status] += 1
        if status == 'updated':
            total_fixed += info['fixed']
            if not args.dry_run:
                os.makedirs(OV_DIR, exist_ok=True)
                with open(os.path.join(OV_DIR, hid + '.txt'), 'w', encoding='utf8') as f:
                    f.write(ov_text)
        elif status == 'serialize_fail':
            print('WARN serialize_fail:', hid, info)
    print('Summary:', counts, 'total_anchors_fixed=', total_fixed)


if __name__ == '__main__':
    main()
