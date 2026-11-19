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
    events.forEach(function (n, idx) { put(idx, isRest(n), len(n)); placed += len(n); });
    if (minTotal > placed) put(-1, true, minTotal - placed);   // the other hand goes on longer
    if (pos < cur.len && cur.items.length) put(-1, true, cur.len - pos);   // fill the last bar with rests
    return bars;
  }

  // ---- the chords in time
  // [{i (note), ch, info, g, end}]: where each chord sounds for the left hand. The left hand moves on the beat: a chord
  // on a note that starts off the beat and is held over the next beat (an anticipation) starts with that beat, any
  // other off-beat chord with the beat it is in.
  function chordSpans(sheet) {
    var notes = sheet.notes, on = onsets(notes), off = gridOff(sheet), beat = beatLen(sheet), bar = barLen(sheet), out = [];
    notes.forEach(function (n, i) {
      if (!n.ch) return;
      var g = on[i] + off, r = g % beat;
      if (r) {
        var held = len(n); for (var q = i + 1; tied(notes, q); q++) held += len(notes[q]);
        g = (!isRest(n) && g + held > g - r + beat) ? g - r + beat : g - r;
      }
      if (out.length && g <= out[out.length - 1].g) { if (g < out[out.length - 1].g) g = out[out.length - 1].g; out.pop(); }
      out.push({i: i, ch: n.ch, info: chordInfo(n.ch), g: g});
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
    var out = notes.map(function (n, i) {
      if (n.ch) chord = chordInfo(n.ch);
      if (isRest(n)) return null;
      var ps = null;
      if (Array.isArray(n.h)) ps = n.h.filter(function (p) { return p < n.p; });
      else if (rh && rh.add > 0 && chord) {
        var d = len(n), g = on[i] + off; for (var q = i + 1; tied(notes, q); q++) d += len(notes[q]);
        var want = rh.on === 'all' ? true : rh.on === 'chord' ? !!n.ch : rh.on === 'long' ? d >= 2 * beat : g % beat === 0 || d >= 2 * beat;
        if (want) ps = fillUnder(n.p, chord, rh.add);
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
  function chordsOnBeat(chords, bars, sound, endG) {
    var out = [];
    chords.forEach(function (c) {
      var k = 0; while (k < bars.length - 1 && bars[k + 1].g <= c.g + 1e-6) k++;
      var beat = bars[k].beat, r = (c.g - bars[k].g) % beat, g = c.g;
      if (r > 1e-6) {
        var held = sound.some(function (m) { return Math.abs(m[0] - c.g) < 0.01 && m[1] > c.g - r + beat + 0.01; });
        g = held ? c.g - r + beat : c.g - r;
      }
      g = Math.round(g);
      if (out.length && g <= out[out.length - 1].g) { if (g < out[out.length - 1].g) g = out[out.length - 1].g; out.pop(); }
      out.push({g: g, ch: c.ch, info: chordInfo(c.ch)});
    });
    out.forEach(function (x, i) { x.end = i + 1 < out.length ? out[i + 1].g : Math.max(endG, x.g); });
    return out;
  }

  // ---- the left hand from the chords
  // A pattern is steps on a grid of `rate` sixteenths (0: one step, held): "1 5 8 5", "1 c c", "1+5 - - c | c".
  //   1 3 5 7 8 10 12  the chord's notes counted up from the bass (8 the octave, 10 the third above it)
  //   c  C             the chord in the middle of the keyboard: c two notes (third + fifth or seventh), C all of them
  //   a+b              together;  -  the step before goes on;  .  silence
  //   A | B            A in the bar where the chord starts, B in the bars it goes on in
  function parsePattern(str) {
    var parts = String(str || '').split('|').map(function (part) {
      return part.trim().split(/\s+/).filter(Boolean).map(function (st) {
        if (st === '-' || st === '_') return {hold: true};
        var toks = st.split('+').filter(function (x) { return /^(1|3|5|7|8|10|12|c|C)$/.test(x); });
        return toks.length ? {toks: toks} : {rest: true};
      });
    }).filter(function (p) { return p.length; });
    return parts.some(function (p) { return p.some(function (s) { return s.toks; }); }) ? parts : [];
  }
  function patternText(parts) {
    return parts.map(function (p) { return p.map(function (s) { return s.hold ? '-' : s.rest ? '.' : s.toks.join('+'); }).join(' '); }).join(' | ');
  }
  // the pitches of every token for one chord; `low` is the lowest bass note allowed (MIDI, 40 = E2, the default: lower sounds muddy and distorts on a phone; the bass is the first
  // such note from there up)
  function voicing(c, low, parts) {
    var pcs = c.tones.map(function (t) { return mod12(c.root + t[0]); }), nt = pcs.length;
    var used = {}; parts.forEach(function (p) { p.forEach(function (s) { (s.toks || []).forEach(function (t) { used[t] = true; }); }); });
    function ladder(bass) {   // the chord's notes upwards from the bass
      var out = [bass], p = bass;
      while (out.length < nt + 4) { p++; if (pcs.indexOf(mod12(p)) >= 0) out.push(p); }
      return out;
    }
    function at(lad, d) { return lad[d < 8 ? {1: 0, 3: 1, 5: 2, 7: Math.min(3, nt)}[d] : nt + {8: 0, 10: 1, 12: 2}[d]]; }
    low = low == null ? 40 : low;
    var bass = low + mod12(c.bass - low), degs = Object.keys(used).filter(function (t) { return /\d/.test(t); }).map(Number);
    var lad = ladder(bass), out = {};
    degs.forEach(function (d) { out[d] = [at(lad, d)]; });
    function middle(ivs) { return ivs.map(function (iv) { return 52 + mod12(c.root + iv - 52); }).sort(function (a, b) { return a - b; }); }   // E3..D#4
    if (used.c) out.c = middle([c.tones[1][0], c.tones[c.seventh ? 3 : 2][0]]);
    if (used.C) out.C = middle(c.tones.map(function (t) { return t[0]; }));
    return out;
  }
  function meter(sheet) { var bar = barLen(sheet), beat = beatLen(sheet); return {bar: bar, beat: beat, beats: Math.round(bar / beat), compound: compound(sheet)}; }
  var ARP = [
    ['open', 'Open', 'root, fifth, octave', {2: '1 5', 3: '1 5 8', 4: '1 5 8 5', 6: '1 5 8 5 8 5'}, 40],
    ['wide', 'Wide', 'up to the tenth', {2: '1 5', 3: '1 5 10', 4: '1 5 10 5', 6: '1 5 8 10 8 5', 8: '1 5 8 10 12 10 8 5'}, 40],
    ['broken', 'Broken chord', 'root, third, fifth', {2: '1 5', 3: '1 3 5', 4: '1 3 5 3', 6: '1 3 5 3 5 3'}, 43],
    ['alberti', 'Alberti', 'low, high, middle, high', {2: '1 5', 3: '1 5 3', 4: '1 5 3 5', 6: '1 5 3 5 3 5'}, 43],
    ['rise', 'Rise and hold', 'up, then held', {2: '1 5', 3: '1 5 8', 4: '1 5 8 -', 6: '1 5 8 - - -', 8: '1 5 8 10 - - - -'}, 36]];
  function arpPattern(shape, steps) {
    var t = shape[3];
    if (t[steps]) return t[steps];
    if (steps % 3 === 0) return steps % 6 === 0 ? t[6] : t[3];
    return steps === 2 ? t[2] : steps % 8 === 0 && t[8] && steps > 8 ? t[8] : t[4];
  }
  // The styles the page offers, for this sheet's time signature. Each choice is {id, name, pat, rate, low}.
  function styles(sheet) {
    var m = meter(sheet), beat = m.beat, n = m.beats, half = n % 2 === 0 && n > 2 ? m.bar / 2 : 0;
    function strikes(pat, low, id, name, hint) {
      var rh = [[0, 'held', 'Held']]; if (half) rh.push([half, 'half', 'Twice a bar']); rh.push([beat, 'beat', 'Every beat']);
      return {id: id, name: name, hint: hint, rhythms: rh.map(function (r) { return {id: r[1], name: r[2], pat: pat, rate: r[0], low: low}; })};
    }
    var bc;
    if (m.compound) bc = [['bcc', 'Bass, chord, chord', '1 c c', 2], ['long', 'Bass and chord', '1 - - c - -', 2], ['alt', 'Root and fifth', '1 c c 5 c c', 2]];
    else if (n === 3) bc = [['waltz', 'Waltz', '1 c c', beat], ['slow', 'Bass, then chord', '1 - c', beat], ['pulse', 'Waltz in eighths', '1 - c - c -', beat / 2]];
    else if (n === 2) bc = [['oom', 'Bass, chord', '1 c', beat], ['pulse', 'In eighths', '1 c 5 c', beat / 2]];
    else bc = [['alt', 'Root and fifth', '1 c 5 c', beat], ['bcc', 'Bass and chords', '1 c c c', beat], ['slow', 'Slow', '1 - c -', beat], ['pulse', 'In eighths', '1 - c - 5 - c -', beat / 2]];
    var rates = m.compound ? [[2, '8', 'Eighths'], [1, '16', 'Sixteenths']] : [[beat, '4', beat === 4 ? 'Quarters' : 'On the beat'], [beat / 2, '8', beat === 4 ? 'Eighths' : 'Twice a beat'], [beat / 4, '16', beat === 4 ? 'Sixteenths' : 'Four a beat']];
    rates = rates.filter(function (r) { return r[0] >= 1 && r[0] === Math.round(r[0]); });
    return [
      {id: 'strike', name: 'Strike', hint: 'the chord in one stroke', kinds: [
        strikes('1+5', 41, 'two', 'Two notes', 'root and fifth'),
        strikes('1+3+5', 43, 'three', 'Three notes', 'the whole triad'),
        strikes('1+5+8', 40, 'open', 'Open', 'root, fifth, octave'),
        strikes('1+5 | c', 41, 'hymn', 'Hymn', 'low at the chord, higher while it lasts')]},
      {id: 'bass', name: 'Bass + chord', hint: 'a bass note, then the chord', kinds: bc.filter(function (b) { return b[3] >= 1 && b[3] === Math.round(b[3]); }).map(function (b) {
        return {id: b[0], name: b[1], hint: b[2], rhythms: [{id: 'x', name: '', pat: b[2], rate: b[3], low: 40}]};
      })},
      {id: 'arp', name: 'Arpeggio', hint: 'the chord one note at a time', kinds: ARP.map(function (a) {
        return {id: a[0], name: a[1], hint: a[2], rhythms: rates.map(function (r) {
          return {id: r[1], name: r[2], pat: arpPattern(a, Math.round(m.bar / r[0])), rate: r[0], low: a[4]};
        })};
      })}];
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
    return fam.id === 'bass' ? k.name : fam.name + ': ' + k.name.toLowerCase() + (r.name ? ', ' + r.name.toLowerCase() : '');
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
    var bars = []; for (var b = 0; b < endG; b += bar) bars.push({g: b, len: bar});
    var fills = rightHand(sheet), mel = [], last = -1;   // the right hand: the melody, or the lowest note added under it
    notes.forEach(function (n, i) { if (!isRest(n)) mel.push([on[i] + off, on[i] + off + len(n), fills && fills[i] ? fills[i][0] : n.p]); });
    for (var i = notes.length - 1; i >= 0; i--) if (!isRest(notes[i]) && !tied(notes, i)) { last = on[i] + off; break; }
    var out = accompanyOn({bars: bars, first: first, chords: spans, mel: mel, last: last, base: base, changes: changes});
    var events = [];
    function push(p, d, ring) {
      var prev = events[events.length - 1];
      if (!p && prev && !prev.p) { prev.d += d; return; }
      var e = {p: p, d: d}; if (ring) e.ring = ring; events.push(e);
    }
    if (first) push(null, first - off);   // the upbeat
    out.events.forEach(function (e) { push(e.p, e.d, e.ring); });
    return {events: events, marks: out.marks.map(function (m) { return {t: m.g - off, a: m.a, song: m.song}; }), changes: changes};
  }
  // The left hand over any music, bar by bar (accompany above gives it a lead sheet; the web app a sheet of the app). tl:
  //   bars: [{g, len}]              every bar's start and length in sixteenths; g counts from the first bar line
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
    var lastBar = tl.last >= 0 ? barAt(tl.last) : -1, events = [], marks = [], lastA = null;
    at.forEach(function (a, k) {
      var z = k + 1 < at.length ? at[k + 1] : endG, sp = spanAt(a), acc = patAt(a), parts = acc ? parsePattern(acc.pat) : [];
      if (z <= a) return;
      if (acc !== lastA) { marks.push({g: a, a: acc, song: acc === base}); lastA = acc; }
      if (!sp || !sp.info || !parts.length) { events.push({g: a, d: z - a, p: null}); return; }
      var bi = barAt(a), barStart = bars[bi].g, fresh = sp.g >= barStart || barStart === first && sp.g < first;
      var steps = parts[fresh ? 0 : Math.min(1, parts.length - 1)], rate = acc.rate | 0;
      // what is played when in this stretch: [{toks | null, g, d}]
      var plan = [];
      if (acc.end !== false && rate && sp === spans[spans.length - 1] && bi >= lastBar && lastBar >= 0) {
        var all = ['1', '5']; steps.forEach(function (s) { (s.toks || []).forEach(function (t) { if (/^[378]$/.test(t) && all.indexOf(t) < 0) all.push(t); }); });   // one hand can hold it
        plan.push({toks: all, g: a, d: z - a});
      } else if (!rate) plan.push({toks: steps[0].toks || null, g: a, d: z - a});
      else for (var t = a, q = 0; t < z; t += rate, q++) {
        var s = steps[q % steps.length], d = Math.min(rate, z - t), last = plan[plan.length - 1];
        if (s.hold && last && last.toks) last.d += d; else plan.push({toks: s.toks || null, g: t, d: d});
      }
      // the figure counted up from the bass and the chord in the middle each go down an octave, whole, where one of
      // their notes would reach the melody
      var v = voicing(sp.info, acc.low, [[{toks: ['1', '3', '5', '7', '8', '10', '12', 'c', 'C']}]]), shift = {fig: 0, mid: 0};
      function layer(t) { return /\d/.test(t) ? 'fig' : 'mid'; }
      ['fig', 'mid'].forEach(function (L) {
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
      plan.forEach(function (st) {
        var o = [];
        (st.toks || []).forEach(function (t) { v[t].forEach(function (p) { p -= 12 * shift[layer(t)]; if (o.indexOf(p) < 0) o.push(p); }); });
        var e = {g: st.g, d: st.d, p: o.length ? o.sort(function (x, y) { return x - y; }) : null};
        if (e.p && acc.pedal && rate && z - st.g > st.d) e.ring = z - st.g;
        events.push(e);
      });
    });
    return {events: events, marks: marks};
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
      var c = {p: isRest(e) ? null : pitchesOf(e), d: Math.min(z, b) - Math.max(s, a)};
      if (!isRest(e) && (s < a || e.tie)) c.tie = true;
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
        var beamable = !it.rest && it.v < 4, g = beamable ? group(it) : null;
        var prev = b.items[k - 1], next = b.items[k + 1];
        var withPrev = beamable && prev && !prev.rest && prev.v < 4 && group(prev) === g;
        var withNext = beamable && next && !next.rest && next.v < 4 && group(next) === g;
        if (beamable && withNext && !withPrev) { layer += '<beam>'; open = true; }
        var d = DUR[it.v], attrs = ' xml:id="' + it.id + '" dur="' + d[0] + '"' + (d[1] ? ' dots="1"' : '');
        if (it.rest) layer += '<rest' + attrs + '/>';
        else {
          var n = events[it.idx], ps = psOf(it.idx), many = ps.length > 1, chord = o.lead ? chordOf[it.idx] : o.chordAt ? o.chordAt(it.pos) : spanAt(bi * bar + it.pos);
          var ids = piecesOf[it.idx], first = ids[0] === it.id, at = ids.indexOf(it.id), verses = '';
          if (first && o.lead && n.w) n.w.forEach(function (w, vi) {
            if (!w) return;
            var goes = /-$/.test(w), text = w.replace(/-$/, ''), before = false;
            for (var j = it.idx - 1; j >= 0; j--) { var pw = events[j].w && events[j].w[vi]; if (pw) { before = /-$/.test(pw); break; } }
            var wp = goes ? (before ? 'm' : 'i') : (before ? 't' : '');
            verses += '<verse n="' + (vi + 1) + '"><syl' + (wp ? ' wordpos="' + wp + '"' : '') + (goes ? ' con="d"' : '') + '>' + esc(text) + '</syl></verse>';
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
        if (o.lead && it.idx >= 0 && piecesOf[it.idx][0] === it.id && events[it.idx].ch)
          extra += '<harm staff="1" place="above" tstamp="' + (1 + (it.pos - (bar - b.len)) / (16 / sheet.time[1])) + '">' + esc(symbolic(events[it.idx].ch)) + '</harm>';   // as the app's sheets (tools/hymn-midi reads tstamp)
        if (open && beamable && !withNext) { layer += '</beam>'; open = false; }
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
    var notes = sheet.notes, left = opt.left && opt.left.length ? opt.left : null, f = fifths(sheet), bar = barLen(sheet);
    var need = left ? Math.max(total(notes), total(left)) : 0;
    var bars = layout(sheet, notes, 'n', need), lbars = left ? layout(sheet, left, 'l', need) : null;
    var nv = 1; notes.forEach(function (n) { if (n.w && n.w.length > nv) nv = n.w.length; });
    var one = voiceMei(sheet, bars, notes, {lead: true, countLine: opt.countLine ? nv + 1 : 0, fill: opt.right || null}), two = left ? voiceMei(sheet, lbars, left, {spans: chordSpans(sheet)}) : null;
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
      x += '<measure n="' + (bi + 1) + '"' + (b.len < bar ? ' metcon="false"' : '') + (bi === bars.length - 1 ? ' right="end"' : '') +
        '><staff n="1"><layer n="1">' + one[bi].layer + '</layer></staff>' +
        (two ? '<staff n="2"><layer n="1">' + two[bi].layer + '</layer></staff>' : '') + one[bi].extra + (two ? two[bi].extra + (dirs[bi] || '') : '') + '</measure>\n';
    });
    return x + '</section>\n</score></mdiv></body></music></mei>';
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
    var notes = sheet.notes, on = onsets(notes), mel = [], left = [], pad = [], fill = [], fills = rightHand(sheet);
    if (fills) fills.forEach(function (ps, i) {   // an added note lasts as long as its melody note, ties included, until the next added one
      if (!ps) return;
      var d = len(notes[i]); for (var q = i + 1; tied(notes, q) && !fills[q]; q++) d += len(notes[q]);
      fill.push({t: on[i], d: d, ps: ps, i: i});
    });
    notes.forEach(function (n, i) {
      if (isRest(n) || tied(notes, i)) return;
      var d = len(n); for (var q = i + 1; tied(notes, q); q++) d += len(notes[q]);
      mel.push({t: on[i], d: d, p: n.p, i: i});
    });
    var lh = leftHand(sheet);
    if (lh) {
      var lo = onsets(lh.events);
      lh.events.forEach(function (e, i) {
        if (isRest(e) || tied(lh.events, i)) return;
        var d = len(e); for (var q = i + 1; tied(lh.events, q); q++) d += len(lh.events[q]);
        left.push({t: lo[i], d: e.ring || d, ps: pitchesOf(e), i: i});
      });
    }
    var off = gridOff(sheet);
    chordSpans(sheet).forEach(function (s) { if (s.info && s.end > s.g) pad.push({t: Math.max(0, s.g - off), d: s.end - Math.max(off, s.g), ps: chordPitches(s.ch)}); });
    return {mel: mel, fill: fill, left: left, pad: pad, total: Math.max(total(notes), lh ? total(lh.events) : 0)};
  }

  return {symbolic: symbolic, KEYS: KEYS, PC: PC, DUR: DUR, DUR_BUTTONS: DUR_BUTTONS, ROOTS: ROOTS, QUALITIES: QUALITIES, FLAT_NAMES: FLAT_NAMES, SHARP_NAMES: SHARP_NAMES,
    mod12: mod12, esc: esc, len: len, isRest: isRest, pitchesOf: pitchesOf, samePitches: samePitches,
    splitChord: splitChord, composeChord: composeChord, trChord: trChord, chordInfo: chordInfo, chordPitches: chordPitches,
    tonicPc: tonicPc, fifths: fifths, keyAlter: keyAlter, scalePcs: scalePcs, spell: spell, spellInChord: spellInChord, noteName: noteName, keyChords: keyChords,
    barLen: barLen, beatLen: beatLen, gridOff: gridOff, meter: meter, onsets: onsets, total: total, tied: tied, pieces: pieces, layout: layout,
    chordSpans: chordSpans, chordFit: chordFit, parsePattern: parsePattern, patternText: patternText, voicing: voicing, styles: styles,
    findStyle: findStyle, styleName: styleName, rightHand: rightHand, fillUnder: fillUnder, chordsOnBeat: chordsOnBeat,
    accompany: accompany, accompanyOn: accompanyOn, barMei: barMei, leftHand: leftHand, sliceEvents: sliceEvents, replaceRange: replaceRange,
    toMei: toMei, countLabel: countLabel, playList: playList};
});
