"""Put chord edits made in the web app into the sheets themselves, so every app gets them.

The web app (tools/web) lets a pianist change the chords of a piano sheet and export them as a file
(`hymns-chord-edits-<date>.json`, format in tools/web/README.md). This tool takes such a file and changes the chords in
our LilyPond sources (ly/piano/<id>.ly, the `harmonies` block), then writes the sheet's MEI again
(app/src/main/assets/sheetMei/<id>.mei, what the Android app and the web app show).

The .ly files are generated (ly/README.md: a converter refresh rewrites them), so the accepted edits are also kept as
data in chord_edits/<id>.json, and `apply` puts them in again after a refresh. A bar is only changed when its chords are
still the ones the edit was made on (`was`); otherwise it is reported and left alone.

usage:
  python3 tools/chord_edits.py import EXPORT.json [--dry-run]   take the edits of an exported file (all its sheets)
  python3 tools/chord_edits.py apply [ID ...]                    put the stored edits into the .ly and MEI (all, or these)
  python3 tools/chord_edits.py check                             is every stored edit in its .ly? (after a converter refresh)

A bar is the nth measure of the sheet (1 = the first, the pickup counts), a beat its MEI tstamp (1 = the first beat, in the
meter's unit). Chords are written as LilyPond chordmode (`a4:m7`, `bes2:7/d`); a chord the converter cannot name, or a
beat inside a triplet, is reported and the bar left alone.
"""
import argparse
import datetime
import json
import os
import re
import sys
from fractions import Fraction as F
from xml.sax.saxutils import unescape

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import ly_to_mei as L  # noqa: E402
from guitar_from_piano import block  # noqa: E402

HERE = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
LY_DIR = os.path.join(HERE, 'ly', 'piano')
EDITS_DIR = os.path.join(HERE, 'chord_edits')
MEI_DIR = os.path.normpath(os.path.join(HERE, '..', '..', 'app', 'src', 'main', 'assets', 'sheetMei'))

# chord text (as the web app writes it, or as the sheets print it) -> LilyPond chordmode quality.
# Every LilyPond quality here must be in ly_to_mei.QUALITY, which turns it back into text for the MEI.
TEXT_QUALITY = {
    '': None, 'm': 'm', '7': '7', 'm7': 'm7', 'maj7': 'maj7', '6': '6', 'm6': 'm6', '9': '9', 'm9': 'm9',
    'sus4': 'sus4', 'sus': 'sus4', 'sus2': 'sus2', 'dim': 'dim', '°': 'dim', 'dim7': 'dim7', '°7': 'dim7',
    'aug': 'aug', '+': 'aug', 'add9': '5.9', '7sus4': '7sus4', 'm7♭5': 'm7.5-', 'm7b5': 'm7.5-', 'ø': 'm7.5-',
    'maj9': 'maj9', '11': '11', 'm11': 'm11', '13': '13',
}
CHORD_TEXT = re.compile('^([A-G])(♭|♯|b|#)?(.*?)(?:/([A-G])(♭|♯|b|#)?)?$')
FLAT = {'e': 'ees', 'a': 'aes'}          # the spelling the sheets use (Dutch names: bes, ees, aes, fis, cis ...)
# chord types the hymnal.net sheets never use: LilyPond's own names for them are unclear (add9 prints as "C9"), so the
# chord gets its name written out (\once \override ChordName.text), as NS876 does for its add9; ly_to_mei reads it back.
NAMED = {'5.9', '7sus4', 'm7.5-', 'maj9', '11', 'm11', '13'}


class EditError(ValueError):
    pass


def ly_note(letter, acc):
    l = letter.lower()
    if acc in ('♭', 'b'):
        return FLAT.get(l, l + 'es')
    if acc in ('♯', '#'):
        return l + 'is'
    return l


def chord_to_ly(text):
    """'B♭m7/F' -> ('bes', 'm7', 'f', name); EditError when the converter could not name it again.
    `name` is the written-out name for the chord types in NAMED: as written ('A add9' stays 'A add9'), with ♭ ♯."""
    m = CHORD_TEXT.match(text.strip())
    if not m:
        raise EditError('not a chord: %r' % text)
    root, acc, qual, bass, bacc = m.groups()
    if qual.strip() not in TEXT_QUALITY:
        raise EditError('chord %r: the sheets have no chord type %r yet (add it to TEXT_QUALITY and ly_to_mei.QUALITY)'
                        % (text, qual))
    q = TEXT_QUALITY[qual.strip()]
    if q is not None and q not in L.QUALITY:
        raise EditError('chord %r: ly_to_mei.QUALITY has no %r' % (text, q))
    r, b = ly_note(root, acc), ly_note(bass, bacc) if bass else None
    name = None
    if q in NAMED:
        name = L.chord_text(r, None, None) + qual + ('/' + L.chord_text(b, None, None) if b else '')
    return r, q, b, name


def printed(text):
    """How a chord comes out in the MEI after the round trip ('Cdim' -> 'C°')."""
    root, q, bass, name = chord_to_ly(text)
    return name or L.chord_text(root, q, bass)


SIMPLE = sorted(((F(1, 2 ** k) * (2 - F(1, 2 ** dots)), ('%d' % 2 ** k) + '.' * dots)
                 for k in range(7) for dots in range(3)), reverse=True)
SIMPLE.insert(0, (F(2), '\\breve'))


def durations(length):
    """A length (fraction of a whole note) as LilyPond durations, longest first: 5/8 -> ['2', '8']."""
    out = []
    while length > 0:
        for v, d in SIMPLE:
            if v <= length:
                out.append(d)
                length -= v
                break
        else:
            raise EditError('a length of %s cannot be written without a triplet' % length)
    return out


# ---------------------------------------------------------------- reading a sheet

def bar_info(text):
    """Per measure: (start, end) of its part of the harmonies body (absolute offsets in text), its length (whole notes),
    the meter's unit, and its chords as [(beat, text)]."""
    doc = L.parse(text)
    hb = block(text, 'harmonies')
    if not hb:
        raise EditError('this sheet has no chords')
    body_start, body_end = hb
    body = text[body_start:body_end]
    # the bars' places in the body: split at | outside strings
    cuts, i, in_str = [], 0, False
    while i < len(body):
        c = body[i]
        if c == '"' and (i == 0 or body[i - 1] != '\\'):
            in_str = not in_str
        elif c == '|' and not in_str:
            cuts.append(i)
        i += 1
    starts = [0] + [c + 1 for c in cuts]
    ends = cuts + [len(body)]
    num, den = doc['glob']['time']
    bars = []
    for mi, m in enumerate(doc['measures']):
        if m.get('time'):
            num, den = m['time']
        length = sum((e['len'] for e in m['events'] if e['kind'] in ('note', 'rest', 'space')), F(0))
        chords = [(1 + off * den, t) for off, t in (doc['harm'][mi] if mi < len(doc['harm']) else [])]
        bars.append(dict(start=body_start + starts[mi], end=body_start + ends[mi], length=length, den=den,
                         chords=chords, src=body[starts[mi]:ends[mi]]))
    return bars


def same(a, b):
    return len(a) == len(b) and all(F(x[0]).limit_denominator(1000) == F(y[0]).limit_denominator(1000)
                                    and x[1] == y[1] for x, y in zip(a, b))


def as_fraction(beat):
    return F(beat).limit_denominator(96)


def new_bar_source(bar, chords):
    """The harmonies text of a bar with these chords [(beat, text)]: its commands (\\global, \\time ...), then the chords
    at their beats with spacers, filling the bar's length."""
    toks = L.tokens(bar['src'])
    keep, i = [], 0
    while i < len(toks):                                   # commands stay, at the start of the bar
        t = toks[i]
        if t in ('\\time', '\\partial'):
            keep += toks[i:i + 2]
            i += 2
            continue
        if t in ('\\global', '\\defaultTimeSignature'):
            keep.append(t)
        elif t == '\\tuplet':
            i += 2                                         # the tuplet's ratio and its {; its } is dropped below
        elif t == '\\once':
            i += 4                                         # a written-out chord name: \once \override ChordName.text = \markup {..}
        i += 1
    den = bar['den']
    events = sorted((as_fraction(b), t) for b, t in chords)
    offs = [(b - 1) / den for b, _ in events]
    for (b, t), off in zip(events, offs):
        if off < 0 or off >= bar['length']:
            raise EditError('beat %s is outside the bar' % b)
        if off.denominator & (off.denominator - 1):
            raise EditError('beat %s is inside a triplet; not supported yet' % b)
    out = list(keep)
    pos = F(0)
    for k, ((b, text), off) in enumerate(zip(events, offs)):
        if off > pos:
            out += ['s' + d for d in durations(off - pos)]
        end = offs[k + 1] if k + 1 < len(offs) else bar['length']
        ds = durations(end - off)
        root, q, bass, name = chord_to_ly(text)
        if name:
            out.append('\\once \\override ChordName.text = \\markup { "%s" }' % name)
        out.append(root + ds[0] + (':' + q if q else '') + ('/' + bass if bass else ''))
        out += ['s' + d for d in ds[1:]]
        pos = end
    if pos < bar['length']:
        out += ['s' + d for d in durations(bar['length'] - pos)]
    lead = '\n  ' if bar['src'].startswith('\n') else ' '
    return lead + ' '.join(out) + ' '


# ---------------------------------------------------------------- applying

def load_stored(hymn):
    path = os.path.join(EDITS_DIR, hymn + '.json')
    if not os.path.exists(path):
        return None
    with open(path, encoding='utf-8') as f:
        return json.load(f)


def save_stored(hymn, rec):
    os.makedirs(EDITS_DIR, exist_ok=True)
    with open(os.path.join(EDITS_DIR, hymn + '.json'), 'w', encoding='utf-8') as f:
        json.dump(rec, f, ensure_ascii=False, indent=1, sort_keys=True)
        f.write('\n')


def plan(hymn, edits):
    """For each edited bar: 'apply', 'done' (already in) or 'conflict'/'error' with a reason. -> (text, bars, notes)."""
    path = os.path.join(LY_DIR, hymn + '.ly')
    if not os.path.exists(path):
        raise EditError('no ly/piano/%s.ly (only accepted sheets have one)' % hymn)
    text = open(path, encoding='utf-8').read()
    bars = bar_info(text)
    steps = []
    for key in sorted(edits, key=int):
        e = edits[key]
        n = int(key)
        if not 1 <= n <= len(bars):
            steps.append((n, 'error', 'the sheet has %d bars' % len(bars)))
            continue
        bar = bars[n - 1]
        try:
            want = [(as_fraction(b), printed(t)) for b, t in e['chords']]
        except EditError as err:
            steps.append((n, 'error', str(err)))
            continue
        if same(bar['chords'], want):
            steps.append((n, 'done', None))
        elif same(bar['chords'], [(as_fraction(b), t) for b, t in e.get('was', [])]):
            try:
                new_bar_source(bar, want)                   # can it be written? (a beat inside a triplet cannot)
                steps.append((n, 'apply', want))
            except EditError as err:
                steps.append((n, 'error', str(err)))
        else:
            steps.append((n, 'conflict', 'the bar now has %s, the edit was made on %s'
                          % (fmt(bar['chords']), fmt(e.get('was', [])))))
    return text, bars, steps


def fmt(chords):
    return ' '.join('%s@%s' % (t, float(b) if F(b).denominator != 1 else int(b)) for b, t in chords) or '(no chords)'


def write_sheet(hymn, text, bars, steps):
    """Change the .ly, write the MEI again and check it: the edited bars have exactly the new chords, every other bar and
    every note id is as before."""
    old_mei_path = os.path.join(MEI_DIR, hymn + '.mei')
    old_mei = open(old_mei_path, encoding='utf-8').read() if os.path.exists(old_mei_path) else L.convert(text, hymn)[0]
    new = text
    for n, action, want in sorted(steps, key=lambda s: -s[0]):          # from the end, so the offsets stay valid
        if action != 'apply':
            continue
        bar = bars[n - 1]
        new = new[:bar['start']] + new_bar_source(bar, want) + new[bar['end']:]
    mei = L.convert(new, hymn)[0]
    check(hymn, old_mei, mei, {n: want for n, action, want in steps if action == 'apply'})
    with open(os.path.join(LY_DIR, hymn + '.ly'), 'w', encoding='utf-8') as f:
        f.write(new)
    with open(old_mei_path, 'w', encoding='utf-8') as f:
        f.write(mei)


HARM = re.compile(r'<harm staff="1" tstamp="([^"]+)" place="above">([^<]*)</harm>')


def mei_bars(mei):
    out = []
    for m in re.finditer(r'<measure [^>]*>(.*?)</measure>', mei, re.S):
        out.append([(as_fraction(float(t)), unescape(x)) for t, x in HARM.findall(m.group(1))])
    return out


def check(hymn, old_mei, mei, changed):
    a, b = mei_bars(old_mei), mei_bars(mei)
    if len(a) != len(b):
        raise EditError('%s: the MEI has %d bars instead of %d' % (hymn, len(b), len(a)))
    for i, (x, y) in enumerate(zip(a, b), 1):
        want = changed.get(i)
        if want is not None:
            if not same(sorted(y), sorted(want)):
                raise EditError('%s bar %d: the MEI has %s, wanted %s' % (hymn, i, fmt(y), fmt(want)))
        elif not same(x, y):
            raise EditError('%s bar %d changed by itself: %s -> %s' % (hymn, i, fmt(x), fmt(y)))
    ids = lambda s: re.findall(r'<note xml:id="([^"]+)"', s)  # noqa: E731
    strip = lambda s: re.sub(r'<harm [^>]*>[^<]*</harm>\n?', '', s)  # noqa: E731
    if ids(old_mei) != ids(mei) or strip(old_mei) != strip(mei):
        raise EditError('%s: something besides the chords changed in the MEI' % hymn)


def report(hymn, steps):
    for n, action, why in steps:
        if action == 'apply':
            print('  %s bar %d: %s' % (hymn, n, fmt(why)))
        elif action != 'done':
            print('  %s bar %d: %s, left alone: %s' % (hymn, n, action.upper(), why))


# ---------------------------------------------------------------- commands

def cmd_import(path, dry_run):
    with open(path, encoding='utf-8') as f:
        data = json.load(f)
    if data.get('format') != 'hymns-chord-edits' or not isinstance(data.get('sheets'), dict):
        raise SystemExit('%s is not a chord edits file from the web app' % path)
    total = dict(apply=0, done=0, conflict=0, error=0)
    for hymn, rec in sorted(data['sheets'].items()):
        try:
            text, bars, steps = plan(hymn, rec['bars'])
        except EditError as err:
            print('  %s: left out: %s' % (hymn, err))
            total['error'] += len(rec['bars'])
            continue
        report(hymn, steps)
        for _, action, _ in steps:
            total[action] += 1
        ok = {str(n): rec['bars'][str(n)] for n, action, _ in steps if action in ('apply', 'done')}
        if dry_run or not ok:
            continue
        if any(a == 'apply' for _, a, _ in steps):
            try:
                write_sheet(hymn, text, bars, steps)
            except EditError as err:
                print('  %s: NOT written: %s' % (hymn, err))
                continue
        stored = load_stored(hymn) or {'sheet': hymn, 'bars': {}}
        new = sorted((k for k, v in ok.items() if stored['bars'].get(k, {}).get('chords') != v['chords']), key=int)
        if not new:
            continue
        for k in new:
            stored['bars'][k] = {'was': ok[k].get('was', []), 'chords': ok[k]['chords']}
        stored.setdefault('history', []).append({'imported': datetime.date.today().isoformat(),
                                                 'file': os.path.basename(path), 'bars': new})
        save_stored(hymn, stored)
    print('%s%d bars changed, %d already in, %d conflicts, %d errors'
          % ('(dry run) ' if dry_run else '', total['apply'], total['done'], total['conflict'], total['error']))
    return 0 if not total['conflict'] and not total['error'] else 1


def stored_hymns(only):
    names = sorted(f[:-5] for f in os.listdir(EDITS_DIR) if f.endswith('.json')) if os.path.isdir(EDITS_DIR) else []
    return [h for h in names if not only or h in only]


def cmd_apply(only, check_only):
    bad = 0
    for hymn in stored_hymns(only):
        rec = load_stored(hymn)
        try:
            text, bars, steps = plan(hymn, rec['bars'])
        except EditError as err:
            print('  %s: %s' % (hymn, err))
            bad += 1
            continue
        pending = [s for s in steps if s[1] == 'apply']
        bad += sum(1 for s in steps if s[1] in ('conflict', 'error'))
        if check_only:
            for n, action, why in steps:
                if action != 'done':
                    print('  %s bar %d: %s%s' % (hymn, n, 'NOT IN THE SHEET' if action == 'apply' else action.upper(),
                                                 '' if action == 'apply' else ': ' + why))
            bad += len(pending)
            continue
        report(hymn, steps)
        if pending:
            try:
                write_sheet(hymn, text, bars, steps)
            except EditError as err:
                print('  %s: NOT written: %s' % (hymn, err))
                bad += 1
    print('%d sheets with stored edits; %s' % (len(stored_hymns(only)), 'all in place' if not bad else '%d problems' % bad))
    return 1 if bad else 0


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    sub = ap.add_subparsers(dest='cmd', required=True)
    p = sub.add_parser('import', help='take the edits of an exported file')
    p.add_argument('file')
    p.add_argument('--dry-run', action='store_true', help='only say what would change')
    p = sub.add_parser('apply', help='put the stored edits into the .ly and MEI files')
    p.add_argument('hymns', nargs='*')
    sub.add_parser('check', help='report stored edits that are not in their .ly')
    a = ap.parse_args()
    if a.cmd == 'import':
        sys.exit(cmd_import(a.file, a.dry_run))
    sys.exit(cmd_apply(set(getattr(a, 'hymns', []) or []), a.cmd == 'check'))


if __name__ == '__main__':
    main()
