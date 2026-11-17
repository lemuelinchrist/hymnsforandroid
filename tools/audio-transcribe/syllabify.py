"""English syllables of a sung word: pyphen's hyphenation, but pyphen leaves many words whole ("rivers", "Jerusalem",
"Above", "Babylon" -> "Baby-lon"). When pyphen finds fewer syllables than the word's vowel groups, the word is cut by
the vowel groups instead (a single consonant between two vowels goes with the next syllable: ri-vers, Je-ru-sa-lem,
A-bove, Ba-by-lon; two consonants split: wil-lows). "Zion" stays one (the hymns sing it on one note: the user can split
it with "hyphens" in sheet.json)."""
import re, pyphen
_hy = pyphen.Pyphen(lang='en_US')
_V = 'aeiouy'

def _count(w):
    w = w.lower(); n = len(re.findall(r'[aeiouy]+', w))
    if n > 1 and re.search(r'[^aeiouy]e$', w) and not re.search(r'(le|[^aeiouy]ed)$', w): n -= 1   # silent final e (above, strange)
    if n > 1 and re.search(r'[^aeiouytd]ed$', w): n -= 1                                               # "ed" not sounded (loved)
    return max(n, 1)

def _cut(w, n):
    """w into n pieces at the vowel groups."""
    groups = [(m.start(), m.end()) for m in re.finditer(r'[aeiouy]+', w.lower())]
    if re.search(r'[^aeiouy]e$', w.lower()) and len(groups) > n: groups = groups[:-1]   # the silent e belongs to the last piece
    groups = groups[:n]
    cuts = []   # one consonant between two vowel groups: the cut is before it (ri-vers); two or more: after the first (wil-lows)
    for (s1, e1), (s2, _) in zip(groups, groups[1:]): cuts.append(e1 + 1 if s2 - e1 >= 2 else e1)
    pieces, a = [], 0
    for c in cuts: pieces.append(w[a:c]); a = c
    pieces.append(w[a:])
    return [p for p in pieces if p]

def syllables(word):
    parts = _hy.inserted(word).split('-')
    n = _count(re.sub(r"[^A-Za-z]", '', word))
    if len(parts) < n and len(parts) == 1:
        parts = _cut(word, n)
    elif len(parts) < n:   # some parts have two vowel groups: cut those
        out = []
        for p in parts:
            k = _count(re.sub(r"[^A-Za-z]", '', p)); out += _cut(p, k) if k > 1 else [p]
        parts = out
    return parts

if __name__ == '__main__':
    import sys
    for w in sys.argv[1:]: print(w, '-'.join(syllables(w)))
