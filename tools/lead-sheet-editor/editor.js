// Lead sheet editor: the page. The sheet is a list of notes (README.md: leadsheet.json); what follows from them (bars,
// ties, beams, accidentals, the left hand the chords give) is worked out in music.js each time the sheet is drawn with
// Verovio. Every change goes through edit(): an undo step, a redraw, a save into the file.
(function () {
  'use strict';
  var M = window.LeadSheet, S = window.LeadSound;
  var $ = function (id) { return document.getElementById(id); };
  var tk = null, sheet = null, rev = '', song = '', hintStart = null;
  var sel = 0, anchor = 0;      // the chosen note, and the other end when several are chosen
  var hand = 'n', head = -1;    // 'n' the melody, 'l' a written-out left hand; the chosen note of a left-hand chord (-1: all)
  var mode = 'melody', scope = 'song', scopeFor = -1;
  var undo = [], redo = [], dirty = false, saving = false, saveTimer = null, changed = {};
  var lh = null, rh = null, leadMei = '', pianoMei = '', sentPiano = null, drawnBars = [];
  var ceUi = null, clip = null, toastTimer = null, toldPattern = false, heardIdx = -1;
  var prefs = {counts: true, left: true, keys: true, zoom: 1, metro: false, loop: false, speed: 1, mel: true, acc: true, tone: 'piano', follow: true, theme: ''};
  try { var saved = JSON.parse(localStorage.getItem('leadSheetEditor') || '{}'); Object.keys(prefs).forEach(function (k) { if (typeof saved[k] === typeof prefs[k]) prefs[k] = saved[k]; }); } catch (e) {}
  function keep() { try { localStorage.setItem('leadSheetEditor', JSON.stringify(prefs)); } catch (e) {} }
  function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }
  function copy(x) { return JSON.parse(JSON.stringify(x)); }

  // ---- what is chosen
  function list() { return hand === 'l' && sheet.left ? sheet.left : sheet.notes; }
  function lo() { return Math.min(sel, anchor); }
  function hi() { return Math.max(sel, anchor); }
  function chosen() { return list().slice(lo(), hi() + 1); }
  function timeOf(i, events) { var t = 0; for (var k = 0; k < i && k < events.length; k++) t += M.len(events[k]); return t; }
  function indexAt(events, t) { var s = 0; for (var k = 0; k < events.length; k++) { s += M.len(events[k]); if (t < s) return k; } return events.length - 1; }
  function selTime() { return timeOf(lo(), list()); }
  function place(t) {   // where a time is: {bar (from 1), start and end of that bar, beat as text}
    var bar = M.barLen(sheet), off = M.gridOff(sheet), g = t + off, b = Math.floor(g / bar), inBar = g - b * bar, beat = M.beatLen(sheet);
    var rem = inBar % beat, txt = (Math.floor(inBar / beat) + 1) + (rem === 0 ? '' : beat === 4 ? (rem === 2 ? '&' : rem === 1 ? 'e' : 'a') : '+');
    return {bar: b + 1, start: Math.max(0, b * bar - off), end: (b + 1) * bar - off, beat: txt};
  }
  function verseCount() { var nv = 1; sheet.notes.forEach(function (n) { if (n.w && n.w.length > nv) nv = n.w.length; }); return nv; }
  function eventName(n, i) {
    if (M.isRest(n)) return 'Rest';
    var s = M.pitchesOf(n).map(function (p) { return M.noteName(sheet, p, hand === 'n' && n.e); }).join(' + ');
    if (hand === 'n' && rh && rh[i]) s += ' (with ' + rh[i].map(function (p) { return M.noteName(sheet, p); }).reverse().join(', ') + ')';
    return s;
  }
  function durName(d) { for (var i = 0; i < M.DUR_BUTTONS.length; i++) if (M.DUR_BUTTONS[i][0] === d) return M.DUR_BUTTONS[i][1].toLowerCase(); return d / 2 + ' eighths'; }
  function toast(text) {
    var t = $('toast'); t.textContent = text; t.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.hidden = true; }, 4200);
  }

  // ---- drawing
  function patternLabel(a) { return a && M.parsePattern(a.pat).length ? M.styleName(sheet, a) : 'no left hand'; }
  function render() {
    if (!tk || !sheet) return;
    $('heading').textContent = sheet.title || '';
    lh = M.leftHand(sheet); rh = M.rightHand(sheet);
    if (hand === 'l' && !(lh && lh.written)) { hand = 'n'; head = -1; }
    sel = clamp(sel, 0, Math.max(0, list().length - 1)); anchor = clamp(anchor, 0, Math.max(0, list().length - 1));
    var piano = !!(lh || rh), show = piano && prefs.left, left = lh ? lh.events : null;   // the piano part: either hand has more than the lead sheet
    var pedal = !!(lh && !lh.written && ((sheet.acc && sheet.acc.pedal) || sheet.notes.some(function (n) { return n.lh && n.lh.pedal; })));
    var marks = show && lh ? lh.marks.filter(function (m, i) { return i > 0 || !m.song; }).map(function (m) { return {t: m.t, text: patternLabel(m.a)}; }) : [];
    leadMei = M.toMei(sheet);
    pianoMei = piano ? M.toMei(sheet, {left: left, right: rh, pedal: pedal}) : '';
    var shown = show ? M.toMei(sheet, {left: left, right: rh, pedal: pedal, marks: marks, countLine: prefs.counts && !!lh}) : leadMei;
    drawnBars = M.layout(sheet, sheet.notes, 'n', show && lh ? Math.max(M.total(sheet.notes), M.total(lh.events)) : 0);
    var width = $('music').clientWidth || 800, scale = Math.round(clamp(Math.round(width / 18), 40, 64) * prefs.zoom);
    tk.setOptions({pageWidth: Math.round(width * 100 / scale), pageHeight: 60000, adjustPageHeight: true, scale: scale, breaks: 'auto',
      header: 'none', footer: 'none', pageMarginLeft: 20, pageMarginRight: 20, pageMarginTop: 30, pageMarginBottom: prefs.counts ? 70 : 10,
      lyricSize: 4.5, lyricWordSpace: 3, spacingStaff: 10, spacingSystem: prefs.counts || (show && lh) ? 18 : 14});
    try {
      tk.loadData(shown);
      var html = ''; for (var p = 1; p <= tk.getPageCount(); p++) html += tk.renderToSVG(p);
      $('music').innerHTML = html;
      if (prefs.counts) drawCounts();
    } catch (e) { $('music').textContent = 'Could not draw the sheet: ' + e; return; }
    document.body.classList.toggle('lh-written', !!(lh && lh.written));
    document.body.classList.toggle('hand-l', hand === 'l'); document.body.classList.toggle('hand-n', hand !== 'l');
    $('pianoMei').disabled = !piano; $('lhshow').disabled = !piano; $('lhshow').classList.toggle('on', show);
    $('playCh').textContent = piano ? 'Piano part' : 'Chords';
    mark();
  }
  // "1 & 2 &" under the melody: under the words, or under the upper staff
  function drawCounts() {
    var piecesOf = {}, beat = sheet.time[1] === 8 && sheet.time[0] % 3 === 0 ? 6 : Math.max(2, Math.round(16 / sheet.time[1]));
    drawnBars.forEach(function (b) { b.items.forEach(function (it) { if (it.idx >= 0) (piecesOf[it.idx] = piecesOf[it.idx] || []).push(it.id); }); });
    var ns = 'http://www.w3.org/2000/svg', maxY = 0;
    document.querySelectorAll('#music g.system').forEach(function (sys) {
      var vy = 0, line = 0;
      sys.querySelectorAll('g.verse[id^="cv"] text').forEach(function (t) { line = Math.max(line, +t.getAttribute('y') || 0); });   // the line kept free for it
      if (line) { sys.dataset.countY = String(line); return; }
      sys.querySelectorAll('g.verse text').forEach(function (t) { vy = Math.max(vy, +t.getAttribute('y') || 0); });
      if (!vy) sys.querySelectorAll('g.measure').forEach(function (m) {
        var st = m.querySelector('g.staff'); if (!st) return;
        Array.prototype.forEach.call(st.children, function (p) {
          if (p.tagName.toLowerCase() !== 'path') return;
          var mm = /M\d+\s+(\d+)/.exec(p.getAttribute('d') || ''); if (mm) vy = Math.max(vy, +mm[1] + 250);
        });
      });
      var cy = (vy || 2400) + 420;
      sys.dataset.countY = String(cy); if (cy > maxY) maxY = cy;
    });
    document.querySelectorAll('#music svg.definition-scale').forEach(function (inner) {
      inner.setAttribute('overflow', 'visible');
      var vb = (inner.getAttribute('viewBox') || '').split(/\s+/).map(Number);
      if (vb.length === 4 && maxY + 250 > vb[3]) inner.setAttribute('viewBox', vb[0] + ' ' + vb[1] + ' ' + vb[2] + ' ' + (maxY + 250));
    });
    drawnBars.forEach(function (b) {
      b.items.forEach(function (it) {
        var el = document.getElementById(it.id); if (!el) return;
        var sys = el.closest('g.system'), mEl = el.closest('g.measure'); if (!sys || !mEl) return;
        var nh = el.querySelector('.notehead') || el, box;
        try { box = nh.getBBox(); } catch (e) { return; }
        var held = it.rest || piecesOf[it.idx][0] !== it.id || M.tied(sheet.notes, it.idx);
        var t = document.createElementNS(ns, 'text');
        t.setAttribute('class', 'count' + (held ? ' held' : ''));
        t.setAttribute('x', String(Math.round(box.x + box.width / 2)));
        t.setAttribute('y', sys.dataset.countY);
        t.textContent = M.countLabel(it.pos, it.v, beat, held);
        mEl.appendChild(t);
      });
    });
  }
  // the drawn elements of an event (a long note is several tied ones), and of one note of a left-hand chord
  function els(h, i) {
    return Array.prototype.filter.call(document.querySelectorAll('#music [id="' + h + i + '"], #music [id^="' + h + i + '_"]'), function (e) { return !/k\d+$/.test(e.id); });
  }
  function headEls(i, k) { return Array.prototype.slice.call(document.querySelectorAll('#music [id="l' + i + 'k' + k + '"], #music [id^="l' + i + '_"][id$="k' + k + '"]')); }
  function mark() {
    document.querySelectorAll('#music .sel, #music .selsoft, #music .changed, #music .noted').forEach(function (e) { e.classList.remove('sel', 'selsoft', 'changed', 'noted'); });
    sheet.notes.forEach(function (n, i) {
      if (n.c) els('n', i).forEach(function (e) { e.classList.add('noted'); });
      if (changed[i]) els('n', i).forEach(function (e) { e.classList.add('changed'); });
    });
    var one = lo() === hi() && hand === 'l' && head >= 0 && M.pitchesOf(list()[sel] || {}).length > 1;
    for (var i = lo(); i <= hi(); i++) els(hand, i).forEach(function (e) { e.classList.add(one ? 'selsoft' : 'sel'); });
    if (one) headEls(sel, head).forEach(function (e) { e.classList.add('sel'); });
    panel(); keyboard();
  }
  function reveal(e) { if (e && e.scrollIntoView) e.scrollIntoView({block: 'nearest', inline: 'nearest'}); }
  function select(i, o) {
    o = o || {};
    sel = clamp(i, 0, Math.max(0, list().length - 1));
    if (!o.extend) anchor = sel;
    if (!o.keepHead) head = -1;
    mark(); reveal(els(hand, sel)[0]);
    if (!o.quiet) beep(list()[sel]);
  }
  function setHand(h) { hand = h; head = -1; document.body.classList.toggle('hand-l', h === 'l'); document.body.classList.toggle('hand-n', h !== 'l'); }
  function setMode(m) {
    mode = m;
    document.body.classList.toggle('mode-melody', m === 'melody'); document.body.classList.toggle('mode-chords', m === 'chords');
    document.querySelectorAll('#tools > .tabs button').forEach(function (b) { b.classList.toggle('on', b.dataset.mode === m); });
    if (m === 'melody' && hand === 'l') { var t = selTime(); setHand('n'); sel = anchor = indexAt(sheet.notes, t); }
    if (sheet) mark();
  }

  // ---- the side panel
  function keyList() {   // the chords of the key in the order of their numbers: I ii iii IV V vi V7
    var k = M.keyChords(sheet);
    return sheet.mode === 'minor' ? k : [k[0], k[1], k[2], k[3], k[4], k[6], k[5]];
  }
  function panel() {
    var a = list(), n = a[sel];
    $('noteTitle').textContent = hand === 'l' ? 'Left hand' : 'Chosen note';
    if (!n) { $('what').textContent = 'Click a note'; lhPanel(); rhPanel(); recPanel(); return; }
    var pl = place(timeOf(sel, a)), many = hi() - lo() + 1;
    $('what').innerHTML = (many > 1 ? many + ' notes chosen' : M.esc(eventName(n, sel)) + ', ' + durName(n.d)) +
      '<small>bar ' + pl.bar + ', beat ' + pl.beat + ' · ' + (hand === 'l' ? 'left hand ' : 'note ') + (sel + 1) + ' of ' + a.length + '</small>';
    $('where').textContent = 'Bar ' + pl.bar + ' · beat ' + pl.beat;
    if (hand === 'n') {
      var nv = verseCount(), box = $('verses');
      if (box.children.length !== nv) {
        box.innerHTML = '';
        for (var v = 0; v < nv; v++) {
          var row = document.createElement('div'); row.className = 'row';
          row.innerHTML = '<label>' + (nv > 1 ? 'Verse ' + (v + 1) : 'Word') + '</label><input type="text" data-verse="' + v + '" autocomplete="off">';
          box.appendChild(row);
        }
      }
      box.querySelectorAll('input').forEach(function (inp) {
        var vi = +inp.dataset.verse, val = (n.w && n.w[vi]) || '';
        if (document.activeElement !== inp || inp.dataset.for !== String(sel)) inp.value = val;
        inp.dataset.for = String(sel); inp.disabled = n.p == null;
      });
      if (document.activeElement !== $('chord')) $('chord').value = n.ch || '';
      var cur = n.ch || '', p = M.splitChord(cur) || {root: '', acc: '', quality: '', bass: '', bassAcc: ''};
      var kc = keyList(), kKey = kc.join(',');
      if (ceUi.lastKey !== kKey) {
        ceUi.lastKey = kKey; $('ceKey').innerHTML = '<span class="ce-lbl">In key</span>';
        ceUi.keyBtns = kc.map(function (c, i) {
          var b = document.createElement('button'); b.type = 'button'; b.className = 'note'; b.innerHTML = '<sup>' + (i + 1) + '</sup>' + M.esc(c);
          b.onclick = function () { var m = sheet.notes[sel]; setChordText(m && m.ch === c ? '' : c); b.blur(); }; $('ceKey').appendChild(b); return [c, b];
        });
      }
      var fit = M.chordFit(sheet, sel, kc);
      ceUi.keyBtns.forEach(function (kb, i) {
        kb[1].classList.toggle('on', cur === kb[0]);
        kb[1].classList.toggle('fit', fit[i] >= 0.5); kb[1].classList.toggle('half', fit[i] >= 0.5 && fit[i] < 0.8);
        kb[1].title = fit[i] >= 0.5 ? 'Holds ' + Math.round(fit[i] * 100) + '% of the melody from here to the next chord' : '';
      });
      M.ROOTS.forEach(function (r, i) {
        ceUi.rootBtns[i].classList.toggle('on', p.root === r);
        ceUi.bassBtns[i].classList.toggle('on', p.bass === r);
        ceUi.bassBtns[i].disabled = !p.root;
      });
      ceUi.flat.classList.toggle('on', p.acc === 'b'); ceUi.sharp.classList.toggle('on', p.acc === '#');
      ceUi.flat.disabled = ceUi.sharp.disabled = !p.root;
      ceUi.qualBtns.forEach(function (qb) { qb[1].classList.toggle('on', !!p.root && p.quality === qb[0]); qb[1].disabled = !p.root; });
      ceUi.bassNone.classList.toggle('on', !!p.root && !p.bass); ceUi.bassNone.disabled = !p.root;
      ceUi.bassFlat.classList.toggle('on', p.bassAcc === 'b'); ceUi.bassSharp.classList.toggle('on', p.bassAcc === '#');
      ceUi.bassFlat.disabled = ceUi.bassSharp.disabled = !p.bass;
      $('chordClear').disabled = !cur;
      if (document.activeElement !== $('comment')) $('comment').value = n.c || '';
    }
    document.querySelectorAll('#durs button').forEach(function (bt) { bt.classList.toggle('on', many === 1 && +bt.dataset.d === n.d); });
    var cl = $('comments'); cl.innerHTML = '';
    sheet.notes.forEach(function (m, i) {
      if (!m.c) return;
      var d = document.createElement('div'); d.innerHTML = '<b>Note ' + (i + 1) + ' (' + M.esc((m.w && m.w[0]) || M.noteName(sheet, m.p, m.e)) + ')</b> ' + M.esc(m.c);
      d.onclick = function () { setHand('n'); select(i); }; cl.appendChild(d);
    });
    lhPanel(); rhPanel(); recPanel();
  }

  // ---- the right hand's panel: notes of the chord under the melody
  var RH_ON = {chord: 'where a chord starts', beat: 'on the beat', long: 'on long notes', all: 'on every note'};
  function rhPanel() {
    if (!sheet) return;
    var r = sheet.rh || {add: 0}, add = r.add | 0, on = r.on || 'beat';
    document.querySelectorAll('#rhAdd button').forEach(function (b) { b.classList.toggle('on', +b.dataset.add === add); });
    document.querySelectorAll('#rhOn button').forEach(function (b) { b.classList.toggle('on', b.dataset.on === on); });
    $('rhOn').style.display = add ? '' : 'none';
    $('rhState').textContent = add ? '· ' + (add === 1 ? 'two' : 'three') + ' notes ' + RH_ON[on] : '';
    $('rhHandRow').style.display = hand === 'n' && chosen().some(function (n) { return Array.isArray(n.h); }) ? '' : 'none';
  }
  function setRight(add, on) {
    edit(function () { if (add) sheet.rh = {add: add, on: on || (sheet.rh && sheet.rh.on) || 'beat'}; else delete sheet.rh; });
    if (!prefs.left && add) { prefs.left = true; keep(); render(); }
    if (add) audition();
  }

  // ---- the left hand's panel
  var RATES = [[0, 'held'], [16, 'whole notes'], [8, 'half notes'], [6, 'dotted quarters'], [4, 'quarters'], [3, 'dotted eighths'], [2, 'eighths'], [1, 'sixteenths']];
  function inEffect() {   // the pattern that plays at the chosen note
    var a = sheet.acc || null, i = hand === 'n' ? sel : indexAt(sheet.notes, selTime()), on = M.onsets(sheet.notes), once = null;
    for (var k = 0; k <= i && k < sheet.notes.length; k++) {
      var x = sheet.notes[k].lh; if (!x) continue;
      if (!x['for']) a = x; else if (place(on[k]).bar === place(on[i]).bar) once = x;
    }
    return once || a;
  }
  function target() { var n = sheet.notes[sel]; return scope === 'song' ? (sheet.acc || null) : (n && n.lh) || null; }
  function lhPanel() {
    if (!sheet) return;
    var n = hand === 'n' ? sheet.notes[sel] : null;
    if (n && n.lh) scope = n.lh['for'] === 'bar' ? 'bar' : 'here'; else if (scopeFor !== sel || hand !== 'n') scope = 'song';
    var cur = target() || (scope === 'song' ? null : inEffect()), off = !cur || !M.parsePattern(cur.pat).length;
    var st = M.styles(sheet), f = off ? null : M.findStyle(sheet, cur);
    $('lhState').textContent = lh && lh.written ? 'written out' : lh ? '· ' + patternLabel(inEffect()) : '';
    var fams = [['none', 'None']].concat(st.map(function (x) { return [x.id, x.name]; }), [['own', 'Own']]);
    var active = off ? 'none' : f ? st[f.family].id : 'own', fb = $('lhFamily');
    fb.innerHTML = '';
    fams.forEach(function (x) {
      var b = document.createElement('button'); b.type = 'button'; b.textContent = x[1]; b.className = x[0] === active ? 'on' : '';
      b.onclick = function () { pickFamily(x[0]); }; fb.appendChild(b);
    });
    var kb = $('lhKind'), rb = $('lhRhythm'); kb.innerHTML = ''; rb.innerHTML = '';
    if (f) {
      var fam = st[f.family];
      fam.kinds.forEach(function (k, ki) {
        var b = document.createElement('button'); b.type = 'button'; b.className = ki === f.kind ? 'on' : '';
        b.innerHTML = M.esc(k.name) + (fam.id === 'bass' ? '' : '<small>' + M.esc(k.hint) + '</small>'); b.title = k.rhythms[0].pat;
        b.onclick = function () { applyStyle(fam, k, k.rhythms[Math.min(f.rhythm, k.rhythms.length - 1)]); }; kb.appendChild(b);
      });
      var kind = fam.kinds[f.kind];
      if (kind.rhythms.length > 1) kind.rhythms.forEach(function (r, ri) {
        var b = document.createElement('button'); b.type = 'button'; b.className = ri === f.rhythm ? 'on' : ''; b.textContent = r.name; b.title = r.pat;
        b.onclick = function () { applyStyle(fam, kind, r); }; rb.appendChild(b);
      });
    }
    $('lhCustom').style.display = off ? 'none' : '';
    document.querySelector('#lhCard details').style.display = off ? 'none' : '';
    document.querySelector('#lhCard .opts').style.display = off ? 'none' : '';
    if (!off) {
      if (document.activeElement !== $('lhPat')) $('lhPat').value = cur.pat;
      var rs = $('lhRate'), has = false; rs.innerHTML = '';
      RATES.forEach(function (r) { var o = document.createElement('option'); o.value = r[0]; o.textContent = r[1]; rs.appendChild(o); if (r[0] === (cur.rate | 0)) has = true; });
      if (!has) { var o2 = document.createElement('option'); o2.value = cur.rate | 0; o2.textContent = (cur.rate | 0) + ' sixteenths'; rs.appendChild(o2); }
      rs.value = String(cur.rate | 0);
      $('lhLow').textContent = M.noteName(sheet, cur.low == null ? 36 : cur.low);
      $('lhPedal').classList.toggle('on', !!cur.pedal); $('lhEnd').classList.toggle('on', cur.end !== false);
      $('lhPedal').disabled = !(cur.rate | 0);
    }
    document.querySelectorAll('#lhScope button').forEach(function (b) { b.classList.toggle('on', b.dataset.scope === scope); b.disabled = hand !== 'n'; });
    var ch = $('lhChanges'); ch.innerHTML = '';
    sheet.notes.forEach(function (m, i) {
      if (!m.lh) return;
      var d = document.createElement('div'), x = document.createElement('button');
      d.innerHTML = '<b>Bar ' + place(timeOf(i, sheet.notes)).bar + (m.lh['for'] === 'bar' ? ' only' : ' on') + '</b><span>' + M.esc(patternLabel(m.lh)) + '</span>';
      x.type = 'button'; x.textContent = '✕'; x.title = 'Take this change out';
      x.onclick = function (e) { e.stopPropagation(); edit(function () { delete m.lh; }); };
      d.onclick = function () { setHand('n'); select(i, {quiet: true}); }; d.appendChild(x); ch.appendChild(d);
    });
    $('writeOut').disabled = !lh || lh.written;
  }
  function setPattern(a) {   // a pattern, or null for none, where the "Applies to" buttons say
    var n = sheet.notes[sel], where = scope;
    if (where !== 'song' && (hand !== 'n' || !n)) where = 'song';
    edit(function () {
      if (where === 'song') { if (a) { delete a['for']; sheet.acc = a; } else delete sheet.acc; }
      else { a = a || {pat: ''}; if (where === 'bar') a['for'] = 'bar'; else delete a['for']; n.lh = a; }
    });
    if (a && !prefs.left) { prefs.left = true; keep(); render(); }
    if (a && a.pat) audition();
  }
  function applyStyle(fam, kind, r) {
    var cur = target() || inEffect() || {}, a = {pat: r.pat, rate: r.rate, low: r.low, style: fam.id + '/' + kind.id};
    if (cur.pedal && r.rate) a.pedal = true;
    if (cur.end === false) a.end = false;
    setPattern(a);
  }
  function pickFamily(id) {
    if (id === 'none') { setPattern(null); return; }
    if (id === 'own') {
      if (!target() && !inEffect()) setPattern({pat: '1 5 8 5', rate: Math.max(1, M.beatLen(sheet) / 2), low: 36});
      $('lhPat').focus(); $('lhPat').select(); return;
    }
    var fam = M.styles(sheet).filter(function (x) { return x.id === id; })[0], kind = fam.kinds[0];
    applyStyle(fam, kind, kind.rhythms[id === 'arp' && kind.rhythms.length > 1 ? 1 : 0]);
  }
  function tweak(fn) {   // change one thing of the pattern shown
    var cur = target() || inEffect(); if (!cur) return;
    var a = copy(cur); fn(a); setPattern(a);
  }
  function audition() {   // let the bar of the chosen note be heard
    if (!prefs.acc || S.playing()) return;
    var pl = place(selTime()); startPlay(pl.start, pl.end, false, true);
  }

  // ---- the recording beside the sheet
  // sheet.sync: [[sixteenths from the first note, seconds in the recording], ...], places set by ear; between two of
  // them time runs evenly, outside them at the sheet's tempo.
  function unit() { return 60 / (sheet.tempo || 90) / 4; }
  function syncPoints() {
    var a = (sheet.sync || []).filter(function (x) { return x && x.length === 2; }).slice().sort(function (x, y) { return x[0] - y[0]; });
    if (!a.length && hintStart != null) { var i = 0; while (i < sheet.notes.length - 1 && M.isRest(sheet.notes[i])) i++; a = [[timeOf(i, sheet.notes), hintStart]]; }
    return a.length ? a : [[0, 0]];
  }
  function secondsAt(t) {
    var a = syncPoints(), u = unit();
    if (a.length === 1) return a[0][1] + (t - a[0][0]) * u;
    var k = 0; while (k < a.length - 2 && t > a[k + 1][0]) k++;
    var x = a[k], y = a[k + 1], slope = y[0] > x[0] ? (y[1] - x[1]) / (y[0] - x[0]) : u;
    return x[1] + (t - x[0]) * slope;
  }
  function timeAt(sec) {
    var a = syncPoints(), u = unit();
    if (a.length === 1) return a[0][0] + (sec - a[0][1]) / u;
    var k = 0; while (k < a.length - 2 && sec > a[k + 1][1]) k++;
    var x = a[k], y = a[k + 1], slope = y[1] > x[1] ? (y[0] - x[0]) / (y[1] - x[1]) : 1 / u;
    return x[0] + (sec - x[1]) * slope;
  }
  function recPanel() {
    if ($('audiocard').hidden || !sheet) return;
    var n = (sheet.sync || []).length;
    $('syncInfo').textContent = n ? n + (n === 1 ? ' place' : ' places') + ' set by ear' : hintStart != null ? 'The start is taken from the transcription' : 'Not set: the recording is taken to start with the first note';
    $('syncClear').hidden = !n; $('follow').classList.toggle('on', prefs.follow);
  }
  function follow() {
    var au = $('audio');
    document.querySelectorAll('#music .heard').forEach(function (e) { e.classList.remove('heard'); });
    if (au.paused || !prefs.follow || !sheet) { heardIdx = -1; return; }
    var t = timeAt(au.currentTime), i = t < 0 || t >= M.total(sheet.notes) ? -1 : indexAt(sheet.notes, t);
    if (i >= 0) { var e = els('n', i); e.forEach(function (x) { x.classList.add('heard'); }); if (i !== heardIdx) reveal(e[0]); }
    heardIdx = i; requestAnimationFrame(follow);
  }

  // ---- the keyboard at the bottom: what sounds at the chosen note, and a way to set a pitch
  var KEY_LO = 36, KEY_HI = 84, keyEls = {};
  function buildKeys() {
    var box = $('keys'), whites = 0, p;
    for (p = KEY_LO; p <= KEY_HI; p++) if ([1, 3, 6, 8, 10].indexOf(p % 12) < 0) whites++;
    var w = 100 / whites, x = 0;
    for (p = KEY_LO; p <= KEY_HI; p++) {
      var black = [1, 3, 6, 8, 10].indexOf(p % 12) >= 0, k = document.createElement('div');
      k.className = 'k ' + (black ? 'b' : 'w'); k.dataset.p = p;
      k.style.left = (black ? x - w * 0.3 : x) + '%'; k.style.width = (black ? w * 0.6 : w) + '%';
      k.innerHTML = '<i></i>' + (p % 12 === 0 ? '<span>C' + (p / 12 - 1) + '</span>' : '');
      box.appendChild(k); keyEls[p] = k; if (!black) x += w;
    }
    box.addEventListener('mousedown', function (e) {
      var k = e.target.closest('.k'); if (!k || !sheet) return;
      e.preventDefault(); keyPressed(+k.dataset.p);
    });
  }
  function keyboard() {
    if (!sheet || !prefs.keys) return;
    Object.keys(keyEls).forEach(function (p) { keyEls[p].classList.remove('mel', 'left', 'tone'); });
    var t = selTime(), mi = hand === 'n' ? sel : indexAt(sheet.notes, t), m = sheet.notes[mi];
    var chord = null; for (var k = Math.min(mi, sheet.notes.length - 1); k >= 0; k--) if (sheet.notes[k].ch) { chord = M.chordInfo(sheet.notes[k].ch); break; }
    if (chord) { var pcs = chord.tones.map(function (x) { return M.mod12(chord.root + x[0]); }); Object.keys(keyEls).forEach(function (p) { if (pcs.indexOf(p % 12) >= 0) keyEls[p].classList.add('tone'); }); }
    if (lh && lh.events.length && t < M.total(lh.events)) M.pitchesOf(lh.events[hand === 'l' ? sel : indexAt(lh.events, t)]).forEach(function (p) { if (keyEls[p]) keyEls[p].classList.add('left'); });
    if (rh && rh[mi] && (hand === 'n' || t < M.total(sheet.notes))) rh[mi].forEach(function (p) { if (keyEls[p]) keyEls[p].classList.add('left'); });
    if (m && !M.isRest(m) && (hand === 'n' || t < M.total(sheet.notes)) && keyEls[m.p]) keyEls[m.p].classList.add('mel');
  }
  function keyPressed(p) {
    var n = list()[sel];
    if (hand === 'l' && n) {
      edit(function () { var ps = M.pitchesOf(n), at = ps.indexOf(p); if (at >= 0) ps.splice(at, 1); else ps.push(p); n.p = ps.length ? ps.sort(function (a, b) { return a - b; }) : null; delete n.tie; head = -1; });
    } else if (mode === 'melody' && n) edit(function () { n.p = p; delete n.e; delete n.tie; n.w = n.w || ['']; });
    else if (mode === 'chords' && hand === 'n' && n && !M.isRest(n) && p < n.p) {   // a note added under the melody, by hand
      edit(function () { var hs = (rh && rh[sel] ? rh[sel].slice() : []), at = hs.indexOf(p); if (at >= 0) hs.splice(at, 1); else hs.push(p); n.h = hs.sort(function (a, b) { return a - b; }); });
      if (!prefs.left) { prefs.left = true; keep(); render(); }
    }
    try { S.note(p, S.now(), 0.4, 0.22, prefs.tone); } catch (e) {}
  }
  function light(ps, ms) {
    ps.forEach(function (p) { var k = keyEls[p]; if (!k) return; k.classList.add('sound'); setTimeout(function () { k.classList.remove('sound'); }, Math.max(80, ms)); });
  }

  // ---- every change goes through edit(): undo step, redraw, save
  function edit(fn, keepRedo) {
    undo.push(JSON.stringify(sheet)); if (undo.length > 300) undo.shift();
    if (!keepRedo) redo = [];
    fn(); changed = {}; touch();
  }
  function touch() { dirty = true; render(); status('Saving…', 'busy'); clearTimeout(saveTimer); saveTimer = setTimeout(save, 500); }
  function status(text, kind) { $('status').textContent = text; $('status').className = 'pill' + (kind ? ' ' + kind : ''); }
  function now() { return new Date().toLocaleTimeString([], {hour: '2-digit', minute: '2-digit', second: '2-digit'}); }
  function q() { return '?song=' + encodeURIComponent(song); }
  function save() {
    if (saving || !dirty) return;
    saving = true; dirty = false;
    var lead = leadMei, piano = pianoMei;
    fetch('/api/sheet' + q() + '&rev=' + rev, {method: 'PUT', body: JSON.stringify(sheet)})
      .then(function (r) { return r.json().then(function (j) { return {code: r.status, j: j}; }); })
      .then(function (r) {
        saving = false;
        if (r.code === 200) {
          rev = r.j.rev; if (dirty) save(); else status('Saved ' + now());
          fetch('/api/mei' + q(), {method: 'PUT', body: lead}).catch(function () {});   // leadsheet.mei beside it
          if (piano !== sentPiano) { sentPiano = piano; fetch('/api/mei' + q() + '&kind=piano', {method: 'PUT', body: piano}).catch(function () {}); }   // piano.mei, or none
        }
        else if (r.code === 409) load(true, 'The file was changed elsewhere at the same moment: that version is shown, your last change was not saved');
        else status('Not saved: ' + (r.j.error || r.code), 'warn');
      }).catch(function () { saving = false; dirty = true; status('Not saved: is the server running?', 'warn'); });
  }
  function tidy(s) { s.time = s.time || [4, 4]; s.notes = s.notes || []; s.pickup = s.pickup || 0; if (!Array.isArray(s.left) || !s.left.length) delete s.left; return s; }
  function load(keepSel, why) {
    return fetch('/api/sheet' + q()).then(function (r) { return r.json(); }).then(function (j) {
      if (!j.sheet) { status(j.error || 'No sheet', 'warn'); return; }
      var old = sheet; sheet = tidy(j.sheet); rev = j.rev; dirty = false; hintStart = typeof j.start === 'number' ? j.start : null;
      changed = {};
      if (old && keepSel) {   // what changed in the file: compared from the front and from the back
        var a = old.notes, b = sheet.notes, s = 0, e = 0;
        while (s < a.length && s < b.length && JSON.stringify(a[s]) === JSON.stringify(b[s])) s++;
        while (e < a.length - s && e < b.length - s && JSON.stringify(a[a.length - 1 - e]) === JSON.stringify(b[b.length - 1 - e])) e++;
        for (var i = s; i < b.length - e; i++) changed[i] = true;
        undo.push(JSON.stringify(old)); redo = [];
      } else { undo = []; redo = []; sel = anchor = 0; setHand('n'); sentPiano = null; }
      fields(); render();
      if (j.audio) { $('audiocard').hidden = false; if (!keepSel) $('audio').src = '/audio' + q(); } else $('audiocard').hidden = true;
      recPanel();
      status(why || (keepSel ? 'Updated from the file ' + now() : 'Loaded'), why ? 'warn' : '');
    });
  }
  function poll() {
    if (!song || dirty || saving) return;
    fetch('/api/rev' + q()).then(function (r) { return r.json(); }).then(function (j) {
      if (j.rev && j.rev !== rev && !dirty && !saving) load(true);
    }).catch(function () { status('The server does not answer', 'warn'); });
  }
  function fields() {
    $('title').value = sheet.title || ''; $('key').value = sheet.key || 'C'; $('mode').value = sheet.mode || 'major';
    $('timeN').value = sheet.time[0]; $('timeD').value = sheet.time[1]; $('tempo').value = sheet.tempo || 90; $('pickup').value = (sheet.pickup || 0) / 2;
    if (document.activeElement !== $('message')) $('message').value = sheet.message || '';
  }

  // ---- sound
  function beep(n) {
    if (!n || M.isRest(n) || S.playing()) return;
    var ps = M.pitchesOf(n); if (hand === 'l' && head >= 0 && ps[head] != null) ps = [ps[head]];
    try { ps.forEach(function (p) { S.note(p, S.now(), 0.35, hand === 'l' ? 0.17 : 0.22, prefs.tone); }); } catch (e) {}
  }
  function beepChord(s) {
    if (!s || S.playing() || !prefs.acc) return;
    try { M.chordPitches(s).forEach(function (p, i) { S.note(p, S.now(), 0.5, i === 0 ? 0.12 : 0.08, 'soft'); }); } catch (e) {}
  }
  function stopPlay() { S.stop(); }
  function startPlay(from, to, loop, quiet) {
    var pl = M.playList(sheet), ev = [], tone = prefs.tone;
    pl.mel.forEach(function (m) {
      ev.push({t: m.t, d: m.d, show: !quiet, hand: 'n', i: m.i, ps: [m.p], fire: function (when, sec) { if (prefs.mel) S.note(m.p, when, sec * 0.96, 0.26, tone); }});
    });
    if (prefs.acc) {
      pl.fill.forEach(function (f) {
        ev.push({t: f.t, d: f.d, fire: function (when, sec) { f.ps.forEach(function (p) { S.note(p, when, sec * 0.96, 0.14, tone); }); if (prefs.keys && !quiet) setTimeout(function () { light(f.ps, sec * 900); }, Math.max(0, (when - S.now()) * 1000)); }});
      });
      pl.left.forEach(function (l) {
        ev.push({t: l.t, d: l.d, show: !quiet, hand: 'l', i: l.i, ps: l.ps, fire: function (when, sec) { l.ps.forEach(function (p) { S.note(p, when, sec * 0.98, 0.16, tone); }); }});
      });
      if (!pl.left.length && !pl.fill.length) pl.pad.forEach(function (c) {
        ev.push({t: c.t, d: c.d, fire: function (when, sec) { c.ps.forEach(function (p, i) { S.note(p, when, Math.max(0.05, sec - 0.03), i === 0 ? 0.11 : 0.065, 'soft'); }); }});
      });
    }
    if (prefs.metro && !quiet) {
      var beat = M.beatLen(sheet), bar = M.barLen(sheet), off = M.gridOff(sheet);
      for (var g = Math.ceil(off / beat) * beat; g - off < pl.total; g += beat) (function (strong) {
        ev.push({t: g - off, d: 1, fire: function (when) { S.click(when, strong); }});
      })(g % bar === 0);
    }
    ev.sort(function (a, b) { return a.t - b.t; });
    $('play').textContent = '■ Stop'; $('play').classList.add('sounding');
    S.play({events: ev, from: from, to: Math.max(from + 1, to), loop: loop, unit: unit() / prefs.speed,
      onEvent: function (e) {
        document.querySelectorAll('#music .playing.h' + e.hand).forEach(function (x) { x.classList.remove('playing', 'h' + e.hand); });
        els(e.hand, e.i).forEach(function (x) { x.classList.add('playing', 'h' + e.hand); });
        if (prefs.keys) light(e.ps, e.d * unit() / prefs.speed * 900);
      },
      onEnd: function () {
        document.querySelectorAll('#music .playing').forEach(function (x) { x.classList.remove('playing', 'hn', 'hl'); });
        $('play').textContent = '▶ Play'; $('play').classList.remove('sounding');
      }});
  }
  function play() {
    if (S.playing()) { stopPlay(); return; }
    var a = list(), many = hi() > lo(), from = timeOf(lo(), a), end = Math.max(M.total(sheet.notes), lh ? M.total(lh.events) : 0);   // lh: the left hand may go on longer
    if (!$('audio').paused) $('audio').pause();
    if (prefs.loop) {
      if (many) startPlay(from, timeOf(hi() + 1, a), true);
      else { var pl = place(from); startPlay(pl.start, Math.min(pl.end, end), true); }
    } else startPlay(!many && sel >= a.length - 1 ? 0 : from, many ? timeOf(hi() + 1, a) : end, false);
  }

  // ---- actions
  function stepPitch(p, dir, how) {
    if (how === 'semi') p += dir; else if (how === 'oct') p += 12 * dir;
    else { var sc = M.scalePcs(sheet); do { p += dir; } while (sc.indexOf(M.mod12(p)) < 0); }
    return clamp(p, hand === 'l' ? 21 : 36, 96);
  }
  function step(dir, how) {
    var ns = chosen().filter(function (n) { return !M.isRest(n); }); if (!ns.length) return;
    edit(function () {
      ns.forEach(function (n) {
        if (hand === 'l') {
          var ps = M.pitchesOf(n), one = ns.length === 1 && head >= 0 && head < ps.length, moved = null;
          ps = ps.map(function (p, k) { if (one && k !== head) return p; var x = stepPitch(p, dir, how); if (one) moved = x; return x; });
          ps = ps.filter(function (p, k) { return ps.indexOf(p) === k; }).sort(function (a, b) { return a - b; });
          n.p = ps; if (one) head = ps.indexOf(moved);
        } else { n.p = stepPitch(n.p, dir, how); delete n.e; }
        delete n.tie;
      });
    });
    beep(list()[sel]);
  }
  function setDur(d) { var ns = chosen(); if (ns.length) edit(function () { ns.forEach(function (n) { n.d = d; }); }); }
  function near() { var a = sheet.notes; for (var i = Math.min(sel, a.length - 1); i >= 0; i--) if (a[i] && a[i].p != null) return a[i].p; return 67; }
  function blank(n) {   // a new event like this one
    if (hand === 'l') return {p: n && !M.isRest(n) ? M.pitchesOf(n) : [48], d: n ? n.d : 4};
    return {p: n && n.p != null ? n.p : near(), d: n ? n.d : 4, w: ['']};
  }
  function setChordText(v) {
    var n = sheet && hand === 'n' && sheet.notes[sel]; if (!n) return;
    v = (v || '').trim();
    if ((n.ch || '') === v) return;
    edit(function () { if (v) n.ch = v; else delete n.ch; });
    if (v) { if (lh || rh) audition(); else beepChord(v); }
  }
  function editChordPart(fn) {
    var n = sheet && hand === 'n' && sheet.notes[sel]; if (!n) return;
    var p = M.splitChord(n.ch) || {root: '', acc: '', quality: '', bass: '', bassAcc: ''};
    fn(p); setChordText(M.composeChord(p));
  }
  function goBar(dir) {
    var a = list(), on = M.onsets(a), pl = place(on[sel] || 0), i;
    if (dir > 0) { for (i = sel + 1; i < a.length && on[i] < pl.end; i++); if (i < a.length) select(i); }
    else { for (i = sel; i > 0 && on[i - 1] >= pl.start; i--); if (i === sel && i > 0) { var p2 = place(on[i - 1]); for (i = i - 1; i > 0 && on[i - 1] >= p2.start; i--); } select(i); }
  }
  function goChord(dir) {
    if (hand !== 'n') return;
    for (var i = sel + dir; i >= 0 && i < sheet.notes.length; i += dir) if (sheet.notes[i].ch) { select(i, {quiet: true}); beepChord(sheet.notes[i].ch); return; }
  }
  function download(data, name, type) {
    var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([data], {type: type})); a.download = name; a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  }
  function letter(l, add) {   // the nearest pitch with that letter, in the key; `add`: one more note in a left-hand chord
    var n = list()[sel]; if (!n) return;
    var ka = M.keyAlter(sheet), pc = M.mod12(M.PC[l.toUpperCase()] + ka[l.toLowerCase()]), ps = M.pitchesOf(n);
    var base = hand === 'l' ? (ps.length ? ps[head >= 0 && head < ps.length ? head : ps.length - 1] : 48) : (n.p != null ? n.p : near()), best = null;
    for (var p = base - 6; p <= base + 6; p++) if (M.mod12(p) === pc && (best === null || Math.abs(p - base) < Math.abs(best - base))) best = p;
    edit(function () {
      if (hand === 'l') {
        if (add || !ps.length) ps.push(best); else ps[head >= 0 && head < ps.length ? head : ps.length - 1] = best;
        ps = ps.filter(function (x, k) { return ps.indexOf(x) === k; }).sort(function (a, b) { return a - b; });
        n.p = ps; head = ps.indexOf(best);
      } else { n.p = best; delete n.e; n.w = n.w || ['']; }
      delete n.tie;
    });
    beep(n);
  }
  function copyNotes(cut) {
    var ns = chosen(); if (!ns.length) return;
    clip = {hand: hand, events: copy(ns)};
    if (cut) act('del'); else toast(ns.length + (ns.length === 1 ? ' note' : ' notes') + ' copied: Ctrl V puts them after the chosen note');
  }
  function paste() {
    if (!clip || !clip.events.length) return;
    var evs = clip.events.map(function (e) {
      if (hand === 'l') return {p: M.isRest(e) ? null : M.pitchesOf(e), d: e.d};
      var n = {p: M.isRest(e) ? null : M.pitchesOf(e).pop(), d: e.d};   // the words stay behind: a repeated line is sung to other words
      if (n.p != null) n.w = ['']; if (clip.hand === 'n') { if (e.ch) n.ch = e.ch; if (e.e) n.e = true; if (e.tie) n.tie = true; if (e.h) n.h = e.h; }
      return n;
    });
    edit(function () { var a = list(), at = a.length ? hi() + 1 : 0; Array.prototype.splice.apply(a, [at, 0].concat(evs)); anchor = at; sel = at + evs.length - 1; });
  }
  function act(a) {
    var L = list(), n = L[sel], ns = chosen();
    if (a === 'up') step(1); else if (a === 'down') step(-1); else if (a === 'sharp') step(1, 'semi'); else if (a === 'flat') step(-1, 'semi');
    else if (a === 'octup') step(1, 'oct'); else if (a === 'octdown') step(-1, 'oct');
    else if (a === 'enh') { if (hand === 'n' && ns.length) edit(function () { ns.forEach(function (m) { if (m.p == null) return; if (m.e) delete m.e; else m.e = true; }); }); }
    else if (a === 'rest') {
      if (ns.length) edit(function () { ns.forEach(function (m) {
        if (M.isRest(m)) { m.p = m.was || (hand === 'l' ? [48] : near()); delete m.was; if (hand === 'n') m.w = m.w || ['']; }
        else { m.was = m.p; m.p = null; delete m.tie; }
      }); });
    }
    else if (a === 'before' || a === 'after') {
      edit(function () {
        var m = blank(n), at = a === 'before' ? lo() : hi() + 1;
        if (!L.length) at = 0;
        L.splice(at, 0, m); sel = anchor = at; head = -1;
      });
    }
    else if (a === 'tie') {
      var b = L[sel - 1];
      if (n && !M.isRest(n) && b && !M.isRest(b)) edit(function () {
        if (n.tie) delete n.tie;
        else { n.tie = true; n.p = hand === 'l' ? M.pitchesOf(b) : b.p; delete n.e; if (b.e) n.e = true; if (hand === 'n') n.w = (n.w || ['']).map(function () { return ''; }); }
      });
    }
    else if (a === 'split') { if (n && n.d > 1) edit(function () { var h = Math.floor(n.d / 2), m = blank(n); m.d = n.d - h; if (M.isRest(n)) m.p = null; L.splice(sel + 1, 0, m); n.d = h; anchor = sel; }); }
    else if (a === 'del') {
      if (!ns.length) return;
      edit(function () {
        var ps = n ? M.pitchesOf(n) : [];
        if (hand === 'l' && ns.length === 1 && head >= 0 && ps.length > 1) { ps.splice(head, 1); n.p = ps; head = -1; return; }   // one note of a chord
        L.splice(lo(), ns.length); sel = anchor = clamp(lo(), 0, Math.max(0, L.length - 1)); head = -1;
        if (hand === 'l' && !L.length) delete sheet.left;
      });
    }
    else if (a === 'undo') { if (undo.length) { redo.push(JSON.stringify(sheet)); sheet = tidy(JSON.parse(undo.pop())); changed = {}; fields(); touch(); } }
    else if (a === 'redo') { if (redo.length) { undo.push(JSON.stringify(sheet)); sheet = tidy(JSON.parse(redo.pop())); changed = {}; fields(); touch(); } }
    else if (a === 'trup' || a === 'trdown') {
      edit(function () {
        var d = a === 'trup' ? 1 : -1, pc = M.mod12(M.tonicPc(sheet) + d);
        sheet.notes.forEach(function (m) { if (m.p != null) m.p += d; delete m.e; if (m.ch) m.ch = M.trChord(m.ch, d); if (m.h) m.h = m.h.map(function (p) { return p + d; }); });
        (sheet.left || []).forEach(function (m) { if (!M.isRest(m)) m.p = M.pitchesOf(m).map(function (p) { return p + d; }); });
        sheet.key = M.FLAT_NAMES[pc] === 'Gb' ? 'F#' : M.FLAT_NAMES[pc]; fields();
      });
    }
    else if (a === 'verse') edit(function () { var nv = verseCount(); sheet.notes.forEach(function (m) { if (m.p != null) { m.w = m.w || ['']; while (m.w.length <= nv) m.w.push(''); } }); });
    else if (a === 'counts') { prefs.counts = !prefs.counts; keep(); toggles(); render(); }
    else if (a === 'lhshow') { prefs.left = !prefs.left; keep(); render(); }
    else if (a === 'zoomin' || a === 'zoomout') { prefs.zoom = clamp(Math.round((prefs.zoom + (a === 'zoomin' ? 0.1 : -0.1)) * 10) / 10, 0.6, 1.8); keep(); toggles(); render(); }
    else if (a === 'keysshow') { prefs.keys = !prefs.keys; keep(); toggles(); keyboard(); }
    else if (a === 'theme') { prefs.theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'; keep(); toggles(); }
    else if (a === 'help') $('help').hidden = !$('help').hidden;
    else if (a === 'playMel') { prefs.mel = !prefs.mel; keep(); toggles(); }
    else if (a === 'playCh') { prefs.acc = !prefs.acc; keep(); toggles(); if (S.playing()) { stopPlay(); play(); } }
    else if (a === 'loop') { prefs.loop = !prefs.loop; keep(); toggles(); if (S.playing()) { stopPlay(); play(); } }
    else if (a === 'metro') { prefs.metro = !prefs.metro; keep(); toggles(); if (S.playing()) { stopPlay(); play(); } }
    else if (a === 'play') play();
    else if (a === 'prevbar') goBar(-1); else if (a === 'nextbar') goBar(1);
    else if (a === 'prevchord') goChord(-1); else if (a === 'nextchord') goChord(1);
    else if (a === 'print') window.print();
    else if (a === 'mei') download(leadMei, (song || 'sheet') + '.mei', 'application/xml');
    else if (a === 'pianomei') { if (pianoMei) download(pianoMei, (song || 'sheet') + '-piano.mei', 'application/xml'); }
    else if (a === 'midi') { var bin = atob(tk.renderToMIDI()), u = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); download(u, (song || 'sheet') + '.mid', 'audio/midi'); }
    // the left hand
    else if (a === 'lhdown' || a === 'lhup') tweak(function (x) { x.low = clamp((x.low == null ? 36 : x.low) + (a === 'lhup' ? 12 : -12), 24, 60); });
    else if (a === 'lhpedal') tweak(function (x) { if (x.pedal) delete x.pedal; else x.pedal = true; });
    else if (a === 'lhend') tweak(function (x) { if (x.end === false) delete x.end; else x.end = false; });
    else if (a === 'writeout') {
      if (!lh || lh.written) return;
      edit(function () { sheet.left = lh.events.map(function (e) { return {p: e.p ? e.p.slice() : null, d: e.d}; }); });
      toast('The left hand is notes of its own now: click one to change it. Undo (Ctrl Z) goes back to the pattern.');
    }
    else if (a === 'rhauto') { if (hand === 'n' && ns.some(function (m) { return m.h; })) edit(function () { ns.forEach(function (m) { delete m.h; }); }); }
    else if (a === 'unwrite') { if (sheet.left) { edit(function () { delete sheet.left; }); toast('The left hand follows the chords and the pattern again.'); } }
    else if (a === 'regenbar') {
      var gen = M.accompany(sheet);
      if (!sheet.left || !gen) { toast('The sheet has no pattern to make this bar from: choose one after "Back to the pattern".'); return; }
      var p1 = place(timeOf(lo(), L)), p2 = place(Math.max(timeOf(lo(), L), timeOf(hi() + 1, L) - 1));
      edit(function () {
        var part = M.sliceEvents(gen.events, p1.start, p2.end); if (part.length) delete part[0].tie;
        sheet.left = M.replaceRange(sheet.left, p1.start, p2.end, part);
        if (hand === 'l') sel = anchor = indexAt(sheet.left, p1.start);
      });
    }
    // the recording
    else if (a === 'recfrom') {
      var au = $('audio'); if ($('audiocard').hidden) return;
      if (!au.paused) { au.pause(); return; }
      stopPlay(); au.playbackRate = +$('recRate').value || 1;
      try { au.currentTime = Math.max(0, secondsAt(selTime()) - 0.12); } catch (e) {}
      au.play();
    }
    else if (a === 'follow') { prefs.follow = !prefs.follow; keep(); recPanel(); follow(); }
    else if (a === 'syncset') {
      var sec = Math.round($('audio').currentTime * 100) / 100, t = selTime();
      edit(function () { sheet.sync = (sheet.sync || []).filter(function (x) { return x[0] !== t; }).concat([[t, sec]]).sort(function (x, y) { return x[0] - y[0]; }); });
      toast('Set: this note is at ' + sec.toFixed(2) + ' s of the recording. Two or more places make it follow closely.');
    }
    else if (a === 'syncclear') { if (sheet.sync) edit(function () { delete sheet.sync; }); }
  }
  function toggles() {
    var on = function (id, v) { $(id).classList.toggle('on', !!v); };
    on('counts', prefs.counts); on('keysshow', prefs.keys); on('playMel', prefs.mel); on('playCh', prefs.acc); on('loop', prefs.loop); on('metro', prefs.metro);
    $('zoomv').textContent = Math.round(prefs.zoom * 100) + '%';
    document.body.classList.toggle('no-keys', !prefs.keys);
    document.documentElement.dataset.theme = prefs.theme || (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    $('speed').value = String(prefs.speed); $('tone').value = prefs.tone;
  }
  function noteIcon(d) {   // a small picture of a note length, for its button
    var base = d >= 16 ? 1 : d >= 8 ? 2 : d >= 4 ? 4 : d >= 2 ? 8 : 16, dot = d === 3 || d === 6 || d === 12, hollow = base <= 2;
    var s = '<svg viewBox="0 0 24 26" width="22" height="24" aria-hidden="true"><ellipse cx="9" cy="20" rx="4.6" ry="3.2" transform="rotate(-22 9 20)" ' +
      (hollow ? 'fill="none" stroke="currentColor" stroke-width="1.7"' : 'fill="currentColor"') + '/>';
    if (base > 1) s += '<path d="M13.2 19V3.5" stroke="currentColor" stroke-width="1.5" fill="none"/>';
    if (base >= 8) s += '<path d="M13.2 3.5c.6 3.6 5 4.2 4.6 8.6" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round"/>';
    if (base >= 16) s += '<path d="M13.2 8c.6 3.6 5 4.2 4.6 8.6" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round"/>';
    if (dot) s += '<circle cx="' + (base >= 8 ? 20.5 : 17.5) + '" cy="20" r="1.5" fill="currentColor"/>';
    return s + '</svg>';
  }

  // ---- wiring
  function init() {
    M.KEYS.forEach(function (k) { var o = document.createElement('option'); o.textContent = k; $('key').appendChild(o); });
    M.DUR_BUTTONS.forEach(function (d) {
      var b = document.createElement('button'); b.innerHTML = noteIcon(d[0]); b.title = d[1]; b.dataset.d = d[0]; b.onclick = function () { setDur(d[0]); b.blur(); }; $('durs').appendChild(b);
    });
    document.querySelectorAll('button[data-act]').forEach(function (b) { b.onclick = function () { act(b.dataset.act); b.blur(); }; });
    document.querySelectorAll('button[data-mode]').forEach(function (b) { b.onclick = function () { setMode(b.dataset.mode); b.blur(); }; });
    document.querySelectorAll('#lhScope button').forEach(function (b) { b.onclick = function () {
      var n = hand === 'n' && sheet && sheet.notes[sel], to = b.dataset.scope; b.blur();
      if (n && n.lh) {   // this note already starts a change: the buttons say how far it reaches
        if (to === 'song') toast('This note starts a pattern of its own. Take it out (✕ in the list below) to follow the song\'s pattern here.');
        else if ((n.lh['for'] === 'bar') !== (to === 'bar')) edit(function () { if (to === 'bar') n.lh['for'] = 'bar'; else delete n.lh['for']; });
        return;
      }
      scope = to; scopeFor = sel; lhPanel();
    }; });
    document.querySelectorAll('#rhAdd button').forEach(function (b) { b.onclick = function () { b.blur(); setRight(+b.dataset.add); }; });
    document.querySelectorAll('#rhOn button').forEach(function (b) { b.onclick = function () { b.blur(); setRight((sheet.rh && sheet.rh.add) || 1, b.dataset.on); }; });
    buildKeys(); toggles(); setMode('melody');
    $('music').addEventListener('click', function (e) {
      var g = e.target.closest ? e.target.closest('g.note, g.rest, g.chord') : null;
      if (!g || !sheet) return;
      var m = /^([nl])(\d+)(?:_\d+)?(?:k(\d+))?$/.exec(g.id); if (!m) return;
      if (m[1] === 'n') { if (hand !== 'n') { setHand('n'); anchor = +m[2]; } select(+m[2], {extend: e.shiftKey}); return; }
      if (!(lh && lh.written)) {   // the pattern's notes are not edited one by one: go to the melody note over it
        setHand('n'); select(indexAt(sheet.notes, timeOf(+m[2], lh.events)), {quiet: true});
        if (mode !== 'chords') setMode('chords');
        if (!toldPattern) { toldPattern = true; toast('The left hand follows the chords and its pattern. To change single notes, "Write it out as notes".'); }
        return;
      }
      if (mode !== 'chords') setMode('chords');
      var k = m[3] === undefined ? -1 : +m[3], same = hand === 'l' && sel === +m[2] && head === k && !e.shiftKey;
      if (hand !== 'l') { setHand('l'); anchor = +m[2]; }
      select(+m[2], {extend: e.shiftKey, keepHead: true}); head = same ? -1 : k; mark();
    });
    function headField(id, fn) { $(id).addEventListener('change', function () { edit(function () { fn($(id).value); }); }); }
    headField('title', function (v) { sheet.title = v; }); headField('key', function (v) { sheet.key = v; }); headField('mode', function (v) { sheet.mode = v; });
    headField('timeN', function (v) { sheet.time = [Math.max(1, +v || 4), sheet.time[1]]; }); headField('timeD', function (v) { sheet.time = [sheet.time[0], +v]; });
    headField('tempo', function (v) { sheet.tempo = clamp(+v || 90, 30, 240); }); headField('pickup', function (v) { sheet.pickup = Math.max(0, Math.round((+v || 0) * 2)); });
    $('message').addEventListener('change', function () { edit(function () { sheet.message = $('message').value; }); });
    $('chord').addEventListener('change', function () { setChordText($('chord').value); });
    $('chordClear').addEventListener('click', function () { setChordText(''); });
    (function buildChordUi() {
      function mk(parent, label, fn, cls) {
        var b = document.createElement('button'); b.type = 'button'; if (cls) b.className = cls;
        b.textContent = label; b.onclick = function () { fn(); b.blur(); }; parent.appendChild(b); return b;
      }
      function lbl(parent, text) { var s = document.createElement('span'); s.className = 'ce-lbl'; s.textContent = text; parent.appendChild(s); }
      var rRow = $('ceRoot'), qRow = $('ceQual'), bRow = $('ceBass');
      lbl(rRow, 'Root');
      var rootBtns = M.ROOTS.map(function (r) { return mk(rRow, r, function () { editChordPart(function (p) { p.root = r; p.acc = ''; }); }, 'note'); });
      var flat = mk(rRow, '♭', function () { editChordPart(function (p) { if (p.root) p.acc = p.acc === 'b' ? '' : 'b'; }); }, 'note');
      var sharp = mk(rRow, '♯', function () { editChordPart(function (p) { if (p.root) p.acc = p.acc === '#' ? '' : '#'; }); }, 'note');
      lbl(qRow, 'Type');
      var qualBtns = M.QUALITIES.map(function (qq) { return [qq[0], mk(qRow, qq[1], function () { editChordPart(function (p) { p.quality = qq[0]; }); })]; });
      lbl(bRow, 'Bass');
      var bassNone = mk(bRow, 'none', function () { editChordPart(function (p) { p.bass = ''; p.bassAcc = ''; }); });
      var bassBtns = M.ROOTS.map(function (r) { return mk(bRow, r, function () { editChordPart(function (p) { p.bass = r; p.bassAcc = ''; }); }, 'note'); });
      var bassFlat = mk(bRow, '♭', function () { editChordPart(function (p) { if (p.bass) p.bassAcc = p.bassAcc === 'b' ? '' : 'b'; }); }, 'note');
      var bassSharp = mk(bRow, '♯', function () { editChordPart(function (p) { if (p.bass) p.bassAcc = p.bassAcc === '#' ? '' : '#'; }); }, 'note');
      ceUi = {lastKey: '', keyBtns: [], rootBtns: rootBtns, flat: flat, sharp: sharp, qualBtns: qualBtns,
        bassNone: bassNone, bassBtns: bassBtns, bassFlat: bassFlat, bassSharp: bassSharp};
    })();
    $('comment').addEventListener('change', function () { var n = sheet.notes[sel], v = $('comment').value.trim(); if (hand === 'n' && n && (n.c || '') !== v) edit(function () { if (v) n.c = v; else delete n.c; }); });
    ['chord', 'comment', 'lhPat'].forEach(function (id) { $(id).addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === 'Escape') $(id).blur();
      else if (e.key === 'Tab' && id === 'chord' && mode === 'chords') { e.preventDefault(); $(id).blur(); goBar(e.shiftKey ? -1 : 1); }   // on to the next bar's chord
    }); });
    // the pattern as text, and how long its steps are
    function ownPattern() {
      var text = $('lhPat').value.trim(), cur = target() || inEffect() || {};
      if (!M.parsePattern(text).length) { toast('A pattern needs at least one note: 1, 3, 5, 7, 8, 10, 12, c or C.'); lhPanel(); return; }
      if (text === cur.pat && +$('lhRate').value === (cur.rate | 0)) return;
      var a = {pat: text, rate: +$('lhRate').value, low: cur.low == null ? 36 : cur.low};
      if (cur.pedal && a.rate) a.pedal = true; if (cur.end === false) a.end = false;
      setPattern(a);
    }
    $('lhPat').addEventListener('change', ownPattern); $('lhRate').addEventListener('change', ownPattern);
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
      if (j < sheet.notes.length) { select(j, {quiet: true}); var nx = $('verses').querySelector('input[data-verse="' + v + '"]'); nx.value = (sheet.notes[j].w && sheet.notes[j].w[v]) || ''; nx.focus(); nx.select(); }
    });
    $('speed').addEventListener('change', function () { prefs.speed = +$('speed').value || 1; keep(); if (S.playing()) { stopPlay(); play(); } });
    $('tone').addEventListener('change', function () { prefs.tone = $('tone').value; keep(); });
    $('recRate').addEventListener('change', function () { $('audio').playbackRate = +$('recRate').value || 1; });
    $('audio').addEventListener('play', function () { stopPlay(); follow(); });
    document.addEventListener('change', function (e) { if (e.target.tagName === 'SELECT') e.target.blur(); });   // the keys go to the sheet again
    // menus
    document.querySelectorAll('button[data-menu]').forEach(function (b) {
      b.addEventListener('click', function (e) {
        e.stopPropagation(); var m = b.parentNode, open = m.classList.contains('open');
        document.querySelectorAll('.menu.open').forEach(function (x) { x.classList.remove('open'); });
        if (!open) { m.classList.add('open'); if (b.dataset.menu === 'versions') versions(); }
      });
    });
    document.addEventListener('click', function () { document.querySelectorAll('.menu.open').forEach(function (x) { x.classList.remove('open'); }); });
    $('help').addEventListener('click', function (e) { if (e.target === $('help')) $('help').hidden = true; });

    document.addEventListener('keydown', function (e) {
      var t = e.target.tagName, k = e.key, ctrl = e.ctrlKey || e.metaKey, done = true;
      if (k === 'Escape') { if (!$('help').hidden) $('help').hidden = true; else if (t !== 'INPUT' && t !== 'TEXTAREA' && sheet) { anchor = sel; head = -1; mark(); } return; }
      if (t === 'INPUT' || t === 'TEXTAREA' || t === 'SELECT' || !sheet) return;
      var chordKeys = mode === 'chords' && hand === 'n';   // the keys mean chords, not notes
      if (ctrl && k.toLowerCase() === 'z') act(e.shiftKey ? 'redo' : 'undo');
      else if (ctrl && k.toLowerCase() === 'y') act('redo');
      else if (ctrl && k.toLowerCase() === 'c') copyNotes(false);
      else if (ctrl && k.toLowerCase() === 'x') copyNotes(true);
      else if (ctrl && k.toLowerCase() === 'v') paste();
      else if (ctrl && k.toLowerCase() === 'a') { anchor = 0; sel = list().length - 1; mark(); }
      else if (k === 'F1') setMode('melody'); else if (k === 'F2') setMode('chords');
      else if (k === '?') act('help');
      else if (k === 'ArrowLeft') select(sel - 1, {extend: e.shiftKey}); else if (k === 'ArrowRight') select(sel + 1, {extend: e.shiftKey});
      else if (k === 'Home') select(0, {extend: e.shiftKey}); else if (k === 'End') select(list().length - 1, {extend: e.shiftKey});
      else if (k === 'Tab') goBar(e.shiftKey ? -1 : 1);
      else if (k === ' ') act('play');
      else if (ctrl || e.altKey) { if (!chordKeys && k === 'ArrowUp') step(1, 'oct'); else if (!chordKeys && k === 'ArrowDown') step(-1, 'oct'); else done = false; }
      else if (k === 'l' || k === 'L') act('loop'); else if (k === 'm' || k === 'M') act('metro'); else if (k === 'p' || k === 'P') act('recfrom');
      else if (chordKeys) {
        if (k === 'ArrowUp') goChord(-1); else if (k === 'ArrowDown') goChord(1);
        else if (/^[a-gA-G]$/.test(k)) { $('chord').value = k.toUpperCase(); $('chord').focus(); }
        else if (/^[1-8]$/.test(k)) { var kc = keyList(); if (kc[+k - 1]) setChordText(kc[+k - 1]); }
        else if (k === 'Enter' || k === 'h' || k === 'H') { $('chord').focus(); $('chord').select(); }
        else if (k === 'Delete' || k === 'Backspace') setChordText('');
        else done = false;
      }
      else if (k === 'ArrowUp') step(1, e.shiftKey ? 'semi' : ''); else if (k === 'ArrowDown') step(-1, e.shiftKey ? 'semi' : '');
      else if (k >= '3' && k <= '7') setDur({3: 1, 4: 2, 5: 4, 6: 8, 7: 16}[k]);
      else if (k === '.') { var ns = chosen(), map = {2: 3, 3: 2, 4: 6, 6: 4, 8: 12, 12: 8}; if (ns.some(function (x) { return map[x.d]; })) edit(function () { ns.forEach(function (x) { if (map[x.d]) x.d = map[x.d]; }); }); }
      else if (/^[a-gA-G]$/.test(k)) letter(k, hand === 'l' && e.shiftKey);
      else if (k === 'r' || k === 'R') act('rest'); else if (k === 'n' || k === 'N' || k === 'Insert') act('after');
      else if (k === 't' || k === 'T') act('tie');
      else if (k === 's' || k === 'S') act('split'); else if (k === 'Delete' || k === 'Backspace') act('del');
      else if (k === 'Enter' && hand === 'n') { var inp = $('verses').querySelector('input:not(:disabled)'); if (inp) { inp.focus(); inp.select(); } }
      else if ((k === 'h' || k === 'H') && hand === 'n') { $('chord').focus(); $('chord').select(); }
      else done = false;
      if (done) e.preventDefault();
    });
    var rt; window.addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(render, 200); });
    window.addEventListener('beforeunload', function (e) { if (dirty || saving) { save(); e.preventDefault(); e.returnValue = ''; } });
    $('song').addEventListener('change', function () { open($('song').value); });
    fetch('/api/list').then(function (r) { return r.json(); }).then(function (songs) {
      songs.forEach(function (s) { var o = document.createElement('option'); o.value = s.song; o.textContent = s.title + ' (' + s.song + ')'; $('song').appendChild(o); });
      var want = new URLSearchParams(location.search).get('song');
      if (!songs.length) { status('No leadsheet.json found: make one with from_musicxml.py', 'warn'); return; }
      open(songs.some(function (s) { return s.song === want; }) ? want : songs[0].song);
    });
    setInterval(poll, 1500);
  }
  // the versions kept before each save: any of them can be brought back (and Undo returns to the present one)
  function versions() {
    var box = $('versions'); box.innerHTML = '<div class="empty">Looking…</div>';
    fetch('/api/history' + q()).then(function (r) { return r.json(); }).then(function (names) {
      box.innerHTML = names.length ? '' : '<div class="empty">No earlier versions yet: one is kept at every save.</div>';
      names.slice(0, 60).forEach(function (v) {
        var m = /^(\d{4})(\d\d)(\d\d)-(\d\d)(\d\d)(\d\d)$/.exec(v), b = document.createElement('button');
        var when = m ? new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]) : null;
        b.innerHTML = when ? when.toLocaleDateString([], {month: 'short', day: 'numeric'}) + ', ' + when.toLocaleTimeString([], {hour: '2-digit', minute: '2-digit', second: '2-digit'}) + '<small>bring this version back</small>' : M.esc(v);
        b.onclick = function () {
          fetch('/api/history' + q() + '&v=' + encodeURIComponent(v)).then(function (r) { return r.json(); }).then(function (j) {
            if (!j.sheet) { toast('That version could not be read.'); return; }
            edit(function () { sheet = tidy(j.sheet); setHand('n'); sel = anchor = 0; }); fields();
            toast('That version is back. Undo (Ctrl Z) returns to the one before.');
          });
        };
        box.appendChild(b);
      });
    }).catch(function () { box.innerHTML = '<div class="empty">The server does not answer.</div>'; });
  }
  function open(name) {
    if (dirty) save();
    stopPlay(); $('audio').pause(); song = name; $('song').value = name; history.replaceState(null, '', '?song=' + encodeURIComponent(name)); sheet = null; load(false);
  }
  // for the console and for tests
  window.leadSheet = {mei: function () { return leadMei; }, piano: function () { return pianoMei; }, sheet: function () { return sheet; },
    select: select, act: act, mode: setMode, state: function () { return {sel: sel, anchor: anchor, hand: hand, head: head, mode: mode, scope: scope}; }};
  // Verovio's runtime may be ready before or after this script runs (it is cached after the first visit): try until it is
  (function boot() {
    try { tk = new verovio.toolkit(); } catch (e) { tk = null; setTimeout(boot, 100); return; }
    render();
  })();
  init();
})();
