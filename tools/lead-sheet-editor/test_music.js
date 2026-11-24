// Tests of music.js, the editor's logic.  usage: node tools/lead-sheet-editor/test_music.js
// Checks the bars, the MEI (also through the app's Verovio, when it is there) and the left hand the patterns give.
'use strict';
const fs = require('fs'), path = require('path'), assert = require('assert');
const M = require('./music.js');
const NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
const nm = p => NAMES[p % 12] + (Math.floor(p / 12) - 1);
const show = events => events.map(e => (e.p ? e.p.map(nm).join('+') : 'r') + '/' + e.d).join(' ');
let count = 0;
function test(name, fn) { fn(); count++; console.log('ok  ' + name); }

// G major, 4/4, an upbeat of one eighth; four bars: G | C D | Em (two bars)
function song() {
  return {title: 'Test', key: 'G', mode: 'major', time: [4, 4], tempo: 90, pickup: 2, notes: [
    {p: 62, d: 2, w: ['A']},
    {p: 67, d: 4, w: ['song'], ch: 'G'}, {p: 71, d: 4, w: ['of']}, {p: 74, d: 8, w: ['praise']},
    {p: 76, d: 8, w: ['to'], ch: 'C'}, {p: 74, d: 8, w: ['Thee'], ch: 'D'},
    {p: 71, d: 16, w: ['we'], ch: 'Em'},
    {p: 67, d: 16, w: ['bring']}]};
}
// every staff of every measure of an MEI text: its length in sixteenths
function barSums(mei) {
  return mei.split('<measure ').slice(1).map(m => m.split('<staff ').slice(1).map(s => {
    let t = 0;
    for (const e of s.split('</staff>')[0].matchAll(/<(?:note|rest|chord) xml:id="([^"]+)" dur="(\d+)"( dots="1")?/g)) if (!/k\d+$/.test(e[1])) t += 16 / +e[2] * (e[3] ? 1.5 : 1);
    return t;
  }));
}

test('chords: what a symbol means', () => {
  assert.deepStrictEqual(M.chordInfo('G').tones.map(t => t[0]), [0, 4, 7]);
  assert.deepStrictEqual(M.chordInfo('Am7').tones.map(t => t[0]), [0, 3, 7, 10]);
  assert.deepStrictEqual(M.chordInfo('Dsus4').tones.map(t => t[0]), [0, 5, 7]);
  assert.deepStrictEqual(M.chordInfo('Bdim7').tones.map(t => t[0]), [0, 3, 6, 9]);
  assert.strictEqual(M.chordInfo('G/B').bass, 11);
  assert.strictEqual(M.chordInfo('N.C.'), null);
  assert.strictEqual(M.trChord('Bb/D', 2), 'C/E');
  assert.strictEqual(M.trChord('G/B', -1, true), 'Gb/Bb');
  assert.strictEqual(M.symbolic('C#m/G#'), 'C♯m/G♯');   // the app's sheets write ♯ and ♭ (the guitar view moves the chords by them)
  assert.strictEqual(M.symbolic('Bbmaj7/Eb'), 'B♭maj7/E♭');
  assert.strictEqual(M.trChord('Eb', 7, true), 'Bb');
  assert.strictEqual(M.trChord('C', 1, false), 'C#');
});

test('the lead sheet: bars add up, upbeat first', () => {
  const mei = M.toMei(song());
  assert.deepStrictEqual(barSums(mei), [[2], [16], [16], [16], [16]]);
  assert.ok(mei.includes('<staffGrp><staffDef n="1" lines="5" clef.shape="G" clef.line="2"/></staffGrp>'));
  assert.ok(mei.includes('<harm staff="1" place="above" tstamp="1">G</harm>'));
  assert.ok(!mei.includes('staff n="2"'));
});

test('chords move the left hand on the beat', () => {
  const s = song();
  s.notes = [{p: 67, d: 14, ch: 'G'}, {p: 69, d: 4, ch: 'C'}, {p: 67, d: 14}, {p: 66, d: 3, ch: 'D'}, {p: 67, d: 13}]; s.pickup = 0;
  const sp = M.chordSpans(s);
  // C sits on the last eighth of bar 1 and is held over the bar line: it starts with bar 2.
  // D sits on a sixteenth after beat 1 of bar 3 and ends before beat 2: it starts with that beat 1.
  assert.deepStrictEqual(sp.map(x => [x.ch, x.g, x.end]), [['G', 0, 16], ['C', 16, 32], ['D', 32, 48]]);
});

test('patterns: text to steps', () => {
  assert.strictEqual(M.patternText(M.parsePattern('1  5 8 5')), '1 5 8 5');
  assert.strictEqual(M.patternText(M.parsePattern('1+5 - - c | c')), '1+5 - - c | c');
  assert.strictEqual(M.patternText(M.parsePattern('1 x 5 .')), '1 . 5 .');
  assert.deepStrictEqual(M.parsePattern(''), []);
  assert.deepStrictEqual(M.parsePattern('- . -'), []);
});

test('arpeggio: restarts with every chord, empty upbeat, held last bar', () => {
  const s = song(); s.acc = {pat: '1 5 8 5', rate: 2, low: 36};
  const lh = M.accompany(s);
  assert.strictEqual(show(lh.events),
    'r/2 G2/2 D3/2 G3/2 D3/2 G2/2 D3/2 G3/2 D3/2 ' +          // G
    'C2/2 G2/2 C3/2 G2/2 D2/2 A2/2 D3/2 A2/2 ' +              // C, D: half a bar each
    'E2/2 B2/2 E3/2 B2/2 E2/2 B2/2 E3/2 B2/2 ' +              // Em
    'E2+B2+E3/16');                                           // the last bar: one held chord
  s.acc.end = false;
  assert.ok(show(M.accompany(s).events).endsWith('E2/2 B2/2 E3/2 B2/2 E2/2 B2/2 E3/2 B2/2'));
  assert.deepStrictEqual(barSums(M.toMei(s, {left: lh.events})), [[2, 2], [16, 16], [16, 16], [16, 16], [16, 16]]);
});

test('hymn style: low where the chord starts, the chord higher while it lasts', () => {
  const s = song(); s.acc = {pat: '1+5 | c', rate: 0, low: 41};
  assert.strictEqual(show(M.accompany(s).events), 'r/2 G2+D3/16 C3+G3/8 D3+A3/8 E3+B3/16 G3+B3/16');
});

test('bass and chord: holds, rests and the chord in the middle', () => {
  const s = song(); s.acc = {pat: '1 - c .', rate: 4, low: 36, end: false};
  assert.strictEqual(show(M.accompany(s).events).split(' ').slice(0, 4).join(' '), 'r/2 G2/8 B3+D4/4 r/4');
});

test('the left hand stays under the melody', () => {
  const s = song(); s.acc = {pat: '1 5 8 10', rate: 4, low: 48};
  s.notes.forEach(n => { n.p -= 12; });   // a low melody: G3, B3, D4 ...
  const lh = M.accompany(s), on = M.onsets(lh.events), mon = M.onsets(s.notes);
  lh.events.forEach((e, i) => (e.p || []).forEach(p => s.notes.forEach((n, k) => {
    if (mon[k] < on[i] + e.d && mon[k] + n.d > on[i]) assert.ok(p < n.p, nm(p) + ' under ' + nm(n.p));
  })));
});

test('a change from a note on, and for one bar only', () => {
  const s = song(); s.acc = {pat: '1+5', rate: 0, low: 41};
  s.notes[4].lh = {pat: '1 5 8 5', rate: 4, low: 36, 'for': 'bar'};   // bar 3 alone
  let lh = M.accompany(s);
  assert.strictEqual(show(lh.events), 'r/2 G2+D3/16 C2/4 G2/4 D2/4 A2/4 E3+B3/16 E3+B3/16');
  assert.deepStrictEqual(lh.marks.map(m => m.t), [2, 18, 34]);   // the song's pattern, the change, the song's pattern again
  delete s.notes[4].lh['for'];                                        // from bar 3 on
  lh = M.accompany(s);
  assert.strictEqual(show(lh.events), 'r/2 G2+D3/16 C2/4 G2/4 D2/4 A2/4 E2/4 B2/4 E3/4 B2/4 E2+B2+E3/16');
  s.notes[6].lh = {pat: ''};                                          // and silent from bar 4 on
  assert.ok(show(M.accompany(s).events).endsWith('A2/4 r/32'));
});

test('every style of every time signature gives whole bars', () => {
  [[4, 4], [3, 4], [2, 4], [6, 8], [9, 8], [2, 2], [5, 4]].forEach(time => {
    const s = song(); s.time = time; s.pickup = 0;
    const bar = M.barLen(s);
    M.styles(s).forEach(f => f.kinds.forEach(k => k.rhythms.forEach(r => {
      s.acc = {pat: r.pat, rate: r.rate, low: r.low, style: f.id + '/' + k.id};
      const lh = M.accompany(s), where = time.join('/') + ' ' + f.id + '/' + k.id + '/' + r.id;
      assert.ok(M.findStyle(s, s.acc), 'found again: ' + where);
      barSums(M.toMei(s, {left: lh.events})).forEach(x => assert.deepStrictEqual(x, [bar, bar], where));
      lh.events.forEach(e => (e.p || []).forEach(p => assert.ok(p >= 24 && p <= 67, where + ' ' + nm(p))));
    })));
  });
});

test('spelling follows the chord', () => {
  const s = song(); s.key = 'F'; s.notes = [{p: 69, d: 16, ch: 'D7'}, {p: 70, d: 16, ch: 'Gm'}]; s.pickup = 0;
  s.acc = {pat: '1+3+5', rate: 0, low: 43};
  const mei = M.toMei(s, {left: M.accompany(s).events});
  assert.ok(/pname="f" oct="3" accid="s"/.test(mei), 'F sharp in D7, not G flat');
  assert.ok(/pname="b" oct="2" accid.ges="f"/.test(mei), 'B flat from the key signature');
});

test('the right hand: notes of the chord under the melody', () => {
  const s = song(), fills = () => (M.rightHand(s) || []).map(f => f ? f.map(nm).join('+') : '-').join(' ');
  assert.strictEqual(M.rightHand(s), null);
  s.rh = {add: 1, on: 'chord'};        // the nearest note of the chord from a third below: D4 under G4 (G), C5 under E5 (C) ...
  assert.strictEqual(fills(), '- D4 - - C5 A4 G4 -');
  s.rh = {add: 1, on: 'beat'};         // every note here starts on a beat, but the upbeat has no chord yet
  assert.strictEqual(fills(), '- D4 G4 B4 C5 A4 G4 E4');
  s.rh = {add: 2, on: 'long'};         // two beats or more
  assert.strictEqual(fills(), '- - - G4+B4 G4+C5 F#4+A4 E4+G4 B3+E4');
  s.notes[3].h = [67]; s.notes[4].h = [];   // by hand: one note, and none
  assert.strictEqual(fills(), '- - - G4 - F#4+A4 E4+G4 B3+E4');
  const mei = M.toMei(s, {right: M.rightHand(s)});
  assert.ok(mei.includes('<chord xml:id="n3" dur="2"><note xml:id="n3k0" pname="g" oct="4" type="fill"/><note xml:id="n3k1" pname="d" oct="5"/><verse n="1"><syl>praise</syl></verse></chord>'));
  assert.deepStrictEqual(barSums(mei), [[2], [16], [16], [16], [16]]);
  assert.strictEqual(M.toMei(s), M.toMei(song()));   // the lead sheet does not know of it
  assert.deepStrictEqual(M.playList(s).fill.map(f => [f.t, f.d, f.ps.length]), [[10, 8, 1], [26, 8, 2], [34, 16, 2], [50, 16, 2]]);
  // the left hand stays under the lowest added note
  s.acc = {pat: '1 5 8 10', rate: 4, low: 48, end: false};
  const lh = M.accompany(s).events, on = M.onsets(lh), mon = M.onsets(s.notes), f = M.rightHand(s);
  lh.forEach((e, i) => (e.p || []).forEach(p => s.notes.forEach((n, k) => {
    if (mon[k] < on[i] + e.d && mon[k] + n.d > on[i]) assert.ok(p < (f[k] ? f[k][0] : n.p), nm(p) + ' under the right hand');
  })));
});

test('any music, bar by bar: uneven bars, chords off the beat, the spellings of the app\'s sheets', () => {
  assert.deepStrictEqual(M.chordInfo('B°7').tones.map(t => t[0]), [0, 3, 6, 9]);
  assert.deepStrictEqual(M.chordInfo('CM7').tones.map(t => t[0]), [0, 4, 7, 11]);
  assert.deepStrictEqual(M.chordInfo('C+').tones.map(t => t[0]), [0, 4, 8]);
  assert.deepStrictEqual(M.chordInfo('C add9').tones.map(t => t[0]), [0, 4, 7]);
  assert.strictEqual(M.chordInfo('B♭m7/D♭').bass, 1);
  // an upbeat of a quarter, a bar of 4/4, a bar cut in two as at a repeat (3 quarters + 1), a last bar
  const bars = [{g: 0, len: 4, beat: 4}, {g: 4, len: 16, beat: 4}, {g: 20, len: 12, beat: 4}, {g: 32, len: 4, beat: 4}, {g: 36, len: 16, beat: 4}];
  const sound = [[0, 4], [4, 18], [18, 24], [24, 36], [36, 52]];
  // F comes in an eighth before the bar line on a note held over it: it starts with the bar. G7 sits a sixteenth
  // after its beat with no note to hold it: it starts on that beat.
  const chords = M.chordsOnBeat([{g: 4, ch: 'C'}, {g: 18, ch: 'F'}, {g: 33, ch: 'G7'}, {g: 36, ch: 'C'}], bars, sound, 52);
  assert.deepStrictEqual(chords.map(c => [c.ch, c.g, c.end]), [['C', 4, 20], ['F', 20, 32], ['G7', 32, 36], ['C', 36, 52]]);
  const lh = M.accompanyOn({bars, first: 4, chords, mel: [[0, 52, 72]], last: 36, base: {pat: '1+5', rate: 0, low: 36}});
  assert.deepStrictEqual(lh.events.map(e => [e.g, e.d, e.p.map(nm).join('+')]), [[4, 16, 'C2+G2'], [20, 12, 'F2+C3'], [32, 4, 'G2+D3'], [36, 16, 'C2+G2']]);
  const arp = M.accompanyOn({bars, first: 4, chords, mel: [[0, 52, 72]], last: 36, base: {pat: '1 5 8 5', rate: 2, low: 36}});
  assert.strictEqual(arp.events.filter(e => e.g >= 20 && e.g < 32).map(e => nm(e.p[0])).join(' '), 'F2 C3 F3 C3 F2 C3');   // the short bar: the pattern cut off
  assert.strictEqual(arp.events[arp.events.length - 1].p.map(nm).join('+'), 'C2+G2+C3');                                  // the last bar held
  arp.events.forEach(e => bars.forEach(b => assert.ok(e.g >= b.g + b.len || e.g + e.d <= b.g || (e.g >= b.g && e.g + e.d <= b.g + b.len), 'no note over a bar line')));
  // one bar as MEI: three quarters in 4/4, one flat
  const mei = M.barMei({fifths: -1, time: [4, 4], len: 12, shift: 0, events: [{p: [41, 46], d: 12}], id: 'x', chordAt: () => M.chordInfo('B♭/F')});
  assert.strictEqual(mei.layer, '<chord xml:id="x0" dur="2" dots="1"><note xml:id="x0k0" pname="f" oct="2"/><note xml:id="x0k1" pname="b" oct="2" accid.ges="f"/></chord>');
});

test('written-out left hand: cut, replace, tie', () => {
  const s = song(); s.acc = {pat: '1 5 8 5', rate: 2, low: 36};
  const gen = M.accompany(s).events;
  s.left = [{p: null, d: 2}, {p: [43, 50], d: 32}, {p: [40], d: 16}, {p: [40], d: 16, tie: true}];
  assert.strictEqual(show(M.sliceEvents(s.left, 10, 20)), 'G2+D3/10');
  assert.strictEqual(M.sliceEvents(s.left, 10, 20)[0].tie, true);
  s.left = M.replaceRange(s.left, 18, 34, M.sliceEvents(gen, 18, 34));   // bar 3 from the pattern again
  assert.strictEqual(M.total(s.left), 66);
  assert.strictEqual(show(s.left), 'r/2 G2+D3/16 C2/2 G2/2 C3/2 G2/2 D2/2 A2/2 D3/2 A2/2 E2/16 E2/16');
  assert.ok(M.leftHand(s).written);
  const mei = M.toMei(s, {left: s.left});
  assert.deepStrictEqual(barSums(mei), [[2, 2], [16, 16], [16, 16], [16, 16], [16, 16]]);
  assert.ok(/<tie startid="#l10" endid="#l11"\/>/.test(mei));
  const pl = M.playList(s);
  assert.strictEqual(pl.left[pl.left.length - 1].d, 32);   // the tied note sounds once
});

test('what is played', () => {
  const s = song(); s.acc = {pat: '1 5 8 5', rate: 2, low: 36, pedal: true};
  const pl = M.playList(s);
  assert.strictEqual(pl.mel.length, 8); assert.strictEqual(pl.total, 66);
  assert.strictEqual(pl.left[0].t, 2); assert.strictEqual(pl.left[0].d, 16);   // with the pedal the first note rings through its bar
  assert.deepStrictEqual(pl.pad.map(c => c.t), [2, 18, 26, 34]);
});

test('dynamic accompaniment: 9th, walking bass, smooth voice-leading, short chords, bassRing, adaptive fills', () => {
  // 9th token (warm add9 above octave) + bassRing
  const s = song(); s.acc = {pat: '1 5 8 9 10 - 8 5', shortPat: '1 5 8 9', rate: 2, low: 38, bassRing: true};
  const lh = M.accompany(s);
  assert.ok(lh.events[1].ring > lh.events[1].d, 'beat-1 bass rings under the arpeggio');
  // In bar 2 (G major), 9th above G3 (55) is A3 (57)
  assert.strictEqual(nm(lh.events[4].p[0]), 'A3', '9th of G is A3');
  // Walking bass: G -> C steps through B; C -> D steps through E
  const sw = song(); sw.acc = {pat: '1 5 8 w', shortPat: '1 w', rate: 4, low: 38};
  const wlh = M.accompany(sw);
  assert.strictEqual(nm(wlh.events[4].p[0]), 'B2', 'G -> C walks through B2');
  // Adaptive: calm when melody moves (bar 1 has 3 notes), blooms into fill when melody holds (bar 3 is a whole note)
  const sa = song();
  sa.acc = {pat: '1 - - - 5 - 8 -', fillPat: '1 5 8 9 10 - 8 5', shortPat: '1 5 8 5', rate: 2, low: 38, adaptive: true, bassRing: true};
  const alh = M.accompany(sa);
  const bar1 = alh.events.filter((e, i) => { const t = M.onsets(alh.events)[i]; return t >= 2 && t < 18; });
  const bar3 = alh.events.filter((e, i) => { const t = M.onsets(alh.events)[i]; return t >= 34 && t < 50; });
  assert.ok(bar1.length < bar3.length, 'adaptive plays fewer notes under moving melody (' + bar1.length + ') than under held whole note (' + bar3.length + ')');
  // Adaptive blooms from where the melody holds: bar 2 is C (beats 1-2) and D (3-4), one half note each: too short;
  // a bar of quarters then a half note blooms from beat 3 with the late fill, the calm bass held before it
  const sl = song(); sl.notes = [{p: 62, d: 2}, {p: 67, d: 4, ch: 'G'}, {p: 71, d: 4}, {p: 74, d: 8}, {p: 72, d: 16, ch: 'C'}, {p: 71, d: 16}];
  sl.acc = {pat: '1 - - - 5 - 8 -', fillPat: '1 5 8 9 10 - 8 5', latePat: '5 8 10 8', rate: 2, low: 40, adaptive: true};
  const ll = M.accompany(sl).events, lon = M.onsets(ll);
  assert.strictEqual(show(ll.filter((e, i) => lon[i] >= 2 && lon[i] < 18)), 'G2/8 D3/2 G3/2 B3/2 G3/2', 'calm to beat 3, then the late fill');
  // Chorale: the left hand is the bass and one tenor note under the right hand, the chord's third or fifth
  const sc = song(); sc.acc = {pat: '1+t', rate: 0, low: 40};
  const clh = M.accompany(sc).events;
  assert.ok(clh.filter((e) => e.p).every((e) => e.p.length === 2), 'bass and tenor: ' + show(clh));
  assert.strictEqual(show(clh.slice(1, 2)), 'G2+B3/16', 'G: the tenor is the third');
  // and walks like a hymnal's lower voices: a bass leaping a third takes the note of the key between on the last beat
  const sp = song(); sp.notes = [{p: 62, d: 2}, {p: 71, d: 16, ch: 'G'}, {p: 72, d: 16, ch: 'Em'}, {p: 67, d: 16, ch: 'G'}];
  sp.acc = {pat: '1+t', rate: 0, low: 40, passing: true};
  const pl2 = show(M.accompany(sp).events);
  assert.strictEqual(pl2, 'r/2 G2+D3/12 F#2+D3/4 E2+G3/12 F#2+G3/4 G2+B3/16', 'G to Em and back: the bass walks G F# E F# G');
  // More walking (passing: 2): halfway through a bar-long chord the bass goes to another note of it, towards the next
  // bass, and walks on from there: G B | C, and a fourth in two steps; never to a note a leap away from the next bass
  const sm = song(); sm.key = 'G'; sm.notes = [{p: 71, d: 4, ch: 'G'}, {p: 74, d: 4}, {p: 71, d: 4}, {p: 67, d: 4}, {p: 72, d: 16, ch: 'C'},
    {p: 69, d: 16, ch: 'Am'}, {p: 67, d: 16, ch: 'D'}, {p: 67, d: 16, ch: 'G'}];
  sm.pickup = 0; sm.acc = {pat: '1+t', rate: 0, low: 40, passing: 2};
  const mb = M.accompany(sm).events.map((e) => e.p[0]), ml = mb.map(nm);
  assert.deepStrictEqual(ml.slice(0, 3), ['G2', 'B2', 'C3'], 'G B | C: ' + ml);
  assert.ok(mb.every((p, i) => i === 0 || Math.abs(p - mb[i - 1]) <= 7), 'no leap wider than a fifth: ' + ml);
  // a chord of two beats moves halfway too, but only while the melody holds one note through it (a held "throne")
  const sh = song(); sh.pickup = 0; sh.notes = [{p: 71, d: 8, ch: 'G'}, {p: 72, d: 4, ch: 'C'}, {p: 72, d: 4}, {p: 67, d: 16, ch: 'G'}];
  sh.acc = {pat: '1+t', rate: 0, low: 40, passing: 2};
  const hb = M.accompany(sh).events.map((e) => nm(e.p[0]));
  assert.deepStrictEqual(hb.slice(0, 3), ['G2', 'B2', 'C3'], 'the held G walks G B C, the moving C does not: ' + hb);
});

test('Adaptive (Flowing): figures picked from a few, a beat before the bass, takes', () => {
  // 16 bars of 4/4: chords of two beats and of a bar, a melody of quarters, a half note and held notes
  const bars = [], chords = [], mel = [], names = ['G', 'C', 'D', 'Em', 'Am', 'D7'];
  for (let b = 0; b < 16; b++) bars.push({g: b * 16, len: 16, beat: 4});
  let g = 0, k = 0;
  while (g < 256) {
    const len = [8, 16, 8, 8, 16][k % 5]; chords.push({g, end: Math.min(256, g + len), info: M.chordInfo(names[k % names.length])}); g += len; k++;
  }
  const pitches = [71, 74, 72, 69, 67, 71, 72, 74];
  for (let q = 0, t = 0; t < 256; q++) { const d = q % 4 === 3 ? 8 : q % 7 === 5 ? 16 : 4; mel.push([t, Math.min(256, t + d), pitches[q % 8]]); t += d; }
  const rh = M.styles({time: [4, 4]}).find((f) => f.id === 'dynamic').kinds.find((x) => x.id === 'adaptive').rhythms[0];
  const run = (seed) => M.accompanyOn({bars, first: 0, chords, mel, last: 240, base: Object.assign({}, rh, {seed})}).events;
  const text = (ev) => show(ev);
  assert.strictEqual(text(run(0)), text(run(0)), 'the same take plays the same notes');
  assert.notStrictEqual(text(run(0)), text(run(1)), 'another take plays other notes');
  assert.notStrictEqual(text(run(1)), text(run(2)), 'and another');
  for (const seed of [0, 1, 2, 3, 4, 5]) {
    const ev = run(seed).filter((e) => e.p);
    ev.forEach((e, i) => {   // never an eighth, then a leap down of a fifth or more
      const nx = ev[i + 1];
      if (nx && nx.g - e.g <= 2) assert.ok(Math.min(...nx.p) > Math.max(...e.p) - 7, 'take ' + seed + ' at ' + e.g + ': ' + show([e, nx]));
    });
    assert.ok(ev.some((e) => e.p.length > 1 && e.g < 240), 'take ' + seed + ' presses two notes together now and then');
  }
  // in 6/8 and 9/8 a short chord is the bass alone: no fifth in eighths before the next bass
  const c68 = M.styles({time: [6, 8]}).find((f) => f.id === 'dynamic').kinds.find((x) => x.id === 'adaptive').rhythms[0];
  const lh68 = M.accompanyOn({bars: [{g: 0, len: 12, beat: 6}, {g: 12, len: 12, beat: 6}], first: 0,
    chords: [{g: 0, end: 6, info: M.chordInfo('G')}, {g: 6, end: 12, info: M.chordInfo('C')}, {g: 12, end: 24, info: M.chordInfo('G')}],
    mel: [[0, 6, 71], [6, 12, 72], [12, 24, 71]], last: 12, base: c68}).events.filter((e) => e.p);
  assert.deepStrictEqual(lh68.slice(0, 2).map((e) => e.p.length), [1, 1], 'a short chord in 6/8: the bass alone');
  assert.strictEqual(lh68[0].d, 6, '... held for the beat');
});

test('guitar: open shapes, strums down and up, picking', () => {
  const fr = (c) => M.guitarShape(M.chordInfo(c)).map((p, i) => p == null ? 'x' : p - [40, 45, 50, 55, 59, 64][i]).join('');
  assert.deepStrictEqual(['C', 'G', 'D', 'A', 'E', 'Am', 'Em', 'Dm', 'G/B', 'D/F#', 'B7'].map(fr),
    ['x32010', '320003', 'xx0232', 'x02220', '022100', 'x02210', '022000', 'xx0231', 'x20003', '200232', 'x21202']);
  const st = M.styles({time: [4, 4]}).find((f) => f.id === 'guitar');
  assert.deepStrictEqual(st.kinds.map((k) => k.id), ['folk', 'pop', 'steady', 'driving', 'ballad', 'country', 'pick', 'arp']);
  const g = (kind) => {
    const r = st.kinds.find((k) => k.id === kind).rhythms[0];
    return M.accompanyOn({bars: [{g: 0, len: 16}, {g: 16, len: 16}], first: 0, chords: [{g: 0, end: 32, info: M.chordInfo('G')}],
      mel: [[0, 32, 71]], last: 16, base: r}).events;
  };
  const folk = g('folk');
  assert.deepStrictEqual(folk.slice(0, 6).map((e) => (e.up ? 'U' : 'D') + e.d), ['D4', 'D2', 'U4', 'U2', 'D2', 'U2'], 'D - D U - U D U');
  assert.ok(folk.every((e) => e.inst === 'guitar'), 'a guitar plays it');
  assert.strictEqual(show(folk.slice(0, 3)), 'G2+B2+D3+G3+B3+G4/4 G2+B2+D3+G3+B3+G4/2 D3+G3+B3+G4/4', 'down: six strings; up: the top four');
  assert.strictEqual(show(g('pick').slice(0, 4)), 'G2/2 G4/2 B2/2 B3/2', 'thumb, high E, the other bass, B string');
  const pop = g('pop');
  assert.deepStrictEqual(pop.slice(0, 6).map((e) => e.mute ? 'K' : e.up ? 'U' : 'D'), ['D', 'D', 'U', 'K', 'U', 'D'], 'D - D U K U D U: the chuck on beat 3');
  assert.strictEqual(show(g('country').slice(0, 4)), 'G2/4 G2+B2+D3+G3+B3+G4/2 D3+G3+B3+G4/2 B2/4', 'boom-chick: bass, strum, up, the other bass');
  assert.strictEqual(show(g('pick').slice(-1)), 'G2+B2+D3+G3+B3+G4/16', 'the last bar: one strum');
});

test('guitar with a capo: the guitar sheet\'s shape, above the capo, no slash bass', () => {
  const fr = (c, capo) => M.guitarShape(M.chordInfo(c), capo).map((p, i) => p == null ? 'x' : p - [40, 45, 50, 55, 59, 64][i] - capo).join('');
  // E with capo 4: the guitar sheet shows C, played x32010 above the fourth fret, sounding E
  assert.deepStrictEqual([['E', 4], ['B', 4], ['Ab', 1], ['E/G#', 4], ['C', 0]].map(([c, k]) => fr(c, k)), ['x32010', '320003', '320003', 'x32010', 'x32010']);
  assert.strictEqual(M.guitarShape(M.chordInfo('E'), 4)[1], 52, 'the C shape four frets higher: C3 on the A string sounds E3');
});

// the app's Verovio takes it all
const vfile = path.join(__dirname, '../../app/src/main/assets/viewer/verovio-toolkit-wasm.js');
if (!fs.existsSync(vfile)) { console.log(count + ' tests passed (Verovio not found: its test is left out)'); return; }
const verovio = require(vfile);
(function ready() {
  let tk; try { tk = new verovio.toolkit(); } catch (e) { setTimeout(ready, 100); return; }
  test('Verovio reads the lead sheet and both staves', () => {
    const s = song();
    assert.ok(tk.loadData(M.toMei(s)));
    M.styles(s).forEach(f => f.kinds.forEach(k => k.rhythms.forEach(r => {
      s.acc = {pat: r.pat, rate: r.rate, low: r.low, pedal: true};
      const lh = M.accompany(s);
      assert.ok(tk.loadData(M.toMei(s, {left: lh.events, pedal: true, countLine: true, marks: [{t: 18, text: 'here'}]})), f.id + '/' + k.id);
      const svg = tk.renderToSVG(1);
      assert.ok(svg.includes('id="l1"') && svg.includes('con pedale'));
    })));
  });
  test('voice2 emits layer 2 only in non-rest measures and works with accompaniment', () => {
    const s = song();
    // 1 bar of rest (pickup 2 + bar 1 = 18), then a low response in bar 2
    s.voice2 = [{p: null, d: 18, hide: true}, {p: 58, d: 4, w: ['(echo)']}, {p: 56, d: 4, w: ['back']}, {p: null, d: 8, hide: true}];
    s.rh = {add: 1, on: 'all'};
    s.acc = {pat: '1 5 8 5', rate: 2, low: 48};
    const rh = M.rightHand(s), lh = M.accompany(s);
    assert.ok(rh && rh[1] && rh[1].length === 1, 'bar 1 still gets right-hand fill');
    const mei = M.toMei(s, {left: lh.events, right: rh});
    assert.strictEqual(mei.split('<layer n="2">').length, 2, 'only one measure has layer 2');
    assert.ok(mei.includes('<space ') && mei.includes('id="v1"') && mei.includes('<verse n="2"><syl>(echo)</syl></verse>'), 'hidden rest emits space, v-prefixed ids and verse 2');
    assert.strictEqual(M.playList(s).v2.length, 2, 'playList includes voice2');
    const r = M.replaceRange(s.voice2, 14, 18, [{p: 60, d: 4, w: ['hi']}]);
    assert.deepStrictEqual(r[2], {p: 58, d: 4, w: ['(echo)']}, 'replaceRange preserves voice2 lyrics and scalar pitch');
    assert.strictEqual(r[0].hide, true, 'replaceRange preserves hidden rests');
    assert.ok(tk.loadData(mei), 'Verovio loads voice2 + Both hands');
    const svg = tk.renderToSVG(1);
    assert.ok(svg.includes('id="v1"') && svg.includes('id="l1"'));
  });
  console.log(count + ' tests passed');
})();
