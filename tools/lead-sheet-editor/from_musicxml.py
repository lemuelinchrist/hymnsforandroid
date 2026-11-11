"""usage: from_musicxml.py <song dir> [file.musicxml] [--force]
Makes <song dir>/leadsheet.json, the editor's sheet, from a MusicXML lead sheet (default: the song's sheet.musicxml,
as tools/audio-transcribe/make_sheet.py writes it): one melody part, lyrics, chord symbols.
Needs music21 (the transcribe venv has it). An existing leadsheet.json is kept unless --force is given.

leadsheet.json: {"title", "key" ("G", "Bb", "F#"), "mode", "time" [4, 4], "tempo", "pickup" (sixteenths in the upbeat
bar, 0 = none), "message" (notes between the editors), "notes": [{"p": MIDI pitch or null for a rest, "d": length in
sixteenths, "w": [syllable per verse; "De-" = the word goes on; "" = the syllable before is held], "ch": chord above
it, "c": a comment on this note, "e": true = spell it the other way (D flat for C sharp)}]}"""
import sys, json, music21
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from server import dump

args = [a for a in sys.argv[1:] if a != '--force']
d = Path(args[0]); src = Path(args[1]) if len(args) > 1 else d / 'sheet.musicxml'
out = d / 'leadsheet.json'
if out.exists() and '--force' not in sys.argv: sys.exit(f'{out} exists (it may hold edits): --force to replace it')
s = music21.converter.parse(str(src), forceSource=True)
part = s.parts[0]
ks = next(iter(part.recurse().getElementsByClass('KeySignature')), None)
key = ks.asKey() if ks is not None and not hasattr(ks, 'tonic') else ks
ts = next(iter(part.recurse().getElementsByClass('TimeSignature')), None)
mm = next(iter(s.recurse().getElementsByClass('MetronomeMark')), None)
notes, chord = [], None
for m in part.getElementsByClass('Measure'):
    for e in m.notesAndRests:
        if isinstance(e, music21.harmony.ChordSymbol):
            chord = e.figure.replace('-', 'b'); continue
        L = round(e.quarterLength * 4)
        if L <= 0: continue
        if e.isRest:
            if notes and notes[-1]['p'] is None and 'ch' not in notes[-1] and chord is None: notes[-1]['d'] += L
            else: notes.append({'p': None, 'd': L})
        elif e.tie and e.tie.type in ('continue', 'stop') and notes and notes[-1]['p'] == e.pitch.midi:
            notes[-1]['d'] += L; continue   # a tied note is one note here; the editor draws the tie where a bar needs it
        else:
            w = ''
            if e.lyrics:
                w = (e.lyrics[0].text or '') + ('-' if e.lyrics[0].syllabic in ('begin', 'middle') else '')
            notes.append({'p': e.pitch.midi, 'd': L, 'w': [w]})
        if chord is not None: notes[-1]['ch'] = chord; chord = None
bar = round(ts.barDuration.quarterLength * 4) if ts else 16
pickup = 0
if notes and notes[0]['p'] is None and notes[0]['d'] < bar:   # the rest before an upbeat: the first bar is the upbeat alone
    first = notes.pop(0); pickup = bar - first['d']
    if 'ch' in first and notes: notes[0].setdefault('ch', first['ch'])
while notes and notes[-1]['p'] is None: notes.pop()
cfg = json.loads((d / 'sheet.json').read_text()) if (d / 'sheet.json').exists() else {}
sheet = {'title': cfg.get('title') or (s.metadata.title if s.metadata and s.metadata.title and 'Music21' not in s.metadata.title else d.name),
         'key': key.tonic.name.replace('-', 'b') if key else 'C', 'mode': key.mode if key else 'major',
         'time': [ts.numerator, ts.denominator] if ts else [4, 4], 'tempo': round(mm.number) if mm and mm.number else 90,
         'pickup': pickup, 'message': '', 'notes': notes}
out.write_text(dump(sheet), encoding='utf-8')
print(out, len(notes), 'notes, key', sheet['key'], sheet['mode'], 'pickup', pickup)
