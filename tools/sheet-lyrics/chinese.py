"""Chinese words for singing: every character is one syllable (punctuation travels with the character before it)."""
import re

CJK = re.compile(r'[㐀-鿿豈-﫿々〇]')
LATIN_RUN = re.compile(r'[A-Za-z0-9À-ɏ]+')


def units(line):
    """[(prefix, core, suffix)] for a line: a character (or a Latin word) is the core; punctuation goes with a neighbour."""
    out = []
    pending = ''                  # punctuation before the first unit
    i, n = 0, len(line)
    while i < n:
        ch = line[i]
        if CJK.match(ch):
            out.append([pending, ch, ''])
            pending = ''
            i += 1
            continue
        m = LATIN_RUN.match(line, i)
        if m:
            out.append([pending, m.group(0), ''])
            pending = ''
            i = m.end()
            continue
        if ch.isspace():
            i += 1
            continue
        if out:
            out[-1][2] += ch
        else:
            pending += ch
        i += 1
    return [tuple(u) for u in out]


def options(lines):
    """Same shape as align.word_options: (pre, core, suf, readings, ends_line); one reading per character."""
    out = []
    for line in lines:
        us = units(line)
        for k, (pre, core, suf) in enumerate(us):
            out.append((pre, core, suf, [([core], 0, 0)], k == len(us) - 1))
    return out
