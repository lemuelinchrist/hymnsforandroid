#!/usr/bin/env python3
"""A piano MIDI from the lead sheet editor's sheet (leadsheet.json): the melody and the left hand the editor makes from its
chord pattern (the one the user chose and listened to, `acc`), with the notes added under the melody if the sheet has any.
It is the editor's own playback (music.js `playList`, run under Node), written as a file for res/raw/m<tune>.mid.

  python3 tools/lead-sheet-editor/leadsheet_to_midi.py temp/transcribe/<song>/leadsheet.json out.mid [bpm]

bpm defaults to the sheet's tempo. Needs `node` and pretty_midi (the transcribe venv has it)."""
import json, subprocess, sys, pathlib
import pretty_midi
HERE = pathlib.Path(__file__).resolve().parent
JS = "const M=require(process.argv[1]),s=JSON.parse(require('fs').readFileSync(process.argv[2]));console.log(JSON.stringify(M.playList(s)))"

def main(src, out, bpm=None):
    sheet = json.load(open(src, encoding='utf-8'))
    pl = json.loads(subprocess.run(['node', '-e', JS, str(HERE / 'music.js'), src], capture_output=True, text=True, check=True).stdout)
    bpm = float(bpm or sheet.get('tempo') or 90)
    sec = lambda u: u / 4 * 60.0 / bpm   # t and d are in sixteenths: a quarter note = 4
    midi = pretty_midi.PrettyMIDI(initial_tempo=bpm)
    right = pretty_midi.Instrument(program=0, name='Right hand'); left = pretty_midi.Instrument(program=0, name='Left hand')
    for n in pl['mel']:
        right.notes.append(pretty_midi.Note(velocity=92, pitch=int(n['p']), start=sec(n['t']), end=sec(n['t'] + n['d']) - 0.02))
    for n in pl['fill']:
        for p in n['ps']: right.notes.append(pretty_midi.Note(velocity=62, pitch=int(p), start=sec(n['t']), end=sec(n['t'] + n['d']) - 0.02))
    for n in pl['left']:
        for p in n['ps']: left.notes.append(pretty_midi.Note(velocity=68, pitch=int(p), start=sec(n['t']), end=sec(n['t'] + n['d']) - 0.02))
    midi.instruments += [right, left]
    midi.write(out)
    print(out, f"{len(right.notes)} right-hand notes, {len(left.notes)} left-hand notes, {midi.get_end_time():.0f} s at {bpm:g} bpm")

if __name__ == '__main__':
    if len(sys.argv) < 3: sys.exit(__doc__)
    main(*sys.argv[1:])
