\version "2.24.3"

% E1 - "Glory be to God the Father" (piano lead sheet)
% Hand-transcribed from app/src/main/assets/pianoSvg/E1.svg

#(set-global-staff-size 16)

\paper {
  #(set-paper-size "letter")
  left-margin = 12.7\mm
  right-margin = 8.89\mm
  top-margin = 8.91\mm
  bottom-margin = 12.5\mm
  indent = 0
  #(define fonts
     (set-global-fonts
       #:roman "Century Schoolbook L"
       #:sans "sans-serif"
       #:factor (/ staff-height pt 20)))
  bookTitleMarkup = \markup \column {
    \fill-line {
      \null
      \override #'(baseline-skip . 3.5) \center-column {
        \fontsize #3 \bold \fromproperty #'header:title
        \bold \fromproperty #'header:subtitle
      }
      \raise #-8.1 \fontsize #8.5 \fromproperty #'header:opus
    }
    \vspace #0.68
  }
  system-system-spacing = #'((basic-distance . 12.87) (minimum-distance . 12.87) (padding . 0) (stretchability . 0))
  score-markup-spacing = #'((basic-distance . 15) (minimum-distance . 15) (padding . 0) (stretchability . 0))
  scoreTitleMarkup = ##f
  tagline = \markup \line { \hspace #1.84 \override #'(font-name . "Trebuchet MS") "www.hymnal.net" }
}

\header {
  title = "Glory be to God the Father"
  subtitle = "Blessing of the Trinity—His Plan"
  opus = "1"
}

global = {
  \key aes \major
  \time 4/4
}

melody = \relative c' {
  \global
  ees4 ees ees c' | bes aes f aes | ees c' bes bes | bes1 \break |
  c4 c c bes | aes aes aes f | ees2 f4( g) | aes1 \bar "|."
}

harmonies = \chordmode {
  aes1 | ees2 des | aes2 bes:7 | ees1 |
  c2 c:7 | f:m des | aes2/ees ees:7 | aes1
}

verseOne = \lyricmode {
  \set stanza = \markup \bold "1."
  Glo -- ry be to God the Fa -- ther,
  And to Christ the Son,
  Glo -- ry to the Hol -- y Spir -- it—
  Ev -- er One.
}

\score {
  <<
    \new ChordNames \with { \override ChordName.font-size = #-1 } \harmonies
    \new Staff { \melody }
    \addlyrics { \verseOne }
  >>
  \layout { }
}


\markup {
  \fill-line {
    \null
    \line { \column {
      \line { \bold "2." \column { "As we view the vast creation," "Planned with wondrous skill," "So our hearts would move to worship," "And be still." } }
      \vspace #0.88
      \line { \bold "3." \column { "But, our God, how great Thy yearning" "To have sons who love" "In the Son e’en now to praise Thee," "Love to prove!" } }
      \vspace #0.88
      \line { \bold "4." \column { "’Twas Thy thought in revelation," "To present to men" "Secrets of Thine own affections," "Theirs to win." } }
      \vspace #0.88
      \line { \bold "5." \column { "So in Christ, through His redemption" "(Vanquished evil powers!)" "Thou hast brought, in new creation," "Worshippers!" } }
      \vspace #0.88
      \line { \bold "6." \column { "Glory be to God the Father," "And to Christ the Son," "Glory to the Holy Spirit—" "Ever One." } }
    } \hspace #1.1 }
    \null
  }
}
