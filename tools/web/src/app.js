// Hymns (the web app / PWA): routing, screens and settings.
// Screens (hash URLs, so the server only serves files):
//   #/                 home: hymnals, recent, favorites
//   #/search?q=…       search results (&all=1 for every hymnal)
//   #/browse/E         a hymnal by number (&tab=cat for categories); #/browse is the current hymnal
//   #/h/E8             a hymn: lyrics and sheet (&tab=sheet on a phone; &v=guitar&t=2&staff=0&z=50 for the sheet)
//   #/sheet/E8         the sheet only, for a music stand
//   #/favorites        favorites, with import/export in the Android app's format
//   #/settings         settings, chord edits, offline, about
import * as DB from './db.js';
import {GROUPS, BY_CODE, splitId, langOf, currentCode, currentId, bookName, languageName, bookSubtitle, firstGroup} from './groups.js';
import {tr, tn, trh, num, lang, LANGS, getChoice, setChoice, applyStatic} from './i18n.js';
import {parseScripture} from './scripture.js';
import {SheetView, MAX_SHIFT, MIN_SCALE, MAX_SCALE, DEFAULT_SCALE, prefetchAll} from './sheet.js';
import {createEditor} from './editor.js';
import * as Edits from './edits.js';
import * as Player from './player.js';

// ---- small helpers ----

const $ = (sel, root = document) => root.querySelector(sel);

// h('div', {class: 'x', onclick: f}, child, 'text', [more]) -> element
function h(tag, attrs, ...children) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (k === 'class') e.className = v;
    else if (k === 'html') e.innerHTML = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
    else e.setAttribute(k, v === true ? '' : v);
  }
  append(e, children);
  return e;
}

function append(e, children) {
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    e.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return e;
}

const ICONS = {
  down: '<path d="M6 9l6 6 6-6"/>',
  up: '<path d="M6 15l6-6 6 6"/>',
  prev: '<path d="M15 5l-7 7 7 7"/>',
  next: '<path d="M9 5l7 7-7 7"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/>',
  star: '<path d="M12 3.5l2.6 5.3 5.9.9-4.2 4.1 1 5.8-5.3-2.8-5.3 2.8 1-5.8-4.2-4.1 5.9-.9z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2.2M12 19.3v2.2M4.6 4.6l1.6 1.6M17.8 17.8l1.6 1.6M2.5 12h2.2M19.3 12h2.2M4.6 19.4l1.6-1.6M17.8 6.2l1.6-1.6"/>',
  moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>',
  expand: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
  zoomIn: '<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2M8 11h6M11 8v6"/>',
  zoomOut: '<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2M8 11h6"/>',
  print: '<path d="M7 9V3.5h10V9M7 17H4.5V10h15v7H17M7 14h10v6.5H7z"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  book: '<path d="M4 4.5h6a2 2 0 0 1 2 2V20a1.5 1.5 0 0 0-1.5-1.5H4zM20 4.5h-6a2 2 0 0 0-2 2V20a1.5 1.5 0 0 1 1.5-1.5H20z"/>',
  reset: '<path d="M4 12a8 8 0 1 0 2.4-5.7M4 4v4.5h4.5"/>',
  paper: '<circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor"/>',
  keyboard: '<rect x="2.5" y="6" width="19" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10"/>',
  textSmaller: '<path d="M3 18l4.5-11L12 18M4.6 14h5.8M15 13h6"/>',
  textBigger: '<path d="M3 18l4.5-11L12 18M4.6 14h5.8M15 13h6M18 10v6"/>',
  home: '<path d="M4 11l8-6.5 8 6.5M6 9.5V20h12V9.5"/>',
  // the Android app's gear (res/drawable/ic_settings_white_48dp.xml), filled
  settings: '<path fill="currentColor" stroke="none" fill-rule="evenodd" d="M19.1,12.9a2.8,2.8 0,0 0,0.1 -0.9,2.8 2.8,0 0,0 -0.1,-0.9l2.1,-1.6a0.7,0.7 0,0 0,0.1 -0.6L19.4,5.5a0.7,0.7 0,0 0,-0.6 -0.2l-2.4,1a6.5,6.5 0,0 0,-1.6 -0.9l-0.4,-2.6a0.5,0.5 0,0 0,-0.5 -0.4H10.1a0.5,0.5 0,0 0,-0.5 0.4L9.3,5.4a5.6,5.6 0,0 0,-1.7 0.9l-2.4,-1a0.4,0.4 0,0 0,-0.5 0.2l-2,3.4c-0.1,0.2 0,0.4 0.2,0.6l2,1.6a2.8,2.8 0,0 0,-0.1 0.9,2.8 2.8,0 0,0 0.1,0.9L2.8,14.5a0.7,0.7 0,0 0,-0.1 0.6l1.9,3.4a0.7,0.7 0,0 0,0.6 0.2l2.4,-1a6.5,6.5 0,0 0,1.6 0.9l0.4,2.6a0.5,0.5 0,0 0,0.5 0.4h3.8a0.5,0.5 0,0 0,0.5 -0.4l0.3,-2.6a5.6,5.6 0,0 0,1.7 -0.9l2.4,1a0.4,0.4 0,0 0,0.5 -0.2l2,-3.4c0.1,-0.2 0,-0.4 -0.2,-0.6ZM12,15.6A3.6,3.6 0,1 1,15.6 12,3.6 3.6,0 0,1 12,15.6Z"/>',
  copy: '<rect x="8.5" y="8.5" width="11" height="11" rx="2"/><path d="M15.5 8.5V6a1.5 1.5 0 0 0-1.5-1.5H6A1.5 1.5 0 0 0 4.5 6v8A1.5 1.5 0 0 0 6 15.5h2.5"/>',
  share: '<path d="M12 3.5v11M8 7.5l4-4 4 4M5.5 12v6.5a1.5 1.5 0 0 0 1.5 1.5h10a1.5 1.5 0 0 0 1.5-1.5V12"/>',
  play: '<path d="M8 5.5v13l10.5-6.5z"/>',
  pause: '<path d="M8.5 5.5v13M15.5 5.5v13"/>',
};

function icon(name, label) {
  return h('span', {class: 'icon', 'aria-hidden': label ? null : 'true', html:
    `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${ICONS[name]}</svg>`});
}

const store = {
  get(key, fallback) {
    try {
      const v = localStorage.getItem('hfw.' + key);
      return v == null ? fallback : JSON.parse(v);
    } catch (e) {
      return fallback;
    }
  },
  set(key, value) {
    try { localStorage.setItem('hfw.' + key, JSON.stringify(value)); } catch (e) { /* private mode */ }
  },
};

function groupStyle(code) {
  const g = BY_CODE[code];
  return `--gd:${g.day};--gn:${g.night}`;
}

function chip(code, text) {
  return h('span', {class: 'chip', style: groupStyle(code)}, text || code);
}

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => t.classList.remove('show'), 1800);
}

const wide = window.matchMedia('(min-width: 1080px)');

// ---- settings ----

// What this device saved under the old codes of three hymnals (MY, R, FY; 2026-11) gets the new codes, once
function migrateStoredCodes() {
  if (store.get('codesMigrated2026_11', false)) return;
  const group = store.get('group', null);
  if (group && currentCode(group) && currentCode(group) !== group) store.set('group', currentCode(group));
  for (const key of ['recent', 'favorites']) {
    const ids = store.get(key, null);
    if (Array.isArray(ids)) store.set(key, [...new Set(ids.map(currentId))]);
  }
  const hiddenCodes = store.get('hidden', null);
  if (Array.isArray(hiddenCodes)) store.set('hidden', [...new Set(hiddenCodes.map((c) => currentCode(c) || c))]);
  store.set('codesMigrated2026_11', true);
}
migrateStoredCodes();

// a new person starts in the first book of the app's language (Android's first_hymn): C1 in Traditional Chinese, S1 in Spanish...
let currentGroup = store.get('group', null);
if (!BY_CODE[currentGroup]) currentGroup = firstGroup();

function setGroup(code) {
  currentGroup = code;
  store.set('group', code);
  const btn = $('#hymnalBtn');
  btn.setAttribute('style', groupStyle(code));
  $('#hymnalName').textContent = BY_CODE[code].name;
  $('#hymnalBtn .dot').dataset.code = code;
  $('#q').placeholder = window.innerWidth < 420 && /^(fr|es)/.test(lang) || window.innerWidth < 360 ? tr('No. or words') : window.innerWidth < 720 ? tr('Number or words')
    : tr('Search {0} by number, or any hymnal by words', BY_CODE[code].name);
}

function applyTheme() {
  const t = store.get('theme', null);
  if (t) document.documentElement.dataset.theme = t;
  else delete document.documentElement.dataset.theme;
}

function isDark() {
  const t = document.documentElement.dataset.theme;
  return t ? t !== 'light' : window.matchMedia('(prefers-color-scheme: dark)').matches;
}

// 'light', 'dark', 'black', or null to follow the device
function setTheme(t) {
  store.set('theme', t);
  applyTheme();
  themeListeners.forEach((f) => f());
}

const LYRIC_SIZES = [0.9, 1, 1.12, 1.25, 1.4, 1.6, 1.85];
let lyricSize = store.get('lyricSize', 2);

function setLyricSize(i) {
  lyricSize = Math.max(0, Math.min(LYRIC_SIZES.length - 1, i));
  store.set('lyricSize', lyricSize);
  document.documentElement.style.setProperty('--lyric-scale', LYRIC_SIZES[lyricSize]);
}

// hymnals switched off in the settings (as in the Android app, Indonesian is off until switched on)
let hidden = new Set(store.get('hidden', ['I']));
function isShown(code) { return !hidden.has(code); }
function setHidden(code, off) {
  if (off) hidden.add(code); else hidden.delete(code);
  store.set('hidden', [...hidden]);
}
function shownGroups() {
  const counts = DB.groupCounts();
  return GROUPS.filter((g) => counts[g.code] && isShown(g.code));
}

// a single chorus is printed after every stanza, as in the printed hymnal and the Android app
let repeatChorus = store.get('repeatChorus', true);

// keep the screen on while the app is open (Screen Wake Lock; iOS 18.4+ for a home-screen app)
let keepAwake = store.get('keepAwake', false);
// the other languages row: one row that scrolls (phones), or all of them below each other; one choice for every hymn
let familyOpen = store.get('familyOpen', false);
// the button on the lower right after a switch to another language: {back: the hymn just left, at: the hymn shown now}.
// It goes as soon as any other hymn is shown (the Android app's back-to-hymn button).
let swapBack = null;
let wakeLock = null;
async function updateWakeLock() {
  try {
    if (keepAwake && document.visibilityState === 'visible' && 'wakeLock' in navigator) {
      if (!wakeLock) {
        wakeLock = await navigator.wakeLock.request('screen');
        wakeLock.addEventListener('release', () => { wakeLock = null; });
      }
    } else if (wakeLock) {
      await wakeLock.release();
      wakeLock = null;
    }
  } catch (e) { wakeLock = null; }
}

function remember(id) {
  const recent = store.get('recent', []).filter((x) => x !== id);
  recent.unshift(id);
  store.set('recent', recent.slice(0, 30));
}

function favorites() { return store.get('favorites', []); }

function toggleFavorite(id) {
  let favs = favorites();
  const on = !favs.includes(id);
  favs = on ? [id, ...favs] : favs.filter((x) => x !== id);
  store.set('favorites', favs);
  toast(on ? tr('{0} added to favorites', id) : tr('{0} removed from favorites', id));
  return on;
}

// ---- routing ----

let route = null;      // {parts, params}
let cleanup = null;    // the current screen's teardown

function parseHash() {
  const raw = decodeURI(location.hash.slice(1)) || '/';
  const i = raw.indexOf('?');
  const path = i < 0 ? raw : raw.slice(0, i);
  return {parts: path.split('/').filter(Boolean), params: new URLSearchParams(i < 0 ? '' : raw.slice(i + 1))};
}

function href(path, params) {
  const qs = params && [...Object.entries(params)].filter(([, v]) => v != null && v !== '')
    .map(([k, v]) => k + '=' + encodeURIComponent(v)).join('&');
  return '#' + path + (qs ? '?' + qs : '');
}

// how many screens deep we are in this visit: the back button shows when there is somewhere to go back to
// (a home-screen app on iPhone has no browser back button)
function depth() { return (history.state && history.state.n) || 0; }
let shownDepth = 0;

// draws the new screen straight away (a key pressed right after still goes to the new screen)
function go(url) {
  if (location.hash !== url) history.pushState({n: depth() + 1}, '', url);
  render();
}

// change the URL without drawing the screen again (sheet settings, tabs, search text)
function quietly(url) {
  history.replaceState(history.state, '', url);
  route = parseHash();
}

function goBack() {
  if (depth() > 0) history.back();
  else go('#/');
}

function render() {
  route = parseHash();
  if (cleanup) { cleanup(); cleanup = null; }
  const view = $('#view');
  view.innerHTML = '';
  view.className = '';
  document.body.classList.remove('sheet-only');
  const [screen, arg] = route.parts;
  if (screen !== 'h' && screen !== 'sheet') swapBack = null;   // a detour (home, search, settings) ends the back-to-hymn button
  let title = tr('Hymns');
  try {
    if (!screen) {
      homeScreen(view);
    } else if (screen === 'search') {
      searchScreen(view, route.params.get('q') || '');
      title = tr('Search') + ' · ' + title;
    } else if (screen === 'browse' && (!arg || BY_CODE[arg.toUpperCase()])) {
      const code = arg ? arg.toUpperCase() : currentGroup;
      browseScreen(view, code);
      title = BY_CODE[code].name + ' · ' + title;
    } else if (screen === 'favorites') {
      favoritesScreen(view);
      title = tr('Favorites') + ' · ' + title;
    } else if (screen === 'settings') {
      settingsScreen(view);
      title = tr('Settings') + ' · ' + title;
    } else if ((screen === 'h' || screen === 'sheet') && arg) {
      const hymn = DB.hymn(arg);
      if (!hymn) {
        notFound(view, arg);
      } else {
        if (hymn.id !== arg) { quietly(href('/' + screen + '/' + hymn.id, Object.fromEntries(route.params))); }
        if (screen === 'h') hymnScreen(view, hymn);
        else sheetScreen(view, hymn);
        title = hymn.id + ' · ' + (hymn.first || '') + ' · ' + tr('Hymns');
      }
    } else if (splitId(screen)) {
      quietly(href('/h/' + screen.toUpperCase()));
      return render();
    } else {
      notFound(view, screen);
    }
  } catch (e) {
    console.error(e);
    view.appendChild(h('div', {class: 'empty'}, h('h2', null, tr('Something went wrong')), h('p', null, String(e))));
  }
  document.title = title;
  if (screen !== 'search') $('#q').value = '';
  shownDepth = depth();
  $('#backBtn').hidden = !screen || shownDepth === 0;
  const tab = !screen ? 'home' : ['browse', 'favorites', 'settings'].includes(screen) ? screen : null;
  $('#favoritesTop').classList.toggle('current', tab === 'favorites');
  $('#settingsTop').classList.toggle('current', tab === 'settings');
  window.scrollTo(0, 0);
}

function notFound(view, what) {
  view.appendChild(h('div', {class: 'empty'},
    h('h2', null, tr('No hymn “{0}”', what)),
    h('p', null, tr('It may have been removed or renumbered. '), h('a', {href: '#/'}, tr('Back to the start')))));
}

// ---- home ----

// iPhone and iPad: Safari has no install prompt, so say how (until it is installed or the hint is closed)
function installHint() {
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const installed = navigator.standalone || window.matchMedia('(display-mode: standalone)').matches;
  if (installed || store.get('installHintClosed', false)) return null;
  if (!ios && !deferredInstall) return null;
  const box = h('section', {class: 'install card'},
    h('img', {src: 'icons/apple-touch-icon.png', alt: '', width: 44, height: 44}),
    h('div', null,
      h('b', null, tr('Install Hymns on this {0}', tr(ios ? (/iPad/.test(navigator.userAgent) ? 'iPad' : 'iPhone') : 'device'))),
      ios ? h('p', null, trh('Tap {0} Share, then {1}. It opens like an app and works without internet.', icon('share'), h('b', null, tr('Add to Home Screen'))))
        : h('p', null, trh('It opens like an app and works without internet. {0}',
          h('button', {class: 'link', onclick: async () => { deferredInstall.prompt(); deferredInstall = null; box.remove(); }}, tr('Install'))))),
    h('button', {class: 'icon-btn', 'aria-label': tr('Close'), onclick: () => { store.set('installHintClosed', true); box.remove(); }}, icon('close')));
  return box;
}

let deferredInstall = null;   // Chrome/Android's install prompt, kept for the hint's Install button

function homeScreen(view) {
  const counts = DB.groupCounts();
  const recent = store.get('recent', []).filter((id) => DB.exists(id)).slice(0, 8);
  const favs = favorites().filter((id) => DB.exists(id)).slice(0, 8);

  const list = (ids) => h('ul', {class: 'hymn-list'}, ids.map((id) => hymnRow(DB.hymn(id))));
  const touch = window.matchMedia('(pointer: coarse)').matches;

  view.appendChild(h('div', {class: 'home'},
    installHint(),
    (recent.length || favs.length) ? null : h('section', {class: 'hero'},   // first-run hint only
      h('h1', null, tr('Hymns')),
      h('p', null, trh('Type a number to open it in {0}, or a few words from any line to search every hymnal.', h('b', null, BY_CODE[currentGroup].name))),
      h('div', {class: 'hero-tips'},
        h('button', {class: 'tip', onclick: () => go('#/h/' + currentGroup + '1')}, currentGroup + ' 1'),
        h('button', {class: 'tip', onclick: () => searchFor('blessings flow')}, '“blessings flow”'),
        h('button', {class: 'tip', onclick: () => searchFor('NS 151')}, 'NS 151'),
        touch ? null : h('button', {class: 'tip', onclick: () => $('#helpDialog').showModal()}, icon('keyboard'), tr('Shortcuts')))),
    // Favorites always shows (also empty): on phones it is the way to the Favorites page and its import
    h('div', {class: 'home-lists'},
      h('section', {class: 'card'}, h('h2', null, icon('star'), tr('Favorites'),
        h('a', {class: 'link small', href: '#/favorites'}, favs.length ? tr('All') : tr('Import'))),
        favs.length ? list(favs) : h('p', {class: 'muted small home-empty'},
          tr('Tap the star on a hymn to keep it here, or import your favorites from the Android app.'))),
      recent.length ? h('section', {class: 'card'}, h('h2', null, tr('Recently opened'),
        h('button', {class: 'link small', onclick: () => { store.set('recent', []); render(); }}, tr('Clear'))), list(recent)) : null),
    h('section', {class: 'hymnals'},
      h('h2', null, tr('Hymnals')),
      h('div', {class: 'hymnal-grid'}, shownGroups().map((g) =>
        h('a', {class: 'hymnal-card' + (g.code === currentGroup ? ' current' : ''), href: '#/browse/' + g.code,
          style: groupStyle(g.code)},
          h('span', {class: 'code'}, g.code),
          h('span', {class: 'name', dir: 'auto'}, g.name),
          h('span', {class: 'count'}, bookSubtitle(g.code, tn('{0} hymn', '{0} hymns', counts[g.code])))))))));
}

function hymnRow(hm, extra) {
  return h('li', null, h('a', {href: '#/h/' + hm.id, class: 'hymn-row'},
    chip(hm.group || splitId(hm.id).group, hm.id),
    h('span', {class: 'first', lang: langOf(hm.group || splitId(hm.id).group)}, hm.first || hm.line || ''),
    extra));
}

// ---- search ----

function searchFor(text) {
  $('#q').value = text;
  go(href('/search', {q: text}));
}

function highlight(text, words) {
  // normalise character by character, remembering where each normalised character came from
  let n = '';
  const map = [];
  for (let i = 0; i < text.length;) {
    const cp = text.codePointAt(i);
    const ch = String.fromCodePoint(cp);
    let c = ch.normalize('NFD').replace(/[̀-ͯ]/g, '').normalize('NFC').toLowerCase().replace(/ς/g, 'σ');
    if (!/^[\p{L}\p{M}\p{N}]+$/u.test(c)) c = ' ';
    if (!(c === ' ' && n.endsWith(' '))) for (const x of c) { n += x; map.push([i, i + ch.length]); }
    i += ch.length;
  }
  // the words together where they are together, else each word
  const phrase = words.join(' ');
  const parts = words.length > 1 && n.includes(phrase) ? [phrase] : words;
  const ranges = [];
  for (const w of parts) {
    const whole = DB.isShortWord(w);
    for (let at = n.indexOf(w); at >= 0 && w; at = n.indexOf(w, at + w.length)) {
      if (whole && ((at > 0 && n[at - 1] !== ' ') || (at + w.length < n.length && n[at + w.length] !== ' '))) continue;
      ranges.push([map[at][0], map[at + w.length - 1][1]]);
    }
  }
  ranges.sort((a, b) => a[0] - b[0]);
  const frag = document.createDocumentFragment();
  let pos = 0;
  for (const [s, e] of ranges) {
    if (s < pos) continue;
    frag.appendChild(document.createTextNode(text.slice(pos, s)));
    frag.appendChild(h('mark', null, text.slice(s, e)));
    pos = e;
  }
  frag.appendChild(document.createTextNode(text.slice(pos)));
  return frag;
}

// the second line of a result: why it matched, when it was not its first line (HYMNAL_SPEC.md §9.3)
function whyLine(r, words) {
  if (r.where === 'first') return null;
  const x = DB.hymn(r.id);
  if (!x) return null;
  const join = (sep, ...parts) => parts.map((p) => (p || '').trim()).filter(Boolean).join(sep);
  const label = (l, v) => (v || '').trim() ? tr(l, v.trim()) : '';
  switch (r.where) {
    case 'chorus': return {text: x.chorus || ''};
    case 'subject': return {text: tr('Subject: {0}', join(' – ', x.category, x.subcategory))};
    case 'people': return {text: join(' · ', label('Author: {0}', x.author), label('Composer: {0}', x.composer))};
    case 'music': return {text: join(' · ', label('Key: {0}', x.key), label('Tune: {0}', x.tune))};
    default: {
      const line = DB.matchLine(r.id, words);
      return line ? {text: line, lyrics: true} : null;
    }
  }
}

function searchScreen(view, q) {
  const all = route.params.get('all') === '1';
  const only = ['music', 'people'].includes(route.params.get('in')) ? route.params.get('in') : null;
  const box = h('div', {class: 'search'});
  view.appendChild(box);
  // keep what is being typed (a space at the end); the URL has the text trimmed
  if ($('#q').value.trim() !== q) $('#q').value = q;
  const pq = DB.parseQuery(q, currentGroup);

  if (pq.id) {
    const main = DB.hymn(pq.id);
    box.appendChild(h('h1', {class: 'results-title'}, main ? tr('Go to {0}', main.id) : tr('No hymn {0}', pq.id)));
    if (main) box.appendChild(h('ul', {class: 'hymn-list big'}, hymnRow(main, h('span', {class: 'enter'}, 'Enter ↵'))));
    if (pq.number) {
      const no = pq.id.replace(/^\D+/, '');
      const others = shownGroups().filter((g) => g.code !== currentGroup).map((g) => DB.hymn(g.code + no)).filter(Boolean);
      if (others.length) {
        box.appendChild(h('h2', {class: 'results-sub'}, tr('Number {0} in other hymnals', no)));
        box.appendChild(h('ul', {class: 'hymn-list'}, others.map((o) => hymnRow(o))));
      }
    }
    return;
  }
  if (!pq.words.length) {
    box.appendChild(h('div', {class: 'empty'}, h('p', null, tr('Type a number or some words.'))));
    return;
  }

  const t0 = performance.now();
  const found = DB.search(pq.words, pq.phrase, currentGroup, 3000, only).filter((r) => isShown(r.group) || r.group === currentGroup);
  const inGroup = found.filter((r) => r.group === currentGroup);
  const showAll = all || !inGroup.length;
  const results = showAll ? found : inGroup;
  const ms = Math.round(performance.now() - t0);

  box.appendChild(h('div', {class: 'results-head'},
    h('div', {class: 'seg', role: 'group'},
      h('a', {href: href('/search', {q, in: only}), class: !showAll ? 'on' : '', 'aria-disabled': inGroup.length ? null : 'true'},
        BY_CODE[currentGroup].name, h('span', {class: 'n'}, inGroup.length)),
      h('a', {href: href('/search', {q, all: 1, in: only}), class: showAll ? 'on' : ''}, tr('All hymnals'),
        h('span', {class: 'n'}, found.length))),
    h('span', {class: 'muted small', title: ms + ' ms'}, found.length >= 3000 ? tr('showing the first {0}', num(3000)) : '')));

  if (!results.length) {
    box.appendChild(h('div', {class: 'empty'}, h('p', null, tr('Nothing found for “{0}”.', q))));
    return;
  }
  const ul = h('ul', {class: 'hymn-list results'});
  box.appendChild(ul);
  let shown = 0;
  const more = h('button', {class: 'more', onclick: () => page()}, tr('Show more'));
  function page() {
    const next = results.slice(shown, shown + 60);
    for (const r of next) {
      const first = r.line || '';
      const why = whyLine(r, pq.words);
      ul.appendChild(h('li', null, h('a', {href: '#/h/' + r.id, class: 'hymn-row'},
        chip(r.group, r.id),
        h('span', {class: 'first', lang: langOf(r.group)}, highlight(first, pq.words)),
        why && DB.norm(why.text) !== DB.norm(first)
          ? h('span', {class: 'snippet', lang: langOf(r.group)}, why.lyrics ? '… ' : '', highlight(why.text, pq.words), why.lyrics ? ' …' : '')
          : null)));
    }
    shown += next.length;
    if (shown >= results.length) more.remove();
  }
  page();
  if (shown < results.length) box.appendChild(more);
}

// ---- browse ----

function browseScreen(view, code) {
  const g = BY_CODE[code];
  if (code !== currentGroup) setGroup(code);
  const tab = route.params.get('tab') === 'cat' ? 'cat' : 'no';
  const hymns = DB.list(code);
  const page = h('div', {class: 'browse', style: groupStyle(code)});
  view.appendChild(page);
  page.appendChild(h('header', {class: 'browse-head'},
    h('h1', null, chip(code), ' ', g.name),
    h('p', {class: 'muted'}, bookSubtitle(code, tn('{0} hymn', '{0} hymns', hymns.length))),
    h('div', {class: 'seg'},
      h('a', {href: href('/browse/' + code), class: tab === 'no' ? 'on' : ''}, tr('By number')),
      h('a', {href: href('/browse/' + code, {tab: 'cat'}), class: tab === 'cat' ? 'on' : ''}, tr('By category')))));

  if (tab === 'no') {
    page.appendChild(h('div', {class: 'numbers', dir: 'ltr'}, hymns.map((x) =>
      h('a', {href: '#/h/' + x.id, title: x.first || ''}, x.no))));
    return;
  }
  const cats = DB.categories(code);
  page.appendChild(h('div', {class: 'cats', dir: g.rtl ? 'rtl' : null, lang: langOf(code)}, cats.map((c) =>
    h('details', {class: 'card', open: cats.length <= 3 ? true : null},
      h('summary', null, c.name, h('span', {class: 'n'}, c.subs.reduce((n, s) => n + s.hymns.length, 0))),
      c.subs.map((s) => [
        s.name ? h('h3', null, s.name) : null,
        h('ul', {class: 'hymn-list'}, s.hymns.map((x) => hymnRow({id: x.id, group: code, first: x.first}))),
      ])))));
}

// ---- a hymn ----

// stanza markup -> nodes: only line breaks, italics and underlines are kept
function richText(html) {
  const doc = new DOMParser().parseFromString('<div>' + (html || '').replace(/<!--[\s\S]*?-->/g, '') + '</div>', 'text/html');
  const out = document.createDocumentFragment();
  (function walk(src, dst) {
    for (const n of src.childNodes) {
      if (n.nodeType === 3) dst.appendChild(document.createTextNode(n.textContent));
      else if (n.nodeName === 'BR') dst.appendChild(document.createElement('br'));
      // italics across a line break are dropped: lines are split at top-level breaks
      else if (['I', 'EM', 'U', 'B', 'STRONG'].includes(n.nodeName) && !n.querySelector('br')) walk(n, dst.appendChild(document.createElement(n.nodeName.toLowerCase())));
      else if (n.nodeType === 1) walk(n, dst);
    }
  })(doc.body.firstChild, out);
  // one block per line, so a line too long for the screen wraps with a hanging indent
  const lines = document.createDocumentFragment();
  let line = null;
  for (const n of [...out.childNodes]) {
    if (n.nodeName === 'BR') { line = null; continue; }
    if (!line) line = lines.appendChild(h('div', {class: 'line'}));
    line.appendChild(n);
  }
  for (const l of [...lines.childNodes]) if (!l.textContent.trim()) l.remove();
  return lines;
}

function stanzaKind(no) {
  const n = (no || '').toLowerCase();
  if (n === 'chorus') return 'chorus';
  if (/note/.test(n) || n === 'copyright') return 'note';
  return 'verse';
}

// the stanzas as the app shows them: a hymn with one chorus has it after every stanza that follows it
function lyricsNode(hymn) {
  const g = BY_CODE[hymn.group];
  const box = h('div', {class: 'lyrics' + (g.cjk ? ' cjk' : ''), dir: g.rtl ? 'rtl' : null, lang: langOf(hymn.group)});
  if (!hymn.stanzas.length) box.appendChild(h('p', {class: 'muted'}, tr('No lyrics for this hymn.')));
  const choruses = hymn.stanzas.filter((s) => stanzaKind(s.no) === 'chorus');
  const repeat = repeatChorus && choruses.length === 1;
  let chorus = null;
  const node = (s, kind, again) => h('div', {class: 'stanza ' + kind + (again ? ' again' : '')},
    h('div', {class: 'no'}, kind === 'verse' && s.no !== '-' ? s.no : ''),
    h('div', {class: 'text'}, s.note ? h('div', {class: 'stanza-note'}, s.note) : null, richText(s.text)));
  for (const s of hymn.stanzas) {
    const kind = stanzaKind(s.no);
    box.appendChild(node(s, kind, false));
    if (kind === 'chorus') chorus = s;
    else if (kind === 'verse' && repeat && chorus) box.appendChild(node(chorus, 'chorus', true));
  }
  return box;
}

// the lyrics as plain text, for the clipboard
function lyricsText(hymn) {
  const out = [hymn.id + (hymn.first ? ' · ' + hymn.first : ''), ''];
  for (const s of hymn.stanzas) {
    const kind = stanzaKind(s.no);
    if (kind === 'verse') out.push(s.no);
    else if (kind === 'chorus') out.push(s.note ? '(' + s.note + ')' : '');
    out.push(DB.plain(s.text), '');
  }
  return out.filter((l, i, a) => !(l === '' && a[i - 1] === '')).join('\n').trim() + '\n';
}

// the Search row of the links card: YouTube and SoundCloud searches for the hymn, the words made as the Android app's
// YouTube button does (YouTubeSearchLauncher.searchFor). English and New Songs recordings are titled with the number
// ("Hymn 313", "NS 46"); the other books use the first stanza line and the first chorus line.
function searchWords(hymn) {
  const first = hymn.first || '', chorus = hymn.chorus || '';
  const prefix = {E: 'Hymn ', NS: 'NS '}[hymn.group.toUpperCase()];
  const query = prefix && hymn.no ? prefix + hymn.no + ' ' + first : (first ? first + ' ' : '') + chorus;
  // the Android app's punctuation, plus ? ’, the full-width marks and CJK brackets; the marks are removed (heav'n -> heavn); runs of spaces count as one, so no "++"
  return query.replace(/[+.;!?"':,\u2019\uff0c\uff1b\uff1f\uff01\u3002\uff0e\u3001\u300c\u300d\u300e\u300f\u3010\u3011\u300a\u300b]/g, '').trim().replace(/\s+/g, '+');
}
const youtubeSearchUrl = (hymn) => 'https://www.youtube.com/results?search_query=' + searchWords(hymn);
const soundcloudSearchUrl = (hymn) => 'https://soundcloud.com/search/sounds?q=' + searchWords(hymn);

// the Share button (as the Android one): a small menu under it. Where the browser can share (phones, tablets, Safari,
// Edge) it offers Share lyrics, Share link and Copy lyrics; elsewhere Copy lyrics and Copy link.
const hymnLink = (hymn) => hymn.id + (hymn.first ? ' \u00b7 ' + hymn.first : '') + '\n' + WEB_URL + '#/h/' + hymn.id;
async function copyText(text, done) {
  try { await navigator.clipboard.writeText(text); toast(done); } catch (e) { toast(tr('Could not copy')); }
}
async function shareNow(text, title) {
  try { await navigator.share({title, text}); } catch (e) { if (e.name !== 'AbortError') toast(tr('Could not share')); }
}
function shareMenu(hymn, anchor) {
  document.querySelector('.share-menu')?.remove();
  const title = hymn.id + (hymn.first ? ' \u00b7 ' + hymn.first : '');
  const items = navigator.share
    ? [[tr('Share lyrics'), () => shareNow(lyricsText(hymn), title)], [tr('Share link'), () => shareNow(hymnLink(hymn), title)], [tr('Copy lyrics'), () => copyLyrics(hymn)]]
    : [[tr('Copy lyrics'), () => copyLyrics(hymn)], [tr('Copy link'), () => copyText(hymnLink(hymn), tr('Link copied'))]];
  const menu = h('div', {class: 'share-menu', role: 'menu'}, items.map(([label, fn]) =>
    h('button', {role: 'menuitem', onclick: () => { close(); fn(); }}, label)));
  const close = () => {
    menu.remove();
    document.removeEventListener('pointerdown', away, true);
    document.removeEventListener('keydown', esc, true);
    anchor.setAttribute('aria-expanded', 'false');
  };
  const away = (e) => { if (!menu.contains(e.target) && !anchor.contains(e.target)) close(); };
  const esc = (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); anchor.focus(); } };
  document.body.appendChild(menu);
  const r = anchor.getBoundingClientRect();
  menu.style.top = (r.bottom + 4) + 'px';
  menu.style.right = Math.max(8, innerWidth - r.right) + 'px';
  anchor.setAttribute('aria-expanded', 'true');
  document.addEventListener('pointerdown', away, true);
  document.addEventListener('keydown', esc, true);
  menu.querySelector('button').focus();
}

async function copyLyrics(hymn) {
  try {
    await navigator.clipboard.writeText(lyricsText(hymn));
    toast(tr('Lyrics copied'));
  } catch (e) {
    toast(tr('Could not copy the lyrics'));
  }
}

// the Bible references as links to the Recovery Version text (as hymnal.net does); a part that can't be read stays text
function scriptureNode(verses) {
  const refs = parseScripture(verses);
  if (!refs.length) return null;
  return h('span', {class: 'scripture'}, refs.map((r, i) => [i ? ', ' : '',
    r.url ? h('a', {href: r.url, target: '_blank', rel: 'noopener', title: tr('Open in the Recovery Version')}, r.text) : r.text]));
}

function metaNode(hymn) {
  // each value but the scripture opens the search (all hymnals) for it; a person without the life dates
  // and only in its own column of the search table (music, people): 4/4 is a time there, but a scripture reference
  // in a subject or the lyrics (&in=, dropped as soon as the words are edited)
  const find = (value, words, column) => h('a', {href: href('/search', {q: '"' + (words || value).replace(/"/g, '') + '"', all: 1, in: column})}, value);
  const person = (p) => p && find(p, p.replace(/\s*\([^)]*\)/g, '').replace(/,\s*v\.\s*\d+.*$/, '').trim(), 'people');
  const plain = (v) => v && find(v, null, 'music');
  const items = [
    [tr('Author'), person(hymn.author)], [tr('Composer'), person(hymn.composer)], [tr('Meter'), plain(hymn.meter)],
    [tr('Key'), plain(hymn.key)], [tr('Time'), plain(hymn.time)],
    [tr('Tune'), hymn.tune && hymn.tune.trim() !== '0' ? find(hymn.tune.trim(), null, 'music') : null],
    [tr('Scripture'), scriptureNode(hymn.verse)],
    [tr('From'), hymn.parentId && hymn.parentId !== hymn.id ? h('a', {href: '#/h/' + hymn.parentId}, hymn.parentId) : null],
  ].filter(([, v]) => v);
  return h('footer', {class: 'meta'},
    hymn.sheetId ? null : h('p', {class: 'no-sheet'}, tr('No sheet music for this hymn.')),
    items.length ? h('dl', null, items.map(([k, v]) => [h('dt', null, k), h('dd', null, v)])) : null);
}

// the card under the details for links that open outside the app (the Android app's "Listen and links" card): the
// hymn's piano videos, its parent's when it has none, then its own YouTube and SoundCloud links (the youth books), all
// from the link table, and always a YouTube search for the hymn
function linksNode(hymn) {
  const videos = DB.videos(hymn);
  // no YouTube or SoundCloud link of its own: the nearest hymn above it that has some; in another language each link
  // says which ("English ↗", "English – label ↗") so nobody takes an English recording for a Spanish one
  const up = DB.inheritedLinks(hymn);
  const language = up && (languageName(splitId(up.from).group) || DB.languageOf(splitId(up.from).group));
  const foreign = up && DB.languageOf(splitId(up.from).group) !== DB.languageOf(hymn.group);
  const ownLinks = (kind) => {
    const list = up ? up.kinds[kind] : DB.links(hymn, kind);
    const text = (v, i) => foreign
      ? (v.label ? language + ' – ' + v.label : list.length === 1 ? language : language + ' ' + (i + 1))
      : (v.label || (list.length === 1 ? tr('Link') : tr('Link {0}', i + 1)));
    return list.length ? h('span', {class: 'videos'}, list.map((v, i) => [i ? ' · ' : '',
      h('a', {href: v.url, target: '_blank', rel: 'noopener'}, text(v, i) + ' ↗')])) : null;
  };
  const tunes = DB.newTunes(hymn);
  const recordings = tunes.flatMap((t) => t.links.map((v) => ({url: v.url, text: v.label ? t.id + ' – ' + v.label : t.id})));
  const rows = [
    [tr('Piano videos'), videos.length ? h('span', {class: 'videos'}, videos.map((v, i) => [i ? ' · ' : '',
      h('a', {href: v.url, target: '_blank', rel: 'noopener'}, (v.label || tr('Video')) + ' ↗')])) : null],
    ['YouTube', ownLinks('youtube')],
    ['SoundCloud', ownLinks('soundcloud')],
    // another tune for this hymn's words: the tunes themselves (open in the app), then their recordings
    [tr('New tunes'), tunes.length ? h('span', {class: 'videos'}, tunes.map((t, i) => [i ? ' · ' : '',
      h('a', {href: '#/h/' + t.id}, t.id)])) : null],
    [tr('New tune recordings'), recordings.length ? h('span', {class: 'videos'}, recordings.map((r, i) => [i ? ' · ' : '',
      h('a', {href: r.url, target: '_blank', rel: 'noopener'}, r.text + ' ↗')])) : null],
    // every hymn has this one, so the card is on every hymn page
    [tr('Search'), h('span', {class: 'videos search'},
      h('a', {href: youtubeSearchUrl(hymn), target: '_blank', rel: 'noopener'}, 'YouTube ↗'), ' · ',
      h('a', {href: soundcloudSearchUrl(hymn), target: '_blank', rel: 'noopener'}, 'SoundCloud ↗'))],
  ].filter(([, v]) => v);
  return h('section', {class: 'card links-card'},
    h('h2', null, tr('Listen and links')),
    h('dl', null, rows.map(([k, v]) => [h('dt', null, k), h('dd', null, v)])));
}

function familyNode(hymn) {
  const fam = DB.family(hymn.id).filter((f) => f.id === hymn.id || isShown(f.group));
  if (fam.length < 2) return null;
  const nav = h('nav', {class: 'family', 'aria-label': tr('Other languages')},
    fam.map((f) => {
      const g = BY_CODE[f.group];
      const cur = f.id === hymn.id;
      return h('a', {href: href('/h/' + f.id, keepSheetParams()), class: 'fam' + (cur ? ' current' : ''),
        style: groupStyle(f.group), 'aria-current': cur ? 'page' : null, title: bookName(f.group) + ' ' + f.no,
        onclick: cur ? null : () => { swapBack = {back: hymn.id, at: f.id}; }},
      h('span', {class: 'fam-name'}, g.name), h('span', {class: 'fam-no'}, f.no));
    }));
  // too many for one row (phones): a button opens them all below each other
  const more = h('button', {type: 'button', class: 'fam-more', hidden: true, 'aria-expanded': String(familyOpen)});
  const wrap = h('div', {class: 'family-wrap' + (familyOpen ? ' open' : '')}, nav, more);
  const showMore = () => {
    more.innerHTML = '';
    more.append(icon(familyOpen ? 'up' : 'down'), h('span', null, familyOpen ? tr('Fewer') : tr('All {0}', fam.length)));
    more.setAttribute('aria-expanded', String(familyOpen));
    more.setAttribute('aria-label', familyOpen ? tr('Show one row of languages') : tr('Show all {0} languages', fam.length));
    wrap.classList.toggle('open', familyOpen);
  };
  more.addEventListener('click', () => { familyOpen = !familyOpen; store.set('familyOpen', familyOpen); showMore(); });
  showMore();
  const fits = () => {   // the button only where the row is cut off (or after it was opened)
    const cut = nav.scrollWidth > nav.clientWidth + 2 && getComputedStyle(nav).flexWrap === 'nowrap';
    more.hidden = !(cut || (familyOpen && matchMedia('(max-width: 720px)').matches));
  };
  requestAnimationFrame(() => { fits(); });
  window.addEventListener('resize', fits, {passive: true});
  const mo = new MutationObserver(() => { if (!wrap.isConnected) { window.removeEventListener('resize', fits); mo.disconnect(); } });
  mo.observe(document.getElementById('view'), {childList: true});
  return wrap;
}

// the round button on the lower right after a switch to another language: it goes back to the hymn just left
function swapBackButton(hymn) {
  if (!swapBack || swapBack.at !== hymn.id || !DB.exists(swapBack.back)) { swapBack = null; return null; }
  const back = swapBack.back;
  return h('a', {class: 'swap-back', href: '#/h/' + back, style: groupStyle(splitId(back).group),
    title: tr('Back to {0}', back), 'aria-label': tr('Back to {0}', back),
    onclick: () => { swapBack = {back: hymn.id, at: back}; }}, back);
}

// other hymns sung to this tune (the Android app's "similar tune" button), at the end of the lyrics
function sameTuneNode(hymn) {
  const list = DB.sameTune(hymn.id, isShown);
  if (!list.length) return null;
  return h('section', {class: 'same-tune'},
    h('h2', null, tr('Also sung to this tune')),
    h('ul', {class: 'hymn-list'}, list.map((x) => hymnRow(x))));
}

// the sheet and tab part of the URL, kept when moving to another hymn
function keepSheetParams() {
  const p = route ? route.params : new URLSearchParams();
  return {tab: p.get('tab')};
}

function hymnScreen(view, hymn) {
  remember(hymn.id);
  setGroup(hymn.group);
  const g = BY_CODE[hymn.group];
  const nb = DB.neighbours(hymn.id);
  const hasSheet = !!hymn.sheetId;
  let tab = route.params.get('tab') === 'sheet' && hasSheet ? 'sheet' : 'lyrics';
  const fav = favorites().includes(hymn.id);

  // the tune, looped, as in the Android app; it stops when another hymn is opened
  const tune = DB.tuneFile(hymn);
  const playBtn = h('button', {class: 'icon-btn play', title: tune ? tr('Play the tune (Space)') : tr('No tune for this hymn'),
    'aria-label': tr('Play the tune'), 'aria-pressed': 'false', disabled: tune ? null : true, onclick: () => togglePlay()});
  const showPlay = (on) => {
    playBtn.innerHTML = '';
    playBtn.appendChild(icon(on ? 'pause' : 'play'));
    playBtn.setAttribute('aria-pressed', String(on));
    playBtn.title = on ? tr('Stop (Space)') : tune ? tr('Play the tune (Space)') : tr('No tune for this hymn');
  };
  function togglePlay() {
    if (!tune) { toast(tr('Sorry, no tune for this hymn')); return; }
    if (Player.playing() === hymn.id) { Player.stop(); showPlay(false); return; }
    showPlay(true);
    Player.play(tune, hymn.id).catch(() => { showPlay(false); toast(tr('Could not play the tune')); });
  }
  showPlay(Player.playing() === hymn.id);

  const favBtn = h('button', {class: 'icon-btn' + (fav ? ' on' : ''), title: tr('Favorite (F)'), 'aria-pressed': String(fav),
    onclick: () => { const on = toggleFavorite(hymn.id); favBtn.classList.toggle('on', on); favBtn.setAttribute('aria-pressed', String(on)); }},
  icon('star'));

  const head = h('header', {class: 'hymn-head'},
    h('div', {class: 'hymn-nav'},
      h('a', {class: 'icon-btn' + (nb.prev ? '' : ' disabled'), href: nb.prev ? href('/h/' + nb.prev, keepSheetParams()) : null,
        title: nb.prev ? tr('Previous: {0} (←)', nb.prev) : null, 'aria-label': tr('Previous hymn')}, icon('prev')),
      h('a', {class: 'hymn-id', href: '#/browse/' + hymn.group, title: tr('All of {0}', g.name)},
        h('span', {class: 'hymnal'}, g.name), h('span', {class: 'hcode'}, hymn.group), h('span', {class: 'num'}, hymn.no)),
      h('a', {class: 'icon-btn' + (nb.next ? '' : ' disabled'), href: nb.next ? href('/h/' + nb.next, keepSheetParams()) : null,
        title: nb.next ? tr('Next: {0} (→)', nb.next) : null, 'aria-label': tr('Next hymn')}, icon('next')),
      h('span', {class: 'grow'}),
      h('button', {class: 'icon-btn size', title: tr('Smaller text'), onclick: () => setLyricSize(lyricSize - 1)}, icon('textSmaller')),
      h('button', {class: 'icon-btn size', title: tr('Bigger text'), onclick: () => setLyricSize(lyricSize + 1)}, icon('textBigger')),
      playBtn,
      h('button', {class: 'icon-btn share', title: tr('Share (C copies the lyrics)'), 'aria-label': tr('Share'), 'aria-haspopup': 'menu', 'aria-expanded': 'false',
        onclick: (e) => shareMenu(hymn, e.currentTarget)}, icon('share')),
      h('button', {class: 'icon-btn print', title: tr('Print'), onclick: () => window.print()}, icon('print')),
      favBtn),
    h('h1', {class: 'hymn-title' + (hymn.category ? ' with-subject' : ''), dir: g.rtl ? 'rtl' : null, lang: langOf(hymn.group)}, hymn.first || hymn.id),
    hymn.category ? h('p', {class: 'category', dir: g.rtl ? 'rtl' : null, lang: langOf(hymn.group)}, hymn.category, hymn.subcategory ? ' · ' + hymn.subcategory : '') : null,
    familyNode(hymn));

  const tabs = hasSheet ? h('div', {class: 'tabs', role: 'tablist'},
    h('button', {role: 'tab', 'data-tab': 'lyrics', onclick: () => showTab('lyrics')}, tr('Lyrics')),
    h('button', {role: 'tab', 'data-tab': 'sheet', onclick: () => showTab('sheet')}, tr('Sheet music'))) : null;

  const lyricsPane = h('section', {class: 'pane lyrics-pane'}, h('div', {class: 'lyrics-box'}, lyricsNode(hymn)), sameTuneNode(hymn), metaNode(hymn), linksNode(hymn));
  const sheetPane = hasSheet ? h('section', {class: 'pane sheet-pane'}) : null;
  const panes = h('div', {class: 'panes' + (hasSheet ? ' two' : '')}, lyricsPane, sheetPane);
  const page = h('article', {class: 'hymn', style: groupStyle(hymn.group)}, head, tabs, panes, swapBackButton(hymn));
  view.appendChild(page);

  let sheet = null;
  function ensureSheet() {
    if (sheet || !hasSheet) return;
    sheet = sheetPanel(sheetPane, hymn, {full: false});
  }
  function showTab(t) {
    tab = t;
    document.body.classList.remove('bars-away', 'tabs-away');
    page.dataset.tab = t;
    if (tabs) for (const b of tabs.children) b.setAttribute('aria-selected', String(b.dataset.tab === t));
    if (t === 'sheet' || wide.matches) ensureSheet();
    const params = Object.fromEntries(route.params);
    if (t === 'sheet') params.tab = 'sheet'; else delete params.tab;
    quietly(href('/h/' + hymn.id, params));
  }
  showTab(tab);
  const onWide = () => { if (wide.matches) ensureSheet(); };
  wide.addEventListener('change', onWide);

  // swipe left or right on the lyrics for the next or previous hymn (phones)
  let touch = null;
  const onStart = (e) => { touch = e.touches.length === 1 ? {x: e.touches[0].clientX, y: e.touches[0].clientY, t: Date.now()} : null; };
  const onEnd = (e) => {
    if (!touch) return;
    const dx = e.changedTouches[0].clientX - touch.x, dy = e.changedTouches[0].clientY - touch.y;
    if (Math.abs(dx) > 80 && Math.abs(dx) > 2 * Math.abs(dy) && Date.now() - touch.t < 600) {
      const to = dx < 0 ? nb.next : nb.prev;
      if (to) go(href('/h/' + to, keepSheetParams()));
    }
    touch = null;
  };
  lyricsPane.addEventListener('touchstart', onStart, {passive: true});
  lyricsPane.addEventListener('touchend', onEnd, {passive: true});

  const body = document.body;

  keys = {
    ArrowLeft: () => nb.prev && go(href('/h/' + nb.prev, keepSheetParams())),
    ArrowRight: () => nb.next && go(href('/h/' + nb.next, keepSheetParams())),
    l: () => hasSheet && showTab('lyrics'),
    s: () => hasSheet && showTab('sheet'),
    f: () => favBtn.click(),
    c: () => copyLyrics(hymn),
    ' ': () => togglePlay(),
    ...sheetKeys(() => { ensureSheet(); if (!wide.matches && tab !== 'sheet') showTab('sheet'); return sheet; }),
  };
  cleanup = () => {
    wide.removeEventListener('change', onWide);
    if (sheet) sheet.destroy();
    Player.stop();
    keys = {};
  };
}

function sheetScreen(view, hymn) {
  document.body.classList.add('sheet-only');
  remember(hymn.id);
  if (!hymn.sheetId) {
    view.appendChild(h('div', {class: 'empty'}, h('h2', null, tr('No sheet music for {0}', hymn.id)),
      h('p', null, h('a', {href: '#/h/' + hymn.id}, tr('Back to the lyrics')))));
    return;
  }
  const pane = h('section', {class: 'pane sheet-pane full', style: groupStyle(hymn.group)});
  view.appendChild(pane);
  const sheet = sheetPanel(pane, hymn, {full: true});
  const nb = DB.neighbours(hymn.id);
  const same = () => {
    const p = Object.fromEntries(route.params);
    return p;
  };
  keys = {
    ArrowLeft: () => nb.prev && go(href('/sheet/' + nb.prev, same())),
    ArrowRight: () => nb.next && go(href('/sheet/' + nb.next, same())),
    Escape: () => go(href('/h/' + hymn.id)),
    ...sheetKeys(() => sheet),
  };
  cleanup = () => { sheet.destroy(); keys = {}; };
}

// ---- the sheet toolbar and view ----

// remembered between hymns: piano or guitar, the staff, the zoom. Transposition is per hymn (in the URL only).
function sheetPrefs() {
  return Object.assign({guitar: false, staff: true, scale: DEFAULT_SCALE}, store.get('sheet', {}));
}

function sheetPanel(pane, hymn, {full}) {
  const p = route.params;
  const prefs = sheetPrefs();
  const state = {
    guitar: p.has('v') ? p.get('v') === 'guitar' : prefs.guitar,
    staff: p.has('staff') ? p.get('staff') !== '0' : prefs.staff,
    shift: Math.max(-MAX_SHIFT, Math.min(MAX_SHIFT, parseInt(p.get('t') || '0', 10) || 0)),
    scale: Math.max(MIN_SCALE, Math.min(MAX_SCALE, parseInt(p.get('z') || '', 10) || prefs.scale)),
  };

  const btn = (label, title, onclick, cls = '') => h('button', {type: 'button', class: 'tb ' + cls, title, 'aria-label': title, onclick}, label);
  const bPiano = btn(tr('Piano'), tr('Piano sheet (P)'), () => set({guitar: false}));
  const bGuitar = btn(tr('Guitar'), tr('Guitar sheet (G)'), () => set({guitar: true}));
  const bDown = btn('−', tr('Transpose down a semitone (−)'), () => set({shift: state.shift - 1}), 'step');
  const bUp = btn('+', tr('Transpose up a semitone (+)'), () => set({shift: state.shift + 1}), 'step');
  const keyLabel = h('button', {type: 'button', class: 'key', title: tr('Back to the original key')}, '…');
  keyLabel.addEventListener('click', () => set({shift: 0}));
  const bStaff = btn(tr('Staff'), tr('Show or hide the staff (H)'), () => set({staff: !state.staff}), 'toggle');
  const bZoomOut = btn(icon('zoomOut'), tr('Smaller (Z)'), () => set({scale: state.scale - 5}), 'icon');
  const bZoomIn = btn(icon('zoomIn'), tr('Bigger (Shift+Z)'), () => set({scale: state.scale + 5}), 'icon');
  const bEdit = btn(tr('Edit chords'), tr('Edit the chords of the piano sheet (E)'), () => setEdit(!view.editing), 'edit');
  const bOrig = btn(tr('Original chords'), tr('Show the sheet without your chord edits (O)'), () => set({original: !state.original}), 'orig');
  bOrig.hidden = true;
  const bReset = btn(icon('reset'), tr('Original key and size'), () => set({shift: 0, scale: DEFAULT_SCALE}), 'icon');
  // dark theme only: the sheet on light paper (black on white); remembered like the zoom
  const bPaper = btn(icon('paper'), tr('Light or dark paper'), () => { store.set('sheetPaper', store.get('sheetPaper', null) === 'light' ? null : 'light'); paperLook(); }, 'icon paper');
  const other = full
    ? h('a', {class: 'tb icon', href: href('/h/' + hymn.id), title: tr('Back to the lyrics (Esc)'), 'aria-label': tr('Back to the lyrics')}, icon('close'))
    : h('a', {class: 'tb icon', href: '#', title: tr('Sheet only, for a music stand'), 'aria-label': tr('Sheet only'),
      onclick: (e) => { e.preventDefault(); go(href('/sheet/' + hymn.id, sheetParams())); }}, icon('expand'));

  const bar = h('div', {class: 'sheet-bar', role: 'toolbar', 'aria-label': tr('Sheet music')},
    h('div', {class: 'seg'}, bPiano, bGuitar),
    h('div', {class: 'transpose'}, bDown, keyLabel, bUp),
    bStaff,
    bEdit, bOrig,
    h('div', {class: 'zoom'}, bZoomOut, bZoomIn),
    bReset, bPaper,
    h('span', {class: 'grow'}),
    other);
  const note = hymn.sheetId !== hymn.id
    ? h('p', {class: 'sheet-from'}, trh('Music of {0} ({1})', h('a', {href: '#/h/' + hymn.sheetId}, hymn.sheetId), BY_CODE[splitId(hymn.sheetId).group].name),
      hymn.lyricsId ? tr(', with the words of {0}', hymn.id) : '')
    : null;
  const host = h('div', {class: 'sheet-host'});
  append(pane, [full ? h('div', {class: 'sheet-title-bar'},
    h('a', {href: href('/h/' + hymn.id)}, chip(hymn.group, hymn.id)), ' ', h('span', null, hymn.first || '')) : null, bar, note, host]);

  const view = new SheetView(host);
  // dark theme: dark paper, or light paper if the reader chose it with the paper button
  function paperLook() {
    const light = isDark() && store.get('sheetPaper', null) === 'light';
    view.root.classList.toggle('dark', isDark() && !light);
    view.root.classList.toggle('light-paper', light);
    bPaper.hidden = !isDark();
    bPaper.setAttribute('aria-pressed', String(light));
    bPaper.title = light ? tr('Dark paper') : tr('Light paper');
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

  // chord editing: only on the piano sheet with the staff shown and the edits in place
  let editor = null;
  function setEdit(on) {
    document.body.classList.remove('bars-away');
    if (on) {
      Object.assign(state, {guitar: false, staff: true, original: false});
      editor = editor || createEditor(view, {onclose: () => setEdit(false)});
      view.setEditing(true, {guitar: false, staff: true, original: false});
      editor.open();
    } else {
      if (editor) editor.close();
      view.setEditing(false);
    }
    store.set('sheet', {guitar: state.guitar, staff: state.staff, scale: state.scale});
    updateBar();
  }

  function set(changes) {
    if (view.editing && (changes.guitar || changes.staff === false || changes.original)) setEdit(false);
    Object.assign(state, changes);
    state.shift = Math.max(-MAX_SHIFT, Math.min(MAX_SHIFT, state.shift));
    state.scale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, state.scale));
    store.set('sheet', {guitar: state.guitar, staff: state.staff, scale: state.scale});
    view.set(state);
    updateBar();
    const params = Object.assign(Object.fromEntries([...route.params].filter(([k]) => !['v', 'staff', 't', 'z'].includes(k))), sheetParams());
    quietly(href('/' + route.parts[0] + '/' + hymn.id, params));
  }

  function updateBar(info = view.info) {
    bPiano.setAttribute('aria-pressed', String(!state.guitar));
    bGuitar.setAttribute('aria-pressed', String(state.guitar));
    bStaff.setAttribute('aria-pressed', String(state.staff));
    bStaff.textContent = state.staff ? tr('Hide staff') : tr('Show staff');
    bEdit.setAttribute('aria-pressed', String(view.editing));
    bEdit.textContent = view.editing ? tr('Editing chords') : tr('Edit chords');
    bOrig.hidden = !view.hasEdits();
    bOrig.setAttribute('aria-pressed', String(!!state.original));
    bDown.disabled = state.shift <= -MAX_SHIFT;
    bUp.disabled = state.shift >= MAX_SHIFT;
    bZoomOut.disabled = state.scale <= MIN_SCALE;
    bZoomIn.disabled = state.scale >= MAX_SCALE;
    bReset.hidden = !state.shift && state.scale === DEFAULT_SCALE;
    keyLabel.textContent = info.tonic ? info.tonic + (state.shift ? ' (' + (state.shift > 0 ? '+' : '') + state.shift + ')' : '') : '…';
    keyLabel.title = !state.shift ? tr('Original key') : state.shift > 0
      ? tn('Transposed up {0} semitone · click for the original key', 'Transposed up {0} semitones · click for the original key', state.shift)
      : tn('Transposed down {0} semitone · click for the original key', 'Transposed down {0} semitones · click for the original key', -state.shift);
    keyLabel.disabled = !state.shift;
  }
  view.onchange = (st, info) => updateBar(info);
  view.onedited = (kind) => { updateBar(); if (editor) editor.refresh(); };
  updateBar();
  view.show(hymn.sheetId, state, hymn.lyricsId);

  const onTheme = paperLook;
  themeListeners.add(onTheme);
  const stopHiding = hideBarsOnScroll(pane);
  return {
    set, state,
    setEdit,
    destroy() { if (editor) editor.destroy(); view.destroy(); themeListeners.delete(onTheme); stopHiding(); },
  };
}

// phones, tablets (any touch screen, however big) and short screens: the bars slide away while scrolling down the
// sheet (more room for the music). Scrolling up does not bring them back (small moves to fit the music would keep
// uncovering them): a tap on the sheet does, or reaching the top of the page. Not while editing chords.
const smallScreen = window.matchMedia('(max-width: 1079px), (max-height: 600px), (pointer: coarse)');
function hideBarsOnScroll(pane) {
  const body = document.body;
  const usable = () => smallScreen.matches && pane.offsetParent !== null && !body.classList.contains('editing-chords');
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

function sheetKeys(getSheet) {
  const with_ = (fn) => () => { const s = getSheet(); if (s) fn(s); };
  return {
    p: with_((s) => s.set({guitar: false})),
    g: with_((s) => s.set({guitar: true})),
    h: with_((s) => s.set({staff: !s.state.staff})),
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

const themeListeners = new Set();

// ---- keyboard ----

let keys = {};

function onKey(e) {
  const t = e.target;
  const typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if ($('dialog[open]')) return;
  if (typing) return;
  if (e.key === '/') { e.preventDefault(); $('#q').focus(); $('#q').select(); return; }
  if (e.key === '?') { $('#helpDialog').showModal(); return; }
  const fn = keys[e.key];
  if (fn) { e.preventDefault(); fn(); }
}

// ---- the search box ----

function setupSearch() {
  const q = $('#q');
  let timer = null;
  setupKeyboardToggle(q);
  q.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      const text = q.value.trim();
      const onSearch = route && route.parts[0] === 'search';
      if (!text) { if (onSearch) go('#/'); return; }
      const url = href('/search', {q: text, all: onSearch && route.params.get('all') === '1' ? 1 : null});
      if (onSearch) { quietly(url); rerenderSearch(); } else { go(url); $('#q').focus(); }
    }, 140);
  });
  q.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      clearTimeout(timer);
      const text = q.value.trim();
      if (!text) return;
      const pq = DB.parseQuery(text, currentGroup);
      if (pq.id && DB.exists(pq.id)) { q.blur(); go('#/h/' + pq.id); return; }
      if (route.parts[0] !== 'search' || route.params.get('q') !== text) {
        quietly(href('/search', {q: text}));
        rerenderSearch();
      }
      const first = $('.results a.hymn-row, .search a.hymn-row');
      if (first) { q.blur(); first.click(); }
    } else if (e.key === 'ArrowDown') {
      const first = $('#view a.hymn-row');
      if (first) { e.preventDefault(); first.focus(); }
    } else if (e.key === 'Escape') {
      q.value = '';
      q.blur();
      if (route.parts[0] === 'search') go('#/');
    }
  });
  // arrow keys move through the results
  $('#view').addEventListener('keydown', (e) => {
    if (!e.target.classList || !e.target.classList.contains('hymn-row')) return;
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const rows = [...document.querySelectorAll('#view a.hymn-row')];
    const i = rows.indexOf(e.target);
    e.preventDefault();
    e.stopPropagation();
    if (e.key === 'ArrowUp' && i === 0) { q.focus(); return; }
    const to = rows[i + (e.key === 'ArrowDown' ? 1 : -1)];
    if (to) to.focus();
  });
}

// On touch screens the box opens the number pad first, as hymns are called by number in meetings; the 123 / ABC
// button switches to the letters (the iPhone number pad has no key for that), and the choice is remembered.
function setupKeyboardToggle(q) {
  if (!window.matchMedia('(pointer: coarse)').matches) return;
  const btn = $('#kbToggle');
  let wasFocused = false;
  const show = () => {
    const numbers = store.get('keyboard', 'numbers') === 'numbers';
    q.inputMode = numbers ? 'numeric' : 'search';
    btn.textContent = numbers ? 'ABC' : '123';   // like the iPhone's own key: what it switches to
    btn.setAttribute('aria-label', numbers ? tr('Type letters') : tr('Type numbers'));
  };
  show();
  btn.hidden = false;
  // the tap takes the focus from the box before the click; remember whether the keyboard was up
  btn.addEventListener('pointerdown', () => { wasFocused = document.activeElement === q; });
  btn.addEventListener('mousedown', (e) => e.preventDefault());
  btn.addEventListener('click', () => {
    store.set('keyboard', store.get('keyboard', 'numbers') === 'numbers' ? 'letters' : 'numbers');
    show();
    if (wasFocused || document.activeElement === q) {
      q.blur();   // the keyboard changes only when the box is focused again
      q.focus();
    }
  });
}

function rerenderSearch() {
  const view = $('#view');
  view.innerHTML = '';
  searchScreen(view, route.params.get('q') || '');
  document.title = tr('Search') + ' · ' + tr('Hymns');
}

// ---- the hymnal picker ----
// On a hymn, picking another hymnal opens the same hymn there when it has one (the Android app's drawer);
// otherwise, and everywhere else, the hymnal's list.

function setupHymnalPicker() {
  const dlg = $('#hymnalDialog');
  const counts = DB.groupCounts();
  const grid = $('#hymnalChoices');
  const onHymn = route && route.parts[0] === 'h' && DB.hymn(route.parts[1]);
  $('#hymnalHint').hidden = !onHymn;
  if (onHymn) $('#hymnalHint').textContent = tr('Opens {0} in the hymnal you pick, where it has it.', onHymn.id);
  grid.innerHTML = '';
  for (const g of shownGroups()) {
    const there = onHymn && g.code !== onHymn.group ? DB.relatedIn(onHymn.id, g.code) : null;
    grid.appendChild(h('button', {type: 'button', class: 'hymnal-card' + (g.code === currentGroup ? ' current' : ''),
      style: groupStyle(g.code), onclick: () => {
        dlg.close();
        if (onHymn && g.code === onHymn.group) return;
        setGroup(g.code);
        if (there) swapBack = {back: onHymn.id, at: there};
        go(there ? '#/h/' + there : '#/browse/' + g.code);
      }},
    h('span', {class: 'code'}, g.code), h('span', {class: 'name', dir: 'auto'}, g.name),
    h('span', {class: 'count'}, there ? tr('Has this hymn: {0}', splitId(there).no) : bookSubtitle(g.code, tn('{0} hymn', '{0} hymns', counts[g.code])))));
  }
}

// ---- favorites ----

// the same text as the Android app's Back up: a short note, then one "E1 – first line" per hymn
function favoritesText() {
  const favs = favorites().filter((id) => DB.exists(id));
  const lines = favs.map((id) => {
    const hymn = DB.hymn(id);
    const first = (hymn.first || hymn.chorus || '').trim();
    return first ? id + ' – ' + first : id;
  });
  return tr('My favorite hymns (Hymns For Android): {0}', tn('{0} hymn', '{0} hymns', favs.length)) + '\n\n' +
    tr('To put them back: in the Android app, open this text as a file or tap Search, then Favorites > Restore;\nin the web app, paste it under Favorites.')
    + '\n\n' + lines.join('\n') + '\n';
}

// the hymn numbers in a favorites text, as the Android app reads them: the first word of each line,
// or every item of a comma-separated line (the old export format, e.g. "E1,C215,NS151,")
function favoriteIds(text) {
  const ids = [];
  for (let line of (text || '').split(/\r?\n/)) {
    line = line.replace(/^[^A-Za-z0-9]+/, '');
    const words = /^[A-Za-z0-9,;\s]*,[A-Za-z0-9,;\s]*$/.test(line) ? line.split(/[,;\s]+/) : [line.split(/[^A-Za-z0-9]/)[0]];
    for (const word of words) {
      const id = currentId(word.toUpperCase());
      if (/^[A-Z]{1,3}[0-9]{1,5}[A-Z]?$/.test(id) && DB.exists(id) && !ids.includes(id)) ids.push(id);
    }
  }
  return ids;
}

function importFavorites(text) {
  const ids = favoriteIds(text);
  if (!ids.length) return 0;
  const favs = favorites();
  const added = ids.filter((id) => !favs.includes(id));
  store.set('favorites', [...added, ...favs]);   // in the order of the list, before the ones already here
  return added.length;
}

async function shareText(text, title) {
  if (navigator.share && window.matchMedia('(pointer: coarse)').matches) {
    try { await navigator.share({title, text}); return; } catch (e) { if (e.name === 'AbortError') return; }
  }
  try {
    await navigator.clipboard.writeText(text);
    toast(tr('Copied: paste it into a message or a note'));
  } catch (e) {
    toast(tr('Could not copy'));
  }
}

function favoritesScreen(view) {
  const favs = favorites().filter((id) => DB.exists(id));
  const box = h('div', {class: 'page'});
  view.appendChild(box);
  box.appendChild(h('h1', {class: 'page-title'}, icon('star'), tr('Favorites')));
  if (!favs.length) {
    box.appendChild(h('p', {class: 'muted'}, tr('No favorites yet. Tap the star on a hymn to add it here.')));
  } else {
    box.appendChild(h('section', {class: 'card list-card'}, h('ul', {class: 'hymn-list'}, favs.map((id) => {
      const row = hymnRow(DB.hymn(id), null);
      row.appendChild(h('button', {class: 'icon-btn remove', title: tr('Remove from favorites'), 'aria-label': tr('Remove {0}', id),
        onclick: () => { store.set('favorites', favorites().filter((x) => x !== id)); row.remove(); toast(tr('{0} removed', id)); }}, icon('close')));
      return row;
    }))));
  }
  const area = h('textarea', {class: 'paste', rows: 3, placeholder: tr('Paste your favorites here (the text made by Export or by the Android app\'s Back up)')});
  box.appendChild(h('section', {class: 'card settings-card'},
    h('h2', null, tr('Move favorites between devices')),
    h('p', {class: 'muted small'}, tr('Works with the Android app: there, Search → Favorites → Back up / Restore.')),
    h('div', {class: 'row'},
      h('button', {class: 'btn', disabled: !favs.length || null, onclick: () => shareText(favoritesText(), tr('Hymn favorites'))}, icon('share'), tr('Export')),
      h('button', {class: 'btn', onclick: async () => {
        try { area.value = await navigator.clipboard.readText(); } catch (e) { area.focus(); }
      }}, tr('Paste'))),
    area,
    h('div', {class: 'row'}, h('button', {class: 'btn primary', onclick: () => {
      const n = importFavorites(area.value);
      if (!n && !area.value.trim()) { toast(tr('Paste a list first')); return; }
      toast(n ? tn('{0} favorite added', '{0} favorites added', n) : tr('Nothing new in that list'));
      render();
    }}, tr('Import')))));
}

// ---- settings ----

// ", " between names in a list; 、 in Chinese
const listSeparator = () => (lang.startsWith('zh') ? '、' : ', ');

// the app's language was changed (Settings -> Language): the page's own texts and the open screen are written again
function changeLanguage(value) {
  setChoice(value);
  applyStatic();
  setGroup(currentGroup);
  render();
}

function toggleRow(label, hint, on, onchange) {
  const input = h('input', {type: 'checkbox', role: 'switch', checked: on || null, onchange: (e) => onchange(e.target.checked)});
  return h('label', {class: 'setting'}, h('span', null, h('span', {class: 'label'}, label), hint ? h('span', {class: 'hint'}, hint) : null), input);
}

function downloadFile(name, text, type) {
  const blob = new Blob([text], {type});
  const file = new File([blob], name, {type});
  if (navigator.canShare && navigator.canShare({files: [file]}) && window.matchMedia('(pointer: coarse)').matches) {
    return navigator.share({files: [file], title: name}).catch(() => {});
  }
  const a = h('a', {href: URL.createObjectURL(blob), download: name});
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

// ---- share the app ----

const PLAY_URL = 'https://play.google.com/store/apps/details?id=com.lemuelinchrist.android.hymns';
const WEB_URL = 'https://lemuelinchrist.github.io/hymnsforandroid/';

// the QR code as an inline SVG (black squares on white, with a margin of two squares)
function qrSvg(text) {
  const q = qrcode(0, 'M');
  q.addData(text);
  q.make();
  const n = q.getModuleCount(), m = 2;
  let d = '';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) d += 'M' + (c + m) + ' ' + (r + m) + 'h1v1h-1z';
  const size = n + 2 * m;
  return '<svg viewBox="0 0 ' + size + ' ' + size + '" shape-rendering="crispEdges" role="img" aria-label="' + tr('QR code for {0}', text) + '">'
    + '<rect width="100%" height="100%" fill="#fff"/><path d="' + d + '" fill="#111"/></svg>';
}

function shareCard() {
  let web = true;   // a person on the web app is most likely sharing the web app
  const card = h('section', {class: 'card settings-card share-card'}, h('h2', null, tr('Share the app')));
  const draw = () => {
    const url = web ? WEB_URL : PLAY_URL;
    const qr = h('div', {class: 'qr'});
    qr.innerHTML = qrSvg(url);
    const seg = h('div', {class: 'seg'}, [[false, 'Android'], [true, tr('iPhone and all devices')]].map(([isWeb, label]) =>
      h('button', {type: 'button', 'aria-pressed': String(web === isWeb), onclick: () => { web = isWeb; draw(); }}, label)));
    const copy = async () => {
      try { await navigator.clipboard.writeText(url); toast(tr('Link copied')); } catch (e) { toast(url); }
    };
    card.replaceChildren(
      h('h2', null, tr('Share the app')),
      h('p', {class: 'muted small'}, tr('Let someone scan this with their phone’s camera.')),
      h('div', {class: 'share-seg'}, seg),
      qr,
      h('p', {class: 'qr-url'}, url.replace('https://', '')),
      h('p', {class: 'muted small qr-note'}, web
        ? tr('Opens the web app in the browser. On an iPhone or iPad: tap Share, then Add to Home Screen, and it works offline like an app.')
        : tr('Opens Hymns For Android on Google Play.')),
      h('div', {class: 'row share-row'},
        h('button', {type: 'button', class: 'btn', onclick: copy}, tr('Copy link')),
        navigator.share ? h('button', {type: 'button', class: 'btn', onclick: () => navigator.share({title: 'Hymns For Android', url}).catch(() => {})}, icon('share'), tr('Share link')) : null));
  };
  draw();
  return card;
}

function settingsScreen(view) {
  const box = h('div', {class: 'page'});
  view.appendChild(box);
  box.appendChild(h('h1', {class: 'page-title'}, icon('settings'), tr('Settings')));

  // display
  // text size: the five Android steps (Small ... XXL) on steps 1-5 of the page's seven (0 and 6 only with the A buttons on a hymn)
  const SIZE_NAMES = ['Small', 'Medium', 'Large', 'Extra Large', 'XXL'];
  const step = () => Math.max(0, Math.min(4, lyricSize - 1));
  const sizeValue = h('span', null, tr(SIZE_NAMES[step()]));
  const sizeSteps = h('div', {class: 'card size-steps', role: 'group', 'aria-label': tr('Text size')}, SIZE_NAMES.map((name, i) =>
    h('button', {type: 'button', 'aria-label': tr(name), 'aria-pressed': String(i === step()), style: 'font-size:' + (13 + 4 * i) + 'px',
      onclick: () => {
        setLyricSize(i + 1);
        sizeValue.textContent = tr(name);
        for (const [j, x] of [...sizeSteps.children].entries()) x.setAttribute('aria-pressed', String(j === i));
      }}, 'A')));
  box.appendChild(h('div', {class: 'set-head'}, h('h2', null, tr('Text size')), sizeValue));
  box.appendChild(sizeSteps);

  // theme: a small picture per choice
  const themeNow = store.get('theme', null);
  const THEMES = [
    [null, 'System', 'System default', {bg: '#ffffff', bar: '#3d577a', line: '#8a9099', half: true}],
    ['light', 'Light', 'Light', {bg: '#ffffff', bar: '#3d577a', line: '#c9ced5'}],
    ['dark', 'Dark', 'Dark', {bg: '#1d1f23', bar: '#2c3e57', line: '#4a4f57'}],
    ['black', 'Black', 'Black', {bg: '#000000', bar: '#1c2a3c', line: '#3a3a3a'}]];
  const themeValue = h('span', null, tr(THEMES.find((t) => t[0] === themeNow)[2]));
  const mock = (m) => {
    const e = h('span', {class: 'mock', style: `--m-bg:${m.bg};--m-bar:${m.bar};--m-line:${m.line}`});
    if (m.half) e.appendChild(h('span', {class: 'half'}));
    for (const [top, right] of [[19, 8], [26, 16], [33, 10], [40, 28]]) e.appendChild(h('i', {style: `top:${top}px;right:${right}px`}));
    return e;
  };
  box.appendChild(h('div', {class: 'set-head'}, h('h2', null, tr('Appearance')), themeValue));
  box.appendChild(h('div', {class: 'theme-tiles', role: 'group', 'aria-label': tr('Appearance')}, THEMES.map(([t, name, full, m]) =>
    h('button', {type: 'button', class: 'theme-tile', 'aria-pressed': String(themeNow === t), 'aria-label': tr(full),
      onclick: () => { setTheme(t); render(); document.querySelector(`.theme-tile[aria-label="${tr(full)}"]`)?.focus(); }},   // the page is drawn again: keep the focus
    h('span', {class: 'frame'}, mock(m)), h('span', {class: 'name'}, tr(name))))));

  box.appendChild(h('section', {class: 'card settings-card'},
    h('h2', null, tr('Display')),
    toggleRow(tr('Repeat the chorus'), tr('After every stanza, when a hymn has one chorus'), repeatChorus,
      (on) => { repeatChorus = on; store.set('repeatChorus', on); }),
    toggleRow(tr('Keep the screen on'), 'wakeLock' in navigator ? tr('While the app is open') : tr('Not supported by this browser (on iPhone: iOS 18.4 or later)'),
      keepAwake, (on) => { keepAwake = on; store.set('keepAwake', on); updateWakeLock(); })));

  // the app's language (the hymns stay in their own languages)
  box.appendChild(h('section', {class: 'card settings-card'},
    h('h2', null, tr('Language')),
    h('label', {class: 'setting'}, h('span', {class: 'label'}, tr('App language')),
      h('select', {class: 'lang-select', onchange: (e) => changeLanguage(e.target.value)},
        [['', tr('Phone\'s language')], ...LANGS].map(([code, name]) =>
          h('option', {value: code, selected: code === getChoice() || null}, name))))));

  // hymnals
  const counts = DB.groupCounts();
  const all = GROUPS.filter((g) => counts[g.code]);
  const hiddenNames = all.filter((g) => !isShown(g.code)).map((g) => g.name);
  box.appendChild(h('section', {class: 'card settings-card'},
    h('h2', null, tr('Languages (Hymn Books)')),
    h('p', {class: 'muted small'}, tr('Simplify your view by hiding books you don\'t use ({0}). Hidden books leave the lists, search and the “other languages” row.',
      hiddenNames.length
        ? (hiddenNames.length > 3 ? tr('hiding {0} of {1}', hiddenNames.length, all.length) : tr('hiding {0}', hiddenNames.join(listSeparator())))
        : tr('all {0} shown', all.length))),
    h('div', {class: 'hymnal-toggles'}, GROUPS.filter((g) => counts[g.code]).map((g) =>
      h('label', {class: 'hymnal-toggle', style: groupStyle(g.code)},
        h('input', {type: 'checkbox', checked: isShown(g.code) || null, onchange: (e) => {
          if (!e.target.checked && shownGroups().length <= 1) { e.target.checked = true; return; }
          setHidden(g.code, !e.target.checked);
          if (!e.target.checked && currentGroup === g.code) setGroup(shownGroups()[0].code);
        }}),
        h('span', {class: 'chip'}, g.code), h('span', {dir: 'auto'}, g.name))))));

  // chord edits
  const editsCard = h('section', {class: 'card settings-card'}, h('h2', null, tr('Chord edits')));
  box.appendChild(editsCard);
  const editsInfo = h('p', {class: 'muted small'}, '…');
  const fileInput = h('input', {type: 'file', accept: '.json,application/json', hidden: true, onchange: async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    try {
      const r = await Edits.importAll(JSON.parse(await f.text()));
      toast(tn('{0} sheet imported', '{0} sheets imported', r.added) + (r.kept ? listSeparator() + tr('{0} kept (newer here)', r.kept) : ''));
      render();
    } catch (err) {
      toast(err.message || tr('Could not read that file'));
    }
  }});
  const editedList = h('ul', {class: 'hymn-list'});
  append(editsCard, [
    h('p', {class: 'muted small'}, tr('Chords you change on a piano sheet (Edit chords) are saved on this device. Export them to keep a copy, to move them to another device, or to send them in so they can go into the sheets for everyone.')),
    editsInfo, editedList,
    h('div', {class: 'row'},
      h('button', {class: 'btn', onclick: async () => {
        const data = await Edits.exportAll();
        if (!Object.keys(data.sheets).length) { toast(tr('No chord edits yet')); return; }
        downloadFile('hymns-chord-edits-' + new Date().toISOString().slice(0, 10) + '.json', JSON.stringify(data, null, 1), 'application/json');
      }}, icon('share'), tr('Export')),
      h('button', {class: 'btn', onclick: () => fileInput.click()}, tr('Import')), fileInput)]);
  Edits.all().then((list) => {
    editsInfo.textContent = list.length ? tn('{0} sheet with edits:', '{0} sheets with edits:', list.length) : tr('No chord edits yet.');
    list.sort((a, b) => b.updated - a.updated);
    for (const r of list) {
      const hm = DB.hymn(r.sheet);
      if (hm) editedList.appendChild(hymnRow(hm, h('span', {class: 'snippet'}, tn('{0} bar', '{0} bars', Object.keys(r.bars).length) + ' · ' + new Date(r.updated).toLocaleDateString(lang))));
    }
  });

  // offline
  const offlineStatus = h('p', {class: 'muted small'}, '');
  const offlineBtn = h('button', {class: 'btn', onclick: async () => {
    offlineBtn.disabled = true;
    offlineStatus.textContent = tr('Downloading the sheet music…');
    try {
      if (navigator.storage && navigator.storage.persist) await navigator.storage.persist();
      await prefetchAll();
      const tunes = DB.allTuneFiles();
      await Player.prefetch(tunes, (f) => { offlineStatus.textContent = tr('Downloading the tunes… {0}%', Math.round(f * 100)); });
      offlineStatus.textContent = tr('All sheet music and tunes are on this device.');
      store.set('offlineAll', DB.version.build);
    } catch (e) {
      offlineStatus.textContent = tr('Download stopped: {0}', e.message);
    }
    offlineBtn.disabled = false;
  }}, tr('Download all sheet music and tunes'));
  const sw = 'serviceWorker' in navigator && window.isSecureContext;
  offlineStatus.textContent = !sw ? tr('Offline use needs the app’s https address.')
    : store.get('offlineAll', null) ? tr('Sheet music and tunes were downloaded for offline use.')
      : tr('The hymns work offline. Sheets and tunes you have opened do too; download all of them here (about 20 MB).');
  box.appendChild(h('section', {class: 'card settings-card'},
    h('h2', null, tr('Offline')), offlineStatus, sw ? h('div', {class: 'row'}, offlineBtn) : null));

  // share the app: a QR code for the Google Play page, or for the web app (iPhone and every other device)
  box.appendChild(shareCard());

  // about
  const v = DB.version || {};
  box.appendChild(h('section', {class: 'card settings-card about'},
    h('h2', null, tr('About')),
    h('p', null, tr('Hymns {0} · {1} hymns · data of {2}', v.app || '', num(v.hymns || 0), v.built || '?')),
    h('p', {class: 'muted small'}, trh('The same hymns as the Android app {0}. Sheet music from www.hymnal.net, engraved with Verovio (LGPL).',
      h('a', {href: 'https://play.google.com/store/apps/details?id=com.lemuelinchrist.android.hymns', target: '_blank', rel: 'noopener'}, 'Hymns For Android'))),
    h('p', {class: 'muted small'}, tr('Source code: '),
      h('a', {href: 'https://github.com/lemuelinchrist/hymnsforandroid', target: '_blank', rel: 'noopener', style: 'overflow-wrap: anywhere'}, 'github.com/lemuelinchrist/hymnsforandroid')),
    h('p', {class: 'muted small'}, tr('Feedback: '), h('a', {href: 'mailto:hymnsforandroid.support@gmail.com'}, 'hymnsforandroid.support@gmail.com')),
    window.matchMedia('(pointer: coarse)').matches ? null
      : h('p', null, h('button', {class: 'link', onclick: () => $('#helpDialog').showModal()}, tr('Keyboard shortcuts')))));
}

// ---- start ----

function setupServiceWorker() {
  if (!('serviceWorker' in navigator) || !window.isSecureContext) return;
  const hadController = !!navigator.serviceWorker.controller;
  const opened = Date.now();
  navigator.serviceWorker.register('sw.js').then((reg) => {
    // look for a new build when the app comes back to the screen and once an hour, not only when it is opened
    const check = () => reg.update().catch(() => {});
    document.addEventListener('visibilitychange', () => { if (!document.hidden) check(); });
    setInterval(check, 60 * 60 * 1000);
  }).catch((e) => console.warn('service worker', e));
  // a new build took over. Just opened (nothing to lose yet) or out of sight: load it by itself. In use: offer to
  // reload, so an edit in progress is not lost.
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController) return;
    if (document.hidden || Date.now() - opened < 20000) { location.reload(); return; }
    const t = $('#toast');
    t.textContent = '';
    t.appendChild(document.createTextNode(tr('A new version is ready. ')));
    t.appendChild(h('button', {class: 'link toast-link', onclick: () => location.reload()}, tr('Reload')));
    t.classList.add('show', 'sticky');
  });
}

async function start() {
  applyStatic();
  applyTheme();
  setLyricSize(lyricSize);
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => themeListeners.forEach((f) => f()));
  for (const d of document.querySelectorAll('dialog')) {
    d.addEventListener('click', (e) => { if (e.target === d) d.close(); });   // a click outside closes it
  }
  for (const b of document.querySelectorAll('[data-close]')) b.addEventListener('click', () => b.closest('dialog').close());
  $('#favoritesTop').appendChild(icon('star'));
  $('#settingsTop').appendChild(icon('settings'));
  $('#backBtn').addEventListener('click', goBack);
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredInstall = e; });
  document.addEventListener('visibilitychange', updateWakeLock);
  setupServiceWorker();

  const bar = $('#progress');
  try {
    await DB.open((f) => {
      $('#loading').hidden = false;
      bar.style.width = Math.round(f * 100) + '%';
      $('#loadingText').textContent = tr('Downloading hymns… {0}%', Math.round(f * 100));
    });
  } catch (e) {
    console.error(e);
    $('#loadingText').textContent = tr('Could not load the hymns: {0}', e.message);
    $('#loading').hidden = false;
    $('#loading').classList.add('error');
    return;
  }
  $('#loading').hidden = true;
  document.body.classList.add('ready');
  if (!isShown(currentGroup) || !DB.groupCounts()[currentGroup]) currentGroup = shownGroups()[0].code;
  setGroup(currentGroup);
  $('#hymnalBtn').addEventListener('click', () => { setupHymnalPicker(); $('#hymnalDialog').showModal(); });
  setupSearch();
  document.addEventListener('keydown', onKey);
  // a link was followed (a new entry has no depth yet) or Back/Forward: draw the screen of the new address
  window.addEventListener('hashchange', () => {
    if (!history.state) history.replaceState({n: shownDepth + 1}, '', location.hash);
    render();
  });
  updateWakeLock();
  render();
  // fetch the music renderer while nothing else is happening, so the first sheet opens sooner
  setTimeout(() => import('./sheet.js').then((m) => m.loadVerovio()).catch(() => {}), 1500);
}

start();
