// "Style": the panel that chooses how the two hands play when "Both hands" is on (piano.js). It looks and sits like
// the chord editor's panel. A choice is the device's for every hymn, or with "Only this hymn" this hymn's own.

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
export function createPianoPanel({get, set, time, onclose}) {
  const root = el('section', 'chord-editor piano-panel', null, {'aria-label': tr('How the two hands play')});
  const bOnly = el('button', 'ce-btn', tr('Only this hymn'), {type: 'button', title: tr('Keep this choice for this hymn alone')});
  const bDone = el('button', 'ce-btn primary', tr('Done'), {type: 'button'});
  const top = el('div', 'ce-top');
  top.append(el('strong', 'ce-title', tr('Both hands')), el('span', 'grow'), bOnly, bDone);
  const famRow = el('div', 'ce-row'), kindRow = el('div', 'ce-row'), optRow = el('div', 'ce-row');
  const addRow = el('div', 'ce-row'), onRow = el('div', 'ce-row');
  root.append(top, famRow, kindRow, optRow, addRow, onRow);

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
    famRow.textContent = ''; kindRow.textContent = ''; optRow.textContent = ''; addRow.textContent = ''; onRow.textContent = '';
    famRow.append(el('span', 'ce-label', tr('Left hand')),
      btn(tr('No left hand'), !cur, () => change((c) => { c.lh = null; })),
      ...all.map((f) => btn(tr(f.name), cur && cur.family === f.id, () => change((c) => {
        c.lh = {family: f.id, kind: f.kinds[0].id, rhythm: '', oct: (c.lh && c.lh.oct) || 0, pedal: !!(c.lh && c.lh.pedal)};
      }))));
    kindRow.hidden = optRow.hidden = !cur;
    if (cur) {
      const fam = all.find((f) => f.id === cur.family), kind = fam.kinds.find((k) => k.id === cur.kind);
      kindRow.append(el('span', 'ce-label'), ...fam.kinds.map((k) => btn(tr(k.name), k.id === cur.kind, () => change((c) => { c.lh.kind = k.id; }))));
      optRow.append(el('span', 'ce-label'));
      if (kind.rhythms.length > 1) optRow.append(...kind.rhythms.map((r) => btn(tr(r.name), r.id === cur.rhythm, () => change((c) => { c.lh.rhythm = r.id; }))), el('span', 'ce-gap'));
      const oct = lh.oct || 0;
      const lower = btn(tr('Lower'), false, () => change((c) => { c.lh.oct = Math.max(-1, (c.lh.oct || 0) - 1); }));
      const higher = btn(tr('Higher'), false, () => change((c) => { c.lh.oct = Math.min(1, (c.lh.oct || 0) + 1); }));
      lower.disabled = oct <= -1; higher.disabled = oct >= 1;
      const pedal = btn(tr('Pedal'), cur.pedal, () => change((c) => { c.lh.pedal = !c.lh.pedal; }));
      pedal.disabled = !cur.rate;
      optRow.append(lower, higher, pedal);
    }
    addRow.append(el('span', 'ce-label', tr('Right hand')), ...ADD.map(([n, label]) => btn(tr(label), rh.add === n, () => change((c) => { c.rh.add = n; }))));
    onRow.hidden = !rh.add;
    if (rh.add) onRow.append(el('span', 'ce-label'), ...ON.map(([id, label]) => btn(tr(label), rh.on === id, () => change((c) => { c.rh.on = id; }))));
    setHeight();
  }

  bOnly.addEventListener('click', () => change(null, !get().only));
  bDone.addEventListener('click', () => onclose());
  document.body.appendChild(root);
  root.hidden = true;
  const setHeight = () => { if (!root.hidden) document.body.style.setProperty('--editor-h', root.offsetHeight + 'px'); };
  const ro = new ResizeObserver(setHeight);
  ro.observe(root);
  const shut = () => { root.hidden = true; document.body.classList.remove('piano-open'); document.body.style.removeProperty('--editor-h'); };

  return {
    el: root,
    get isOpen() { return !root.hidden; },
    open() { root.hidden = false; document.body.classList.add('piano-open'); refresh(); },
    close: shut,
    refresh() { if (!root.hidden) refresh(); },
    destroy() { ro.disconnect(); shut(); root.remove(); },
  };
}
