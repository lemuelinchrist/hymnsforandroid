"""French syllables for singing.

A French word has no single syllable count: a final silent "e" may be sung or not, "ion" may be one or two
syllables, and so on. So a word gets a list of *readings*, each reading being a list of syllables (as spelled) plus a
cost for how unusual it is. align.py then picks one reading per word so that a line fills exactly its note slots.
"""
import itertools
import re
import unicodedata

VOWELS = set('aeiouyàâäéèêëîïôöùûüœæ')
# letters groups that are one vowel sound
DIGRAPHS = ['eau', 'œu', 'oeu', 'ou', 'oi', 'oy', 'ai', 'ay', 'ei', 'au', 'eu', 'œ', 'æ', 'ui', 'eî', 'aî', 'oû', 'où']
# consonant pairs that stay together at the start of a syllable
ONSET_CLUSTERS = {'pr', 'br', 'tr', 'dr', 'cr', 'gr', 'fr', 'vr', 'pl', 'bl', 'cl', 'gl', 'fl', 'ch', 'ph', 'th', 'gn',
                  'qu', 'gu', 'qʉ', 'gʉ', 'wh', 'chr', 'phr', 'thr'}
ASPIRATED_H = ('haut', 'hors', 'honte', 'héros', 'harpe', 'hâte', 'hardi', 'héraut', 'hibou', 'hurl', 'hau', 'hach',
               'han', 'hap', 'har', 'has', 'hé', 'hui')   # a few common ones: no elision before them
# short words whose final -e is the only vowel: always one sung syllable
E_WORDS = {'le', 'me', 'te', 'se', 'ne', 'de', 'je', 'ce', 'que', 'ke'}


def strip_accents(s):
    return ''.join(ch for ch in unicodedata.normalize('NFD', s) if unicodedata.category(ch) != 'Mn')


def is_vowel(ch):
    return ch.lower() in VOWELS


def nuclei(word):
    """(start, end) of each vowel group; digraphs and the 'y' glides count as one."""
    w = word.lower()
    spans = []
    i = 0
    n = len(w)
    while i < n:
        silent_u = w[i] == 'u' and i > 0 and (w[i - 1] == 'q' or (w[i - 1] == 'g' and i + 1 < n and w[i + 1] in 'eiéèêy'))
        if silent_u:
            i += 1
            continue
        if w[i] in VOWELS:
            j = i + 1
            # greedy: take a digraph/trigraph if one starts here
            matched = False
            for d in sorted(DIGRAPHS, key=len, reverse=True):
                if w.startswith(d, i):
                    j = i + len(d)
                    matched = True
                    break
            if not matched:
                j = i + 1
            spans.append([i, j])
            i = j
        else:
            i += 1
    return spans


def split_consonants(cons):
    """Where a run of consonants between two vowels is cut: returns (coda, onset)."""
    if not cons:
        return '', ''
    low = cons.lower()
    if len(low) == 1:
        return ('x', '') if False else ('', cons)
    # longest valid onset cluster at the end (max 3)
    for k in (3, 2):
        if len(low) >= k and low[-k:] in ONSET_CLUSTERS:
            return cons[:-k], cons[-k:]
    # nasal + consonant: nasal stays (en-dons); otherwise last consonant starts the next syllable
    return cons[:-1], cons[-1]


def syllabify_core(word, glide_split=()):
    """Cut a word into syllables from its vowel groups. glide_split: indexes of vowel pairs to split."""
    spans = nuclei(word)
    # i/u/ou + vowel often count as one (glide) or two (diérèse): merge pairs unless asked to split
    merged = []
    pair_no = 0
    for sp in spans:
        if merged and sp[0] == merged[-1][1]:       # two vowel groups touching
            first = word[merged[-1][0]:merged[-1][1]].lower()
            if first in ('i', 'u', 'ou', 'y') and word[sp[0]].lower() in VOWELS and pair_no not in glide_split:
                merged[-1][1] = sp[1]
                pair_no += 1
                continue
            pair_no += 1
        merged.append(list(sp))
    if not merged:
        return [word]
    syl = []
    start = 0
    for k in range(len(merged)):
        if k + 1 < len(merged):
            gap = word[merged[k][1]:merged[k + 1][0]]
            coda, onset = split_consonants(gap)
            end = merged[k][1] + len(coda)
            syl.append(word[start:end])
            start = end
        else:
            syl.append(word[start:])
    return syl


def count_glide_pairs(word):
    spans = nuclei(word)
    n = 0
    for a, b in zip(spans, spans[1:]):
        if a[1] == b[0] and word[a[0]:a[1]].lower() in ('i', 'u', 'ou', 'y'):
            n += 1
    return n


def elides_before(next_word):
    """True when a final mute -e is swallowed because the next word starts with a vowel sound."""
    if not next_word:
        return False
    w = next_word.lower().lstrip("«»\"'’“”(")
    if not w:
        return False
    if w[0] in VOWELS:
        return True
    if w[0] == 'h':
        return not any(w.startswith(p) for p in ASPIRATED_H)
    return False


def word_readings(word, next_word=None, line_end=False):
    """All plausible ways to sing `word`: list of (syllables, cost)."""
    core = re.sub(r'^[^\wàâäéèêëîïôöùûüœæ]+|[^\wàâäéèêëîïôöùûüœæ]+$', '', word, flags=re.I)
    if not core:
        return [([], 0, 0)]
    low = core.lower()
    if '’' in core or "'" in core:
        # elided article attached (l'Esprit, j'ai): syllabify the whole token
        pass
    # trailing mute e forms
    mute = ''
    base = core
    if low not in E_WORDS and len(low) > 2:
        if low.endswith('ent') and len(low) > 4 and is_vowel(low[-4]) is False and not low.endswith(('ment', 'cent', 'vent', 'pent', 'dent', 'gent', 'sent', 'rent')) and False:
            pass
        m = re.search(r'(es|e|ent)$', low)
        if m and is_vowel(low[-len(m.group(1)) - 1]) is False or (m and low.endswith(('ée', 'ie', 'oie', 'ue', 'ees'))):
            mute = core[-len(m.group(1)):]
            base = core[:-len(m.group(1))]
        # words in -ent that are not verbs end in a nasal: we only allow the mute reading for -ent when a vowel precedes the t
        if low.endswith('ent') and not (len(low) > 4 and re.search(r'[aeiouéèêëï]nt$|[^aeiouéèêë]ent$', low) and False):
            pass
    if not nuclei(base):                 # des, les, tes, es...: the -e is the only vowel
        mute, base = '', core
    if mute and re.search(r'(q|g)u$', base, re.I):      # the u of que/gue is silent: it travels with the e
        base = base[:-1] + 'ʉ'
    glides = count_glide_pairs(base)
    readings = []
    for pattern in itertools.product((0, 1), repeat=glides):
        split_idx = {i for i, v in enumerate(pattern) if v}
        base_syl = syllabify_core(base, split_idx)
        cost = 0                    # merged or split: both natural; the slot count decides (merged wins ties)
        tie = len(split_idx)
        if not mute:
            readings.append((base_syl, cost, tie))
            continue
        # mute e sung: the last consonants move onto their own syllable
        if len(base_syl) and base_syl[-1]:
            last = base_syl[-1]
            m = re.search(r'([^aeiouyàâäéèêëîïôöùûüœæ]*)$', last, re.I)
            tail = m.group(1)
            coda, onset = split_consonants(tail) if tail else ('', '')
            if tail and len(last) > len(tail):
                sung = base_syl[:-1] + [last[:len(last) - len(onset)], onset + mute] if onset else base_syl[:-1] + [last, mute]
                if sung[-2] == '':
                    sung = base_syl[:-1] + [last, mute]
            else:
                sung = base_syl[:-1] + [last, mute]
        else:
            sung = [mute]
        if mute.startswith('ent') and mute == 'ent':
            sung_cost = 0
        else:
            sung_cost = 0
        silent_forced = elides_before(next_word) and not line_end
        merged_silent = base_syl[:-1] + [base_syl[-1] + mute] if base_syl else [core]
        if silent_forced:
            readings.append((merged_silent, cost, tie))
            readings.append((sung, cost + 3, tie))        # translators sometimes sing it anyway (anges et)
        else:
            readings.append((sung, cost + sung_cost, tie))
            readings.append((merged_silent, cost + 1, tie))
    return [([s.replace('ʉ', 'u') for s in syl], c, tt) for syl, c, tt in readings]
