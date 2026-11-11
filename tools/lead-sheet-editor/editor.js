// Lead sheet editor. The sheet is a list of notes (see from_musicxml.py for the format); bars, ties, beams and
// accidentals are worked out here each time it is drawn (Verovio, from MEI made in toMei).
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var tk = null, sheet = null, rev = '', song = '', sel = 0;
  var undo = [], redo = [], dirty = false, saving = false, saveTimer = null, changed = {}, lastMei = '';
  var KEYS = ['C', 'G', 'D', 'A', 'E', 'B', 'F#', 'F', 'Bb', 'Eb', 'Ab', 'Db', 'Gb'];
  var PC = {C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11};
  var SHARP = [['c', 0], ['c', 1], ['d', 0], ['d', 1], ['e', 0], ['f', 0], ['f', 1], ['g', 0], ['g', 1], ['a', 0], ['a', 1], ['b', 0]];
  var FLAT = [['c', 0], ['d', -1], ['d', 0], ['e', -1], ['e', 0], ['f', 0], ['g', -1], ['g', 0], ['a', -1], ['a', 0], ['b', -1], ['b', 0]];
  var FIFTHS = {0: 0, 7: 1, 2: 2, 9: 3, 4: 4, 11: 5, 6: 6, 1: -5, 8: -4, 3: -3, 10: -2, 5: -1};
  var DUR = {16: ['1', 0], 12: ['2', 1], 8: ['2', 0], 6: ['4', 1], 4: ['4', 0], 3: ['8', 1], 2: ['8', 0], 1: ['16', 0]};
  var DUR_BUTTONS = [[1, '16th'], [2, '8th'], [3, '8th.'], [4, 'Quarter'], [6, 'Quarter.'], [8, 'Half'], [12, 'Half.'], [16, 'Whole']];
  var NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];

  function tonicPc() { var k = sheet.key || 'C'; return (PC[k[0]] + (k[1] === '#' ? 1 : k[1] === 'b' ? -1 : 0) + 12) % 12; }
  function fifths() { return FIFTHS[(tonicPc() + (sheet.mode === 'minor' ? 3 : 0)) % 12]; }
  function keyAlter() {   // the key signature: letter -> -1, 0, 1
    var f = fifths(), a = {c: 0, d: 0, e: 0, f: 0, g: 0, a: 0, b: 0}, i;
    for (i = 0; i < f; i++) a['fcgdaeb'[i]] = 1;
    for (i = 0; i < -f; i++) a['beadgcf'[i]] = -1;
    return a;
  }
  function scalePcs() { var t = (fifths() * 7 % 12 + 12) % 12; return [0, 2, 4, 5, 7, 9, 11].map(function (x) { return (t + x) % 12; }); }
  function spell(n) {
    var flat = fifths() < 0; if (n.e) flat = !flat;
    var s = (flat ? FLAT : SHARP)[((n.p % 12) + 12) % 12];
    return {pname: s[0], alter: s[1], oct: Math.floor(n.p / 12) - 1};
  }
  function barLen() { return Math.round(sheet.time[0] * 16 / sheet.time[1]); }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

  // the written lengths of a note of `len` sixteenths that starts at `pos` in its bar
  function pieces(pos, len) {
    var out = [], vals = [16, 12, 8, 6, 4, 3, 2, 1], four = barLen() === 16;
    while (len > 0) {
      for (var i = 0; i < vals.length; i++) {
        var v = vals[i], dotted = v % 3 === 0, g = dotted ? v / 3 : Math.max(1, v / 2);
        if (v > len || pos % g) continue;
        if (four && pos < 8 && pos + v > 8 && pos % 4) continue;   // do not hide the middle of a 4/4 bar
        out.push(v); pos += v; len -= v; break;
      }
    }
    return out;
  }

  // bars: [{len, items: [{id, idx, v, pos, rest, first, last}]}]
  function layout() {
    var bar = barLen(), bars = [], cur = null, pos = 0;
    function open() { cur = {len: bars.length === 0 && sheet.pickup > 0 && sheet.pickup < bar ? sheet.pickup : bar, items: []}; bars.push(cur); pos = 0; }
    open();
    function put(idx, rest, len) {
      var part = 0;
      while (len > 0) {
        if (pos >= cur.len) open();
        var off = bar - cur.len, take = Math.min(len, cur.len - pos), ps = pieces(pos + off, take);
        for (var i = 0; i < ps.length; i++) {
          cur.items.push({id: (idx < 0 ? 'p' + bars.length + '_' + cur.items.length : 'n' + idx + (part ? '_' + part : '')), idx: idx, v: ps[i], pos: pos + off, rest: rest});
          pos += ps[i]; part++;
        }
        len -= take;
      }
    }
    sheet.notes.forEach(function (n, idx) { put(idx, n.p === null || n.p === undefined, Math.max(1, n.d | 0)); });
    if (pos < cur.len && cur.items.length) put(-1, true, cur.len - pos);   // fill the last bar with rests
    return bars;
  }

  function toMei() {
    var bars = layout(), ka = keyAlter(), f = fifths(), bar = barLen();
    var beat = sheet.time[1] === 8 && sheet.time[0] % 3 === 0 ? 6 : 4;
    var nv = 1; sheet.notes.forEach(function (n) { if (n.w && n.w.length > nv) nv = n.w.length; });
    var hasWords = sheet.notes.some(function (n) { return n.w && n.w[0]; });
    var piecesOf = {};   // note index -> its piece ids in order
    bars.forEach(function (b) { b.items.forEach(function (it) { if (it.idx >= 0) (piecesOf[it.idx] = piecesOf[it.idx] || []).push(it.id); }); });
    var x = '<?xml version="1.0" encoding="UTF-8"?>\n<mei xmlns="http://www.music-encoding.org/ns/mei" meiversion="5.0"><meiHead><fileDesc><titleStmt><title>' +
      esc(sheet.title || '') + '</title></titleStmt><pubStmt/></fileDesc></meiHead><music><body><mdiv><score>' +
      '<scoreDef keysig="' + (f === 0 ? '0' : Math.abs(f) + (f > 0 ? 's' : 'f')) + '" meter.count="' + sheet.time[0] + '" meter.unit="' + sheet.time[1] +
      '" midi.bpm="' + (sheet.tempo || 90) + '"><staffGrp><staffDef n="1" lines="5" clef.shape="G" clef.line="2"/></staffGrp></scoreDef><section>';
    bars.forEach(function (b, bi) {
      var state = {}, layer = '', extra = '', open = false;
      // 4/4: a half bar of four eighth notes is one beam, else a beam per beat
      function group(it) {
        if (bar === 16 && beat === 4) {
          var h = Math.floor(it.pos / 8), inHalf = b.items.filter(function (o) { return Math.floor(o.pos / 8) === h; });
          if (inHalf.length === 4 && inHalf.every(function (o) { return o.v === 2 && !o.rest; })) return 'h' + h;
        }
        return 'b' + Math.floor(it.pos / beat);
      }
      b.items.forEach(function (it, k) {
        var beamable = !it.rest && it.v < 4, g = beamable ? group(it) : null;
        var prev = b.items[k - 1], next = b.items[k + 1];
        var withPrev = beamable && prev && !prev.rest && prev.v < 4 && group(prev) === g;
        var withNext = beamable && next && !next.rest && next.v < 4 && group(next) === g;
        if (beamable && withNext && !withPrev) { layer += '<beam>'; open = true; }
        var d = DUR[it.v], attrs = ' xml:id="' + it.id + '" dur="' + d[0] + '"' + (d[1] ? ' dots="1"' : '');
        if (it.rest) layer += '<rest' + attrs + '/>';
        else {
          var n = sheet.notes[it.idx], s = spell(n), key = s.pname + s.oct, cur = key in state ? state[key] : ka[s.pname];
          var acc = '';
          if (s.alter !== cur) { acc = ' accid="' + (s.alter > 0 ? 's' : s.alter < 0 ? 'f' : 'n') + '"'; state[key] = s.alter; }
          else if (s.alter) acc = ' accid.ges="' + (s.alter > 0 ? 's' : 'f') + '"';
          var ids = piecesOf[it.idx], first = ids[0] === it.id, verses = '';
          if (first && n.w) n.w.forEach(function (w, vi) {
            if (!w) return;
            var goes = /-$/.test(w), text = w.replace(/-$/, ''), before = false;
            for (var j = it.idx - 1; j >= 0; j--) { var pw = sheet.notes[j].w && sheet.notes[j].w[vi]; if (pw) { before = /-$/.test(pw); break; } }
            var wp = goes ? (before ? 'm' : 'i') : (before ? 't' : '');
            verses += '<verse n="' + (vi + 1) + '"><syl' + (wp ? ' wordpos="' + wp + '"' : '') + (goes ? ' con="d"' : '') + '>' + esc(text) + '</syl></verse>';
          });
          layer += '<note' + attrs + ' pname="' + s.pname + '" oct="' + s.oct + '"' + acc + (verses ? '>' + verses + '</note>' : '/>');
          var at = ids.indexOf(it.id);
          if (at < ids.length - 1) extra += '<tie startid="#' + it.id + '" endid="#' + ids[at + 1] + '"/>';
          // a note without a syllable is sung on the syllable before it: a slur from that note to the last such note
          if (first && hasWords && n.w && n.w[0]) {
            var last = it.idx;
            while (last + 1 < sheet.notes.length && sheet.notes[last + 1].p != null && !(sheet.notes[last + 1].w && sheet.notes[last + 1].w[0])) last++;
            if (last > it.idx) extra += '<slur startid="#' + it.id + '" endid="#' + piecesOf[last][0] + '"/>';
          }
        }
        if (it.idx >= 0 && piecesOf[it.idx][0] === it.id && sheet.notes[it.idx].ch)
          extra += '<harm staff="1" place="above" startid="#' + it.id + '">' + esc(sheet.notes[it.idx].ch) + '</harm>';
        if (open && beamable && !withNext) { layer += '</beam>'; open = false; }
      });
      x += '<measure n="' + (bi + 1) + '"' + (b.len < bar ? ' metcon="false"' : '') + (bi === bars.length - 1 ? ' right="end"' : '') +
        '><staff n="1"><layer n="1">' + layer + '</layer></staff>' + extra + '</measure>';
    });
    return x + '</section></score></mdiv></body></music></mei>';
  }

  function render() {
    if (!tk || !sheet) return;
    $('heading').textContent = sheet.title || '';
    var width = $("music").clientWidth || 800, scale = Math.max(40, Math.min(64, Math.round(width / 18)));
    tk.setOptions({pageWidth: Math.round(width * 100 / scale), pageHeight: 60000, adjustPageHeight: true, scale: scale, breaks: 'auto',
      header: 'none', footer: 'none', pageMarginLeft: 20, pageMarginRight: 20, pageMarginTop: 30, pageMarginBottom: 10,
      lyricSize: 4.5, lyricWordSpace: 3, spacingStaff: 10, spacingSystem: 14});
    try {
      lastMei = toMei(); tk.loadData(lastMei);
      var html = ''; for (var p = 1; p <= tk.getPageCount(); p++) html += tk.renderToSVG(p);
      $('music').innerHTML = html;
    } catch (e) { $('music').textContent = 'Could not draw the sheet: ' + e; return; }
    mark();
  }
  function els(idx) { return Array.prototype.slice.call(document.querySelectorAll('#music [id="n' + idx + '"], #music [id^="n' + idx + '_"]')); }
  function mark() {
    document.querySelectorAll('#music .sel, #music .changed, #music .noted').forEach(function (e) { e.classList.remove('sel', 'changed', 'noted'); });
    sheet.notes.forEach(function (n, i) {
      if (n.c) els(i).forEach(function (e) { e.classList.add('noted'); });
      if (changed[i]) els(i).forEach(function (e) { e.classList.add('changed'); });
    });
    els(sel).forEach(function (e) { e.classList.add('sel'); });
    panel();
  }

  function noteName(n) {
    if (n.p == null) return 'Rest';
    var s = spell(n); return s.pname.toUpperCase() + (s.alter > 0 ? '♯' : s.alter < 0 ? '♭' : '') + s.oct;
  }
  function durName(d) { for (var i = 0; i < DUR_BUTTONS.length; i++) if (DUR_BUTTONS[i][0] === d) return DUR_BUTTONS[i][1].toLowerCase(); return d / 2 + ' eighths'; }
  function verseCount() { var nv = 1; sheet.notes.forEach(function (n) { if (n.w && n.w.length > nv) nv = n.w.length; }); return nv; }
  function panel() {
    var n = sheet.notes[sel];
    if (!n) { $('what').textContent = 'Click a note'; return; }
    var pos = 0; for (var i = 0; i < sel; i++) pos += sheet.notes[i].d;
    var bar = barLen(), pk = sheet.pickup > 0 && sheet.pickup < bar ? sheet.pickup : bar, b = pos < pk ? 1 : 2 + Math.floor((pos - pk) / bar);
    $('what').textContent = noteName(n) + ', ' + durName(n.d) + ' · bar ' + b + ' · note ' + (sel + 1) + ' of ' + sheet.notes.length;
    var nv = verseCount(), box = $('verses');
    if (box.children.length !== nv) {
      box.innerHTML = '';
      for (var v = 0; v < nv; v++) {
        var row = document.createElement('div'); row.className = 'row';
        row.innerHTML = '<label>' + (nv > 1 ? 'Verse ' + (v + 1) : 'Word') + '</label><input type="text" data-verse="' + v + '">';
        box.appendChild(row);
      }
    }
    box.querySelectorAll('input').forEach(function (inp) {
      var v = +inp.dataset.verse, val = (n.w && n.w[v]) || '';
      if (document.activeElement !== inp || inp.dataset.for !== String(sel)) inp.value = val;
      inp.dataset.for = String(sel); inp.disabled = n.p == null;
    });
    if (document.activeElement !== $('chord')) $('chord').value = n.ch || '';
    if (document.activeElement !== $('comment')) $('comment').value = n.c || '';
    document.querySelectorAll('#durs button').forEach(function (bt) { bt.classList.toggle('on', +bt.dataset.d === n.d); });
    var list = $('comments'); list.innerHTML = '';
    sheet.notes.forEach(function (m, i) {
      if (!m.c) return;
      var d = document.createElement('div'); d.innerHTML = '<b>Note ' + (i + 1) + ' (' + esc((m.w && m.w[0]) || noteName(m)) + ')</b> ' + esc(m.c);
      d.onclick = function () { select(i); }; list.appendChild(d);
    });
  }
  function select(i, quiet) {
    sel = Math.max(0, Math.min(sheet.notes.length - 1, i)); mark();
    var e = els(sel)[0]; if (e && e.scrollIntoView) e.scrollIntoView({block: 'nearest'});
    if (!quiet) beep(sheet.notes[sel]);
  }

  // every change goes through edit(): undo step, redraw, save
  function edit(fn, keepRedo) {
    undo.push(JSON.stringify(sheet)); if (undo.length > 300) undo.shift();
    if (!keepRedo) redo = [];
    fn(); changed = {}; touch();
  }
  function touch() { dirty = true; render(); status('Saving…'); clearTimeout(saveTimer); saveTimer = setTimeout(save, 500); }
  function status(text, warn) { $('status').textContent = text; $('status').className = warn ? 'warn' : ''; }
  function now() { return new Date().toLocaleTimeString([], {hour: '2-digit', minute: '2-digit', second: '2-digit'}); }

  function save() {
    if (saving || !dirty) return;
    saving = true; dirty = false;
    fetch('/api/sheet?song=' + encodeURIComponent(song) + '&rev=' + rev, {method: 'PUT', body: JSON.stringify(sheet)})
      .then(function (r) { return r.json().then(function (j) { return {code: r.status, j: j}; }); })
      .then(function (r) {
        saving = false;
        if (r.code === 200) { rev = r.j.rev; if (dirty) save(); else status('Saved ' + now()); }
        else if (r.code === 409) load(true, 'The file was changed elsewhere at the same moment: that version is shown, your last change was not saved');
        else status('Not saved: ' + (r.j.error || r.code), true);
      }).catch(function () { saving = false; dirty = true; status('Not saved: is the server running?', true); });
  }
  function load(keepSel, why) {
    return fetch('/api/sheet?song=' + encodeURIComponent(song)).then(function (r) { return r.json(); }).then(function (j) {
      if (!j.sheet) { status(j.error || 'No sheet', true); return; }
      var old = sheet; sheet = j.sheet; rev = j.rev; dirty = false;
      sheet.time = sheet.time || [4, 4]; sheet.notes = sheet.notes || []; sheet.pickup = sheet.pickup || 0;
      changed = {};
      if (old && keepSel) {   // what changed in the file: compared from the front and from the back
        var a = old.notes, b = sheet.notes, s = 0, e = 0;
        while (s < a.length && s < b.length && JSON.stringify(a[s]) === JSON.stringify(b[s])) s++;
        while (e < a.length - s && e < b.length - s && JSON.stringify(a[a.length - 1 - e]) === JSON.stringify(b[b.length - 1 - e])) e++;
        for (var i = s; i < b.length - e; i++) changed[i] = true;
        undo.push(JSON.stringify(old)); redo = [];
      } else { undo = []; redo = []; sel = 0; }
      if (sel >= sheet.notes.length) sel = Math.max(0, sheet.notes.length - 1);
      fields(); render();
      if (j.audio) { $('audiocard').hidden = false; if (!keepSel) $('audio').src = '/audio?song=' + encodeURIComponent(song); } else $('audiocard').hidden = true;
      status(why || (keepSel ? 'Updated from the file ' + now() : 'Loaded'), !!why);
    });
  }
  function poll() {
    if (!song || dirty || saving) return;
    fetch('/api/rev?song=' + encodeURIComponent(song)).then(function (r) { return r.json(); }).then(function (j) {
      if (j.rev && j.rev !== rev && !dirty && !saving) load(true);
    }).catch(function () { status('The server does not answer', true); });
  }
  function fields() {
    $('title').value = sheet.title || ''; $('key').value = sheet.key || 'C'; $('mode').value = sheet.mode || 'major';
    $('timeN').value = sheet.time[0]; $('timeD').value = sheet.time[1]; $('tempo').value = sheet.tempo || 90; $('pickup').value = (sheet.pickup || 0) / 2;
    if (document.activeElement !== $('message')) $('message').value = sheet.message || '';
  }

  // ---- sound
  var ac = null, playing = null;
  function tone(p, t, len, gainTo) {
    var o = ac.createOscillator(), g = ac.createGain();
    o.type = 'triangle'; o.frequency.value = 440 * Math.pow(2, (p - 69) / 12);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gainTo || 0.25, t + 0.015); g.gain.setValueAtTime(gainTo || 0.25, t + Math.max(0.02, len - 0.04)); g.gain.linearRampToValueAtTime(0, t + len);
    o.connect(g); g.connect(ac.destination); o.start(t); o.stop(t + len + 0.02); return o;
  }
  function audio() { if (!ac) ac = new (window.AudioContext || window.webkitAudioContext)(); if (ac.state === 'suspended') ac.resume(); }
  function beep(n) { if (!n || n.p == null || playing) return; try { audio(); tone(n.p, ac.currentTime, 0.3, 0.2); } catch (e) {} }
  function stop() {
    if (!playing) return;
    playing.oscs.forEach(function (o) { try { o.stop(); } catch (e) {} }); playing.timers.forEach(clearTimeout);
    document.querySelectorAll('#music .playing').forEach(function (e) { e.classList.remove('playing'); });
    playing = null; $('play').textContent = '▶ Play';
  }
  function play() {
    if (playing) { stop(); return; }
    audio();
    var unit = 60 / (sheet.tempo || 90) / 4, t = ac.currentTime + 0.1, t0 = t, from = sel >= sheet.notes.length - 1 ? 0 : sel;
    playing = {oscs: [], timers: []}; $('play').textContent = '■ Stop';
    sheet.notes.slice(from).forEach(function (n, k) {
      var i = from + k, len = n.d * unit;
      if (n.p != null) playing.oscs.push(tone(n.p, t, len * 0.95));
      playing.timers.push(setTimeout(function () {
        document.querySelectorAll('#music .playing').forEach(function (e) { e.classList.remove('playing'); });
        els(i).forEach(function (e) { e.classList.add('playing'); });
      }, (t - t0 + 0.1) * 1000));
      t += len;
    });
    playing.timers.push(setTimeout(stop, (t - t0 + 0.2) * 1000));
  }

  // ---- actions
  function step(dir, how) {
    var n = sheet.notes[sel]; if (!n || n.p == null) return;
    edit(function () {
      if (how === 'semi') n.p += dir; else if (how === 'oct') n.p += 12 * dir;
      else { var sc = scalePcs(); do { n.p += dir; } while (sc.indexOf(((n.p % 12) + 12) % 12) < 0); }
      n.p = Math.max(36, Math.min(96, n.p)); delete n.e;
    });
    beep(n);
  }
  function setDur(d) { var n = sheet.notes[sel]; if (n) edit(function () { n.d = d; }); }
  function act(a) {
    var n = sheet.notes[sel];
    if (a === 'up') step(1); else if (a === 'down') step(-1); else if (a === 'sharp') step(1, 'semi'); else if (a === 'flat') step(-1, 'semi');
    else if (a === 'octup') step(1, 'oct'); else if (a === 'octdown') step(-1, 'oct');
    else if (a === 'enh') { if (n && n.p != null) edit(function () { if (n.e) delete n.e; else n.e = true; }); }
    else if (a === 'rest') { if (n) edit(function () { if (n.p == null) { n.p = n.was || near(); delete n.was; n.w = n.w || ['']; } else { n.was = n.p; n.p = null; } }); }
    else if (a === 'before' || a === 'after') {
      edit(function () {
        var m = {p: n && n.p != null ? n.p : near(), d: n ? n.d : 4, w: ['']}, at = a === 'before' ? sel : sel + 1;
        if (!sheet.notes.length) at = 0;
        sheet.notes.splice(at, 0, m); sel = at;
      });
    }
    else if (a === 'split') { if (n && n.d > 1) edit(function () { var h = Math.floor(n.d / 2); sheet.notes.splice(sel + 1, 0, {p: n.p, d: n.d - h, w: ['']}); n.d = h; }); }
    else if (a === 'del') { if (n) edit(function () { sheet.notes.splice(sel, 1); if (sel >= sheet.notes.length) sel = Math.max(0, sheet.notes.length - 1); }); }
    else if (a === 'undo') { if (undo.length) { redo.push(JSON.stringify(sheet)); sheet = JSON.parse(undo.pop()); changed = {}; fields(); if (sel >= sheet.notes.length) sel = Math.max(0, sheet.notes.length - 1); touch(); } }
    else if (a === 'redo') { if (redo.length) { undo.push(JSON.stringify(sheet)); sheet = JSON.parse(redo.pop()); changed = {}; fields(); touch(); } }
    else if (a === 'trup' || a === 'trdown') {
      edit(function () {
        var d = a === 'trup' ? 1 : -1, pc = (tonicPc() + d + 12) % 12;
        sheet.notes.forEach(function (m) { if (m.p != null) m.p += d; delete m.e; if (m.ch) m.ch = trChord(m.ch, d); });
        sheet.key = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'][pc]; fields();
      });
    }
    else if (a === 'verse') edit(function () { var nv = verseCount(); sheet.notes.forEach(function (m) { if (m.p != null) { m.w = m.w || ['']; while (m.w.length <= nv) m.w.push(''); } }); });
    else if (a === 'play') play();
    else if (a === 'print') window.print();
    else if (a === 'mei') download(lastMei, (song || 'sheet') + '.mei', 'application/xml');
    else if (a === 'midi') { var b = atob(tk.renderToMIDI()), u = new Uint8Array(b.length); for (var i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); download(u, (song || 'sheet') + '.mid', 'audio/midi'); }
  }
  function near() { for (var i = sel; i >= 0; i--) if (sheet.notes[i] && sheet.notes[i].p != null) return sheet.notes[i].p; return 67; }
  function trChord(ch, d) {
    var flat = false;
    return ch.replace(/(^|\/)([A-G])([#b]?)/g, function (m, pre, l, acc) {
      var pc = (PC[l] + (acc === '#' ? 1 : acc === 'b' ? -1 : 0) + d + 12) % 12;
      return pre + (flat || acc === 'b' ? ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'] : ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'])[pc];
    });
  }
  function download(data, name, type) {
    var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([data], {type: type})); a.download = name; a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  }
  function letter(l) {   // the nearest pitch with that letter, in the key
    var n = sheet.notes[sel]; if (!n) return;
    var ka = keyAlter(), pc = (PC[l.toUpperCase()] + ka[l.toLowerCase()] + 12) % 12, base = n.p != null ? n.p : near(), best = null;
    for (var p = base - 6; p <= base + 6; p++) if (((p % 12) + 12) % 12 === pc && (best === null || Math.abs(p - base) < Math.abs(best - base))) best = p;
    edit(function () { n.p = best; delete n.e; n.w = n.w || ['']; }); beep(n);
  }

  // ---- wiring
  function init() {
    KEYS.forEach(function (k) { var o = document.createElement('option'); o.textContent = k; $('key').appendChild(o); });
    DUR_BUTTONS.forEach(function (d) {
      var b = document.createElement('button'); b.textContent = d[1]; b.dataset.d = d[0]; b.onclick = function () { setDur(d[0]); }; $('durs').appendChild(b);
    });
    document.querySelectorAll('button[data-act]').forEach(function (b) { b.onclick = function () { act(b.dataset.act); b.blur(); }; });
    $('music').addEventListener('click', function (e) {
      var g = e.target.closest ? e.target.closest('g.note, g.rest') : null;
      if (!g) return;
      var m = /^n(\d+)/.exec(g.id); if (m) select(+m[1]);
    });
    function head(id, fn) { $(id).addEventListener('change', function () { edit(function () { fn($(id).value); }); }); }
    head('title', function (v) { sheet.title = v; }); head('key', function (v) { sheet.key = v; }); head('mode', function (v) { sheet.mode = v; });
    head('timeN', function (v) { sheet.time = [Math.max(1, +v || 4), sheet.time[1]]; }); head('timeD', function (v) { sheet.time = [sheet.time[0], +v]; });
    head('tempo', function (v) { sheet.tempo = Math.max(30, Math.min(240, +v || 90)); }); head('pickup', function (v) { sheet.pickup = Math.max(0, Math.round((+v || 0) * 2)); });
    $('message').addEventListener('change', function () { edit(function () { sheet.message = $('message').value; }); });
    $('chord').addEventListener('change', function () { var n = sheet.notes[sel], v = $('chord').value.trim(); if (n && (n.ch || '') !== v) edit(function () { if (v) n.ch = v; else delete n.ch; }); });
    $('comment').addEventListener('change', function () { var n = sheet.notes[sel], v = $('comment').value.trim(); if (n && (n.c || '') !== v) edit(function () { if (v) n.c = v; else delete n.c; }); });
    ['chord', 'comment'].forEach(function (id) { $(id).addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === 'Escape') $(id).blur(); }); });
    // words: Space or Enter goes to the next note, "-" marks that the word goes on and goes to the next note
    function commitWord(inp) {
      var i = +inp.dataset.for, v = +inp.dataset.verse, n = sheet.notes[i], val = inp.value.trim();
      if (!n || n.p == null || ((n.w && n.w[v]) || '') === val) return;
      edit(function () { n.w = n.w || ['']; while (n.w.length <= v) n.w.push(''); n.w[v] = val; });
    }
    $('verses').addEventListener('change', function (e) { if (e.target.dataset.verse !== undefined) commitWord(e.target); });
    $('verses').addEventListener('keydown', function (e) {
      var inp = e.target; if (inp.dataset.verse === undefined) return;
      if (e.key === 'Escape') { inp.blur(); return; }
      if (e.key !== ' ' && e.key !== 'Enter' && e.key !== '-') return;
      e.preventDefault();
      if (e.key === '-' && inp.value.trim()) inp.value = inp.value.trim().replace(/-$/, '') + '-';
      var v = inp.dataset.verse; commitWord(inp);
      var j = sel + 1; while (j < sheet.notes.length && sheet.notes[j].p == null) j++;
      if (j < sheet.notes.length) { select(j, true); var nx = $('verses').querySelector('input[data-verse="' + v + '"]'); nx.value = (sheet.notes[j].w && sheet.notes[j].w[v]) || ''; nx.focus(); nx.select(); }
    });
    document.addEventListener('keydown', function (e) {
      var t = e.target.tagName;
      if (t === 'INPUT' || t === 'TEXTAREA' || t === 'SELECT' || !sheet) return;
      var k = e.key, done = true;
      if ((e.ctrlKey || e.metaKey) && k.toLowerCase() === 'z') act(e.shiftKey ? 'redo' : 'undo');
      else if ((e.ctrlKey || e.metaKey) && k.toLowerCase() === 'y') act('redo');
      else if (e.ctrlKey || e.metaKey || e.altKey) { if (k === 'ArrowUp') step(1, 'oct'); else if (k === 'ArrowDown') step(-1, 'oct'); else done = false; }
      else if (k === 'ArrowLeft') select(sel - 1); else if (k === 'ArrowRight') select(sel + 1);
      else if (k === 'ArrowUp') step(1, e.shiftKey ? 'semi' : ''); else if (k === 'ArrowDown') step(-1, e.shiftKey ? 'semi' : '');
      else if (k >= '3' && k <= '7') setDur({3: 1, 4: 2, 5: 4, 6: 8, 7: 16}[k]);
      else if (k === '.') { var n = sheet.notes[sel]; if (n) { var to = {1: 1, 2: 3, 3: 2, 4: 6, 6: 4, 8: 12, 12: 8}[n.d]; if (to) setDur(to); } }
      else if (/^[a-gA-G]$/.test(k)) letter(k);
      else if (k === 'r' || k === 'R') act('rest'); else if (k === 'n' || k === 'N' || k === 'Insert') act('after');
      else if (k === 's' || k === 'S') act('split'); else if (k === 'Delete' || k === 'Backspace') act('del');
      else if (k === ' ') act('play');
      else if (k === 'Enter') { var inp = $('verses').querySelector('input:not(:disabled)'); if (inp) { inp.focus(); inp.select(); } }
      else if (k === 'h' || k === 'H') { $('chord').focus(); $('chord').select(); }
      else done = false;
      if (done) e.preventDefault();
    });
    var rt; window.addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(render, 200); });
    window.addEventListener('beforeunload', function (e) { if (dirty || saving) { save(); e.preventDefault(); e.returnValue = ''; } });
    $('song').addEventListener('change', function () { open($('song').value); });
    fetch('/api/list').then(function (r) { return r.json(); }).then(function (list) {
      list.forEach(function (s) { var o = document.createElement('option'); o.value = s.song; o.textContent = s.title + ' (' + s.song + ')'; $('song').appendChild(o); });
      var want = new URLSearchParams(location.search).get('song');
      if (!list.length) { status('No leadsheet.json found: make one with from_musicxml.py', true); return; }
      open(list.some(function (s) { return s.song === want; }) ? want : list[0].song);
    });
    setInterval(poll, 1500);
  }
  function open(name) {
    if (dirty) save();
    stop(); song = name; $('song').value = name; history.replaceState(null, '', '?song=' + encodeURIComponent(name)); sheet = null; load(false);
  }
  // for the console and for tests
  window.leadSheet = {mei: function () { return lastMei; }, sheet: function () { return sheet; }, select: select, act: act};
  verovio.module.onRuntimeInitialized = function () { tk = new verovio.toolkit(); render(); };
  init();
})();
