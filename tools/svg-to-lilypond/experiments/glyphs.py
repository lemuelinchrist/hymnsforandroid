# Glyph outlines differ between LilyPond versions; map known path prefixes to symbol names.
CLS={'M214 140c59 ':'notehead.black','M212 138c68 ':'notehead.black',
     'M212 110c-49':'notehead.whole','M210 110c-18':'notehead.whole',
     'M312 63c0 23':'notehead.half','M310 63c0 22':'notehead.half',
     'M34 33l-1 -5':'flat.chordname','M31 37l-2 -6':'flat.keysig',
     'M379 264c3 0':'clef.G','M647 2c0 -11':'clef.G',
     'M356 30c-48 ':'timesig.C','M250 265c114':'timesig.C'}
def cls(d): return CLS.get(d[:12], 'slur' if d[:3] in ('M0.',) else d[:12])
