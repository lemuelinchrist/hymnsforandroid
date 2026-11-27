// How the two hands play (piano.js), the "Style" panel: a sheet at the bottom of the screen, in the chord editor's
// clothes. It opens when Both hands is turned on, and is there (as the slim bar) while the sheet plays; Done tucks it
// down to a slim bar that names the style (a tap or a drag up opens it again); it is gone when neither Both hands nor
// playing needs it. It shows the presets (piano.js PRESETS) and the right hand (Melody alone or Two notes). Every
// change is kept on the device for that hymn alone.
// The guitar sheet's Strumming has a panel of the same kind (createStrumPanel): Strum, Pick, Shuffle Style (for
// Fingerpicking), and Tone.

import {styles, pattern, DEFAULT, PRESETS, presetChoice, presetOf, TONES, STRUM_DEFAULT} from './piano.js';
import {tr} from './i18n.js';

const ADD = [[0, 'Melody alone'], [1, 'Two notes']];

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
const REFRESH_ICON = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a9 9 0 1 1-2.64-6.36L21 8"/><path d="M21 3v5h-5"/></svg>';

function btn(label, pressed, onclick, cls = '') {
  const b = el('button', 'ce-btn ' + cls, label, {type: 'button', 'aria-pressed': String(!!pressed)});
  b.addEventListener('click', onclick);
  return b;
}
function splitBtn(label, pressed, onMain, onSide, sideLabel, sideTitle, mainTitle) {
  const wrap = el('span', 'pp-split' + (pressed ? ' active' : ''));
  const main = btn(label, pressed, onMain, 'pp-split-main');
  if (mainTitle) main.title = mainTitle;
  const side = el('button', 'ce-btn pp-split-side', null, {type: 'button', 'aria-label': sideLabel, title: sideTitle || sideLabel});
  side.innerHTML = REFRESH_ICON;
  side.addEventListener('click', onSide);
  wrap.append(main, side);
  return wrap;
}

// The sheet at the bottom both panels are: open, tucked down to a slim bar that names what plays (a tap or a drag up
// opens it), or hidden. title: its name; label: what it is for (read out, and the bar's tooltip); rows: its rows of
// choices; refresh(): fills them and returns the bar's summary.
function sheetPanel({cls, title, label, rows, refresh}) {
  const root = el('section', 'chord-editor pp-panel ' + cls, null, {'aria-label': label});
  // the bar it tucks down to: a handle, what plays now, and a chevron; a tap or a drag up opens the panel
  const peek = el('button', 'pp-peek', null, {type: 'button', 'aria-expanded': 'false', title: label});
  const summary = el('span', 'pp-summary');
  peek.append(el('span', 'pp-handle', null, {'aria-hidden': 'true'}), el('strong', 'pp-title', title), summary,
    el('span', 'pp-chev', '⌃', {'aria-hidden': 'true'}));
  const grip = el('div', 'pp-handle pp-grip', null, {'aria-hidden': 'true'});
  const bDone = el('button', 'ce-btn primary', tr('Done'), {type: 'button'});
  const top = el('div', 'ce-top');
  top.append(el('strong', 'ce-title', title), el('span', 'grow'), bDone);
  const body = el('div', 'pp-body');
  body.append(grip, top, ...rows);
  root.append(peek, body);

  const fill = () => { summary.textContent = refresh(); setHeight(); };
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

// get() -> {choice}; set(choice): this hymn's; time() -> the sheet's time signature, [4, 4]
export function createPianoPanel({get, set, time}) {
  const presetRow = el('div', 'ce-row'), strumRow = el('div', 'ce-row'), pickRow = el('div', 'ce-row');
  const walkRow = el('div', 'ce-row'), addRow = el('div', 'ce-row');
  const panel = sheetPanel({cls: 'piano-panel', title: tr('Style'), label: tr('How the two hands play'),
    rows: [presetRow, strumRow, pickRow, walkRow, addRow], refresh});
  const change = (fn) => {
    const choice = JSON.parse(JSON.stringify(get().choice || DEFAULT));
    choice.rh = choice.rh || {add: 0, on: 'chord'};
    if (fn) fn(choice);
    set(choice);
    panel.fill();
  };

  function refresh() {
    const {choice} = get(), lh = choice.lh || null, rh = choice.rh || {add: 0, on: 'chord'};
    const all = styles(time()), cur = pattern(lh, time()), preset = presetOf(choice, time());
    for (const r of [presetRow, strumRow, pickRow, walkRow, addRow]) r.textContent = '';
    const said = [];
    // More walking: Chorale's bass and tenor walk more (only there)
    const walks = !!(cur && cur.passing);
    walkRow.hidden = !walks;
    if (walks) walkRow.append(el('span', 'ce-label'), toggle(tr('More walking'), !!lh.walk, () => change((c) => { if (c.lh.walk) delete c.lh.walk; else c.lh.walk = true; }),
      tr('The bass and the tenor walk between the chords more often')));
    const varies = !!(cur && (cur.vary || cur.moods));
    const isGuitar = !!(cur && cur.family === 'guitar');
    strumRow.hidden = pickRow.hidden = !isGuitar;
    const selectPreset = (p) => change((c) => {
      if (p.anyKind && c.lh && c.lh.family === p.lh[0]) return;   // already a guitar: the Strum / Pick rows choose which
      const n = presetChoice(p); if (c.lh && c.lh.walk) n.lh.walk = true; if (c.lh && c.lh.tone) n.lh.tone = c.lh.tone; c.lh = n.lh; c.rh = n.rh;
    });
    const shufflePreset = (p) => change((c) => {
      const same = preset === p;
      if (!same) {
        const n = presetChoice(p); if (c.lh && c.lh.walk) n.lh.walk = true; if (c.lh && c.lh.tone) n.lh.tone = c.lh.tone; c.lh = n.lh; c.rh = n.rh;
      }
      c.lh.seed = 1 + Math.floor(Math.random() * 99999);
    });
    presetRow.append(el('span', 'ce-label', tr('Style')), ...PRESETS.map((p) => {
      const pPat = pattern(presetChoice(p).lh, time());
      if (pPat && (pPat.vary || pPat.moods)) {
        return splitBtn(tr(p.name), preset === p, () => selectPreset(p), () => shufflePreset(p),
          tr('Shuffle Style'), tr('Shuffle this style\'s phrasing'));
      }
      return btn(tr(p.name), preset === p, () => selectPreset(p));
    }));
    addRow.append(el('span', 'ce-label', tr('Right hand')), ...ADD.map(([n, label]) => btn(tr(label), rh.add === n, () => change((c) => { c.rh = {add: n, on: (preset && preset.on) || 'chord'}; }))));
    if (isGuitar) {
      const fam = all.find((f) => f.id === 'guitar');
      const strumKinds = fam.kinds.filter((k) => !k.pick), pickKinds = fam.kinds.filter((k) => k.pick);
      strumRow.append(el('span', 'ce-label', tr('Strum')), ...strumKinds.map((k) => {
        const b = btn(tr(k.name), k.id === cur.kind, () => change((c) => { c.lh.kind = k.id; c.lh.rhythm = ''; delete c.lh.seed; }));
        b.title = tr(k.hint);
        return b;
      }));
      pickRow.append(el('span', 'ce-label', tr('Pick')), ...pickKinds.map((k) => {
        const kVaries = !!(k.rhythms[0] && (k.rhythms[0].vary || k.rhythms[0].moods));
        if (kVaries) {
          return splitBtn(tr(k.name), k.id === cur.kind,
            () => change((c) => { c.lh.kind = k.id; c.lh.rhythm = ''; delete c.lh.seed; }),
            () => change((c) => { c.lh.kind = k.id; c.lh.rhythm = ''; c.lh.seed = 1 + Math.floor(Math.random() * 99999); }),
            tr('Shuffle Style'), tr('Shuffle this style\'s phrasing'), tr(k.hint));
        }
        const b = btn(tr(k.name), k.id === cur.kind, () => change((c) => { c.lh.kind = k.id; c.lh.rhythm = ''; delete c.lh.seed; }));
        b.title = tr(k.hint);
        return b;
      }));
    }
    said.push(preset ? tr(preset.name) : tr('Custom'));
    if (preset && preset.anyKind) said.push(tr(all.find((f) => f.id === cur.family).kinds.find((k) => k.id === cur.kind).name));
    if (rh.add && ADD[rh.add]) said.push(tr(ADD[rh.add][1]));
    if (walks && lh.walk) said.push(tr('More walking'));
    if (varies && lh.seed) said.push(tr('Shuffled'));
    return said.join(' · ');
  }

  return panel;
}

// The guitar sheet's Strumming: a guitar strums or picks the chords the guitar sheet shows (piano.js strumChoice).
// Shows Strum, Pick (with an attached shuffle side-button on Fingerpicking), and Tone rows. get() -> {choice: {kind, tone, seed?}};
// set(choice): this hymn's; time() -> the sheet's time signature.
export function createStrumPanel({get, set, time}) {
  const strumRow = el('div', 'ce-row'), pickRow = el('div', 'ce-row'), toneRow = el('div', 'ce-row');
  const panel = sheetPanel({cls: 'strum-panel', title: tr('Strumming'), label: tr('How the guitar strums'),
    rows: [strumRow, pickRow, toneRow], refresh});
  const change = (patch) => {
    const next = Object.assign({}, STRUM_DEFAULT, get().choice, patch);
    if (!next.seed) delete next.seed;
    set(next);
    panel.fill();
  };
  function refresh() {
    const {choice} = get(), cur = Object.assign({}, STRUM_DEFAULT, choice);
    if (/^(travis|pick-flow|arp|harp|arp-flow)$/.test(cur.kind)) cur.kind = 'pick';
    const fam = styles(time()).find((f) => f.id === 'guitar');
    const kind = fam.kinds.find((k) => k.id === cur.kind) || fam.kinds[0];
    const strumKinds = fam.kinds.filter((k) => !k.pick), pickKinds = fam.kinds.filter((k) => k.pick);
    strumRow.replaceChildren(el('span', 'ce-label', tr('Strum')), ...strumKinds.map((k) => {
      const b = btn(tr(k.name), k === kind, () => change({kind: k.id, seed: 0}));
      b.title = tr(k.hint);
      return b;
    }));
    pickRow.replaceChildren(el('span', 'ce-label', tr('Pick')), ...pickKinds.map((k) => {
      const kVaries = !!(k.rhythms[0] && (k.rhythms[0].vary || k.rhythms[0].moods));
      if (kVaries) {
        return splitBtn(tr(k.name), k === kind,
          () => change({kind: k.id, seed: 0}),
          () => change({kind: k.id, seed: 1 + Math.floor(Math.random() * 99999)}),
          tr('Shuffle Style'), tr('Shuffle this style\'s phrasing'), tr(k.hint));
      }
      const b = btn(tr(k.name), k === kind, () => change({kind: k.id, seed: 0}));
      b.title = tr(k.hint);
      return b;
    }));
    const varies = !!(kind.rhythms[0] && (kind.rhythms[0].vary || kind.rhythms[0].moods));
    const tone = TONES.find((t) => t[0] === cur.tone) || TONES[1];
    toneRow.replaceChildren(el('span', 'ce-label', tr('Tone')), ...TONES.map(([id, name]) => btn(tr(name), tone[0] === id, () => change({tone: id}))));
    const parts = [tr(kind.name)];
    if (varies && cur.seed) parts.push(tr('Shuffled'));
    parts.push(tr(tone[1]));
    return parts.join(' · ');
  }
  return panel;
}
