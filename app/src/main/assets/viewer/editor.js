// The chord editor: a panel at the bottom of the screen, opened by "Edit chords" on the piano sheet (big screens only).
// Pick a bar (tap it on the sheet), a beat in the strip, then build the chord from buttons or type it.
// Every change goes through view.setBar(), which redraws the sheet and saves it on this device.
// Ported from the web app's editor (tools/web/src/editor.js); viewer.js makes the view.
(function () {
  'use strict';

  var ROOTS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
  var QUALITIES = [['', 'major'], ['m', 'm'], ['7', '7'], ['maj7', 'maj7'], ['m7', 'm7'], ['6', '6'], ['9', '9'], ['add9', 'add9'],
    ['sus4', 'sus4'], ['sus2', 'sus2'], ['7sus4', '7sus4'], ['dim', 'dim'], ['dim7', 'dim7'], ['m7♭5', 'm7♭5'], ['aug', 'aug']];
  var STATUS = {idle: '', saved: 'Saved on this device ✓', error: 'Not saved, trying again…'};
  var CHORD = /^([A-G])(𝄫|𝄪|♭|♯)?(.*?)(?:\/([A-G])(𝄫|𝄪|♭|♯)?)?$/;
  var EMPTY = {root: '', acc: '', quality: '', bass: '', bassAcc: ''};

  function el(tag, cls, text, attrs) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    if (attrs) Object.keys(attrs).forEach(function (k) { e.setAttribute(k, attrs[k]); });
    return e;
  }

  function splitChord(text) {
    var m = CHORD.exec(text || '');
    return m ? {root: m[1], acc: m[2] || '', quality: m[3], bass: m[4] || '', bassAcc: m[5] || ''} : null;
  }

  function beatLabel(t) {
    var whole = Math.floor(t + 1e-6), frac = t - whole;
    if (frac < 1e-3) return String(whole);
    if (Math.abs(frac - 0.5) < 1e-3) return (whole || '') + '½';
    return String(Math.round(t * 100) / 100);
  }

  // what the user types -> what is stored: ♭ ♯ for b #, a capital root
  function cleanChord(text) {
    var t = text.trim().replace(/\s+/g, '');
    if (!t) return '';
    t = t[0].toUpperCase() + t.slice(1);
    t = t.replace(/^([A-G])b/, '$1♭').replace(/^([A-G])#/, '$1♯')
      .replace(/\/([A-Ga-g])b/, function (m, n) { return '/' + n.toUpperCase() + '♭'; })
      .replace(/\/([A-Ga-g])#/, function (m, n) { return '/' + n.toUpperCase() + '♯'; })
      .replace(/\/([a-g])/, function (m, n) { return '/' + n.toUpperCase(); })
      .replace(/(\d)b(\d)/g, '$1♭$2').replace(/(\d)#(\d)/g, '$1♯$2').replace(/([a-z])b5/, '$1♭5');
    return t.slice(0, 24);
  }

  function compose(p) {
    return p.root ? p.root + p.acc + p.quality + (p.bass ? '/' + p.bass + p.bassAcc : '') : '';
  }

  function near(a, b) { return Math.abs(a - b) < 1e-3; }

  window.createChordEditor = function (view, onclose) {
    var root = el('section', 'chord-editor', null, {'aria-label': 'Chord editor'});
    var bar = null, beat = 1;

    var status = el('span', 'ce-status');
    var bUndo = el('button', 'ce-btn', 'Undo', {type: 'button'});
    var bRevert = el('button', 'ce-btn', 'Original bar', {type: 'button'});
    var bDone = el('button', 'ce-btn primary', 'Done', {type: 'button'});
    var prev = el('button', 'ce-btn icon', '‹', {type: 'button', 'aria-label': 'Previous bar'});
    var next = el('button', 'ce-btn icon', '›', {type: 'button', 'aria-label': 'Next bar'});
    var title = el('strong', 'ce-title');
    var stale = el('div', 'ce-stale');
    stale.hidden = true;
    var top = el('div', 'ce-top');
    [prev, title, next, el('span', 'grow'), status, bUndo, bRevert, bDone].forEach(function (c) { top.appendChild(c); });

    var strip = el('div', 'ce-beats', null, {role: 'group', 'aria-label': 'Beats'});
    var build = el('div', 'ce-build');
    var rootRow = el('div', 'ce-row');
    var qualRow = el('div', 'ce-row scroll');
    var bassRow = el('div', 'ce-row');
    var textRow = el('div', 'ce-row ce-text');
    var input = el('input', 'ce-input', null, {type: 'text', autocomplete: 'off', autocapitalize: 'off', autocorrect: 'off', spellcheck: 'false',
      placeholder: 'Chord', 'aria-label': 'Chord', enterkeyhint: 'done'});
    var bClear = el('button', 'ce-btn', 'Remove chord', {type: 'button'});
    textRow.appendChild(input);
    textRow.appendChild(bClear);
    build.appendChild(rootRow);
    build.appendChild(qualRow);
    build.appendChild(bassRow);
    [top, stale, strip, build].forEach(function (c) { root.appendChild(c); });

    function btn(label, onclick, cls) {
      var b = el('button', 'ce-btn ' + (cls || ''), label, {type: 'button'});
      b.addEventListener('click', onclick);
      return b;
    }
    var rootBtns = ROOTS.map(function (r) { return btn(r, function () { edit(function (p) { p.root = r; p.acc = ''; }); }, 'note'); });
    var flat = btn('♭', function () { edit(function (p) { if (p.root) p.acc = p.acc === '♭' ? '' : '♭'; }); }, 'note');
    var sharp = btn('♯', function () { edit(function (p) { if (p.root) p.acc = p.acc === '♯' ? '' : '♯'; }); }, 'note');
    rootRow.appendChild(el('span', 'ce-label', 'Chord'));
    rootBtns.concat([flat, sharp, textRow]).forEach(function (c) { rootRow.appendChild(c); });
    var qualBtns = QUALITIES.map(function (q) { return [q[0], btn(q[1], function () { edit(function (p) { p.quality = q[0]; }); })]; });
    qualBtns.forEach(function (x) { qualRow.appendChild(x[1]); });
    var bassNone = btn('none', function () { edit(function (p) { p.bass = ''; p.bassAcc = ''; }); });
    var bassBtns = ROOTS.map(function (r) { return btn(r, function () { edit(function (p) { p.bass = r; p.bassAcc = ''; }); }, 'note'); });
    var bassFlat = btn('♭', function () { edit(function (p) { if (p.bass) p.bassAcc = p.bassAcc === '♭' ? '' : '♭'; }); }, 'note');
    var bassSharp = btn('♯', function () { edit(function (p) { if (p.bass) p.bassAcc = p.bassAcc === '♯' ? '' : '♯'; }); }, 'note');
    bassRow.appendChild(el('span', 'ce-label', 'Bass'));
    [bassNone].concat(bassBtns, [bassFlat, bassSharp]).forEach(function (c) { bassRow.appendChild(c); });

    function chordAt(t) {
      var c = view.chordsOf(bar).filter(function (x) { return near(x[0], t); })[0];
      return c ? c[1] : '';
    }

    function setChord(t, text) {
      var list = view.chordsOf(bar).filter(function (x) { return !near(x[0], t); });
      if (text) list.push([t, text]);
      view.setBar(bar, list);
    }

    function edit(fn) {
      if (bar == null) return;
      var p = splitChord(chordAt(beat)) || Object.assign({}, EMPTY);
      fn(p);
      setChord(beat, compose(p));
    }

    input.addEventListener('change', function () { if (bar != null) setChord(beat, cleanChord(input.value)); });
    input.addEventListener('keydown', function (e) { if (e.key === 'Enter') input.blur(); });
    bClear.addEventListener('click', function () { setChord(beat, ''); });
    bUndo.addEventListener('click', function () { view.undo(); });
    bRevert.addEventListener('click', function () {
      var b = view.bars[bar - 1];
      if (b) view.setBar(bar, b.chords.map(function (c) { return [c[0], view.toShown(c[1])]; }));
    });
    bDone.addEventListener('click', function () { onclose(); });
    prev.addEventListener('click', function () { go(bar - 1); });
    next.addEventListener('click', function () { go(bar + 1); });

    function go(n, at) {
      var info = view.barInfo(n);
      if (!info) return;
      bar = n;
      var chords = view.chordsOf(n);
      beat = at != null ? at : (chords.length ? chords[0][0] : 1);
      view.select(n);
      refresh();
    }

    function refresh() {
      var open = bar != null;
      root.classList.toggle('no-bar', !open);
      var info = open && view.barInfo(bar);
      title.textContent = open ? 'Bar ' + bar + (info && info.edited ? ' ✎' : '') : 'Tap a bar on the sheet';
      prev.disabled = !open || bar <= 1;
      next.disabled = !open || !info || bar >= info.count;
      bUndo.disabled = !view.history.length;
      bRevert.disabled = !open || !info || !info.edited;
      var st = view.saveStatus;
      status.textContent = STATUS[st] || '';
      status.className = 'ce-status ' + st;
      var bad = view.stale;
      stale.hidden = !bad.length;
      stale.textContent = bad.length ? 'The sheet has changed since you edited bar' + (bad.length > 1 ? 's ' : ' ') + bad.join(', ')
        + '. Check ' + (bad.length > 1 ? 'those bars' : 'that bar') + '.' : '';

      strip.textContent = '';
      if (!open || !info) { build.hidden = true; strip.hidden = true; return; }
      build.hidden = false;
      strip.hidden = false;
      var chords = view.chordsOf(bar);
      info.beats.forEach(function (t) {
        var here = chords.filter(function (x) { return near(x[0], t); })[0];
        var hasNote = info.notes.some(function (n) { return near(n, t); });
        var b = el('button', 'ce-beat' + (near(t, beat) ? ' on' : '') + (here ? ' has' : '') + (hasNote ? ' note' : ''), null, {type: 'button'});
        b.appendChild(el('span', 'bt', beatLabel(t)));
        b.appendChild(el('span', 'bc', here ? here[1] : ''));
        b.addEventListener('click', function () { beat = t; refresh(); });
        strip.appendChild(b);
      });
      var cur = chordAt(beat);
      var p = splitChord(cur) || EMPTY;
      ROOTS.forEach(function (r, i) {
        rootBtns[i].setAttribute('aria-pressed', String(p.root === r));
        bassBtns[i].setAttribute('aria-pressed', String(p.bass === r));
      });
      flat.setAttribute('aria-pressed', String(p.acc === '♭'));
      sharp.setAttribute('aria-pressed', String(p.acc === '♯'));
      bassFlat.setAttribute('aria-pressed', String(p.bassAcc === '♭'));
      bassSharp.setAttribute('aria-pressed', String(p.bassAcc === '♯'));
      bassNone.setAttribute('aria-pressed', String(!!p.root && !p.bass));
      qualBtns.forEach(function (x) { x[1].setAttribute('aria-pressed', String(!!p.root && p.quality === x[0])); x[1].disabled = !p.root; });
      flat.disabled = sharp.disabled = !p.root;
      bassBtns.forEach(function (b) { b.disabled = !p.root; });
      bassNone.disabled = !p.root;
      bassFlat.disabled = bassSharp.disabled = !p.bass;
      bClear.disabled = !cur;
      if (document.activeElement !== input) input.value = cur;
      input.placeholder = 'Type a chord for beat ' + beatLabel(beat);
    }

    view.onpick = function (pick) { go(pick.bar, pick.beat); };
    document.body.appendChild(root);
    root.hidden = true;

    function setHeight() {
      var h = root.hidden ? 0 : root.offsetHeight;
      view.panelHeight = h;
      document.documentElement.style.setProperty('--editor-h', h + 'px');
    }
    new ResizeObserver(setHeight).observe(root);

    return {
      open: function () {
        root.hidden = false;
        document.body.classList.add('editingChords');
        if (view.selected == null) {
          // start at the first bar with changed chords, else wait for a tap
          var first = Object.keys(view.edits).map(Number).sort(function (a, b) { return a - b; })[0];
          bar = null;
          if (first) go(first); else refresh();
        } else go(view.selected);
        setHeight();
      },
      close: function () {
        input.blur();
        root.hidden = true;
        document.body.classList.remove('editingChords');
        bar = null;
        setHeight();
      },
      refresh: function () { if (!root.hidden) refresh(); }
    };
  };
})();
