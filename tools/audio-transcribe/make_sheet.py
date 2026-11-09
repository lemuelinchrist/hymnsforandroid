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
import json, sys, pathlib, subprocess, re, numpy as np, pretty_midi, pyphen
d = pathlib.Path(sys.argv[1]); cfg = json.load(open(d / 'sheet.json'))
beats = np.load(d / 'beats.npy'); bidx = np.arange(len(beats)); U = 2
BAR = cfg['beats_per_bar'] * U; OFF = cfg['bar_offset'] * U
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

# chords: chroma of the accompaniment (other + bass stems), templates of major, minor and dominant-7 chords,
# one chord per half bar, smoothed by a Viterbi pass that charges for every change
import librosa
cache = d / 'chroma.npz'
if not cache.exists():
    st = d / 'stems/htdemucs/source'
    o, sr = librosa.load(st / 'other.wav', sr=22050); b, _ = librosa.load(st / 'bass.wav', sr=22050)
    np.savez(cache, acc=librosa.feature.chroma_cqt(y=o + b, sr=sr, hop_length=512), bass=librosa.feature.chroma_cqt(y=b, sr=sr, hop_length=512),
             t=librosa.frames_to_time(np.arange(librosa.feature.chroma_cqt(y=b, sr=sr, hop_length=512).shape[1]), sr=sr, hop_length=512))
C = np.load(cache)
CH = []   # (lily name, root, template)
for r in range(12):
    for q, iv in (('', (0, 4, 7)), (':m', (0, 3, 7)), (':7', (0, 4, 7, 10))):
        t = np.zeros(12); t[[(r + i) % 12 for i in iv]] = 1; CH.append((NAMES[r] + q, r, t / np.linalg.norm(t)))
def chords_for(first_u, n_halves):
    sec_t = lambda u: np.interp(u / U, bidx, beats)
    score = np.zeros((n_halves, len(CH)))
    for h in range(n_halves):
        a_, b_ = sec_t(first_u + h * BAR // 2), sec_t(first_u + (h + 1) * BAR // 2)
        m = (C['t'] >= a_) & (C['t'] < b_)
        if not m.any(): continue
        acc = C['acc'][:, m].mean(1); bass = C['bass'][:, m].mean(1)
        acc = acc / (np.linalg.norm(acc) + 1e-9); bass = bass / (bass.max() + 1e-9)
        for k, (_, r, t) in enumerate(CH):
            score[h, k] = acc @ t + 0.3 * bass[r] - (0.05 if ':7' in CH[k][0] else 0)
    # Viterbi: stay is free, a change costs 0.15
    best = score[0].copy(); back = np.zeros((n_halves, len(CH)), int)
    for h in range(1, n_halves):
        stay = best; move = best.max() - 0.15
        back[h] = np.where(stay >= move, np.arange(len(CH)), best.argmax())
        best = np.maximum(stay, move) + score[h]
    path = [int(best.argmax())]
    for h in range(n_halves - 1, 0, -1): path.append(back[h][path[-1]])
    return [CH[k][0] for k in path[::-1]]
chord_toks, chord_list = [], []

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
            s_ = st if k == 0 else pt[a_]
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
    ch = chords_for(first, nh); chord_list += ch
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
