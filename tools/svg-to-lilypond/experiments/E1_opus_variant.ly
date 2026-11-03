\version "2.24.3"

% E1 - "Glory be to God the Father" (piano lead sheet)
% Hand-transcribed from app/src/main/assets/pianoSvg/E1.svg to test
% whether a .ly source can reproduce the original hymnal.net SVG.

#(set-global-staff-size 16)

\paper {
  #(set-paper-size "letter")
  #(define fonts
     (set-global-fonts
      #:roman "Century Schoolbook L"
      #:sans "sans-serif"
      #:factor (/ staff-height pt 20)))
  left-margin = 12.7\mm
  line-width = 194.3\mm
  top-margin = 8.9\mm
  bottom-margin = 12.5\mm
  markup-system-spacing = #'((basic-distance . 0) (minimum-distance . 0) (padding . 2.55) (stretchability . 0))
  system-system-spacing = #'((basic-distance . 0) (minimum-distance . 0) (padding . 1.544) (stretchability . 0))
  score-markup-spacing = #'((basic-distance . 0) (minimum-distance . 0) (padding . 7.23) (stretchability . 0))
  ragged-last = ##f
  ragged-last-bottom = ##t
  oddHeaderMarkup = ""
  evenHeaderMarkup = ""
  oddFooterMarkup = \markup \fill-line {
    \override #'(font-name . "Trebuchet MS") "www.hymnal.net"
  }
}

\header {
  title = \markup \fontsize #-1 "Glory be to God the Father"
  subtitle = \markup \normalsize \bold "Blessing of the Trinity—His Plan"
  composer = \markup \fontsize #8.5 \medium "1"
  tagline = ##f
}

melody = \relative c' {
  \clef treble
  \key aes \major
  \time 4/4
  ees4 ees ees c' |
  bes4 aes f aes |
  ees4 c' bes bes |
  bes1 | \break
  c4 c c bes |
  aes4 aes aes f |
  ees2 f4( g) |
  aes1 \bar "|."
}

harmonies = \chordmode {
  aes1 |
  ees2 des |
  aes2 bes:7 |
  ees1 |
  c2 c:7 |
  f2:m des |
  aes2/ees ees:7 |
  aes1 |
}

verseOne = \lyricmode {
  \set stanza = "1."
  Glo -- ry be to God the Fa -- ther,
  And to Christ the Son,
  Glo -- ry to the Hol -- y Spir -- it—
  Ev -- er One.
}

\score {
  <<
    \new ChordNames \with {
      \override ChordName.font-family = #'sans
      \override ChordName.font-size = #-1
    } \harmonies
    \new Staff { \new Voice = "melody" \melody }
    \new Lyrics \lyricsto "melody" \verseOne
  >>
  \layout {
    indent = 0
  }
}

% Verses start every 13.5 staff spaces; lines within a verse are 3 apart.
\markup \fill-line {
  \override #'(baseline-skip . 13.5) \column {
    \override #'(baseline-skip . 3) \line { \bold "2." \column {
      "As we view the vast creation, "
      "Planned with wondrous skill, "
      "So our hearts would move to worship, "
      "And be still. "
    } }
    \override #'(baseline-skip . 3) \line { \bold "3." \column {
      "But, our God, how great Thy yearning "
      "To have sons who love "
      "In the Son e’en now to praise Thee, "
      "Love to prove! "
    } }
    \override #'(baseline-skip . 3) \line { \bold "4." \column {
      "’Twas Thy thought in revelation, "
      "To present to men "
      "Secrets of Thine own affections, "
      "Theirs to win. "
    } }
    \override #'(baseline-skip . 3) \line { \bold "5." \column {
      "So in Christ, through His redemption "
      "(Vanquished evil powers!) "
      "Thou hast brought, in new creation, "
      "Worshippers! "
    } }
    \override #'(baseline-skip . 3) \line { \bold "6." \column {
      "Glory be to God the Father, "
      "And to Christ the Son, "
      "Glory to the Holy Spirit— "
      "Ever One. "
    } }
  }
}
