"""Step 6: the lead sheet (LilyPond, PDF, MusicXML, MIDI) from the melody, the beat, the words and sheet.json.

usage: make_sheet.py <song dir>
reads sheet.json (new_sheet_config.py), midi/<midi>.mid (crepe_melody.py), beats.npy (prepare.py), syllables.json
(align_words.py; without it Whisper's lyrics.json, less exact), the accompaniment stems (chords).
writes sheet.ly, sheet.pdf, sheet.png, sheet.midi and sheet.musicxml (for MuseScore: words and chord symbols included).

Per section (sheet.json "sections", t0..t1 in seconds of the recording):
- notes snapped to eighths of the tracked beat, held to the next note across gaps up to a beat (breaths, clipped ends);
- "notes": "syllables" (default with syllables.json): one note per syllable, the pitch its voice holds longest, a second
  note only where the voice holds another pitch for "melisma_s"; "notes": "pitch": the melody MIDI's notes, every
  syllable getting a run of one or more of them by its time (dynamic programming: timing error plus a small cost for
  each extra melisma note), a note split when there are fewer notes than syllables;
- a note outside "scale" (a slide into the next note) moves to the nearest scale note, towards the next note;
- the octave of each note is chosen so the line moves smoothly inside "range" (brothers and sisters in one octave);
- chords: one per half bar, chroma of the other+bass stems against major, minor and dominant-7 templates, smoothed.
It prints, per section, the syllables and any lost; show.py prints the result bar by bar to check it.
"""
import json, os, sys, pathlib, subprocess, re, numpy as np, pretty_midi, pyphen
d = pathlib.Path(sys.argv[1]); cfg = json.load(open(d / 'sheet.json'))
beats = np.load(d / 'beats.npy'); bidx = np.arange(len(beats)); U = 2
BAR = cfg['beats_per_bar'] * U   # OFF (where the bars start) is set after the chords' set-up: it may be found
unit = lambda t: int(round(np.interp(t, beats, bidx) * U))
raw = sorted(pretty_midi.PrettyMIDI(str(d / 'midi' / f"{cfg['midi']}.mid")).instruments[0].notes, key=lambda n: n.start)
words = [w for s in json.load(open(d / 'lyrics.json')) for w in s['words'] if re.search(r'\w', w['word'])]
text = ' '.join(w['word'].strip() for w in words)
hy = pyphen.Pyphen(lang='en_US')
# word fixes: "history production" -> "His reproduction" (several words may become several)
fixed = []
i = 0
while i < len(words):
    for wrong, right in cfg.get('words', {}).items():
        n = len(wrong.split())
        if ' '.join(re.sub(r'[^\w\']', '', w['word']).lower() for w in words[i:i + n]) == wrong.lower():
            parts = right.split(); t0 = words[i]['start']; t1 = words[i + n - 1]['end']
            for k, p in enumerate(parts):
                fixed.append({'word': p, 'start': t0 + (t1 - t0) * k / len(parts), 'end': t0 + (t1 - t0) * (k + 1) / len(parts)})
            i += n; break
    else:
        fixed.append(words[i]); i += 1
words = fixed

def syllables(w):
    clean = re.sub(r'[^\w\'-]', '', w)
    return hy.inserted(clean).split('-') if clean else []

NAMES = ['c', 'des', 'd', 'ees', 'e', 'f', 'ges', 'g', 'aes', 'a', 'bes', 'b']
# a sharp key spells the black keys as sharps (F sharp in G major, not G flat)
SHARP_KEYS = {'major': ('g', 'd', 'a', 'e', 'b', 'fis', 'cis'), 'minor': ('e', 'b', 'fis', 'cis', 'gis', 'dis', 'ais')}
if cfg['key'] in SHARP_KEYS.get(cfg.get('mode', 'major'), ()):
    NAMES = ['c', 'cis', 'd', 'dis', 'e', 'f', 'fis', 'g', 'gis', 'a', 'ais', 'b']
def name(p):
    o = p // 12 - 4
    return NAMES[p % 12] + ("'" * o if o > 0 else "," * -o)
DUR = {1: ['8'], 2: ['4'], 3: ['4.'], 4: ['2'], 5: ['2', '8'], 6: ['2.'], 7: ['2.', '8'], 8: ['1']}

# chords, one per half bar, from four kinds of evidence (weights in CW, "chord_weights" in sheet.json overrides them):
# - the accompaniment's chroma (other + bass stems) against major, minor and dominant-7 templates;
# - the bass: the bass stem, or the low register of the accompaniment when there is no bass player (a piano's left
#   hand); only counted as far as it is really there: a silent stem scaled to its own maximum is noise;
# - the melody: a sung note that is a chord tone (on a beat counts double) is evidence too, a note that is not one
#   against it (the accompaniment of a choir recording is often faint);
# - the key: a hymn mostly uses the key's own chords (I ii iii IV V vi, V7); the secondary dominants (V of V, of vi,
#   of ii, of IV) a little less; any other chord needs clear evidence.
# A Viterbi pass charges for every change, more inside a bar than on the bar line.
import librosa
cache = d / 'chroma.npz'
C = np.load(cache) if cache.exists() else None
if C is None or 'low' not in C.files:
    st = d / 'stems/htdemucs/source'
    o, sr = librosa.load(st / 'other.wav', sr=22050); b, _ = librosa.load(st / 'bass.wav', sr=22050)
    acc = librosa.feature.chroma_cqt(y=o + b, sr=sr, hop_length=512)
    bass = librosa.feature.chroma_cqt(y=b, sr=sr, hop_length=512, fmin=librosa.note_to_hz('C1'), n_octaves=4)
    low = librosa.feature.chroma_cqt(y=o + b, sr=sr, hop_length=512, fmin=librosa.note_to_hz('C1'), n_octaves=3)
    n_ = min(acc.shape[1], bass.shape[1], low.shape[1])
    np.savez(cache, acc=acc[:, :n_], bass=bass[:, :n_], low=low[:, :n_], t=librosa.frames_to_time(np.arange(n_), sr=sr, hop_length=512),
             bass_level=float(np.sqrt(np.mean(b ** 2)) / (np.sqrt(np.mean(o ** 2)) + 1e-9)))
    C = np.load(cache)
# a bass stem under a tenth of the accompaniment's level is no bass player: use the accompaniment's low register
BASS = C['bass'] if float(C['bass_level']) >= 0.1 else C['low']
CW = {'acc': 1.0, 'bass': 0.25, 'melody': 0.35, 'key': 0.12, 'change': 0.1, 'change_mid_bar': 0.05}
CW.update(cfg.get('chord_weights', {}))
TONIC = NAMES.index(cfg['key']) if cfg['key'] in NAMES else 0
if cfg.get('mode', 'major') == 'minor':   # degrees of the key's own chords: (semitones above the tonic, quality)
    DIATONIC = {(0, ':m'), (3, ''), (5, ':m'), (7, ''), (7, ':7'), (8, ''), (10, ''), (2, ':m')}
    SECONDARY = {(0, ':7'), (2, ':7'), (5, ''), (10, ':7')}
else:
    DIATONIC = {(0, ''), (2, ':m'), (4, ':m'), (5, ''), (7, ''), (7, ':7'), (9, ':m'), (11, ':m')}
    SECONDARY = {(2, ''), (2, ':7'), (4, ''), (4, ':7'), (9, ''), (9, ':7'), (0, ':7'), (10, '')}
CH = []   # (lily name, root, template, key prior)
for r in range(12):
    for q, iv in (('', (0, 4, 7)), (':m', (0, 3, 7)), (':7', (0, 4, 7, 10))):
        t = np.zeros(12); t[[(r + i) % 12 for i in iv]] = 1
        deg = ((r - TONIC) % 12, q)
        prior = 1.0 if deg in DIATONIC else 0.4 if deg in SECONDARY else -0.5
        CH.append((NAMES[r] + q, r, t / np.linalg.norm(t), prior))
def chords_for(first_u, n_halves, melody=()):
    sec_t = lambda u: np.interp(u / U, bidx, beats)
    score = np.zeros((n_halves, len(CH)))
    for h in range(n_halves):
        ua, ub = first_u + h * BAR // 2, first_u + (h + 1) * BAR // 2
        a_, b_ = sec_t(ua), sec_t(ub)
        m = (C['t'] >= a_) & (C['t'] < b_)
        # the melody in this half bar: duration of each pitch class, a note starting on a beat counts double
        mel = np.zeros(12)
        for s_, e_, p_, _ in melody:
            ov = min(e_, ub) - max(s_, ua)
            if ov > 0: mel[p_ % 12] += ov * (2 if s_ >= ua and (s_ - first_u) % U == 0 else 1)
        mel = mel / (mel.sum() + 1e-9)
        acc = C['acc'][:, m].mean(1) if m.any() else np.zeros(12); acc = acc / (np.linalg.norm(acc) + 1e-9)
        low = BASS[:, m].mean(1) if m.any() else np.zeros(12)
        low = low / (low.sum() + 1e-9)                      # a share of the bass, not its own maximum
        for k, (_, r, t, prior) in enumerate(CH):
            tones = t > 0
            score[h, k] = (CW['acc'] * (acc @ t) + CW['bass'] * (low[r] * 3 - 0.25)
                           + CW['melody'] * (mel[tones].sum() - mel[~tones].sum()) + CW['key'] * prior
                           - (0.04 if CH[k][0].endswith(':7') else 0))
    if os.environ.get('CHORD_DEBUG'):   # the best three per half bar, to calibrate the weights
        for h in range(n_halves):
            top = np.argsort(-score[h])[:3]
            print(f'  bar {h // 2 + 1}{"ab"[h % 2]}', '  '.join(f'{CH[k][0]} {score[h, k]:.2f}' for k in top))
    # Viterbi: staying is free, a change costs more inside a bar than on the bar line
    best = score[0].copy(); back = np.zeros((n_halves, len(CH)), int)
    for h in range(1, n_halves):
        cost = CW['change'] + (CW['change_mid_bar'] if h % 2 else 0)
        stay = best; move = best.max() - cost
        back[h] = np.where(stay >= move, np.arange(len(CH)), best.argmax())
        best = np.maximum(stay, move) + score[h]
    path = [int(best.argmax())]
    for h in range(n_halves - 1, 0, -1): path.append(back[h][path[-1]])
    return [CH[k][0] for k in path[::-1]]
chord_toks, chord_list = [], []

# where the bars start ("bar_offset": "auto", or a number of beats). The beat tracker finds the beats, not beat 1:
# - the harmony changes on the bar line or the half bar, so the half-bar windows on the right beats give the clearest
#   chords (the best template's match is higher); this picks between the offsets 0/2 and 1/3;
# - long sung notes fall on beat 1 more than on beat 3 (and syllables just before it are pickups); this picks the one
# of the two. Printed, so a wrong guess can be fixed with a number.
def find_bar_offset():
    spans = [(s['t0'], s['t1']) for s in cfg['sections']]
    nb = cfg['beats_per_bar']; half = max(1, nb // 2)
    clarity = []
    for off in range(half):
        vals = []
        for k in range(off, len(beats) - half, half):
            a_, b_ = beats[k], beats[k + half]
            if not any(t0 <= a_ and b_ <= t1 for t0, t1 in spans): continue
            m = (C['t'] >= a_) & (C['t'] < b_)
            if not m.any(): continue
            acc = C['acc'][:, m].mean(1); acc = acc / (np.linalg.norm(acc) + 1e-9)
            vals.append(max(acc @ ch[2] for ch in CH))
        clarity.append(float(np.mean(vals)) if vals else 0.0)
    best = int(np.argmax(clarity))
    sy = json.load(open(d / 'syllables.json')) if (d / 'syllables.json').exists() else []
    sy = [x for x in sy if any(t0 - 0.5 <= x['start'] < t1 for t0, t1 in spans)]
    weight = {}
    for off in range(best, nb, half):
        w = 0.0
        for i, x in enumerate(sy):
            pos = np.interp(x['start'], beats, bidx); dur = (sy[i + 1]['start'] if i + 1 < len(sy) else x['end']) - x['start']
            if round((pos - off) * 2) / 2 % nb == 0: w += dur
        weight[off] = w
    off = max(weight, key=weight.get) if weight else best
    print('bar offset', off, '(chord clarity per half-bar grid', [round(c, 3) for c in clarity], ', held syllables on beat 1',
          {k: round(v, 1) for k, v in weight.items()}, ')')
    return off
OFF = (find_bar_offset() if cfg.get('bar_offset', 'auto') == 'auto' else cfg['bar_offset']) * U

# notes from the syllables (sheet.json "notes": "syllables", the default when syllables.json exists): a hymn sings one
# note per syllable, and the forced alignment knows where each syllable starts. The pitch of a syllable is the one its
# voice holds longest between its start and the next syllable (the scoop at its start and the slide at its end are
# short); a second or third note (a melisma) only where the voice settles on another semitone for MELISMA_S or more.
by_syllable = cfg.get('notes', 'syllables' if (d / 'syllables.json').exists() else 'pitch') == 'syllables'
MELISMA_S = cfg.get('melisma_s', 0.25)
if by_syllable:
    from scipy.ndimage import median_filter
    P = np.load(d / 'pitch.npz')
    pt, pconf = P['t'], P['conf']
    pv = P['voiced'] if 'voiced' in P.files else pconf >= 0.5
    pm_ = pretty_midi.hz_to_note_number(np.maximum(P['f0'], 1)) - (float(P['tuning']) if 'tuning' in P.files else 0.0)
def syllable_notes(syls, t_end):
    out, prev = [], None
    for j, (st, lab) in enumerate(syls):
        nx = syls[j + 1][0] if j + 1 < len(syls) else t_end
        i0, i1 = np.searchsorted(pt, st), np.searchsorted(pt, nx)
        idx = np.arange(i0, i1)[pv[i0:i1]]
        if len(idx) < 3:   # hardly voiced (a short word on a consonant): the less sure frames, else the last pitch
            idx = np.arange(i0, i1)[pconf[i0:i1] >= 0.2]
        if len(idx) < 3:
            if prev is not None: out.append([unit(st), unit(nx), prev, lab])
            continue
        semi = np.round(median_filter(pm_[idx], size=min(9, len(idx)) | 1, mode='nearest')).astype(int)
        # runs of one semitone, in order; frames are 10 ms
        runs = []
        for k, q in zip(idx, semi):
            if runs and runs[-1][2] == q and k - runs[-1][1] <= 3: runs[-1][1] = k
            else: runs.append([k, k, int(q)])
        main = max(runs, key=lambda r: r[1] - r[0])
        long = [r for r in runs if (r[1] - r[0]) * 0.01 >= MELISMA_S or r is main]
        held = []   # the notes of this syllable: long runs, same-pitch neighbours joined
        for r in long:
            if held and held[-1][2] == r[2]: held[-1][1] = r[1]
            else: held.append(list(r))
        held = held[:3]
        end = pt[min(idx[-1] + 1, len(pt) - 1)]
        for k, (a_, b_, q) in enumerate(held):
            # the note starts where the voice does: a syllable's time is its first consonant's ("Chr-ist")
            s_ = (pt[idx[0]] if pt[idx[0]] - st < 0.3 else st) if k == 0 else pt[a_]
            e_ = pt[held[k + 1][0]] if k + 1 < len(held) else end
            out.append([unit(s_), unit(e_), q, lab if k == 0 else None])
        prev = held[-1][2]
    return out

music, lyr, qmidi = [], [], []
for sec in cfg['sections']:
    ns = [[n.start, n.end, n.pitch] for n in raw if sec['t0'] <= n.start < sec['t1']]
    ws = [w for w in words if sec['t0'] - 0.5 <= w['start'] < sec['t1']]
    # syllables with a time each: from the forced alignment (align_words.py) when there is one, else spread over Whisper's words
    if (d / 'syllables.json').exists():
        syls = [[x['start'], x['syl'] + (' --' if x['cont'] else '')] for x in json.load(open(d / 'syllables.json'))
                if sec['t0'] - 0.5 <= x['start'] < sec['t1']]
    else:
        syls = []
        for w in ws:
            parts = syllables(w['word']); t0, t1 = w['start'], max(w['end'], w['start'] + 0.1)
            for k, part in enumerate(parts):
                syls.append([t0 + (t1 - t0) * k / len(parts), part + (' --' if k < len(parts) - 1 else '')])
    if by_syllable and syls:
        notes = syllable_notes(syls, sec['t1'])
    else:
        while len(ns) < len(syls):   # still short: split the longest note
            k = max(range(len(ns)), key=lambda i: ns[i][1] - ns[i][0]); s_, e_, p_ = ns[k]
            ns[k:k + 1] = [[s_, (s_ + e_) / 2, p_], [(s_ + e_) / 2, e_, p_]]
        # monotonic alignment: each syllable takes a run of 1+ notes, all notes used, timing error + a cost per melisma note
        N, S, INF = len(ns), len(syls), 1e9
        dp = np.full((N + 1, S + 1), INF); back = np.zeros((N + 1, S + 1), int); dp[0, 0] = 0
        for j in range(1, S + 1):
            for i in range(j, N - (S - j) + 1):
                for k in range(j - 1, i):
                    c = dp[k, j - 1] + abs(ns[k][0] - syls[j - 1][0]) + 0.25 * (i - k - 1)
                    if c < dp[i, j]: dp[i, j] = c; back[i, j] = k
        labels = [None] * N; i = N
        for j in range(S, 0, -1):
            k = back[i, j]; labels[k] = syls[j - 1][1]; i = k
        notes = [[unit(s_), unit(e_), p_, labels[i]] for i, (s_, e_, p_) in enumerate(ns)]
    notes.sort(key=lambda n: n[0])
    clean = []
    for n in notes:
        if clean and n[0] <= clean[-1][0]:   # same eighth: a sung syllable moves one eighth later, a melisma note goes
            if n[3] is None: continue
            n[0] = clean[-1][0] + 1
        if clean and n[0] < clean[-1][1]: clean[-1][1] = n[0]
        n[1] = max(n[1], n[0] + 1); clean.append(n)
    for i in range(len(clean) - 1):
        if clean[i + 1][0] - clean[i][1] <= U: clean[i][1] = clean[i + 1][0]
    # key: a note outside the scale (a slide into the next note) moves to the nearest scale note, towards the next note
    scale = set(cfg.get('scale', []))
    if scale:
        for i, n in enumerate(clean):
            if n[2] % 12 not in scale:
                nxt = clean[i + 1][2] if i + 1 < len(clean) else n[2]
                n[2] = n[2] + (1 if nxt > n[2] else -1) if (n[2] + (1 if nxt > n[2] else -1)) % 12 in scale else n[2] - (1 if nxt > n[2] else -1)
    # octave per note: the line moves smoothly (no leaps over a sixth) and stays in the singing range lo..hi
    lo, hi = cfg.get('range', [58, 77])
    cand = [[q for q in (n[2] - 24, n[2] - 12, n[2], n[2] + 12, n[2] + 24) if lo <= q <= hi] or [n[2]] for n in clean]
    cost = [[0.0] * len(c) for c in cand]; back = [[0] * len(c) for c in cand]
    for i in range(1, len(clean)):
        for a_, q in enumerate(cand[i]):
            opts = [cost[i - 1][b_] + (abs(q - r) if abs(q - r) <= 9 else 20 + abs(q - r)) for b_, r in enumerate(cand[i - 1])]
            back[i][a_] = int(np.argmin(opts)); cost[i][a_] = min(opts) + 3 * abs(q - clean[i][2]) / 12   # keep the sung octave if it fits
    k = int(np.argmin(cost[-1])); pick = [0] * len(clean)
    for i in range(len(clean) - 1, -1, -1):
        pick[i] = cand[i][k]; k = back[i][k]
    for n, q in zip(clean, pick): n[2] = q
    up = set()
    first = (clean[0][0] - OFF) // BAR * BAR + OFF
    def pieces(pos, length):
        out = []
        while length > 0:
            room = BAR - (pos - first) % BAR; take = min(room, length); out.append(take); pos += take; length -= take
        return out
    toks = [f'\\mark "{sec["mark"]}"'] + (['\\repeat volta 2 {'] if sec.get('repeat') else [])
    pos = first
    for k, (s, e, p, lab) in enumerate(clean):
        if s > pos:
            toks += ['r' + x for part in pieces(pos, s - pos) for x in DUR[part]]
        pp = p + (12 if k in up else 0)
        seq = [x for part in pieces(s, e - s) for x in DUR[part]]
        toks += [name(pp) + x + ('~' if i < len(seq) - 1 else '') for i, x in enumerate(seq)]
        lyr.append('_' if lab is None else ('"' + lab.replace(' --', '') + '"' + (' --' if lab.endswith('--') else '')))
        qmidi.append((s - first, e - first, pp, len(music)))
        pos = e
    rest = (BAR - (pos - first) % BAR) % BAR
    toks += ['r' + x for x in DUR[rest]] if rest else []
    nh = ((pos + rest - first) // BAR) * 2
    ch = chords_for(first, nh, [(s_, e_, p_, l_) for s_, e_, p_, l_ in clean]); chord_list += ch
    chord_toks.append(' '.join(c.replace(':', '2:') if ':' in c else c + '2' for c in ch))
    toks += ['}'] if sec.get('repeat') else []
    if not sec.get('repeat'): toks += ['\\bar "||"'] if sec is not cfg['sections'][-1] else ['\\bar "|."']
    music.append(' '.join(toks))
    lost = [x[1] for x in syls if x[1] not in [n[3] for n in clean]]
    print(sec['mark'], len(syls), 'syllables,', sum(1 for n in clean if n[3]), 'sung,', 'lost:', lost, len(clean), 'notes,', (pos - first) // BAR + 1, 'bars,',
          sum(1 for n in clean if n[3] is None), 'melisma notes')

tempo = round(60 / np.median(np.diff(beats)))
ly = f"""\\version "2.24.0"
\\header {{ title = "{cfg['title']}" subtitle = "Draft transcribed from a recording: check by ear" tagline = ##f }}
\\paper {{ #(set-paper-size "a4") }}
melody = {{ \\clef treble \\key {cfg['key']} \\{cfg['mode']} \\time {cfg['beats_per_bar']}/4 \\tempo 4 = {tempo}
  {chr(10).join(music)}
}}
words = \\lyricmode {{ {' '.join(lyr)} }}
harmonies = \\chordmode {{ {' '.join(chord_toks)} }}
\\score {{ <<
  \\new ChordNames {{ \\set chordChanges = ##t \\harmonies }}
  \\new Voice = "m" \\melody
  \\new Lyrics \\lyricsto "m" \\words
>> \\layout {{ }} }}
\\score {{ \\unfoldRepeats \\new Voice \\melody \\midi {{ }} }}
"""
(d / 'sheet.ly').write_text(ly)
subprocess.run(['lilypond', '-s', '-dno-point-and-click', '--pdf', '--png', '-dresolution=110', '-o', str(d / 'sheet'), str(d / 'sheet.ly')])

# MusicXML for MuseScore: python-ly converts the music, then the words are put back on the notes (it loses their text)
import music21
# the converter makes a part of the chord names too: give it the melody alone
(d / 'melody_only.ly').write_text(ly.replace('  \\new ChordNames { \\set chordChanges = ##t \\harmonies }\n', ''))
subprocess.run([str(pathlib.Path(sys.executable).parent / 'ly'), 'musicxml', '-o', str(d / 'sheet.musicxml'), str(d / 'melody_only.ly')], capture_output=True)
score = music21.converter.parse(str(d / 'sheet.musicxml'))
score.metadata = music21.metadata.Metadata(title=cfg['title'])
it = iter(lyr); prev = False
for n in score.recurse().notes:
    n.lyrics = []
    if n.tie is not None and n.tie.type in ('continue', 'stop'): continue
    tok = next(it, '_')
    if tok == '_': continue
    txt = tok.split('"')[1]; cont = tok.endswith('--')
    n.addLyric(txt, applyRaw=True)
    n.lyrics[0].syllabic = ('middle' if prev else 'begin') if cont else ('end' if prev else 'single')
    prev = cont
# chords as chord symbols, two per measure
from music21 import harmony
def sym(c):
    root, _, q = c.partition(':'); r = root[0].upper() + {'es': '-', 'is': '#', 's': '-'}.get(root[1:], '') if len(root) > 1 else root.upper()
    if root in ('ees', 'aes'): r = root[0].upper() + '-'
    return r + {'': '', 'm': 'm', '7': '7'}[q]
last = None
for i, meas in enumerate(score.parts[0].getElementsByClass('Measure')):
    for h in range(2):
        k = 2 * i + h
        if k < len(chord_list) and chord_list[k] != last:
            meas.insert(h * cfg['beats_per_bar'] / 2, harmony.ChordSymbol(sym(chord_list[k]))); last = chord_list[k]
score.write('musicxml', str(d / 'sheet.musicxml'))
for f in (d / 'sheet.musicxml~',): f.unlink(missing_ok=True)
