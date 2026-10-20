// Sheet music: renders sheets/<id>.mei with Verovio, laid out to the width of its box.
// Ported from the Android app's viewer (app/src/main/assets/viewer/viewer.js); the music rules are the same:
// guitar sheets are derived from the piano MEI (capo from the key, chords moved down by the capo, slash basses
// dropped, a chord equal to the one before it removed), transposing goes through Verovio, and with the staff
// hidden the chords are shown over the lyrics. A translation that borrows the sheet gets its own words under the notes
// (sheetLyrics, applyLyrics below). Chord edits are kept on this device (edits.js).
import {version} from './db.js';
import {fetchGzJson} from './files.js';
import * as Edits from './edits.js';

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
const CJK = /[　-鿿＀-￯]/;
const SECTION = /^(chorus|final chorus|refrain|bridge|verse|part \d|ending|副)/i;   // labels that start a new line
const SENTENCE_END = /[.;!?。；！？][”’"')）]*$/;

export const MAX_SHIFT = 6;
export const MIN_SCALE = 20, MAX_SCALE = 90, DEFAULT_SCALE = 40;

// ---- Verovio, loaded once, on the first sheet ----

let toolkitPromise = null;

export function loadVerovio() {
  if (!toolkitPromise) {
    toolkitPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'verovio/verovio-toolkit-wasm.js' + (version ? '?v=' + version.verovio : '');
      s.onerror = () => { toolkitPromise = null; reject(new Error('could not load the music renderer')); };
      s.onload = () => {
        const m = window.verovio.module;
        const done = () => resolve(new window.verovio.toolkit());
        if (m.calledRun) done();
        else m.onRuntimeInitialized = done;
      };
      document.head.appendChild(s);
    });
  }
  return toolkitPromise;
}

// sheets and sheet lyrics come in one file per hymnal (build.py)
async function fromPack(kind, id) {
  const g = (/^([A-Z]{1,2})\d/.exec(id) || [])[1];
  const file = g && version && version[kind][g];
  if (!file) return null;
  const pack = await fetchGzJson(file);
  return pack[id] || null;
}

async function fetchMei(id) {
  const xml = await fromPack('sheets', id);
  if (!xml) throw new Error('no sheet ' + id);
  return xml;
}

function fetchLyrics(id) {
  return id ? fromPack('lyrics', id).catch(() => null) : Promise.resolve(null);
}

// the hymnals' sheet files, for offline use (the service worker keeps what is fetched)
export function prefetchAll() {
  const files = version ? [...Object.values(version.sheets), ...Object.values(version.lyrics)] : [];
  return Promise.all([loadVerovio(), ...files.map((f) => fetchGzJson(f))]);
}

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

// a chord moved by an interval; keepBass false drops the slash bass (guitar)
function moveChord(text, steps, semis, keepBass) {
  const m = CHORD.exec(text);
  if (!m) return text;                         // a free-text chord (rare): leave it
  let s = moveNote(m[1], ALT[m[2]] || 0, steps, semis) + m[3];
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
  const m = CHORD.exec(text || '');
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
  const scanBar = (m) => {
    const bar = {el: m, unit, count, events: [], len: 0};
    const walk = (e, start, factor) => {
      let onset = start;
      kids(e).forEach((c) => {
        const name = c.localName;
        if (name === 'note' || name === 'rest' || name === 'space') {
          const dur = parseInt(c.getAttribute('dur') || '4', 10), dots = parseInt(c.getAttribute('dots') || '0', 10);
          bar.events.push({id: xmlId(c), onset});
          onset += unit / dur * (2 - Math.pow(0.5, dots)) * factor;
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
    root.append(this.head, this.music, this.tail, this.verses);

    this.state = {guitar: false, shift: 0, staff: true, scale: DEFAULT_SCALE, original: false};
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
      if (!this.tk || !this.meiText || Math.abs(w - this.width) < 2) return;
      clearTimeout(this.resizeTimer);
      this.resizeTimer = setTimeout(() => this.render(), 120);
    });
    this.resizeObserver.observe(this.music);
    this.music.addEventListener('click', (e) => this.click(e));
  }

  destroy() {
    this.resizeObserver.disconnect();
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
    this.status('Loading sheet music…', 'loading');
    let xml, overlay;
    try {
      [this.tk, xml, overlay] = await Promise.all([loadVerovio(), fetchMei(sheetId), fetchLyrics(lyricsId)]);
    } catch (e) {
      if (token === this.token) this.status('Sheet music could not be loaded (' + e.message + ').', 'error');
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
    const saved = await Edits.get(sheetId);
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
      this.status('Could not render this sheet: ' + e, 'error');
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
    // edits that are now in the sheet itself (sent in and put into the sheets): forget them on this device
    const baked = Object.entries(this.edits.bars).filter(([k, e]) => {
      const bar = this.bars[parseInt(k, 10) - 1];
      return bar && sameChords(e.chords, bar.chords);
    }).map(([k]) => k);
    if (baked.length) {
      for (const k of baked) delete this.edits.bars[k];
      Edits.put(this.editsId, JSON.parse(JSON.stringify(this.edits.bars))).catch(() => {});
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
    const doc = parseXml(xml);
    const fifths = state.shift ? keyFifths(doc) : this.baseFifths;
    const tonic = TONIC[fifths + 7];
    this.steps = LETTERS.indexOf(tonic[0]) - LETTERS.indexOf(TONIC[this.baseFifths + 7][0]);

    // tail chords are plain text, so they are moved here: by the same interval as the key
    let tail = this.baseTail;
    if (tail && state.shift) {
      const steps = LETTERS.indexOf(tonic[0]) - LETTERS.indexOf(TONIC[this.baseFifths + 7][0]);
      tail = tail.map((c) => moveChord(c, steps, state.shift, true));
    }

    let capoText = '', capo = 0;
    if (state.guitar) {
      capo = CAPO[fifthsPc(fifths)];
      const iv = INTERVAL[capo];
      const chinese = /^(CS?|ZS?)\d/.test(this.shownId);   // Chinese words, also under a borrowed sheet
      capoText = capo ? (chinese ? '(吉他: Capo ' : '(Guitar: Capo ') + capo + ')' : (chinese ? '(吉他)' : '(Guitar)');
      let prev = null;
      for (const h of Array.from(mei(doc, 'harm'))) {
        const t = moveChord(h.textContent, -iv[0], -iv[1], false);
        if (t === prev) { h.parentNode.removeChild(h); continue; }
        h.textContent = t;
        prev = t;
      }
      if (tail) tail = tail.map((c) => moveChord(c, -iv[0], -iv[1], false));
    }
    this.capo.textContent = capoText;
    this.tail.textContent = tail ? tail.join('   ') : '';
    this.info = {tonic, minor: MINOR[fifths + 7], capo, fifths};

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
  }

  render() {
    if (!this.meiText) return;
    const width = this.music.clientWidth;
    this.width = width;
    this.root.classList.toggle('chart-mode', !this.state.staff);
    if (!this.state.staff) { this.renderChart(); return; }
    const scale = this.state.scale;
    this.tk.setOptions({
      pageWidth: Math.max(400, Math.round(width * 100 / scale)),
      pageHeight: 60000,
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
      await Edits.put(this.editsId, JSON.parse(JSON.stringify(this.edits.bars)));
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
  // and a new line starts after a sentence ends (verse 1; not before 6 syllables, so "Life! life!" stays together)
  // and before an ending or a section label like "Chorus".
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

    const measure = (m) => {
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
                                    pos: syl.getAttribute('wordpos'), dash: syl.getAttribute('con') === 'd'};
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
          if (SECTION.test(l)) mark(l, 'box', true);
          else ev.tags.push(l);
        });
        if (ev.syl.length || ev.chords.length) line().push(ev);
        const first = ev.syl[0] || ev.syl.filter(Boolean)[0];
        if (first) syllables++;
        if (first && first.pos !== 'i' && first.pos !== 'm' && SENTENCE_END.test(first.text) && syllables >= 6) newLine();
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
