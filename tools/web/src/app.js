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
import {GROUPS, BY_CODE, splitId, langOf} from './groups.js';
import {SheetView, MAX_SHIFT, MIN_SCALE, MAX_SCALE, DEFAULT_SCALE, prefetchAll} from './sheet.js';
import {createEditor} from './editor.js';
import * as Edits from './edits.js';

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
  keyboard: '<rect x="2.5" y="6" width="19" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10"/>',
  textSmaller: '<path d="M3 18l4.5-11L12 18M4.6 14h5.8M15 13h6"/>',
  textBigger: '<path d="M3 18l4.5-11L12 18M4.6 14h5.8M15 13h6M18 10v6"/>',
  home: '<path d="M4 11l8-6.5 8 6.5M6 9.5V20h12V9.5"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M5.5 18.5l1.7-1.7M16.8 7.2l1.7-1.7"/>',
  copy: '<rect x="8.5" y="8.5" width="11" height="11" rx="2"/><path d="M15.5 8.5V6a1.5 1.5 0 0 0-1.5-1.5H6A1.5 1.5 0 0 0 4.5 6v8A1.5 1.5 0 0 0 6 15.5h2.5"/>',
  share: '<path d="M12 3.5v11M8 7.5l4-4 4 4M5.5 12v6.5a1.5 1.5 0 0 0 1.5 1.5h10a1.5 1.5 0 0 0 1.5-1.5V12"/>',
  play: '<path d="M8 5.5v13l10.5-6.5z"/>',
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

let currentGroup = store.get('group', 'E');
if (!BY_CODE[currentGroup]) currentGroup = 'E';

function setGroup(code) {
  currentGroup = code;
  store.set('group', code);
  const btn = $('#hymnalBtn');
  btn.setAttribute('style', groupStyle(code));
  $('#hymnalName').textContent = BY_CODE[code].name;
  $('#hymnalBtn .dot').dataset.code = code;
  $('#q').placeholder = window.innerWidth < 720 ? 'Number or words'
    : 'Search ' + BY_CODE[code].name + ' by number, or any hymnal by words';
  const tab = document.querySelector('.tabbar [data-tab="browse"]');
  if (tab) tab.setAttribute('href', '#/browse/' + code);
}

function applyTheme() {
  const t = store.get('theme', null);
  if (t) document.documentElement.dataset.theme = t;
  else delete document.documentElement.dataset.theme;
}

function isDark() {
  const t = document.documentElement.dataset.theme;
  return t ? t === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
}

// 'light', 'dark', or null to follow the device
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
  toast(on ? id + ' added to favorites' : id + ' removed from favorites');
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
  let title = 'Hymns';
  try {
    if (!screen) {
      homeScreen(view);
    } else if (screen === 'search') {
      searchScreen(view, route.params.get('q') || '');
      title = 'Search · ' + title;
    } else if (screen === 'browse' && (!arg || BY_CODE[arg.toUpperCase()])) {
      const code = arg ? arg.toUpperCase() : currentGroup;
      browseScreen(view, code);
      title = BY_CODE[code].name + ' · ' + title;
    } else if (screen === 'favorites') {
      favoritesScreen(view);
      title = 'Favorites · ' + title;
    } else if (screen === 'settings') {
      settingsScreen(view);
      title = 'Settings · ' + title;
    } else if ((screen === 'h' || screen === 'sheet') && arg) {
      const hymn = DB.hymn(arg);
      if (!hymn) {
        notFound(view, arg);
      } else {
        if (hymn.id !== arg) { quietly(href('/' + screen + '/' + hymn.id, Object.fromEntries(route.params))); }
        if (screen === 'h') hymnScreen(view, hymn);
        else sheetScreen(view, hymn);
        title = hymn.id + ' · ' + (hymn.first || '') + ' · Hymns';
      }
    } else if (splitId(screen)) {
      quietly(href('/h/' + screen.toUpperCase()));
      return render();
    } else {
      notFound(view, screen);
    }
  } catch (e) {
    console.error(e);
    view.appendChild(h('div', {class: 'empty'}, h('h2', null, 'Something went wrong'), h('p', null, String(e))));
  }
  document.title = title;
  if (screen !== 'search') $('#q').value = '';
  shownDepth = depth();
  $('#backBtn').hidden = !screen || shownDepth === 0;
  const tab = !screen ? 'home' : ['browse', 'favorites', 'settings'].includes(screen) ? screen : null;
  for (const a of document.querySelectorAll('.tabbar a')) a.classList.toggle('on', a.dataset.tab === tab);
  window.scrollTo(0, 0);
}

function notFound(view, what) {
  view.appendChild(h('div', {class: 'empty'},
    h('h2', null, 'No hymn “' + what + '”'),
    h('p', null, 'It may have been removed or renumbered. ', h('a', {href: '#/'}, 'Back to the start'))));
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
      h('b', null, 'Install Hymns on this ' + (ios ? (/iPad/.test(navigator.userAgent) ? 'iPad' : 'iPhone') : 'device')),
      ios ? h('p', null, 'Tap ', icon('share'), ' Share, then ', h('b', null, 'Add to Home Screen'),
        '. It opens like an app and works without internet.')
        : h('p', null, 'It opens like an app and works without internet. ',
          h('button', {class: 'link', onclick: async () => { deferredInstall.prompt(); deferredInstall = null; box.remove(); }}, 'Install'))),
    h('button', {class: 'icon-btn', 'aria-label': 'Close', onclick: () => { store.set('installHintClosed', true); box.remove(); }}, icon('close')));
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
    h('section', {class: 'hero'},
      h('h1', null, 'Hymns'),
      h('p', null, 'Type a number to open it in ', h('b', null, BY_CODE[currentGroup].name),
        ', or a few words from any line to search every hymnal.'),
      h('div', {class: 'hero-tips'},
        h('button', {class: 'tip', onclick: () => go('#/h/' + currentGroup + '1')}, currentGroup + ' 1'),
        h('button', {class: 'tip', onclick: () => searchFor('blessings flow')}, '“blessings flow”'),
        h('button', {class: 'tip', onclick: () => searchFor('NS 151')}, 'NS 151'),
        touch ? null : h('button', {class: 'tip', onclick: () => $('#helpDialog').showModal()}, icon('keyboard'), 'Shortcuts'))),
    (recent.length || favs.length) ? h('div', {class: 'home-lists'},
      favs.length ? h('section', {class: 'card'}, h('h2', null, icon('star'), 'Favorites',
        h('a', {class: 'link small', href: '#/favorites'}, 'All')), list(favs)) : null,
      recent.length ? h('section', {class: 'card'}, h('h2', null, 'Recently opened',
        h('button', {class: 'link small', onclick: () => { store.set('recent', []); render(); }}, 'Clear')), list(recent)) : null) : null,
    h('section', {class: 'hymnals'},
      h('h2', null, 'Hymnals'),
      h('div', {class: 'hymnal-grid'}, shownGroups().map((g) =>
        h('a', {class: 'hymnal-card' + (g.code === currentGroup ? ' current' : ''), href: '#/browse/' + g.code,
          style: groupStyle(g.code)},
          h('span', {class: 'code'}, g.code),
          h('span', {class: 'name', dir: 'auto'}, g.name),
          h('span', {class: 'count'}, (g.long ? g.long + ' · ' : '') + counts[g.code] + ' hymns')))))));
}

function hymnRow(hm, extra) {
  return h('li', null, h('a', {href: '#/h/' + hm.id, class: 'hymn-row'},
    chip(hm.group || splitId(hm.id).group, hm.id),
    h('span', {class: 'first'}, hm.first || hm.line || ''),
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
    let c = ch.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/ς/g, 'σ');
    if (!/^[\p{L}\p{N}]+$/u.test(c)) c = ' ';
    if (!(c === ' ' && n.endsWith(' '))) for (const x of c) { n += x; map.push([i, i + ch.length]); }
    i += ch.length;
  }
  // the words together where they are together, else each word
  const phrase = words.join(' ');
  const parts = words.length > 1 && n.includes(phrase) ? [phrase] : words;
  const ranges = [];
  for (const w of parts) {
    for (let at = n.indexOf(w); at >= 0 && w; at = n.indexOf(w, at + w.length)) {
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

function searchScreen(view, q) {
  const all = route.params.get('all') === '1';
  const box = h('div', {class: 'search'});
  view.appendChild(box);
  $('#q').value = q;
  const pq = DB.parseQuery(q, currentGroup);

  if (pq.id) {
    const main = DB.hymn(pq.id);
    box.appendChild(h('h1', {class: 'results-title'}, main ? 'Go to ' + main.id : 'No hymn ' + pq.id));
    if (main) box.appendChild(h('ul', {class: 'hymn-list big'}, hymnRow(main, h('span', {class: 'enter'}, 'Enter ↵'))));
    if (pq.number) {
      const no = pq.id.replace(/^\D+/, '');
      const others = shownGroups().filter((g) => g.code !== currentGroup).map((g) => DB.hymn(g.code + no)).filter(Boolean);
      if (others.length) {
        box.appendChild(h('h2', {class: 'results-sub'}, 'Number ' + no + ' in other hymnals'));
        box.appendChild(h('ul', {class: 'hymn-list'}, others.map((o) => hymnRow(o))));
      }
    }
    return;
  }
  if (!pq.words.length) {
    box.appendChild(h('div', {class: 'empty'}, h('p', null, 'Type a number or some words.')));
    return;
  }

  const t0 = performance.now();
  const found = DB.search(pq.words).filter((r) => isShown(r.group) || r.group === currentGroup);
  const inGroup = found.filter((r) => r.group === currentGroup);
  const showAll = all || !inGroup.length;
  const results = showAll ? found : inGroup;
  const ms = Math.round(performance.now() - t0);

  box.appendChild(h('div', {class: 'results-head'},
    h('div', {class: 'seg', role: 'group'},
      h('a', {href: href('/search', {q}), class: !showAll ? 'on' : '', 'aria-disabled': inGroup.length ? null : 'true'},
        BY_CODE[currentGroup].name, h('span', {class: 'n'}, inGroup.length)),
      h('a', {href: href('/search', {q, all: 1}), class: showAll ? 'on' : ''}, 'All hymnals',
        h('span', {class: 'n'}, found.length))),
    h('span', {class: 'muted small', title: ms + ' ms'}, found.length >= 3000 ? 'showing the first 3000' : '')));

  if (!results.length) {
    box.appendChild(h('div', {class: 'empty'}, h('p', null, 'Nothing found for “' + q + '”.')));
    return;
  }
  const ul = h('ul', {class: 'hymn-list results'});
  box.appendChild(ul);
  let shown = 0;
  const more = h('button', {class: 'more', onclick: () => page()}, 'Show more');
  function page() {
    const next = results.slice(shown, shown + 60);
    for (const r of next) {
      const first = r.line || '';
      const line = r.score >= 3 ? null : DB.matchLine(r.id, pq.words);
      ul.appendChild(h('li', null, h('a', {href: '#/h/' + r.id, class: 'hymn-row'},
        chip(r.group, r.id),
        h('span', {class: 'first'}, highlight(first, pq.words)),
        line && line !== first ? h('span', {class: 'snippet'}, '… ', highlight(line, pq.words), ' …') : null)));
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
    h('p', {class: 'muted'}, (g.long ? g.long + ' · ' : '') + hymns.length + ' hymns'),
    h('div', {class: 'seg'},
      h('a', {href: href('/browse/' + code), class: tab === 'no' ? 'on' : ''}, 'By number'),
      h('a', {href: href('/browse/' + code, {tab: 'cat'}), class: tab === 'cat' ? 'on' : ''}, 'By category'))));

  if (tab === 'no') {
    page.appendChild(h('div', {class: 'numbers', dir: 'ltr'}, hymns.map((x) =>
      h('a', {href: '#/h/' + x.id, title: x.first || ''}, x.no))));
    return;
  }
  const cats = DB.categories(code);
  page.appendChild(h('div', {class: 'cats', dir: g.rtl ? 'rtl' : null}, cats.map((c) =>
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
  if (/youtube|soundcloud/.test(n)) return 'link';
  if (/note/.test(n) || n === 'copyright') return 'note';
  return 'verse';
}

// the stanzas as the app shows them: a hymn with one chorus has it after every stanza that follows it
function lyricsNode(hymn) {
  const g = BY_CODE[hymn.group];
  const box = h('div', {class: 'lyrics' + (g.cjk ? ' cjk' : ''), dir: g.rtl ? 'rtl' : null, lang: langOf(hymn.group)});
  if (!hymn.stanzas.length) box.appendChild(h('p', {class: 'muted'}, 'No lyrics for this hymn.'));
  const choruses = hymn.stanzas.filter((s) => stanzaKind(s.no) === 'chorus');
  const repeat = repeatChorus && choruses.length === 1;
  let chorus = null;
  const node = (s, kind, again) => h('div', {class: 'stanza ' + kind + (again ? ' again' : '')},
    h('div', {class: 'no'}, kind === 'verse' && s.no !== '-' ? s.no : ''),
    h('div', {class: 'text'}, s.note ? h('div', {class: 'stanza-note'}, s.note) : null, richText(s.text)));
  for (const s of hymn.stanzas) {
    const kind = stanzaKind(s.no);
    if (kind === 'link') {
      const url = DB.plain(s.text).trim();
      if (/^https?:\/\//.test(url)) {
        box.appendChild(h('div', {class: 'stanza note'}, h('div', {class: 'no'}),
          h('div', {class: 'text'}, h('a', {href: url, target: '_blank', rel: 'noopener'}, s.no + ' ↗'))));
      }
      continue;
    }
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
    if (kind === 'link') continue;
    if (kind === 'verse') out.push(s.no);
    else if (kind === 'chorus') out.push(s.note ? '(' + s.note + ')' : '');
    out.push(DB.plain(s.text), '');
  }
  return out.filter((l, i, a) => !(l === '' && a[i - 1] === '')).join('\n').trim() + '\n';
}

async function copyLyrics(hymn) {
  try {
    await navigator.clipboard.writeText(lyricsText(hymn));
    toast('Lyrics copied');
  } catch (e) {
    toast('Could not copy the lyrics');
  }
}

const HYMNALNET = {E: 'h', NS: 'ns', CH: 'c'};

function metaNode(hymn) {
  const items = [
    ['Author', hymn.author], ['Composer', hymn.composer], ['Meter', hymn.meter], ['Key', hymn.key],
    ['Time', hymn.time], ['Tune', hymn.tune && hymn.tune.trim() !== '0' ? hymn.tune.trim() : null],
    ['Scripture', hymn.verse && hymn.verse.replace(/,\s*$/, '')],
    ['From', hymn.parentId && hymn.parentId !== hymn.id ? h('a', {href: '#/h/' + hymn.parentId}, hymn.parentId) : null],
  ].filter(([, v]) => v);
  const site = HYMNALNET[hymn.group];
  const videos = DB.videos(hymn);
  return h('footer', {class: 'meta'},
    hymn.sheetId ? null : h('p', {class: 'no-sheet'}, 'No sheet music for this hymn.'),
    items.length ? h('dl', null, items.map(([k, v]) => [h('dt', null, k), h('dd', null, v)])) : null,
    videos.length ? h('p', {class: 'videos'}, 'Piano videos: ', videos.map((v, i) => [i ? ' · ' : '',
      h('a', {href: 'https://www.youtube.com/watch?v=' + encodeURIComponent(v.id), target: '_blank', rel: 'noopener'},
        (v.label || 'Video') + ' ↗')])) : null,
    site ? h('a', {class: 'small', href: `https://www.hymnal.net/en/hymn/${site}/${hymn.no}`, target: '_blank', rel: 'noopener'},
      'This hymn on hymnal.net ↗') : null);
}

function familyNode(hymn) {
  const fam = DB.family(hymn.id).filter((f) => f.id === hymn.id || isShown(f.group));
  if (fam.length < 2) return null;
  return h('nav', {class: 'family', 'aria-label': 'Other languages'},
    fam.map((f) => {
      const g = BY_CODE[f.group];
      const cur = f.id === hymn.id;
      return h('a', {href: href('/h/' + f.id, keepSheetParams()), class: 'fam' + (cur ? ' current' : ''),
        style: groupStyle(f.group), 'aria-current': cur ? 'page' : null, title: (g.long || g.name) + ' ' + f.no},
        h('span', {class: 'fam-name'}, g.name), h('span', {class: 'fam-no'}, f.no));
    }));
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

  const favBtn = h('button', {class: 'icon-btn' + (fav ? ' on' : ''), title: 'Favorite (F)', 'aria-pressed': String(fav),
    onclick: () => { const on = toggleFavorite(hymn.id); favBtn.classList.toggle('on', on); favBtn.setAttribute('aria-pressed', String(on)); }},
  icon('star'));

  const head = h('header', {class: 'hymn-head'},
    h('div', {class: 'hymn-nav'},
      h('a', {class: 'icon-btn' + (nb.prev ? '' : ' disabled'), href: nb.prev ? href('/h/' + nb.prev, keepSheetParams()) : null,
        title: nb.prev ? 'Previous: ' + nb.prev + ' (←)' : null, 'aria-label': 'Previous hymn'}, icon('prev')),
      h('a', {class: 'hymn-id', href: '#/browse/' + hymn.group, title: 'All of ' + g.name},
        h('span', {class: 'hymnal'}, g.name), h('span', {class: 'num'}, hymn.no)),
      h('a', {class: 'icon-btn' + (nb.next ? '' : ' disabled'), href: nb.next ? href('/h/' + nb.next, keepSheetParams()) : null,
        title: nb.next ? 'Next: ' + nb.next + ' (→)' : null, 'aria-label': 'Next hymn'}, icon('next')),
      h('span', {class: 'grow'}),
      h('button', {class: 'icon-btn', title: 'Smaller text', onclick: () => setLyricSize(lyricSize - 1)}, icon('textSmaller')),
      h('button', {class: 'icon-btn', title: 'Bigger text', onclick: () => setLyricSize(lyricSize + 1)}, icon('textBigger')),
      h('button', {class: 'icon-btn', title: 'Copy the lyrics (C)', 'aria-label': 'Copy the lyrics', onclick: () => copyLyrics(hymn)}, icon('copy')),
      h('button', {class: 'icon-btn print', title: 'Print', onclick: () => window.print()}, icon('print')),
      favBtn),
    h('h1', {class: 'hymn-title', dir: g.rtl ? 'rtl' : null, lang: langOf(hymn.group)}, hymn.first || hymn.id),
    hymn.category ? h('p', {class: 'category'}, hymn.category, hymn.subcategory ? ' · ' + hymn.subcategory : '') : null,
    familyNode(hymn));

  const tabs = hasSheet ? h('div', {class: 'tabs', role: 'tablist'},
    h('button', {role: 'tab', 'data-tab': 'lyrics', onclick: () => showTab('lyrics')}, 'Lyrics'),
    h('button', {role: 'tab', 'data-tab': 'sheet', onclick: () => showTab('sheet')}, 'Sheet music')) : null;

  const lyricsPane = h('section', {class: 'pane lyrics-pane'}, lyricsNode(hymn), metaNode(hymn));
  const sheetPane = hasSheet ? h('section', {class: 'pane sheet-pane'}) : null;
  const panes = h('div', {class: 'panes' + (hasSheet ? ' two' : '')}, lyricsPane, sheetPane);
  const page = h('article', {class: 'hymn', style: groupStyle(hymn.group)}, head, tabs, panes);
  view.appendChild(page);

  let sheet = null;
  function ensureSheet() {
    if (sheet || !hasSheet) return;
    sheet = sheetPanel(sheetPane, hymn, {full: false});
  }
  function showTab(t) {
    tab = t;
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

  keys = {
    ArrowLeft: () => nb.prev && go(href('/h/' + nb.prev, keepSheetParams())),
    ArrowRight: () => nb.next && go(href('/h/' + nb.next, keepSheetParams())),
    l: () => hasSheet && showTab('lyrics'),
    s: () => hasSheet && showTab('sheet'),
    f: () => favBtn.click(),
    c: () => copyLyrics(hymn),
    ...sheetKeys(() => { ensureSheet(); if (!wide.matches && tab !== 'sheet') showTab('sheet'); return sheet; }),
  };
  cleanup = () => {
    wide.removeEventListener('change', onWide);
    if (sheet) sheet.destroy();
    keys = {};
  };
}

function sheetScreen(view, hymn) {
  document.body.classList.add('sheet-only');
  remember(hymn.id);
  if (!hymn.sheetId) {
    view.appendChild(h('div', {class: 'empty'}, h('h2', null, 'No sheet music for ' + hymn.id),
      h('p', null, h('a', {href: '#/h/' + hymn.id}, 'Back to the lyrics'))));
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
  const bPiano = btn('Piano', 'Piano sheet (P)', () => set({guitar: false}));
  const bGuitar = btn('Guitar', 'Guitar sheet (G)', () => set({guitar: true}));
  const bDown = btn('−', 'Transpose down a semitone (−)', () => set({shift: state.shift - 1}), 'step');
  const bUp = btn('+', 'Transpose up a semitone (+)', () => set({shift: state.shift + 1}), 'step');
  const keyLabel = h('button', {type: 'button', class: 'key', title: 'Back to the original key'}, '…');
  keyLabel.addEventListener('click', () => set({shift: 0}));
  const bStaff = btn('Staff', 'Show or hide the staff (H)', () => set({staff: !state.staff}), 'toggle');
  const bZoomOut = btn(icon('zoomOut'), 'Smaller (Z)', () => set({scale: state.scale - 5}), 'icon');
  const bZoomIn = btn(icon('zoomIn'), 'Bigger (Shift+Z)', () => set({scale: state.scale + 5}), 'icon');
  const bEdit = btn('Edit chords', 'Edit the chords of the piano sheet (E)', () => setEdit(!view.editing), 'edit');
  const bOrig = btn('Original chords', 'Show the sheet without your chord edits (O)', () => set({original: !state.original}), 'orig');
  bOrig.hidden = true;
  const bReset = btn(icon('reset'), 'Original key and size', () => set({shift: 0, scale: DEFAULT_SCALE}), 'icon');
  const other = full
    ? h('a', {class: 'tb icon', href: href('/h/' + hymn.id), title: 'Back to the lyrics (Esc)', 'aria-label': 'Back to the lyrics'}, icon('close'))
    : h('a', {class: 'tb icon', href: '#', title: 'Sheet only, for a music stand', 'aria-label': 'Sheet only',
      onclick: (e) => { e.preventDefault(); go(href('/sheet/' + hymn.id, sheetParams())); }}, icon('expand'));

  const bar = h('div', {class: 'sheet-bar', role: 'toolbar', 'aria-label': 'Sheet music'},
    h('div', {class: 'seg'}, bPiano, bGuitar),
    h('div', {class: 'transpose'}, bDown, keyLabel, bUp),
    bStaff,
    bEdit, bOrig,
    h('div', {class: 'zoom'}, bZoomOut, bZoomIn),
    bReset,
    h('span', {class: 'grow'}),
    other);
  const note = hymn.sheetId !== hymn.id
    ? h('p', {class: 'sheet-from'}, 'Music of ', h('a', {href: '#/h/' + hymn.sheetId}, hymn.sheetId),
      ' (', BY_CODE[splitId(hymn.sheetId).group].name, ')', hymn.lyricsId ? ', with the words of ' + hymn.id : '')
    : null;
  const host = h('div', {class: 'sheet-host'});
  append(pane, [full ? h('div', {class: 'sheet-title-bar'},
    h('a', {href: href('/h/' + hymn.id)}, chip(hymn.group, hymn.id)), ' ', h('span', null, hymn.first || '')) : null, bar, note, host]);

  const view = new SheetView(host);
  view.root.classList.toggle('dark', isDark());

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
    bStaff.textContent = state.staff ? 'Hide staff' : 'Show staff';
    bEdit.setAttribute('aria-pressed', String(view.editing));
    bEdit.textContent = view.editing ? 'Editing chords' : 'Edit chords';
    bOrig.hidden = !view.hasEdits();
    bOrig.setAttribute('aria-pressed', String(!!state.original));
    bDown.disabled = state.shift <= -MAX_SHIFT;
    bUp.disabled = state.shift >= MAX_SHIFT;
    bZoomOut.disabled = state.scale <= MIN_SCALE;
    bZoomIn.disabled = state.scale >= MAX_SCALE;
    bReset.hidden = !state.shift && state.scale === DEFAULT_SCALE;
    keyLabel.textContent = info.tonic ? info.tonic + (state.shift ? ' (' + (state.shift > 0 ? '+' : '') + state.shift + ')' : '') : '…';
    keyLabel.title = state.shift ? 'Transposed ' + (state.shift > 0 ? 'up ' : 'down ') + Math.abs(state.shift)
      + ' semitone' + (Math.abs(state.shift) > 1 ? 's' : '') + ' · click for the original key' : 'Original key';
    keyLabel.disabled = !state.shift;
  }
  view.onchange = (st, info) => updateBar(info);
  view.onedited = (kind) => { updateBar(); if (editor) editor.refresh(); };
  updateBar();
  view.show(hymn.sheetId, state, hymn.lyricsId);

  const onTheme = () => view.root.classList.toggle('dark', isDark());
  themeListeners.add(onTheme);
  return {
    set, state,
    setEdit,
    destroy() { if (editor) editor.destroy(); view.destroy(); themeListeners.delete(onTheme); },
  };
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

function rerenderSearch() {
  const view = $('#view');
  view.innerHTML = '';
  searchScreen(view, route.params.get('q') || '');
  document.title = 'Search · Hymns';
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
  if (onHymn) $('#hymnalHint').textContent = 'Opens ' + onHymn.id + ' in the hymnal you pick, where it has it.';
  grid.innerHTML = '';
  for (const g of shownGroups()) {
    const there = onHymn && g.code !== onHymn.group ? DB.relatedIn(onHymn.id, g.code) : null;
    grid.appendChild(h('button', {type: 'button', class: 'hymnal-card' + (g.code === currentGroup ? ' current' : ''),
      style: groupStyle(g.code), onclick: () => {
        dlg.close();
        if (onHymn && g.code === onHymn.group) return;
        setGroup(g.code);
        go(there ? '#/h/' + there : '#/browse/' + g.code);
      }},
    h('span', {class: 'code'}, g.code), h('span', {class: 'name', dir: 'auto'}, g.name),
    h('span', {class: 'count'}, there ? 'Has this hymn: ' + splitId(there).no : counts[g.code] + ' hymns')));
  }
}

// ---- favorites ----

// the Android app's export format: hymn IDs separated by commas
function favoritesText() { return favorites().join(',') + ','; }

function importFavorites(text) {
  const ids = (text || '').split(/[,\s]+/).map((x) => x.trim().toUpperCase()).filter((x) => x && DB.exists(x));
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
    toast('Copied: paste it into a message or a note');
  } catch (e) {
    toast('Could not copy');
  }
}

function favoritesScreen(view) {
  const favs = favorites().filter((id) => DB.exists(id));
  const box = h('div', {class: 'page'});
  view.appendChild(box);
  box.appendChild(h('h1', {class: 'page-title'}, icon('star'), 'Favorites'));
  if (!favs.length) {
    box.appendChild(h('p', {class: 'muted'}, 'No favorites yet. Tap the star on a hymn to add it here.'));
  } else {
    box.appendChild(h('section', {class: 'card list-card'}, h('ul', {class: 'hymn-list'}, favs.map((id) => {
      const row = hymnRow(DB.hymn(id), null);
      row.appendChild(h('button', {class: 'icon-btn remove', title: 'Remove from favorites', 'aria-label': 'Remove ' + id,
        onclick: () => { store.set('favorites', favorites().filter((x) => x !== id)); row.remove(); toast(id + ' removed'); }}, icon('close')));
      return row;
    }))));
  }
  const area = h('textarea', {class: 'paste', rows: 3, placeholder: 'Paste a favorites list here, e.g. E1,C215,NS151,'});
  box.appendChild(h('section', {class: 'card settings-card'},
    h('h2', null, 'Move favorites between devices'),
    h('p', {class: 'muted small'}, 'Works with the Android app: there, Settings → Import/Export Faves.'),
    h('div', {class: 'row'},
      h('button', {class: 'btn', disabled: !favs.length || null, onclick: () => shareText(favoritesText(), 'Hymn favorites')}, icon('share'), 'Export'),
      h('button', {class: 'btn', onclick: async () => {
        try { area.value = await navigator.clipboard.readText(); } catch (e) { area.focus(); }
      }}, 'Paste')),
    area,
    h('div', {class: 'row'}, h('button', {class: 'btn primary', onclick: () => {
      const n = importFavorites(area.value);
      if (!n && !area.value.trim()) { toast('Paste a list first'); return; }
      toast(n ? n + ' favorite' + (n > 1 ? 's' : '') + ' added' : 'Nothing new in that list');
      render();
    }}, 'Import'))));
}

// ---- settings ----

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

function settingsScreen(view) {
  const box = h('div', {class: 'page'});
  view.appendChild(box);
  box.appendChild(h('h1', {class: 'page-title'}, icon('settings'), 'Settings'));

  // display
  const themeNow = store.get('theme', null);
  const themeSeg = h('div', {class: 'seg'}, [[null, 'Device'], ['light', 'Light'], ['dark', 'Dark']].map(([t, label]) =>
    h('button', {type: 'button', 'aria-pressed': String(themeNow === t), onclick: () => { setTheme(t); render(); }}, label)));
  const sizeLabel = h('span', {class: 'size-label'}, Math.round(LYRIC_SIZES[lyricSize] * 100) + '%');
  const sizeRow = h('div', {class: 'setting'}, h('span', null, h('span', {class: 'label'}, 'Text size'), h('span', {class: 'hint'}, 'Lyrics')),
    h('div', {class: 'stepper'},
      h('button', {type: 'button', class: 'btn', 'aria-label': 'Smaller', onclick: () => { setLyricSize(lyricSize - 1); sizeLabel.textContent = Math.round(LYRIC_SIZES[lyricSize] * 100) + '%'; }}, icon('textSmaller')),
      sizeLabel,
      h('button', {type: 'button', class: 'btn', 'aria-label': 'Bigger', onclick: () => { setLyricSize(lyricSize + 1); sizeLabel.textContent = Math.round(LYRIC_SIZES[lyricSize] * 100) + '%'; }}, icon('textBigger'))));
  box.appendChild(h('section', {class: 'card settings-card'},
    h('h2', null, 'Display'),
    h('div', {class: 'setting'}, h('span', {class: 'label'}, 'Appearance'), themeSeg),
    sizeRow,
    toggleRow('Repeat the chorus', 'After every stanza, when a hymn has one chorus', repeatChorus,
      (on) => { repeatChorus = on; store.set('repeatChorus', on); }),
    toggleRow('Keep the screen on', 'wakeLock' in navigator ? 'While the app is open' : 'Not supported by this browser (on iPhone: iOS 18.4 or later)',
      keepAwake, (on) => { keepAwake = on; store.set('keepAwake', on); updateWakeLock(); })));

  // hymnals
  const counts = DB.groupCounts();
  box.appendChild(h('section', {class: 'card settings-card'},
    h('h2', null, 'Hymnals'),
    h('p', {class: 'muted small'}, 'Switch off the hymnals you do not use: they leave the lists, search and the “other languages” row.'),
    h('div', {class: 'hymnal-toggles'}, GROUPS.filter((g) => counts[g.code]).map((g) =>
      h('label', {class: 'hymnal-toggle', style: groupStyle(g.code)},
        h('input', {type: 'checkbox', checked: isShown(g.code) || null, onchange: (e) => {
          if (!e.target.checked && shownGroups().length <= 1) { e.target.checked = true; return; }
          setHidden(g.code, !e.target.checked);
          if (!e.target.checked && currentGroup === g.code) setGroup(shownGroups()[0].code);
        }}),
        h('span', {class: 'chip'}, g.code), h('span', {dir: 'auto'}, g.name))))));

  // chord edits
  const editsCard = h('section', {class: 'card settings-card'}, h('h2', null, 'Chord edits'));
  box.appendChild(editsCard);
  const editsInfo = h('p', {class: 'muted small'}, '…');
  const fileInput = h('input', {type: 'file', accept: '.json,application/json', hidden: true, onchange: async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    try {
      const r = await Edits.importAll(JSON.parse(await f.text()));
      toast(r.added + ' sheet' + (r.added === 1 ? '' : 's') + ' imported' + (r.kept ? ', ' + r.kept + ' kept (newer here)' : ''));
      render();
    } catch (err) {
      toast(err.message || 'Could not read that file');
    }
  }});
  const editedList = h('ul', {class: 'hymn-list'});
  append(editsCard, [
    h('p', {class: 'muted small'}, 'Chords you change on a piano sheet (Edit chords) are saved on this device. Export them to keep a copy, '
      + 'to move them to another device, or to send them in so they can go into the sheets for everyone.'),
    editsInfo, editedList,
    h('div', {class: 'row'},
      h('button', {class: 'btn', onclick: async () => {
        const data = await Edits.exportAll();
        if (!Object.keys(data.sheets).length) { toast('No chord edits yet'); return; }
        downloadFile('hymns-chord-edits-' + new Date().toISOString().slice(0, 10) + '.json', JSON.stringify(data, null, 1), 'application/json');
      }}, icon('share'), 'Export'),
      h('button', {class: 'btn', onclick: () => fileInput.click()}, 'Import'), fileInput)]);
  Edits.all().then((list) => {
    editsInfo.textContent = list.length ? list.length + ' sheet' + (list.length > 1 ? 's' : '') + ' with edits:' : 'No chord edits yet.';
    list.sort((a, b) => b.updated - a.updated);
    for (const r of list) {
      const hm = DB.hymn(r.sheet);
      if (hm) editedList.appendChild(hymnRow(hm, h('span', {class: 'snippet'}, Object.keys(r.bars).length + ' bars · ' + new Date(r.updated).toLocaleDateString())));
    }
  });

  // offline
  const offlineStatus = h('p', {class: 'muted small'}, '');
  const offlineBtn = h('button', {class: 'btn', onclick: async () => {
    offlineBtn.disabled = true;
    offlineStatus.textContent = 'Downloading the sheet music…';
    try {
      if (navigator.storage && navigator.storage.persist) await navigator.storage.persist();
      await prefetchAll();
      offlineStatus.textContent = 'All sheet music is on this device.';
      store.set('offlineAll', DB.version.build);
    } catch (e) {
      offlineStatus.textContent = 'Download stopped: ' + e.message;
    }
    offlineBtn.disabled = false;
  }}, 'Download all sheet music');
  const sw = 'serviceWorker' in navigator && window.isSecureContext;
  offlineStatus.textContent = !sw ? 'Offline use needs the app’s https address.'
    : store.get('offlineAll', null) ? 'Sheet music was downloaded for offline use.' : 'The hymns work offline. Sheets you have opened do too; download all of them here.';
  box.appendChild(h('section', {class: 'card settings-card'},
    h('h2', null, 'Offline'), offlineStatus, sw ? h('div', {class: 'row'}, offlineBtn) : null));

  // about
  const v = DB.version || {};
  box.appendChild(h('section', {class: 'card settings-card about'},
    h('h2', null, 'About'),
    h('p', null, 'Hymns ', v.app || '', ' · ', (v.hymns || 0).toLocaleString(), ' hymns · data of ', v.built || '?'),
    h('p', {class: 'muted small'}, 'The same hymns as the Android app ',
      h('a', {href: 'https://play.google.com/store/apps/details?id=com.lemuelinchrist.android.hymns', target: '_blank', rel: 'noopener'}, 'Hymns For Android'),
      '. Sheet music from www.hymnal.net, engraved with Verovio (LGPL). ',
      h('a', {href: 'https://github.com/lemuelinchrist/hymnsforandroid', target: '_blank', rel: 'noopener'}, 'Source code'), '.'),
    h('p', {class: 'muted small'}, 'Feedback: ', h('a', {href: 'mailto:lemuelinchrist@gmail.com'}, 'lemuelinchrist@gmail.com')),
    window.matchMedia('(pointer: coarse)').matches ? null
      : h('p', null, h('button', {class: 'link', onclick: () => $('#helpDialog').showModal()}, 'Keyboard shortcuts'))));
}

// ---- start ----

function setupServiceWorker() {
  if (!('serviceWorker' in navigator) || !window.isSecureContext) return;
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.register('sw.js').catch((e) => console.warn('service worker', e));
  // a new build took over: offer to reload (not done by itself, so an edit in progress is not lost)
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController) return;
    const t = $('#toast');
    t.textContent = '';
    t.appendChild(document.createTextNode('A new version is ready. '));
    t.appendChild(h('button', {class: 'link toast-link', onclick: () => location.reload()}, 'Reload'));
    t.classList.add('show', 'sticky');
  });
}

async function start() {
  applyTheme();
  setLyricSize(lyricSize);
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => themeListeners.forEach((f) => f()));
  for (const d of document.querySelectorAll('dialog')) {
    d.addEventListener('click', (e) => { if (e.target === d) d.close(); });   // a click outside closes it
  }
  for (const b of document.querySelectorAll('[data-close]')) b.addEventListener('click', () => b.closest('dialog').close());
  for (const t of document.querySelectorAll('.tabbar .ti')) t.appendChild(icon(t.dataset.icon));
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
      $('#loadingText').textContent = 'Downloading hymns… ' + Math.round(f * 100) + '%';
    });
  } catch (e) {
    console.error(e);
    $('#loadingText').textContent = 'Could not load the hymns: ' + e.message;
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
