// The chord editor: a panel at the bottom of the screen, opened by "Edit chords" on the piano sheet.
// Pick a bar (tap it on the sheet), a beat in the strip, then build the chord from buttons or type it.
// Every change goes through SheetView.setBar(), which redraws the sheet and saves to the server.

import {splitChord} from './sheet.js';

const ROOTS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const QUALITIES = [['', 'major'], ['m', 'm'], ['7', '7'], ['maj7', 'maj7'], ['m7', 'm7'], ['6', '6'], ['9', '9'], ['add9', 'add9'],
  ['sus4', 'sus4'], ['sus2', 'sus2'], ['7sus4', '7sus4'], ['dim', 'dim'], ['dim7', 'dim7'], ['m7♭5', 'm7♭5'], ['aug', 'aug']];
const STATUS = {
  idle: '', pending: 'Saving…', saving: 'Saving…', saved: 'Saved ✓', error: 'Not saved, trying again…',
  offline: 'Server not reachable: edits cannot be saved', conflict: 'Changed on another device',
};

function el(tag, cls, text, attrs) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  if (attrs) for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  return e;
}

export function beatLabel(t) {
  const whole = Math.floor(t + 1e-6), frac = t - whole;
  if (frac < 1e-3) return String(whole);
  if (Math.abs(frac - 0.5) < 1e-3) return (whole || '') + '½';
  return String(Math.round(t * 100) / 100);
}

// what the user types -> what is stored: ♭ ♯ for b #, a capital root
export function cleanChord(text) {
  let t = text.trim().replace(/\s+/g, '');
  if (!t) return '';
  t = t[0].toUpperCase() + t.slice(1);
  t = t.replace(/^([A-G])b/, '$1♭').replace(/^([A-G])#/, '$1♯').replace(/\/([A-Ga-g])b/, (m, n) => '/' + n.toUpperCase() + '♭')
    .replace(/\/([A-Ga-g])#/, (m, n) => '/' + n.toUpperCase() + '♯').replace(/\/([a-g])/, (m, n) => '/' + n.toUpperCase())
    .replace(/(\d)b(\d)/g, '$1♭$2').replace(/(\d)#(\d)/g, '$1♯$2').replace(/([a-z])b5/, '$1♭5');
  return t.slice(0, 24);
}

function compose(p) {
  return p.root ? p.root + p.acc + p.quality + (p.bass ? '/' + p.bass + p.bassAcc : '') : '';
}

export function createEditor(view, {onclose}) {
  const root = el('section', 'chord-editor', null, {'aria-label': 'Chord editor'});
  let bar = null, beat = 1;

  const status = el('span', 'ce-status');
  const bNew = el('button', 'ce-btn link', 'Use the other version', {type: 'button'});
  bNew.hidden = true;
  const bUndo = el('button', 'ce-btn', 'Undo', {type: 'button'});
  const bRevert = el('button', 'ce-btn', 'Original bar', {type: 'button', title: 'Put the original chords back in this bar'});
  const bDone = el('button', 'ce-btn primary', 'Done', {type: 'button'});
  const prev = el('button', 'ce-btn icon', '‹', {type: 'button', 'aria-label': 'Previous bar'});
  const next = el('button', 'ce-btn icon', '›', {type: 'button', 'aria-label': 'Next bar'});
  const title = el('strong', 'ce-title');
  const stale = el('div', 'ce-stale');
  stale.hidden = true;
  const top = el('div', 'ce-top');
  top.append(prev, title, next, el('span', 'grow'), status, bNew, bUndo, bRevert, bDone);

  const strip = el('div', 'ce-beats', null, {role: 'group', 'aria-label': 'Beats'});
  const build = el('div', 'ce-build');
  const rootRow = el('div', 'ce-row');
  const qualRow = el('div', 'ce-row scroll');
  const bassRow = el('div', 'ce-row');
  const textRow = el('div', 'ce-row ce-text');
  const input = el('input', 'ce-input', null, {type: 'text', autocomplete: 'off', autocapitalize: 'characters', spellcheck: 'false',
    placeholder: 'Chord', 'aria-label': 'Chord', enterkeyhint: 'done'});
  const bClear = el('button', 'ce-btn', 'Remove chord', {type: 'button'});
  textRow.append(input, bClear);
  build.append(rootRow, qualRow, bassRow);
  root.append(top, stale, strip, build);

  const btn = (label, onclick, cls = '') => {
    const b = el('button', 'ce-btn ' + cls, label, {type: 'button'});
    b.addEventListener('click', onclick);
    return b;
  };
  const rootBtns = ROOTS.map((r) => btn(r, () => edit((p) => { p.root = r; p.acc = ''; }), 'note'));
  const flat = btn('♭', () => edit((p) => { if (p.root) p.acc = p.acc === '♭' ? '' : '♭'; }), 'note');
  const sharp = btn('♯', () => edit((p) => { if (p.root) p.acc = p.acc === '♯' ? '' : '♯'; }), 'note');
  rootRow.append(el('span', 'ce-label', 'Chord'), ...rootBtns, flat, sharp, textRow);
  const qualBtns = QUALITIES.map(([q, label]) => [q, btn(label, () => edit((p) => { p.quality = q; }))]);
  qualRow.append(...qualBtns.map((x) => x[1]));
  const bassNone = btn('none', () => edit((p) => { p.bass = ''; p.bassAcc = ''; }));
  const bassBtns = ROOTS.map((r) => btn(r, () => edit((p) => { p.bass = r; p.bassAcc = ''; }), 'note'));
  const bassFlat = btn('♭', () => edit((p) => { if (p.bass) p.bassAcc = p.bassAcc === '♭' ? '' : '♭'; }), 'note');
  const bassSharp = btn('♯', () => edit((p) => { if (p.bass) p.bassAcc = p.bassAcc === '♯' ? '' : '♯'; }), 'note');
  bassRow.append(el('span', 'ce-label', 'Bass'), bassNone, ...bassBtns, bassFlat, bassSharp);

  function chordAt(t) {
    const c = view.chordsOf(bar).find(([x]) => Math.abs(x - t) < 1e-3);
    return c ? c[1] : '';
  }

  function setChord(t, text) {
    const list = view.chordsOf(bar).filter(([x]) => Math.abs(x - t) >= 1e-3);
    if (text) list.push([t, text]);
    view.setBar(bar, list);
  }

  function edit(fn) {
    if (bar == null) return;
    const p = splitChord(chordAt(beat)) || {root: '', acc: '', quality: '', bass: '', bassAcc: ''};
    fn(p);
    setChord(beat, compose(p));
  }

  input.addEventListener('change', () => { if (bar != null) setChord(beat, cleanChord(input.value)); });
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') input.blur(); });
  bClear.addEventListener('click', () => setChord(beat, ''));
  bUndo.addEventListener('click', () => view.undo());
  bRevert.addEventListener('click', () => {
    const b = view.bars[bar - 1];
    if (b) view.setBar(bar, b.chords.map(([t, c]) => [t, view.toShown(c)]));
  });
  bDone.addEventListener('click', () => onclose());
  bNew.addEventListener('click', () => view.useServerVersion());
  prev.addEventListener('click', () => go(bar - 1));
  next.addEventListener('click', () => go(bar + 1));

  function go(n, at) {
    const info = view.barInfo(n);
    if (!info) return;
    bar = n;
    const chords = view.chordsOf(n);
    beat = at != null ? at : (chords.length ? chords[0][0] : 1);
    view.select(n);
    refresh();
  }

  function refresh() {
    const open = bar != null;
    root.classList.toggle('no-bar', !open);
    const info = open && view.barInfo(bar);
    title.textContent = open ? 'Bar ' + bar + (info && info.edited ? ' ✎' : '') : 'Tap a bar on the sheet';
    prev.disabled = !open || bar <= 1;
    next.disabled = !open || !info || bar >= info.count;
    bUndo.disabled = !view.history.length;
    bRevert.disabled = !open || !info || !info.edited;
    const st = view.save.status;
    status.textContent = STATUS[st] || '';
    status.className = 'ce-status ' + st;
    bNew.hidden = st !== 'conflict';
    const bad = view.stale;
    stale.hidden = !bad.length;
    stale.textContent = bad.length ? 'The sheet has changed since you edited bar' + (bad.length > 1 ? 's ' : ' ') + bad.join(', ')
      + '. Check ' + (bad.length > 1 ? 'those bars' : 'that bar') + '.' : '';

    strip.textContent = '';
    if (!open || !info) { build.hidden = true; strip.hidden = true; return; }
    build.hidden = false; strip.hidden = false;
    const chords = view.chordsOf(bar);
    info.beats.forEach((t) => {
      const here = chords.find(([x]) => Math.abs(x - t) < 1e-3);
      const b = el('button', 'ce-beat' + (Math.abs(t - beat) < 1e-3 ? ' on' : '') + (here ? ' has' : '') + (info.notes.some((n) => Math.abs(n - t) < 1e-3) ? ' note' : ''), null, {type: 'button'});
      b.append(el('span', 'bt', beatLabel(t)), el('span', 'bc', here ? here[1] : ''));
      b.addEventListener('click', () => { beat = t; refresh(); });
      strip.appendChild(b);
    });
    const cur = chordAt(beat);
    const p = splitChord(cur) || {root: '', acc: '', quality: '', bass: '', bassAcc: ''};
    ROOTS.forEach((r, i) => { rootBtns[i].setAttribute('aria-pressed', String(p.root === r)); bassBtns[i].setAttribute('aria-pressed', String(p.bass === r)); });
    flat.setAttribute('aria-pressed', String(p.acc === '♭')); sharp.setAttribute('aria-pressed', String(p.acc === '♯'));
    bassFlat.setAttribute('aria-pressed', String(p.bassAcc === '♭')); bassSharp.setAttribute('aria-pressed', String(p.bassAcc === '♯'));
    bassNone.setAttribute('aria-pressed', String(!!p.root && !p.bass));
    qualBtns.forEach(([q, b]) => { b.setAttribute('aria-pressed', String(!!p.root && p.quality === q)); b.disabled = !p.root; });
    flat.disabled = sharp.disabled = !p.root;
    bassBtns.forEach((b) => { b.disabled = !p.root; });
    bassNone.disabled = !p.root;
    bassFlat.disabled = bassSharp.disabled = !p.bass;
    bClear.disabled = !cur;
    if (document.activeElement !== input) input.value = cur;
    input.placeholder = 'Type a chord for beat ' + beatLabel(beat);
  }

  view.onpick = ({bar: n, beat: t}) => go(n, t);
  document.body.appendChild(root);
  root.hidden = true;

  const setHeight = () => {
    const h = root.hidden ? 0 : root.offsetHeight;
    view.panelHeight = h;
    document.body.style.setProperty('--editor-h', h + 'px');
  };
  const ro = new ResizeObserver(setHeight);
  ro.observe(root);

  return {
    el: root,
    open() {
      root.hidden = false;
      document.body.classList.add('editing-chords');
      bar = view.selected;
      if (bar == null) {
        // start at the first bar that has a chord that was changed, else the first bar
        const first = Object.keys(view.edits.bars).map(Number).sort((a, b) => a - b)[0];
        bar = null;
        if (first) go(first); else refresh();
      } else go(bar);
      setHeight();
    },
    close() {
      root.hidden = true;
      document.body.classList.remove('editing-chords');
      document.body.style.removeProperty('--editor-h');
      bar = null;
    },
    refresh() { if (!root.hidden) refresh(); },
    destroy() { ro.disconnect(); root.remove(); document.body.classList.remove('editing-chords'); document.body.style.removeProperty('--editor-h'); },
  };
}
