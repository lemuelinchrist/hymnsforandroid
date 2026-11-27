// The piano part ("Both hands"): a left hand made from the sheet's chords by a pattern, on a second staff, and notes of
// the chord added under the melody. Nothing of it is in the sheets: it is worked out here for the sheet as it is shown
// (transposed, with this device's chord edits), by the rules of the lead sheet editor (tools/lead-sheet-editor), whose
// music.js build.py copies into the app (window.LeadSheet).
//
// A choice is {lh: {family, kind, rhythm, oct, pedal, walk, tone, capo, seed} | null, rh: {add: 0 | 1 | 2, on: 'chord' | 'beat' | 'long' | 'all'}}:
// the names of a style of music.js, so that it fits every time signature (an arpeggio in 3/4 is not the one in 4/4).
// tone is the guitar's (GUITAR_TONES; none: warm); capo is set for the guitar sheet's strumming (strumChoice); seed is the
// take of a style that varies its figures (Adaptive; Shuffle in the panel): none is the hymn's own, another number plays
// the figures in another order, the same notes every time.

const MEI_NS = 'http://www.music-encoding.org/ns/mei';
const XML_NS = 'http://www.w3.org/XML/1998/namespace';
const STEP = {c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11};
const ACC = {s: 1, f: -1, n: 0, x: 2, ss: 2, ff: -2};
const ACCID = {'-2': 'ff', '-1': 'f', '0': 'n', '1': 's', '2': 'x'}, ACCID_GES = {'-2': 'ff', '-1': 'f', '1': 's', '2': 'ss'};

// The default is the Flowing preset (2026-11-24; it was Plain, the strike hymn style).
export const DEFAULT = {lh: {family: 'dynamic', kind: 'adaptive', rhythm: '8', oct: 0, pedal: false}, rh: {add: 1, on: 'chord'}};

// The panel's simple choices: a style of music.js by what it is for, and the right hand that goes with it (which can
// be changed: Melody alone or Two notes, added where a chord starts, or for Chorale on the beat). The default is Flowing.
export const PRESETS = [
  {id: 'plain', name: 'Plain', lh: ['strike', 'hymn', 'half'], add: 0},
  {id: 'chorale', name: 'Chorale', lh: ['dynamic', 'chorale', 'half'], add: 1, on: 'beat'},
  {id: 'flowing', name: 'Flowing', lh: ['dynamic', 'adaptive', '8'], add: 1},
  {id: 'guitar', name: 'Guitar', lh: ['guitar', 'folk', '8'], add: 0, anyKind: true},   // any strum: the panel's Strum row
  {id: 'lively', name: 'Lively', lh: ['dynamic', 'pulse', '8'], add: 1},
  {id: 'walking', name: 'Walking', lh: ['dynamic', 'walking', '4'], add: 1},
];
export function presetChoice(p) {
  return {lh: {family: p.lh[0], kind: p.lh[1], rhythm: p.lh[2], oct: 0, pedal: false}, rh: {add: p.add, on: p.on || 'chord'}};
}
// the preset a choice is, in this time signature (the right hand may be either of the simple ones), or null: Custom
export function presetOf(choice, time) {
  const rh = (choice && choice.rh) || {add: 0};
  if (rh.add > 1) return null;
  const cur = choice && pattern(choice.lh, time);
  if (!cur || cur.pedal || (choice.lh.oct || 0) !== 0) return null;
  return PRESETS.find((p) => {
    const q = pattern(presetChoice(p).lh, time);
    return q && q.family === cur.family && (p.anyKind || (q.kind === cur.kind && q.rhythm === cur.rhythm)) && (rh.add === 0 || rh.on === (p.on || 'chord'));
  }) || null;
}

// the guitar's tones (player.js GUITAR_TONES), as the panels offer them; warm is the usual one
export const TONES = [['bright', 'Bright'], ['warm', 'Warm'], ['mellow', 'Mellow'], ['soft', 'Soft']];
export const STRUM_DEFAULT = {kind: 'folk', tone: 'warm'};

// Where the choices are kept on the device (ui.js store): per hymn. Older device-wide and Advanced keys are cleared on start
// so every hymn starts cleanly from its own default unless the user picks a style for that hymn.
export const SAVED = {handsOf: 'handsByHymn', strumOf: 'strumByHymn'};
export function forgetOldChoices() {
  try { for (const k of ['piano', 'pianoOf', 'strum', 'strumOf', 'handsForAll', 'strumForAll', 'pianoAdvanced']) localStorage.removeItem('hfw.' + k); } catch (e) { /* no storage */ }
}
// The guitar sheet's strumming ({kind, tone}) as a choice to play: a guitar's strums only (the melody is the sheet's),
// in the shapes of the chords the guitar sheet shows, above its capo
export function strumChoice(strum, capo) {
  const s = Object.assign({}, STRUM_DEFAULT, strum || {});
  const lh = {family: 'guitar', kind: s.kind, rhythm: '', oct: 0, pedal: false, tone: s.tone, capo: capo | 0};
  if (s.seed) lh.seed = s.seed;
  return {lh, rh: {add: 0, on: 'chord'}};
}

const lib = () => window.LeadSheet;
const kids = (e) => Array.prototype.filter.call(e.childNodes, (n) => n.nodeType === 1);
const xmlId = (e) => e.getAttributeNS(XML_NS, 'id') || e.getAttribute('xml:id');

// the styles there are for a time signature ([4, 4]): families of kinds of rhythms, as music.js lists them
export function styles(time) { return lib().styles({time}); }

// a choice of left hand as the pattern it means in this time signature, with the names it was found under; null: none
export function pattern(lh, time) {
  if (!lh) return null;
  const fam = styles(time).find((f) => f.id === lh.family);
  if (!fam) return null;
  const rawKind = fam.id === 'guitar' && /^(travis|pick-flow|arp|harp|arp-flow)$/.test(lh.kind) ? 'pick' : lh.kind;
  const kind = fam.kinds.find((k) => k.id === rawKind) || fam.kinds[0];
  const r = kind.rhythms.find((x) => x.id === lh.rhythm) || kind.rhythms.find((x) => x.id === '8') || kind.rhythms[0];   // an arpeggio starts in eighths
  const out = {pat: r.pat, rate: r.rate, low: r.low + 12 * (lh.oct || 0), pedal: !!lh.pedal && r.rate > 0,
    family: fam.id, kind: kind.id, rhythm: r.id};
  for (const k of ['shortPat', 'fillPat', 'latePat', 'bassRing', 'chordPedal', 'adaptive', 'roll', 'smooth', 'passing', 'guitar', 'pick', 'settle', 'vary', 'moods', 'feather']) if (r[k] != null) out[k] = r[k];
  if ((out.vary || out.moods) && lh.seed) out.seed = lh.seed;   // the take (Shuffle)
  if (out.passing && lh.walk) out.passing = 2;   // More walking (Chorale)
  if (out.guitar && lh.capo != null) out.capo = lh.capo;
  return out;
}

function keySig(e, was) {
  const sig = e.getAttribute('key.sig') || e.getAttribute('keysig') || (e.localName === 'keySig' && e.getAttribute('sig'));
  const m = sig && /^(\d+)([sf])?$/.exec(sig);
  return m ? parseInt(m[1], 10) * (m[2] === 'f' ? -1 : 1) : was;
}
function keyAlter(fifths) {
  const a = {c: 0, d: 0, e: 0, f: 0, g: 0, a: 0, b: 0};
  for (let i = 0; i < fifths; i++) a['fcgdaeb'[i]] = 1;
  for (let i = 0; i < -fifths; i++) a['beadgcf'[i]] = -1;
  return a;
}
// a note's accidentals: {written, sounding} as numbers or null. The sheets carry them as attributes, what Verovio
// writes after transposing as an <accid> inside the note.
function accidOf(note) {
  const child = kids(note).find((c) => c.localName === 'accid');
  const w = note.getAttribute('accid') || (child && child.getAttribute('accid'));
  const g = note.getAttribute('accid.ges') || (child && child.getAttribute('accid.ges'));
  return {written: w in ACC ? ACC[w] : null, sounding: g in ACC ? ACC[g] : null, child};
}

// The bars of the music as the generator needs them, in the order of the file:
// [{el, g, len, nominal, beat, unit, count, fifths, notes: [{el, g, d, p, alter, written, key, tiedTo}], harms: [{g, ch}]}]
// g and the lengths are in sixteenths, g from the first bar line.
function readBars(doc) {
  const bars = [];
  let unit = 4, count = 4, fifths = 0, g = 0;
  const tiedTo = new Set();
  for (const t of doc.getElementsByTagNameNS(MEI_NS, 'tie')) tiedTo.add((t.getAttribute('endid') || '').replace('#', ''));
  const measure = (m) => {
    const per = 16 / unit, nominal = Math.round(count * per), ka = keyAlter(fifths), state = {};
    const bar = {el: m, g, unit, count, fifths, nominal, beat: unit === 8 && count % 3 === 0 ? 6 : Math.max(1, Math.round(per)), notes: [], harms: []};
    const par = m.parentNode;
    bar.ending = par && par.localName === 'ending' ? parseInt(par.getAttribute('n') || '1', 10) || 1 : 0;   // which ending the bar is in
    bar.rptstart = m.getAttribute('left') === 'rptstart';
    bar.rptend = m.getAttribute('right') === 'rptend';
    const staff = kids(m).find((c) => c.localName === 'staff');
    let end = 0;
    const walk = (e, start, factor, layerN) => {
      let at = start;
      kids(e).forEach((c) => {
        const name = c.localName;
        if (name === 'note' || name === 'rest' || name === 'space') {
          if (c.getAttribute('grace')) return;
          const d = 16 / parseInt(c.getAttribute('dur') || '4', 10) * (2 - Math.pow(0.5, parseInt(c.getAttribute('dots') || '0', 10))) * factor;
          if (name === 'note') {
            const pname = c.getAttribute('pname'), oct = parseInt(c.getAttribute('oct'), 10), key = pname + oct, acc = accidOf(c);
            const alter = acc.sounding != null ? acc.sounding : acc.written != null ? acc.written : key in state ? state[key] : ka[pname];
            if (acc.written != null) state[key] = acc.written;
            const tie = c.getAttribute('tie') || '';
            bar.notes.push({el: c, g: g + at, d, p: 12 * (oct + 1) + STEP[pname] + alter, alter, written: acc.written != null, key, pname, layer: layerN,
              tiedTo: tiedTo.has(xmlId(c)) || tie === 'm' || tie === 't'});
          }
          at += d;
        } else if (name === 'mRest' || name === 'mSpace') at += nominal;
        else if (name === 'tuplet') at = walk(c, at, factor * parseInt(c.getAttribute('numbase') || '2', 10) / parseInt(c.getAttribute('num') || '3', 10), layerN);
        else if (name === 'beam' || name === 'layer') at = walk(c, at, factor, layerN);
      });
      return at;
    };
    if (staff) kids(staff).forEach((layer) => { if (layer.localName === 'layer') end = Math.max(end, walk(layer, 0, 1, parseInt(layer.getAttribute('n') || '1', 10))); });
    bar.len = Math.round(end) || nominal;
    kids(m).forEach((c) => {
      if (c.localName === 'harm') bar.harms.push({g: g + (parseFloat(c.getAttribute('tstamp') || '1') - 1) * per, ch: c.textContent.trim()});
    });
    g += bar.len;
    bars.push(bar);
  };
  (function walk(e) {
    kids(e).forEach((c) => {
      const name = c.localName;
      if (name === 'measure') measure(c);
      else if (name === 'scoreDef' || name === 'staffDef' || name === 'keySig' || name === 'meterSig') {
        fifths = keySig(c, fifths);
        const u = c.getAttribute('meter.unit') || (name === 'meterSig' && c.getAttribute('unit'));
        const n = c.getAttribute('meter.count') || (name === 'meterSig' && c.getAttribute('count'));
        if (u) unit = parseInt(u, 10) || unit;
        if (n) count = parseInt(n, 10) || count;
        walk(c);
      } else if (name === 'section' || name === 'staffGrp' || name === 'ending') walk(c);
    });
  })(doc.getElementsByTagNameNS(MEI_NS, 'score')[0]);
  if (dottedFeel(bars)) bars.forEach((b) => { if (b.unit === 4 && b.count === 3) { b.unit = 8; b.count = 6; b.beat = 6; } });
  return bars;
}

// A tune written in 3/4 that is felt in two dotted pulses (a short note and a long one, "short-long short-long": E16, "Our Father, as
// the evergreen"): its notes start at 0 and 6 sixteenths of the bar (more often than at 8), not at 0, 4 and 8. It is played as 6/8 (its bars are as long), so
// that the left hand, its passing notes and the notes under the melody follow the pulses of the tune and not three even beats.
function dottedFeel(bars) {
  const b3 = bars.filter((b) => b.unit === 4 && b.count === 3 && b.len >= b.nominal);
  if (b3.length < 4 || b3.length < bars.length * 0.6) return false;
  let six = 0, eight = 0;
  for (const b of b3) {
    const at = new Set(b.notes.filter((n) => (n.layer || 1) === 1).map((n) => Math.round(n.g - b.g)));
    if (at.has(6)) six++;
    if (at.has(8)) eight++;
  }
  return six >= b3.length * 0.6 && six >= eight * 1.3;   // a note starts at 6 in most bars, and clearly more often than at 8 (the third beat)
}

function fragment(doc, xml) {   // MEI text -> its nodes, in this document
  const d = new DOMParser().parseFromString('<x xmlns="' + MEI_NS + '">' + xml + '</x>', 'application/xml');
  return kids(d.documentElement).map((n) => doc.importNode(n, true));
}

// the time signature the styles are chosen for: that of the first whole bar
export function timeOf(doc) {
  const bars = readBars(doc), b = bars.find((x) => x.len >= x.nominal) || bars[0];
  return b ? [b.count, b.unit] : [4, 4];
}

// Reads a sheet and works out the piano part for a choice (null parts when it has none): the bars, the melody's
// notes with the notes added under them, the chords on the beat, the left hand's events. addPiano writes it into the
// sheet, scoreOf makes the notes to play from it.
function analyse(doc, choice, loop = false) {
  const M = lib(), bars = readBars(doc);
  if (!M || !bars.length) return null;
  const endG = bars[bars.length - 1].g + bars[bars.length - 1].len;
  const upbeat = bars.length > 1 && bars[0].len < bars[0].nominal;
  const first = upbeat ? bars[0].len : 0;
  const whole = bars.find((x) => x.len >= x.nominal) || bars[0];

  // the melody: every note, and the notes as they sound (a tied note goes on in the one before it, per layer)
  const notes = [].concat(...bars.map((b) => b.notes.map((n) => Object.assign(n, {bar: b}))));
  const sound = [], prevSound = {};
  let last = -1;
  notes.forEach((n) => {
    const prev = prevSound[n.layer || 1];
    if (n.tiedTo && prev && Math.abs(prev[1] - n.g) < 0.01) prev[1] = n.g + n.d;
    else { const s = [n.g, n.g + n.d]; sound.push(s); prevSound[n.layer || 1] = s; last = Math.max(last, n.g); }
  });
  sound.sort((a, b) => a[0] - b[0]);
  const harms = [].concat(...bars.map((b) => b.harms)).sort((a, b) => a.g - b.g);
  const chords = M.chordsOnBeat(harms, bars, sound, endG);

  // the right hand: notes of the chord under the melody (layer 1 only, skipping where a second voice already sounds)
  const rh = choice.rh && choice.rh.add > 0 ? choice.rh : null;
  if (rh) {
    const v2Notes = notes.filter((n) => (n.layer || 1) > 1);
    const hasV2At = (g, d) => v2Notes.some((v) => v.g < g + d - 0.01 && v.g + v.d > g + 0.01);
    let k = -1, info = null;
    notes.filter((n) => (n.layer || 1) === 1).forEach((n) => {
      while (k + 1 < harms.length && harms[k + 1].g <= n.g + 0.01) { k++; info = M.chordInfo(harms[k].ch); }
      if (!info || hasV2At(n.g, n.d)) return;
      const onChord = k >= 0 && Math.abs(harms[k].g - n.g) < 0.01, long = n.d >= 2 * n.bar.beat - 0.01;
      const onBeat = Math.abs(((n.g - n.bar.g) % n.bar.beat)) < 0.01;
      // 'beat': a note on a beat, or a note a beat (at most a quarter) long or longer that starts off the beat (a hymn whose melody sits on the off-beats,
      // like E16, would hardly get a note under it otherwise); a short note between the beats is left alone, as a passing note
      const want = rh.on === 'all' ? true : rh.on === 'chord' ? onChord : rh.on === 'long' ? long : onBeat || long || n.d >= Math.min(n.bar.beat, 4) - 0.01;
      if (!want) return;
      const ps = M.fillUnder(n.p, info, rh.add);
      if (ps.length) { n.fill = ps; n.info = info; }
    });
  }

  // the left hand
  const sd = doc.getElementsByTagNameNS(MEI_NS, 'scoreDef')[0];
  let sheetBpm = sd ? parseFloat(sd.getAttribute('midi.bpm')) || 0 : 0;
  if (sheetBpm > 0) { while (sheetBpm > 250) sheetBpm /= 2; while (sheetBpm < 40) sheetBpm *= 2; }
  const base = pattern(choice.lh, [whole.count, whole.unit]);
  if (base && loop) base.end = false;   // played round again: the last bar goes on with the pattern, no closing strike
  let left = null;
  if (base && M.parsePattern(base.pat).length) {
    const mel = notes.map((n) => [n.g, n.g + n.d, n.fill ? n.fill[0] : n.p]).sort((a, b) => a[0] - b[0]);
    left = M.accompanyOn({bars: bars.map((b) => ({g: b.g, len: b.len, beat: b.beat, fifths: b.fifths})), first, chords, mel, last, base, bpm: sheetBpm}).events;
  }
  // played round again, an upbeat's missing beats are a rest before it comes back (none when the last bar is already short
  // by them). The rest is not silent: the accompaniment goes on through it, on the first bar's chord (when one starts
  // there) or else the last chord, as if one more bar began there.
  let gapG = 0, gapLeft = null, gapChord = null;
  if (loop && upbeat) {
    gapG = Math.max(0, (bars[0].nominal - bars[0].len) - (bars[bars.length - 1].nominal - bars[bars.length - 1].len));
    gapChord = chords.length ? (chords[0].g < bars[0].g + bars[0].len - 1e-6 ? chords[0] : chords[chords.length - 1]) : null;
    if (gapG > 0 && gapChord && gapChord.info && base && M.parsePattern(base.pat).length) {
      const b0 = bars[0], at = endG;
      // Keep the upbeat rest gently moving right into the next stanza (avoid sparse pause fills or settling out its last beat)
      const gapBase = Object.assign({}, base, {adaptive: false, settle: false});
      if (gapBase.moods && gapBase.moods.length) gapBase.moods = [gapBase.moods[0]];
      gapLeft = M.accompanyOn({bars: [{g: at, len: gapG, beat: b0.beat, fifths: b0.fifths}], first: at,
        chords: [Object.assign({}, gapChord, {g: at, end: at + gapG})], mel: [], last: -1, base: gapBase, bpm: sheetBpm}).events;
    }
  }
  return {M, bars, notes, harms, chords, left, upbeat, first, endG, base, gapG, gapLeft, gapChord};
}

// Adds the piano part to a parsed sheet (in place): choice as above. Returns what it added: {left, right} (numbers
// of notes), for the tests.
export function addPiano(doc, choice) {
  const out = {left: 0, right: 0}, A = choice && analyse(doc, choice);
  if (!A) return out;
  const {M, bars, chords, left, upbeat} = A, rh = choice.rh && choice.rh.add > 0 ? choice.rh : null;

  // ---- into the sheet
  if (left) {
    for (const def of Array.from(doc.getElementsByTagNameNS(MEI_NS, 'staffDef'))) {
      if ((def.getAttribute('n') || '1') !== '1') continue;
      const two = def.cloneNode(true);
      two.setAttribute('n', '2'); two.setAttribute('clef.shape', 'F'); two.setAttribute('clef.line', '4');
      two.removeAttributeNS(XML_NS, 'id');
      kids(two).forEach((c) => { if (c.localName === 'clef') two.removeChild(c); });
      def.parentNode.insertBefore(two, def.nextSibling);
      if (def.parentNode.localName === 'staffGrp') { def.parentNode.setAttribute('symbol', 'brace'); def.parentNode.setAttribute('bar.thru', 'true'); }
    }
    const spanAt = (g) => { for (let k = chords.length - 1; k >= 0; k--) if (chords[k].g <= g) return g < chords[k].end ? chords[k].info : null; return null; };
    bars.forEach((b, bi) => {
      const mine = left.filter((e) => e.g >= b.g && e.g < b.g + b.len).map((e) => ({p: e.p, d: e.d}));
      const staff = doc.createElementNS(MEI_NS, 'staff'), layer = doc.createElementNS(MEI_NS, 'layer');
      staff.setAttribute('n', '2'); layer.setAttribute('n', '1'); staff.appendChild(layer);
      let extra = [];
      if (!mine.some((e) => e.p)) {
        const rest = doc.createElementNS(MEI_NS, 'mRest');
        rest.setAttributeNS(XML_NS, 'xml:id', 'lh' + bi + 'r');
        layer.appendChild(rest);
      } else {
        const shift = bi === 0 && upbeat ? b.nominal - b.len : 0;
        const mei = M.barMei({fifths: b.fifths, time: [b.count, b.unit], len: b.len, shift, events: mine, id: 'lh' + bi + 'n',
          chordAt: (pos) => spanAt(b.g + pos - shift)});
        fragment(doc, mei.layer).forEach((n) => layer.appendChild(n));
        extra = fragment(doc, mei.extra);
        mine.forEach((e) => { if (e.p) out.left += e.p.length; });
      }
      const one = kids(b.el).find((c) => c.localName === 'staff');
      b.el.insertBefore(staff, one ? one.nextSibling : b.el.firstChild);
      extra.forEach((n) => b.el.appendChild(n));
    });
  }
  if (rh) {
    // a melody note with added notes becomes a chord, the melody on top. The accidentals are written as the bar
    // then needs them: an added F sharp makes a later F of the melody, that had none, need its natural.
    bars.forEach((b) => {
      const ka = keyAlter(b.fifths), shown = {};
      const cur = (key, pname) => (key in shown ? shown[key] : ka[pname]);
      b.notes.forEach((n) => {
        const fills = [];
        (n.fill || []).forEach((p) => {
          const s = M.spellInChord({fifths: b.fifths}, p, n.info), key = s.pname + s.oct, e = doc.createElementNS(MEI_NS, 'note');
          e.setAttribute('pname', s.pname); e.setAttribute('oct', String(s.oct)); e.setAttribute('type', 'fill');
          if (s.alter !== cur(key, s.pname)) { e.setAttribute('accid', ACCID[s.alter]); shown[key] = s.alter; }
          else if (s.alter) e.setAttribute('accid.ges', ACCID_GES[s.alter]);
          fills.push(e);
        });
        if (n.written) shown[n.key] = n.alter;
        else if (cur(n.key, n.pname) !== n.alter) {   // the bar now reads it wrongly: say what it is
          const acc = accidOf(n.el);
          (acc.child || n.el).setAttribute('accid', ACCID[n.alter]);
          shown[n.key] = n.alter;
        }
        if (!fills.length) return;
        const chord = doc.createElementNS(MEI_NS, 'chord');
        chord.setAttribute('dur', n.el.getAttribute('dur') || '4');
        if (n.el.getAttribute('dots')) chord.setAttribute('dots', n.el.getAttribute('dots'));
        n.el.parentNode.replaceChild(chord, n.el);
        fills.forEach((e) => chord.appendChild(e));
        chord.appendChild(n.el);
        kids(n.el).forEach((c) => { if (c.localName === 'verse') chord.appendChild(c); });   // the words go under the chord
        out.right += fills.length;
      });
    });
  }
  return out;
}

// ---- the notes to play ----

// the order the bars are played in: a repeat sign sends the music back to the start, or to the bar after the one
// before, and the second time the first ending is left out. [index of a bar, ...]
export function playOrder(bars) {
  const order = [];
  let start = 0, repeating = false, prevEnding = 0, i = 0, guard = 0;
  const done = new Set();
  while (i < bars.length && guard++ < bars.length * 4 + 10) {
    const b = bars[i];
    if (b.rptstart) start = i;
    if (repeating && b.ending === 1) { i++; continue; }                         // the second time through
    if (repeating && b.ending === 0 && prevEnding >= 2) { repeating = false; start = i; }   // past the endings
    order.push(i);
    prevEnding = b.ending;
    if (b.rptend && !done.has(i)) { done.add(i); repeating = true; i = start; continue; }
    if (b.rptend) { repeating = false; start = i + 1; }
    i++;
  }
  return order;
}

// What a sheet sounds like, for its state as shown: {events, length, order, bars, idQ, barAt}. `choice` is how the hands
// play, `hands` whether the piano part is on (else the melody, and the chords softly under it), `loop` that it is played
// round and round (the last bar then goes on with the pattern instead of ending on one held chord). Positions and lengths
// are in quarter notes. An event is {q, d, note, vel, hand: 'm' melody | 'f' notes added to it | 'l' left hand | 'c' chord,
// ids: the elements of the sheet that light up while it sounds}.
export function scoreOf(doc, choice, {hands = false, loop = false} = {}) {
  const A = analyse(doc, hands && choice ? choice : {lh: null, rh: {add: 0}}, loop);
  if (!A) return null;
  const {M, bars, notes, chords, left, gapG, gapLeft, gapChord} = A;
  const per = bars.map(() => []);
  const barIndex = (g) => { let k = 0; while (k < bars.length - 1 && bars[k + 1].g <= g + 1e-6) k++; return k; };
  const put = (bi, e) => per[bi].push(e);
  // Strumming on the guitar sheet: the melody is played on the guitar too, in the tone chosen (not on the piano)
  const guitarMelody = !!(hands && choice && choice.lh && choice.lh.family === 'guitar');
  const melodyTone = (choice && choice.lh && choice.lh.tone) || 'warm';

  // the melody, a tied note one note (per layer); the notes added under it go with it — shaped gently by beat & length
  const prevByLayer = {};
  notes.forEach((n) => {
    const bi = bars.indexOf(n.bar), b = n.bar, ly = n.layer || 1, prev = prevByLayer[ly];
    if (n.tiedTo && prev && prev.note === n.p && Math.abs(prev.g + prev.dg - n.g) < 0.01) {
      prev.dg += n.d; prev.ids.push(xmlId(n.el));
      if (prev.fillEvents) prev.fillEvents.forEach((f) => { f.dg += n.d; });
      return;
    }
    const melVel = M.melodyVel(n.g - b.g, n.d, b.beat, ly);
    const ev = {g: n.g, dg: n.d, note: n.p, vel: melVel, hand: 'm', ids: [xmlId(n.el)].filter(Boolean)};
    if (guitarMelody) { ev.inst = 'guitar'; ev.tone = melodyTone; ev.vel = Math.min(127, Math.round(melVel * 1.2)); }   // one string against a six-string strum: a little more, so the tune leads
    put(bi, ev);
    if (n.fill) {
      const whisper = !!(A.base && A.base.feather && n.fill.length === 1);
      const fillRoll = whisper ? 0.012 : n.fill.length >= 2 ? 0.01 : 0;
      if (fillRoll) ev.off = n.fill.length * fillRoll;   // melody on top blooms cleanly out of the chord
      ev.fillEvents = n.fill.map((p, fi) => ({g: n.g, dg: n.d, note: p, vel: whisper ? Math.round(melVel * 0.55) : M.fillVel(melVel, n.fill.length, fi),
        off: fi * fillRoll, hand: 'f', ids: []}));
      ev.fillEvents.forEach((f) => put(bi, f));
    }
    prevByLayer[ly] = ev;
  });

  // the left hand, or the chords softly in its place — metrical weighting, arpeggio contour, gentle chord rolls & clean pedal lifts
  const tone = (choice && choice.lh && choice.lh.tone) || 'warm';
  const putLeft = (barEvs, b, bi, gap) => {
    const dyn = M.leftDyn(barEvs.map((e) => ({e, pos: e.g - b.g})), {nominal: b.nominal, beat: b.beat});
    barEvs.forEach((e, k) => {
      (dyn[k] || []).forEach((x) => {
        put(bi, {g: e.g, dg: x.dur, note: x.p, vel: x.vel, off: x.off, hand: 'l', inst: e.inst, mute: e.mute, pluck: e.pluck, tone: e.inst ? tone : undefined, ids: gap ? [] : ['lh' + bi + 'n' + k]});
      });
    });
  };
  if (left) {
    bars.forEach((b, bi) => putLeft(left.filter((e) => e.g >= b.g - 1e-6 && e.g < b.g + b.len - 1e-6), b, bi, false));
  } else {
    chords.forEach((c) => {
      if (!c.info) return;
      const pitches = M.chordPitches(c.ch);
      bars.forEach((b, bi) => {
        const from = Math.max(b.g, c.g), to = Math.min(b.g + b.len, c.end);
        if (to - from > 1e-6) pitches.forEach((p, k) => put(bi, {g: from, dg: to - from, note: p, vel: k ? 38 : 48, off: k * 0.01, hand: 'c', ids: []}));
      });
    });
  }

  // the bars in the order they are played
  const order = playOrder(bars), events = [], idQ = {}, barAt = [];
  let at = 0;
  order.forEach((bi) => {
    const b = bars[bi];
    barAt.push({q: at / 4, bar: bi + 1});
    per[bi].forEach((e) => {
      const q = (at + e.g - b.g) / 4;
      const out = {q, d: e.dg / 4, note: e.note, vel: e.vel, hand: e.hand, ids: e.ids};
      if (e.off) out.off = e.off;
      if (e.inst) out.inst = e.inst;
      if (e.mute) out.mute = true;
      if (e.pluck) out.pluck = true;
      if (e.tone) out.tone = e.tone;
      events.push(out);
      e.ids.forEach((id) => { if (!(id in idQ)) idQ[id] = q; });
    });
    at += b.len;
  });
  // round again, the rest before an upbeat's return keeps sounding: the accompaniment goes on (see analyse)
  if (gapG > 0 && gapChord && gapChord.info) {
    const b0 = bars[0], gb = {g: bars[bars.length - 1].g + bars[bars.length - 1].len, len: gapG, nominal: b0.nominal, beat: b0.beat}, gi = bars.length;
    per[gi] = [];
    if (gapLeft) putLeft(gapLeft.filter((e) => e.g >= gb.g - 1e-6 && e.g < gb.g + gb.len - 1e-6), gb, gi, true);
    else M.chordPitches(gapChord.ch).forEach((p, k) => put(gi, {g: gb.g, dg: gapG, note: p, vel: k ? 38 : 48, off: k * 0.01, hand: 'c', ids: []}));
    per[gi].forEach((e) => {
      const out = {q: (at + e.g - gb.g) / 4, d: e.dg / 4, note: e.note, vel: e.vel, hand: e.hand, ids: e.ids};
      if (e.off) out.off = e.off;
      if (e.inst) out.inst = e.inst;
      if (e.mute) out.mute = true;
      if (e.pluck) out.pluck = true;
      if (e.tone) out.tone = e.tone;
      events.push(out);
    });
  }
  // a chord that goes on from one bar to the next is one sound
  events.sort((x, y) => x.q - y.q || x.note - y.note);
  const open = {}, kept = [];
  events.forEach((e) => {
    if (e.hand === 'c') {
      const o = open[e.note];
      if (o && Math.abs(o.q + o.d - e.q) < 1e-6) { o.d += e.d; return; }
      open[e.note] = e;
    }
    kept.push(e);
  });
  const loopGap = A.gapG / 4;
  return {events: kept, length: at / 4, order, bars: bars.length, idQ, barAt, loopGap};
}
