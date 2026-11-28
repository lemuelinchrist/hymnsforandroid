// Simpler chords for the piano sheet ("Simplify" in the toolbar, two levels). Only what is shown changes: the sheet, its
// chord edits and what plays stay as they are. Pure functions on plain bars, so that it runs in node as well (tests/simplify.mjs).
//
// A bar is {unit, count, len, events: [{onset, len, pc}], chords: [[tstamp, text]], fifths}: the meter, the bar's length, its
// melody notes (pitch class, in the meter's unit from beat 1), its chords, as sheet.js scanBars reads them, and the key signature.
//
// The chords are weighed by what they do in the key (2026-11-27). The main chords, on the 1st, 2nd, 4th, 5th and 6th degrees
// (I ii IV V vi; in a minor key i ii iv V VI), carry the tune: both levels keep every one of them, at its place, so the hymn
// stays recognizable. A secondary dominant (a major chord or seventh that goes to the chord a fifth below it: E7 -> Am) is
// kept too. The other chords (iii, vii, chromatic and passing chords) are colour.
//
//   Medium   light touch-ups: the same chords at the same places, in a simple shape (a triad or a plain seventh) with their
//            slash bass; a chord equal to the one before it is not written again. (Until 2026-11-28 a bar had at most three
//            changes; no more.) A sheet with its four voices has hand-made Medium chords and does not use this (sheet.js levelOf).
//   Easy     plain triads in root position, no slash bass; each main chord and secondary dominant at its place; a colour chord
//            becomes the main chord that shares most of its notes and holds the melody best.

export const LEVELS = ['medium', 'easy'];

const NAT = {C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11};
const ALT = {'♭': -1, '♯': 1, '𝄫': -2, '𝄪': 2, b: -1, '#': 1};
const SHAPES = {M: [0, 4, 7], m: [0, 3, 7], d: [0, 3, 6], a: [0, 4, 8], 7: [0, 4, 7, 10]};
const SUFFIX = {M: '', m: 'm', d: '°', a: '+', 7: '7'};
const SHARPS = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
const FLATS = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'G♭', 'G', 'A♭', 'A', 'B♭', 'B'];
const CHORD = /^([A-G])(𝄫|𝄪|♭|♯|b|#)?(.*?)(?:\/([A-G])(𝄫|𝄪|♭|♯|b|#)?)?$/;
const MAX_MEDIUM = 3;   // chord changes in a bar of four beats or more (fewer beats: two)

// "B♭m7/E" -> {pc: 10, spell: 'B♭', type: 'm'}; null when it is not a chord (N.C., a word)
export function shapeOf(text) {
  const m = CHORD.exec((text || '').replace(/\s+/g, ''));
  if (!m) return null;
  const q = m[3] || '', pc = ((NAT[m[1]] + (ALT[m[2]] || 0)) % 12 + 12) % 12;
  let type = 'M';
  if (/^(dim|°|ø|m7♭5|m7b5)/.test(q)) type = 'd';
  else if (/^(aug|\+)/.test(q)) type = 'a';
  else if (/^(m(?!aj|a)|min)/.test(q)) type = 'm';
  else if (/^(7|9|11|13)/.test(q)) type = '7';
  const sp = (l, a) => l + (a ? ({b: '♭', '#': '♯'}[a] || a) : '');
  const out = {pc, spell: sp(m[1], m[2]), type};
  if (m[4]) { out.bass = ((NAT[m[4]] + (ALT[m[5]] || 0)) % 12 + 12) % 12; out.bassSpell = sp(m[4], m[5]); }
  return out;
}

const tones = (c) => SHAPES[c.type].map((i) => (c.pc + i) % 12);

// the key: its tonic and whether it is minor (the key signature's major key, or its relative minor when the hymn ends there)
export function keyOf(bars) {
  const all = [];
  bars.forEach((b) => b.chords.forEach(([, t]) => { const c = shapeOf(t); if (c) all.push(c); }));
  const f = bars.find((b) => b.fifths != null);
  let major = f ? ((f.fifths * 7) % 12 + 12) % 12 : null;
  const last = all.length ? all[all.length - 1] : null;
  if (major == null) {   // no key signature: the last chord is the tonic
    if (!last) return null;
    return {tonic: last.pc, minor: last.type === 'm', flats: last.spell.includes('♭') || last.spell === 'F'};
  }
  const minor = !!last && last.pc === (major + 9) % 12;
  return {tonic: minor ? (major + 9) % 12 : major, minor, flats: f.fifths < 0};
}

// the main chords of a key: [{pc, type}] on its 1st, 2nd, 4th, 5th and 6th degrees
function mainChords(key) {
  const t = key.tonic, at = (iv, type) => ({pc: (t + iv) % 12, type});
  return key.minor ? [at(0, 'm'), at(2, 'd'), at(5, 'm'), at(7, 'M'), at(8, 'M')] : [at(0, 'M'), at(2, 'm'), at(5, 'M'), at(7, 'M'), at(9, 'm')];
}

export function simplifyBars(bars, level, skip) {
  skip = skip || new Set();
  const out = bars.map(() => null);
  const key = keyOf(bars);
  if (!key) return out;
  const main = mainChords(key), mainPcs = new Set(main.map((c) => c.pc));
  const spellings = {};
  bars.forEach((b) => b.chords.forEach(([, t]) => { const c = shapeOf(t); if (c && !(c.pc in spellings)) spellings[c.pc] = c.spell; }));
  const spellPc = (pc) => spellings[pc] || (key.flats ? FLATS : SHARPS)[pc];

  // every chord of the hymn in order: {bar, t, text, c, from, to (in quarters from the bar's start), role}
  const list = [];
  bars.forEach((b, i) => {
    const parsed = b.chords.map(([t, text]) => [t, text, shapeOf(text)]).sort((p, q) => p[0] - q[0]);   // (a sheet may list them out of order)
    const unknown = skip.has(i) || parsed.some((p) => !p[2]);
    const lenQ = b.len * 4 / b.unit;
    parsed.forEach(([t, text, c], k) => list.push({bar: i, t, text, c, unknown,
      from: (t - 1) * 4 / b.unit, to: k + 1 < parsed.length ? (parsed[k + 1][0] - 1) * 4 / b.unit : lenQ}));
  });
  list.forEach((x, k) => {
    if (x.unknown) return;
    const next = list.slice(k + 1).find((y) => y.c && y.c.pc !== x.c.pc);
    if (mainPcs.has(x.c.pc)) x.role = 'main';
    else if ((x.c.type === 'M' || x.c.type === '7') && next && next.c && (next.c.pc + 7) % 12 === x.c.pc) x.role = 'secondary';
    else x.role = 'colour';
  });

  // the melody under a chord: [pitch class, weight in quarters]
  const melody = (x) => {
    const b = bars[x.bar], notes = [];
    b.events.forEach((e) => {
      if (e.pc == null) return;
      const a = (e.onset - 1) * 4 / b.unit, z = a + e.len * 4 / b.unit, w = Math.min(z, x.to) - Math.max(a, x.from);
      if (w > 1e-6) notes.push([e.pc, w * (Math.abs(a - x.from) < 1e-6 ? 1.5 : 1)]);
    });
    return notes;
  };

  list.forEach((x) => {
    if (x.unknown) return;
    x.out = x.c.spell + SUFFIX[x.c.type] + (x.c.bass != null && x.c.bass !== x.c.pc ? '/' + x.c.bassSpell : '');
  });

  // Medium: per bar, the chords where they change, at most MAX_MEDIUM changes
  let prev = null;   // the chord the bar before ended on
  const kept = bars.map((b, i) => {
    const mine = list.filter((x) => x.bar === i);
    if (!mine.length) return null;   // no chord here: the one before goes on
    if (mine.some((x) => x.unknown)) { prev = null; return null; }
    let res = [];
    mine.forEach((x) => { if ((res.length ? res[res.length - 1].out : null) !== x.out) res.push(Object.assign({}, x)); });
    // no limit on the changes since 2026-11-28 (the chords in simple shapes are simple enough); MAX_MEDIUM stays for the tools
    const max = Infinity;
    const changes = () => res.length - (res.length && res[0].out === prev ? 1 : 0);
    // what goes first: colour (the shortest first), then a change of the bass only; never the first chord of the bar,
    // a main chord that changes the harmony, or a secondary dominant
    const rank = (x, k) => (k === 0 ? null : x.role === 'colour' ? 0 : res[k - 1].c.pc === x.c.pc ? 1 : null);
    while (changes() > max) {
      let pick = -1;
      res.forEach((x, k) => {
        const r = rank(x, k);
        if (r == null) return;
        if (pick < 0 || r < rank(res[pick], pick) || (r === rank(res[pick], pick) && x.to - x.from < res[pick].to - res[pick].from)) pick = k;
      });
      if (pick < 0) break;
      res[pick - 1].to = res[pick].to;
      res.splice(pick, 1);
      res = res.filter((x, k) => k === 0 || x.out !== res[k - 1].out);
    }
    prev = res.length ? res[res.length - 1].out : prev;
    return {mine, res};
  });

  if (level === 'easy') {
    const flat = [];
    kept.forEach((k) => { if (k) k.res.forEach((x) => flat.push(x)); else flat.push({unknown: true}); });
    // each chord as a plain triad; a colour chord as the main chord nearest to it
    flat.forEach((x) => {
      if (x.unknown) return;
      let c = {pc: x.c.pc, type: x.c.type === '7' ? 'M' : x.c.type};
      if (x.role === 'colour') {
        const own = tones(x.c), notes = melody(x);
        let best = null;
        main.forEach((m) => {
          const t = tones(m);
          const score = 2 * own.filter((p) => t.includes(p)).length + notes.reduce((s, [pc, w]) => s + (t.includes(pc) ? w : 0), 0)
            + (t.includes(x.c.bass != null ? x.c.bass : x.c.pc) ? 0.5 : 0);
          if (!best || score > best.score) best = {score, c: m};
        });
        c = best.c;
      }
      x.out = (c.pc === x.c.pc ? x.c.spell : spellPc(c.pc)) + SUFFIX[c.type];
      x.pcOut = c.pc;
    });
    // a chord shorter than a beat goes on in the one before it (one change a beat at most), but a V that resolves to I stays
    const beatQ = (b) => (b.unit === 8 && b.count % 3 === 0 && b.count > 3 ? 1.5 : b.unit === 2 ? 2 : 1);
    let last = null;
    flat.forEach((x, k) => {
      if (x.unknown) { last = null; return; }
      const next = flat[k + 1], short = x.to - x.from < beatQ(bars[x.bar]) - 1e-6 && x.from > 1e-6;
      const cadence = x.pcOut === (key.tonic + 7) % 12 && next && !next.unknown && next.pcOut === key.tonic && x.to - x.from >= beatQ(bars[x.bar]) / 2 - 1e-6;
      if (short && !cadence && last) x.out = last.out;
      else last = x;
    });
    kept.forEach((k) => { if (k) k.res = k.res.filter((x, j) => j === 0 || x.out !== k.res[j - 1].out); });
  }

  // the chords of each bar, written where they change
  let before = null;
  kept.forEach((k, i) => {
    if (!k) return;
    const texts = [];
    k.res.forEach((x) => { if ((texts.length ? texts[texts.length - 1][1] : null) !== x.out) texts.push([x.t, x.out]); });
    const orig = bars[i].chords.slice().sort((p, q) => p[0] - q[0]);
    if (texts.length !== orig.length || texts.some(([t, o], j) => o !== orig[j][1] || t !== orig[j][0])) out[i] = texts;
    before = texts.length ? texts[texts.length - 1][1] : before;
  });
  return out;
}
