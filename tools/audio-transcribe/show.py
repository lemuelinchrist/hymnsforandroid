"""Prints the sheet bar by bar: note (length in eighths) and its syllable. usage: show.py <song dir> [first bar] [last bar]"""
import sys, music21
s = music21.converter.parse(sys.argv[1] + '/sheet.musicxml', forceSource=True)   # its cache can hold an older sheet
a, b = (int(sys.argv[2]), int(sys.argv[3])) if len(sys.argv) > 3 else (1, 999)
for i, m in enumerate(s.parts[0].getElementsByClass('Measure'), 1):
    if not a <= i <= b: continue
    out = []
    for e in m.notesAndRests:
        if isinstance(e, music21.harmony.ChordSymbol): out.append('[' + e.figure + ']'); continue
        L = int(e.quarterLength * 2)
        if e.isRest: out.append(f'r{L}'); continue
        tie = '~' if e.tie and e.tie.type in ('start', 'continue') else ''
        syl = e.lyric or ('' if e.tie and e.tie.type in ('continue', 'stop') else '_')
        out.append(f'{e.nameWithOctave.replace("-", "b")}{L}{tie}' + (f'"{syl}"' if syl else ''))
    print(f'{i:3} ' + ' '.join(out))
