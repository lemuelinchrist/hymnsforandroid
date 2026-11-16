// The piano part ("Both hands"): a left hand made from the sheet's chords by a pattern, on a second staff, and notes of
// the chord added under the melody. Nothing of it is in the sheets: it is worked out here for the sheet as it is shown
// (transposed, with this device's chord edits), by the rules of the lead sheet editor (tools/lead-sheet-editor), whose
// music.js build.py copies into the app (window.LeadSheet).
//
// A choice is {lh: {family, kind, rhythm, oct, pedal} | null, rh: {add: 0 | 1 | 2, on: 'chord' | 'beat' | 'long' | 'all'}}:
// the names of a style of music.js, so that it fits every time signature (an arpeggio in 3/4 is not the one in 4/4).

const MEI_NS = 'http://www.music-encoding.org/ns/mei';
const XML_NS = 'http://www.w3.org/XML/1998/namespace';
const STEP = {c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11};
const ACC = {s: 1, f: -1, n: 0, x: 2, ss: 2, ff: -2};
const ACCID = {'-2': 'ff', '-1': 'f', '0': 'n', '1': 's', '2': 'x'}, ACCID_GES = {'-2': 'ff', '-1': 'f', '1': 's', '2': 'ss'};

export const DEFAULT = {lh: {family: 'strike', kind: 'hymn', rhythm: 'held', oct: 0, pedal: false}, rh: {add: 0, on: 'beat'}};

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
  const kind = fam.kinds.find((k) => k.id === lh.kind) || fam.kinds[0];
  const r = kind.rhythms.find((x) => x.id === lh.rhythm) || kind.rhythms.find((x) => x.id === '8') || kind.rhythms[0];   // an arpeggio starts in eighths
  return {pat: r.pat, rate: r.rate, low: r.low + 12 * (lh.oct || 0), pedal: !!lh.pedal && r.rate > 0,
    family: fam.id, kind: kind.id, rhythm: r.id};
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
    const staff = kids(m).find((c) => c.localName === 'staff');
    let end = 0;
    const walk = (e, start, factor) => {
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
            bar.notes.push({el: c, g: g + at, d, p: 12 * (oct + 1) + STEP[pname] + alter, alter, written: acc.written != null, key, pname,
              tiedTo: tiedTo.has(xmlId(c)) || tie === 'm' || tie === 't'});
          }
          at += d;
        } else if (name === 'mRest' || name === 'mSpace') at += nominal;
        else if (name === 'tuplet') at = walk(c, at, factor * parseInt(c.getAttribute('numbase') || '2', 10) / parseInt(c.getAttribute('num') || '3', 10));
        else if (name === 'beam' || name === 'layer') at = walk(c, at, factor);
      });
      return at;
    };
    if (staff) kids(staff).forEach((layer) => { if (layer.localName === 'layer') end = Math.max(end, walk(layer, 0, 1)); });
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
  return bars;
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

// Adds the piano part to a parsed sheet (in place): choice as above. Returns what it added: {left, right} (numbers
// of notes), for the tests.
export function addPiano(doc, choice) {
  const M = lib(), bars = readBars(doc), out = {left: 0, right: 0};
  if (!M || !bars.length || !choice) return out;
  const endG = bars[bars.length - 1].g + bars[bars.length - 1].len;
  const upbeat = bars.length > 1 && bars[0].len < bars[0].nominal;
  const first = upbeat ? bars[0].len : 0;
  const whole = bars.find((x) => x.len >= x.nominal) || bars[0];

  // the melody: every note, and the notes as they sound (a tied note goes on in the one before it)
  const notes = [].concat(...bars.map((b) => b.notes.map((n) => Object.assign(n, {bar: b}))));
  const sound = [];
  let last = -1;
  notes.forEach((n) => {
    const prev = sound[sound.length - 1];
    if (n.tiedTo && prev && Math.abs(prev[1] - n.g) < 0.01) prev[1] = n.g + n.d;
    else { sound.push([n.g, n.g + n.d]); last = n.g; }
  });
  const harms = [].concat(...bars.map((b) => b.harms)).sort((a, b) => a.g - b.g);
  const chords = M.chordsOnBeat(harms, bars, sound, endG);

  // the right hand: notes of the chord under the melody
  const rh = choice.rh && choice.rh.add > 0 ? choice.rh : null;
  if (rh) {
    let k = -1, info = null;
    notes.forEach((n) => {
      while (k + 1 < harms.length && harms[k + 1].g <= n.g + 0.01) { k++; info = M.chordInfo(harms[k].ch); }
      if (!info) return;
      const onChord = k >= 0 && Math.abs(harms[k].g - n.g) < 0.01, long = n.d >= 2 * n.bar.beat - 0.01;
      const onBeat = Math.abs(((n.g - n.bar.g) % n.bar.beat)) < 0.01;
      const want = rh.on === 'all' ? true : rh.on === 'chord' ? onChord : rh.on === 'long' ? long : onBeat || long;
      if (!want) return;
      const ps = M.fillUnder(n.p, info, rh.add);
      if (ps.length) { n.fill = ps; n.info = info; }
    });
  }

  // the left hand
  const base = pattern(choice.lh, [whole.count, whole.unit]);
  let left = null;
  if (base && M.parsePattern(base.pat).length) {
    const mel = notes.map((n) => [n.g, n.g + n.d, n.fill ? n.fill[0] : n.p]);
    left = M.accompanyOn({bars: bars.map((b) => ({g: b.g, len: b.len})), first, chords, mel, last, base}).events;
  }

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
