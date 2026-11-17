// How the two hands play when "Both hands" is on (piano.js): a sheet at the bottom of the screen, in the chord editor's
// clothes. It opens when Both hands is turned on; Done tucks it down to a slim bar that names the style (a tap or a drag
// up opens it again); it is gone while Both hands is off. A choice is the device's for every hymn, or with "Only this
// hymn" this hymn's own.

import {styles, pattern, DEFAULT} from './piano.js';
import {tr} from './i18n.js';

const ADD = [[0, 'Melody alone'], [1, 'Two notes'], [2, 'Three notes']];
const ON = [['chord', 'Where a chord starts'], ['beat', 'On the beat'], ['long', 'Long notes'], ['all', 'Every note']];

function el(tag, cls, text, attrs) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  if (attrs) for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  return e;
}

// get() -> {choice, only}; set(choice, only); time() -> the sheet's time signature, [4, 4]
export function createPianoPanel({get, set, time}) {
  const root = el('section', 'chord-editor piano-panel', null, {'aria-label': tr('How the two hands play')});
  // the bar it tucks down to: a handle, what plays now, and a chevron; a tap or a drag up opens the panel
  const peek = el('button', 'pp-peek', null, {type: 'button', 'aria-expanded': 'false', title: tr('How the two hands play')});
  const summary = el('span', 'pp-summary');
  peek.append(el('span', 'pp-handle', null, {'aria-hidden': 'true'}), el('strong', 'pp-title', tr('Both hands')), summary,
    el('span', 'pp-chev', '⌃', {'aria-hidden': 'true'}));
  const grip = el('div', 'pp-handle pp-grip', null, {'aria-hidden': 'true'});
  const bOnly = el('button', 'ce-btn', tr('Only this hymn'), {type: 'button', title: tr('Keep this choice for this hymn alone')});
  const bDone = el('button', 'ce-btn primary', tr('Done'), {type: 'button'});
  const top = el('div', 'ce-top');
  top.append(el('strong', 'ce-title', tr('Both hands')), el('span', 'grow'), bOnly, bDone);
  const famRow = el('div', 'ce-row'), kindRow = el('div', 'ce-row'), rhythmRow = el('div', 'ce-row'), octRow = el('div', 'ce-row');
  const addRow = el('div', 'ce-row'), onRow = el('div', 'ce-row');
  const body = el('div', 'pp-body');
  body.append(grip, top, famRow, kindRow, rhythmRow, octRow, addRow, onRow);
  root.append(peek, body);

  const btn = (label, pressed, onclick, cls = '') => {
    const b = el('button', 'ce-btn ' + cls, label, {type: 'button', 'aria-pressed': String(!!pressed)});
    b.addEventListener('click', onclick);
    return b;
  };
  const change = (fn, only) => {
    const cur = get(), choice = JSON.parse(JSON.stringify(cur.choice || DEFAULT));
    choice.rh = choice.rh || {add: 0, on: 'beat'};
    if (fn) fn(choice);
    set(choice, only === undefined ? cur.only : only);
    refresh();
  };

  function refresh() {
    const {choice, only} = get(), lh = choice.lh || null, rh = choice.rh || {add: 0, on: 'beat'};
    const all = styles(time()), cur = pattern(lh, time());
    bOnly.setAttribute('aria-pressed', String(only));
    for (const r of [famRow, kindRow, rhythmRow, octRow, addRow, onRow]) r.textContent = '';
    const said = [];
    famRow.append(el('span', 'ce-label', tr('Left hand')),
      btn(tr('No left hand'), !cur, () => change((c) => { c.lh = null; })),
      ...all.map((f) => btn(tr(f.name), cur && cur.family === f.id, () => change((c) => {
        c.lh = {family: f.id, kind: f.kinds[0].id, rhythm: '', oct: (c.lh && c.lh.oct) || 0, pedal: !!(c.lh && c.lh.pedal)};
      }))));
    kindRow.hidden = octRow.hidden = !cur;
    rhythmRow.hidden = true;
    if (cur) {
      const fam = all.find((f) => f.id === cur.family), kind = fam.kinds.find((k) => k.id === cur.kind);
      said.push(tr(fam.name), tr(kind.name));
      kindRow.append(el('span', 'ce-label', tr('Pattern')), ...fam.kinds.map((k) => btn(tr(k.name), k.id === cur.kind, () => change((c) => { c.lh.kind = k.id; }))));
      if (kind.rhythms.length > 1) {
        rhythmRow.hidden = false;
        rhythmRow.append(el('span', 'ce-label', tr('Rhythm')), ...kind.rhythms.map((r) => btn(tr(r.name), r.id === cur.rhythm, () => change((c) => { c.lh.rhythm = r.id; }))));
        const r = kind.rhythms.find((x) => x.id === cur.rhythm);
        if (r && r.name) said.push(tr(r.name));
      }
      const oct = lh.oct || 0;
      const lower = btn(tr('Lower'), oct < 0, () => change((c) => { c.lh.oct = Math.max(-1, (c.lh.oct || 0) - 1); }));
      const higher = btn(tr('Higher'), oct > 0, () => change((c) => { c.lh.oct = Math.min(1, (c.lh.oct || 0) + 1); }));
      lower.disabled = oct <= -1; higher.disabled = oct >= 1;
      const pedal = btn(tr('Pedal'), cur.pedal, () => change((c) => { c.lh.pedal = !c.lh.pedal; }));
      pedal.disabled = !cur.rate;
      octRow.append(el('span', 'ce-label', tr('Octave')), lower, higher, el('span', 'ce-gap'), pedal);
      if (oct) said.push(tr(oct < 0 ? 'Lower' : 'Higher'));
      if (cur.pedal && cur.rate) said.push(tr('Pedal'));
    } else said.push(tr('No left hand'));
    addRow.append(el('span', 'ce-label', tr('Right hand')), ...ADD.map(([n, label]) => btn(tr(label), rh.add === n, () => change((c) => { c.rh.add = n; }))));
    onRow.hidden = !rh.add;
    if (rh.add) {
      said.push(tr(ADD[rh.add][1]));
      onRow.append(el('span', 'ce-label', tr('When')), ...ON.map(([id, label]) => btn(tr(label), rh.on === id, () => change((c) => { c.rh.on = id; }))));
    }
    summary.textContent = said.join(' · ');
    setHeight();
  }

  // 'hidden' (Both hands off, or nothing to style), 'peek' (the slim bar) or 'open'
  let mode = 'hidden';
  function show(m) {
    if (m === mode) return;
    mode = m;
    root.hidden = m === 'hidden';
    root.classList.toggle('peek', m === 'peek');
    peek.setAttribute('aria-expanded', String(m === 'open'));
    document.body.classList.toggle('piano-open', m === 'open');
    document.body.classList.toggle('piano-peek', m === 'peek');
    if (m === 'hidden') document.body.style.removeProperty('--editor-h');
    else { refresh(); setHeight(); }
    if (m === 'open') bDone.focus({preventScroll: true});
  }

  // drag the bar up to open, or the open panel's handle down to tuck it away; a tap on the bar opens it too
  let drag = null;
  const onDown = (e) => { drag = {y: e.clientY, moved: false}; };
  const onMove = (e) => {
    if (!drag) return;
    const dy = e.clientY - drag.y;
    if (mode === 'peek' && dy < -24) { drag = null; show('open'); }
    else if (mode === 'open' && dy > 40) { drag = null; show('peek'); }
  };
  const onUp = () => { drag = null; };
  for (const h of [peek, grip, top]) h.addEventListener('pointerdown', onDown);
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  peek.addEventListener('click', () => show('open'));
  grip.addEventListener('click', () => show('peek'));
  bOnly.addEventListener('click', () => change(null, !get().only));
  bDone.addEventListener('click', () => show('peek'));

  document.body.appendChild(root);
  root.hidden = true;
  const setHeight = () => { if (!root.hidden) document.body.style.setProperty('--editor-h', root.offsetHeight + 'px'); };
  const ro = new ResizeObserver(setHeight);
  ro.observe(root);

  return {
    el: root,
    get mode() { return mode; },
    get isOpen() { return mode === 'open'; },
    show,
    open() { show('open'); },
    refresh() { if (mode !== 'hidden') refresh(); },
    destroy() {
      ro.disconnect(); window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp);
      show('hidden'); root.remove();
    },
  };
}
