// Unified Bottom Dock (Proposal 1 "Apple Music" Mini-Player) for Sheet Music (shared between web and Android viewer).
// Replaces both the old top playback bar and the old bottom Style/Strumming panels with one frosted floating bottom dock:
//   - Razor-thin 3px top progress bar along the dock's top edge
//   - Slim 1-row bar: circular Play/Stop FAB, From-start (when playing/open), Style + BPM summary, Loop toggle, Expand chevron, Close
//   - Expandable drawer: horizontal style pills with attached refresh side-buttons (Flowing, Lively, Fingerpicking),
//     Guitar Strum/Pick or Tone rows, Chorale More walking switch, Tempo slider, Parts (All | Melody | Acc.), and Right hand (1 / 2 notes).

import {styles, pattern, DEFAULT, PRESETS, presetChoice, presetOf, TONES, STRUM_DEFAULT} from './piano.js';
import {MIN_SPEED, MAX_SPEED} from './sheetplayer.js';
import {tr} from './i18n.js';

const IC = {
  play: '<svg viewBox="0 0 24 24" width="17" height="17" fill="currentColor" aria-hidden="true"><path d="M7.5 5.2v13.6L19 12z"/></svg>',
  stop: '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>',
  start: '<svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor" aria-hidden="true"><path d="M6 5h2.2v14H6zM18.5 5.5v13L9.5 12z"/></svg>',
  loop: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17 2l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="M7 22l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>',
  chevUp: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 15l-6-6-6 6"/></svg>',
  chevDown: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>',
  close: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12"/></svg>',
  refresh: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a9 9 0 1 1-2.64-6.36L21 8"/><path d="M21 3v5h-5"/></svg>',
};

function el(tag, cls, text, attrs) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  if (attrs) for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  return e;
}

function toggle(label, on, onclick, title) {
  const b = el('button', 'ud-switch', null, {type: 'button', role: 'switch', 'aria-checked': String(!!on)});
  if (title) b.title = title;
  b.append(el('span', 'ud-track', null, {'aria-hidden': 'true'}), el('span', 'ud-switch-lbl', label));
  if (onclick) b.addEventListener('click', onclick);
  return b;
}

function chip(label, pressed, onclick, cls = '') {
  const b = el('button', 'ud-chip ' + cls, label, {type: 'button', 'aria-pressed': String(!!pressed)});
  b.addEventListener('click', onclick);
  return b;
}

function splitChip(label, pressed, onMain, onSide, sideLabel, sideTitle, mainTitle) {
  const wrap = el('span', 'ud-split' + (pressed ? ' active' : ''));
  const main = chip(label, pressed, onMain, 'ud-split-main');
  if (mainTitle) main.title = mainTitle;
  const side = el('button', 'ud-chip ud-split-side', null, {type: 'button', 'aria-label': sideLabel, title: sideTitle || sideLabel});
  side.innerHTML = IC.refresh;
  side.addEventListener('click', onSide);
  wrap.append(main, side);
  return wrap;
}

// Unified floating bottom dock for the Sheet Music screen (Piano & Guitar sheets).
//   player: createSheetPlayer() controller
//   getPiano / setPiano: per-hymn piano choice
//   getStrum / setStrum: per-hymn guitar strum/pick/tone choice
//   isGuitar / hasStaff / hasHands: current sheet view state
//   time(): current time signature [count, unit]
export function createSheetDock({player, getPiano, setPiano, getStrum, setStrum, isGuitar, hasStaff, hasHands, time}) {
  const root = el('section', 'ud-dock sheet-dock', null, {role: 'region', 'aria-label': tr('Play the sheet')});
  const progBar = el('div', 'ud-prog', null, {'aria-hidden': 'true'});
  const progFill = el('i');
  progBar.append(progFill);

  // Slim 1-row mini-player bar
  const bar = el('div', 'ud-bar');
  const bPlay = el('button', 'ud-play', null, {type: 'button', 'aria-label': tr('Play')});
  const bStart = el('button', 'ud-icbtn ud-start', null, {type: 'button', title: tr('From the start'), 'aria-label': tr('From the start')});
  bStart.innerHTML = IC.start;
  const meta = el('button', 'ud-meta', null, {type: 'button', 'aria-expanded': 'false', title: tr('Style & tempo')});
  const nameEl = el('div', 'ud-name');
  const subEl = el('div', 'ud-sub');
  const tempoBadge = el('span', 'ud-sub-tempo');
  const barBadge = el('span', 'ud-sub-bar');
  const extraBadge = el('span', 'ud-sub-extra');
  subEl.append(tempoBadge, extraBadge, barBadge);
  meta.append(nameEl, subEl);
  const bLoop = el('button', 'ud-icbtn ud-loop', null, {type: 'button', title: tr('Play again and again'), 'aria-label': tr('Loop'), 'aria-pressed': 'false'});
  bLoop.innerHTML = IC.loop;
  const bExpand = el('button', 'ud-icbtn ud-expand', null, {type: 'button', title: tr('Style & tempo'), 'aria-label': tr('Style & tempo'), 'aria-expanded': 'false'});
  const bClose = el('button', 'ud-icbtn ud-close', null, {type: 'button', title: tr('Close the player'), 'aria-label': tr('Close the player')});
  bClose.innerHTML = IC.close;
  bar.append(bPlay, bStart, meta, bLoop, bExpand, bClose);

  // Expandable drawer
  const drawer = el('div', 'ud-drawer');
  const styleRail = el('div', 'ud-rail ud-styles');
  const subRail = el('div', 'ud-rail ud-substyles');
  const toneRail = el('div', 'ud-rail ud-tones');
  const optRow = el('div', 'ud-row ud-opts');
  const tempoWrap = el('div', 'ud-tempo-wrap');
  const tempoBtn = el('button', 'ud-tempo', null, {type: 'button'});
  const speed = el('input', 'ud-speed', null, {type: 'range', min: String(MIN_SPEED), max: String(MAX_SPEED), step: '0.05',
    title: tr('Tempo (double tap: the tune\'s)'), 'aria-label': tr('Tempo')});
  tempoWrap.append(tempoBtn, speed);
  const mixWrap = el('div', 'ud-mix');
  optRow.append(tempoWrap, mixWrap);
  drawer.append(styleRail, subRail, toneRail, optRow);
  root.append(progBar, bar, drawer);

  // Wire transport controls
  bPlay.addEventListener('click', () => player.toggle());
  bStart.addEventListener('click', () => player.fromStart());
  bLoop.addEventListener('click', () => player.setLoop(!player.loop));
  bClose.addEventListener('click', () => player.close());
  speed.addEventListener('input', () => { player.setSpeed(speed.value, false); updateTempo(); });
  speed.addEventListener('change', () => { player.setSpeed(speed.value, true); });
  speed.addEventListener('dblclick', () => { speed.value = '1'; player.setSpeed(1, true); });
  tempoBtn.addEventListener('click', () => { if (player.speed !== 1) { speed.value = '1'; player.setSpeed(1, true); } });

  let mode = 'hidden';   // 'hidden' | 'peek' | 'open'
  const setHeight = () => { if (!root.hidden) document.body.style.setProperty('--editor-h', (root.offsetHeight + 14) + 'px'); };
  function show(m) {
    if (m === mode) { if (m !== 'hidden') refresh(); return; }
    mode = m;
    root.hidden = m === 'hidden';
    drawer.hidden = m !== 'open';
    root.classList.toggle('open', m === 'open');
    meta.setAttribute('aria-expanded', String(m === 'open'));
    bExpand.setAttribute('aria-expanded', String(m === 'open'));
    bExpand.innerHTML = m === 'open' ? IC.chevDown : IC.chevUp;
    document.body.classList.toggle('piano-open', m === 'open');
    document.body.classList.toggle('piano-peek', m === 'peek');
    if (m === 'hidden') document.body.style.removeProperty('--editor-h');
    else { refresh(); setHeight(); }
  }
  const toggleOpen = () => show(mode === 'open' ? 'peek' : 'open');
  meta.addEventListener('click', toggleOpen);
  bExpand.addEventListener('click', toggleOpen);

  // Drag up on bar to expand, drag down to collapse
  let dragY = null;
  bar.addEventListener('pointerdown', (e) => {
    if (e.target.closest('button:not(.ud-meta)')) return;
    dragY = e.clientY;
  });
  const onMove = (e) => {
    if (dragY == null) return;
    const dy = e.clientY - dragY;
    if (mode === 'peek' && dy < -24) { dragY = null; show('open'); }
    else if (mode === 'open' && dy > 36) { dragY = null; show('peek'); }
  };
  const onUp = () => { dragY = null; };
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);

  document.body.appendChild(root);
  root.hidden = true;
  const ro = new ResizeObserver(setHeight);
  ro.observe(root);

  function changePiano(fn) {
    const choice = JSON.parse(JSON.stringify(getPiano().choice || DEFAULT));
    choice.rh = choice.rh || {add: 0, on: 'chord'};
    if (fn) fn(choice);
    setPiano(choice);
    refresh();
  }
  function changeStrum(patch) {
    const next = Object.assign({}, STRUM_DEFAULT, getStrum().choice, patch);
    if (!next.seed) delete next.seed;
    setStrum(next);
    refresh();
  }

  function updateTempo() {
    const own = player.baseBpm, pct = Math.round(player.speed * 100);
    const label = '♩ = ' + player.currentBpm;
    tempoBtn.textContent = label + (pct === 100 ? '' : ' (' + pct + '%)');
    tempoBtn.title = pct === 100 ? '' : tr('Tap: the tune\'s own tempo (♩ = {0})', own);
    tempoBadge.textContent = label;
    speed.value = String(player.speed);
  }

  function setProgress(barNo, total) {
    const pct = barNo > 0 && total > 0 ? Math.min(100, (100 * barNo) / total) : 0;
    progFill.style.width = pct + '%';
    barBadge.textContent = barNo > 0 && total > 0 ? ' · ' + tr('Bar {0} of {1}', barNo, total) : '';
  }

  function refresh() {
    if (mode === 'hidden') return;
    const playing = player.playing;
    const playerOpen = player.open;
    const guitar = isGuitar();
    const staff = hasStaff();
    const hands = hasHands();

    bPlay.innerHTML = playing ? IC.stop : IC.play;
    bPlay.setAttribute('aria-pressed', String(playing));
    bPlay.title = bPlay.ariaLabel = playing ? tr('Stop') : tr('Play');
    bStart.hidden = !playerOpen && player.from <= 0;
    bLoop.setAttribute('aria-pressed', String(player.loop));
    bLoop.classList.toggle('on', player.loop);
    bExpand.classList.toggle('on', mode === 'open');
    bClose.hidden = !playerOpen;

    updateTempo();
    setProgress(player.bar, player.bars);

    const extras = [];
    if (player.loop) extras.push(tr('Loop'));
    if (player.part === 'mel') extras.push(tr('Melody'));
    else if (player.part === 'acc') extras.push(tr('Acc.'));
    extraBadge.textContent = extras.length ? ' · ' + extras.join(' · ') : '';

    // Fill style rails & context options
    styleRail.textContent = '';
    subRail.textContent = '';
    toneRail.textContent = '';
    mixWrap.textContent = '';
    subRail.hidden = true;
    toneRail.hidden = true;

    const tSig = time();
    const allStyles = styles(tSig);
    let summary = '';

    if (guitar) {
      styleRail.hidden = false;
      const cur = Object.assign({}, STRUM_DEFAULT, getStrum().choice);
      if (/^(travis|pick-flow|arp|harp|arp-flow)$/.test(cur.kind)) cur.kind = 'pick';
      const fam = allStyles.find((f) => f.id === 'guitar');
      const kind = fam.kinds.find((k) => k.id === cur.kind) || fam.kinds[0];
      for (const k of fam.kinds) {
        const kVaries = !!(k.rhythms[0] && (k.rhythms[0].vary || k.rhythms[0].moods));
        if (kVaries) {
          styleRail.append(splitChip(tr(k.name), k === kind,
            () => changeStrum({kind: k.id, seed: 0}),
            () => changeStrum({kind: k.id, seed: 1 + Math.floor(Math.random() * 99999)}),
            tr('Shuffle Style'), tr('Shuffle this style\'s phrasing'), tr(k.hint)));
        } else {
          const b = chip(tr(k.name), k === kind, () => changeStrum({kind: k.id, seed: 0}));
          b.title = tr(k.hint);
          styleRail.append(b);
        }
      }
      const tone = TONES.find((t) => t[0] === cur.tone) || TONES[1];
      toneRail.hidden = false;
      toneRail.append(el('span', 'ud-rail-lbl', tr('Tone')),
        ...TONES.map(([id, name]) => chip(tr(name), tone[0] === id, () => changeStrum({tone: id}), 'sm')));
      const varies = !!(kind.rhythms[0] && (kind.rhythms[0].vary || kind.rhythms[0].moods));
      const parts = [tr(kind.name)];
      if (varies && cur.seed) parts.push(tr('Shuffled'));
      parts.push(tr(tone[1]));
      summary = parts.join(' · ');
    } else if (staff) {
      styleRail.hidden = false;
      const {choice} = getPiano(), lh = choice.lh || null, rh = choice.rh || {add: 0, on: 'chord'};
      const cur = pattern(lh, tSig), preset = presetOf(choice, tSig);
      const selectPreset = (p) => changePiano((c) => {
        if (p.anyKind && c.lh && c.lh.family === p.lh[0]) return;
        const n = presetChoice(p);
        if (c.lh && c.lh.walk) n.lh.walk = true;
        if (c.lh && c.lh.tone) n.lh.tone = c.lh.tone;
        c.lh = n.lh; c.rh = n.rh;
      });
      const shufflePreset = (p) => changePiano((c) => {
        if (preset !== p) {
          const n = presetChoice(p);
          if (c.lh && c.lh.walk) n.lh.walk = true;
          if (c.lh && c.lh.tone) n.lh.tone = c.lh.tone;
          c.lh = n.lh; c.rh = n.rh;
        }
        c.lh.seed = 1 + Math.floor(Math.random() * 99999);
      });
      for (const p of PRESETS) {
        const pPat = pattern(presetChoice(p).lh, tSig);
        const on = hands && preset === p;
        if (pPat && (pPat.vary || pPat.moods)) {
          styleRail.append(splitChip(tr(p.name), on, () => selectPreset(p), () => shufflePreset(p),
            tr('Shuffle Style'), tr('Shuffle this style\'s phrasing')));
        } else {
          styleRail.append(chip(tr(p.name), on, () => selectPreset(p)));
        }
      }
      const isGuitarPreset = !!(hands && cur && cur.family === 'guitar');
      if (isGuitarPreset) {
        subRail.hidden = false;
        const fam = allStyles.find((f) => f.id === 'guitar');
        for (const k of fam.kinds) {
          const kVaries = !!(k.rhythms[0] && (k.rhythms[0].vary || k.rhythms[0].moods));
          if (kVaries) {
            subRail.append(splitChip(tr(k.name), k.id === cur.kind,
              () => changePiano((c) => { c.lh.kind = k.id; c.lh.rhythm = ''; delete c.lh.seed; }),
              () => changePiano((c) => { c.lh.kind = k.id; c.lh.rhythm = ''; c.lh.seed = 1 + Math.floor(Math.random() * 99999); }),
              tr('Shuffle Style'), tr('Shuffle this style\'s phrasing'), tr(k.hint)));
          } else {
            const b = chip(tr(k.name), k.id === cur.kind, () => changePiano((c) => { c.lh.kind = k.id; c.lh.rhythm = ''; delete c.lh.seed; }), 'sm');
            b.title = tr(k.hint);
            subRail.append(b);
          }
        }
      }
      // More walking switch (Chorale only)
      const walks = !!(hands && cur && cur.passing);
      if (walks) {
        mixWrap.append(toggle(tr('More walking'), !!lh.walk,
          () => changePiano((c) => { if (c.lh.walk) delete c.lh.walk; else c.lh.walk = true; }),
          tr('The bass and the tenor walk between the chords more often')));
      }
      // Right hand segmented control (1 / 2 notes)
      if (hands) {
        const rhSeg = el('div', 'ud-seg', null, {role: 'group', 'aria-label': tr('Right hand')});
        [[0, 'RH: 1 note', 'Melody alone'], [1, 'RH: 2 notes', 'Two notes']].forEach(([n, lbl, title]) => {
          const b = el('button', null, tr(lbl), {type: 'button', 'aria-pressed': String(rh.add === n), title: tr(title)});
          b.addEventListener('click', () => changePiano((c) => { c.rh = {add: n, on: (preset && preset.on) || 'chord'}; }));
          rhSeg.append(b);
        });
        mixWrap.append(rhSeg);
      }
      if (!hands) {
        summary = tr('Melody');
      } else {
        const said = [preset ? tr(preset.name) : tr('Custom')];
        if (preset && preset.anyKind) said.push(tr(allStyles.find((f) => f.id === cur.family).kinds.find((k) => k.id === cur.kind).name));
        if (walks && lh.walk) said.push(tr('More walking'));
        const varies = !!(cur && (cur.vary || cur.moods));
        if (varies && lh.seed) said.push(tr('Shuffled'));
        summary = said.join(' · ');
      }
    } else {
      styleRail.hidden = true;
      summary = tr('Chords only');
    }

    // Parts segmented control (All | Melody | Acc.)
    const partSeg = el('div', 'ud-seg ud-parts', null, {role: 'group', 'aria-label': tr('What is heard')});
    [['all', 'All'], ['mel', 'Melody'], ['acc', 'Acc.']].forEach(([id, lbl]) => {
      const b = el('button', null, tr(lbl), {type: 'button', 'data-part': id, 'aria-pressed': String(player.part === id)});
      b.addEventListener('click', () => player.setPart(id));
      partSeg.append(b);
    });
    mixWrap.prepend(partSeg);

    nameEl.textContent = summary;
    setHeight();
  }

  return {
    el: root,
    get mode() { return mode; },
    get isOpen() { return mode === 'open'; },
    show,
    open() { show('open'); },
    refresh,
    setProgress,
    destroy() {
      ro.disconnect(); window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp);
      show('hidden'); root.remove();
    },
  };
}
