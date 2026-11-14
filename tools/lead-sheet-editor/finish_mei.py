#!/usr/bin/env python3
"""Makes the editor's leadsheet.mei uniform with the app's sheets (app/src/main/assets/sheetMei/<id>.mei).

  python3 tools/lead-sheet-editor/finish_mei.py leadsheet.mei BF473 E881 "We rest on Thee, ... (New Tune)" > BF473.mei

Takes the music from leadsheet.mei and, from the parent's sheet, the subtitle, the printed number and the later stanzas
(<back>, which is all the viewer draws below the notes), and marks the sheet as ours
(<identifier type="source">: the viewer's footer then says Hymns For Android, not www.hymnal.net). Then checks every bar adds up."""
import re, sys
from fractions import Fraction as F
from pathlib import Path
import xml.etree.ElementTree as ET

SHEETS = Path(__file__).resolve().parents[2] / 'app/src/main/assets/sheetMei'


def main(mei, hymn, parent, title):
    s = Path(mei).read_text(encoding='utf-8')
    par = (SHEETS / f'{parent}.mei').read_text(encoding='utf-8')
    sub = re.search(r'<title type="subordinate">.*?</title>', par).group(0)
    number = re.search(r'<identifier type="number">(.*?)</identifier>', par).group(1)
    head = ('<meiHead><fileDesc><titleStmt><title type="main">%s</title>\n%s\n</titleStmt><pubStmt><identifier type="hymn">%s'
            '</identifier><identifier type="number">%s</identifier><identifier type="source">Hymns For Android</identifier>'
            '</pubStmt></fileDesc></meiHead>'
            % (title.replace('&', '&amp;'), sub, hymn, number))
    s = re.sub(r'<meiHead>.*?</meiHead>', head, s, flags=re.S)
    s = re.sub(r'\s*<back>.*?</back>', '', s, flags=re.S)
    back = re.search(r'<back>.*?</back>', par, flags=re.S)
    if back:
        s = s.replace('</music>', '\n' + back.group(0) + '</music>')
    s = s.replace('<mei xmlns="http://www.music-encoding.org/ns/mei" meiversion="5.0"><meiHead>',
                  '<mei xmlns="http://www.music-encoding.org/ns/mei" meiversion="5.0">\n<meiHead>')
    root = ET.fromstring(s)
    for m in root.iter('{http://www.music-encoding.org/ns/mei}measure'):
        tot = sum((F(1, int(e.get('dur'))) * (F(3, 2) if e.get('dots') else 1) for e in m.iter()
                   if e.tag.endswith(('note', 'rest')) and e.get('dur')), F(0))
        print('bar', m.get('n'), tot, file=sys.stderr)
    sys.stdout.write(s)


if __name__ == '__main__':
    if len(sys.argv) != 5: sys.exit(__doc__)
    main(*sys.argv[1:])
