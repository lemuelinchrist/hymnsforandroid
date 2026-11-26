// Sheet music: renders sheets/<id>.mei with Verovio, laid out to the width of its box.
// Ported from the Android app's viewer (app/src/main/assets/viewer/viewer.js); the music rules are the same:
// guitar sheets are derived from the piano MEI (capo from the key, chords moved down by the capo, slash basses
// dropped, a chord equal to the one before it removed), transposing goes through Verovio, and with the staff
// hidden the chords are shown over the lyrics. A translation that borrows the sheet gets its own words under the notes
// (sheetLyrics, applyLyrics below). Chord edits are kept on this device (edits.js). With "Both hands" a piano part is
// added to the piano sheet: a left hand made from the chords, notes of the chord under the melody (piano.js).
// The web app and the Android app's sheet viewer both run this file; where the sheets, the words and the edits come
// from is the app's (host.js).
import {host} from './host.js';
import {tr} from './i18n.js';
import {addPiano} from './piano.js';
import {simplifyBars} from './simplify.js';

const MEI_NS = 'http://www.music-encoding.org/ns/mei';
const XML_NS = 'http://www.w3.org/XML/1998/namespace';
const CAPO = {0: 0, 1: 1, 2: 0, 3: 1, 4: 2, 5: 3, 6: 4, 7: 0, 8: 1, 9: 0, 10: 3, 11: 4};
const INTERVAL = {0: [0, 0], 1: [1, 1], 2: [1, 2], 3: [2, 3], 4: [2, 4]};   // capo -> [letter steps, semitones] down
const LETTERS = 'CDEFGAB';
const NAT = {C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11};
const SIGN = {'-2': '𝄫', '-1': '♭', '0': '', '1': '♯', '2': '𝄪'};
const ALT = {'♭': -1, '♯': 1, '𝄫': -2, '𝄪': 2};
const CHORD = /^([A-G])(𝄫|𝄪|♭|♯)?(.*?)(?:\/([A-G])(𝄫|𝄪|♭|♯)?)?$/;
const TONIC = ['C♭', 'G♭', 'D♭', 'A♭', 'E♭', 'B♭', 'F', 'C', 'G', 'D', 'A', 'E', 'B', 'F♯', 'C♯'];   // by fifths + 7
const MINOR = ['A♭', 'E♭', 'B♭', 'F', 'C', 'G', 'D', 'A', 'E', 'B', 'F♯', 'C♯', 'G♯', 'D♯', 'A♯'];
// a chord written with # and b (the lead sheet editor's) read as the sheets write it, ♯ and ♭: only the root and the bass
const symbolic = (t) => (t || '').replace(/^([A-G])([#b])/, (m, l, a) => l + (a === '#' ? '♯' : '♭')).replace(/\/([A-G])([#b])/, (m, l, a) => '/' + l + (a === '#' ? '♯' : '♭'));
const CJK = /[　-鿿＀-￯]/;
const SECTION = /^(chorus|final chorus|refrain|bridge|verse|part \d|ending|副)/i;   // labels that start a new line
const SENTENCE_END = /[.;!?。；！？][”’"')）]*$/;

export const MAX_SHIFT = 6;
export const MIN_SCALE = 20, MAX_SCALE = 90, DEFAULT_SCALE = 40;
// a printed page's music in CSS pixels: A4 and Letter less 12 mm margins (703 x 1032, 726 x 965), less the title
const PRINT_WIDTH = 700, PRINT_HEIGHT = 860;

// ---- Verovio, loaded once, on the first sheet ----

let toolkitPromise = null;
let leadSheetPromise = null;

function loadLeadSheet() {
  if (window.LeadSheet) return Promise.resolve();
  if (!leadSheetPromise) {
    leadSheetPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'music.js';
      s.onload = () => resolve();
      s.onerror = () => { leadSheetPromise = null; reject(new Error('could not load piano rules')); };
      document.head.appendChild(s);
    });
  }
  return leadSheetPromise;
}

export function loadVerovio() {
  if (!toolkitPromise) {
    toolkitPromise = Promise.all([
      loadLeadSheet(),
      new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = host.verovio();
        s.onerror = () => reject(new Error('could not load the music renderer'));
        s.onload = () => {
          const m = window.verovio.module;
          const done = () => resolve(new window.verovio.toolkit());
          if (m.calledRun) done();
          else m.onRuntimeInitialized = done;
        };
        document.head.appendChild(s);
      }),
    ]).then(([, tk]) => tk).catch((e) => { toolkitPromise = null; throw e; });
  }
  return toolkitPromise;
}

const fetchMei = (id) => host.mei(id);
const fetchLyrics = (id) => (id ? host.lyrics(id).catch(() => null) : Promise.resolve(null));

// the same sheet with the words of another language (sheetLyrics/<hymn>.json, made by tools/sheet-lyrics/align.py):
// syllables under the notes (verse 1), the verses below the staff and the title are swapped in before anything else.
// Ported from the app's viewer.js.
function applyLyrics(xml, o) {
  const doc = parseXml(xml);
  for (const note of Array.from(doc.getElementsByTagNameNS(MEI_NS, 'note'))) {
    const id = note.getAttributeNS(XML_NS, 'id');
    let s = o.syl && o.syl[id];
    if (s === undefined) continue;
    const verses = Array.from(note.getElementsByTagNameNS(MEI_NS, 'verse'));
    for (let v = verses.length - 1; v >= 0; v--) {
      if (verses[v].getAttribute('n') !== '1') continue;
      if (s === 0) {                                  // the syllable before is held over this note: none of its own
        verses[v].parentNode.removeChild(verses[v]);
        continue;
      }
      const syl = verses[v].getElementsByTagNameNS(MEI_NS, 'syl')[0];
      if (!syl) continue;
      if (typeof s === 'string') s = [s, null];       // a whole word on one note
      // two Chinese characters on one note simply sit side by side (the tie sign is for syllables)
      syl.textContent = CJK.test(s[0]) ? s[0].replace(/\u203f/g, '') : s[0];
      if (s[1]) syl.setAttribute('wordpos', s[1]); else syl.removeAttribute('wordpos');
      if (s[2] === 'u') syl.setAttribute('con', 'u');                    // held over the next note: an extender line
      else if (s[1] === 'i' || s[1] === 'm') syl.setAttribute('con', 'd');
      else syl.removeAttribute('con');
    }
  }
  for (const t of Array.from(doc.getElementsByTagNameNS(MEI_NS, 'title'))) {
    if (t.getAttribute('type') === 'main' && o.title) t.textContent = o.title;
    if (t.getAttribute('type') === 'subordinate') t.textContent = o.subtitle || '';
  }
  let back = doc.getElementsByTagNameNS(MEI_NS, 'back')[0];
  if (back) back.parentNode.removeChild(back);
  if (o.verses && o.verses.length) {
    const music = doc.getElementsByTagNameNS(MEI_NS, 'music')[0];
    back = doc.createElementNS(MEI_NS, 'back');
    const div = doc.createElementNS(MEI_NS, 'div');
    div.setAttribute('type', 'verses');
    for (const verse of o.verses) {
      const lg = doc.createElementNS(MEI_NS, 'lg');
      lg.setAttribute('label', verse.label);
      for (const line of verse.lines) {
        const l = doc.createElementNS(MEI_NS, 'l');
        l.textContent = line;
        lg.appendChild(l);
      }
      div.appendChild(lg);
    }
    back.appendChild(div);
    music.appendChild(back);
  }
  return new XMLSerializer().serializeToString(doc);
}

// ---- chord and key arithmetic ----

// move a note name by [letter steps, semitones] (negative = down)
function moveNote(letter, alt, steps, semis) {
  const nl = LETTERS[((LETTERS.indexOf(letter) + steps) % 7 + 7) % 7];
  const pc = ((NAT[letter] + alt + semis) % 12 + 12) % 12;
  let a = pc - NAT[nl];
  if (a > 6) a -= 12;
  if (a < -6) a += 12;
  return nl + SIGN[a];
}

// the guitar's chord: major, minor and the sevenths (7, m7, maj7) are kept, sus2 and sus4 become sus; add, 6, 5 and
// augmented are made plain. Chords that depend on their context are left out, null: diminished and half-diminished (usually
// passing chords) and the 9, 11 and 13 chords (embellishments); the chord before simply goes on.
function guitarQuality(q) {
  q = (q || '').replace(/[()]/g, '');
  if (/^(min|m(?!aj)|-)7[♭b]5|^ø|^(dim|°|o)/.test(q)) return null;
  const sus = /sus/.test(q) ? 'sus' : '';
  q = q.replace(/sus[24]?/g, '').replace(/add\d+/g, '').replace(/^(aug|\+)/, '').replace(/[♭♯b#]\d+/g, '');
  const m = /^(min|m(?!aj)|-)?(maj|M|Δ)?(\d*)/.exec(q), minor = m[1] ? 'm' : '', n = +m[3];
  if (n >= 9) return null;
  return minor + (m[2] ? 'maj7' : n === 7 ? '7' : '') + sus;
}

// a chord moved by an interval; keepBass false is the guitar's: no slash bass, a plainer chord
function moveChord(text, steps, semis, keepBass) {
  const m = CHORD.exec(symbolic(text));
  if (!m) return text;                         // a free-text chord (rare): leave it
  const quality = keepBass ? m[3] : guitarQuality(m[3]);
  if (quality === null) return '';             // a chord the guitar leaves out
  let s = moveNote(m[1], ALT[m[2]] || 0, steps, semis) + quality;
  if (keepBass && m[4]) s += '/' + moveNote(m[4], ALT[m[5]] || 0, steps, semis);
  return s;
}

// key signature as a number of fifths (flats negative). The converter writes key.sig, Verovio's export keysig
// and leaves it out for C major.
function keyFifths(doc) {
  for (const d of ['scoreDef', 'staffDef', 'keySig']) {
    for (const el of doc.getElementsByTagNameNS(MEI_NS, d)) {
      const sig = el.getAttribute('key.sig') || el.getAttribute('keysig') || el.getAttribute('sig');
      const m = sig && /^(\d+)([sf])?$/.exec(sig);
      if (m) return parseInt(m[1], 10) * (m[2] === 'f' ? -1 : 1);
    }
  }
  return 0;
}

// "B♭m7/E" -> {root: 'B', acc: '♭', quality: 'm7', bass: 'E', bassAcc: ''}; null when it is not a chord
export function splitChord(text) {
  const m = CHORD.exec(symbolic(text));
  return m ? {root: m[1], acc: m[2] || '', quality: m[3], bass: m[4] || '', bassAcc: m[5] || ''} : null;
}

function fifthsPc(f) { return ((f * 7) % 12 + 12) % 12; }
function parseXml(xml) { return new DOMParser().parseFromString(xml, 'application/xml'); }
function mei(el, name) { return el.getElementsByTagNameNS(MEI_NS, name); }
function kids(el) { return Array.prototype.filter.call(el.childNodes, (n) => n.nodeType === 1); }
function xmlId(el) { return el.getAttributeNS(XML_NS, 'id') || el.getAttribute('xml:id'); }

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

// ---- bars, chords and beats (for editing) ----
// A bar is a <measure>, counted from 1 in file order. Beats are the MEI tstamps: 1 is the first beat, in units of the
// meter's unit (quarters in 4/4, eighths in 6/8).

function scanBars(doc) {
  const bars = [];
  let unit = 4, count = 4;
  // each note's pitch class too (by its own accidental, else the key's: enough for the editor's hint of which chords fit)
  const fifths = keyFifths(doc), sharp = 'FCGDAEB'.slice(0, Math.max(0, fifths)), flat = 'BEADGCF'.slice(0, Math.max(0, -fifths));
  const pcOf = (c) => {
    const l = (c.getAttribute('pname') || '').toUpperCase(), a = c.getAttribute('accid') || c.getAttribute('accid.ges');
    if (!(l in NAT)) return null;
    const alt = a ? ({s: 1, f: -1, n: 0, x: 2, ss: 2, ff: -2}[a] || 0) : sharp.includes(l) ? 1 : flat.includes(l) ? -1 : 0;
    return ((NAT[l] + alt) % 12 + 12) % 12;
  };
  const scanBar = (m) => {
    const bar = {el: m, unit, count, events: [], len: 0};
    const walk = (e, start, factor) => {
      let onset = start;
      kids(e).forEach((c) => {
        const name = c.localName;
        if (name === 'note' || name === 'rest' || name === 'space') {
          const dur = parseInt(c.getAttribute('dur') || '4', 10), dots = parseInt(c.getAttribute('dots') || '0', 10);
          const len = unit / dur * (2 - Math.pow(0.5, dots)) * factor;
          bar.events.push({id: xmlId(c), onset, len, pc: name === 'note' ? pcOf(c) : null});
          onset += len;
        } else if (name === 'tuplet') {
          onset = walk(c, onset, factor * parseInt(c.getAttribute('numbase') || '2', 10) / parseInt(c.getAttribute('num') || '3', 10));
        } else if (name === 'beam') {
          onset = walk(c, onset, factor);
        } else if (name === 'staff' || name === 'layer') {
          const end = walk(c, 1, factor);
          if (name === 'layer') bar.len = Math.max(bar.len, end - 1);
        }
      });
      return onset;
    };
    walk(m, 1, 1);
    bar.chords = kids(m).filter((c) => c.localName === 'harm')
      .map((c) => [Math.round(parseFloat(c.getAttribute('tstamp') || '1') * 1000) / 1000, c.textContent])
      .sort((a, b) => a[0] - b[0]);
    return bar;
  };
  (function walk(e) {
    kids(e).forEach((c) => {
      const name = c.localName;
      if (name === 'measure') bars.push(scanBar(c));
      else if (name === 'scoreDef' || name === 'staffDef') {
        if (c.getAttribute('meter.unit')) unit = parseInt(c.getAttribute('meter.unit'), 10);
        if (c.getAttribute('meter.count')) count = parseInt(c.getAttribute('meter.count'), 10) || count;
        walk(c);
      } else if (name === 'section' || name === 'staffGrp' || name === 'ending') walk(c);
    });
  })(mei(doc, 'score')[0]);
  return bars;
}

// the same chord however it is spelled: the sheets print dim as °, aug as + (tools/svg-to-lilypond/tools/chord_edits.py)
const normChord = (c) => (c || '').replace(/\s+/g, '').replace(/dim/g, '°').replace(/aug/g, '+').replace(/b5/g, '♭5');
const sameChords = (a, b) => a.length === b.length && a.every((c, i) => Math.abs(c[0] - b[i][0]) < 1e-3 && normChord(c[1]) === normChord(b[i][1]));

// Simplify: the chords of each bar by simplify.js (level light, medium or easy), as [bar index, chords]; the bars the user
// edited are left as they are. Only what is shown: the sound is made from the sheet before this.
function simplifyPlan(doc, level) {
  const bars = scanBars(doc);
  const edited = new Set();
  bars.forEach((b, i) => { if (kids(b.el).some((c) => c.localName === 'harm' && c.getAttribute('type') === 'edit')) edited.add(i); });
  const res = simplifyBars(bars, level, edited);
  return res.map((chords, i) => (chords ? [i, chords] : null)).filter(Boolean);
}

function applyPlan(doc, plan) {
  const measures = Array.from(mei(doc, 'measure'));
  for (const [i, chords] of plan) {
    const m = measures[i];
    if (!m) continue;
    const old = kids(m).filter((c) => c.localName === 'harm');
    const staff = (old[0] && old[0].getAttribute('staff')) || '1';
    old.forEach((c) => m.removeChild(c));
    chords.forEach(([t, text]) => {
      const hm = doc.createElementNS(MEI_NS, 'harm');
      hm.setAttribute('staff', staff);
      hm.setAttribute('tstamp', String(t));
      hm.setAttribute('place', 'above');
      hm.textContent = text;
      m.appendChild(hm);
    });
  }
}

// replace the chords of the edited bars; the harms that are not in the original get type="edit"
function applyEdits(doc, bars, edits) {
  for (const [key, e] of Object.entries(edits)) {
    const bar = bars[parseInt(key, 10) - 1];
    if (!bar) continue;
    const staff = (mei(bar.el, 'staff')[0] || {getAttribute: () => '1'}).getAttribute('n') || '1';
    kids(bar.el).forEach((c) => { if (c.localName === 'harm') bar.el.removeChild(c); });
    const had = new Set(bar.chords.map((c) => c[0] + ' ' + c[1]));
    e.chords.forEach(([t, text]) => {
      const h = doc.createElementNS(MEI_NS, 'harm');
      h.setAttribute('staff', staff);
      h.setAttribute('tstamp', String(t));
      h.setAttribute('place', 'above');
      if (!had.has(t + ' ' + text)) h.setAttribute('type', 'edit');
      h.textContent = text;
      bar.el.appendChild(h);
    });
  }
}

// the sheet as it sounds with this device's chord edits (the bars as edits.js keeps them), for playing it without a view
export function soundDoc(xml, editBars) {
  const doc = parseXml(xml);
  if (editBars && Object.keys(editBars).length) applyEdits(doc, scanBars(doc), editBars);
  return doc;
}

// the tempo a sheet names for itself (quarter notes a minute; our own sheets: midi.bpm of the score), or 0
// the capo the guitar sheet of this sheet's key shows (0-4)
export function capoOf(doc) { return CAPO[fifthsPc(keyFifths(doc))]; }

export function bpmOf(doc) {
  const sd = mei(doc, 'scoreDef')[0];
  return sd ? Math.round(parseFloat(sd.getAttribute('midi.bpm')) || 0) : 0;
}

// the piano part a sheet of ours starts with (<identifier type="hands">strike/two/half rh=1:beat</identifier>: the editor's
// style family/kind/rhythm, and optionally the notes added to the right hand), as a piano.js choice, or null
export function handsOf(doc) {
  for (const id of mei(doc, 'identifier')) {
    if (id.getAttribute('type') !== 'hands') continue;
    const m = /^\s*(\w+)\/(\w+)\/(\w+)(?:\/(-?\d))?(?:\s+rh=([012]):(\w+))?\s*$/.exec(id.textContent);
    if (m) return {lh: {family: m[1], kind: m[2], rhythm: m[3], oct: m[4] ? parseInt(m[4], 10) : 0, pedal: false}, rh: {add: m[5] ? parseInt(m[5], 10) : 0, on: m[6] || 'chord'}};
  }
  return null;
}

// ---- the view ----

export class SheetView {
  constructor(root) {
    this.root = root;
    root.classList.add('sheet');
    root.innerHTML = '';
    this.head = el('header', 'sheet-head');
    this.titleRow = el('div', 'sheet-titlerow');
    this.spacer = el('div', 'sheet-no sheet-spacer');
    this.titles = el('div', 'sheet-titles');
    this.title = el('h2', 'sheet-title');
    this.subtitle = el('div', 'sheet-subtitle');
    this.number = el('div', 'sheet-no');
    this.titles.append(this.title, this.subtitle);
    this.titleRow.append(this.spacer, this.titles, this.number);
    this.capo = el('div', 'sheet-capo');
    this.head.append(this.titleRow, this.capo);
    this.music = el('div', 'sheet-music');
    this.tail = el('div', 'sheet-tail');
    this.verses = el('section', 'sheet-verses');
    this.credit = el('footer', 'sheet-credit');   // where the sheet is from, as in the Android viewer
    root.append(this.head, this.music, this.tail, this.verses, this.credit);

    this.state = {guitar: false, shift: 0, staff: true, scale: DEFAULT_SCALE, original: false, hands: false, simplify: ''};
    this.piano = null;             // how the hands play when state.hands is on (piano.js: {lh, rh}); the app sets it
    this.baseBpm = 0;              // the tempo the sheet names itself (midi.bpm), 0 when it names none
    this.baseHands = null;         // the piano part the sheet starts with (handsOf), null when it names none
    this.onSheet = null;           // called when a sheet has been read, before it is drawn
    this.soundXml = null;          // the MEI as it sounds: in this key, with the edits, without the guitar's changes
    this.renders = 0;              // how many times the music was drawn (the player lights notes up again after one)
    this.failed = false;
    this.onsound = null;
    this.time = [4, 4];            // the sheet's time signature (of its first whole bar)
    this.editing = false;
    this.selected = null;          // the bar being edited
    this.bars = [];                // the bars of the sheet as the file has them (no edits)
    this.edits = {bars: {}};
    this.history = [];
    this.save = {status: 'idle', timer: null, busy: false, again: false};
    this.onedited = null;
    this.onpick = null;
    this.info = {tonic: '', capo: 0};
    this.onchange = null;
    this.tk = null;
    this.baseXml = null;
    this.token = 0;
    this.width = 0;

    // re-lay out when the box changes width (window resize, side panel opened)
    this.resizeObserver = new ResizeObserver(() => {
      const w = this.music.clientWidth;
      if (!this.tk || !this.meiText || this.printing || Math.abs(w - this.width) < 2) return;
      clearTimeout(this.resizeTimer);
      this.resizeTimer = setTimeout(() => this.render(), 120);
    });
    this.resizeObserver.observe(this.music);
    this.music.addEventListener('click', (e) => this.click(e));
    // printing (Print in ⋯, or the browser's own): the music laid out for paper while it prints, then for the screen again
    this.printing = false;
    this.onBeforePrint = () => this.setPrinting(true);
    this.onAfterPrint = () => this.setPrinting(false);
    addEventListener('beforeprint', this.onBeforePrint);
    addEventListener('afterprint', this.onAfterPrint);
  }

  // Paper: a page's width whatever the screen's, at the reader's size but never smaller than the usual one, cut into
  // pages (Verovio's) that fit an A4 or Letter page with the title above the first, so no line of music is cut in two
  setPrinting(on) {
    if (this.printing === !!on) return;
    this.printing = !!on;
    if (this.tk && this.meiText) this.render();
  }

  destroy() {
    this.resizeObserver.disconnect();
    removeEventListener('beforeprint', this.onBeforePrint);
    removeEventListener('afterprint', this.onAfterPrint);
    this.token++;
    this.flush();
  }

  status(msg, cls = '') {
    this.music.innerHTML = '';
    this.music.appendChild(el('div', 'sheet-status ' + cls, msg));
  }

  // show a sheet; state = {guitar, shift, staff, scale}; lyricsId = a translation whose words go under the notes
  async show(sheetId, state, lyricsId = null) {
    const token = ++this.token;
    Object.assign(this.state, state);
    this.sheetId = sheetId;
    this.shownId = sheetId;
    this.baseXml = null;
    this.meiText = null;
    this.failed = false;
    this.status(tr('Loading sheet music…'), 'loading');
    let xml, overlay;
    try {
      [this.tk, xml, overlay] = await Promise.all([loadVerovio(), fetchMei(sheetId), fetchLyrics(lyricsId)]);
    } catch (e) {
      if (token === this.token) {
        this.failed = true;
        const offline = !navigator.onLine || /failed to fetch|network|load failed/i.test(e.message);
        this.status(offline ? tr('This sheet is not on this device yet. Open it once while you are online and it will work offline.')
          : tr('Sheet music could not be loaded ({0}).', e.message), 'error');
      }
      return;
    }
    if (token !== this.token) return;
    await this.flush();
    if (overlay) {
      try {
        xml = applyLyrics(xml, overlay);
        this.shownId = overlay.hymn || lyricsId;
      } catch (e) { /* the sheet with its own words */ }
    }
    this.lyricsShown = !!overlay;
    this.editsId = sheetId;
    const saved = await host.edits.get(sheetId);
    if (token !== this.token) return;
    this.edits = {bars: saved ? saved.bars : {}};
    this.history = [];
    this.selected = null;
    this.save.status = 'idle';
    this.load(xml);
    this.update();
  }

  set(changes) {
    Object.assign(this.state, changes);
    if (this.baseXml) {
      if ('original' in changes) this.prepare();
      this.update();
    }
  }

  update() {
    try {
      this.build();
      this.render();
    } catch (e) {
      this.failed = true;
      this.status(tr('Could not render this sheet: {0}', e), 'error');
    }
    if (this.onchange) this.onchange(this.state, this.info);
    if (this.onedited) this.onedited('view');
  }

  // header, verses and tail chords come from the file once; the music is rebuilt for each state
  load(xml) {
    this.pristine = xml;
    this.prepare();
  }

  prepare() {
    const doc = parseXml(this.pristine);
    this.bars = scanBars(doc);
    const whole = this.bars.find((b) => b.len >= b.count - 1e-6) || this.bars[0];
    this.time = whole ? [whole.count, whole.unit] : [4, 4];
    // edits that are now in the sheet itself (sent in and put into the sheets): forget them on this device
    const baked = Object.entries(this.edits.bars).filter(([k, e]) => {
      const bar = this.bars[parseInt(k, 10) - 1];
      return bar && sameChords(e.chords, bar.chords);
    }).map(([k]) => k);
    if (baked.length) {
      for (const k of baked) delete this.edits.bars[k];
      host.edits.put(this.editsId, JSON.parse(JSON.stringify(this.edits.bars))).catch(() => {});
    }
    const showEdits = !this.state.original && Object.keys(this.edits.bars).length > 0;
    this.stale = Object.entries(this.edits.bars).filter(([k, e]) => {
      const bar = this.bars[parseInt(k, 10) - 1];
      return !bar || (e.was && !sameChords(e.was, bar.chords));
    }).map(([k]) => parseInt(k, 10));
    if (showEdits) applyEdits(doc, this.bars, this.edits.bars);
    this.title.textContent = '';
    this.subtitle.textContent = '';
    for (const t of mei(doc, 'title')) {
      if (t.getAttribute('type') === 'main') this.title.textContent = t.textContent;
      if (t.getAttribute('type') === 'subordinate') this.subtitle.textContent = t.textContent;
    }
    // a sheet made for this app (transcribed from a recording) names itself; all others came from hymnal.net
    let credit = 'www.hymnal.net';
    // a sheet of chords over the words, with no melody yet (kind "chords"): its notes only carry the words and chords,
    // so it is always drawn with the staff hidden and its chords cannot be edited
    this.chordsOnly = false;
    for (const id of mei(doc, 'identifier')) {
      if (id.getAttribute('type') === 'source' && id.textContent) credit = id.textContent;
      if (id.getAttribute('type') === 'kind' && id.textContent === 'chords') this.chordsOnly = true;
    }
    this.credit.textContent = credit;
    // the hymn ID (the printed number is missing on NS and CH sheets); the hidden copy keeps the title centred
    this.number.textContent = this.shownId;
    this.spacer.textContent = this.shownId;

    this.verses.innerHTML = '';
    for (const lg of mei(doc, 'lg')) {
      const st = el('div', 'sheet-stanza');
      st.appendChild(el('div', 'label', lg.getAttribute('label') || ''));
      const lines = el('div', 'lines');
      for (const l of mei(lg, 'l')) lines.appendChild(el('div', null, l.textContent));
      st.appendChild(lines);
      this.verses.appendChild(st);
    }

    this.baseTail = null;
    for (const d of mei(doc, 'div')) {
      if (d.getAttribute('type') === 'tailChords') this.baseTail = d.textContent.trim().split(/\s+/);
    }
    const back = mei(doc, 'back')[0];
    if (back) back.parentNode.removeChild(back);
    this.baseFifths = keyFifths(doc);
    this.baseBpm = bpmOf(doc);
    this.baseHands = handsOf(doc);
    if (this.onSheet) this.onSheet();
    this.baseXml = new XMLSerializer().serializeToString(doc);
  }

  // the MEI for the current state: transposed by Verovio (notes, key signature and chord symbols), then made
  // into the guitar version from the new key
  build() {
    const {tk, state} = this;
    let xml = this.baseXml;
    if (state.shift) {
      tk.setOptions({transpose: (state.shift > 0 ? '+' : '') + state.shift});
      tk.loadData(xml);
      xml = tk.getMEI();
      tk.setOptions({transpose: ''});
    }
    this.soundXml = xml;
    let doc = parseXml(xml);
    const fifths = state.shift ? keyFifths(doc) : this.baseFifths;
    const tonic = TONIC[fifths + 7];
    // Simplify: the chords worked out on the sheet as it is (before the guitar's capo and the piano part)
    const plan = state.simplify && !this.editing && !this.chordsOnly ? simplifyPlan(doc, state.simplify) : null;
    this.steps = LETTERS.indexOf(tonic[0]) - LETTERS.indexOf(TONIC[this.baseFifths + 7][0]);

    // tail chords are plain text, so they are moved here: by the same interval as the key
    let tail = this.baseTail;
    if (tail && state.shift) {
      const steps = LETTERS.indexOf(tonic[0]) - LETTERS.indexOf(TONIC[this.baseFifths + 7][0]);
      tail = tail.map((c) => moveChord(c, steps, state.shift, true));
    }

    let capoText = '', capo = 0;
    if (state.guitar) {
      if (plan) applyPlan(doc, plan);
      capo = CAPO[fifthsPc(fifths)];
      const iv = INTERVAL[capo];
      const chinese = /^(CS?|ZS?)\d/.test(this.shownId);   // Chinese words, also under a borrowed sheet
      capoText = capo ? (chinese ? '(吉他: Capo ' : '(Guitar: Capo ') + capo + ')' : (chinese ? '(吉他)' : '(Guitar)');
      let prev = null;
      for (const h of Array.from(mei(doc, 'harm'))) {
        const t = moveChord(h.textContent, -iv[0], -iv[1], false);
        if (t === prev || t === '') { h.parentNode.removeChild(h); continue; }
        h.textContent = t;
        prev = t;
      }
      if (tail) tail = tail.map((c) => moveChord(c, -iv[0], -iv[1], false)).filter(Boolean);
    }
    this.capo.textContent = capoText;
    this.tail.textContent = tail ? tail.join('   ') : '';
    this.info = {tonic, minor: MINOR[fifths + 7], capo, fifths};

    // both hands: the piano part is made for the sheet as it now is (this key, these chords), and only where there
    // is a staff to read it from
    this.handsShown = false;
    if (state.hands && this.piano && !state.guitar && state.staff && !this.chordsOnly) {
      try {
        const both = doc.cloneNode(true), added = addPiano(both, this.piano);   // on a copy: all of it, or the sheet as it was
        if (added.left + added.right > 0) { doc = both; this.handsShown = true; }
      } catch (e) {
        console.error('piano part', e);
      }
    }

    if (plan && !state.guitar) applyPlan(doc, plan);   // (with the piano part made from the chords as they sound)

    // ids the clicks can be traced back with: bar-<n> for the bars, chord-<n>-<beat> for the chords
    if (this.editing) {
      Array.from(mei(doc, 'measure')).forEach((m, i) => {
        m.setAttributeNS(XML_NS, 'xml:id', 'bar-' + (i + 1));
        kids(m).forEach((c) => {
          if (c.localName === 'harm') c.setAttributeNS(XML_NS, 'xml:id', 'chord-' + (i + 1) + '-' + parseFloat(c.getAttribute('tstamp') || '1'));
        });
      });
    }
    this.meiDoc = doc;
    this.meiText = new XMLSerializer().serializeToString(doc);
    if (this.onsound) this.onsound();
  }

  render() {
    if (!this.meiText) return;
    this.renders++;
    const width = this.printing ? PRINT_WIDTH : this.music.clientWidth;
    if (!this.printing) this.width = width;
    const chart = !this.state.staff || this.chordsOnly;
    this.root.classList.toggle('chart-mode', chart);
    if (chart) { this.renderChart(); return; }
    const scale = this.printing ? Math.max(DEFAULT_SCALE, this.state.scale) : this.state.scale;
    this.tk.setOptions({
      pageWidth: Math.max(400, Math.round(width * 100 / scale)),
      pageHeight: this.printing ? Math.round(PRINT_HEIGHT * 100 / scale) : 60000,
      adjustPageHeight: true,
      scale,
      breaks: 'auto',
      header: 'none',
      footer: 'none',
      pageMarginLeft: 20,
      pageMarginRight: 20,
      pageMarginTop: 0,
      pageMarginBottom: 0,
      fontTextLiberation: true,   // Times widths, embedded in the SVG, so lyrics are spaced as Verovio measured them
      lyricWordSpace: 3,
      lyricSize: 4.5,
    });
    this.tk.loadData(this.meiText);
    let html = '';
    for (let p = 1; p <= this.tk.getPageCount(); p++) html += this.tk.renderToSVG(p);
    this.music.style.minHeight = this.music.offsetHeight + 'px';   // the page does not jump while it is redrawn
    this.music.innerHTML = html;
    this.music.style.minHeight = '';
    this.music.classList.toggle('editing', this.editing);
    this.mark();
  }

  // ---- editing the chords ----
  // The edits are kept per sheet as {bars: {<bar>: {was: [[beat, chord]], chords: [[beat, chord]]}}} in the
  // original key, and saved on this device (edits.js). A bar's list replaces all the chords of that bar.

  setEditing(on, changes = {}) {
    if (on && this.chordsOnly) return;
    if (on === this.editing && !Object.keys(changes).length) return;
    Object.assign(this.state, changes);
    this.editing = on;
    if (!on) this.selected = null;
    if (this.baseXml) {
      if ('original' in changes) this.prepare();
      this.update();
    }
    if (this.onedited) this.onedited('mode');
  }

  hasEdits() { return Object.keys(this.edits.bars).length > 0; }

  // the chords of a bar as they are now, in the key being shown
  chordsOf(bar) {
    const e = this.edits.bars[bar];
    const list = e ? e.chords : (this.bars[bar - 1] ? this.bars[bar - 1].chords : []);
    return list.map(([t, c]) => [t, this.toShown(c)]);
  }

  // what a bar looks like, for the editor: its beats and which of them have a note starting
  barInfo(bar) {
    const b = this.bars[bar - 1];
    if (!b) return null;
    const len = Math.max(b.len, 1);
    const beats = [];
    const step = b.unit >= 4 ? 0.5 : 1;
    for (let t = 1; t < len + 1 - 1e-6; t += step) beats.push(t);
    b.events.forEach((ev) => { if (ev.onset < len + 1 - 1e-6 && !beats.some((t) => Math.abs(t - ev.onset) < 1e-3)) beats.push(ev.onset); });
    this.chordsOf(bar).forEach(([t]) => { if (!beats.some((x) => Math.abs(x - t) < 1e-3)) beats.push(t); });
    beats.sort((a, b2) => a - b2);
    return {count: this.bars.length, beats: beats.map((t) => Math.round(t * 1000) / 1000),
      notes: b.events.map((ev) => ev.onset), edited: !!this.edits.bars[bar]};
  }

  // how much of the melody from a beat of a bar to the bar's next chord (or its end) each chord holds: 0..1 each.
  // `chords` are in the key being shown; a hint for the editor's chords of the key.
  fit(bar, beat, chords) {
    const b = this.bars[bar - 1], M = window.LeadSheet;
    if (!b || !M) return chords.map(() => 0);
    const next = this.chordsOf(bar).map(([t]) => t).filter((t) => t > beat + 1e-3).sort((x, y) => x - y)[0] || Infinity;
    const w = {};
    let sum = 0;
    b.events.forEach((ev) => {
      if (ev.pc == null || ev.onset < beat - 1e-3 || ev.onset >= next - 1e-3) return;
      const pc = ((ev.pc + this.state.shift) % 12 + 12) % 12;
      w[pc] = (w[pc] || 0) + ev.len; sum += ev.len;
    });
    return chords.map((ch) => {
      const c = M.chordInfo(ch);
      if (!c || !sum) return 0;
      let hit = 0;
      c.tones.forEach((t) => { hit += w[(c.root + t[0]) % 12] || 0; });
      return hit / sum;
    });
  }

  toShown(chord) { return this.state.shift ? moveChord(chord, this.steps, this.state.shift, true) : chord; }
  toOriginal(chord) { return this.state.shift ? moveChord(chord, -this.steps, -this.state.shift, true) : chord; }

  // replace the chords of a bar; `chords` are in the key being shown
  setBar(bar, chords) {
    const b = this.bars[bar - 1];
    if (!b) return;
    this.history.push(JSON.stringify(this.edits.bars));
    const list = chords.filter(([, c]) => c).map(([t, c]) => [Math.round(t * 1000) / 1000, this.toOriginal(c)])
      .sort((x, y) => x[0] - y[0]);
    if (sameChords(list, b.chords)) delete this.edits.bars[bar];
    else this.edits.bars[bar] = {was: b.chords, chords: list};
    this.changed();
  }

  undo() {
    if (!this.history.length) return false;
    this.edits.bars = JSON.parse(this.history.pop());
    this.changed();
    return true;
  }

  changed() {
    this.prepare();
    this.update();
    this.queueSave();
    if (this.onedited) this.onedited('edit');
  }

  select(bar) {
    this.selected = bar;
    this.mark();
    const g = this.music.querySelector('#bar-' + bar);
    if (g) {
      const r = g.getBoundingClientRect(), room = this.panelHeight || 0;
      if (r.top < 60 || r.bottom > window.innerHeight - room) g.scrollIntoView({block: 'center', behavior: 'smooth'});
    }
  }

  mark() {
    this.music.querySelectorAll('.bar-selected').forEach((g) => g.classList.remove('bar-selected'));
    if (this.editing && this.selected) {
      const g = this.music.querySelector('#bar-' + this.selected);
      if (g) g.classList.add('bar-selected');
    }
  }

  click(e) {
    if (!this.editing || !this.onpick) return;
    const t = e.target.closest ? e.target : e.target.parentNode;
    const harm = t.closest('g.harm'), note = t.closest('g.note, g.rest');
    let measure = t.closest('g.measure');
    if (!measure) {
      // the empty space inside a bar does not take clicks in SVG: find the bar whose box holds the point
      measure = Array.from(this.music.querySelectorAll('g.measure')).find((g) => {
        const r = g.getBoundingClientRect();
        return e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
      });
    }
    if (!measure) return;
    const bar = parseInt(measure.id.replace('bar-', ''), 10);
    let beat = null;
    if (harm) {
      const m = /^chord-\d+-(.+)$/.exec(harm.id);
      if (m) beat = parseFloat(m[1]);
    } else if (note) {
      const ev = this.bars[bar - 1] && this.bars[bar - 1].events.find((x) => x.id === note.id);
      if (ev) beat = ev.onset;
    }
    this.onpick({bar, beat});
  }

  // ---- saving ----

  queueSave() {
    this.save.status = 'pending';
    clearTimeout(this.save.timer);
    this.save.timer = setTimeout(() => this.send(), 300);
    if (this.onedited) this.onedited('save');
  }

  flush() {
    if (this.save.status !== 'pending' && this.save.status !== 'error') return Promise.resolve();
    clearTimeout(this.save.timer);
    return this.send();
  }

  async send() {
    if (this.save.busy) { this.save.again = true; return; }
    this.save.busy = true;
    this.save.status = 'saving';
    try {
      await host.edits.put(this.editsId, JSON.parse(JSON.stringify(this.edits.bars)));
      this.save.status = 'saved';
    } catch (e) {
      this.save.status = 'error';
    }
    this.save.busy = false;
    if (this.save.status === 'error') {
      clearTimeout(this.save.timer);
      this.save.timer = setTimeout(() => this.send(), 5000);
    } else if (this.save.again) {
      this.save.again = false;
      await this.send();
    }
    if (this.onedited) this.onedited('save');
  }

  // ---- staff hidden: chords over the lyrics ----
  // Each note or rest gets a start beat; a chord goes over the last note starting at or before its tstamp.
  // The sheet's system breaks were made for a letter page, so they are ignored: the lyrics flow to the box width,
  // and a new line starts where the sheet marks the end of a line of the words (eol="1" on the syllable, set by
  // tools/sheet-lines/mark_lines.py from the database's stanzas); a sheet without marks guesses: after a sentence ends
  // (verse 1; not before 6 syllables, so "Life! life!" stays together). A new line also starts before an ending or a
  // section label like "Chorus".
  chartData(doc) {
    let verseCount = 1;
    for (const v of mei(doc, 'verse')) verseCount = Math.max(verseCount, parseInt(v.getAttribute('n') || '1', 10));

    const lines = [[]];
    let unit = 4, syllables = 0;
    const line = () => lines[lines.length - 1];
    const newLine = () => { if (line().length) lines.push([]); syllables = 0; };
    const mark = (text, cls, breaks) => {
      if (breaks) newLine();
      line().push({mark: text, cls: cls || ''});
    };
    const readUnit = (e) => { if (e.getAttribute('meter.unit')) unit = parseInt(e.getAttribute('meter.unit'), 10); };

    const chordsOnly = this.chordsOnly;
    const marked = !chordsOnly && Array.from(mei(doc, 'syl')).some((y) => y.getAttribute('eol') === '1');
    const measure = (m) => {
      if (chordsOnly) newLine();   // a chords-only sheet has one bar per line of the words
      if (m.getAttribute('left') === 'rptstart') mark('‖:');
      const events = [], byId = {};
      let onset = 1;
      (function walk(e, factor) {
        kids(e).forEach((c) => {
          const name = c.localName;
          if (name === 'note' || name === 'rest' || name === 'space') {
            const dur = parseInt(c.getAttribute('dur') || '4', 10), dots = parseInt(c.getAttribute('dots') || '0', 10);
            const beats = unit / dur * (2 - Math.pow(0.5, dots)) * factor;
            const ev = {onset, chords: [], labels: [], tags: [], syl: []};
            kids(c).forEach((v) => {
              if (v.localName !== 'verse') return;
              const n = parseInt(v.getAttribute('n') || '1', 10) - 1;
              const lab = mei(v, 'label')[0], syl = mei(v, 'syl')[0];
              if (syl) ev.syl[n] = {text: (lab ? lab.textContent + ' ' : '') + syl.textContent,
                                    pos: syl.getAttribute('wordpos'), dash: syl.getAttribute('con') === 'd',
                                    eol: syl.getAttribute('eol') === '1'};
            });
            events.push(ev);
            if (xmlId(c)) byId[xmlId(c)] = ev;
            onset += beats;
          } else if (name === 'tuplet') {
            walk(c, factor * parseInt(c.getAttribute('numbase') || '2', 10) / parseInt(c.getAttribute('num') || '3', 10));
          } else if (name === 'beam' || name === 'staff' || name === 'layer') {
            walk(c, factor);
          }
        });
      })(m, 1);

      kids(m).forEach((c) => {
        if (c.localName === 'harm') {
          const ts = parseFloat(c.getAttribute('tstamp') || '1');
          let at = null;
          events.forEach((ev) => { if (ev.onset <= ts + 1e-6) at = ev; });
          if (at) at.chords.push(c.textContent);
        } else if (c.localName === 'dir') {
          const ev = byId[(c.getAttribute('startid') || '').replace('#', '')];
          if (ev) ev.labels.push(c.textContent.trim());
        }
      });

      events.forEach((ev) => {
        // section labels go in the line as a box; others ("Sisters", "D.C. al Fine") as a small tag in the chord row
        ev.labels.forEach((l) => {
          l = l === 'scripts.segno' ? 'Segno' : l;
          if (SECTION.test(l) || chordsOnly) mark(l, 'box', true);   // chords-only: stanza numbers too
          else ev.tags.push(l);
        });
        if (ev.syl.length || ev.chords.length) line().push(ev);
        const first = ev.syl[0] || ev.syl.filter(Boolean)[0];
        if (first) syllables++;
        // the end of a line of the words: marked in the sheet (tools/sheet-lines), else guessed from the punctuation
        if (marked ? ev.syl[0] && ev.syl[0].eol
          : first && first.pos !== 'i' && first.pos !== 'm' && SENTENCE_END.test(first.text) && syllables >= 6 && !chordsOnly) newLine();
      });
      if (m.getAttribute('right') === 'rptend') mark(':‖');
    };

    (function walk(e) {
      kids(e).forEach((c) => {
        const name = c.localName;
        if (name === 'measure') measure(c);
        else if (name === 'scoreDef' || name === 'staffDef') { readUnit(c); walk(c); }
        else if (name === 'ending') { mark(c.getAttribute('label') || ((c.getAttribute('n') || '') + '.'), 'box', true); walk(c); }
        else if (name === 'section' || name === 'staffGrp') walk(c);
      });
    })(mei(doc, 'score')[0]);

    return {lines: lines.filter((l) => l.length), verseCount};
  }

  renderChart() {
    const data = this.chartData(this.meiDoc);
    const chart = el('div', 'chart');
    chart.style.fontSize = (this.state.scale / DEFAULT_SCALE) + 'em';
    data.lines.forEach((events) => {
      const lineEl = el('div', 'cline');
      // only the verse rows this line uses (a hymn with a second verse under the chorus only has one elsewhere)
      const used = [];
      events.forEach((ev) => { (ev.syl || []).forEach((s, v) => { if (s) used[v] = true; }); });
      const rows = [];
      for (let r = 0; r < data.verseCount; r++) if (used[r]) rows.push(r);
      if (!rows.length) rows.push(0);
      let word = null, inWord = false;
      events.forEach((ev) => {
        if (ev.mark) {
          lineEl.appendChild(el('span', 'mark ' + ev.cls, ev.mark));
          word = null; inWord = false;
          return;
        }
        // a new word starts unless the first verse is in the middle of one (verse 1 decides where lines may wrap)
        const first = ev.syl[0] || ev.syl.filter(Boolean)[0];
        const starts = first ? (first.pos !== 'm' && first.pos !== 't') : !inWord;
        if (starts || !word) {
          // Chinese has no spaces between words: each character is its own syllable, so no word gap
          word = el('span', first && CJK.test(first.text) ? 'word cjk' : 'word');
          lineEl.appendChild(word);
        }
        if (first) inWord = first.pos === 'i' || first.pos === 'm';

        const seg = el('span', 'cseg');
        const ch = el('span', 'ch');
        ev.tags.forEach((t) => ch.appendChild(el('span', 'tag', t)));
        ch.appendChild(document.createTextNode(ev.chords.join('  ')));
        seg.appendChild(ch);
        rows.forEach((v) => {
          const s = ev.syl[v];
          seg.appendChild(el('span', 'ly', s ? s.text + (s.dash ? '-' : '') : ''));
        });
        word.appendChild(seg);
      });
      chart.appendChild(lineEl);
    });
    this.music.innerHTML = '';
    this.music.appendChild(chart);
  }
}
