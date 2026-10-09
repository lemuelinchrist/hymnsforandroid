// Sheet music viewer: renders sheetMei/<id>.mei with Verovio, laid out to the screen width.
// Guitar sheets are derived here from the piano MEI: capo from the key, chords moved down by the capo,
// slash basses dropped, a chord equal to the one before it removed (svg-to-lilypond/DESIGN.md §10, §19).
(function () {
  'use strict';

  var params = new URLSearchParams(location.search);
  var hymnId = params.get('id');
  var guitar = params.get('variant') === 'guitar';
  if (params.get('dark') === '1') document.documentElement.classList.add('dark');

  var MEI_NS = 'http://www.music-encoding.org/ns/mei';
  var CAPO = {0: 0, 1: 1, 2: 0, 3: 1, 4: 2, 5: 3, 6: 4, 7: 0, 8: 1, 9: 0, 10: 3, 11: 4};
  var INTERVAL = {0: [0, 0], 1: [1, 1], 2: [1, 2], 3: [2, 3], 4: [2, 4]};   // capo -> [letter steps, semitones] down
  var LETTERS = 'CDEFGAB';
  var NAT = {C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11};
  var SIGN = {'-2': '𝄫', '-1': '♭', '0': '', '1': '♯', '2': '𝄪'};
  var ALT = {'♭': -1, '♯': 1, '𝄫': -2, '𝄪': 2};
  var CHORD = /^([A-G])(𝄫|𝄪|♭|♯)?(.*?)(?:\/([A-G])(𝄫|𝄪|♭|♯)?)?$/;

  var tk = null, meiText = null, scale = 40;

  function $(id) { return document.getElementById(id); }

  function status(msg) { $('music').innerHTML = '<div id="status"></div>'; $('status').textContent = msg; }

  function transposeNote(letter, alt, capo) {
    var iv = INTERVAL[capo];
    var li = (LETTERS.indexOf(letter) - iv[0] + 7) % 7;
    var nl = LETTERS[li];
    var pc = ((NAT[letter] + alt - iv[1]) % 12 + 12) % 12;
    var a = pc - NAT[nl];
    if (a > 6) a -= 12;
    if (a < -6) a += 12;
    return nl + SIGN[a];
  }

  function guitarChord(text, capo) {
    var m = CHORD.exec(text);
    if (!m) return text;                         // a free-text chord (rare): leave it
    return transposeNote(m[1], ALT[m[2]] || 0, capo) + m[3];
  }

  // key.sig "3f" / "2s" / "0" -> pitch class of the major tonic
  function keyPc(sig) {
    var m = /^(\d+)([sf])?$/.exec(sig || '0');
    var n = parseInt(m[1], 10) * (m[2] === 'f' ? -1 : 1);
    return ((n * 7) % 12 + 12) % 12;
  }

  function prepare(xml) {
    var doc = new DOMParser().parseFromString(xml, 'application/xml');
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
    var tail = null;
    var divs = q('div');
    for (i = 0; i < divs.length; i++) {
      if (divs[i].getAttribute('type') === 'tailChords') tail = divs[i].textContent.trim().split(/\s+/);
    }

    var back = q('back')[0];
    if (back) back.parentNode.removeChild(back);

    if (guitar) {
      var capo = CAPO[keyPc(q('scoreDef')[0].getAttribute('key.sig'))];
      var chinese = /^CS?\d/.test(hymnId);
      $('capo').textContent = capo ? (chinese ? '(吉他: Capo ' : '(Guitar: Capo ') + capo + ')'
                                   : (chinese ? '(吉他)' : '(Guitar)');
      var harms = Array.prototype.slice.call(q('harm'));
      var prev = null;
      harms.forEach(function (h) {
        var t = guitarChord(h.textContent, capo);
        if (t === prev) { h.parentNode.removeChild(h); return; }
        h.textContent = t;
        prev = t;
      });
      if (tail) tail = tail.map(function (c) { return guitarChord(c, capo); });
    }
    $('tail').textContent = tail ? tail.join('   ') : '';
    return new XMLSerializer().serializeToString(doc);
  }

  function render() {
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
    resizeTimer = setTimeout(function () { if (tk) render(); }, 150);
  });

  // the toolkit and the MEI load in parallel; render when both are there
  var runtimeReady = false;
  function start() {
    if (!runtimeReady || meiText === null) return;
    try {
      tk = new verovio.toolkit();
      render();
    } catch (e) {
      status('Could not render this sheet: ' + e);
    }
  }
  verovio.module.onRuntimeInitialized = function () { runtimeReady = true; start(); };

  fetch('../sheetMei/' + encodeURIComponent(hymnId) + '.mei')
    .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.text(); })
    .then(function (xml) { meiText = prepare(xml); start(); })
    .catch(function (e) { status('Sheet music not found (' + e.message + ')'); });
})();
