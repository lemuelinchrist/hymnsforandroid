// Simpler chords for the piano sheet ("Simplify" in the toolbar, three levels). Only what is shown changes: the sheet, its
// chord edits and what plays stay as they are. Pure functions on plain bars, so that it runs in node as well (tests/simplify.mjs).
//
// A bar is {unit, count, len, events: [{onset, len, pc}], chords: [[tstamp, text]]}: the meter, the bar's length and its melody
// notes (pitch class, in the meter's unit from beat 1) and its chords, as sheet.js scanBars reads them.
//
//   Lighter  the same chords at the same places, in a simple shape: a triad (major, minor, diminished, augmented) or a plain
//            dominant seventh; no slash bass; a chord equal to the one before it in the bar is not written again.
//   Medium   also a chord for two beats at least: the bar is cut in pairs of beats (half bars) and each gets one chord, the one
//            that stays closest to the original harmony and fits the melody; the last two bars keep their rhythm.
//   Easy     one chord for the bar (long bars: for each half), triads only, from the original chords and the key's main chords;
//            the last two bars as in Medium.
//
// The choice is made over the whole hymn (a cheapest path through the candidates of each slot): it costs the melody notes
// the chord does not hold, the time the original played another chord, a change of chord, and (a little) a chord the original
// did not have.

export const LEVELS = ['light', 'medium', 'easy'];

const NAT = {C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11};
const ALT = {'♭': -1, '♯': 1, '𝄫': -2, '𝄪': 2, b: -1, '#': 1};
const SHAPES = {M: [0, 4, 7], m: [0, 3, 7], d: [0, 3, 6], a: [0, 4, 8], 7: [0, 4, 7, 10]};
const SUFFIX = {M: '', m: 'm', d: '°', a: '+', 7: '7'};
const SHARPS = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
const FLATS = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'G♭', 'G', 'A♭', 'A', 'B♭', 'B'];
const CHORD = /^([A-G])(𝄫|𝄪|♭|♯|b|#)?(.*?)(?:\/([A-G])(?:𝄫|𝄪|♭|♯|b|#)?)?$/;

// the cost of ...
const W_FIT = 0.9, W_DEV = 2.0, W_NEW = 0.4, W_SEVENTH = 0.25;
const W_CHANGE = {medium: 0.5, easy: 1.6};

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
  return {pc, spell: m[1] + (m[2] ? ({b: '♭', '#': '♯'}[m[2]] || m[2]) : ''), type};
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

  if (level === 'light') {
    bars.forEach((b, i) => {
      const res = []; let changed = false, prev = null;   // the first chord of a bar is always written
      if (unknown[i]) return;
      parsed[i].forEach(([t, text, c]) => {
        const s = light(c);
        if (s === prev) { changed = true; return; }
        prev = s; res.push([t, s]); if (s !== text) changed = true;
      });
      if (changed) out[i] = res;
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
    const lv = i >= bars.length - 2 ? (level === 'easy' ? 'medium' : 'light') : level;
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
      if (text !== prev || res.length === 0) { res.push([Math.round(s.tstamp * 1000) / 1000, text]); prev = text; }
    });
    out[i] = res;
  });
  return out;
}
