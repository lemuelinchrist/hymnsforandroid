// How the two hands play (piano.js), the "Style" panel: a sheet at the bottom of the screen, in the chord editor's
// clothes. It opens when Both hands is turned on, and is there (as the slim bar) while the sheet plays; Done tucks it down to a slim bar that names the style (a tap or a drag
// up opens it again); it is gone when neither Both hands nor playing needs it. It shows the presets (piano.js PRESETS) and the right hand,
// Melody alone or Two notes; Advanced shows every choice instead (kept on the device). A change is this hymn's own;
// "Use for all hymns" makes the choice the device's, which every hymn without its own plays.
// The guitar sheet's Strumming has a panel of the same kind (createStrumPanel): only the strum and the tone.

import {styles, pattern, DEFAULT, PRESETS, presetChoice, presetOf, TONES, STRUM_DEFAULT} from './piano.js';
import {tr} from './i18n.js';
import {store} from './ui.js';

const ADD = [[0, 'Melody alone'], [1, 'Two notes'], [2, 'Three notes']];
const ON = [['chord', 'Where a chord starts'], ['beat', 'On the beat'], ['long', 'Long notes'], ['all', 'Every note']];

function el(tag, cls, text, attrs) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  if (attrs) for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  return e;
}

// an on/off choice: a switch, its label beside it
function toggle(label, on, onclick, title) {
  const b = el('button', 'pp-switch', null, {type: 'button', role: 'switch', 'aria-checked': String(!!on)});
  if (title) b.title = title;
  b.append(el('span', 'pp-track', null, {'aria-hidden': 'true'}), el('span', 'pp-switch-label', label));
  b.firstChild.append(el('span', 'pp-knob'));
  if (onclick) b.addEventListener('click', onclick);
  return b;
}
function btn(label, pressed, onclick, cls = '') {
  const b = el('button', 'ce-btn ' + cls, label, {type: 'button', 'aria-pressed': String(!!pressed)});
  b.addEventListener('click', onclick);
  return b;
}
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
// a choice without its take (Shuffle): the take belongs to the hymn, "Use for all hymns" does not carry it
export const withoutTake = (choice) => { const c = JSON.parse(JSON.stringify(choice)); if (c.lh) delete c.lh.seed; return c; };

// The sheet at the bottom both panels are: open, tucked down to a slim bar that names what plays (a tap or a drag up
// opens it), or hidden. title: its name; label: what it is for (read out, and the bar's tooltip); extra: buttons
// before "Use for all hymns" and Done; rows: its rows of choices; refresh(): fills them and returns the bar's summary.
function sheetPanel({cls, title, label, extra = [], rows, refresh, onAll}) {
  const root = el('section', 'chord-editor pp-panel ' + cls, null, {'aria-label': label});
  // the bar it tucks down to: a handle, what plays now, and a chevron; a tap or a drag up opens the panel
  const peek = el('button', 'pp-peek', null, {type: 'button', 'aria-expanded': 'false', title: label});
  const summary = el('span', 'pp-summary');
  peek.append(el('span', 'pp-handle', null, {'aria-hidden': 'true'}), el('strong', 'pp-title', title), summary,
    el('span', 'pp-chev', '⌃', {'aria-hidden': 'true'}));
  const grip = el('div', 'pp-handle pp-grip', null, {'aria-hidden': 'true'});
  const bAll = el('button', 'ce-btn', tr('Use for all hymns'), {type: 'button', title: tr('Play every hymn this way, unless it has its own')});
  const bDone = el('button', 'ce-btn primary', tr('Done'), {type: 'button'});
  const top = el('div', 'ce-top');
  top.append(el('strong', 'ce-title', title), el('span', 'grow'), ...extra, bAll, bDone);
  const body = el('div', 'pp-body');
  body.append(grip, top, ...rows);
  root.append(peek, body);

  const fill = () => { summary.textContent = refresh(bAll); setHeight(); };
  // 'hidden' (off, or nothing to play it on), 'peek' (the slim bar) or 'open'
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
    else fill();
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
  bAll.addEventListener('click', () => { onAll(); fill(); });
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
    fill,
    refresh() { if (mode !== 'hidden') fill(); },
    destroy() {
      ro.disconnect(); window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp);
      show('hidden'); root.remove();
    },
  };
}

// get() -> {choice, usual: the device's choice}; set(choice): this hymn's; setUsual(choice): for every hymn;
// time() -> the sheet's time signature, [4, 4]
export function createPianoPanel({get, set, setUsual, time}) {
  const bAdv = toggle(tr('Advanced'), false, null, tr('All the choices'));
  const presetRow = el('div', 'ce-row'), walkRow = el('div', 'ce-row'), strumRow = el('div', 'ce-row'), shuffleRow = el('div', 'ce-row');
  const famRow = el('div', 'ce-row'), kindRow = el('div', 'ce-row'), rhythmRow = el('div', 'ce-row'), octRow = el('div', 'ce-row');
  const toneRow = el('div', 'ce-row'), addRow = el('div', 'ce-row'), onRow = el('div', 'ce-row');
  let advanced = !!store.get('pianoAdvanced', false);
  const panel = sheetPanel({cls: 'piano-panel', title: tr('Style'), label: tr('How the two hands play'), extra: [bAdv],
    rows: [presetRow, strumRow, famRow, kindRow, rhythmRow, octRow, toneRow, walkRow, shuffleRow, addRow, onRow],
    refresh: (bAll) => refresh(bAll), onAll: () => setUsual(get().choice)});
  const change = (fn) => {
    const choice = JSON.parse(JSON.stringify(get().choice || DEFAULT));
    choice.rh = choice.rh || {add: 0, on: 'chord'};
    if (fn) fn(choice);
    set(choice);
    panel.fill();
  };

  function refresh(bAll) {
    const {choice, usual} = get(), lh = choice.lh || null, rh = choice.rh || {add: 0, on: 'chord'};
    const all = styles(time()), cur = pattern(lh, time()), preset = presetOf(choice, time());
    bAdv.setAttribute('aria-checked', String(advanced));
    bAll.disabled = same(withoutTake(choice), usual);
    for (const r of [presetRow, strumRow, famRow, kindRow, rhythmRow, octRow, toneRow, addRow, onRow, walkRow, shuffleRow]) r.textContent = '';
    const said = [];
    // More walking: Chorale's bass and tenor walk more (only there)
    const walks = !!(cur && cur.passing);
    walkRow.hidden = !walks;
    if (walks) walkRow.append(el('span', 'ce-label'), toggle(tr('More walking'), !!lh.walk, () => change((c) => { if (c.lh.walk) delete c.lh.walk; else c.lh.walk = true; }),
      tr('The bass and the tenor walk between the chords more often')));
    // Shuffle: a style that varies its figures (Adaptive) plays them in another order, the same notes every time; Original
    // is the hymn's own take again
    const varies = !!(cur && cur.vary);
    shuffleRow.hidden = !varies;
    if (varies) {
      const shuffle = btn(tr('Shuffle Style'), false, () => change((c) => { c.lh.seed = 1 + Math.floor(Math.random() * 99999); }));
      shuffle.title = tr('Play the left hand in another order');
      shuffleRow.append(el('span', 'ce-label'), shuffle);
      if (lh.seed) {
        const orig = btn(tr('Original'), false, () => change((c) => { delete c.lh.seed; }));
        orig.title = tr('Back to the left hand this hymn starts with');
        shuffleRow.append(orig);
      }
    }
    presetRow.hidden = advanced;
    strumRow.hidden = advanced || !cur || cur.family !== 'guitar';
    for (const r of [famRow, kindRow, rhythmRow, octRow, onRow]) r.hidden = !advanced;
    // the guitar's tone: in Advanced only (Warm, the usual, is what the simple panel plays)
    const strums = !!(cur && cur.family === 'guitar');
    toneRow.hidden = !advanced || !strums;
    if (!toneRow.hidden) toneRow.append(el('span', 'ce-label', tr('Tone')), ...TONES.map(([id, name]) => btn(tr(name), (lh.tone || 'warm') === id,
      () => change((c) => { if (id === 'warm') delete c.lh.tone; else c.lh.tone = id; }))));
    if (!advanced) {
      presetRow.append(el('span', 'ce-label', tr('Style')), ...PRESETS.map((p) => btn(tr(p.name), preset === p, () => change((c) => {
        if (p.anyKind && c.lh && c.lh.family === p.lh[0]) return;   // already a guitar: the Strum row chooses which
        const n = presetChoice(p); if (c.lh && c.lh.walk) n.lh.walk = true; if (c.lh && c.lh.tone) n.lh.tone = c.lh.tone; c.lh = n.lh; c.rh = n.rh;
      }))));
      if (!preset) presetRow.append(btn(tr('Custom'), true, () => { advanced = true; store.set('pianoAdvanced', true); panel.fill(); }));
      addRow.append(el('span', 'ce-label', tr('Right hand')), ...ADD.slice(0, 2).map(([n, label]) => btn(tr(label), rh.add === n, () => change((c) => { c.rh = {add: n, on: (preset && preset.on) || 'chord'}; }))));
      if (!strumRow.hidden) {
        const fam = all.find((f) => f.id === 'guitar');
        strumRow.append(el('span', 'ce-label', tr('Strum')), ...fam.kinds.map((k) => btn(tr(k.name), k.id === cur.kind, () => change((c) => { c.lh.kind = k.id; c.lh.rhythm = ''; }), '')));
        fam.kinds.forEach((k, i) => { strumRow.children[i + 1].title = tr(k.hint); });
      }
      said.push(preset ? tr(preset.name) : tr('Custom'));
      if (preset && preset.anyKind) said.push(tr(all.find((f) => f.id === cur.family).kinds.find((k) => k.id === cur.kind).name));
      if (rh.add) said.push(tr(ADD[rh.add][1]));
      if (walks && lh.walk) said.push(tr('More walking'));
      if (varies && lh.seed) said.push(tr('Shuffled'));
      if (strums && lh.tone && lh.tone !== 'warm') said.push(tr(TONES.find((t) => t[0] === lh.tone)[1]));
      return said.join(' · ');
    }
    famRow.append(el('span', 'ce-label', tr('Left hand')),
      btn(tr('No left hand'), !cur, () => change((c) => { c.lh = null; })),
      ...all.map((f) => btn(tr(f.name), cur && cur.family === f.id, () => change((c) => {
        const walk = !!(c.lh && c.lh.walk);
        c.lh = {family: f.id, kind: f.kinds[0].id, rhythm: '', oct: (c.lh && c.lh.oct) || 0, pedal: !!(c.lh && c.lh.pedal)};
        if (walk) c.lh.walk = true;
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
      const pedal = toggle(tr('Pedal'), cur.pedal, () => change((c) => { c.lh.pedal = !c.lh.pedal; }));
      pedal.disabled = !cur.rate;
      octRow.append(el('span', 'ce-label', tr('Octave')), lower, higher, el('span', 'ce-gap'), pedal);
      if (oct) said.push(tr(oct < 0 ? 'Lower' : 'Higher'));
      if (cur.pedal && cur.rate) said.push(tr('Pedal'));
      if (walks && lh.walk) said.push(tr('More walking'));
      if (varies && lh.seed) said.push(tr('Shuffled'));
      if (strums && lh.tone && lh.tone !== 'warm') said.push(tr(TONES.find((t) => t[0] === lh.tone)[1]));
    } else said.push(tr('No left hand'));
    addRow.append(el('span', 'ce-label', tr('Right hand')), ...ADD.map(([n, label]) => btn(tr(label), rh.add === n, () => change((c) => { c.rh.add = n; }))));
    onRow.hidden = !rh.add;
    if (rh.add) {
      said.push(tr(ADD[rh.add][1]));
      onRow.append(el('span', 'ce-label', tr('When')), ...ON.map(([id, label]) => btn(tr(label), rh.on === id, () => change((c) => { c.rh.on = id; }))));
    }
    return said.join(' · ');
  }

  bAdv.addEventListener('click', () => { advanced = !advanced; store.set('pianoAdvanced', advanced); panel.fill(); });
  return panel;
}

// The guitar sheet's Strumming: a guitar strums the chords the guitar sheet shows (piano.js strumChoice). Only the
// strum (music.js's guitar kinds, with their hints) and the tone. get() -> {choice: {kind, tone}, usual};
// set(choice): this hymn's; setUsual(choice): for every hymn; time() -> the sheet's time signature.
export function createStrumPanel({get, set, setUsual, time}) {
  const strumRow = el('div', 'ce-row'), toneRow = el('div', 'ce-row');
  const panel = sheetPanel({cls: 'strum-panel', title: tr('Strumming'), label: tr('How the guitar strums'),
    rows: [strumRow, toneRow], refresh: (bAll) => refresh(bAll), onAll: () => setUsual(get().choice)});
  const change = (patch) => { set(Object.assign({}, STRUM_DEFAULT, get().choice, patch)); panel.fill(); };
  function refresh(bAll) {
    const {choice, usual} = get(), cur = Object.assign({}, STRUM_DEFAULT, choice);
    bAll.disabled = same(cur, Object.assign({}, STRUM_DEFAULT, usual));
    const fam = styles(time()).find((f) => f.id === 'guitar');
    const kind = fam.kinds.find((k) => k.id === cur.kind) || fam.kinds[0];
    strumRow.replaceChildren(el('span', 'ce-label', tr('Strum')), ...fam.kinds.map((k) => {
      const b = btn(tr(k.name), k === kind, () => change({kind: k.id}));
      b.title = tr(k.hint);
      return b;
    }));
    const tone = TONES.find((t) => t[0] === cur.tone) || TONES[1];
    toneRow.replaceChildren(el('span', 'ce-label', tr('Tone')), ...TONES.map(([id, name]) => btn(tr(name), tone[0] === id, () => change({tone: id}))));
    return [tr(kind.name), tr(tone[1])].join(' · ');
  }
  return panel;
}
