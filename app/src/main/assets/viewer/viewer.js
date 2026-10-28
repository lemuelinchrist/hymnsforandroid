// Sheet music viewer: renders sheetMei/<id>.mei with Verovio, laid out to the screen width.
// Guitar sheets are derived here from the piano MEI: capo from the key, chords moved down by the capo,
// slash basses dropped, a chord equal to the one before it removed (tools/svg-to-lilypond/DESIGN.md §10, §19).
// A bar (shown and hidden by a tap) switches piano/guitar, transposes, and hides the staff (chords over lyrics).
// Chord edits (made on big screens, ?edit=1; editor.js) are kept by the app and drawn in place of the sheet's chords.
(function () {
  'use strict';

  var params = new URLSearchParams(location.search);
  var hymnId = params.get('id');
  var shownId = hymnId;                       // the number printed at the top right (the translation's own when lyrics are swapped)
  if (params.get('dark') === '1') document.documentElement.classList.add('dark');

  var MEI_NS = 'http://www.music-encoding.org/ns/mei';
  var XML_NS = 'http://www.w3.org/XML/1998/namespace';
  var CAPO = {0: 0, 1: 1, 2: 0, 3: 1, 4: 2, 5: 3, 6: 4, 7: 0, 8: 1, 9: 0, 10: 3, 11: 4};
  var INTERVAL = {0: [0, 0], 1: [1, 1], 2: [1, 2], 3: [2, 3], 4: [2, 4]};   // capo -> [letter steps, semitones] down
  var LETTERS = 'CDEFGAB';
  var NAT = {C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11};
  var SIGN = {'-2': '𝄫', '-1': '♭', '0': '', '1': '♯', '2': '𝄪'};
  var ALT = {'♭': -1, '♯': 1, '𝄫': -2, '𝄪': 2};
  var CHORD = /^([A-G])(𝄫|𝄪|♭|♯)?(.*?)(?:\/([A-G])(𝄫|𝄪|♭|♯)?)?$/;
  var TONIC = ['C♭', 'G♭', 'D♭', 'A♭', 'E♭', 'B♭', 'F', 'C', 'G', 'D', 'A', 'E', 'B', 'F♯', 'C♯'];   // by fifths + 7
  var MAX_SHIFT = 6;
  var CJK = /[\u3000-\u9fff\uff00-\uffef]/;
  var SECTION = /^(chorus|final chorus|refrain|bridge|verse|part \d|ending|副)/i;   // labels that start a new line
  var SENTENCE_END = /[.;!?。；！？][”’"')）]*$/;

  // what the bar controls; reset every time the sheet is opened. Guitar opens with the staff hidden (chords over lyrics)
  var guitarDefault = params.get('variant') === 'guitar';
  var state = {guitar: guitarDefault, shift: 0, staff: !guitarDefault};

  var tk = null, scale = 40;
  var baseXml = null, baseFifths = 0, baseTail = null;   // the MEI as loaded (no <back>), its key, its tail chords
  var meiText = null, meiDoc = null;                      // the MEI for the current state
  var pristineXml = null;                                 // the MEI as loaded, before the chord edits go in

  // chord editing: the bars of the sheet as the file has them, this device's edits of them and the editor's state
  // (editor.js uses this object; the web app's SheetView has the same members)
  var editable = params.get('edit') === '1';
  var editing = false, editor = null;
  var view = {bars: [], edits: {}, history: [], stale: [], selected: null, steps: 0, panelHeight: 0, saveStatus: 'idle', onpick: null};

  function $(id) { return document.getElementById(id); }

  function status(msg) { $('music').innerHTML = '<div id="status"></div>'; $('status').textContent = msg; }

  // move a note name by [letter steps, semitones] (negative = down)
  function moveNote(letter, alt, steps, semis) {
    var nl = LETTERS[((LETTERS.indexOf(letter) + steps) % 7 + 7) % 7];
    var pc = ((NAT[letter] + alt + semis) % 12 + 12) % 12;
    var a = pc - NAT[nl];
    if (a > 6) a -= 12;
    if (a < -6) a += 12;
    return nl + SIGN[a];
  }

  // a chord moved by an interval; keepBass false drops the slash bass (guitar)
  function moveChord(text, steps, semis, keepBass) {
    var m = CHORD.exec(text);
    if (!m) return text;                         // a free-text chord (rare): leave it
    var s = moveNote(m[1], ALT[m[2]] || 0, steps, semis) + m[3];
    if (keepBass && m[4]) s += '/' + moveNote(m[4], ALT[m[5]] || 0, steps, semis);
    return s;
  }

  // key signature as a number of fifths (flats negative). The converter writes key.sig, Verovio's export keysig
  // and leaves it out for C major.
  function keyFifths(doc) {
    var defs = ['scoreDef', 'staffDef', 'keySig'];
    for (var d = 0; d < defs.length; d++) {
      var els = doc.getElementsByTagNameNS(MEI_NS, defs[d]);
      for (var i = 0; i < els.length; i++) {
        var sig = els[i].getAttribute('key.sig') || els[i].getAttribute('keysig') || els[i].getAttribute('sig');
        var m = sig && /^(\d+)([sf])?$/.exec(sig);
        if (m) return parseInt(m[1], 10) * (m[2] === 'f' ? -1 : 1);
      }
    }
    return 0;
  }

  function fifthsPc(f) { return ((f * 7) % 12 + 12) % 12; }

  function parseXml(xml) { return new DOMParser().parseFromString(xml, 'application/xml'); }

  // header, verses and tail chords come from the file once; the music is rebuilt for each state
  function load(xml) {
    var doc = parseXml(xml);
    var q = function (sel) { return doc.getElementsByTagNameNS(MEI_NS, sel); };
    var titles = q('title');
    for (var i = 0; i < titles.length; i++) {
      if (titles[i].getAttribute('type') === 'main') $('title').textContent = titles[i].textContent;
      if (titles[i].getAttribute('type') === 'subordinate') $('subtitle').textContent = titles[i].textContent;
    }
    // the hymn ID as the app shows it everywhere else (the printed number is missing on NS and CH sheets);
    // the hidden copy on the left keeps the title centred
    $('number').textContent = shownId;
    $('spacer').textContent = shownId;

    var verses = $('verses');
    verses.innerHTML = '';
    var lgs = q('lg');
    for (i = 0; i < lgs.length; i++) {
      var st = document.createElement('div');
      st.className = 'stanza';
      var lab = document.createElement('div');
      lab.className = 'label';
      lab.textContent = lgs[i].getAttribute('label') || '';
      var lines = document.createElement('div');
      lines.className = 'lines';
      var ls = lgs[i].getElementsByTagNameNS(MEI_NS, 'l');
      for (var k = 0; k < ls.length; k++) {
        var d = document.createElement('div');
        d.textContent = ls[k].textContent;
        lines.appendChild(d);
      }
      st.appendChild(lab);
      st.appendChild(lines);
      verses.appendChild(st);
    }
    // all stanzas as wide as the widest, so they share one left edge (one column on a phone, more if they fit)
    var stanzas = verses.children, widest = 0;
    for (i = 0; i < stanzas.length; i++) widest = Math.max(widest, stanzas[i].getBoundingClientRect().width);
    for (i = 0; i < stanzas.length; i++) stanzas[i].style.width = (Math.ceil(widest) + 1) + 'px';

    var divs = q('div');
    for (i = 0; i < divs.length; i++) {
      if (divs[i].getAttribute('type') === 'tailChords') baseTail = divs[i].textContent.trim().split(/\s+/);
    }
    var back = q('back')[0];
    if (back) back.parentNode.removeChild(back);
    baseFifths = keyFifths(doc);
    pristineXml = new XMLSerializer().serializeToString(doc);
    view.edits = loadEdits();
    prepare();
  }

  // the MEI for the current state: transposed by Verovio (notes, key signature and chord symbols), then made
  // into the guitar version from the new key
  function build() {
    var xml = baseXml;
    if (state.shift) {
      tk.setOptions({transpose: (state.shift > 0 ? '+' : '') + state.shift});
      tk.loadData(xml);
      xml = tk.getMEI();
      tk.setOptions({transpose: ''});
    }
    var doc = parseXml(xml);
    var fifths = state.shift ? keyFifths(doc) : baseFifths;
    var tonic = TONIC[fifths + 7];
    view.steps = LETTERS.indexOf(tonic[0]) - LETTERS.indexOf(TONIC[baseFifths + 7][0]);

    // tail chords are plain text, so they are moved here: by the same interval as the key
    var tail = baseTail;
    if (tail && state.shift) {
      tail = tail.map(function (c) { return moveChord(c, view.steps, state.shift, true); });
    }

    var capoText = '';
    if (state.guitar) {
      var capo = CAPO[fifthsPc(fifths)];
      var iv = INTERVAL[capo];
      var chinese = /^CS?\d/.test(hymnId);
      capoText = capo ? (chinese ? '(吉他: Capo ' : '(Guitar: Capo ') + capo + ')' : (chinese ? '(吉他)' : '(Guitar)');
      var harms = Array.prototype.slice.call(doc.getElementsByTagNameNS(MEI_NS, 'harm'));
      var prev = null;
      harms.forEach(function (h) {
        var t = moveChord(h.textContent, -iv[0], -iv[1], false);
        if (t === prev) { h.parentNode.removeChild(h); return; }
        h.textContent = t;
        prev = t;
      });
      if (tail) tail = tail.map(function (c) { return moveChord(c, -iv[0], -iv[1], false); });
    }
    $('capo').textContent = capoText;
    $('tail').textContent = tail ? tail.join('   ') : '';
    $('key').textContent = tonic + (state.shift ? ' (' + (state.shift > 0 ? '+' : '') + state.shift + ')' : '');

    // ids a tap can be traced back with: bar-<n> for the bars, chord-<n>-<beat> for the chords
    if (editing) {
      Array.prototype.forEach.call(mei(doc, 'measure'), function (m, i) {
        m.setAttributeNS(XML_NS, 'xml:id', 'bar-' + (i + 1));
        kids(m).forEach(function (c) {
          if (c.localName === 'harm') c.setAttributeNS(XML_NS, 'xml:id', 'chord-' + (i + 1) + '-' + parseFloat(c.getAttribute('tstamp') || '1'));
        });
      });
    }

    meiDoc = doc;
    meiText = new XMLSerializer().serializeToString(doc);
  }

  function render() {
    if (!state.staff) { renderChart(); return; }
    var width = $('music').clientWidth;   // the page width less the margins and any camera cutout
    tk.setOptions({
      pageWidth: Math.round(width * 100 / scale),
      pageHeight: 60000,
      adjustPageHeight: true,
      scale: scale,
      breaks: 'auto',
      header: 'none',
      footer: 'none',
      pageMarginLeft: 20,
      pageMarginRight: 20,
      pageMarginTop: 0,
      pageMarginBottom: 0,
      // Verovio spaces lyrics with Times widths; Android has no Times and draws a wider serif, so syllables
      // touched. Liberation Serif has Times widths and Verovio embeds it in the SVG.
      fontTextLiberation: true,
      lyricWordSpace: 3,
      lyricSize: 4.5
    });
    tk.loadData(meiText);
    var html = '';
    for (var p = 1; p <= tk.getPageCount(); p++) html += tk.renderToSVG(p);
    $('music').innerHTML = html;
    $('music').classList.toggle('editing', editing);
    mark();
  }

  // ---- staff hidden: chords over the lyrics ----
  // Each note or rest gets a start beat; a chord goes over the last note starting at or before its tstamp.
  // The sheet's system breaks were made for a letter page, so they are ignored: the lyrics flow to the screen width,
  // and a new line starts after a sentence ends (verse 1; not before 6 syllables, so "Life! life!" stays together)
  // and before an ending or a section label like "Chorus".

  function mei(el, name) { return el.getElementsByTagNameNS(MEI_NS, name); }
  function kids(el) { return Array.prototype.filter.call(el.childNodes, function (n) { return n.nodeType === 1; }); }
  function xmlId(el) { return el.getAttributeNS(XML_NS, 'id') || el.getAttribute('xml:id'); }

  function chartData(doc) {
    var verseCount = 1;
    var vs = mei(doc, 'verse');
    for (var i = 0; i < vs.length; i++) verseCount = Math.max(verseCount, parseInt(vs[i].getAttribute('n') || '1', 10));

    var lines = [[]], unit = 4;
    function line() { return lines[lines.length - 1]; }
    var syllables = 0;   // verse-1 syllables in the current line
    function newLine() { if (line().length) lines.push([]); syllables = 0; }
    function mark(text, cls, breaks) {
      if (breaks) newLine();
      line().push({mark: text, cls: cls || ''});
    }

    function readUnit(el) { if (el.getAttribute('meter.unit')) unit = parseInt(el.getAttribute('meter.unit'), 10); }

    function measure(m) {
      if (m.getAttribute('left') === 'rptstart') mark('‖:');
      var events = [], byId = {}, onset = 1;
      (function walk(el, factor) {
        kids(el).forEach(function (c) {
          var name = c.localName;
          if (name === 'note' || name === 'rest' || name === 'space') {
            var dur = parseInt(c.getAttribute('dur') || '4', 10), dots = parseInt(c.getAttribute('dots') || '0', 10);
            var beats = unit / dur * (2 - Math.pow(0.5, dots)) * factor;
            var ev = {onset: onset, chords: [], labels: [], tags: [], syl: []};
            kids(c).forEach(function (v) {
              if (v.localName !== 'verse') return;
              var n = parseInt(v.getAttribute('n') || '1', 10) - 1;
              var lab = mei(v, 'label')[0], syl = mei(v, 'syl')[0];
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

      kids(m).forEach(function (c) {
        if (c.localName === 'harm') {
          var ts = parseFloat(c.getAttribute('tstamp') || '1'), at = null;
          events.forEach(function (ev) { if (ev.onset <= ts + 1e-6) at = ev; });
          if (at) at.chords.push(c.textContent);
        } else if (c.localName === 'dir') {
          var ev = byId[(c.getAttribute('startid') || '').replace('#', '')];
          if (ev) ev.labels.push(c.textContent.trim());
        }
      });

      events.forEach(function (ev) {
        // section labels go in the line as a box; others ("Sisters", "D.C. al Fine") as a small tag in the chord row,
        // so they do not split a word
        ev.labels.forEach(function (l) {
          l = l === 'scripts.segno' ? 'Segno' : l;
          if (SECTION.test(l)) mark(l, 'box', true);
          else ev.tags.push(l);
        });
        if (ev.syl.length || ev.chords.length) line().push(ev);
        var first = ev.syl[0] || ev.syl.filter(Boolean)[0];
        if (first) syllables++;
        if (first && first.pos !== 'i' && first.pos !== 'm' && SENTENCE_END.test(first.text) && syllables >= 6) newLine();
      });
      var right = m.getAttribute('right');
      if (right === 'rptend') mark(':‖');
    }

    (function walk(el) {
      kids(el).forEach(function (c) {
        var name = c.localName;
        if (name === 'measure') measure(c);
        else if (name === 'scoreDef' || name === 'staffDef') { readUnit(c); walk(c); }
        else if (name === 'ending') { mark(c.getAttribute('label') || ((c.getAttribute('n') || '') + '.'), 'box', true); walk(c); }
        else if (name === 'section' || name === 'staffGrp') walk(c);
      });
    })(mei(doc, 'score')[0]);

    return {lines: lines.filter(function (l) { return l.length; }), verseCount: verseCount};
  }

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function renderChart() {
    var data = chartData(meiDoc);
    var chart = el('div');
    chart.id = 'chart';
    chart.style.fontSize = (scale / 40) + 'em';
    data.lines.forEach(function (events) {
      var lineEl = el('div', 'cline');
      // only the verse rows this line uses (a hymn with a second verse under the chorus only has one elsewhere)
      var used = [];
      events.forEach(function (ev) { (ev.syl || []).forEach(function (s, v) { if (s) used[v] = true; }); });
      var rows = [];
      for (var r = 0; r < data.verseCount; r++) if (used[r]) rows.push(r);
      if (!rows.length) rows.push(0);
      var word = null, inWord = false;
      events.forEach(function (ev) {
        if (ev.mark) {
          lineEl.appendChild(el('span', 'mark ' + ev.cls, ev.mark));
          word = null; inWord = false;
          return;
        }
        // a new word starts unless the first verse is in the middle of one (verse 1 decides where lines may wrap)
        var first = ev.syl[0] || ev.syl.filter(Boolean)[0];
        var starts = first ? (first.pos !== 'm' && first.pos !== 't') : !inWord;
        if (starts || !word) {
          // Chinese has no spaces between words: each character is its own syllable, so no word gap
          word = el('span', first && CJK.test(first.text) ? 'word cjk' : 'word');
          lineEl.appendChild(word);
        }
        if (first) inWord = first.pos === 'i' || first.pos === 'm';

        var seg = el('span', 'cseg');
        var ch = el('span', 'ch');
        ev.tags.forEach(function (t) { ch.appendChild(el('span', 'tag', t)); });
        ch.appendChild(document.createTextNode(ev.chords.join('  ')));
        seg.appendChild(ch);
        rows.forEach(function (v) {
          var s = ev.syl[v];
          seg.appendChild(el('span', 'ly', s ? s.text + (s.dash ? '-' : '') : ''));
        });
        word.appendChild(seg);
      });
      chart.appendChild(lineEl);
    });
    $('music').innerHTML = '';
    $('music').appendChild(chart);
  }

  // ---- chord edits ----
  // Per sheet, {"<bar>": {was: [[beat, chord]], chords: [[beat, chord]]}}: a bar is the nth <measure> (from 1), a beat
  // its tstamp, the chords are in the original key and replace all the chords of that bar; `was` is what the bar had,
  // to notice when the sheet changes under an edit. The app keeps them (window.HymnsEdits, ChordEdits.java) in the web
  // app's format, so the files move between the two and can be put into the sheets (tools/web/README.md).

  // the bars of the sheet: their element, chords and the beat every note or rest starts on
  function scanBars(doc) {
    var bars = [], unit = 4;
    function scanBar(m) {
      var bar = {el: m, unit: unit, events: [], len: 0};
      (function walk(e, start, factor) {
        var onset = start;
        kids(e).forEach(function (c) {
          var name = c.localName;
          if (name === 'note' || name === 'rest' || name === 'space') {
            var dur = parseInt(c.getAttribute('dur') || '4', 10), dots = parseInt(c.getAttribute('dots') || '0', 10);
            bar.events.push({id: xmlId(c), onset: onset});
            onset += unit / dur * (2 - Math.pow(0.5, dots)) * factor;
          } else if (name === 'tuplet') {
            onset = walk(c, onset, factor * parseInt(c.getAttribute('numbase') || '2', 10) / parseInt(c.getAttribute('num') || '3', 10));
          } else if (name === 'beam') {
            onset = walk(c, onset, factor);
          } else if (name === 'staff' || name === 'layer') {
            var end = walk(c, 1, factor);
            if (name === 'layer') bar.len = Math.max(bar.len, end - 1);
          }
        });
        return onset;
      })(m, 1, 1);
      bar.chords = kids(m).filter(function (c) { return c.localName === 'harm'; })
        .map(function (c) { return [Math.round(parseFloat(c.getAttribute('tstamp') || '1') * 1000) / 1000, c.textContent]; })
        .sort(function (a, b) { return a[0] - b[0]; });
      return bar;
    }
    (function walk(e) {
      kids(e).forEach(function (c) {
        var name = c.localName;
        if (name === 'measure') bars.push(scanBar(c));
        else if (name === 'scoreDef' || name === 'staffDef') {
          if (c.getAttribute('meter.unit')) unit = parseInt(c.getAttribute('meter.unit'), 10);
          walk(c);
        } else if (name === 'section' || name === 'staffGrp' || name === 'ending') walk(c);
      });
    })(mei(doc, 'score')[0]);
    return bars;
  }

  // the same chord however it is spelled: the sheets print dim as °, aug as + (tools/svg-to-lilypond/tools/chord_edits.py)
  function normChord(c) { return (c || '').replace(/\s+/g, '').replace(/dim/g, '°').replace(/aug/g, '+').replace(/b5/g, '♭5'); }
  function sameChords(a, b) {
    return a.length === b.length && a.every(function (c, i) { return Math.abs(c[0] - b[i][0]) < 1e-3 && normChord(c[1]) === normChord(b[i][1]); });
  }

  // replace the chords of the edited bars; the harms that are not in the original get type="edit" (drawn red)
  function applyEdits(doc, bars, edits) {
    Object.keys(edits).forEach(function (key) {
      var bar = bars[parseInt(key, 10) - 1];
      if (!bar) return;
      var staffEl = mei(bar.el, 'staff')[0];
      var staff = (staffEl && staffEl.getAttribute('n')) || '1';
      kids(bar.el).forEach(function (c) { if (c.localName === 'harm') bar.el.removeChild(c); });
      var had = bar.chords.map(function (c) { return c[0] + ' ' + c[1]; });
      edits[key].chords.forEach(function (c) {
        var h = doc.createElementNS(MEI_NS, 'harm');
        h.setAttribute('staff', staff);
        h.setAttribute('tstamp', String(c[0]));
        h.setAttribute('place', 'above');
        if (had.indexOf(c[0] + ' ' + c[1]) < 0) h.setAttribute('type', 'edit');
        h.textContent = c[1];
        bar.el.appendChild(h);
      });
    });
  }

  // the app's store; a browser (trying the viewer out) keeps them in localStorage
  var store = window.HymnsEdits || {
    get: function (id) { try { return localStorage.getItem('edits-' + id); } catch (e) { return null; } },
    put: function (id, json) {
      try { if (json === '{}') localStorage.removeItem('edits-' + id); else localStorage.setItem('edits-' + id, json); return true; } catch (e) { return false; }
    },
    setEditing: function () {}
  };

  function loadEdits() {
    try {
      var saved = JSON.parse(store.get(hymnId) || '{}');
      return saved && typeof saved === 'object' ? saved : {};
    } catch (e) {
      return {};
    }
  }

  var retry = null;
  function saveEdits() {
    clearTimeout(retry);
    var ok = false;
    try { ok = store.put(hymnId, JSON.stringify(view.edits)) === true; } catch (e) { /* not saved */ }
    view.saveStatus = ok ? 'saved' : 'error';
    if (!ok) retry = setTimeout(function () { saveEdits(); if (editor) editor.refresh(); }, 5000);
  }

  // the MEI the states are built from: the sheet with this device's chord edits in it (unless "Original" is on)
  function prepare() {
    var doc = parseXml(pristineXml);
    view.bars = scanBars(doc);
    // edits that are now in the sheet itself (sent in and put into the sheets): forget them on this device
    var baked = Object.keys(view.edits).filter(function (k) {
      var bar = view.bars[parseInt(k, 10) - 1];
      return bar && sameChords(view.edits[k].chords, bar.chords);
    });
    if (baked.length) {
      baked.forEach(function (k) { delete view.edits[k]; });
      saveEdits();
    }
    view.stale = Object.keys(view.edits).filter(function (k) {
      var bar = view.bars[parseInt(k, 10) - 1];
      return !bar || (view.edits[k].was && !sameChords(view.edits[k].was, bar.chords));
    }).map(Number);
    if (!state.original && hasEdits()) applyEdits(doc, view.bars, view.edits);
    baseXml = new XMLSerializer().serializeToString(doc);
  }

  function hasEdits() { return Object.keys(view.edits).length > 0; }

  // the chords of a bar as they are now, in the key being shown
  view.chordsOf = function (bar) {
    var e = view.edits[bar];
    var list = e ? e.chords : (view.bars[bar - 1] ? view.bars[bar - 1].chords : []);
    return list.map(function (c) { return [c[0], view.toShown(c[1])]; });
  };

  // what a bar looks like, for the editor: its beats (half beats too) and which of them have a note starting
  view.barInfo = function (bar) {
    var b = view.bars[bar - 1];
    if (!b) return null;
    var len = Math.max(b.len, 1), beats = [];
    function has(t) { return beats.some(function (x) { return Math.abs(x - t) < 1e-3; }); }
    var step = b.unit >= 4 ? 0.5 : 1;
    for (var t = 1; t < len + 1 - 1e-6; t += step) beats.push(t);
    b.events.forEach(function (ev) { if (ev.onset < len + 1 - 1e-6 && !has(ev.onset)) beats.push(ev.onset); });
    view.chordsOf(bar).forEach(function (c) { if (!has(c[0])) beats.push(c[0]); });
    beats.sort(function (x, y) { return x - y; });
    return {count: view.bars.length, beats: beats.map(function (x) { return Math.round(x * 1000) / 1000; }),
      notes: b.events.map(function (ev) { return ev.onset; }), edited: !!view.edits[bar]};
  };

  view.toShown = function (chord) { return state.shift ? moveChord(chord, view.steps, state.shift, true) : chord; };
  view.toOriginal = function (chord) { return state.shift ? moveChord(chord, -view.steps, -state.shift, true) : chord; };

  // replace the chords of a bar; `chords` are in the key being shown
  view.setBar = function (bar, chords) {
    var b = view.bars[bar - 1];
    if (!b) return;
    view.history.push(JSON.stringify(view.edits));
    var list = chords.filter(function (c) { return c[1]; })
      .map(function (c) { return [Math.round(c[0] * 1000) / 1000, view.toOriginal(c[1])]; })
      .sort(function (x, y) { return x[0] - y[0]; });
    if (sameChords(list, b.chords)) delete view.edits[bar];
    else view.edits[bar] = {was: b.chords, chords: list};
    edited();
  };

  view.undo = function () {
    if (!view.history.length) return;
    view.edits = JSON.parse(view.history.pop());
    edited();
  };

  function edited() {
    saveEdits();
    prepare();
    redraw();
    updateBar();
    if (editor) editor.refresh();
  }

  view.select = function (bar) {
    view.selected = bar;
    mark();
    var g = document.getElementById('bar-' + bar);
    if (g) {
      var r = g.getBoundingClientRect();
      if (r.top < 60 || r.bottom > window.innerHeight - view.panelHeight) g.scrollIntoView({block: 'center', behavior: 'smooth'});
    }
  };

  function mark() {
    Array.prototype.forEach.call(document.querySelectorAll('.bar-selected'), function (g) { g.classList.remove('bar-selected'); });
    var g = editing && view.selected && document.getElementById('bar-' + view.selected);
    if (g) g.classList.add('bar-selected');
  }

  // a tap on the sheet while editing: the bar, and the beat of the chord or note tapped
  function pick(e) {
    var t = e.target.closest ? e.target : e.target.parentNode;
    var harm = t.closest('g.harm'), note = t.closest('g.note, g.rest');
    var measure = t.closest('g.measure');
    if (!measure) {
      // the empty space inside a bar does not take taps in SVG: find the bar whose box holds the point
      measure = Array.prototype.filter.call(document.querySelectorAll('#music g.measure'), function (g) {
        var r = g.getBoundingClientRect();
        return e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
      })[0];
    }
    if (!measure || !view.onpick) return;
    var bar = parseInt(measure.id.replace('bar-', ''), 10), beat = null;
    if (harm) {
      var m = /^chord-\d+-(.+)$/.exec(harm.id);
      if (m) beat = parseFloat(m[1]);
    } else if (note) {
      var ev = view.bars[bar - 1] && view.bars[bar - 1].events.filter(function (x) { return x.id === note.id; })[0];
      if (ev) beat = ev.onset;
    }
    view.onpick({bar: bar, beat: beat});
  }

  // editing is on the piano sheet with the staff shown and the edits in place
  function setEditing(on) {
    if (on === editing || !tk) return;
    editing = on;
    store.setEditing(on);   // the app's Back button closes the editor first
    if (on) {
      document.body.classList.remove('barHidden');
      var reprepare = state.original;
      state.guitar = false;
      state.staff = true;
      state.original = false;
      if (reprepare) prepare();
      editor = editor || window.createChordEditor(view, function () { setEditing(false); });
      view.history = [];
      redraw();
      editor.open();
    } else {
      view.selected = null;
      editor.close();
      redraw();
    }
    updateBar();
  }

  // the app's Back button while editing
  window.closeEditor = function () { setEditing(false); };

  // ---- the bar ----

  function updateBar() {
    $('bPiano').classList.toggle('on', !state.guitar);
    $('bGuitar').classList.toggle('on', state.guitar);
    // narrow phones get the short label (the bar has no room for "Hide staff" next to the back button)
    var narrow = document.documentElement.clientWidth < 400;
    $('bStaff').textContent = narrow ? 'Staff' : state.staff ? 'Hide staff' : 'Show staff';
    $('bStaff').classList.toggle('on', narrow && state.staff);
    $('bDown').disabled = state.shift <= -MAX_SHIFT;
    $('bUp').disabled = state.shift >= MAX_SHIFT;
    $('bEdit').hidden = !editable;
    $('bEdit').textContent = editing ? 'Editing chords' : 'Edit chords';
    $('bEdit').classList.toggle('on', editing);
    $('bOriginal').hidden = !editable || !hasEdits();
    $('bOriginal').classList.toggle('on', !!state.original);
  }

  function redraw() {
    try {
      build();
      render();
    } catch (e) {
      status('Could not render this sheet: ' + e);
    }
  }

  function change(fn) {
    if (!tk) return;
    var original = state.original;
    fn();
    if (editing && (state.guitar || !state.staff || state.original)) {
      editing = false;
      store.setEditing(false);
      view.selected = null;
      editor.close();
    }
    if (state.original !== original) prepare();
    updateBar();
    redraw();
  }

  // back to the hymn: the activity closes itself on this address (SheetMusicActivity.closeIfRequested)
  $('bBack').addEventListener('click', function () { location.href = 'hymnsviewer://close'; });
  $('bPiano').addEventListener('click', function () { change(function () { state.guitar = false; }); });
  $('bGuitar').addEventListener('click', function () { change(function () { state.guitar = true; }); });
  $('bDown').addEventListener('click', function () { change(function () { state.shift = Math.max(-MAX_SHIFT, state.shift - 1); }); });
  $('bUp').addEventListener('click', function () { change(function () { state.shift = Math.min(MAX_SHIFT, state.shift + 1); }); });
  $('bStaff').addEventListener('click', function () { change(function () { state.staff = !state.staff; }); });
  $('bEdit').addEventListener('click', function () { setEditing(!editing); });
  $('bOriginal').addEventListener('click', function () { change(function () { state.original = !state.original; }); });

  // the app passes the camera cutout's safe insets (CSS px) so the bar and the music stay clear of the camera
  window.setInsets = function (top, right, bottom, left) {
    var root = document.documentElement.style, before = $('music').clientWidth;
    root.setProperty('--it', top + 'px');
    root.setProperty('--ir', right + 'px');
    root.setProperty('--il', left + 'px');
    if (tk && $('music').clientWidth !== before) render();
  };

  // the app passes the height of the on-screen keyboard (CSS px), so the chord editor stays above it
  window.setKeyboard = function (height) {
    document.documentElement.style.setProperty('--kb', height + 'px');
  };

  // a tap anywhere else shows or hides the bar (scrolling and pinching do not fire click); while editing chords,
  // a tap on the sheet picks a bar and the bar stays
  document.addEventListener('click', function (e) {
    if (e.target.closest && e.target.closest('.chord-editor')) return;   // its Done has just left edit mode
    if (editing) {
      if ($('music').contains(e.target)) pick(e);
    } else if (!$('bar').contains(e.target)) {
      document.body.classList.toggle('barHidden');
    }
  });
  updateBar();

  // pinch to zoom: re-layout at the new scale, so the music reflows instead of running off the screen
  var pinch = null;
  document.addEventListener('touchstart', function (e) {
    if (e.touches.length === 2) pinch = {d: dist(e.touches), s: scale};
  }, {passive: true});
  document.addEventListener('touchmove', function (e) {
    if (pinch && e.touches.length === 2) {
      var f = dist(e.touches) / pinch.d;
      $('music').style.transformOrigin = '0 0';
      $('music').style.transform = 'scale(' + f + ')';
    }
  }, {passive: true});
  document.addEventListener('touchend', function (e) {
    if (pinch && e.touches.length < 2) {
      var m = /scale\(([\d.]+)\)/.exec($('music').style.transform);
      var f = m ? parseFloat(m[1]) : 1;
      $('music').style.transform = '';
      scale = Math.max(20, Math.min(100, Math.round(pinch.s * f)));
      pinch = null;
      if (tk) render();
    }
  });
  function dist(t) { return Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY); }

  var resizeTimer = null;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () { updateBar(); if (tk) render(); }, 150);
  });

  // the same sheet with the lyrics of another language (sheetLyrics/<hymn>.json, made by tools/sheet-lyrics/align.py):
  // syllables under the notes, the verses below the staff and the title are swapped in before anything is drawn
  function applyLyrics(xml, o) {
    var doc = parseXml(xml);
    var notes = doc.getElementsByTagNameNS(MEI_NS, 'note');
    for (var i = 0; i < notes.length; i++) {
      var id = notes[i].getAttributeNS(XML_NS, 'id');
      var s = o.syl && o.syl[id];
      if (s === undefined) continue;
      var verses = notes[i].getElementsByTagNameNS(MEI_NS, 'verse');
      for (var v = verses.length - 1; v >= 0; v--) {
        if (verses[v].getAttribute('n') !== '1') continue;
        if (s === 0) {                                  // a note the French syllable before it is held over: no syllable of its own
          verses[v].parentNode.removeChild(verses[v]);
          continue;
        }
        var syl = verses[v].getElementsByTagNameNS(MEI_NS, 'syl')[0];
        if (!syl) continue;
        if (typeof s === 'string') s = [s, null];       // a whole word on one note
        // two Chinese characters on one note simply sit side by side (the tie sign is for syllables)
        syl.textContent = CJK.test(s[0]) ? s[0].replace(/\u203f/g, '') : s[0];
        if (s[1]) { syl.setAttribute('wordpos', s[1]); } else { syl.removeAttribute('wordpos'); }
        if (s[2] === 'u') {
          syl.setAttribute('con', 'u');                 // held over the next note: an extender line
        } else if (s[1] === 'i' || s[1] === 'm') {
          syl.setAttribute('con', 'd');
        } else {
          syl.removeAttribute('con');
        }
      }
    }
    var titles = doc.getElementsByTagNameNS(MEI_NS, 'title');
    for (i = 0; i < titles.length; i++) {
      if (titles[i].getAttribute('type') === 'main' && o.title) titles[i].textContent = o.title;
      if (titles[i].getAttribute('type') === 'subordinate') titles[i].textContent = o.subtitle || '';
    }
    var back = doc.getElementsByTagNameNS(MEI_NS, 'back')[0];
    if (back) back.parentNode.removeChild(back);
    if (o.verses && o.verses.length) {
      var music = doc.getElementsByTagNameNS(MEI_NS, 'music')[0];
      back = doc.createElementNS(MEI_NS, 'back');
      var div = doc.createElementNS(MEI_NS, 'div');
      div.setAttribute('type', 'verses');
      for (i = 0; i < o.verses.length; i++) {
        var lg = doc.createElementNS(MEI_NS, 'lg');
        lg.setAttribute('label', o.verses[i].label);
        for (var k = 0; k < o.verses[i].lines.length; k++) {
          var l = doc.createElementNS(MEI_NS, 'l');
          l.textContent = o.verses[i].lines[k];
          lg.appendChild(l);
        }
        div.appendChild(lg);
      }
      back.appendChild(div);
      music.appendChild(back);
    }
    return new XMLSerializer().serializeToString(doc);
  }

  // the toolkit and the MEI load in parallel; render when both are there
  var runtimeReady = false;
  function start() {
    if (!runtimeReady || baseXml === null) return;
    try {
      tk = new verovio.toolkit();
      build();
      render();
    } catch (e) {
      status('Could not render this sheet: ' + e);
    }
    updateBar();
  }
  verovio.module.onRuntimeInitialized = function () { runtimeReady = true; start(); };

  // ?lyrics=FR1: the hymn being read has its own lyrics for this sheet (a translation); used when the file exists
  var lyricsId = params.get('lyrics');
  function loadLyrics() {
    if (!lyricsId || lyricsId === hymnId) return Promise.resolve(null);
    return fetch('../sheetLyrics/' + encodeURIComponent(lyricsId) + '.json')
      .then(function (r) { return r.ok ? r.json() : null; })
      .catch(function () { return null; });
  }
  Promise.all([fetch('../sheetMei/' + encodeURIComponent(hymnId) + '.mei')
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.text(); }), loadLyrics()])
    .then(function (res) {
      var xml = res[0], overlay = res[1];
      if (overlay) { xml = applyLyrics(xml, overlay); shownId = overlay.hymn || hymnId; }
      load(xml);
      start();
    })
    .catch(function (e) { status('Sheet music not found (' + e.message + ')'); });
})();
