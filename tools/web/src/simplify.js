// Simpler chords for the piano sheet ("Simplify" in the toolbar, three levels). Only what is shown changes: the sheet, its
// chord edits and what plays stay as they are. Pure functions on plain bars, so that it runs in node as well (tests/simplify.mjs).
//
// A bar is {unit, count, len, events: [{onset, len, pc}], chords: [[tstamp, text]]}: the meter, the bar's length and its melody
// notes (pitch class, in the meter's unit from beat 1) and its chords, as sheet.js scanBars reads them.
//
//   Medium   light touch-ups only: the same chords at the same places, in a simple shape: a triad (major, minor, diminished,
//            augmented) or a plain dominant seventh, with its slash bass; a chord equal to the one before it is not written again;
//            at most three chord changes in a bar of four beats or more (two in a shorter one): the shortest chords go first.
//   Easy     one chord for the bar (long bars: for each half), triads only, from the original chords and the key's main chords;
//            the last two bars keep their rhythm (a chord for two beats at least).
//
// The choice is made over the whole hymn (a cheapest path through the candidates of each slot): it costs the melody notes
// the chord does not hold, the time the original played another chord, a change of chord, and (a little) a chord the original
// did not have.

// (the sheet shows Medium and Easy; Lighter is what the bars at the end are cut by)
export const LEVELS = ['medium', 'easy'];

const NAT = {C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11};
const ALT = {'♭': -1, '♯': 1, '𝄫': -2, '𝄪': 2, b: -1, '#': 1};
const SHAPES = {M: [0, 4, 7], m: [0, 3, 7], d: [0, 3, 6], a: [0, 4, 8], 7: [0, 4, 7, 10]};
const SUFFIX = {M: '', m: 'm', d: '°', a: '+', 7: '7'};
const SHARPS = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
const FLATS = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'G♭', 'G', 'A♭', 'A', 'B♭', 'B'];
const CHORD = /^([A-G])(𝄫|𝄪|♭|♯|b|#)?(.*?)(?:\/([A-G])(𝄫|𝄪|♭|♯|b|#)?)?$/;

// the cost of ...
const W_FIT = 0.9, W_DEV = 2.0, W_NEW = 0.4, W_SEVENTH = 0.25;
const MAX_MEDIUM = 3;   // chord changes in a bar of four beats or more (fewer beats: two)
const W_CHANGE = {easy: 1.6};

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

const key = (c) => c.pc + c.type;
const tones = (c) => SHAPES[c.type].map((i) => (c.pc + i) % 12);

// ---- the bars as slots: where a chord may change ----

function beatsOf(bar) {
  const compound = bar.unit === 8 && bar.count % 3 === 0 && bar.count > 3;
  const beatQ = compound ? 1.5 : 1, lenQ = bar.len * 4 / bar.unit;
  return {beatQ, lenQ, nb: Math.max(1, Math.round(lenQ / beatQ))};
}

// how many beats each slot of a bar holds
function groups(nb, level) {
  if (level === 'light') return Array(nb).fill(1);
  if (level === 'easy') return nb <= 4 ? [nb] : [Math.floor(nb / 2), nb - Math.floor(nb / 2)];
  if (nb <= 3) return [nb];
  const out = Array(Math.floor(nb / 2)).fill(2);
  if (nb % 2) out[out.length - 1] = 3;
  return out;
}

export function simplifyBars(bars, level, skip) {
  skip = skip || new Set();
  const out = bars.map(() => null);
  // the original chords in order, carried over the bars
  const parsed = bars.map((b) => b.chords.map(([t, text]) => [t, text, shapeOf(text)]));
  const unknown = bars.map((b, i) => skip.has(i) || parsed[i].some((c) => !c[2]));
  const light = (c) => c.spell + SUFFIX[c.type];

  // the original chord at each moment, as segments [from, to, chord] in quarters of its bar
  let carry = null;
  const segs = bars.map((b, i) => {
    const {lenQ} = beatsOf(b), list = [];
    const at = parsed[i].map(([t, , c]) => [(t - 1) * 4 / b.unit, c]);
    if (!at.length || at[0][0] > 1e-6) at.unshift([0, carry]);
    at.forEach(([q, c], k) => {
      const to = k + 1 < at.length ? at[k + 1][0] : lenQ;
      if (c && to > q) list.push([q, to, c]);
    });
    if (at.length && at[at.length - 1][1]) carry = at[at.length - 1][1];
    return list;
  });

  if (level === 'light' || level === 'medium') {
    // medium keeps a slash bass and the places of the chords, but writes at most MAX_MEDIUM chords in a bar
    const bass = level === 'medium';
    const write = (c) => light(c) + (bass && c.bass != null && c.bass !== c.pc ? '/' + c.bassSpell : '');
    let last = null;   // the chord the bar before ended on
    bars.forEach((b, i) => {
      if (unknown[i]) { last = null; return; }
      let list = [], changed = false, prev = null;   // the first chord of a bar is always written
      parsed[i].forEach(([t, text, c]) => {
        const s = write(c);
        if (s === prev) { changed = true; return; }
        prev = s; list.push([t, s]); if (s !== text) changed = true;
      });
      if (bass) {
        // a change is a chord that differs from the one before it (the first one too, against the bar before)
        const end = beatsOf(b).lenQ * b.unit / 4 + 1, nb = beatsOf(b).nb, max = nb >= 4 ? MAX_MEDIUM : Math.min(2, nb);
        const budget = () => max + (list.length && list[0][1] === last ? 1 : 0);
        while (list.length > budget()) {   // the shortest chord goes (the one before it goes on), never the first
          let k = 1;
          for (let j = 2; j < list.length; j++) {
            const d = (list[j + 1] ? list[j + 1][0] : end) - list[j][0], dk = (list[k + 1] ? list[k + 1][0] : end) - list[k][0];
            if (d <= dk) k = j;
          }
          list.splice(k, 1); changed = true;
          list = list.filter((x, j) => j === 0 || x[1] !== list[j - 1][1]);
        }
      }
      if (list.length) last = list[list.length - 1][1];
      if (changed) out[i] = list;
    });
    return out;
  }

  // the key's main chords, from the last chord of the hymn (the tonic)
  const all = segs.flat();
  const home = all.length ? all[all.length - 1][2] : null;
  const spellings = {};
  all.forEach(([, , c]) => { if (!(c.pc in spellings)) spellings[c.pc] = c.spell; });
  const flatKey = home ? (home.spell.includes('♭') || ['F'].includes(home.spell)) : false;
  const spellPc = (pc) => spellings[pc] || (flatKey ? FLATS : SHARPS)[pc];
  const main = [];
  if (home) {
    const major = home.type !== 'm', t = home.pc;
    const add = (iv, type) => main.push({pc: (t + iv) % 12, type});
    if (major) { add(0, 'M'); add(5, 'M'); add(7, 'M'); add(9, 'm'); add(2, 'm'); }
    else { add(0, 'm'); add(5, 'm'); add(7, 'M'); add(8, 'M'); add(3, 'M'); }
  }

  // the slots
  const slots = [];
  bars.forEach((b, i) => {
    if (unknown[i]) { slots.push({bar: i, skip: true}); return; }
    const {beatQ, lenQ, nb} = beatsOf(b);
    const lv = i >= bars.length - 2 && level === 'easy' ? 'half' : level;
    let beat = 0;
    groups(nb, lv).forEach((g, k, arr) => {
      const from = beat * beatQ, to = k === arr.length - 1 ? lenQ : (beat + g) * beatQ;
      beat += g;
      slots.push({bar: i, from, to, tstamp: 1 + from * b.unit / 4, first: k === 0});
    });
  });

  const triadOnly = level === 'easy';
  slots.forEach((s) => {
    if (s.skip) return;
    const b = bars[s.bar];
    const overlap = (a, z) => Math.max(0, Math.min(z, s.to) - Math.max(a, s.from));
    // the original chords of the slot, in time
    const orig = segs[s.bar].map(([a, z, c]) => [overlap(a, z), triadOnly && c.type === '7' ? {pc: c.pc, type: 'M'} : c]).filter((x) => x[0] > 1e-6);
    const cands = new Map();
    orig.forEach(([, c]) => cands.set(key(c), Object.assign({orig: true}, c)));
    main.forEach((c) => { if (!cands.has(key(c))) cands.set(key(c), Object.assign({orig: false}, c)); });
    if (!cands.size) { s.skip = true; return; }
    // the melody of the slot: [pitch class, weight in quarters]; a note that starts the slot weighs more
    const notes = [];
    b.events.forEach((e) => {
      if (e.pc == null) return;
      const a = (e.onset - 1) * 4 / b.unit, z = a + e.len * 4 / b.unit, w = overlap(a, z);
      if (w > 1e-6) notes.push([e.pc, w * (Math.abs(a - s.from) < 1e-6 ? 1.5 : 1)]);
    });
    s.cands = [...cands.values()].map((c) => {
      const t = tones(c);
      const miss = notes.reduce((x, [pc, w]) => x + (t.includes(pc) ? 0 : w), 0);
      const agree = orig.reduce((x, [w, o]) => x + (key(o) === key(c) ? w : 0), 0);
      return {c, cost: W_FIT * miss + W_DEV * (s.to - s.from - agree) + (c.orig ? 0 : W_NEW) + (c.type === '7' ? W_SEVENTH : 0)};
    });
  });

  // the cheapest path
  const live = slots.filter((s) => !s.skip);
  const change = W_CHANGE[level];
  let best = null;
  live.forEach((s, i) => {
    const row = s.cands.map((x) => {
      if (i === 0) return {x, total: x.cost, from: null};
      let pick = null;
      best.forEach((p) => {
        const t = p.total + (key(p.x.c) === key(x.c) ? 0 : change);
        if (!pick || t < pick.total) pick = {total: t, p};
      });
      return {x, total: pick.total + x.cost, from: pick.p};
    });
    s.row = row; best = row;
  });
  if (!live.length) return out;
  let end = best.reduce((a, b) => (b.total < a.total ? b : a));
  for (let i = live.length - 1; i >= 0; i--) { live[i].pick = end.x.c; end = end.from; }

  // the chords of each bar: written where they change
  let prev = null;
  bars.forEach((b, i) => {
    if (unknown[i]) { prev = null; return; }
    const res = [];
    slots.filter((s) => s.bar === i && s.pick).forEach((s) => {
      const text = spellPc(s.pick.pc) + SUFFIX[s.pick.type];
      if (text !== prev) { res.push([Math.round(s.tstamp * 1000) / 1000, text]); prev = text; }
    });
    out[i] = res;
  });
  return out;
}
