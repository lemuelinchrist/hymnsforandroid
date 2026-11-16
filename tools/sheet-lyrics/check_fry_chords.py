#!/usr/bin/env python3
"""Report how well each FRY<n> sheet puts the PDF's chords over the right French word.

For every chord of the parent sheet (MEI <harm>) it takes the syllable sung on that chord and checks that it occurs in
the words the chord hymnal PDF puts chords over, near the same relative position in the song. Prints a rough score per
hymn (0..1) for the current sheetLyrics/FRY<n>.json and for the same file at a git ref (default master), and flags the
hymns that got worse. A heuristic to find hymns to look at by hand, not a proof: transposed or repeated sections can
score low although they are right.

    python3 tools/sheet-lyrics/check_fry_chords.py [--ref master] [--all] [FRY1 FRY7 ...]
"""
import argparse, json, os, sqlite3, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, HERE)
import align  # noqa: E402
import fit_fry_chords as f  # noqa: E402

LYR = 'app/src/main/assets/sheetLyrics/'


def load_new(hid):
    try:
        return json.load(open(os.path.join(ROOT, LYR, hid + '.json'), encoding='utf8'))
    except OSError:
        return None


def load_ref(hid, ref):
    try:
        out = subprocess.check_output(['git', 'show', f'{ref}:{LYR}{hid}.json'], cwd=ROOT, stderr=subprocess.DEVNULL)
        return json.loads(out)
    except Exception:
        return None


def syl(j, nid):
    s = j['syl'].get(nid)
    if isinstance(s, list):
        s = s[0]
    return s if isinstance(s, str) else ''


def score(j, slots, harms, pw):
    if not j or not harms or len(pw) < 0.7 * len(harms):
        return None  # the PDF has too few chords to compare with
    ok = 0
    for k, (si, _, _, _) in enumerate(harms):
        idx = int(k / len(harms) * len(pw))
        win = pw[max(0, idx - 3):idx + 4]
        s = syl(j, slots[si][0]).replace('‿', ' ').split(' ')[0]
        s = f.norm(s)
        if s and any(s in w for w in win):
            ok += 1
    return ok / len(harms)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('ids', nargs='*')
    ap.add_argument('--ref', default='master')
    ap.add_argument('--all', action='store_true', help='print every hymn, not only the changed ones')
    ap.add_argument('--pdf', default=f.DEFAULT_PDF)
    a = ap.parse_args()
    align.LANG['name'] = 'fr'
    c = sqlite3.connect(f.DB_PATH)
    ids = a.ids or [r[0] for r in c.execute("select _id from hymns where hymn_group='FRY' order by cast(no as int)")]
    pm = f.build_pdf_index(c, a.pdf, ids)
    rows = []
    for hid in ids:
        jn, jo = load_new(hid), load_ref(hid, a.ref)
        if hid not in pm or not jn:
            continue
        mei = os.path.join(ROOT, 'app/src/main/assets/sheetMei', jn['parent'] + '.mei')
        if not os.path.exists(mei):
            continue
        slots, harms = f.extract_mei_slots_and_harms(mei)
        pw = [f.norm(e[5]) for e in f.extract_pdf_events_with_chars(pm[hid])[1]]
        n, o = score(jn, slots, harms, pw), score(jo, slots, harms, pw)
        if n is None:
            continue
        rows.append((hid, o, n))
    worse = [r for r in rows if r[1] is not None and r[2] < r[1] - 0.01]
    for hid, o, n in rows:
        if a.all or (o is not None and abs(n - o) > 0.01):
            print(f"{hid:7} {a.ref} {o if o is None else round(o, 2)}  now {n:.2f}" + ('   WORSE' if (hid, o, n) in worse else ''))
    both = [(o, n) for _, o, n in rows if o is not None]
    if both:
        print(f"{len(both)} hymns: {a.ref} avg {sum(o for o, _ in both)/len(both):.3f}, now avg {sum(n for _, n in both)/len(both):.3f}, "
              f"better {sum(n > o + .01 for o, n in both)}, worse {len(worse)}")
    low = [r for r in rows if r[2] < 0.4]
    if low:
        print('score < 0.4 now:', ' '.join(r[0] for r in low))


if __name__ == '__main__':
    main()
