// Sheet music: renders sheets/<id>.mei with Verovio, laid out to the width of its box.
// Ported from the Android app's viewer (app/src/main/assets/viewer/viewer.js); the music rules are the same:
// guitar sheets are derived from the piano MEI (capo from the key, chords moved down by the capo, slash basses
// dropped, a chord equal to the one before it removed), transposing goes through Verovio, and with the staff
// hidden the chords are shown over the lyrics.

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
      s.src = 'verovio/verovio-toolkit-wasm.js';
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

const meiCache = new Map();

function fetchMei(id) {
  if (!meiCache.has(id)) {
    meiCache.set(id, fetch('sheets/' + encodeURIComponent(id) + '.mei').then((r) => {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.text();
    }).catch((e) => { meiCache.delete(id); throw e; }));
  }
  return meiCache.get(id);
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

    this.state = {guitar: false, shift: 0, staff: true, scale: DEFAULT_SCALE};
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
  }

  destroy() {
    this.resizeObserver.disconnect();
    this.token++;
  }

  status(msg, cls = '') {
    this.music.innerHTML = '';
    this.music.appendChild(el('div', 'sheet-status ' + cls, msg));
  }

  // show a sheet; state = {guitar, shift, staff, scale}
  async show(sheetId, state) {
    const token = ++this.token;
    Object.assign(this.state, state);
    this.sheetId = sheetId;
    this.baseXml = null;
    this.meiText = null;
    this.status('Loading sheet music…', 'loading');
    let xml;
    try {
      [this.tk, xml] = await Promise.all([loadVerovio(), fetchMei(sheetId)]);
    } catch (e) {
      if (token === this.token) this.status('Sheet music could not be loaded (' + e.message + ').', 'error');
      return;
    }
    if (token !== this.token) return;
    this.load(xml);
    this.update();
  }

  set(changes) {
    Object.assign(this.state, changes);
    if (this.baseXml) this.update();
  }

  update() {
    try {
      this.build();
      this.render();
    } catch (e) {
      this.status('Could not render this sheet: ' + e, 'error');
    }
    if (this.onchange) this.onchange(this.state, this.info);
  }

  // header, verses and tail chords come from the file once; the music is rebuilt for each state
  load(xml) {
    const doc = parseXml(xml);
    this.title.textContent = '';
    this.subtitle.textContent = '';
    for (const t of mei(doc, 'title')) {
      if (t.getAttribute('type') === 'main') this.title.textContent = t.textContent;
      if (t.getAttribute('type') === 'subordinate') this.subtitle.textContent = t.textContent;
    }
    // the hymn ID (the printed number is missing on NS and CH sheets); the hidden copy keeps the title centred
    this.number.textContent = this.sheetId;
    this.spacer.textContent = this.sheetId;

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
      const chinese = /^CS?\d/.test(this.sheetId);
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
    this.music.innerHTML = html;
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
