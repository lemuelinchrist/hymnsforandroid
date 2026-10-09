// Sheet music viewer: renders sheetMei/<id>.mei with Verovio, laid out to the screen width.
// Guitar sheets are derived here from the piano MEI: capo from the key, chords moved down by the capo,
// slash basses dropped, a chord equal to the one before it removed (svg-to-lilypond/DESIGN.md §10, §19).
// A bar (shown and hidden by a tap) switches piano/guitar, transposes, and hides the staff (chords over lyrics).
(function () {
  'use strict';

  var params = new URLSearchParams(location.search);
  var hymnId = params.get('id');
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

  // what the bar controls; reset every time the sheet is opened
  var state = {guitar: params.get('variant') === 'guitar', shift: 0, staff: true};

  var tk = null, scale = 40;
  var baseXml = null, baseFifths = 0, baseTail = null;   // the MEI as loaded (no <back>), its key, its tail chords
  var meiText = null, meiDoc = null;                      // the MEI for the current state

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
    $('number').textContent = hymnId;
    $('spacer').textContent = hymnId;

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
    baseXml = new XMLSerializer().serializeToString(doc);
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

    // tail chords are plain text, so they are moved here: by the same interval as the key
    var tail = baseTail;
    if (tail && state.shift) {
      var steps = LETTERS.indexOf(tonic[0]) - LETTERS.indexOf(TONIC[baseFifths + 7][0]);
      tail = tail.map(function (c) { return moveChord(c, steps, state.shift, true); });
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

    meiDoc = doc;
    meiText = new XMLSerializer().serializeToString(doc);
  }

  function render() {
    if (!state.staff) { renderChart(); return; }
    var width = document.documentElement.clientWidth - 20;
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
  }

  function change(fn) {
    if (!tk) return;
    fn();
    updateBar();
    try {
      build();
      render();
    } catch (e) {
      status('Could not render this sheet: ' + e);
    }
  }

  // back to the hymn: the activity closes itself on this address (SheetMusicActivity.closeIfRequested)
  $('bBack').addEventListener('click', function () { location.href = 'hymnsviewer://close'; });
  $('bPiano').addEventListener('click', function () { change(function () { state.guitar = false; }); });
  $('bGuitar').addEventListener('click', function () { change(function () { state.guitar = true; }); });
  $('bDown').addEventListener('click', function () { change(function () { state.shift = Math.max(-MAX_SHIFT, state.shift - 1); }); });
  $('bUp').addEventListener('click', function () { change(function () { state.shift = Math.min(MAX_SHIFT, state.shift + 1); }); });
  $('bStaff').addEventListener('click', function () { change(function () { state.staff = !state.staff; }); });

  // a tap anywhere else shows or hides the bar (scrolling and pinching do not fire click)
  document.addEventListener('click', function (e) {
    if (!$('bar').contains(e.target)) document.body.classList.toggle('barHidden');
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
  }
  verovio.module.onRuntimeInitialized = function () { runtimeReady = true; start(); };

  fetch('../sheetMei/' + encodeURIComponent(hymnId) + '.mei')
    .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.text(); })
    .then(function (xml) { load(xml); start(); })
    .catch(function (e) { status('Sheet music not found (' + e.message + ')'); });
})();
