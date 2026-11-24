// The sheet music with its toolbar: Piano | Guitar, Chords only, the key, Both hands (and its panel at the bottom), the
// zoom, the sheet alone, and ⋯ (Edit chords, Original chords, the original key and size, light paper, Print, Save MIDI); the
// player's row under it. The web app shows it beside the lyrics or alone (#/sheet/E8); the Android app's sheet viewer
// is this alone (tools/web/android). What differs between the two comes in as options, or through host.js.
import {SheetView, MAX_SHIFT, MIN_SCALE, MAX_SCALE, DEFAULT_SCALE} from './sheet.js';
import {createEditor} from './editor.js';
import {createPianoPanel} from './pianopanel.js';
import {createSheetPlayer} from './sheetplayer.js';
import {DEFAULT as PIANO_DEFAULT} from './piano.js';
import {host as appHost} from './host.js';
import * as Player from './player.js';
import {tr, tn} from './i18n.js';
import {h, append, icon, store, toast, isDark, popupMenu, themeListeners} from './ui.js';

// remembered between hymns: piano or guitar, the staff, the zoom, both hands. Transposition is per hymn (in the URL only).
function sheetPrefs() {
  return Object.assign({guitar: false, staff: true, scale: DEFAULT_SCALE, hands: false}, store.get('sheet', {}));
}

// pane: the element to fill. o:
//   sheetId, lyricsId, id   the sheet, the hymn whose words go under it when it is another's (or null), the hymn shown
//   params                  URLSearchParams with v=guitar, staff=0, t=<shift>, z=<scale> (a link opens the same view)
//   onParams(p)             the settings changed: {v, staff, t, z} as the URL should now have them
//   full                    the sheet alone: it has its own Play button
//   tune                    the url of the hymn's tune file (the sheet is played at its tempo), or null
//   title, note             elements above and below the toolbar, or null
//   exit                    {icon, title, href | run, first}: the toolbar's last button (the sheet alone: back), or with
//                           first its first (the Android viewer's ‹, where Android has its back button), or null
//   sheetOnly(p)            opens the sheet alone with these settings (the ⤢ button), or null
//   pinch                   pinching the sheet changes its size (where the page itself does not zoom)
//   stopTune(), onplay()    the hymn's own Play button: stop its tune; the sheet started or stopped playing
export function createSheetPanel(pane, o) {
  const {full = false, stopTune = () => Player.stop(), onplay = () => {}} = o;
  const p = o.params || new URLSearchParams();
  const prefs = sheetPrefs();
  const state = {
    guitar: p.has('v') ? p.get('v') === 'guitar' : prefs.guitar,
    staff: p.has('staff') ? p.get('staff') !== '0' : prefs.staff,
    shift: Math.max(-MAX_SHIFT, Math.min(MAX_SHIFT, parseInt(p.get('t') || '0', 10) || 0)),
    scale: Math.max(MIN_SCALE, Math.min(MAX_SCALE, parseInt(p.get('z') || '', 10) || prefs.scale)),
    hands: !!prefs.hands,
  };
  const keep = () => store.set('sheet', {guitar: state.guitar, staff: state.staff, scale: state.scale, hands: state.hands});

  const btn = (label, title, onclick, cls = '') => h('button', {type: 'button', class: 'tb ' + cls, title, 'aria-label': title, onclick}, label);
  // on a narrow screen (sheet.css) Piano | Guitar show their icons instead of the words (the staff button keeps its words)
  const named = (ic, text) => [icon(ic), h('span', {class: 'lbl'}, text)];
  const bPiano = btn(named('piano', tr('Piano')), tr('Piano sheet (P)'), () => set({guitar: false}), 'pair');
  const bGuitar = btn(named('guitar', tr('Guitar')), tr('Guitar sheet (G)'), () => set({guitar: true}), 'pair');
  const bDown = btn('−', tr('Transpose down a semitone (−)'), () => set({shift: state.shift - 1}), 'step');
  const bUp = btn('+', tr('Transpose up a semitone (+)'), () => set({shift: state.shift + 1}), 'step');
  const keyLabel = h('button', {type: 'button', class: 'key', title: tr('Back to the original key')}, '…');
  keyLabel.addEventListener('click', () => set({shift: 0}));
  // "Chords only": the staff hidden, the chords over the words; lit while it is on
  // (just "Chords" under 400 px, where there is no room for more: sheet.css)
  const bStaff = btn([h('span', {class: 'full'}, tr('Chords only')), h('span', {class: 'short'}, tr('Chords'))], tr('Show or hide the staff (H)'), () => set({staff: !state.staff}), 'toggle');
  const bZoomOut = btn(icon('zoomOut'), tr('Smaller (Z)'), () => set({scale: state.scale - 5}), 'icon');
  const bZoomIn = btn(icon('zoomIn'), tr('Bigger (Shift+Z)'), () => set({scale: state.scale + 5}), 'icon');
  // both hands: a piano part made from the chords (piano.js); how the hands play is chosen in the panel at the bottom
  const bHands = btn(tr('Both hands'), tr('A piano part: a left hand made from the chords (B)'), () => set({hands: !state.hands}), 'hands');
  // play the sheet: the hymn page's own Play button does it while the sheet is shown; the sheet alone has this one
  const bPlay = btn(icon('play'), tr('Play the sheet as it is shown, with both hands when they are on (M)'), () => sp.toggle(), 'icon playsheet');
  bPlay.hidden = !full;
  let sp = null;
  // the rest, used less, in the ⋯ menu: chord editing (for players who reharmonize), the original chords, the original
  // key and size, light paper (dark theme), Save MIDI. The sheet alone (for a music stand) keeps its own button.
  const bMore = btn(icon('more'), tr('More'), () => moreMenu(), 'icon sheet-more');
  bMore.setAttribute('aria-haspopup', 'menu');
  bMore.setAttribute('aria-expanded', 'false');
  const lightPaper = () => store.get('sheetPaper', null) === 'light';
  function moreMenu() {
    const items = [];
    // what the bar had no room for (fit(), sheet.css) is here instead: Both hands, then the zoom
    const fit = +bar.dataset.fit || 0;
    if (fit >= 3 && !bHands.hidden) items.push({icon: 'piano', label: tr('Both hands'), checked: !!state.hands, run: () => set({hands: !state.hands})});
    if (fit >= 5 && !bStaff.hidden) items.push({icon: 'staff', label: tr('Chords only'), checked: !state.staff, run: () => set({staff: !state.staff})});
    if (fit >= 1) {
      if (state.scale > MIN_SCALE) items.push({icon: 'zoomOut', label: tr('Smaller'), run: () => set({scale: state.scale - 5})});
      if (state.scale < MAX_SCALE) items.push({icon: 'zoomIn', label: tr('Bigger'), run: () => set({scale: state.scale + 5})});
    }
    if (!view.chordsOnly) items.push({icon: 'edit', label: view.editing ? tr('Stop editing chords') : tr('Edit chords'), run: () => setEdit(!view.editing)});
    if (view.hasEdits()) items.push({icon: 'original', label: tr('Original chords'), checked: !!state.original, run: () => set({original: !state.original})});
    if (state.shift || state.scale !== DEFAULT_SCALE) items.push({icon: 'reset', label: tr('Original key and size'), run: () => set({shift: 0, scale: DEFAULT_SCALE})});
    // dark theme only: the sheet on light paper (black on white); remembered like the zoom
    if (isDark()) items.push({icon: 'paper', label: tr('Light paper'), checked: lightPaper(), run: () => { store.set('sheetPaper', lightPaper() ? null : 'light'); paperLook(); }});
    items.push({icon: 'print', label: tr('Print'), run: printSheet});
    if (!view.chordsOnly) items.push({icon: 'download', label: tr('Save MIDI'), run: () => sp.saveMidi()});
    bookColour(popupMenu(bMore, items, 'sheet-menu'));
  }
  // Print: the sheet alone as it is shown (the key, Chords only, Both hands, the edited chords), black on white, laid
  // out for paper (sheet.js); the rest of the page is left out while it prints (html.print-sheet, sheet.css)
  function printSheet() {
    const path = [];
    for (let e = view.root; e && e !== document.body; e = e.parentElement) { e.classList.add('print-path'); path.push(e); }
    document.documentElement.classList.add('print-sheet');
    view.setPrinting(true);
    let over = false;
    appHost.print(view.title.textContent || document.title, () => {
      if (over) return;
      over = true;
      document.documentElement.classList.remove('print-sheet');
      for (const e of path) e.classList.remove('print-path');
      view.setPrinting(false);
    });
  }
  const exit = o.exit
    ? (o.exit.href
      ? h('a', {class: 'tb icon', href: o.exit.href, title: o.exit.title, 'aria-label': o.exit.title}, icon(o.exit.icon))
      : btn(icon(o.exit.icon), o.exit.title, o.exit.run, 'icon exit' + (o.exit.first ? ' exit-first' : '')))
    : null;
  const bSheetOnly = o.sheetOnly
    ? h('a', {class: 'tb icon', href: '#', title: tr('Sheet only, for a music stand'), 'aria-label': tr('Sheet only, for a music stand'),
      onclick: (e) => { e.preventDefault(); o.sheetOnly(sheetParams()); }}, icon('expand'))
    : null;

  const first = o.exit && o.exit.first;
  const bar = h('div', {class: 'sheet-bar', role: 'toolbar', 'aria-label': tr('Sheet music')},
    first ? exit : null,
    h('div', {class: 'seg'}, bPiano, bGuitar),
    bStaff,
    h('div', {class: 'transpose'}, bDown, keyLabel, bUp),
    bHands,
    h('div', {class: 'zoom'}, bZoomOut, bZoomIn),
    h('span', {class: 'grow'}),
    full ? bPlay : null,
    bSheetOnly,
    bMore,
    first ? null : exit);
  // the toolbar and the player's row together (the Android viewer keeps them at the top of the screen)
  const top = h('div', {class: 'sheet-top'}, bar);
  const host = h('div', {class: 'sheet-host'});
  append(pane, [o.title || null, top, o.note || null, host]);

  const view = new SheetView(host);
  // what is put on the page outside the pane (the panels at the bottom, the ⋯ menu) takes the hymn's book colour too
  function bookColour(el) {
    const from = pane.closest('[style*="--gd"]');
    if (!el || !from) return el;
    for (const v of ['--gd', '--gn']) el.style.setProperty(v, from.style.getPropertyValue(v));
    return el;
  }
  // dark theme: dark paper, or light paper if the reader chose it with the paper button
  function paperLook() {
    const light = isDark() && store.get('sheetPaper', null) === 'light';
    view.root.classList.toggle('dark', isDark() && !light);
    view.root.classList.toggle('light-paper', light);
  }
  paperLook();

  function sheetParams() {
    const out = {};
    if (state.guitar !== false) out.v = 'guitar';
    if (!state.staff) out.staff = '0';
    if (state.shift) out.t = state.shift;
    if (state.scale !== DEFAULT_SCALE) out.z = state.scale;
    return out;
  }

  // how the hands play: this hymn's own (a change in the panel), else the one the sheet starts with (a sheet of ours
  // that names its piano part), else the device's choice for every hymn ("Use for all hymns")
  function pianoChoice() {
    const own = store.get('pianoOf', {})[o.sheetId], usual = store.get('piano', PIANO_DEFAULT);
    return {choice: own || view.baseHands || usual, usual};
  }
  function keepOwn(choice) {
    const all = store.get('pianoOf', {});
    // the same as what the hymn plays without one: none of its own, so that it follows the device's choice
    if (JSON.stringify(choice) === JSON.stringify(view.baseHands || store.get('piano', PIANO_DEFAULT))) delete all[o.sheetId];
    else all[o.sheetId] = choice;
    store.set('pianoOf', all);
    view.piano = choice;
    view.set({});
  }
  function setUsual(choice) {
    store.set('piano', choice);
    keepOwn(choice);
  }
  view.piano = pianoChoice().choice;
  view.onSheet = () => { view.piano = pianoChoice().choice; if (panel) panel.refresh(); };   // the sheet may name its own piano part
  // the panel is there while Both hands is on with something to play it on (not while editing chords): open when
  // Both hands was just turned on, else tucked down to its bar
  let panel = null;
  function syncPanel(openIt = false) {
    const wanted = state.hands && !state.guitar && state.staff && !view.chordsOnly && !view.editing && view.renders > 0;
    if (!wanted) { if (panel) panel.show('hidden'); return; }
    if (!panel) {
      panel = createPianoPanel({get: pianoChoice, set: keepOwn, setUsual, time: () => view.time});
      bookColour(panel.el);
    }
    if (openIt) panel.show('open');
    else if (panel.mode === 'hidden') panel.show('peek');
    else panel.refresh();
  }

  // chord editing: only on the piano sheet with the staff shown and the edits in place
  let editor = null;
  function setEdit(on) {
    if (on && view.chordsOnly) return;   // chords over the words only: nothing to edit on a staff
    document.body.classList.remove('bars-away');
    if (on && panel) panel.show('hidden');
    if (on) {
      Object.assign(state, {guitar: false, staff: true, original: false});
      if (!editor) {
        editor = createEditor(view, {onclose: () => setEdit(false)});
        bookColour(editor.el);
      }
      view.setEditing(true, {guitar: false, staff: true, original: false});
      editor.open();
    } else {
      if (editor) editor.close();
      view.setEditing(false);
    }
    keep();
    updateBar();
    if (o.onedit) o.onedit(on);
  }

  function set(changes) {
    if (view.editing && (changes.guitar || changes.staff === false || changes.original)) setEdit(false);
    const handsOn = changes.hands === true && !state.hands;
    Object.assign(state, changes);
    state.shift = Math.max(-MAX_SHIFT, Math.min(MAX_SHIFT, state.shift));
    state.scale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, state.scale));
    keep();
    view.set(state);
    updateBar();
    if (handsOn) syncPanel(true);
    if (o.onParams) o.onParams(sheetParams());
  }

  function updateBar(info = view.info) {
    bPiano.setAttribute('aria-pressed', String(!state.guitar));
    bGuitar.setAttribute('aria-pressed', String(state.guitar));
    bStaff.setAttribute('aria-pressed', String(!state.staff));
    bStaff.hidden = !!view.chordsOnly;
    bPlay.hidden = !full || !!view.chordsOnly;   // a sheet of chords over the words has no notes to play
    if (sp) {
      bPlay.replaceChildren(icon(sp.playing ? 'pause' : 'play'));
      bPlay.setAttribute('aria-pressed', String(sp.playing));
      sp.available(!view.chordsOnly);
    }
    bHands.hidden = !!view.chordsOnly || state.guitar || !state.staff;   // a piano part needs the piano sheet's staff
    bHands.setAttribute('aria-pressed', String(!!state.hands));
    bMore.classList.toggle('dot', !!state.original);   // the original chords are shown: a mark on ⋯, where to turn it off
    bDown.disabled = state.shift <= -MAX_SHIFT;
    bUp.disabled = state.shift >= MAX_SHIFT;
    bZoomOut.disabled = state.scale <= MIN_SCALE;
    bZoomIn.disabled = state.scale >= MAX_SCALE;
    keyLabel.textContent = info.tonic ? info.tonic + (state.shift ? ' (' + (state.shift > 0 ? '+' : '') + state.shift + ')' : '') : '…';
    keyLabel.title = !state.shift ? tr('Original key') : state.shift > 0
      ? tn('Transposed up {0} semitone · click for the original key', 'Transposed up {0} semitones · click for the original key', state.shift)
      : tn('Transposed down {0} semitone · click for the original key', 'Transposed down {0} semitones · click for the original key', -state.shift);
    keyLabel.disabled = !state.shift;
    syncPanel();
    onplay();
    fit();   // the key's label and the buttons shown change the width the bar needs
  }
  // One row at any width: give up a little at a time until the bar fits (the steps are in sheet.css, "data-fit"):
  // the zoom buttons, the words of Piano | Guitar, Both hands, the narrowest buttons, Chords only; the menu takes over what is dropped
  function fit() {
    if (!bar.clientWidth) return;   // not shown (a tab that is not open): the observer calls this again when it is
    for (let level = 0; level <= 5; level++) {
      bar.dataset.fit = String(level);
      if (bar.scrollWidth <= bar.clientWidth) return;
    }
    bar.dataset.fit = '6';
  }
  const barObserver = new ResizeObserver(fit);
  barObserver.observe(bar);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(fit);
  sp = createSheetPlayer(view, {tune: o.tune || null, store, stopTune, onchange: () => updateBar()});
  top.appendChild(sp.el);
  view.onsound = () => sp.refresh();
  view.onchange = (st, info) => updateBar(info);
  view.onedited = () => { updateBar(); if (editor) editor.refresh(); };
  updateBar();
  view.show(o.sheetId, state, o.lyricsId);

  const onTheme = paperLook;
  themeListeners.add(onTheme);
  const stopHiding = hideBarsOnScroll(pane);
  const stopPinch = o.pinch ? pinchToZoom(host, () => state.scale, (scale) => set({scale})) : () => {};
  return {
    set, state,
    setEdit,
    get editing() { return !!view.editing; },
    togglePlay: () => sp.toggle(),
    get playing() { return !!(sp && sp.playing); },
    // a sheet with notes on it, drawn: its music can be played
    get playable() { return view.renders > 0 && !view.chordsOnly; },
    get chordsOnly() { return !!view.chordsOnly; },
    get failed() { return !!view.failed; },
    destroy() {
      sp.destroy(); if (editor) editor.destroy(); if (panel) panel.destroy(); view.destroy(); themeListeners.delete(onTheme);
      stopHiding(); stopPinch(); barObserver.disconnect();
    },
  };
}

// phones, tablets (any touch screen, however big) and short screens: the bars slide away while scrolling down the
// sheet (more room for the music). Scrolling up does not bring them back (small moves to fit the music would keep
// uncovering them): a tap on the sheet does, or reaching the top of the page. Not while editing chords.
const smallScreen = window.matchMedia('(max-width: 1079px), (max-height: 600px), (pointer: coarse)');
function hideBarsOnScroll(pane) {
  const body = document.body;
  const usable = () => smallScreen.matches && pane.offsetParent !== null && !body.classList.contains('editing-chords') && !body.classList.contains('piano-open') && !body.classList.contains('sheet-playing');
  const away = (on) => {
    body.classList.toggle('bars-away', on);
    if (on && !store.get('barsHintShown', false)) { store.set('barsHintShown', true); toast(tr('Tap the sheet to show the toolbar')); }
  };
  let lastY = window.scrollY;
  const onScroll = () => {
    const y = window.scrollY;
    if (y <= 40) { body.classList.remove('bars-away'); lastY = y; return; }
    if (y < lastY) { lastY = y; return; }
    if (y - lastY < 8) return;
    lastY = y;
    if (usable() && !body.classList.contains('bars-away')) away(true);
  };
  const onTap = () => {
    if (!usable()) return;
    if (body.classList.contains('bars-away')) away(false);
    else if (window.scrollY > 40) away(true);
  };
  const host = pane.querySelector('.sheet-host');
  window.addEventListener('scroll', onScroll, {passive: true});
  host.addEventListener('click', onTap);
  return () => { window.removeEventListener('scroll', onScroll); host.removeEventListener('click', onTap); body.classList.remove('bars-away'); };
}

// two fingers apart or together: the sheet is drawn again at the new size, so the music reflows instead of running off
// the screen (where the page itself cannot be zoomed: the Android viewer)
function pinchToZoom(el, getScale, setScale) {
  const dist = (t) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
  let pinch = null;
  const start = (e) => { if (e.touches.length === 2) pinch = {d: dist(e.touches), s: getScale(), f: 1}; };
  const move = (e) => {
    if (!pinch || e.touches.length !== 2) return;
    pinch.f = dist(e.touches) / pinch.d;
    el.style.transformOrigin = 'center top';
    el.style.transform = 'scale(' + pinch.f + ')';   // a preview while the fingers move
    e.preventDefault();
  };
  const end = (e) => {
    if (!pinch || e.touches.length >= 2) return;
    el.style.transform = '';
    const scale = Math.round(pinch.s * pinch.f / 5) * 5;
    pinch = null;
    if (scale !== getScale()) setScale(scale);
  };
  el.addEventListener('touchstart', start, {passive: true});
  el.addEventListener('touchmove', move, {passive: false});
  el.addEventListener('touchend', end);
  el.addEventListener('touchcancel', end);
  return () => {
    el.removeEventListener('touchstart', start); el.removeEventListener('touchmove', move);
    el.removeEventListener('touchend', end); el.removeEventListener('touchcancel', end);
  };
}

// the keys of the sheet (a computer, or a tablet with a keyboard)
export function sheetKeys(getSheet) {
  const with_ = (fn) => () => { const s = getSheet(); if (s) fn(s); };
  return {
    p: with_((s) => s.set({guitar: false})),
    g: with_((s) => s.set({guitar: true})),
    h: with_((s) => s.set({staff: !s.state.staff})),
    b: with_((s) => s.set({hands: !s.state.hands})),
    m: with_((s) => s.togglePlay()),
    e: with_((s) => s.setEdit(!document.body.classList.contains('editing-chords'))),
    o: with_((s) => s.set({original: !s.state.original})),
    '+': with_((s) => s.set({shift: s.state.shift + 1})),
    '=': with_((s) => s.set({shift: s.state.shift + 1})),
    '-': with_((s) => s.set({shift: s.state.shift - 1})),
    '0': with_((s) => s.set({shift: 0})),
    z: with_((s) => s.set({scale: s.state.scale - 5})),
    Z: with_((s) => s.set({scale: s.state.scale + 5})),
  };
}
