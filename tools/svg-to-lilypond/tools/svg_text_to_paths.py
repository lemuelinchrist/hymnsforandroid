"""Turn the <text> elements of a LilyPond SVG into glyph outlines, so the sheet looks the same in any viewer
without relying on installed fonts (the Android WebView substitutes its own "serif" and syllables overlap).

usage: python3 tools/svg_text_to_paths.py in.svg out.svg

Each distinct glyph is defined once in <defs> (font units, y up) and every text run becomes
<g transform="translate(x,y) scale(s,-s)"><use xlink:href="#id" x="advance"/>...</g>. Advances come from the font's hmtx
table; kerning pairs are not applied (a drift of a few hundredths of a staff space on long words).
Fonts: Century Schoolbook L -> C059 (URW, Century Schoolbook clone), sans-serif / Trebuchet MS -> DejaVu Sans.
"""
import html
import os
import re
import sys

from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.ttLib import TTFont

URW = '/usr/share/fonts/opentype/urw-base35/'
DEJAVU = '/usr/share/fonts/truetype/dejavu/'
FONTS = {
    ('serif', False, False): URW + 'C059-Roman.otf', ('serif', True, False): URW + 'C059-Bold.otf',
    ('serif', False, True): URW + 'C059-Italic.otf', ('serif', True, True): URW + 'C059-BdIta.otf',
    ('sans', False, False): DEJAVU + 'DejaVuSans.ttf', ('sans', True, False): DEJAVU + 'DejaVuSans-Bold.ttf',
    ('sans', False, True): DEJAVU + 'DejaVuSans-Oblique.ttf', ('sans', True, True): DEJAVU + 'DejaVuSans-BoldOblique.ttf',
}
FALLBACK = '/usr/share/fonts/truetype/droid/DroidSansFallbackFull.ttf'     # CJK (Chinese hymnals)
_cache = {}


def family_kind(name):
    return 'serif' if name in ('Century Schoolbook L', 'serif') or 'Schoolbook' in name else 'sans'


def load(kind, bold, italic):
    key = (kind, bold, italic)
    if key not in _cache:
        f = TTFont(FALLBACK if kind == 'cjk' else FONTS[key])
        _cache[key] = (f, f.getGlyphSet(), f.getBestCmap(), f['hmtx'], f['head'].unitsPerEm)
    return _cache[key]


TEXT = re.compile(r'<text\b([^>]*)>(.*?)</text>', re.S)


def convert(svg):
    defs = {}          # id -> path data
    used_fonts = []

    def attr(a, name, default=None):
        m = re.search(r'\b%s="([^"]*)"' % name, a)
        return m.group(1) if m else default

    def repl(m):
        a, body = m.group(1), m.group(2)
        kind = family_kind(attr(a, 'font-family', 'serif'))
        bold = attr(a, 'font-weight', '') == 'bold'
        italic = attr(a, 'font-style', '') in ('italic', 'oblique')
        size = float(attr(a, 'font-size', '10'))
        anchor = attr(a, 'text-anchor', 'start')
        fill = attr(a, 'fill', 'currentColor')
        text = html.unescape(re.sub(r'<[^>]+>', '', body)).replace('\n', '')
        font, gs, cmap, hmtx, upem = load(kind, bold, italic)
        tag = '%s%s%s' % ('r' if kind == 'serif' else 'd', 'b' if bold else '', 'i' if italic else '')
        x, parts = 0, []              # x in units of the primary font; fallback glyphs are rescaled into them
        for ch in text:
            f_, g_, cm_, hm_, up_, tg_ = font, gs, cmap, hmtx, upem, tag
            gn = cm_.get(ord(ch))
            if gn is None:            # not in the primary font (CJK): fall back
                f_, g_, cm_, hm_, up_ = load('cjk', False, False)
                tg_ = 'c'
                gn = cm_.get(ord(ch)) or cm_.get(ord('?'))
            if gn is None:
                continue
            gid = 'g%s_%s' % (tg_, gn)
            if gid not in defs:
                pen = SVGPathPen(g_)
                g_[gn].draw(pen)
                defs[gid] = pen.getCommands()
            k = upem / up_            # fallback font units -> primary font units
            if defs[gid]:
                parts.append('<use xlink:href="#%s" x="%d"/>' % (gid, x) if k == 1 else
                             '<use xlink:href="#%s" transform="translate(%d) scale(%.5f)"/>' % (gid, x, k))
            x += hm_[gn][0] * k
        shift = {'start': 0, 'middle': -x / 2, 'end': -x}.get(anchor, 0)
        s = size / upem
        return '<g fill="%s" transform="translate(%.4f,0) scale(%.6f,%.6f)">%s</g>' % (
            fill, shift * s, s, -s, ''.join(parts))

    out = TEXT.sub(repl, svg)
    d = ''.join('<path id="%s" d="%s"/>' % (k, v) for k, v in sorted(defs.items()) if v)
    out = re.sub(r'(<svg\b[^>]*>)', lambda m: m.group(1) + '<defs>' + d + '</defs>', out, count=1)
    return out


if __name__ == '__main__':
    src = open(sys.argv[1], encoding='utf8').read()
    open(sys.argv[2], 'w', encoding='utf8').write(convert(src))
