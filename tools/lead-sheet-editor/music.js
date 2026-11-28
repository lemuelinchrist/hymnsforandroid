// The lead sheet's logic, with no page in it: keys and chords, bars, MEI, the left hand made from the chords.
// The page (editor.js) and the tests (test_music.js, under Node) both use it: LeadSheet.toMei(sheet), .accompany(sheet) ...
//
// A sheet is a list of notes (README.md: leadsheet.json). Times are in sixteenths: `t` counts from the first note,
// `g` ("grid") counts from the start of the first bar, so that a bar line is always at a multiple of the bar length.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(); else root.LeadSheet = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var KEYS = ['C', 'G', 'D', 'A', 'E', 'B', 'F#', 'F', 'Bb', 'Eb', 'Ab', 'Db', 'Gb'];
  var PC = {C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11};
  var LETTERS = 'cdefgab', NATURAL = [0, 2, 4, 5, 7, 9, 11];
  var SHARP = [['c', 0], ['c', 1], ['d', 0], ['d', 1], ['e', 0], ['f', 0], ['f', 1], ['g', 0], ['g', 1], ['a', 0], ['a', 1], ['b', 0]];
  var FLAT = [['c', 0], ['d', -1], ['d', 0], ['e', -1], ['e', 0], ['f', 0], ['g', -1], ['g', 0], ['a', -1], ['a', 0], ['b', -1], ['b', 0]];
  var SHARP_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  var FLAT_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
  var FIFTHS = {0: 0, 7: 1, 2: 2, 9: 3, 4: 4, 11: 5, 6: 6, 1: -5, 8: -4, 3: -3, 10: -2, 5: -1};
  var DUR = {16: ['1', 0], 12: ['2', 1], 8: ['2', 0], 6: ['4', 1], 4: ['4', 0], 3: ['8', 1], 2: ['8', 0], 1: ['16', 0]};
  var DUR_BUTTONS = [[1, '16th'], [2, '8th'], [3, '8th.'], [4, 'Quarter'], [6, 'Quarter.'], [8, 'Half'], [12, 'Half.'], [16, 'Whole']];
  var ROOTS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
  var QUALITIES = [['', 'maj'], ['m', 'm'], ['7', '7'], ['maj7', 'maj7'], ['m7', 'm7'], ['6', '6'], ['9', '9'], ['add9', 'add9'],
    ['sus4', 'sus4'], ['sus2', 'sus2'], ['7sus4', '7sus4'], ['dim', 'dim'], ['dim7', 'dim7'], ['m7b5', 'm7b5'], ['aug', 'aug']];
  var ACCID = {'-2': 'ff', '-1': 'f', '0': 'n', '1': 's', '2': 'x'}, ACCID_GES = {'-2': 'ff', '-1': 'f', '1': 's', '2': 'ss'};

  function mod12(x) { return ((x % 12) + 12) % 12; }
  function accOf(a) { return a === '#' || a === '♯' ? 1 : a === 'b' || a === '♭' ? -1 : 0; }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function len(n) { return Math.max(1, n.d | 0); }
  function isRest(n) { return n.p == null || (Array.isArray(n.p) && !n.p.length); }
  function pitchesOf(n) { return isRest(n) ? [] : Array.isArray(n.p) ? n.p.slice().sort(function (a, b) { return a - b; }) : [n.p]; }
  function samePitches(a, b) { var x = pitchesOf(a), y = pitchesOf(b); return x.length > 0 && x.length === y.length && x.every(function (p, i) { return p === y[i]; }); }

  // ---- chords
  function splitChord(s) {
    var m = /^([A-G])([#b♯♭]?)(.*?)(?:\/([A-G])([#b♯♭]?))?$/.exec((s || '').trim());
    if (!m) return null;
    var normAcc = function (a) { return a === '♯' ? '#' : a === '♭' ? 'b' : a; };
    return {root: m[1], acc: normAcc(m[2]), quality: m[3].replace(/♭/g, 'b').replace(/♯/g, '#'), bass: m[4] || '', bassAcc: normAcc(m[5] || '')};
  }
  function symbolic(ch) {   // the app's sheets write ♯ and ♭ (the viewer moves the chords for the guitar by them)
    return (ch || '').replace(/^([A-G])([#b])/, function (m, l, a) { return l + (a === '#' ? '♯' : '♭'); }).replace(/\/([A-G])([#b])/, function (m, l, a) { return '/' + l + (a === '#' ? '♯' : '♭'); });
  }
  function composeChord(p) { return p.root ? p.root + p.acc + p.quality + (p.bass ? '/' + p.bass + p.bassAcc : '') : ''; }
  function trChord(ch, d, flat) {   // `flat` (true/false): spell by the new key; without it, as the chord was written
    return ch.replace(/(^|\/)([A-G])([#b♯♭]?)/g, function (m, pre, l, acc) {
      var pc = mod12(PC[l] + accOf(acc) + d);
      return pre + ((typeof flat === 'boolean' ? flat : (acc === 'b' || acc === '♭')) ? FLAT_NAMES : SHARP_NAMES)[pc];
    });
  }
  // What a chord symbol means: its root and bass, and its tones as [semitones above the root, letters above the root].
  function chordInfo(s) {
    var p = splitChord(s); if (!p || !p.root) return null;
    var q = (p.quality || '').trim().replace(/°/g, 'dim').replace(/^\+/, 'aug').replace(/^M(?=7|9|11|13)/, 'maj');   // as the app's sheets print them
    var r = mod12(PC[p.root] + accOf(p.acc));
    var minor = q.indexOf('m') === 0 && q.indexOf('maj') !== 0, dim = q.indexOf('dim') === 0;
    var third = q.indexOf('sus2') >= 0 ? [2, 1] : q.indexOf('sus') >= 0 ? [5, 3] : (minor || dim) ? [3, 2] : [4, 2];
    var fifth = (dim || q.indexOf('b5') >= 0) ? [6, 4] : (q.indexOf('aug') === 0 || q.indexOf('#5') >= 0 || q === '+') ? [8, 4] : [7, 4];
    var tones = [[0, 0], third, fifth], add = /add/.test(q), six = /6/.test(q);
    if (q.indexOf('dim7') >= 0) tones.push([9, 6]);
    else if (/maj(7|9|11|13)/.test(q)) tones.push([11, 6]);
    else if (/7/.test(q) || (/9|11|13/.test(q) && !add && !six)) tones.push([10, 6]);
    else if (six) tones.push([9, 5]);
    return {root: r, bass: p.bass ? mod12(PC[p.bass] + accOf(p.bassAcc)) : r, slash: !!p.bass, tones: tones, ninth: /9/.test(q),
      rootLetter: LETTERS.indexOf(p.root.toLowerCase()), bassLetter: p.bass ? LETTERS.indexOf(p.bass.toLowerCase()) : -1,
      bassAlter: accOf(p.bassAcc), seventh: tones.length > 3};
  }
  // the chord played as a soft block (a click on a chord button; the chords when there is no left hand)
  function chordPitches(s) {
    var c = chordInfo(s); if (!c) return [];
    var notes = [(c.bass >= 9 ? 36 : 48) + c.bass], ivs = c.tones.map(function (t) { return t[0]; });   // bass A2..G#3
    if (c.ninth) ivs.push(14);
    ivs.forEach(function (iv) { var m = 55 + mod12(c.root + iv - 7); if (notes.indexOf(m) < 0) notes.push(m); });   // G3..F#4, close
    return notes;
  }

  // ---- the key
  function tonicPc(sheet) { var k = sheet.key || 'C'; return mod12(PC[k[0]] + accOf(k[1])); }
  function fifths(sheet) {   // sharps (flats negative) of the key signature; a sheet that is not ours gives the number itself
    return typeof sheet.fifths === 'number' ? sheet.fifths : FIFTHS[(tonicPc(sheet) + (sheet.mode === 'minor' ? 3 : 0)) % 12];
  }
  function keyAlter(sheet) {   // the key signature: letter -> -1, 0, 1
    var f = fifths(sheet), a = {c: 0, d: 0, e: 0, f: 0, g: 0, a: 0, b: 0}, i;
    for (i = 0; i < f; i++) a['fcgdaeb'[i]] = 1;
    for (i = 0; i < -f; i++) a['beadgcf'[i]] = -1;
    return a;
  }
  function scalePcs(sheet) { var t = mod12(fifths(sheet) * 7); return [0, 2, 4, 5, 7, 9, 11].map(function (x) { return (t + x) % 12; }); }
  function spell(sheet, p, other) {   // by the key: sharps in sharp keys; `other` writes it the other way
    var flat = fifths(sheet) < 0; if (other) flat = !flat;
    var s = (flat ? FLAT : SHARP)[mod12(p)];
    return {pname: s[0], alter: s[1], oct: Math.floor((p - s[1]) / 12) - 1};
  }
  function spellInChord(sheet, p, c) {   // by the chord it belongs to: the third of D is F sharp also in a flat key
    if (!c) return spell(sheet, p);
    var pc = mod12(p), letter = -1;
    if (c.slash && pc === c.bass) letter = c.bassLetter;
    else for (var i = 0; i < c.tones.length; i++) if (mod12(c.root + c.tones[i][0]) === pc) { letter = (c.rootLetter + c.tones[i][1]) % 7; break; }
    if (letter < 0 && mod12(c.root + 2) === pc) letter = (c.rootLetter + 1) % 7;   // warm 9th / 2nd above the root
    if (letter < 0) return spell(sheet, p);
    var alter = mod12(pc - NATURAL[letter] + 6) - 6;
    if (alter < -2 || alter > 2) return spell(sheet, p);
    return {pname: LETTERS[letter], alter: alter, oct: Math.floor((p - alter) / 12) - 1};
  }
  function noteName(sheet, p, other) {
    if (p == null) return 'Rest';
    var s = spell(sheet, p, other); return s.pname.toUpperCase() + (s.alter > 0 ? '♯' : s.alter < 0 ? '♭' : '') + s.oct;
  }
  function keyChords(sheet) {
    var t = tonicPc(sheet), flat = fifths(sheet) < 0 || (sheet.mode === 'minor' && (t === 0 || t === 2 || t === 5 || t === 7));
    var pcs = flat ? FLAT_NAMES : SHARP_NAMES;
    var degs = sheet.mode === 'minor'
      ? [[0, 'm'], [3, ''], [5, 'm'], [7, 'm'], [7, ''], [7, '7'], [8, ''], [10, '']]
      : [[0, ''], [2, 'm'], [4, 'm'], [5, ''], [7, ''], [7, '7'], [9, 'm']];
    return degs.map(function (d) { return pcs[(t + d[0]) % 12] + d[1]; });
  }

  // ---- time and bars
  function barLen(sheet) { return Math.round(sheet.time[0] * 16 / sheet.time[1]); }
  function compound(sheet) { return sheet.time[1] === 8 && sheet.time[0] % 3 === 0; }
  function beatLen(sheet) { return compound(sheet) ? 6 : Math.max(1, Math.round(16 / sheet.time[1])); }
  // sixteenths between the start of the first bar and the first note (an upbeat starts late in its bar)
  function gridOff(sheet) { var bar = barLen(sheet); return sheet.pickup > 0 && sheet.pickup < bar ? bar - sheet.pickup : 0; }
  function onsets(events) { var t = 0; return events.map(function (n) { var s = t; t += len(n); return s; }); }
  function total(events) { var t = 0; events.forEach(function (n) { t += len(n); }); return t; }
  // ---- triplets: three notes with the first marked "tp" are played in the time of two. They keep whole-sixteenth lengths
  // here (so the bars, the chords and the left hand stay on the grid): the three of a span S (4, 8 or 16 sixteenths: an
  // eighth, quarter or half note triplet) are S/3 rounded; the MEI writes them as a real tuplet, and playList plays
  // them evenly.
  var TRIP = {4: 2, 8: 4, 16: 8};   // the span -> the written length of each note
  function tripSplit(S) { var a = Math.round(S / 3), b = Math.round(2 * S / 3); return [a, b - a, S - b]; }
  function fixTriplets(notes) {   // keeps "tp" only where this note and the next two make a triplet, and gives them their lengths
    for (var i = 0; i < notes.length; i++) {
      var n = notes[i];
      if (!n.tp) continue;
      var a = notes[i + 1], b = notes[i + 2], S = a && b ? len(n) + len(a) + len(b) : 0;
      if (!TRIP[S]) { delete n.tp; continue; }
      var sp = tripSplit(S); n.d = sp[0]; a.d = sp[1]; b.d = sp[2]; delete a.tp; delete b.tp; i += 2;
    }
    return notes;
  }
  function triplets(notes) {   // event index -> {k: 0..2, S, W (written length), at (index of the first)}
    var out = {};
    for (var i = 0; i + 2 < notes.length; i++) {
      if (!notes[i].tp) continue;
      var S = len(notes[i]) + len(notes[i + 1]) + len(notes[i + 2]);
      if (!TRIP[S]) continue;
      for (var k = 0; k < 3; k++) out[i + k] = {k: k, S: S, W: TRIP[S], at: i};
      i += 2;
    }
    return out;
  }
  function timing(notes) {   // [{t, d}] in sixteenths, a triplet's notes evenly
    var G = triplets(notes), t = 0, t0 = 0;
    return notes.map(function (n, i) {
      var g = G[i], d = g ? g.S / 3 : len(n), r = {t: t, d: d};
      if (g && g.k === 0) t0 = t;
      t = g ? (g.k === 2 ? t0 + g.S : t + d) : t + d;   // the end of a triplet is exactly on the grid
      return r;
    });
  }
  // A note with "tie" is not sounded again: it is the note before it held on (same pitch), e.g. under a new chord.
  function tied(events, i) { var n = events[i], b = events[i - 1]; return !!(n && b && n.tie && samePitches(n, b)); }

  // the written lengths of a note of `n` sixteenths that starts at `pos` in its bar
  function pieces(bar, pos, n) {
    var out = [], vals = [16, 12, 8, 6, 4, 3, 2, 1], four = bar === 16;
    while (n > 0) {
      for (var i = 0; i < vals.length; i++) {
        var v = vals[i], dotted = v % 3 === 0, g = dotted ? v / 3 : Math.max(1, v / 2);
        if (v > n || pos % g) continue;
        if (four && pos < 8 && pos + v > 8 && pos % 4) continue;   // do not hide the middle of a 4/4 bar
        out.push(v); pos += v; n -= v; break;
      }
    }
    return out;
  }

  // bars: [{len, items: [{id, idx, v, pos, rest}]}]. Ids: n<idx> for the melody, l<idx> for the left hand, with _<part>
  // for the later pieces of a note that is written as several tied ones; the rests that fill up are p… and q….
  function layout(sheet, events, prefix, minTotal) {
    var bar = barLen(sheet), bars = [], cur = null, pos = 0, pre = prefix || 'n', pad = pre === 'n' ? 'p' : 'q', placed = 0;
    function open() { cur = {len: bars.length === 0 && sheet.pickup > 0 && sheet.pickup < bar ? sheet.pickup : bar, items: []}; bars.push(cur); pos = 0; }
    open();
    function put(idx, rest, n) {
      var part = 0;
      while (n > 0) {
        if (pos >= cur.len) open();
        var off = bar - cur.len, take = Math.min(n, cur.len - pos), ps = pieces(bar, pos + off, take);
        for (var i = 0; i < ps.length; i++) {
          cur.items.push({id: (idx < 0 ? pad + bars.length + '_' + cur.items.length : pre + idx + (part ? '_' + part : '')), idx: idx, v: ps[i], pos: pos + off, rest: rest});
          pos += ps[i]; part++;
        }
        n -= take;
      }
    }
    var G = triplets(events), skip = 0;
    events.forEach(function (n, idx) {
      if (skip) { skip--; return; }
      var g = G[idx];
      if (g && g.k === 0) {   // a triplet is written whole: it needs the room in one bar, else it is written as plain notes
        if (pos >= cur.len) open();
        if (pos + g.S <= cur.len) {
          var off0 = bar - cur.len;
          for (var k = 0; k < 3; k++) {
            var e = events[idx + k];
            cur.items.push({id: pre + (idx + k), idx: idx + k, v: g.W, pos: pos + off0, rest: isRest(e), tp: k + 1});
            pos += len(e);
          }
          placed += g.S; skip = 2; return;
        }
      }
      put(idx, isRest(n), len(n)); placed += len(n);
    });
    if (minTotal > placed) put(-1, true, minTotal - placed);   // the other hand goes on longer
    if (pos < cur.len && cur.items.length) put(-1, true, cur.len - pos);   // fill the last bar with rests
    return bars;
  }

  // ---- the chords in time
  // [{i (note), ch, info, g, end}]: where each chord sounds for the left hand and pad. Each chord plays at its own time,
  // off the beat too (matching chordsOnBeat). Two chords closer than an eighth (MIN_APART): only one sounds, the one
  // on the beat (or, with neither or both on it, the first; at one place, the later one).
  var MIN_APART = 2;   // sixteenths
  function chordSpans(sheet) {
    var notes = sheet.notes, on = onsets(notes), off = gridOff(sheet), beat = beatLen(sheet), bar = barLen(sheet), out = [];
    notes.forEach(function (n, i) {
      if (!n.ch) return;
      var g = on[i] + off, onBeat = g % beat === 0;
      var last = out[out.length - 1];
      if (last && g - last.g < MIN_APART) {
        if (g > last.g && !(onBeat && !last.onBeat)) return;
        g = Math.max(g, last.g);
        out.pop();
      }
      out.push({i: i, ch: n.ch, info: chordInfo(n.ch), g: g, onBeat: onBeat});
    });
    var end = Math.ceil((total(notes) + off) / bar) * bar;
    out.forEach(function (s, k) { s.end = k + 1 < out.length ? out[k + 1].g : Math.max(end, s.g); });
    return out;
  }
  // how well each chord would sit under the melody from note i to the next chord (at most a bar): 0..1
  function chordFit(sheet, i, chords) {
    var notes = sheet.notes, w = {}, sum = 0, t = 0, bar = barLen(sheet);
    for (var k = i; k < notes.length && t < bar && (k === i || !notes[k].ch); k++) {
      if (!isRest(notes[k])) { var pc = mod12(notes[k].p); w[pc] = (w[pc] || 0) + len(notes[k]); sum += len(notes[k]); }
      t += len(notes[k]);
    }
    return chords.map(function (ch) {
      var c = chordInfo(ch), hit = 0; if (!c || !sum) return 0;
      c.tones.forEach(function (tn) { hit += w[mod12(c.root + tn[0])] || 0; });
      return hit / sum;
    });
  }

  // ---- the right hand: notes of the chord added under the melody
  // [pitches | null] for every note, or null when the sheet has none. sheet.rh is {"add": 1 | 2, "on": "chord" (where
  // a chord starts) | "beat" (notes on a beat, and long ones) | "long" (two beats or more) | "all"}; a note's "h" is
  // its added notes set by hand ([] for none). They are the nearest notes of the chord from a third below the melody
  // down, never below F3.
  function rightHand(sheet) {
    var rh = sheet.rh || null, notes = sheet.notes;
    if (!(rh && rh.add > 0) && !notes.some(function (n) { return Array.isArray(n.h); })) return null;
    var on = onsets(notes), off = gridOff(sheet), beat = beatLen(sheet), chord = null, any = false;
    var v2 = sheet.voice2 && sheet.voice2.length ? sheet.voice2 : null, v2on = v2 ? onsets(v2) : null;
    function hasV2At(t, d) {
      if (!v2) return false;
      for (var j = 0; j < v2.length; j++) if (!isRest(v2[j]) && v2on[j] < t + d && v2on[j] + len(v2[j]) > t) return true;
      return false;
    }
    var out = notes.map(function (n, i) {
      if (n.ch) chord = chordInfo(n.ch);
      if (isRest(n)) return null;
      var ps = null;
      if (Array.isArray(n.h)) ps = n.h.filter(function (p) { return p < n.p; });
      else if (rh && rh.add > 0 && chord) {
        var d = len(n), g = on[i] + off; for (var q = i + 1; tied(notes, q); q++) d += len(notes[q]);
        var want = rh.on === 'all' ? true : rh.on === 'chord' ? !!n.ch : rh.on === 'long' ? d >= 2 * beat : g % beat === 0 || d >= 2 * beat || d >= Math.min(beat, 4);
        if (want && !hasV2At(on[i], d)) ps = fillUnder(n.p, chord, rh.add);
      }
      if (!ps || !ps.length) return null;
      any = true; return ps.slice().sort(function (a, b) { return a - b; });
    });
    return any ? out : null;
  }
  // the notes added under one melody note: the nearest `add` notes of the chord from a third below it down
  function fillUnder(p, chord, add) {
    var pcs = chord.tones.map(function (t) { return mod12(chord.root + t[0]); }), ps = [];
    for (var q = p - 3; q > p - 12 && q >= 53 && ps.length < add; q--) if (pcs.indexOf(mod12(q)) >= 0) ps.push(q);
    return ps.sort(function (a, b) { return a - b; });
  }
  // Chords at any place in their bars, moved onto the beat as chordSpans does: chords [{g, ch}] in order, bars
  // [{g, len, beat}], sound [[from, to]] the melody's notes (tied ones as one) -> [{g, ch, info, end}]
  // The chords as they are played: each at its own time, off the beat too (a chord on the "and" changes there; 2026-11-27,
  // before that an off-beat chord was moved onto a beat and often lost to the chord on it). Two chords closer than an eighth:
  // only one sounds, the one on the beat (or, with neither or both on it, the first; at one place, the later one).
  function chordsOnBeat(chords, bars, sound, endG) {
    var out = [];
    chords.forEach(function (c) {
      var k = 0; while (k < bars.length - 1 && bars[k + 1].g <= c.g + 1e-6) k++;
      var g = Math.round(c.g), r = (g - bars[k].g) % bars[k].beat, onBeat = Math.abs(r) < 1e-6;
      var last = out[out.length - 1];
      if (last && g - last.g < MIN_APART - 1e-6) {
        if (g > last.g && !(onBeat && !last.onBeat)) return;
        g = Math.max(g, last.g);
        out.pop();
      }
      out.push({g: g, ch: c.ch, info: chordInfo(c.ch), onBeat: onBeat, src: c});
    });
    out.forEach(function (x, i) { x.end = i + 1 < out.length ? out[i + 1].g : Math.max(endG, x.g); });
    return out;
  }

  // ---- the left hand from the chords
  // A pattern is steps on a grid of `rate` sixteenths (0: one step, held): "1 5 8 5", "1 c c", "1+5 - - c | c".
  //   1 3 5 7 8 9 10 12  the chord's notes counted up from the bass (8 the octave, 9 warm ninth, 10 third above octave)
  //   c  C               the chord in the middle of the keyboard: c two notes (third + fifth or seventh), C all of them
  //   t                  the tenor: one note of the chord in the middle, moving as little as it can, and rather the
  //                      chord's third or fifth than a note the bass or the melody already has (a hymnal's left hand)
  //   w                  a smooth walking/connecting bass step leading into the next chord's bass
  //   D U K              a guitar strum (guitarShape): D down, every string; U up, the top four strings; K a chuck, the
  //                      top four strings struck and damped at once (a percussive beat)
  //   T A g b e          a guitar's strings picked: T the bass (thumb), A the string above it (the other bass), g b e the
  //                      G, B and high E strings
  //   a+b                together;  -  the step before goes on;  .  silence
  //   A | B              A in the bar where the chord starts, B in the bars it goes on in
  function parsePattern(str) {
    var parts = String(str || '').split('|').map(function (part) {
      return part.trim().split(/\s+/).filter(Boolean).map(function (st) {
        if (st === '-' || st === '_') return {hold: true};
        var toks = st.split('+').filter(function (x) { return /^(1|3|5|7|8|9|10|12|c|C|t|w|D|U|K|T|A|g|b|e)$/.test(x); });
        return toks.length ? {toks: toks} : {rest: true};
      });
    }).filter(function (p) { return p.length; });
    return parts.some(function (p) { return p.some(function (s) { return s.toks; }); }) ? parts : [];
  }
  function patternText(parts) {
    return parts.map(function (p) { return p.map(function (s) { return s.hold ? '-' : s.rest ? '.' : s.toks.join('+'); }).join(' '); }).join(' | ');
  }
  // Smooth walking/connecting bass pitch leading from chord `c` (at `bass`) into `next` chord's bass.
  function walkPitch(c, next, bass, lad, low) {
    var fallback = lad[2] || (bass + 7);
    if (!next || !next.info) return fallback;
    var nBase = low + mod12(next.info.bass - low), target = nBase;
    [nBase - 12, nBase, nBase + 12].forEach(function (cand) {
      if (cand >= Math.max(36, low - 4) && Math.abs(cand - bass) < Math.abs(target - bass)) target = cand;
    });
    if (mod12(target) === mod12(bass)) return fallback;
    var diff = target - bass, pcs = c.tones.map(function (t) { return mod12(c.root + t[0]); });
    var thirdIv = c.tones[1] ? c.tones[1][0] : 4;
    // 1. Classic stepwise passing tone on a 3rd/4th drop or rise (always diatonic: C->B->A, G->F#->E, Am->G->F, F->G->Am)
    if (diff === -3 && thirdIv === 4) return bass - 1;
    if (diff === 3 && thirdIv === 3) return bass + 2;
    if (diff === -4 && thirdIv === 3) return bass - 2;
    if (diff === 4 && thirdIv === 4) return bass + 2;
    // 2. A tone of the current chord that sits 1 or 2 semitones away from the next bass (e.g. C->E->F, G->B->C, D->F#->G)
    var best = null, bestScore = Infinity;
    for (var step = -2; step <= 2; step++) {
      if (!step) continue;
      var cand = target + step;
      if (cand < 36 || cand > 62 || mod12(cand) === mod12(bass)) continue;
      if (pcs.indexOf(mod12(cand)) < 0) continue;
      var between = (diff > 0 && cand > bass && cand < target) || (diff < 0 && cand < bass && cand > target);
      var score = (between ? 0 : 6) + Math.abs(step) + Math.abs(cand - bass) * 0.25;
      if (score < bestScore) { bestScore = score; best = cand; }
    }
    if (best != null) return best;
    return fallback;
  }
  // the pitches of every token for one chord; `low` is the lowest bass note allowed (MIDI, 40 = E2, the default: lower sounds muddy and distorts on a phone; the bass is the first
  // such note from there up). `opt`: {next, prevMid, smooth} for walking bass (`w`) and smooth voice-leading (`c`, `C`);
  // {prevTen, under, mel} for the tenor (`t`): its last pitch, the lowest right-hand note over it, the melody's pitch class.
  function voicing(c, low, parts, opt) {
    opt = opt || {};
    var pcs = c.tones.map(function (t) { return mod12(c.root + t[0]); }), nt = pcs.length;
    var used = {}; parts.forEach(function (p) { p.forEach(function (s) { (s.toks || []).forEach(function (t) { used[t] = true; }); }); });
    function ladder(bass) {   // the chord's notes upwards from the bass
      var out = [bass], p = bass;
      while (out.length < nt + 4) { p++; if (pcs.indexOf(mod12(p)) >= 0) out.push(p); }
      return out;
    }
    function at(lad, d) {
      if (d === 9) {
        var isDim = c.tones[2] && c.tones[2][0] === 6;
        if (isDim || c.slash) return lad[nt];   // avoid clashing 9th on diminished/half-diminished or slash chords (e.g. C/E)
        var oct = lad[nt], ninth = oct + mod12(c.root + 2 - oct);
        var p9 = ninth <= oct + 4 ? ninth : oct + 2;
        if (opt.melPcs && opt.melPcs.some(function (mp) { var df = mod12(mp - p9); return df === 1 || df === 11; })) return oct;
        return p9;
      }
      return lad[d < 8 ? {1: 0, 3: 1, 5: 2, 7: Math.min(3, nt)}[d] : nt + {8: 0, 10: 1, 12: 2}[d]];
    }
    low = low == null ? 40 : low;
    var bass = low + mod12(c.bass - low), degs = Object.keys(used).filter(function (t) { return /\d/.test(t); }).map(Number);
    var lad = ladder(bass), out = {};
    degs.forEach(function (d) { out[d] = [at(lad, d)]; });
    if (used.w) out.w = [walkPitch(c, opt.next, bass, lad, low)];
    function middle(ivs) {
      if (!opt.smooth) return ivs.map(function (iv) { return 52 + mod12(c.root + iv - 52); }).sort(function (a, b) { return a - b; });   // E3..D#4
      // Smooth voice-leading: pick the compact inversion closest to prevMid (default A3 = 57), staying in [50..65]
      var target = opt.prevMid != null ? opt.prevMid : 57;
      var uniq = [];
      ivs.forEach(function (iv) { var pc = mod12(c.root + iv); if (uniq.indexOf(pc) < 0) uniq.push(pc); });
      var best = null, bestCost = Infinity;
      for (var lo = 48; lo <= 58; lo++) {
        var cand = uniq.map(function (pc) { return lo + mod12(pc - lo); }).sort(function (a, b) { return a - b; });
        if (cand[0] < 48 || cand[cand.length - 1] > 66) continue;
        var avg = cand.reduce(function (s, x) { return s + x; }, 0) / cand.length;
        var cost = Math.abs(avg - target) + (cand[cand.length - 1] - cand[0]) * 0.15;
        if (cost < bestCost) { bestCost = cost; best = cand; }
      }
      return best || ivs.map(function (iv) { return 52 + mod12(c.root + iv - 52); }).sort(function (a, b) { return a - b; });
    }
    if (used.c) out.c = middle([c.tones[1][0], c.tones[c.seventh ? 3 : 2][0]]);
    if (used.C) out.C = middle(c.tones.map(function (t) { return t[0]; }));
    if (used.t) out.t = [tenor()];
    if (used.D || used.U || used.K || used.T || used.A || used.g || used.b || used.e) {
      var cp = opt.capo | 0, gs = guitarShape(c, opt.capo), on = gs.filter(function (p) { return p != null; });
      var alt = on[1] != null ? on[1] : on[0];
      // 4-string open shapes (D, Dm): drop alternating thumb A to the open 5th string when it is a chord tone, else stay on root so A never duplicates g
      if (on.length <= 4 && gs[0] == null && gs[1] == null) alt = pcs.indexOf(mod12(45 + cp)) >= 0 ? 45 + cp : on[0];
      out.D = on; out.U = out.K = on.slice(-4); out.T = [on[0]]; out.A = [alt];
      ['g', 'b', 'e'].forEach(function (k, i) { var p = gs[3 + i]; out[k] = [p != null ? p : on[on.length - 1]]; });
    }
    return out;
    function tenor() {
      var prev = opt.prevTen != null ? opt.prevTen : 55, top = Math.min(64, (opt.under != null ? opt.under : 99) - 1), best = null, bestCost = Infinity;
      for (var q = Math.max(48, bass + 3); q <= top; q++) {
        var pc = mod12(q); if (pcs.indexOf(pc) < 0) continue;
        var cost = Math.abs(q - prev) + (pc === mod12(bass) ? 5 : 0) + (pc === opt.mel ? 3 : 0);
        if (cost < bestCost) { bestCost = cost; best = q; }
      }
      return best != null ? best : lad[1] < 48 ? lad[1] + 12 : lad[1];
    }
  }
  // A chord as a guitar plays it in the first frets: the bass (the chord's, or the slash note) on the lowest string that
  // has it within four frets, the strings under it silent, every other string on its lowest fret that is a note of the
  // chord. This gives the open shapes guitarists use (C x32010, G 320003, D xx0232, Am x02210). -> six pitches or null.
  // With a capo (the guitar sheet's: a number, 0 for none) the shape is the one of the chord the guitar sheet shows,
  // a capo's frets lower, played above the capo, and the bass is the chord's root (the guitar sheet has no slash basses).
  var STRINGS = [40, 45, 50, 55, 59, 64];
  function guitarShape(c, capo) {
    var cp = capo | 0, root = c.root - cp, bass = (capo != null ? c.root : c.bass) - cp;
    var pcs = c.tones.map(function (t) { return mod12(root + t[0]); }), out = [null, null, null, null, null, null], low = -1;
    for (var k = 0; k < 4 && low < 0; k++) { var f0 = mod12(bass - STRINGS[k]); if (f0 <= 4) { out[k] = STRINGS[k] + f0; low = k; } }
    if (low < 0) { low = 0; out[0] = 40 + mod12(bass - 40); }   // nowhere in the first frets: the low E string, higher up
    for (var s = low + 1; s < 6; s++) for (var f = 0; f <= 4; f++) if (pcs.indexOf(mod12(STRINGS[s] + f)) >= 0) { out[s] = STRINGS[s] + f; break; }
    return out.map(function (p) { return p == null ? null : p + cp; });
  }
  function meter(sheet) { var bar = barLen(sheet), beat = beatLen(sheet); return {bar: bar, beat: beat, beats: Math.round(bar / beat), compound: compound(sheet)}; }
  // [id, name, hint, {steps: pat}, low, extra]
  var ARP = [
    ['flowing', 'Flowing', 'full-bar arch with warm 9th', {
      2: '1 5', 3: '1 5 9', 4: '1 5 8 9', 6: '1 5 8 9 10 8 | 1 5 8 10 8 5',
      8: '1 5 8 9 10 - 8 5 | 1 5 8 - 9 8 5 -'}, 40, {bassRing: true, shortPat: '1 5 8 9'}],
    ['ballad', 'Ballad', 'breathing syncopated arpeggio', {
      2: '1 5', 3: '1 5 8', 4: '1 5 8 -', 6: '1 5 8 - 10 8 | 1 5 8 - 9 8',
      8: '1 5 8 - 10 8 5 - | 1 5 8 - 9 8 5 -'}, 40, {bassRing: true, shortPat: '1 5 8 -'}],
    ['open', 'Open', 'root, fifth, octave', {
      2: '1 5', 3: '1 5 8', 4: '1 5 8 5', 6: '1 5 8 5 8 5',
      8: '1 5 8 5 10 5 8 5 | 1 5 8 5 9 5 8 5'}, 40, {bassRing: true, shortPat: '1 5 8 5'}],
    ['wide', 'Wide', 'up to the tenth', {
      2: '1 5', 3: '1 5 10', 4: '1 5 10 5', 6: '1 5 8 10 8 5',
      8: '1 5 8 10 12 10 8 5'}, 40, {bassRing: true, shortPat: '1 5 10 5'}],
    ['broken', 'Broken chord', 'root, third, fifth', {
      2: '1 5', 3: '1 3 5', 4: '1 3 5 3', 6: '1 3 5 3 5 3',
      8: '1 3 5 8 5 3 5 3'}, 43, {bassRing: true, shortPat: '1 3 5 3'}],
    ['alberti', 'Alberti', 'low, high, middle, high', {
      2: '1 5', 3: '1 5 3', 4: '1 5 3 5', 6: '1 5 3 5 3 5'}, 43, {bassRing: true}],
    ['rise', 'Rise and hold', 'up, then held', {
      2: '1 5', 3: '1 5 8', 4: '1 5 8 -', 6: '1 5 8 - - -',
      8: '1 5 8 10 - - - -'}, 36, {bassRing: true}]];
  function arpPattern(shape, steps) {
    var t = shape[3];
    if (t[steps]) return t[steps];
    if (steps % 3 === 0) return steps % 6 === 0 ? t[6] : t[3];
    return steps === 2 ? t[2] : steps % 8 === 0 && t[8] ? t[8] : t[4];
  }
  // The styles the page offers, for this sheet's time signature. Each choice is {id, name, pat, rate, low, ...}.
  function styles(sheet) {
    var m = meter(sheet), beat = m.beat, n = m.beats, half = n % 2 === 0 && n > 2 ? m.bar / 2 : 0;
    function strikes(pat, low, id, name, hint, extra) {
      var rh = [[0, 'held', 'Held']]; if (half) rh.push([half, 'half', 'Twice a bar']); rh.push([beat, 'beat', 'Every beat']);
      return {id: id, name: name, hint: hint, rhythms: rh.map(function (r) { return Object.assign({id: r[1], name: r[2], pat: pat, rate: r[0], low: low}, extra || {}); })};
    }
    var bc;
    if (m.compound) bc = [['bcc', 'Bass, chord, chord', '1 c c', 2], ['long', 'Bass and chord', '1 - - c - -', 2], ['alt', 'Root and fifth', '1 c c 5 c c', 2]];
    else if (n === 3) bc = [['waltz', 'Waltz', '1 c c', beat], ['slow', 'Bass, then chord', '1 - c', beat], ['pulse', 'Waltz in eighths', '1 - c - c -', beat / 2]];
    else if (n === 2) bc = [['oom', 'Bass, chord', '1 c', beat], ['pulse', 'In eighths', '1 c 5 c', beat / 2]];
    else bc = [['alt', 'Root and fifth', '1 c 5 c', beat], ['bcc', 'Bass and chords', '1 c c c', beat], ['slow', 'Slow', '1 - c -', beat], ['pulse', 'In eighths', '1 - c - 5 - c -', beat / 2]];
    var rates = m.compound ? [[2, '8', 'Eighths'], [1, '16', 'Sixteenths']] : [[beat, '4', beat === 4 ? 'Quarters' : 'On the beat'], [beat / 2, '8', beat === 4 ? 'Eighths' : 'Twice a beat'], [beat / 4, '16', beat === 4 ? 'Sixteenths' : 'Four a beat']];
    rates = rates.filter(function (r) { return r[0] >= 1 && r[0] === Math.round(r[0]); });
    var eighth = m.compound ? 2 : Math.max(1, Math.round(beat / 2));
    // Lively (`dynamic/pulse`): phrase-shuffled upbeat piano weaving five joyful moods across 2–4 bar phrases
    // (3-3-2 acoustic pop pulse, classic hymn bounce, driving quarter chords, gospel walk, and sparkling bouncy arpeggios)
    // with crisp detached mid-chord bounce articulation (`bouncy: true`) and walking bass pickups (`w`).
    var pulseMoods = [
      {id: 'pop332', roll: 0.006, halfTimeMs: 0.175, vary: m.compound
        ? {short: ['1 - c'], calm: ['1 - c 5 - c', '1+5 - c 5 - c'], cont: ['1 - c 5 - w', '1 - c c 5 -'], fill: ['1 - c 5 c w', '1 - c 5 - w'], late: ['5 - c', 'c - w']}
        : n === 3 ? {short: ['1 - c -'], calm: ['1 - c - 5 c', '1 - - c 5 -'], cont: ['1 - c - 5 w', '1 - c 5 c -'], fill: ['1 - c - 5 w', '1 - c 5 c w'], late: ['c - 5 -', 'c - w -']}
        : n === 2 ? {short: ['1 c'], calm: ['1 - c 5', '1 c 5 c'], cont: ['1 - c w', '1 c 5 w'], fill: ['1 - c w'], late: ['c 5']}
        : {short: ['1 - c -', '1 - c 5'], calm: ['1 - - c - - 5 -', '1+5 - - c - - c -', '1 - - c - 5 c -'], cont: ['1 - - c - - w -', '1 - - c - 5 w -'], fill: ['1 - - c - 5 c -', '1 - - c - 5 w -'], late: ['c - 5 -', 'c - w -']}},
      {id: 'bounce', roll: 0.006, halfTimeMs: 0.175, vary: m.compound
        ? {short: ['1 c c'], calm: ['1 - c 5 - c', '1 c c 5 c c'], cont: ['1 - c 5 - w', '1 c c 5 - w'], fill: ['1 - c 5 c c', '1 - c 5 - w'], late: ['5 c c', '5 - w']}
        : n === 3 ? {short: ['1 - c -'], calm: ['1 - c - c -', '1 - c - 5 c'], cont: ['1 - c - c w', '1 - c - 5 w'], fill: ['1 - c - c -', '1 - c - 5 w'], late: ['c - c -', 'c - w -']}
        : n === 2 ? {short: ['1 c'], calm: ['1 c 5 c', '1 - c 5'], cont: ['1 c 5 w', '1 c - w'], fill: ['1 c 5 w'], late: ['5 c']}
        : {short: ['1 - c -', '1 c 5 c'], calm: ['1 - c - 5 - c -', '1 - c 5 - c - 5', '1 - c - 5 - c 5'], cont: ['1 - c - 5 - w -', '1 - c 5 - c w -'], fill: ['1 - c - 5 - c 5', '1 - c - 5 - w -'], late: ['5 - c -', '5 - w -']}},
      {id: 'drive', roll: 0.006, halfTimeMs: 0.175, vary: m.compound
        ? {short: ['1+c - c'], calm: ['1+c - c 5+c - c', '1+c c c 5+c - c'], cont: ['1+c - c 5+c - w', '1+c - c c - w'], fill: ['1+c - c 5+c c c', '1+c - c 5+c - w'], late: ['5+c - c', '5+c - w']}
        : n === 3 ? {short: ['1+c - c -'], calm: ['1+c - c - c -', '1+c - c - 5+c -'], cont: ['1+c - c - c w', '1+c - c - 5 w'], fill: ['1+c - c - 5+c -', '1+c - c - 5 w'], late: ['c - c -', '5+c - w -']}
        : n === 2 ? {short: ['1+c c'], calm: ['1+c c 5+c c', '1+c - 5+c c'], cont: ['1+c c 5+c w'], fill: ['1+c c 5+c w'], late: ['5+c c']}
        : {short: ['1+c - c -', '1+c - 5+c -'], calm: ['1+c - c - 5+c - c -', '1+c - c - 1+c - c 5', '1+c - c 5 1+c - c -'], cont: ['1+c - c - 5+c - w -', '1+c - c - 5+c - c w'], fill: ['1+c - c - 5+c - c 5', '1+c - c - 5+c - w -'], late: ['5+c - c -', '5+c - w -']}},
      {id: 'gospel', roll: 0.006, halfTimeMs: 0.175, vary: m.compound
        ? {short: ['1 - c'], calm: ['1 - c 5 - w', '1 c 5 c - w'], cont: ['1 - c 3 - w', '1 - c 5 c w'], fill: ['1 c 5 c - w', '1 - c 5 - w'], late: ['5 - w', 'c - w']}
        : n === 3 ? {short: ['1 - c -'], calm: ['1 - c - w -', '1 - c 5 - w'], cont: ['1 - c - 3 w', '1 - c 5 c w'], fill: ['1 - c 5 - w', '1 - c - w -'], late: ['c - w -', '5 - w -']}
        : n === 2 ? {short: ['1 w'], calm: ['1 c 5 w', '1 - c w'], cont: ['1 c 3 w'], fill: ['1 c 5 w'], late: ['c w']}
        : {short: ['1 - c -', '1 - w -'], calm: ['1 - c - 3 - c w', '1 - c 5 - c w -', '1 - - c 5 - w -'], cont: ['1 - c - 5 - w -', '1 - c 3 - c w -'], fill: ['1 - c 5 - c w -', '1 - c - 3 - c w'], late: ['5 - w -', 'c - w -']}},
      {id: 'sparkle', roll: 0.006, halfTimeMs: 0.175, vary: m.compound
        ? {short: ['1 5 c'], calm: ['1 5 c 8 c 5', '1 5 10 8 5 c'], cont: ['1 5 c 8 c w', '1 5 c 5 c w'], fill: ['1 5 10 8 c 5', '1 5 c 8 c w'], late: ['8 c 5', 'c 5 w']}
        : n === 3 ? {short: ['1 5 c -'], calm: ['1 5 c 8 c 5', '1 - 5 c 8 c'], cont: ['1 5 c 8 c w', '1 - 5 c 5 w'], fill: ['1 5 10 8 c 5', '1 5 c 8 c w'], late: ['8 c 5 -', 'c 5 w -']}
        : n === 2 ? {short: ['1 5'], calm: ['1 5 c 8', '1 5 c 5'], cont: ['1 5 c w'], fill: ['1 5 10 8'], late: ['c 8']}
        : {short: ['1 5 c -', '1 5 8 -'], calm: ['1 5 c - 5 c 8 -', '1 - 5 c - c 5 -', '1 5 10 - 5 c 8 -'], cont: ['1 5 c - 5 c w -', '1 - 5 c - c w -'], fill: ['1 5 10 - 5 c 8 -', '1 5 c - 5 c w -'], late: ['5 c 8 -', '5 c w -']}}];
    var pulseShort = m.compound ? '1 - c' : n === 2 ? '1 c' : '1 - c -';
    var adaptCalm = m.compound ? '1 - 5 c - 5' : n === 3 ? '1 - 5 - c -' : n === 2 ? '1 - c -' : '1 - - 5 - - c -';
    var adaptFill = m.compound ? '1 - 5 9 - 10' : n === 3 ? '1 - 5 - 9 -' : n === 2 ? '1 - 10 -' : '1 - 5 - 9 - 10 -';
    var adaptLate = m.compound ? 'c - 5' : n === 2 ? 'c -' : 'c - 9 -';
    // Adaptive (Flowing) weaves six calm pianist moods across the song by musical phrase (2–4 bars, transitioning
    // cleanly right after a cadence pause bar or every 4 bars, deterministic from songSeed + seed so Shuffle Style
    // creates fresh coherent takes). Pauses stay unhurried (warm 9th/10th shimmer, quiet walking pickup `w`, or gentle
    // settling instead of frantic eighth-note runs), with smart per-chord sustain pedal and feathered upper notes.
    var adaptMoods = [
      {id: 'sway', roll: 0.018, halfTimeMs: 0.21, vary: m.compound
        ? {short: ['1 - -'], calm: ['1 - 5 c - 5', '1 - 5 10 - 5'], cont: ['1 - c 5 - c', '1 - 5 9 - 5'], fill: ['1 - 5 9 - 10', '1 - 5 10 - 8', '1 - c 9 - -'], late: ['c - 5', '9 - 8']}
        : n === 3 ? {short: ['1 - c -', '1 - 5 -'], calm: ['1 - 5 - c -', '1 - c - 5 -', '1 - 5 - 10 -'], cont: ['1 - c - 9 -', '1 - 5 - c -'], fill: ['1 - 5 - 9 -', '1 - 5 - 10 -', '1 - c - 9 -'], late: ['c - 9 -', '5 - 10 -']}
        : n === 2 ? {short: ['1 -'], calm: ['1 - c -', '1 - 5 -'], cont: ['1 - c -', '1 - 5 -'], fill: ['1 - 10 -', '1 - 9 -'], late: ['c -', '9 -']}
        : {short: ['1 - c -', '1 - 10 -', '1 - 5 -'], calm: ['1 - - 5 - - c -', '1 - - 5 - - 10 -', '1 - 5 - c - - -'], cont: ['1 - - c - - 5 -', '1 - - 5 - - 9 -'], fill: ['1 - 5 - 9 - 10 -', '1 - - 5 - - 9 -', '1 - 5 - c - 9 -'], late: ['c - 9 -', '9 - 10 -', '5 - c -']}},
      {id: 'serene', roll: 0.016, halfTimeMs: 0.20, vary: m.compound
        ? {short: ['1 - -'], calm: ['1 5 8 10 - 8', '1 5 8 c - 8'], cont: ['1 5 8 9 - 8', '1 5 c 8 - 5'], fill: ['1 5 8 9 - 10', '1 5 8 10 - -'], late: ['9 - 10', 'c - 8']}
        : n === 3 ? {short: ['1 - 10 -', '1 - c -'], calm: ['1 - 5 - 10 -', '1 - 5 - c -', '1 - 5 - 9 -'], cont: ['1 - 5 - 9 -', '1 - c - 8 -'], fill: ['1 - 5 - 9 -', '1 - 5 - 10 -'], late: ['9 - 10 -', 'c - 8 -']}
        : n === 2 ? {short: ['1 -'], calm: ['1 - 10 -', '1 - c -'], cont: ['1 - 9 -', '1 - c -'], fill: ['1 - 9 -', '1 - 10 -'], late: ['9 -', 'c -']}
        : {short: ['1 - 10 -', '1 - c -', '1 - 5 -'], calm: ['1 - 5 - 10 - 8 -', '1 - 5 - c - 8 -', '1 - 5 - 9 - 8 -'], cont: ['1 - 5 - 9 - 10 -', '1 - c - 9 - 8 -'], fill: ['1 - 5 - 9 - 10 -', '1 - 5 - 10 - 9 -', '1 - 5 - c - 10 -'], late: ['9 - 10 -', 'c - 8 -', '8 - 9 -']}},
      {id: 'velvet', roll: 0.024, halfTimeMs: 0.21, vary: m.compound
        ? {short: ['1 - -'], calm: ['1 - 5 c - -', '1 - 5 10 - -'], cont: ['1 - - c - 5', '1 - 5 9 - -'], fill: ['1+5 - - 9 - -', '1 - 5 10 - w'], late: ['c - -', '9 - -']}
        : n === 3 ? {short: ['1 - c -', '1 - 5 -'], calm: ['1 - 5 - c -', '1 - - c - -'], cont: ['1 - c - 5 -', '1 - 5 - 9 -'], fill: ['1+5 - 9 - - -', '1 - 5 - w -', '1 - c - 9 -'], late: ['c - - -', '9 - - -']}
        : n === 2 ? {short: ['1 -'], calm: ['1 - c -', '1 - 5 -'], cont: ['1 - c -'], fill: ['1+5 - 9 -', '1 - w -'], late: ['c -']}
        : {short: ['1 - c -', '1 - 5 -'], calm: ['1 - - 5 - - c -', '1 - 5 - c - - -', '1 - - - 5 - c -'], cont: ['1 - - - c - 5 -', '1 - - 5 - - 9 -'], fill: ['1+5 - - - 9 - - -', '1 - 5 - 10 - - -', '1 - - - c - w -'], late: ['c - - -', '9 - - -', '5 - w -']}},
      {id: 'walk', roll: 0.018, halfTimeMs: 0.21, vary: m.compound
        ? {short: ['1 - -'], calm: ['1 - 5 c - 5', '1 - 5 10 - 5'], cont: ['1 - c 5 - w', '1 - 5 c - w'], fill: ['1 - 5 c - w', '1 - 5 9 - w', '1 - 5 10 - w'], late: ['c - w', '9 - w']}
        : n === 3 ? {short: ['1 - w -', '1 - c -'], calm: ['1 - 5 - c -', '1 - c - 5 -'], cont: ['1 - c - w -', '1 - 5 - w -'], fill: ['1 - 5 - w -', '1 - c - w -', '1 - 10 - w -'], late: ['c - w -', '5 - w -']}
        : n === 2 ? {short: ['1 -'], calm: ['1 - c -', '1 - 5 -'], cont: ['1 - w -'], fill: ['1 - w -', '1 - c -'], late: ['w -']}
        : {short: ['1 - w -', '1 - c -'], calm: ['1 - 5 - c - - -', '1 - - 5 - - c -', '1 - 5 - 10 - - -'], cont: ['1 - c - 5 - w -', '1 - - - c - w -'], fill: ['1 - 5 - c - w -', '1 - 5 - 10 - w -', '1 - c - 9 - w -'], late: ['c - w -', '9 - w -', '5 - w -']}},
      {id: 'rolled', roll: 0.030, halfTimeMs: 0.21, vary: m.compound
        ? {short: ['1 - -'], calm: ['1+5+10 - - c - -', '1+5 - - c - 5'], cont: ['1+5 - - c - -', '1 - - c - -'], fill: ['1+5+10 - - 9 - -', '1+5+9 - - c - -'], late: ['c - -', '9 - -']}
        : n === 3 ? {short: ['1+5+10 - - -', '1+5 - - -'], calm: ['1+5+10 - c - - -', '1+5 - c - 5 -'], cont: ['1+5 - c - - -', '1 - c - 5 -'], fill: ['1+5+10 - 9 - - -', '1+5+9 - c - - -'], late: ['c - - -', '9 - - -']}
        : n === 2 ? {short: ['1+5 -'], calm: ['1+5+10 - - -', '1+5 - c -'], cont: ['1+5 - - -'], fill: ['1+5+10 - - -', '1+5+9 - - -'], late: ['c -']}
        : {short: ['1+5+10 - - -', '1+5 - - -'], calm: ['1+5+10 - - - c - - -', '1+5 - - - c - 5 -', '1+5+8 - - - c - - -'], cont: ['1+5 - - - c - - -', '1 - - - c - 5 -'], fill: ['1+5+10 - - - 9 - - -', '1+5+9 - - - c - - -', '1+5+10 - - - - - w -'], late: ['c - - -', '9 - - -']}},
      {id: 'ballad', roll: 0.018, halfTimeMs: 0.27, vary: m.compound
        ? {short: ['1 - -'], calm: ['1 5 8 10 - 8', '1 5 9 8 - 5'], cont: ['1 5 8 c - 8', '1 5 10 8 - 5'], fill: ['1 - 5 9 - -', '1 - 5 10 - -'], late: ['9 - -', 'c - -']}
        : n === 3 ? {short: ['1 - 5 8', '1 - c -'], calm: ['1 - 5 8 10 -', '1 - 5 8 c -'], cont: ['1 - 5 9 8 -', '1 - 5 c 8 -'], fill: ['1 - 5 - 10 -', '1 - 5 - 9 -'], late: ['9 - - -', 'c - - -']}
        : n === 2 ? {short: ['1 -'], calm: ['1 - 5 8', '1 - c -'], cont: ['1 - 5 8'], fill: ['1 - 10 -', '1 - 9 -'], late: ['9 -']}
        : {short: ['1 - 5 8', '1 - c -'], calm: ['1 - 5 8 10 - 8 5', '1 - 5 9 10 - 8 -', '1 - 5 8 c - 8 -'], cont: ['1 - 5 8 9 - 8 -', '1 - 5 c - - 8 5'], fill: ['1 - 5 - 9 - 10 -', '1 - 5 - 10 - - -', '1 - 5 - c - 9 -'], late: ['9 - - -', 'c - 8 -', '10 - - -']}}];
    var adaptVary = adaptMoods[0].vary;
    var walkQ = m.compound ? '1 5 w' : n === 3 ? '1 5 w' : n === 2 ? '1 w' : '1 5 8 w';
    var walkE = m.compound ? '1 - 5 8 - w' : n === 3 ? '1 - 5 - w -' : n === 2 ? '1 5 8 w' : '1 - 5 - 8 - w -';
    var walkRhythms = m.compound
      ? [{id: '8', name: 'Eighths', pat: walkE, rate: 2, low: 40, bassRing: true, shortPat: '1 - w'}]
      : [{id: '4', name: beat === 4 ? 'Quarters' : 'On the beat', pat: walkQ, rate: beat, low: 40, shortPat: '1 w'},
         {id: '8', name: beat === 4 ? 'Eighths' : 'Twice a beat', pat: walkE, rate: eighth, low: 40, bassRing: true, shortPat: '1 - w -'}];
    var rolledRhythms = [{id: 'held', name: 'Held', pat: '1+5+8+10', rate: 0, low: 40, roll: 0.032}];
    if (half) rolledRhythms.push({id: 'half', name: 'Twice a bar', pat: '1+5+8+10', rate: half, low: 40, roll: 0.028});
    // Unified phrase-shuffled guitar picking (`guitar/pick`): weaves eight acoustic fingerstyle moods across
    // 2–4 bar musical phrases (pinch, Travis folk, calm quarters, ballad arch, rise & shimmer, gentle harp,
    // breathing plucked chords, and 3-3-2 / alternating plucked chords), deterministic per songSeed + seed.
    var guitarPickMoods = [
      {id: 'pinch', vary: m.compound
        ? {short: ['T+b - g'], calm: ['T+b - g A - b', 'T+e - b g - b'], cont: ['T+e - b g - b'], fill: ['T+b g b e - -', 'T+e - b g - -'], late: ['b - g', 'e - -']}
        : n === 3 ? {short: ['T+b - g -'], calm: ['T+b - g - e -', 'T+e - g - b -'], cont: ['T - g b g -', 'T+b - g - b -'], fill: ['T+b - g b e -', 'T+e - g - - -'], late: ['g - e -', 'b - - -']}
        : n === 2 ? {short: ['T+b -'], calm: ['T+b - g b', 'T+e - g -'], cont: ['T+b - g -'], fill: ['T+b - e -'], late: ['b -']}
        : {short: ['T+b - g -', 'T+e - g -'], calm: ['T+b - g - A - e b', 'T+e - g b A - b -'], cont: ['T+e - g b A - b -', 'T+b - g - A - g -'], fill: ['T+b - g b e - b -', 'T+e - b g b - - -'], late: ['g - b -', 'b - e -']}},
      {id: 'travis', vary: m.compound
        ? {short: ['T - g'], calm: ['T - g b - g', 'A - b e - b'], cont: ['A - b e - b', 'T - b g - b'], fill: ['T g b e - b', 'T - g b - e'], late: ['b - e', 'g - b']}
        : n === 3 ? {short: ['T - g b'], calm: ['T - g b e -', 'A - g b g -'], cont: ['A - g b e -', 'T - b g b -'], fill: ['T - g b e -', 'T - b e - -'], late: ['b e -', 'g - b -']}
        : n === 2 ? {short: ['T -'], calm: ['T - b g', 'A - e b'], cont: ['A - b g'], fill: ['T - e b'], late: ['b -']}
        : {short: ['T - b g', 'T - g b'], calm: ['T - b g A - e g', 'T - g b A - e b'], cont: ['T - g b A - b g', 'T - b g A - g b'], fill: ['T - g b e - b -', 'T - b g e - - -'], late: ['g b e -', 'b - g -']}},
      {id: 'quarters', vary: m.compound
        ? {short: ['T - -'], calm: ['T - - b - g', 'T - - g - b'], cont: ['A - - b - g', 'T - - e - b'], fill: ['T - g b - e', 'T - - b - e'], late: ['b - -', 'e - -']}
        : n === 3 ? {short: ['T - g -'], calm: ['T - g - b -', 'T - b - g -'], cont: ['A - g - b -', 'T - g - e -'], fill: ['T - g - e -', 'T - b - e -'], late: ['g - b -']}
        : n === 2 ? {short: ['T -'], calm: ['T - g -', 'T - b -'], cont: ['A - b -'], fill: ['T - e -'], late: ['b -']}
        : {short: ['T - g -', 'T - b -'], calm: ['T - g - A - b -', 'T - b - A - g -'], cont: ['T - g - A - e -', 'T - b - A - e -'], fill: ['T - g - b - e -', 'T - b - e - - -'], late: ['g - b -', 'b - e -']}},
      {id: 'arch', vary: m.compound
        ? {short: ['T g b'], calm: ['T g b e - -', 'T g b - e b'], cont: ['T g b - e b', 'T g b e - b'], fill: ['T g b e - -', 'T - g b e -'], late: ['b e -', 'e - -']}
        : n === 3 ? {short: ['T g b -'], calm: ['T g b e - -', 'T g b - e -'], cont: ['T g b - e -', 'T - g b e -'], fill: ['T g b e - -', 'T - g b - -'], late: ['b e -', 'g - e -']}
        : n === 2 ? {short: ['T g'], calm: ['T g b -', 'T g e -'], cont: ['T g b -'], fill: ['T g e -'], late: ['b -']}
        : {short: ['T g b -', 'T - b -'], calm: ['T g b e - - b g', 'T g b - e - b -'], cont: ['T g b - e - b -', 'T - g b e - b -'], fill: ['T g b e - - - -', 'T - g b e - - -'], late: ['g b e -', 'b - e -']}},
      {id: 'shimmer', vary: m.compound
        ? {short: ['T g b'], calm: ['T g b e - -', 'T - g e - -'], cont: ['T g b - - -', 'T - b e - -'], fill: ['T g b e - -'], late: ['e - -']}
        : n === 3 ? {short: ['T g b -'], calm: ['T g b e - -', 'T - g e - -'], cont: ['T g b - - -', 'T - b e - -'], fill: ['T g b e - -', 'T - g - e -'], late: ['e - - -', 'b - - -']}
        : n === 2 ? {short: ['T -'], calm: ['T g b -', 'T - e -'], cont: ['T g b -'], fill: ['T g e -'], late: ['e -']}
        : {short: ['T g b -', 'T - e -'], calm: ['T g b e - - - -', 'T - g b e - - -'], cont: ['T g b - - - b -', 'T - g e - - b -'], fill: ['T g b e - - - -', 'T - g - e - - -'], late: ['b - e -', 'e - - -']}},
      {id: 'harp', vary: m.compound
        ? {short: ['T - g'], calm: ['T - g b - e', 'T - b e - b'], cont: ['T - b e - b', 'T - g e - b'], fill: ['T - g b - e', 'T - g e - -'], late: ['b - e', 'e - -']}
        : n === 3 ? {short: ['T - g -'], calm: ['T - g - b -', 'T - b - e -'], cont: ['T - g - e -', 'T - b - g -'], fill: ['T - g - e -', 'T - b - e -'], late: ['b - e -']}
        : n === 2 ? {short: ['T -'], calm: ['T - g -', 'A - b -'], cont: ['T - b -'], fill: ['T - e -'], late: ['b -']}
        : {short: ['T - g -', 'T - b -'], calm: ['T - g - b - e -', 'T - b - e - b -'], cont: ['T - g - e - b -', 'T - b - g - e -'], fill: ['T - g - b - e -', 'T - g - e - - -'], late: ['g - e -', 'b - e -']}},
      {id: 'pluck-calm', vary: m.compound
        ? {short: ['T+g+b+e - -'], calm: ['T+g+b+e - - g+b+e - -', 'T+g+b+e - - A+g+b+e - -'], cont: ['T+g+b+e - - g+b+e - b'], fill: ['T+g+b+e - - g+b+e - -'], late: ['g+b+e - -']}
        : n === 3 ? {short: ['T+g+b+e - - -'], calm: ['T+g+b+e - g+b+e - - -', 'T+g+b+e - - - g+b+e -'], cont: ['T+g+b+e - g+b+e - g+b+e -', 'T+g+b+e - - - g+b+e -'], fill: ['T+g+b+e - g+b+e - - -', 'T+g+b+e - - - b -'], late: ['g+b+e - - -']}
        : n === 2 ? {short: ['T+g+b+e -'], calm: ['T+g+b+e - g+b+e -'], cont: ['T+g+b+e - - -'], fill: ['T+g+b+e - - -'], late: ['g+b+e -']}
        : {short: ['T+g+b+e - - -'], calm: ['T+g+b+e - - - A+g+b+e - - -', 'T+g+b+e - - - g+b+e - - -'], cont: ['T+g+b+e - - - g+b+e - b -', 'T+g+b+e - - - A+g+b+e - - -'], fill: ['T+g+b+e - - - g+b+e - - -', 'T+g+b+e - - - - - b -'], late: ['g+b+e - - -', 'b - - -']}},
      {id: 'pluck-groove', vary: m.compound
        ? {short: ['T+g+b+e - -'], calm: ['T+g+b+e - g+b+e A+g+b+e - g+b+e', 'T+g+b+e - - g+b+e - g+b+e'], cont: ['T+g+b+e - - A+g+b+e - g+b+e'], fill: ['T+g+b+e - - g+b+e - -'], late: ['g+b+e - -']}
        : n === 3 ? {short: ['T+g+b+e - g+b+e -'], calm: ['T+g+b+e - g+b+e - g+b+e -', 'T+g+b+e - g+b+e - A+g+b+e -'], cont: ['T+g+b+e - g+b+e - g+b+e -'], fill: ['T+g+b+e - g+b+e - - -'], late: ['g+b+e - - -']}
        : n === 2 ? {short: ['T+g+b+e -'], calm: ['T+g+b+e - g+b+e -', 'T+g+b+e - A+g+b+e -'], cont: ['T+g+b+e - g+b+e -'], fill: ['T+g+b+e - - -'], late: ['g+b+e -']}
        : {short: ['T+g+b+e - g+b+e -', 'T+g+b+e - - -'], calm: ['T+g+b+e - - g+b+e - - A+g+b+e -', 'T+g+b+e - g+b+e - A+g+b+e - g+b+e -'], cont: ['T+g+b+e - - g+b+e - - g+b+e -', 'T+g+b+e - g+b+e - A+g+b+e - - -'], fill: ['T+g+b+e - - g+b+e - - - -', 'T+g+b+e - - - A+g+b+e - - -'], late: ['g+b+e - - -', 'A+g+b+e - - -']}}];
    var pickExtra = {pick: true, adaptive: true, settle: true, fillPat: m.compound ? 'T g b e - -' : n === 2 ? 'T g b -' : 'T g b e - - - -', latePat: m.compound ? 'b - e' : n === 2 ? 'b -' : 'g - b -', vary: guitarPickMoods[0].vary, moods: guitarPickMoods};
    // guitar strums and picking, by the time signature: [id, name, hint, pattern, shortPat, extra]
    var GUITAR = m.compound ? [
      ['folk', 'Folk strum', 'down, down, up', 'D D U D D U', 'D D U'],
      ['pop', 'Pop', 'with a muted chuck', 'D - U K - U', 'D - U'],
      ['steady', 'Steady', 'a strum on each beat', 'D - - D - -', 'D - -'],
      ['ballad', 'Ballad', 'slow and open', 'D - - D - U', 'D - U'],
      ['country', 'Country', 'bass, then strums, the other bass', 'T D U A D U', 'T D U'],
      ['pick', 'Fingerpicking', 'phrase-shuffled fingerpicking, ballad arches, harp and plucked chords', 'T+b - g A - b | T+e - b g - b', 'T+b - g', pickExtra]]
      : n === 3 ? [
      ['folk', 'Folk strum', 'down, then down-up', 'D - D U D U', 'D - D U'],
      ['pop', 'Pop', 'with a muted chuck', 'D - K U D U', 'D - K U'],
      ['steady', 'Steady', 'a strum on each beat', 'D - D - D -', 'D - D -'],
      ['ballad', 'Ballad', 'bass, then strums', 'T - D - D -', 'T - D -'],
      ['country', 'Country', 'bass, then strums, the other bass', 'T - D U D U | A - D U D U', 'T - D U'],
      ['pick', 'Fingerpicking', 'phrase-shuffled fingerpicking, ballad arches, harp and plucked chords', 'T+b - g - e - | T - g b g -', 'T+b - g -', pickExtra]]
      : n === 2 ? [
      ['folk', 'Folk strum', 'down, down-up', 'D - D U', 'D U'],
      ['pop', 'Pop', 'with a muted chuck', 'D U K U', 'D U'],
      ['steady', 'Steady', 'a strum on each beat', 'D - D -', 'D -'],
      ['ballad', 'Ballad', 'slow and open', 'D - - U', 'D -'],
      ['country', 'Country', 'bass, strum, the other bass, strum', 'T D A D', 'T D'],
      ['pick', 'Fingerpicking', 'phrase-shuffled fingerpicking, ballad arches, harp and plucked chords', 'T+b - g b', 'T+b -', pickExtra]]
      : [
      ['folk', 'Folk strum', 'down, down-up, up-down-up', 'D - D U - U D U', 'D - D U'],
      ['pop', 'Pop', 'with a muted chuck on beat 3', 'D - D U K U D U', 'D - K U'],
      ['steady', 'Steady', 'a strum on each beat', 'D - D - D - D -', 'D - D -'],
      ['ballad', 'Ballad', 'slow and open', 'D - - - D - D U', 'D - D U'],
      ['country', 'Country', 'bass, strum, the other bass, strum', 'T - D U A - D U', 'T - D U'],
      ['pick', 'Fingerpicking', 'phrase-shuffled fingerpicking, ballad arches, harp and plucked chords', 'T+b - g - A - e b | T+e - g b A - b -', 'T+b - g -', pickExtra]];
    var choraleRhythms = [{id: 'held', name: 'Held', pat: '1+t', rate: 0, low: 40, passing: true}];
    if (half) choraleRhythms.push({id: 'half', name: 'Twice a bar', pat: '1+t', rate: half, low: 40, passing: true});
    return [
      {id: 'strike', name: 'Strike', hint: 'the chord in one stroke', kinds: [
        strikes('1+5', 41, 'two', 'Two notes', 'root and fifth'),
        strikes('1+3+5', 43, 'three', 'Three notes', 'the whole triad'),
        strikes('1+5+8', 40, 'open', 'Open', 'root, fifth, octave'),
        strikes('1+5 | c', 41, 'hymn', 'Hymn', 'low at the chord, higher while it lasts')]},
      {id: 'bass', name: 'Bass + chord', hint: 'a bass note, then the chord', kinds: bc.filter(function (b) { return b[3] >= 1 && b[3] === Math.round(b[3]); }).map(function (b) {
        return {id: b[0], name: b[1], hint: b[2], rhythms: [{id: 'x', name: '', pat: b[2], rate: b[3], low: 40, smooth: true}]};
      })},
      {id: 'arp', name: 'Arpeggio', hint: 'the chord one note at a time', kinds: ARP.map(function (a) {
        return {id: a[0], name: a[1], hint: a[2], rhythms: rates.map(function (r) {
          var steps = Math.round(m.bar / r[0]), extra = a[5] || {};
          var item = {id: r[1], name: r[2], pat: arpPattern(a, steps), rate: r[0], low: a[4]};
          if (extra.bassRing) item.bassRing = true;
          if (extra.shortPat && steps >= 8) item.shortPat = extra.shortPat;
          return item;
        })};
      })},
      {id: 'guitar', name: 'Guitar', hint: 'strummed or picked like a guitar', kinds: GUITAR.map(function (gk) {
        var extra = gk[5] || {};
        return {id: gk[0], name: gk[1], hint: gk[2], pick: !!extra.pick, rhythms: [Object.assign({id: '8', name: '', pat: gk[3], shortPat: gk[4], rate: eighth, low: 40, guitar: true}, extra)]};
      })},
      {id: 'dynamic', name: 'Dynamic', hint: 'musical patterns that breathe and move', kinds: [
        {id: 'adaptive', name: 'Adaptive', hint: 'phrase-shuffled flowing piano: warm pedaled sway, serene arches, soft rolled chords and lyrical walks, unhurried on pauses', rhythms: [
          {id: '8', name: '', pat: adaptCalm, fillPat: adaptFill, latePat: adaptLate, shortPat: m.compound ? '1 - -' : '1 - c -', rate: eighth, low: 40, bassRing: true, chordPedal: true, adaptive: true, smooth: true, settle: true, feather: true, roll: 0.020, vary: adaptVary, moods: adaptMoods}]},
        {id: 'rolled', name: 'Rolled', hint: 'soft upward harp-like chords', rhythms: rolledRhythms},
        {id: 'pulse', name: 'Pulse', hint: 'phrase-shuffled lively piano: joyful 3-3-2 pop pulse, cheerful bounce, driving chords, gospel walk and sparkling arpeggios', rhythms: [
          {id: '8', name: '', pat: pulseMoods[0].vary.calm[0], fillPat: pulseMoods[0].vary.fill[0], latePat: pulseMoods[0].vary.late[0], shortPat: pulseShort, rate: eighth, low: 40, smooth: true, adaptive: true, bouncy: true, roll: 0.006, vary: pulseMoods[0].vary, moods: pulseMoods}]},
        {id: 'walking', name: 'Walking', hint: 'bass steps smoothly into each chord', rhythms: walkRhythms},
        {id: 'chorale', name: 'Chorale', hint: 'bass and tenor, as in a hymnal', rhythms: choraleRhythms}]}];
  }
  // which style a pattern is: {family, kind, rhythm} (indices into styles()), by its "style" hint or by its pattern
  function findStyle(sheet, a) {
    if (!a || !a.pat) return null;
    var st = styles(sheet), hint = (a.style || '').split('/'), norm = patternText(parsePattern(a.pat)), found = null, byHint = null;
    st.forEach(function (f, fi) { f.kinds.forEach(function (k, ki) { k.rhythms.forEach(function (r, ri) {
      var same = patternText(parsePattern(r.pat)) === norm && r.rate === (a.rate || 0);
      if (same && !found) found = {family: fi, kind: ki, rhythm: ri};
      if (same && f.id === hint[0] && k.id === hint[1]) byHint = {family: fi, kind: ki, rhythm: ri};
    }); }); });
    return byHint || found;
  }
  function styleName(sheet, a) {
    if (!a || !a.pat) return 'No left hand';
    var f = findStyle(sheet, a); if (!f) return a.pat;
    var st = styles(sheet), fam = st[f.family], k = fam.kinds[f.kind], r = k.rhythms[f.rhythm];
    return (fam.id === 'bass' || !r.name) ? k.name : fam.name + ': ' + k.name.toLowerCase() + ', ' + r.name.toLowerCase();
  }

  // The left hand the patterns give: {events: [{p: [pitches] | null, d, ring}], marks: [{t, text}]}, or null when the
  // sheet has none. sheet.acc is the pattern of the whole song, a note's "lh" changes it from that note on (or with
  // "for": "bar" / "chord" only until the bar or the chord ends). A pattern is {pat, rate, low, pedal, style}. The
  // upbeat bar stays empty, the last bar is one held chord (unless acc.end is false), and a note that would reach the
  // right hand sounding over it takes its whole figure down an octave: the hands do not cross. Never lower than E2 for the bass figure
  // (C2 before) or C3 for the chord in the middle (E2 before): a hymn whose melody is low (G3) kept the chords in the muddy low register.
  function accompany(sheet) {
    var base = sheet.acc || null, notes = sheet.notes;
    if (!base && !notes.some(function (n) { return n.lh; })) return null;
    var bar = barLen(sheet), beat = beatLen(sheet), off = gridOff(sheet), on = onsets(notes), spans = chordSpans(sheet);
    var endG = Math.ceil((total(notes) + off) / bar) * bar, first = off ? bar : 0;
    if (endG <= 0) return null;
    function spanAt(g) { for (var k = spans.length - 1; k >= 0; k--) if (spans[k].g <= g) return g < spans[k].end ? spans[k] : null; return null; }
    // the pattern changes, snapped to the beat like the chords
    var changes = [];
    notes.forEach(function (n, i) {
      if (!n.lh) return;
      var g = on[i] + off; g -= g % beat; if (g < first) g = first;
      var sp = spanAt(g), until = n.lh['for'] === 'bar' ? (Math.floor(g / bar) + 1) * bar : n.lh['for'] === 'chord' && sp ? sp.end : Infinity;
      changes.push({g: g, end: until, a: n.lh, i: i});
    });
    var bars = [], fx = fifths(sheet); for (var b = 0; b < endG; b += bar) bars.push({g: b, len: bar, beat: beat, fifths: fx});
    var fills = rightHand(sheet), mel = [], last = -1;   // the right hand: the melody (and voice2), or the lowest note added under it
    notes.forEach(function (n, i) { if (!isRest(n)) mel.push([on[i] + off, on[i] + off + len(n), fills && fills[i] ? fills[i][0] : n.p]); });
    for (var i = notes.length - 1; i >= 0; i--) if (!isRest(notes[i]) && !tied(notes, i)) { last = on[i] + off; break; }
    if (sheet.voice2 && sheet.voice2.length) {
      var v2 = sheet.voice2, v2on = onsets(v2);
      v2.forEach(function (n, i) { if (!isRest(n)) mel.push([v2on[i] + off, v2on[i] + off + len(n), n.p]); });
      for (var j = v2.length - 1; j >= 0; j--) if (!isRest(v2[j]) && !tied(v2, j)) { last = Math.max(last, v2on[j] + off); break; }
      mel.sort(function (a, b) { return a[0] - b[0]; });
    }
    var out = accompanyOn({bars: bars, first: first, chords: spans, mel: mel, last: last, base: base, changes: changes, bpm: sheet.tempo || 0});
    var events = [];
    function push(p, d, ring, src) {
      var prev = events[events.length - 1];
      if (!p && prev && !prev.p) { prev.d += d; return; }
      var e = {p: p, d: d}; if (ring) e.ring = ring;
      if (src && src.fresh) e.fresh = true;   // the first note of a chord's stretch is played a little harder
      if (src && src.cont) e.cont = true;
      if (src && src.pause) e.pause = true;
      if (src && src.walk) e.walk = true;
      if (src && src.feather) e.feather = true;
      if (src && src.bouncy) e.bouncy = true;
      if (src && src.roll != null) e.roll = src.roll;
      if (src && src.inst) {
        e.inst = src.inst;
        if (src.mute) e.mute = true;
        if (src.up) e.up = true;
        if (src.pluck) e.pluck = true;
        if (src.thumb) e.thumb = true;
        if (src.rings) e.rings = src.rings;
      }   // a guitar strum or fingerpluck (played by the page, not written in the sheet)
      events.push(e);
    }
    if (first) push(null, first - off);   // the upbeat
    out.events.forEach(function (e) { push(e.p, e.d, e.ring, e); });
    return {events: events, marks: out.marks.map(function (m) { return {t: m.g - off, a: m.a, song: m.song}; }), changes: changes};
  }
  // The left hand over any music, bar by bar (accompany above gives it a lead sheet; the web app a sheet of the app). tl:
  //   bars: [{g, len, beat, fifths}] every bar's start and length in sixteenths (g counts from the first bar line), its
  //                                 beat and key signature (both optional: for passing notes)
  //   first                         where the left hand may start: after an upbeat bar
  //   chords: [{g, info, end}]      on the beat, in order; end is the next chord's g, or the end of the music
  //   mel: [[from, to, pitch]]      the right hand's lowest note, in order of `from`
  //   last                          g of the last note struck (its bar is one held chord), or -1
  //   base, changes: [{g, end, a}]  the pattern of the whole, and the patterns that take over at g (until end)
  // -> {events: [{g, d, p: [pitches] | null, ring}], marks: [{g, a, song}]}: in order from `first`, none over a bar line
  function accompanyOn(tl) {
    var bars = tl.bars, spans = tl.chords, changes = tl.changes || [], base = tl.base || null, first = tl.first || 0, mel = tl.mel;
    var endG = bars.length ? bars[bars.length - 1].g + bars[bars.length - 1].len : 0;
    function barAt(g) { var k = 0; while (k < bars.length - 1 && bars[k + 1].g <= g) k++; return k; }
    function spanAt(g) { for (var k = spans.length - 1; k >= 0; k--) if (spans[k].g <= g) return g < spans[k].end ? spans[k] : null; return null; }
    function patAt(g) {
      var a = base;
      changes.forEach(function (c) { if (c.g <= g && c.end === Infinity) a = c.a; });
      changes.forEach(function (c) { if (c.g <= g && g < c.end && c.end !== Infinity) a = c.a; });
      return a;
    }
    var cuts = {}; cuts[first] = 1;
    bars.forEach(function (b) { if (b.g > first && b.g < endG) cuts[b.g] = 1; });
    spans.forEach(function (s) { if (s.g > first && s.g < endG) cuts[s.g] = 1; });
    changes.forEach(function (c) { if (c.g > first && c.g < endG) cuts[c.g] = 1; if (c.end > first && c.end < endG) cuts[c.end] = 1; });
    var at = Object.keys(cuts).map(Number).sort(function (x, y) { return x - y; });
    function melLow(g, d) {   // the lowest note of the right hand sounding in [g, g + d)
      var lo = Infinity;
      for (var k = 0; k < mel.length && mel[k][0] < g + d; k++) if (mel[k][1] > g) lo = Math.min(lo, mel[k][2]);
      return lo;
    }
    var lastBar = tl.last >= 0 ? barAt(tl.last) : -1, events = [], marks = [], lastA = null, prevMid = null, prevTen = null;
    // Varied (`vary`): each stretch takes one of the style's figures for its situation by a random number made from the
    // song and from acc.seed (the take; 0 is the song's own, another number is another take), so the same notes play
    // every time; half the time a stretch keeps the figure it took last time, so a figure carries on for a while
    var songSeed = spans.length * 7919 + Math.round(endG) * 131 + mel.length * 17, lastPick = {};
    function rnd(x) { x = (x + 0x6D2B79F5) | 0; x = Math.imul(x ^ (x >>> 15), x | 1); x ^= x + Math.imul(x ^ (x >>> 7), x | 61); return ((x ^ (x >>> 14)) >>> 0) / 4294967296; }
    function varyPick(kind, n, a, seed) {
      var base = songSeed + seed * 104729 + Math.round(a) * 977 + kind.charCodeAt(0) * 31, prev = lastPick[kind];
      var k = prev != null && prev < n && rnd(base) < 0.5 ? prev : Math.floor(rnd(base ^ 0x5bd1e995) * n);
      lastPick[kind] = k; return k;
    }
    // Adaptive: where in [a, z) the melody stops moving (its last note starts, or it rests) and holds on to z, on the grid
    // of `rate` from a; -1 when it moves until less than half a bar (at least 6 sixteenths) is left: no room to bloom
    function holdFrom(a, z, rate, barL) {
      var h = a;
      for (var k = 0; k < mel.length && mel[k][0] < z; k++) if (mel[k][0] > a) h = mel[k][0];
      h = a + Math.ceil((h - a) / rate) * rate;
      return z - h >= Math.max(6, barL / 2) ? h : -1;
    }
    function melPc(g) { for (var k = mel.length - 1; k >= 0; k--) if (mel[k][0] <= g + 0.01) return g < mel[k][1] ? mod12(mel[k][2]) : null; return null; }
    function melPcsIn(g, d) {
      var out = [];
      for (var k = 0; k < mel.length && mel[k][0] < g + d; k++) if (mel[k][1] > g) out.push(mod12(mel[k][2]));
      return out;
    }
    // Phrase-grouped mood schedule for styles with `moods` (Adaptive / Flowing): stay in one mood for a musical
    // phrase (2–4 bars, transitioning cleanly right after a long-pause cadence bar or every 4 bars) without repeating
    // the same mood back-to-back, deterministic from songSeed + acc.seed.
    var moodCache = {};
    function moodForBar(acc, bi) {
      if (!acc || !acc.moods || !acc.moods.length) return null;
      var key = (acc.guitar ? 'g:' : 'p:') + acc.moods[0].id + ':' + acc.moods.length + ':' + (acc.seed | 0);
      if (!moodCache[key]) {
        var sched = [], curM = null, pLen = 0, pIdx = 0;
        var isPauseBar = function (b) {
          var lastOn = b.g;
          for (var k = 0; k < mel.length && mel[k][0] < b.g + b.len; k++) if (mel[k][0] >= b.g) lastOn = mel[k][0];
          return b.len >= (b.beat || 4) * 2 && (b.g + b.len - lastOn) >= Math.max(6, b.len / 2);
        };
        bars.forEach(function (b, idx) {
          var prevPause = idx > 0 && isPauseBar(bars[idx - 1]);
          if (!curM || pLen >= 4 || (prevPause && pLen >= 2)) {
            var prevId = curM ? curM.id : null;
            var cands = acc.moods.filter(function (m) { return m.id !== prevId; });
            if (!cands.length) cands = acc.moods;
            curM = cands[Math.floor(rnd(songSeed + (acc.seed | 0) * 104729 + pIdx * 6151) * cands.length)];
            pLen = 0; pIdx++;
          }
          sched[idx] = curM;
          if (b.len >= (b.beat || 4) * 2) pLen++;
        });
        moodCache[key] = sched;
      }
      return moodCache[key][bi] || acc.moods[0];
    }
    at.forEach(function (a, k) {
      var z = k + 1 < at.length ? at[k + 1] : endG, sp = spanAt(a), acc = patAt(a), parts = acc ? parsePattern(acc.pat) : [];
      if (acc && /^guitar\//.test(acc.style || '')) {
        if (!acc.guitar) acc = Object.assign({}, acc, {guitar: true});   // a saved pattern knows its style, not the flag
        if (acc.pick == null && /^guitar\/(pick|travis|arp|harp)/.test(acc.style)) acc = Object.assign({}, acc, {pick: true});
      }
      if (z <= a) return;
      if (acc !== lastA) { marks.push({g: a, a: acc, song: acc === base}); lastA = acc; }
      if (!sp || !sp.info || !parts.length) { events.push({g: a, d: z - a, p: null}); return; }
      var bi = barAt(a), barStart = bars[bi].g, barL = bars[bi].len, fresh = sp.g >= barStart || barStart === first && sp.g < first;
      var rate = acc.rate | 0, useParts = parts, bloom = -1, lateSteps = null;
      var curMood = rate ? moodForBar(acc, bi) : null;
      // When looping (acc.end === false), the last bar should keep flowing into the next stanza instead of
      // landing on a sparse chord-hold mood (rolled/velvet/pluck-calm/shimmer) that feels like a closing strike.
      var loopLast = acc.end === false && lastBar >= 0 && bi >= lastBar;
      if (loopLast && curMood && /^(rolled|velvet|pluck-calm|shimmer)$/.test(curMood.id)) curMood = acc.moods[0];
      var activeVary = curMood ? curMood.vary : acc.vary;
      // Fast-notated sheets (e.g. cut-time 4/4 at ♩=200 or fast 3/4 at ♩=180): relax guitar picking and flowing piano
      // into spacious quarter-note pacing so they never sound frantic.
      var isCompoundBar = bars[bi].beat === 6;
      var halfTimed = !!(acc.pick && rate && tl.bpm > 0 && !isCompoundBar && (rate / 4) * (60 / tl.bpm) < 0.21);
      var pianoHalfTimed = !!(curMood && !acc.guitar && rate && tl.bpm > 0 && !isCompoundBar && (rate / 4) * (60 / tl.bpm) < (curMood.halfTimeMs || 0.21));
      if (halfTimed) {
        rate *= 2;
        var mid = curMood ? curMood.id : '';
        if (/^pluck/.test(mid)) {
          var plStr = (z - a) <= barL / 2 ? 'T+g+b+e -' : barL === 12 ? 'T+g+b+e g+b+e -' : 'T+g+b+e - A+g+b+e -';
          useParts = parsePattern(plStr);
        } else if (barL === 12 && bars[bi].beat === 4) {
          var waltzPat = /arch|shimmer|harp/.test(mid || acc.kind || acc.style || '') ? 'T g b | T b e' : 'T g b | A b e';
          useParts = parsePattern((z - a) <= barL / 2 ? 'T g' : waltzPat);
        } else if (mid) {
          var gpStr = (z - a) <= barL / 2 ? (/arch|shimmer|harp/.test(mid) ? 'T g' : 'T+b g')
            : /arch|shimmer|harp/.test(mid) ? 'T g b e | T b e b' : 'T+b g A b | T+e g A b';
          useParts = parsePattern(gpStr);
        } else if (acc.shortPat && (z - a) <= barL / 2) {
          var spFast = parsePattern(acc.shortPat); if (spFast.length) useParts = spFast;
        }
      } else if (pianoHalfTimed) {
        rate *= 2;
        var pfStr = (z - a) <= barL / 2 ? '1 c' : barL === 12 ? (fresh ? '1 5 c' : '1 c 5') : (fresh ? '1 5 c 8' : '1 c 5 c');
        if (acc.bouncy) {
          if ((z - a) <= barL / 2) pfStr = curMood.id === 'drive' ? '1+c c' : '1 c';
          else if (barL === 12) pfStr = curMood.id === 'drive' ? '1+c c c' : curMood.id === 'gospel' ? '1 c w' : '1 c c';
          else pfStr = curMood.id === 'drive' ? '1+c c 5+c c' : curMood.id === 'gospel' ? '1 c 5 w' : '1 c 5 c';
        } else {
          if (curMood.id === 'rolled') pfStr = (z - a) <= barL / 2 ? '1+5+10 -' : barL === 12 ? '1+5+10 c -' : '1+5+10 - c -';
          if (curMood.id === 'walk' && (z - a) > barL / 2) pfStr = barL === 12 ? '1 c w' : '1 5 c w';
        }
        var pfParts = parsePattern(pfStr); if (pfParts.length) useParts = [pfParts[0], pfParts[0]];
      } else if (rate && acc.shortPat && (z - a) <= barL / 2) {
        // Short-chord adaptation (e.g. 2-beat chord in 4/4), and Adaptive: calm while the melody moves, a fill from where it
        // holds a note or rests (the whole stretch when it holds from the start, else the late fill from that beat)
        var spParts = parsePattern(acc.shortPat); if (spParts.length) useParts = spParts;
      } else if (rate && acc.adaptive && acc.fillPat && !loopLast && (bloom = holdFrom(a, z, rate, barL)) >= 0) {
        if (bloom === a) { var fpParts = parsePattern(acc.fillPat); if (fpParts.length) useParts = fpParts; }
        else { var lp = parsePattern(acc.latePat || acc.fillPat); lateSteps = lp.length ? lp[0] : null; }
      }
      if (activeVary && rate && !pianoHalfTimed && !halfTimed) {
        var kind = acc.shortPat && (z - a) <= barL / 2 ? 'short' : bloom === a ? 'fill' : bloom > a ? 'late' : fresh ? 'calm' : 'cont';
        var baseKind = kind === 'late' ? (fresh ? 'calm' : 'cont') : kind;
        var vl = activeVary[baseKind];
        if (vl && vl.length) {
          var vp = parsePattern(vl[varyPick(baseKind, vl.length, a, acc.seed | 0)]);
          if (vp.length) useParts = [vp[0], vp[0]];
        }
        if (kind === 'late' && activeVary.late && activeVary.late.length) {
          var lvp = parsePattern(activeVary.late[varyPick('late', activeVary.late.length, a, acc.seed | 0)]);
          if (lvp.length) lateSteps = lvp[0];
        }
      }
      var qStart = halfTimed && !(barL === 12 && bars[bi].beat === 4) ? Math.round((a - sp.g) / rate) : 0;
      var steps = halfTimed && qStart > 0 && useParts[0].length
        ? useParts[Math.min(useParts.length - 1, Math.floor(qStart / useParts[0].length))]
        : useParts[fresh ? 0 : Math.min(1, useParts.length - 1)];
      // what is played when in this stretch: [{toks | null, g, d}]
      var plan = [], isEnding = acc.end !== false && rate && sp === spans[spans.length - 1] && bi >= lastBar && lastBar >= 0;
      if (isEnding) {
        var all = acc.guitar ? ['D'] : curMood ? ['1', '5', '8', '10'] : ['1', '5'];
        if (!acc.guitar && !curMood) steps.forEach(function (s) { (s.toks || []).forEach(function (t) { if (/^[378t]$/.test(t) && all.indexOf(t) < 0) all.push(t); }); });   // one hand can hold it
        plan.push({toks: all, g: a, d: z - a, ending: true});
      } else if (!rate) plan.push({toks: steps[0].toks || null, g: a, d: z - a});
      else {
        // a chord that comes off the pattern's grid (on the "and"): its first step sounds there and lasts to the next step of
        // the bar's grid, and the pattern goes on from there in time with the bar
        var t0 = a, q0 = qStart, offGrid = (a - barStart) % rate;
        if (offGrid > 1e-6 && !halfTimed) {
          var s0 = steps[q0 % steps.length], next = Math.min(z, a - offGrid + rate);
          plan.push({toks: (s0.hold ? steps[0].toks : s0.toks) || null, g: a, d: next - a});
          t0 = next; q0++;
        }
        var swapped = false;
        for (var t = t0, q = q0; t < z; t += rate, q++) {
          if (lateSteps && !swapped && t >= bloom) { steps = lateSteps; q = 0; swapped = true; }
          var s = steps[q % steps.length], d = Math.min(rate, z - t), last = plan[plan.length - 1];
          if (s.hold && last && last.toks) last.d += d; else plan.push({toks: s.toks || null, g: t, d: d, isPause: bloom >= 0 && t >= bloom});
        }
      }
      // settle: the last beat holds the note before it so the hand/fingers have a beat before jumping to the next chord's bass
      // (preserve an intentional connecting bass step `w`, which steps smoothly into the next chord's bass)
      var doSettle = acc.settle && rate && !isEnding && !pianoHalfTimed && (!acc.pick || (z >= sp.end - 0.01 && (z - a) > (bars[bi].beat || rate * 2)));
      if (doSettle) {
        var beatL = bars[bi].beat || rate * 2, lastBeat = z - beatL + 0.01;
        for (var pk = plan.length - 1; pk > 0; pk--) {
          var stp = plan[pk];
          if (stp.g > lastBeat && stp.toks && stp.toks.indexOf('w') < 0) { plan[pk - 1].d += stp.d; plan.splice(pk, 1); }
        }
      }
      // the figure counted up from the bass and the chord in the middle each go down an octave, whole, where one of
      // their notes would reach the melody
      var spIdx = spans.indexOf(sp), nextSp = spIdx >= 0 && spIdx + 1 < spans.length ? spans[spIdx + 1] : null;
      var under = melLow(a, z - a);
      var v = voicing(sp.info, acc.low, [[{toks: ['1', '3', '5', '7', '8', '9', '10', '12', 'c', 'C', 't', 'w', 'D', 'U', 'K', 'T', 'A', 'g', 'b', 'e']}]],
        {next: nextSp, prevMid: prevMid, smooth: !!acc.smooth, prevTen: prevTen, under: under === Infinity ? null : under, mel: melPc(a), melPcs: melPcsIn(a, z - a), capo: acc.capo});
      // For Flowing's optional connecting bass `w`: only keep it when it genuinely steps smoothly into a moving next bass
      if (curMood && !isEnding && plan.length > 1) {
        var lastSt = plan[plan.length - 1];
        if (lastSt.toks && lastSt.toks.indexOf('w') >= 0) {
          var nb = nextSp && nextSp.info ? (acc.low != null ? acc.low : 40) + mod12(nextSp.info.bass - (acc.low != null ? acc.low : 40)) : -1;
          var wp = v.w && v.w[0];
          var smoothStep = nextSp && nextSp.info && nextSp.info.bass !== sp.info.bass && wp != null &&
            Math.min(Math.abs(nb - wp), Math.abs(nb - 12 - wp), Math.abs(nb + 12 - wp)) <= 3;
          if (!smoothStep) { plan[plan.length - 2].d += lastSt.d; plan.pop(); }
        }
      }
      var shift = {fig: 0, mid: 0};
      function layer(t) { return /[\dw]/.test(t) ? 'fig' : 'mid'; }
      if (!acc.guitar) ['fig', 'mid'].forEach(function (L) {   // a guitar stays where its strings are
        for (var n = 0; n < 2; n++) {
          var hit = false, lowest = Infinity;
          plan.forEach(function (st) { (st.toks || []).forEach(function (t) {
            if (layer(t) !== L) return;
            var lo = melLow(st.g, st.d);
            v[t].forEach(function (p) { p -= 12 * shift[L]; lowest = Math.min(lowest, p); if (p >= lo) hit = true; });
          }); });
          if (hit && lowest - 12 >= (L === 'fig' ? 36 : 48)) shift[L]++; else break;
        }
      });
      if (plan.some(function (st) { return (st.toks || []).indexOf('t') >= 0; })) prevTen = v.t[0] - 12 * shift.mid;
      // Update smooth voice-leading anchor from the middle chord actually used in this stretch
      if (acc.smooth) {
        var midNotes = v.C || v.c;
        if (midNotes && midNotes.length) {
          prevMid = midNotes.reduce(function (s, p) { return s + (p - 12 * shift.mid); }, 0) / midNotes.length;
        }
      }
      var walkSt = acc.chordPedal ? plan.find(function (st) { return st.toks && st.toks.indexOf('w') >= 0; }) : null;
      var pedalLimit = walkSt ? walkSt.g : z;
      plan.forEach(function (st, pi) {
        var o = [];
        (st.toks || []).forEach(function (t) { v[t].forEach(function (p) { p -= 12 * shift[layer(t)]; if (o.indexOf(p) < 0) o.push(p); }); });
        var isWalk = !!(st.toks && st.toks.indexOf('w') >= 0);
        var e = {g: st.g, d: st.d, p: o.length ? o.sort(function (x, y) { return x - y; }) : null};
        if (e.p) {
          if (acc.pedal && rate && z - st.g > st.d) e.ring = z - st.g;
          else if (acc.chordPedal && rate && !isWalk) {
            var stopAt = st.g < pedalLimit ? pedalLimit : z;
            var ringLen = Math.min(stopAt - st.g, 14);   // warm per-chord damper pedal, lifting cleanly before `w` or chord change
            if (ringLen > st.d) e.ring = ringLen;
          }
          else if (acc.bassRing && rate && pi === 0 && (st.toks || []).indexOf('1') >= 0 && z - st.g > st.d) e.ring = z - st.g;
          if (st.ending) e.roll = acc.bouncy ? 0.022 : curMood && !acc.guitar ? 0.036 : 0.032;
          else if (curMood && !acc.guitar && e.p.length > 1) e.roll = curMood.roll || 0.018;
          else if (acc.roll && e.p.length > 1) e.roll = acc.roll;
          if (acc.guitar) {   // strummed: down from the bass, up (U alone) from the top string; picked: warm fingers, strings let ring
            e.inst = 'guitar';
            if (acc.pick) {
              e.pluck = true;
              e.spanEnd = sp.end;
              if ((st.toks || []).indexOf('T') >= 0 || (st.toks || []).indexOf('A') >= 0) e.thumb = true;
              e.roll = e.p.length > 1 ? (st.ending ? 0.022 : 0.004) : 0;
            } else {
              if (e.p.length > 1 && !st.ending) e.roll = acc.roll || 0.012;
              if ((st.toks || []).length === 1 && st.toks[0] === 'U') e.up = true;
              if ((st.toks || []).indexOf('K') >= 0) { e.mute = true; e.roll = 0.004; }
            }
          }
          if (pi === 0 && fresh) e.fresh = true;
          if (acc.feather) {
            e.feather = true;
            if (!fresh) e.cont = true;
            if (st.isPause) e.pause = true;
            if (isWalk) e.walk = true;
          }
          if (acc.bouncy && !st.ending) e.bouncy = true;
          if (acc.passing && e.p.length === 2 || st.ending) { e.span = sp; e.pass = acc.passing === 2 ? 2 : acc.passing ? 1 : 0; }
        }
        events.push(e);
      });
    });
    // Fingerpicked guitar strings ring naturally over one another until that same string/pitch is plucked again or the chord ends
    events.forEach(function (e, idx) {
      if (!e.pluck || !e.p) return;
      var cap = Math.min(e.spanEnd, e.g + 16);
      e.rings = e.p.map(function (pitch) {
        var stopG = cap;
        for (var m = idx + 1; m < events.length; m++) {
          var nx = events[m];
          if (nx.g >= stopG) break;
          if (nx.p && (nx.p.indexOf(pitch) >= 0 || nx.mute || (nx.inst === 'guitar' && !nx.pluck))) { stopG = nx.g; break; }
        }
        return Math.max(e.d, stopG - e.g - 0.2);
      });
      delete e.spanEnd;
    });
    passingNotes(events, bars, barAt, mel);
    return {events: events, marks: marks};
  }
  // Passing notes, as a hymnal's lower voices walk (Chorale, `passing`): where the bass, or else the tenor, leaps a third
  // into the next chord, the last beat of the chord before takes the note of the key between (C B A, G A B). Not where
  // the chord lasts less than two beats, where that note would sit a semitone from the melody, or where the key is not
  // known (a bar's `fifths`). One voice at a change, so it stays a sprinkle. `passing: 2` (More walking) walks more:
  // both voices at a change, a fourth in two steps (C D E F: the last two beats, or two halves of the last beat), and in
  // a chord of four beats or more, or of two or three while the melody holds one note through it (a held "throne"), the
  // bass goes to another note of the chord halfway (on a beat), towards the next chord's bass.
  function passingNotes(events, bars, barAt, mel) {
    function melAt(g) { for (var k = mel.length - 1; k >= 0; k--) if (mel[k][0] <= g + 0.01) return g < mel[k][1] ? mel[k][2] : null; return null; }
    function clashes(x, t, d) {   // a semitone (or major seventh) from a melody note sounding in [t, t + d)
      for (var k = 0; k < mel.length && mel[k][0] < t + d; k++) if (mel[k][1] > t && [1, 11].indexOf(mod12(mel[k][2] - x)) >= 0) return true;
      return false;
    }
    function melLowIn(t, d) { var lo = Infinity; for (var k = 0; k < mel.length && mel[k][0] < t + d; k++) if (mel[k][1] > t) lo = Math.min(lo, mel[k][2]); return lo; }
    function nextChord(i) { var sp = events[i].span; for (var j = i + 1; j < events.length; j++) { var f = events[j]; if (f.span !== sp) return f.p && f.span && f.g === f.span.g ? f : null; } return null; }
    function split(i, at) {   // events[i] in two at `at`, the same notes
      var e = events[i]; if (at <= e.g || at >= e.g + e.d) return;
      var f = {g: at, d: e.g + e.d - at, p: e.p.slice(), span: e.span, pass: e.pass};
      e.d = at - e.g; delete e.ring; events.splice(i + 1, 0, f);
    }
    // the bass halfway through a long chord (More walking)
    for (var i = 0; i < events.length; i++) {
      var e = events[i];
      if (e.pass !== 2 || !e.span || !e.p || e.span.g !== e.g) continue;
      var S = e.span, beat = bars[barAt(S.g)].beat || 4, len = S.end - S.g, last = i;
      while (last + 1 < events.length && events[last + 1].span === S) last++;
      var f = nextChord(last);
      var holds = !mel.some(function (n) { return n[0] > S.g + 0.01 && n[0] < S.end - 0.01; });   // the melody holds one note through it
      if (len < 2 * beat || (len < 4 * beat && !holds) || !f || !S.info) continue;
      var mid = S.g + beat * Math.floor(len / beat / 2), bass = e.p[0], nb = f.p[0], top = Infinity, best = null, bestCost = Infinity;
      for (var k = i; k <= last; k++) if (events[k].p) top = Math.min(top, events[k].p[1]);
      var pcs = S.info.tones.map(function (t) { return mod12(S.info.root + t[0]); });
      for (var q = Math.max(36, bass - 9); q <= bass + 9 && q < top - 2; q++) {
        if (pcs.indexOf(mod12(q)) < 0 || mod12(q) === mod12(bass) || q === nb || Math.abs(q - nb) > 5 || clashes(q, mid, S.end - mid)) continue;
        var cost = Math.abs(Math.abs(q - nb) - 2) * 2 + Math.abs(q - bass) * 0.25;
        if (cost < bestCost) { bestCost = cost; best = q; }
      }
      if (best == null) continue;
      for (var k2 = i; k2 <= last; k2++) if (events[k2].g < mid && events[k2].g + events[k2].d > mid) { split(k2, mid); last++; break; }
      for (var k3 = i; k3 <= last; k3++) if (events[k3].g >= mid && events[k3].p) { events[k3].p[0] = best; delete events[k3].ring; }
      i = last;
    }
    // the passing notes into the next chord
    for (var j = 0; j + 1 < events.length; j++) {
      var a = events[j], b = events[j + 1];
      if (!a.pass || !b.span || !b.p || a.span === b.span || b.g !== b.span.g || a.g + a.d !== b.g) continue;
      var bar = bars[barAt(a.g)], bt = bar.beat || 4, more = a.pass === 2;
      if (bar.fifths == null || a.d < 2 * bt || a.span.end - a.span.g < 2 * bt) continue;
      var tonic = mod12(bar.fifths * 7), scale = [0, 2, 4, 5, 7, 9, 11].map(function (x) { return (tonic + x) % 12; });
      var end = a.g + a.d, walks = [];
      for (var v = 0; v < 2; v++) {
        if (walks.length && !more) break;
        if (v === 1 && b.p.length !== 2) break;
        var from = a.p[v], to = b.p[v], diff = to - from, dir = diff > 0 ? 1 : -1, size = Math.abs(diff);
        var steps = [1, 2, 3, 4].map(function (k) { return from + dir * k; }).filter(function (x) { return dir * (to - x) > 0 && scale.indexOf(mod12(x)) >= 0; });
        var notes = null;
        if ((size === 3 || size === 4) && steps.length === 1) notes = [{t: end - bt, d: bt, x: steps[0]}];
        else if (more && size === 5 && steps.length === 2) {
          if (a.d >= 3 * bt) notes = [{t: end - 2 * bt, d: bt, x: steps[0]}, {t: end - bt, d: bt, x: steps[1]}];
          else if (bt % 2 === 0) notes = [{t: end - bt, d: bt / 2, x: steps[0]}, {t: end - bt / 2, d: bt / 2, x: steps[1]}];
        }
        if (!notes || notes.some(function (n) { return n.x < 36 || clashes(n.x, n.t, n.d) || (v === 1 && n.x >= melLowIn(n.t, n.d)); })) continue;
        walks.push({v: v, notes: notes});
      }
      if (!walks.length) continue;
      var cuts = [a.g, end];
      walks.forEach(function (w) { w.notes.forEach(function (n) { cuts.push(n.t, n.t + n.d); }); });
      cuts = cuts.filter(function (c, k) { return cuts.indexOf(c) === k; }).sort(function (x, y) { return x - y; });
      var segs = [];
      for (var c = 0; c + 1 < cuts.length; c++) {
        var t0 = cuts[c], p = a.p.slice();
        walks.forEach(function (w) { w.notes.forEach(function (n) { if (n.t <= t0 && t0 < n.t + n.d) p[w.v] = n.x; }); });
        if (p[0] >= p[1]) { segs = null; break; }
        segs.push({g: t0, d: cuts[c + 1] - t0, p: p});
      }
      if (!segs) continue;
      a.d = segs[0].d; delete a.ring;
      events.splice.apply(events, [j + 1, 0].concat(segs.slice(1)));
      j += segs.length - 1;
    }
    events.forEach(function (e) { delete e.span; delete e.pass; });
  }
  // the left hand to draw and play: written out by hand (sheet.left), or made from the patterns
  function leftHand(sheet) {
    if (Array.isArray(sheet.left) && sheet.left.length) return {events: sheet.left, marks: [], written: true};
    return accompany(sheet);
  }
  // events [a, b) of a part, cut at the edges (the second half of a cut note is tied to the first)
  function sliceEvents(events, a, b) {
    var out = [], t = 0;
    events.forEach(function (e) {
      var s = t, z = t + len(e); t = z;
      if (z <= a || s >= b) return;
      var c = {p: isRest(e) ? null : (Array.isArray(e.p) ? e.p.slice() : e.p), d: Math.min(z, b) - Math.max(s, a)};
      if (!isRest(e) && (s < a || e.tie)) c.tie = true;
      if (!isRest(e) && s >= a && e.w) c.w = e.w.slice();
      if (!isRest(e) && e.e) c.e = true;
      if (isRest(e) && e.hide) c.hide = true;
      out.push(c);
    });
    return out;
  }
  function replaceRange(events, a, b, repl) {
    var tot = total(events), head = sliceEvents(events, 0, a), tail = sliceEvents(events, b, Math.max(b, tot));
    if (tot < a) head.push({p: null, d: a - tot});
    if (head.length) delete head[0].tie;
    return head.concat(repl, tail);
  }

  // ---- MEI
  // One hand as MEI: for every bar the content of its layer and what follows the staves (ties, slurs, chord symbols).
  function voiceMei(sheet, bars, events, o) {
    var ka = keyAlter(sheet), bar = barLen(sheet), beat = sheet.time[1] === 8 && sheet.time[0] % 3 === 0 ? 6 : 4;
    var hasWords = o.lead && events.some(function (n) { return n.w && n.w[0]; });
    var piecesOf = {};   // event index -> its piece ids in order
    bars.forEach(function (b) { b.items.forEach(function (it) { if (it.idx >= 0) (piecesOf[it.idx] = piecesOf[it.idx] || []).push(it.id); }); });
    function spanAt(g) { if (!o.spans) return null; for (var k = o.spans.length - 1; k >= 0; k--) if (o.spans[k].g <= g) return g < o.spans[k].end ? o.spans[k].info : null; return null; }
    // with o.fill (the right hand's added notes) a melody note is a chord: the added notes below, the melody on top
    function psOf(idx) { var n = events[idx]; return o.fill && o.fill[idx] && !isRest(n) ? o.fill[idx].concat(pitchesOf(n)) : pitchesOf(n); }
    var chordOf = []; if (o.fill) { var cc = null; events.forEach(function (n, i) { if (n.ch) cc = chordInfo(n.ch); chordOf[i] = cc; }); }
    return bars.map(function (b, bi) {
      var state = {}, layer = '', extra = '', open = false;
      // 4/4: a half bar of four eighth notes is one beam, else a beam per beat
      function group(it) {
        if (bar === 16 && beat === 4) {
          var h = Math.floor(it.pos / 8), inHalf = b.items.filter(function (x) { return Math.floor(x.pos / 8) === h; });
          if (inHalf.length === 4 && inHalf.every(function (x) { return x.v === 2 && !x.rest; })) return 'h' + h;
        }
        return 'b' + Math.floor(it.pos / beat);
      }
      b.items.forEach(function (it, k) {
        var beamable = !it.rest && it.v < 4 && !it.tp, g = beamable ? group(it) : null;
        var prev = b.items[k - 1], next = b.items[k + 1];
        var withPrev = beamable && prev && !prev.rest && prev.v < 4 && !prev.tp && group(prev) === g;
        var withNext = beamable && next && !next.rest && next.v < 4 && !next.tp && group(next) === g;
        if (it.tp === 1) layer += '<tuplet num="3" numbase="2" num.visible="true" bracket.visible="true">' + (it.v < 4 && b.items.slice(k, k + 3).every(function (x) { return !x.rest; }) ? '<beam>' : '');
        if (beamable && withNext && !withPrev) { layer += '<beam>'; open = true; }
        var d = DUR[it.v], attrs = ' xml:id="' + it.id + '" dur="' + d[0] + '"' + (d[1] ? ' dots="1"' : '');
        if (it.rest) layer += '<' + (it.idx >= 0 && events[it.idx] && events[it.idx].hide ? 'space' : 'rest') + attrs + '/>';
        else {
          var n = events[it.idx], ps = psOf(it.idx), many = ps.length > 1, chord = o.lead ? chordOf[it.idx] : o.chordAt ? o.chordAt(it.pos) : spanAt(bi * bar + it.pos);
          var ids = piecesOf[it.idx], first = ids[0] === it.id, at = ids.indexOf(it.id), verses = '';
          if (first && o.lead && n.w) n.w.forEach(function (w, vi) {
            if (!w) return;
            var goes = /-$/.test(w), text = w.replace(/-$/, ''), before = false;
            for (var j = it.idx - 1; j >= 0; j--) { var pw = events[j].w && events[j].w[vi]; if (pw) { before = /-$/.test(pw); break; } }
            var wp = goes ? (before ? 'm' : 'i') : (before ? 't' : '');
            verses += '<verse n="' + (vi + 1 + (o.verseOffset || 0)) + '"><syl' + (wp ? ' wordpos="' + wp + '"' : '') + (goes ? ' con="d"' : '') + '>' + esc(text) + '</syl></verse>';
          });
          if (first && o.countLine) verses += '<verse n="' + o.countLine + '" xml:id="cv' + it.idx + '"><syl>.</syl></verse>';   // room for the counting
          var inner = '';
          ps.forEach(function (p, pi) {
            var top = o.lead && pi === ps.length - 1;   // the melody note itself
            var s = top ? spell(sheet, p, n.e) : spellInChord(sheet, p, chord), key = s.pname + s.oct, cur = key in state ? state[key] : ka[s.pname], acc = '';
            if (s.alter !== cur) { acc = ' accid="' + ACCID[s.alter] + '"'; state[key] = s.alter; }
            else if (s.alter) acc = ' accid.ges="' + ACCID_GES[s.alter] + '"';
            var pitch = ' pname="' + s.pname + '" oct="' + s.oct + '"' + acc, me = many ? it.id + 'k' + pi : it.id;
            if (many) inner += '<note xml:id="' + me + '"' + pitch + (o.lead && !top ? ' type="fill"' : '') + '/>';
            else layer += '<note' + attrs + pitch + (verses ? '>' + verses + '</note>' : '/>');
            if (at < ids.length - 1) extra += '<tie startid="#' + me + '" endid="#' + ids[at + 1] + (many ? 'k' + pi : '') + '"/>';
            else if (tied(events, it.idx + 1) && (top || !o.lead)) {   // "tie": held on from this note
              var nx = psOf(it.idx + 1), j = nx.indexOf(p);
              if (j >= 0) extra += '<tie startid="#' + me + '" endid="#' + piecesOf[it.idx + 1][0] + (nx.length > 1 ? 'k' + j : '') + '"/>';
            }
          });
          if (many) layer += '<chord' + attrs + '>' + inner + verses + '</chord>';
          // a note without a syllable is sung on the syllable before it: a slur from that note to the last such note
          if (first && hasWords && n.w && n.w[0]) {
            var last = it.idx;
            while (last + 1 < events.length && events[last + 1].p != null && !(events[last + 1].w && events[last + 1].w[0])) last++;
            var slurred = false; for (var q = it.idx + 1; q <= last; q++) if (!tied(events, q)) slurred = true;   // ties alone need no slur
            if (slurred) extra += '<slur startid="#' + it.id + '" endid="#' + piecesOf[last][0] + '"/>';
          }
        }
        if (o.lead && !o.voice2 && it.idx >= 0 && piecesOf[it.idx][0] === it.id && events[it.idx].ch)
          extra += '<harm staff="1" place="above" tstamp="' + (1 + (it.pos - (bar - b.len)) / (16 / sheet.time[1])) + '">' + esc(symbolic(events[it.idx].ch)) + '</harm>';   // as the app's sheets (tools/hymn-midi reads tstamp)
        if (open && beamable && !withNext) { layer += '</beam>'; open = false; }
        if (it.tp === 3) layer += (it.v < 4 && b.items.slice(k - 2, k + 1).every(function (x) { return !x.rest; }) ? '</beam>' : '') + '</tuplet>';
      });
      return {layer: layer, extra: extra};
    });
  }
  // One bar of the left hand as MEI, for a sheet that is not ours (the web app adds a staff to the app's sheets):
  // o = {fifths, time: [count, unit], len (the bar's length in sixteenths), shift (how late an upbeat bar starts in a
  // whole bar), events: [{p, d}] filling the bar, id (the prefix of the ids), chordAt(pos) -> the chord there, for
  // the spelling} -> {layer, extra}
  function barMei(o) {
    var sheet = {fifths: o.fifths, time: o.time, pickup: 0, notes: []}, bar = barLen(sheet), pos = o.shift || 0, items = [];
    o.events.forEach(function (e, idx) {
      pieces(bar, pos, len(e)).forEach(function (v, part) {
        items.push({id: o.id + idx + (part ? '_' + part : ''), idx: idx, v: v, pos: pos, rest: isRest(e)}); pos += v;
      });
    });
    return voiceMei(sheet, [{len: o.len, items: items}], o.events, {chordAt: o.chordAt})[0];
  }
  // The sheet as MEI, in the form of the app's sheets. opt.right: the right hand's added notes (rightHand), drawn as
  // chords under the melody; opt.left: the left hand's events, for a second staff in the
  // bass clef; opt.marks: [{t, text}] written over that staff (the page shows where a pattern starts); opt.pedal;
  // opt.countLine: keep a line free under the words (the page writes "1 & 2 &" there, between the staves).
  function toMei(sheet, opt) {
    opt = opt || {};
    var notes = sheet.notes, v2 = sheet.voice2 && sheet.voice2.length ? sheet.voice2 : null, left = opt.left && opt.left.length ? opt.left : null, f = fifths(sheet), bar = barLen(sheet);
    var need = (left || v2) ? Math.max(total(notes), left ? total(left) : 0, v2 ? total(v2) : 0) : 0;
    var bars = layout(sheet, notes, 'n', need), v2bars = v2 ? layout(sheet, v2, 'v', need) : null, lbars = left ? layout(sheet, left, 'l', need) : null;
    var nv = 1; notes.forEach(function (n) { if (n.w && n.w.length > nv) nv = n.w.length; });
    var nv2 = 0; if (v2) { nv2 = 1; v2.forEach(function (n) { if (n.w && n.w.length > nv2) nv2 = n.w.length; }); }
    var one = voiceMei(sheet, bars, notes, {lead: true, countLine: opt.countLine ? nv + nv2 + 1 : 0, fill: opt.right || null});
    var v2m = v2 ? voiceMei(sheet, v2bars, v2, {lead: true, voice2: true, verseOffset: nv}) : null;
    var two = left ? voiceMei(sheet, lbars, left, {spans: chordSpans(sheet)}) : null;
    var dirs = {}, off = gridOff(sheet);
    function dir(t, text, place, type) {
      var g = t + off, bi = Math.max(0, Math.min(bars.length - 1, Math.floor(g / bar))), b = bars[bi];
      dirs[bi] = (dirs[bi] || '') + '<dir staff="2" place="' + place + '"' + (type ? ' type="' + type + '"' : '') + ' tstamp="' +
        (1 + Math.max(0, g - bi * bar - (bar - b.len)) / (16 / sheet.time[1])) + '">' + esc(text) + '</dir>';
    }
    if (left) {
      (opt.marks || []).forEach(function (m) { dir(m.t, m.text, 'above', 'pattern'); });
      if (opt.pedal) { var lo = onsets(left), fi = -1; left.some(function (e, i) { if (!isRest(e)) { fi = i; return true; } return false; }); if (fi >= 0) dir(lo[fi], 'con pedale', 'below'); }
    }
    var x = '<?xml version="1.0" encoding="UTF-8"?>\n<mei xmlns="http://www.music-encoding.org/ns/mei" meiversion="5.0"><meiHead><fileDesc><titleStmt><title>' +
      esc(sheet.title || '') + '</title></titleStmt><pubStmt/></fileDesc></meiHead>\n<music><body><mdiv><score>\n' +
      '<scoreDef key.sig="' + (f === 0 ? '0' : Math.abs(f) + (f > 0 ? 's' : 'f')) + '" meter.count="' + sheet.time[0] + '" meter.unit="' + sheet.time[1] +
      (sheet.time[0] === 4 && sheet.time[1] === 4 ? '" meter.sym="common' : '') + '" midi.bpm="' + (sheet.tempo || 90) + '">' +
      (left ? '<staffGrp symbol="brace" bar.thru="true"><staffDef n="1" lines="5" clef.shape="G" clef.line="2"/><staffDef n="2" lines="5" clef.shape="F" clef.line="4"/></staffGrp>'
        : '<staffGrp><staffDef n="1" lines="5" clef.shape="G" clef.line="2"/></staffGrp>') + '</scoreDef>\n<section>\n';
    bars.forEach(function (b, bi) {
      var hasV2 = v2bars && v2bars[bi].items.some(function (it) { return !it.rest; });
      x += '<measure n="' + (bi + 1) + '"' + (b.len < bar ? ' metcon="false"' : '') + (bi === bars.length - 1 ? ' right="end"' : '') +
        '><staff n="1"><layer n="1">' + one[bi].layer + '</layer>' + (hasV2 ? '<layer n="2">' + v2m[bi].layer + '</layer>' : '') + '</staff>' +
        (two ? '<staff n="2"><layer n="1">' + two[bi].layer + '</layer></staff>' : '') + one[bi].extra + (hasV2 ? v2m[bi].extra : '') + (two ? two[bi].extra + (dirs[bi] || '') : '') + '</measure>\n';
    });
    return x + '</section>\n</score></mdiv></body></music></mei>';
  }

  // ---- how the accompaniment is played: how hard, how early and how long each note sounds. One source for the editor's player
  // and the viewer (tools/web/src/piano.js), so the two sound alike. Velocities are MIDI (0-127); positions are sixteenths
  // from the start of the bar (an upbeat bar counts from its first note).
  function melodyVel(pos, d, beat, layer) {   // the melody: beat 1 strongest, then the beats, then long notes, then the rest
    var onDownbeat = pos < 0.01, onBeat = Math.abs(pos % beat) < 0.01;
    return (onDownbeat ? 103 : onBeat ? 98 : d >= beat ? 96 : 90) - (layer > 1 ? 6 : 0);
  }
  function fillVel(melVel, count, fi) { return Math.round(melVel * 0.64) - (count - 1 - fi) * 3; }   // an added note under the melody
  // the left hand's events of one bar, items: [{e, pos}], bar: {nominal, beat} -> for each item (none for a rest) the notes
  // to sound [{p, vel, off (a roll, in seconds), dur}]: a grounded beat 1, a warm half bar, light weak beats and feathered
  // offbeat arpeggio notes; a moving single line swells with its contour; a chord is rolled a little, its lowest note first
  function leftDyn(items, bar) {
    var pitches = items.filter(function (x) { return x.e.p; }).map(function (x) { return x.e.p[0]; });
    var loP = pitches.length ? Math.min.apply(null, pitches) : 40, hiP = pitches.length ? Math.max.apply(null, pitches) : 60, spanP = Math.max(1, hiP - loP);
    return items.map(function (it, k) {
      var e = it.e;
      if (!e.p || !e.p.length) return null;
      var pos = it.pos, onDownbeat = pos < 0.01, onHalf = bar.nominal >= 12 && Math.abs(pos - bar.nominal / 2) < 0.01, onBeat = Math.abs(pos % bar.beat) < 0.01;
      var baseVel = e.feather
        ? (onDownbeat ? 68 : onHalf ? 58 : onBeat ? 52 : 45)
        : (onDownbeat ? 72 : onHalf ? 62 : onBeat ? 54 : 47);
      if (e.fresh) baseVel += 4;
      if (e.feather) {
        if (e.cont) baseVel -= 4;     // continuation bars breathe noticeably softer
        if (e.pause) baseVel -= 5;    // pause notes taper softly instead of intruding
        if (e.walk) baseVel += 2;     // gentle warmth on connecting bass pickup
      }
      var single = e.p.length === 1, microOff = 0;
      if (single && !onDownbeat) {
        var rel = (e.p[0] - loP) / spanP;
        if (e.feather) {
          baseVel -= Math.round(rel * 7);   // feathered upper shimmer: softer & slightly laid-back
          microOff = e.pause ? 0.008 : 0.003;
        } else {
          var prevP = k > 0 && items[k - 1].e.p ? items[k - 1].e.p[0] : e.p[0], rising = e.p[0] > prevP;
          baseVel += Math.round((rising ? 5 : -3) + rel * 4);
          microOff = onBeat ? 0.002 : (rising ? 0.005 : 0.003);
        }
      }
      var roll = e.roll != null ? e.roll : (e.p.length > 1 ? 0.012 : 0);
      if (e.up) baseVel -= 9;   // a guitar's up strum: lighter, from the top string down
      var isChordPop = !!(e.bouncy && !onDownbeat && e.p.length >= 2 && e.p[0] >= 48);
      var isSyncPush = !!(e.bouncy && !onBeat && e.p.length >= 2);
      var isBassStep = !!(e.bouncy && e.p.length === 1 && e.p[0] < 54);
      var dur = e.ring ? Math.max(e.d, e.ring - 0.35) : e.d;   // a pedal lift just before the next chord keeps the harmonies clear
      return e.p.map(function (p, pi) {
        var voiceAdj = e.pluck ? (e.p.length > 1 ? (pi === 0 && e.thumb ? 3 : -3) : (e.thumb ? 3 : -3))
          : e.inst ? 0
          : e.feather && e.p.length > 1 ? (pi === 0 ? 4 : -4 - Math.min(6, pi * 2))
          : e.p.length > 1 ? (pi === 0 ? 4 : -4 - Math.min(4, pi)) : 0;
        var d0 = e.rings && e.rings[pi] != null ? e.rings[pi] : dur;
        var minV = e.feather ? 30 : 34, maxV = e.feather ? 82 : 86;
        var vel = Math.max(minV, Math.min(maxV, baseVel + voiceAdj));
        var off = roll ? (e.up ? e.p.length - 1 - pi : pi) * roll : microOff;
        if (e.bouncy) {
          if (e.p.length > 1) off = pi * 0.006;
          if (onDownbeat) vel = Math.min(88, vel + 6);
          else if (isSyncPush) vel = Math.min(82, vel + 12);
          else if (isChordPop) vel = Math.min(78, vel + (onBeat ? 9 : 6));
          else if (onHalf && isBassStep) vel = Math.min(80, vel + 5);
          if (isChordPop && !e.ring) d0 = Math.max(0.55, Math.min(e.d * 0.62, e.d - 0.35));
          else if (onDownbeat && e.p.length >= 3 && !e.ring && pi > 0) d0 = Math.max(0.6, Math.min(e.d * 0.65, e.d - 0.35));
        }
        return {p: p, vel: vel, off: off, dur: d0};
      });
    });
  }

  // "1 & 2 &" under a note that starts at `pos` in its bar and is `v` long
  function countLabel(pos, v, beat, held) {
    var b0 = Math.floor(pos / beat) + 1, r0 = pos % beat, s;
    if (beat === 4) {
      var start = r0 === 0 ? String(b0) : r0 === 2 ? '&' : r0 === 1 ? 'e' : 'a';
      if (r0 === 0 && v === 6) s = b0 + ' & ' + (b0 + 1);
      else if (r0 === 0 && v === 3) s = b0 + ' &';
      else if (r0 === 2 && v === 4) s = '& ' + (b0 + 1);
      else if (r0 === 0 && v >= 8 && v % 4 === 0) {
        var bs = []; for (var k = 0; k < v / 4; k++) bs.push(b0 + k);
        s = bs.join('–');
      } else {
        var inner = [];
        for (var p = pos + 1; p < pos + v; p++) if (p % 4 === 0) inner.push(p / 4 + 1);
        s = inner.length ? start + '–' + inner.join('–') : start;
      }
    } else {
      var step = Math.max(1, beat / 2);
      s = r0 === 0 ? String(b0) : r0 === step ? '&' : String(b0) + '+';
    }
    return held ? '(' + s + ')' : s;
  }

  // ---- what to play: {mel: [{t, d, p, i}], fill: [{t, d, ps, i}], left: [{t, d, ps, i}], pad: [{t, d, ps}], total},
  // t and d in sixteenths
  function playList(sheet) {
    var notes = sheet.notes, tm = timing(notes), on = tm.map(function (x) { return x.t; }), mel = [], left = [], pad = [], fill = [], fills = rightHand(sheet);
    function dur(i) { return tm[i].d; }
    if (fills) fills.forEach(function (ps, i) {   // an added note lasts as long as its melody note, ties included, until the next added one
      if (!ps) return;
      var d = dur(i); for (var q = i + 1; tied(notes, q) && !fills[q]; q++) d += dur(q);
      fill.push({t: on[i], d: d, ps: ps, i: i});
    });
    notes.forEach(function (n, i) {
      if (isRest(n) || tied(notes, i)) return;
      var d = dur(i); for (var q = i + 1; tied(notes, q); q++) d += dur(q);
      mel.push({t: on[i], d: d, p: n.p, i: i});
    });
    var v2 = [], v2n = sheet.voice2 && sheet.voice2.length ? sheet.voice2 : null;
    if (v2n) {
      var vo = onsets(v2n);
      v2n.forEach(function (n, i) {
        if (isRest(n) || tied(v2n, i)) return;
        var d = len(n); for (var q = i + 1; tied(v2n, q); q++) d += len(v2n[q]);
        v2.push({t: vo[i], d: d, p: n.p, i: i});
      });
    }
    var lh = leftHand(sheet);
    if (lh) {
      var lo = onsets(lh.events);
      lh.events.forEach(function (e, i) {
        if (isRest(e) || tied(lh.events, i)) return;
        var d = len(e); for (var q = i + 1; tied(lh.events, q); q++) d += len(lh.events[q]);
        left.push({t: lo[i], d: e.ring || d, g: d, ring: e.ring, rings: e.rings, ps: pitchesOf(e), i: i, inst: e.inst, mute: e.mute, up: e.up, roll: e.roll, pluck: e.pluck, thumb: e.thumb, fresh: e.fresh, cont: e.cont, pause: e.pause, walk: e.walk, feather: e.feather, bouncy: e.bouncy});
      });
    }
    var off = gridOff(sheet);
    chordSpans(sheet).forEach(function (s) { if (s.info && s.end > s.g) pad.push({t: Math.max(0, s.g - off), d: s.end - Math.max(off, s.g), ps: chordPitches(s.ch)}); });
    // how it is played (melodyVel, fillVel, leftDyn: the same as the viewer): a note's position in its bar counts an upbeat bar
    // from its first note
    var bar = barLen(sheet), beat = beatLen(sheet), off0 = gridOff(sheet), pick = off0 > 0 ? bar - off0 : 0;
    function barOf(t) { return pick && t < pick ? 0 : Math.floor((t + off0) / bar); }
    function posOf(t) { return pick && t < pick ? t : (t + off0) % bar; }
    var fillAt = {}, feather = !!(sheet.acc && sheet.acc.feather);
    fill.forEach(function (f) { fillAt[f.i] = f; });
    mel.forEach(function (m) {
      m.vel = melodyVel(posOf(m.t), m.d, beat, 1);
      var f = fillAt[m.i];
      if (f) {
        var whisper = feather && f.ps.length === 1;
        var fillRoll = whisper ? 0.012 : f.ps.length >= 2 ? 0.01 : 0;
        if (fillRoll) m.off = f.ps.length * fillRoll;
        f.roll = fillRoll;
        f.vels = f.ps.map(function (p, fi) { return whisper ? Math.round(m.vel * 0.55) : fillVel(m.vel, f.ps.length, fi); });
      }
    });
    v2.forEach(function (m) { m.vel = melodyVel(posOf(m.t), m.d, beat, 2); });
    var byBar = {};
    left.forEach(function (l) { (byBar[barOf(l.t)] = byBar[barOf(l.t)] || []).push(l); });
    Object.keys(byBar).forEach(function (bi) {
      var items = byBar[bi], dyn = leftDyn(items.map(function (l) { return {e: {p: l.ps, d: l.g, ring: l.ring, rings: l.rings, inst: l.inst, up: l.up, roll: l.roll, pluck: l.pluck, thumb: l.thumb, fresh: l.fresh, cont: l.cont, pause: l.pause, walk: l.walk, feather: l.feather, bouncy: l.bouncy}, pos: posOf(l.t)}; }), {nominal: bar, beat: beat});
      items.forEach(function (l, k) { l.notes = dyn[k] || []; });
    });
    var acc = sheet.acc, guitar = !!(acc && (acc.guitar || /^guitar\//.test(acc.style || '')));
    return {guitar: guitar, mel: mel, v2: v2, fill: fill, left: left, pad: pad, total: Math.max(total(notes), v2n ? total(v2n) : 0, lh ? total(lh.events) : 0)};
  }

  return {guitarShape: guitarShape, symbolic: symbolic, KEYS: KEYS, PC: PC, DUR: DUR, DUR_BUTTONS: DUR_BUTTONS, ROOTS: ROOTS, QUALITIES: QUALITIES, FLAT_NAMES: FLAT_NAMES, SHARP_NAMES: SHARP_NAMES,
    mod12: mod12, esc: esc, len: len, isRest: isRest, pitchesOf: pitchesOf, samePitches: samePitches,
    splitChord: splitChord, composeChord: composeChord, trChord: trChord, chordInfo: chordInfo, chordPitches: chordPitches,
    tonicPc: tonicPc, fifths: fifths, keyAlter: keyAlter, scalePcs: scalePcs, spell: spell, spellInChord: spellInChord, noteName: noteName, keyChords: keyChords,
    barLen: barLen, beatLen: beatLen, gridOff: gridOff, meter: meter, onsets: onsets, total: total, tied: tied, pieces: pieces, layout: layout,
    chordSpans: chordSpans, chordFit: chordFit, parsePattern: parsePattern, patternText: patternText, voicing: voicing, styles: styles,
    findStyle: findStyle, styleName: styleName, rightHand: rightHand, fillUnder: fillUnder, chordsOnBeat: chordsOnBeat,
    accompany: accompany, accompanyOn: accompanyOn, barMei: barMei, leftHand: leftHand, sliceEvents: sliceEvents, replaceRange: replaceRange,
    toMei: toMei, countLabel: countLabel, playList: playList, melodyVel: melodyVel, fillVel: fillVel, leftDyn: leftDyn, fixTriplets: fixTriplets, triplets: triplets, tripSplit: tripSplit, TRIP: TRIP, timing: timing};
});
