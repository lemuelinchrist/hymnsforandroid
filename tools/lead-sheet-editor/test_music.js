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
  console.log(count + ' tests passed');
})();
