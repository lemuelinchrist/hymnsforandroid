"""Parse a hymnal.net LilyPond-generated SVG into absolutely-positioned primitives.

Handles both output formats found in the corpus:
  * "old" format: flat elements, each with its own transform="translate(..)" (Century Schoolbook L fonts)
  * "new" format: <g transform="translate(..)"> wrappers around elements (font-family="serif")

Coordinates are in SVG user units == staff spaces (staff lines are 1.0 apart), y grows downward.
"""
import re
import sys
import hashlib
import xml.etree.ElementTree as ET

_NUM = r'[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?'


def _parse_transform(s):
    """Return (dx, dy, sx, sy) for a transform made of translate/scale only."""
    dx = dy = 0.0
    sx = sy = 1.0
    if not s:
        return dx, dy, sx, sy
    for kind, args in re.findall(r'(translate|scale|rotate|matrix)\(([^)]*)\)', s):
        nums = [float(n) for n in re.findall(_NUM, args)]
        if kind == 'translate':
            dx += nums[0] * sx
            dy += (nums[1] if len(nums) > 1 else 0.0) * sy
        elif kind == 'scale':
            sx *= nums[0]
            sy *= nums[1] if len(nums) > 1 else nums[0]
        else:
            raise ValueError('unsupported transform: ' + s)
    return dx, dy, sx, sy


def glyph_id(d):
    """Stable short id for a glyph outline (font glyph paths are reused verbatim).
    Whitespace is normalized: raw files contain newlines inside d="" that XML parsing turns into spaces."""
    return hashlib.md5(' '.join(d.split()).encode()).hexdigest()[:8]


class Score:
    def __init__(self):
        self.lines = []    # (x1, y, x2, width)            staff lines & other horizontal lines
        self.rects = []    # (x, y, w, h)                  bar lines, stems, ledger lines, beams(?)
        self.glyphs = []   # (gid, x, y, scale)            font glyphs (noteheads, clefs, accidentals...)
        self.curves = []   # (x, y, d)                     slurs, ties, beams, other absolute paths
        self.polys = []    # (x, y, points)                beams are often polygons
        self.texts = []    # (text, x, y, family, size, weight, style)
        self.fmt = None    # 'old' | 'new'
        self.pages = None  # 'N/M' from comment if present


def parse(path):
    raw = open(path, encoding='utf8').read()
    if '<html' in raw[:2000].lower():
        raise ValueError('not an SVG (HTML page)')
    sc = Score()
    m = re.search(r'<!-- Page: (\d+/\d+) -->', raw)
    sc.pages = m.group(1) if m else None
    sc.fmt = 'new' if '<style' in raw[:600] else 'old'
    root = ET.fromstring(raw)

    def walk(el, ox, oy, k):
        dx, dy, sx, sy = _parse_transform(el.get('transform'))
        ox, oy = ox + dx * k[0], oy + dy * k[1]
        k = (k[0] * sx, k[1] * sy)
        tag = el.tag.split('}')[-1]
        if tag == 'line':
            x1 = float(el.get('x1', 0)); x2 = float(el.get('x2', 0))
            y1 = float(el.get('y1', 0))
            sc.lines.append((ox + x1, oy + y1, ox + x2, float(el.get('stroke-width', 0))))
        elif tag == 'rect':
            x = float(el.get('x', 0)); y = float(el.get('y', 0))
            sc.rects.append((ox + x, oy + y, float(el.get('width')), float(el.get('height'))))
        elif tag == 'path':
            d = el.get('d', '')
            if abs(k[0]) != 1.0:          # font glyph: drawn in font units, scaled down
                sc.glyphs.append((glyph_id(d), ox, oy, abs(k[0])))
            else:
                sc.curves.append((ox, oy, d))
        elif tag == 'polygon':
            sc.polys.append((ox, oy, el.get('points')))
        elif tag == 'text':
            t = ''.join(el.itertext()).strip()
            if t:
                sc.texts.append((t, ox, oy, el.get('font-family'), float(el.get('font-size', 0)),
                                 el.get('font-weight', ''), el.get('font-style', '')))
            return
        for c in el:
            walk(c, ox, oy, k)

    walk(root, 0.0, 0.0, (1.0, 1.0))
    return sc


def staves(sc, tol=0.02):
    """Group staff lines into 5-line staves. Returns list of (top_y, x1, x2)."""
    rows = sorted(set((round(l[1], 3), round(l[0], 2), round(l[2], 2)) for l in sc.lines
                      if l[2] - l[0] > 20))
    out, i = [], 0
    while i + 4 < len(rows):
        grp = rows[i:i + 5]
        gaps = [grp[j + 1][0] - grp[j][0] for j in range(4)]
        if all(abs(g - gaps[0]) < tol for g in gaps) and 0.5 < gaps[0] < 1.5:
            out.append((grp[0][0], grp[0][1], grp[0][2], gaps[0]))
            i += 5
        else:
            i += 1
    return out


if __name__ == '__main__':
    s = parse(sys.argv[1])
    print('format', s.fmt, 'pages', s.pages)
    print('lines', len(s.lines), 'rects', len(s.rects), 'glyphs', len(s.glyphs),
          'curves', len(s.curves), 'polys', len(s.polys), 'texts', len(s.texts))
    print('staves', staves(s))
