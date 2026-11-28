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
import {setHost, host} from './host.js';
import {fetchGzJson, loadScript, cacheDataResponse} from './files.js';
import * as Edits from './edits.js';
import * as Player from './player.js';
import {h, append, icon, store, toast, stickyToast, isDark, popupMenu, themeListeners} from './ui.js';

// ---- where the sheet code gets its sheets (host.js; the Android app's viewer has its own) ----

// sheets and sheet lyrics come in one file per hymnal (build.py)
async function fromPack(kind, id) {
  const g = (/^([A-Z]{1,3})\d/.exec(id) || [])[1];
  const file = g && DB.version && DB.version[kind][g];
  if (!file) return null;
  const pack = await fetchGzJson(file);
  return pack[id] || null;
}

setHost({
  verovio: () => 'verovio/verovio-toolkit-wasm.js' + (DB.version ? '?v=' + DB.version.verovio : ''),
  mei: async (id) => {
    const xml = await fromPack('sheets', id);
    if (!xml) throw new Error('no sheet ' + id);
    return xml;
  },
  lyrics: (id) => fromPack('lyrics', id),
});

// the hymnals' sheet files and lazy viewer scripts, for offline use (the service worker keeps what is fetched)
async function prefetchAll() {
  const v = DB.version;
  const files = v ? [...Object.values(v.sheets), ...Object.values(v.lyrics)] : [];
  const lazy = v && v.lazy ? v.lazy : [];
  const verovioUrl = v && v.verovio ? 'verovio/verovio-toolkit-wasm.js?v=' + v.verovio : null;
  const fetchOk = async (url) => {
    const r = await fetch(url);
    if (!r.ok) throw new Error('HTTP ' + r.status + ' for ' + url);
    return r;
  };
  return Promise.all([
    verovioUrl ? fetchOk(verovioUrl).then((r) => cacheDataResponse(verovioUrl, r)) : null,
    ...files.map((f) => fetchGzJson(f)),
    ...lazy.map((f) => fetchOk(f)),
  ]);
}

async function waitForSwController() {
  if (!('serviceWorker' in navigator) || !window.isSecureContext) return;
  await navigator.serviceWorker.ready.catch(() => {});
  if (navigator.serviceWorker.controller) return;
  await new Promise((resolve) => {
    let timer;
    const done = () => {
      clearTimeout(timer);
      navigator.serviceWorker.removeEventListener('controllerchange', done);
      resolve();
    };
    navigator.serviceWorker.addEventListener('controllerchange', done, {once: true});
    timer = setTimeout(done, 5000);
  });
}

// every sheet, lyric, tune and deferred module for offline use. Starts by itself a little after the app is open
// (background: three tunes at a time, not on a data saver) and the Offline card in Settings shows progress.
let offlineRunning = false, offlineText = '', offlineListener = null;
function offlineSay(text) { offlineText = text; if (offlineListener) offlineListener(); }
async function offlineDownload(background) {
  if (offlineRunning) return;
  offlineRunning = true;
  const unsub = DB.onFullProgress((f) => offlineSay(tr('Downloading hymns… {0}%', Math.round(f * 100))));
  try {
    if (navigator.storage && navigator.storage.persist) await navigator.storage.persist();
    await DB.whenFull();
    await DB.whenSaved();
    unsub();
    offlineSay(tr('Downloading the sheet music…'));
    await waitForSwController();
    await prefetchAll();
    const failed = await Player.prefetch(DB.allTuneFiles(), (f) => offlineSay(tr('Downloading the tunes… {0}%', Math.round(f * 100))), background ? 3 : 8);
    if (failed) throw new Error(tn('{0} tune could not be fetched', '{0} tunes could not be fetched', failed));
    store.set('offlineAll', DB.version.build);
    offlineText = '';
    offlineSay(tr('All sheet music and tunes are on this device.'));
  } catch (e) {
    unsub();
    offlineSay(tr('Download stopped: {0}', e.message));
  }
  offlineRunning = false;
  if (offlineListener) offlineListener();
}

function offlineInBackground() {
  if (!('serviceWorker' in navigator) || !window.isSecureContext) return;
  if (navigator.connection && navigator.connection.saveData) return;
  navigator.serviceWorker.ready.then(() => setTimeout(() => {
    if (store.get('offlineAll', null) !== DB.version.build) offlineDownload(true);
  }, 8000)).catch(() => {});
}

// ---- small helpers ----

const $ = (sel, root = document) => root.querySelector(sel);

function groupStyle(code) {
  const g = BY_CODE[code];
  return `--gd:${g.day};--gn:${g.night}`;
}

function chip(code, text) {
  return h('span', {class: 'chip', style: groupStyle(code)}, text || code);
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

// a new person starts in the first book of the app's language (Android's first_hymn): C1 in Traditional Chinese, Z1 in Simplified
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


// 'light', 'dark', 'black', or null to follow the device
function setTheme(t) {
  store.set('theme', t);
  applyTheme();
  themeListeners.forEach((f) => f());
}

// 0 is Extra Small (the web app only), 1-5 are the Android app's Small ... XXL; 6 is bigger still (the A buttons on a hymn)
const LYRIC_SIZES = [0.8, 1, 1.12, 1.25, 1.4, 1.6, 1.85];
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
let renderSeq = 0;

function parseHash() {
  const hash = location.hash.slice(1) || '/';
  let raw;
  try {
    raw = decodeURI(hash);
  } catch (e) {
    raw = hash;
  }
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

// Inline loading progress card shown when opening Search or Browse while the background SQLite database is still downloading.
async function waitForFullDb(view, seq) {
  if (DB.isFull()) return true;
  const bar = h('div', {class: 'progress-fill', style: 'height:100%;width:0;background:#3D577A;transition:width .2s'});
  const msg = h('p', {class: 'loading-msg'}, tr('Downloading hymns… {0}%', 0));
  const box = h('div', {class: 'loading-box', style: 'margin:24px auto'},
    msg, h('div', {class: 'progress'}, bar),
    h('p', {class: 'muted small'}, tr('Only the first visit downloads the hymns; after that they open straight from this device, also offline.')));
  view.appendChild(box);
  document.body.classList.add('ready');
  let unsub = null;
  unsub = DB.onFullProgress((f) => {
    if (seq !== renderSeq) { if (unsub) unsub(); return; }
    const pct = Math.round(f * 100);
    bar.style.width = pct + '%';
    msg.textContent = tr('Downloading hymns… {0}%', pct);
  });
  try {
    await DB.whenFull();
  } catch (e) {
    if (seq === renderSeq) view.replaceChildren(h('div', {class: 'empty'}, h('p', null, tr('Could not load the hymns: {0}', e.message))));
    return false;
  } finally {
    if (unsub) unsub();
  }
  if (seq !== renderSeq) return false;
  view.innerHTML = '';
  return true;
}

async function render() {
  const seq = ++renderSeq;
  route = parseHash();
  onInstallPrompt = null;
  if (cleanup) { cleanup(); cleanup = null; }
  const view = $('#view');
  view.innerHTML = '';
  view.className = '';
  document.body.classList.remove('sheet-only');
  const [screen, arg] = route.parts;
  if (screen !== 'h' && screen !== 'sheet') swapBack = null;   // a detour (home, search, settings) ends the back-to-hymn button
  if (screen !== 'search') $('#q').value = '';
  shownDepth = depth();
  $('#backBtn').hidden = !screen || shownDepth === 0;
  const tab = !screen ? 'home' : ['browse', 'favorites', 'settings'].includes(screen) ? screen : null;
  $('#favoritesTop').classList.toggle('current', tab === 'favorites');
  $('#settingsTop').classList.toggle('current', tab === 'settings');
  window.scrollTo(0, 0);

  let title = tr('Hymns');
  try {
    if (!screen) {
      homeScreen(view, seq);
    } else if (screen === 'search') {
      await searchScreen(view, route.params.get('q') || '', seq);
      title = tr('Search') + ' · ' + title;
    } else if (screen === 'browse' && (!arg || BY_CODE[arg.toUpperCase()])) {
      const code = arg ? arg.toUpperCase() : currentGroup;
      if (!DB.isFull() && !await waitForFullDb(view, seq)) return;
      browseScreen(view, code);
      title = BY_CODE[code].name + ' · ' + title;
    } else if (screen === 'favorites') {
      await favoritesScreen(view, seq);
      title = tr('Favorites') + ' · ' + title;
    } else if (screen === 'settings') {
      settingsScreen(view, seq);
      title = tr('Settings') + ' · ' + title;
    } else if ((screen === 'h' || screen === 'sheet') && arg) {
      const hymn = DB.hymn(arg) || (!DB.isFull() ? await DB.ensureHymn(arg) : null);
      if (seq !== renderSeq) return;
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
    if (seq !== renderSeq) return;
    console.error(e);
    view.appendChild(h('div', {class: 'empty'}, h('h2', null, tr('Something went wrong')), h('p', null, String(e))));
  }
  if (seq === renderSeq) document.title = title;
}

function notFound(view, what) {
  view.appendChild(h('div', {class: 'empty'},
    h('h2', null, tr('No hymn “{0}”', what)),
    h('p', null, tr('It may have been removed or renumbered. '), h('a', {href: '#/'}, tr('Back to the start')))));
}

// ---- home ----

// A closed hint comes back after a day (the older 'installHintClosed' choice is no longer read, so it comes back too)
const INSTALL_HINT_REST = 24 * 60 * 60 * 1000;

// iPhone and iPad: Safari has no install prompt, so say how (until it is installed or the hint is closed)
function installHint() {
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const installed = navigator.standalone || window.matchMedia('(display-mode: standalone)').matches;
  if (installed || Date.now() - store.get('installHintClosedAt', 0) < INSTALL_HINT_REST) return null;
  if (!ios && !deferredInstall) return null;
  const box = h('section', {class: 'install card'},
    h('img', {src: 'icons/apple-touch-icon.png', alt: '', width: 44, height: 44}),
    h('div', null,
      h('b', null, tr('Install Hymns on this {0}', tr(ios ? (/iPad/.test(navigator.userAgent) ? 'iPad' : 'iPhone') : 'device'))),
      ios ? h('p', null, trh('Tap {0} Share, then {1}. It opens like an app and works without internet.', icon('share'), h('b', null, tr('Add to Home Screen'))))
        : h('p', null, trh('It opens like an app and works without internet. {0}',
          h('button', {class: 'link', onclick: async () => { deferredInstall.prompt(); deferredInstall = null; box.remove(); }}, tr('Install'))))),
    h('button', {class: 'icon-btn', 'aria-label': tr('Close'), onclick: () => { store.set('installHintClosedAt', Date.now()); box.remove(); }}, icon('close')));
  return box;
}

let deferredInstall = null;   // Chrome/Android's install prompt, kept for the hint's Install button
let onInstallPrompt = null;

// The same hint at the top of a hymn page (above its number): a link from a video or a message opens the hymn, never the home screen. Chrome
// fires its install prompt after the page has loaded, so a hint that was not possible yet is added when the prompt arrives.
function installHintFor(pane) {
  const box = installHint();
  if (box) { pane.prepend(box); return; }
  onInstallPrompt = () => {
    const late = pane.isConnected && !pane.querySelector('.install') ? installHint() : null;
    if (late) pane.prepend(late);
  };
}

function homeScreen(view, seq) {
  const counts = DB.groupCounts();
  const list = (ids) => h('ul', {class: 'hymn-list'}, ids.map((id) => hymnRow(DB.hymn(id))));
  const touch = window.matchMedia('(pointer: coarse)').matches;
  const listsBox = h('div', {class: 'home-lists'});
  let hero = null;

  const drawLists = () => {
    const recent = store.get('recent', []).filter((id) => DB.exists(id)).slice(0, 8);
    const favs = favorites().filter((id) => DB.exists(id)).slice(0, 8);
    if (hero) hero.hidden = !!(recent.length || favs.length);
    listsBox.replaceChildren(
      // Favorites always shows (also empty): on phones it is the way to the Favorites page and its import
      h('section', {class: 'card'}, h('h2', null, icon('star'), tr('Favorites'),
        h('a', {class: 'link small', href: '#/favorites'}, favs.length ? tr('All') : tr('Import'))),
        favs.length ? list(favs) : h('p', {class: 'muted small home-empty'},
          tr('Tap the star on a hymn to keep it here, or import your favorites from the Android app.'))),
      recent.length ? h('section', {class: 'card'}, h('h2', null, tr('Recently opened'),
        h('button', {class: 'link small', onclick: () => { store.set('recent', []); render(); }}, tr('Clear'))), list(recent)) : null);
  };

  hero = h('section', {class: 'hero'},   // first-run hint only
    h('h1', null, tr('Hymns')),
    h('p', null, trh('Type a number to open it in {0}, or a few words from any line to search every hymnal.', h('b', null, BY_CODE[currentGroup].name))),
    h('div', {class: 'hero-tips'},
      h('button', {class: 'tip', onclick: () => go('#/h/' + currentGroup + '1')}, currentGroup + ' 1'),
      h('button', {class: 'tip', onclick: () => searchFor('blessings flow')}, '“blessings flow”'),
      h('button', {class: 'tip', onclick: () => searchFor('NS 151')}, 'NS 151'),
      touch ? null : h('button', {class: 'tip', onclick: () => $('#helpDialog').showModal()}, icon('keyboard'), tr('Shortcuts'))));
  drawLists();

  const home = h('div', {class: 'home'},
    hero,
    listsBox,
    h('section', {class: 'hymnals'},
      h('h2', null, tr('Hymnals')),
      h('div', {class: 'hymnal-grid'}, shownGroups().map((g) =>
        h('a', {class: 'hymnal-card' + (g.code === currentGroup ? ' current' : ''), href: '#/browse/' + g.code,
          style: groupStyle(g.code)},
          h('span', {class: 'code'}, g.code),
          h('span', {class: 'name', dir: 'auto'}, g.name),
          h('span', {class: 'count'}, bookSubtitle(g.code, tn('{0} hymn', '{0} hymns', counts[g.code]))))))));
  view.appendChild(home);
  installHintFor(home);   // Chrome may fire its install prompt after this screen is drawn

  if (!DB.isFull()) {
    const needed = [...store.get('recent', []).slice(0, 8), ...favorites().slice(0, 8)];
    if (needed.some((id) => !DB.hymn(id))) {
      DB.ensureHymns(needed).then(() => { if (seq === renderSeq && home.isConnected) drawLists(); });
    }
  }
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
    case 'title': return {text: x.title || ''};
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

async function searchScreen(view, q, seq) {
  const all = route.params.get('all') === '1';
  const only = ['music', 'people'].includes(route.params.get('in')) ? route.params.get('in') : null;
  // keep what is being typed (a space at the end); the URL has the text trimmed
  if ($('#q').value.trim() !== q) $('#q').value = q;
  const pq = DB.parseQuery(q, currentGroup);

  if (pq.id) {
    const main = DB.hymn(pq.id) || (!DB.isFull() ? await DB.ensureHymn(pq.id) : null);
    if (seq !== renderSeq) return;
    const box = h('div', {class: 'search'});
    view.replaceChildren(box);
    box.appendChild(h('h1', {class: 'results-title'}, main ? tr('Go to {0}', main.id) : tr('No hymn {0}', pq.id)));
    if (main) box.appendChild(h('ul', {class: 'hymn-list big'}, hymnRow(main, h('span', {class: 'enter'}, 'Enter ↵'))));
    if (pq.number) {
      if (DB.isFull()) {
        const no = pq.id.replace(/^\D+/, '');
        const others = shownGroups().filter((g) => g.code !== currentGroup).map((g) => DB.hymn(g.code + no)).filter(Boolean);
        if (others.length) {
          box.appendChild(h('h2', {class: 'results-sub'}, tr('Number {0} in other hymnals', no)));
          box.appendChild(h('ul', {class: 'hymn-list'}, others.map((o) => hymnRow(o))));
        }
      } else {
        DB.whenFull().then(() => { if (seq === renderSeq) searchScreen(view, q, seq); }, () => {});
      }
    }
    return;
  }
  if (!pq.words.length) {
    const box = h('div', {class: 'search'});
    view.replaceChildren(box);
    box.appendChild(h('div', {class: 'empty'}, h('p', null, tr('Type a number or some words.'))));
    return;
  }
  if (!DB.isFull() && !await waitForFullDb(view, seq)) return;
  const box = h('div', {class: 'search'});
  view.appendChild(box);

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
    ? [['shareNodes', tr('Share lyrics'), () => shareNow(lyricsText(hymn), title)], ['link', tr('Share link'), () => shareNow(hymnLink(hymn), title)], ['copy', tr('Copy lyrics'), () => copyLyrics(hymn)]]
    : [['copy', tr('Copy lyrics'), () => copyLyrics(hymn)], ['link', tr('Copy link'), () => copyText(hymnLink(hymn), tr('Link copied'))]];
  popupMenu(anchor, items.map(([ic, label, fn]) => ({icon: ic, label, run: fn})));
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

// A card of the hymn page that folds into its title row (as the Android app's JUKEBOX and LISTEN AND LINKS, which fold as
// its OTHER LANGUAGES does): a tap on "TITLE      Hide ▴" hides the rest of the card, "Show ▾" brings it back. Kept for
// every hymn (store key). -> the card's h2
function foldTitle(card, title, key) {
  const act = h('span', {class: 'fold-act'});
  const btn = h('button', {type: 'button', class: 'fold-head'}, h('span', null, title), act);
  const show = (folded) => {
    card.classList.toggle('folded', folded);
    btn.setAttribute('aria-expanded', String(!folded));
    act.textContent = folded ? tr('Show') + ' ▾' : tr('Hide') + ' ▴';
  };
  btn.addEventListener('click', () => { const folded = !card.classList.contains('folded'); store.set(key, folded); show(folded); });
  show(!!store.get(key, false));
  return h('h2', null, btn);
}

// The jukebox (Proposal 1 Unified Bottom Dock on the lyrics tab): floating frosted bottom mini-player matching the
// sheet viewer's dock, with a 3px top progress bar, slim 1-row Play/Style/Loop/Expand/Close bar, and an expandable
// drawer with 4 category tabs (Hymn's own | Piano | Guitar | Melody), Dice randomizer, horizontal style chips with
// attached refresh shuffle side-buttons (Flowing, Lively, Fingerpicking), Chorale More walking switch, and Tempo slider.
function jukeboxCard(hymn, stopOthers, onChange) {
  const JB_IC = {
    play: '<svg viewBox="0 0 24 24" width="17" height="17" fill="currentColor" aria-hidden="true"><path d="M7.5 5.2v13.6L19 12z"/></svg>',
    stop: '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>',
    loop: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17 2l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="M7 22l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>',
    chevUp: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 15l-6-6-6 6"/></svg>',
    chevDown: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>',
    close: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12"/></svg>',
    refresh: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a9 9 0 1 1-2.64-6.36L21 8"/><path d="M21 3v5h-5"/></svg>',
  };
  const el = h('section', {class: 'ud-dock jukebox-dock', hidden: true, role: 'region', 'aria-label': tr('Jukebox')});
  const prefs = Object.assign({loop: true}, store.get('jukebox', {}), {speed: 1});   // the tempo is not kept: every hymn starts at its own
  const keep = () => store.set('jukebox', {loop: !!prefs.loop});
  let J = null, info = null, juke = null, playing = false, disposed = false, expanded = true, startIt = null, stopIt = null, ro = null;
  const setHeight = () => {
    if (!el.hidden) document.body.style.setProperty('--editor-h', (el.offsetHeight + 14) + 'px');
  };
  const syncBody = () => {
    document.body.classList.toggle('jukebox-open', !el.hidden);
    if (el.hidden) document.body.style.removeProperty('--editor-h');
    else setHeight();
  };
  const changed = () => { if (onChange) onChange(); };
  const ready = (async () => {
    try {
      const [mod, xml] = await Promise.all([import('./jukebox.js'), host.mei(hymn.sheetId)]);
      J = mod; info = J.sheetInfo(xml);
      if (disposed || !info.playable) return false;
      build();
      return true;
    } catch (e) { return false; /* no sheet to read: no jukebox */ }
  })();
  // Play: shows the dock and plays in it, or, while it plays, stops it (the dock stays). false: nothing to play
  async function toggle() {
    Player.unlock();
    if (!(await ready) || disposed) return false;
    if (playing) { stopIt(); return true; }
    el.hidden = false;
    syncBody();
    startIt();
    changed();
    return true;
  }
  function close() { if (playing) stopIt(); el.hidden = true; syncBody(); changed(); }

  function build() {
    prefs.speed = Math.max(J.MIN_SPEED, Math.min(J.MAX_SPEED, +prefs.speed || 1));
    const subsOf = (gid) => J.STYLES.filter((x) => x.group === gid);
    const randomIn = (gid, not) => {
      let pool = subsOf(gid).filter((x) => x.random && x.id !== not);
      if (!pool.length) pool = subsOf(gid).filter((x) => x.id !== not);
      return pool[Math.floor(Math.random() * pool.length)] || null;
    };
    let curStyle = J.styleFor(null, info.own), curSeed = 0, curWalk = false;
    if (subsOf(curStyle.group).length > 1) curStyle = randomIn(curStyle.group);

    const fill = h('i');
    const progBar = h('div', {class: 'ud-prog', 'aria-hidden': 'true'}, fill);
    const playBtn = h('button', {class: 'ud-play', type: 'button', 'aria-pressed': 'false'});
    const nameEl = h('div', {class: 'ud-name'});
    const tempoBadge = h('span');
    const extraBadge = h('span');
    const barBadge = h('span');
    const subEl = h('div', {class: 'ud-sub'}, tempoBadge, extraBadge, barBadge);
    const metaBtn = h('button', {class: 'ud-meta', type: 'button', 'aria-expanded': 'true', title: tr('Style & tempo')}, nameEl, subEl);
    const loopBtn = h('button', {class: 'ud-icbtn ud-loop', type: 'button', 'aria-pressed': String(!!prefs.loop), title: tr('Play again and again'), 'aria-label': tr('Loop')});
    loopBtn.innerHTML = JB_IC.loop;
    const expandBtn = h('button', {class: 'ud-icbtn ud-expand', type: 'button', 'aria-expanded': 'true', title: tr('Style & tempo'), 'aria-label': tr('Style & tempo')});
    const closeBtn = h('button', {class: 'ud-icbtn ud-close', type: 'button', title: tr('Close the jukebox'), 'aria-label': tr('Close the jukebox'), onclick: close});
    closeBtn.innerHTML = JB_IC.close;
    const bar = h('div', {class: 'ud-bar'}, playBtn, metaBtn, loopBtn, expandBtn, closeBtn);

    const tabsEl = h('div', {class: 'ud-tabs', role: 'group', 'aria-label': tr('Category')});
    const chipRail = h('div', {class: 'ud-rail', role: 'group', 'aria-label': tr('Style')});
    const tempoBtn = h('button', {class: 'ud-tempo', type: 'button', title: tr('The hymn\'s own tempo')});
    const speed = h('input', {class: 'ud-speed', type: 'range', min: String(J.MIN_SPEED), max: String(J.MAX_SPEED), step: '0.05', 'aria-label': tr('Tempo')});
    speed.value = String(prefs.speed);
    const mixWrap = h('div', {class: 'ud-mix'});
    const optRow = h('div', {class: 'ud-row'}, h('div', {class: 'ud-tempo-wrap'}, tempoBtn, speed), mixWrap);
    const drawer = h('div', {class: 'ud-drawer'}, tabsEl, chipRail, optRow);

    el.append(progBar, bar, drawer);
    ro = new ResizeObserver(setHeight);
    ro.observe(el);

    const setExpanded = (on) => {
      expanded = !!on;
      drawer.hidden = !expanded;
      el.classList.toggle('open', expanded);
      metaBtn.setAttribute('aria-expanded', String(expanded));
      expandBtn.setAttribute('aria-expanded', String(expanded));
      expandBtn.classList.toggle('on', expanded);
      expandBtn.innerHTML = expanded ? JB_IC.chevDown : JB_IC.chevUp;
      setHeight();
    };
    metaBtn.addEventListener('click', () => setExpanded(!expanded));
    expandBtn.addEventListener('click', () => setExpanded(!expanded));
    setExpanded(true);

    const catBtns = new Map();
    for (const grp of J.GROUPS) {
      if (grp.id === 'own' && !info.own) continue;
      const b = h('button', {type: 'button', 'aria-pressed': 'false'}, tr(grp.name));
      b.addEventListener('click', () => {
        if (grp.id === curStyle.group) return;
        choose(subsOf(grp.id).length > 1 ? randomIn(grp.id) : J.STYLES.find((x) => x.group === grp.id), 0);
      });
      catBtns.set(grp.id, b);
      tabsEl.appendChild(b);
    }

    function renderStyles() {
      const subs = subsOf(curStyle.group);
      const parts = [tr(curStyle.name)];
      if (curStyle.walk && curWalk) parts.push(tr('More walking'));
      if (curStyle.shuffle && curSeed > 0) parts.push(tr('Shuffled'));
      nameEl.textContent = parts.join(' · ');
      extraBadge.textContent = prefs.loop ? ' · ' + tr('Loop') : '';
      for (const [gid, b] of catBtns) b.setAttribute('aria-pressed', String(gid === curStyle.group));

      chipRail.textContent = '';
      if (subs.length > 1) {
        chipRail.hidden = false;
        for (const st of subs) {
          const on = st.id === curStyle.id;
          if (st.shuffle) {
            const wrap = h('span', {class: 'ud-split' + (on ? ' active' : '')});
            const main = h('button', {class: 'ud-chip ud-split-main', type: 'button', 'aria-pressed': String(on)}, tr(st.name));
            main.addEventListener('click', () => choose(st, 0));
            const side = h('button', {class: 'ud-chip ud-split-side', type: 'button', title: tr('Shuffle this style\'s phrasing'), 'aria-label': tr('Shuffle Style')});
            side.innerHTML = JB_IC.refresh;
            side.addEventListener('click', () => choose(st, 1 + Math.floor(Math.random() * 99999)));
            wrap.append(main, side);
            chipRail.appendChild(wrap);
          } else {
            const b = h('button', {class: 'ud-chip', type: 'button', 'aria-pressed': String(on)}, tr(st.name));
            b.addEventListener('click', () => choose(st, 0));
            chipRail.appendChild(b);
          }
        }
      } else {
        chipRail.hidden = true;
      }

      mixWrap.textContent = '';
      if (curStyle.walk) {
        const sw = h('button', {class: 'ud-switch', type: 'button', role: 'switch', 'aria-checked': String(curWalk), title: tr('The bass and the tenor walk between the chords more often')},
          h('span', {class: 'ud-track', 'aria-hidden': 'true'}), h('span', {class: 'ud-switch-lbl'}, tr('More walking')));
        sw.addEventListener('click', () => { curWalk = !curWalk; renderStyles(); again(); });
        mixWrap.appendChild(sw);
      }
      setHeight();
    }

    function choose(st, seed = 0) {
      if (!st) return;
      if (st.id === curStyle.id && seed === curSeed) return;
      curStyle = st;
      curSeed = st.shuffle ? seed : 0;
      renderStyles();
      again();
    }

    const showTempo = () => {
      const txt = '♩ = ' + Math.round(info.bpm * prefs.speed);
      tempoBtn.textContent = txt;
      tempoBadge.textContent = txt;
    };
    const show = () => {
      playBtn.innerHTML = playing ? JB_IC.stop : JB_IC.play;
      playBtn.setAttribute('aria-pressed', String(playing));
      changed();
      const label = playing ? tr('Stop') : tr('Play');
      playBtn.title = label;
      playBtn.setAttribute('aria-label', label);
      loopBtn.classList.toggle('on', !!prefs.loop);
      loopBtn.setAttribute('aria-pressed', String(!!prefs.loop));
      extraBadge.textContent = prefs.loop ? ' · ' + tr('Loop') : '';
      if (!playing) { fill.style.width = '0'; barBadge.textContent = ''; }
    };
    const onBar = (barNo, bars) => {
      fill.style.width = (100 * barNo / Math.max(1, bars)) + '%';
      barBadge.textContent = ' · ' + tr('Bar {0} of {1}', barNo, bars);
    };
    const options = () => ({style: curStyle.id, loop: !!prefs.loop, speed: prefs.speed, seed: curSeed, walk: !!(curStyle.walk && curWalk)});
    function start() {
      if (!playing) {
        stopOthers();
        if (juke) juke.stop();
        juke = J.jukeboxPlayer({
          load: async () => {
            await loadScript('music.js');
            const [xml, saved] = await Promise.all([host.mei(hymn.sheetId), host.edits.get(hymn.sheetId).catch(() => null)]);
            return {xml, edits: saved && saved.bars};
          },
          onBar, onStop: () => { playing = false; show(); }});
      }
      playing = true;
      show();
      juke.play(options()).catch((e) => { console.error(e); playing = false; show(); toast(tr('Sorry, no tune for this hymn')); });
    }
    const again = () => { if (playing) start(); };
    startIt = start;
    stopIt = () => { if (juke) juke.stop(); playing = false; show(); };
    playBtn.addEventListener('click', () => { if (playing) stopIt(); else start(); });
    speed.addEventListener('input', () => { prefs.speed = parseFloat(speed.value) || 1; showTempo(); });
    speed.addEventListener('change', () => { keep(); again(); });
    tempoBtn.addEventListener('click', () => { speed.value = '1'; prefs.speed = 1; showTempo(); keep(); again(); });
    loopBtn.addEventListener('click', () => { prefs.loop = !prefs.loop; keep(); show(); again(); });
    renderStyles();
    showTempo();
    show();
  }
  return {el, ready, toggle, close, get playing() { return playing; }, stopPlay() { if (playing) stopIt(); },
    stop() { disposed = true; if (ro) ro.disconnect(); if (juke) juke.stop(); document.body.classList.remove('jukebox-open'); }};
}

// the card under the details for links that open outside the app (the Android app's "Listen and links" card), in sections:
// Recordings (the hymn's sung YouTube and SoundCloud links, or those of the nearest hymn above it that has some),
// Instrumental (its instrumental recordings, each with a music-note icon and an Instrumental pill), Piano videos
// (its parent's when it has none), New tunes (the Be Filled hymns with another tune for its words, each with its own
// recordings under it) and Search (YouTube and SoundCloud). A link is a row of at least 56 px (icon, who made it, which
// album, an arrow); where the card is wide (a tablet, an unfolded phone) the links are cards in a grid (app.css). A section
// shows its first LINKS_SHOWN links and a "Show N more" button; the links a book's editor chose (no publisher, no album: the
// Spanish and German youth books) are always shown.
const LINKS_SHOWN = 3;
function linksNode(hymn) {
  const open = {};   // section key -> all links shown
  const platform = (kind) => (kind === 'soundcloud' ? 'SoundCloud' : 'YouTube');
  // no recording of its own: the nearest hymn above it that has some; in another language each link says which
  // ("English – NYCYPCD") so nobody takes an English recording for a Spanish one
  const up = DB.inheritedLinks(hymn);
  const language = up && (languageName(splitId(up.from).group) || DB.languageOf(splitId(up.from).group));
  const foreign = up && DB.languageOf(splitId(up.from).group) !== DB.languageOf(hymn.group);
  const recItem = (r, tuneId, useForeign = true) => {
    const title = r.label || r.album || platform(r.kind);
    const sub = r.label ? (r.album || platform(r.kind)) : (r.album ? platform(r.kind) : null);
    return {icon: r.instrumental ? 'note' : (r.kind === 'soundcloud' ? 'cloud' : 'play'),
      title: !tuneId && useForeign && foreign ? language + ' – ' + title : title,
      sub: tuneId ? (sub ? tuneId + ' · ' + sub : tuneId) : sub, tag: r.instrumental, href: r.url, pinned: !r.label && !r.album, kids: []};
  };
  const own = (up ? up.recordings : DB.recordings(hymn)).map((r) => recItem(r, null, true));
  const inst = DB.instrumentals(hymn).map((r) => recItem(r, null, false));
  const piano = DB.videos(hymn).map((v) => ({icon: 'piano', title: v.label || tr('Video'), sub: tr('Piano video · YouTube'),
    href: v.url, kids: []}));
  const tunes = DB.newTunes(hymn).map((t) => ({icon: 'tune', title: tr('{0} · New tune', t.id),
    sub: tr('Same words, another tune · opens in the app'), href: '#/h/' + t.id, inApp: true,
    kids: t.recordings.map((r) => recItem(r, t.id, false))}));
  const find = [
    {icon: 'search', title: 'YouTube', sub: tr('Search for this hymn'), href: youtubeSearchUrl(hymn), kids: []},
    {icon: 'search', title: 'SoundCloud', sub: tr('Search for this hymn'), href: soundcloudSearchUrl(hymn), kids: []},
  ];
  const row = (it, child) => h('a', {class: 'lk-row' + (child ? ' child' : ''), href: it.href,
    target: it.inApp ? null : '_blank', rel: it.inApp ? null : 'noopener'},
  h('span', {class: 'lk-ic'}, icon(it.icon)),
  h('span', {class: 'lk-t'},
    h('span', {class: 'lk-t1'}, h('span', {class: 'lk-title'}, it.title), it.tag ? h('span', {class: 'lk-tag'}, tr('Instrumental')) : null),
    it.sub ? h('span', {class: 'lk-t2'}, it.sub) : null),
  h('span', {class: 'lk-go', 'aria-hidden': 'true'}, it.inApp ? '›' : '↗'));
  const section = (key, title, items) => {
    if (!items.length) return null;
    const box = h('div', {class: 'lk-section'});
    const draw = () => {
      let n = 0;
      const shown = items.filter((it) => it.pinned || open[key] || ++n <= LINKS_SHOWN);
      const hidden = items.length - shown.length;
      box.replaceChildren(
        h('div', {class: 'lk-head'}, h('span', null, title), h('span', {class: 'lk-n'}, String(items.length))),
        h('div', {class: 'lk-list'}, shown.flatMap((it) => [row(it, false), ...it.kids.map((k) => row(k, true))])),
        ...(hidden > 0 || open[key] ? [h('button', {type: 'button', class: 'lk-more', 'aria-expanded': String(!!open[key]),
          onclick: () => { open[key] = !open[key]; draw(); }},
        open[key] ? tr('Show fewer') : tr('Show {0} more', hidden))] : []));
    };
    draw();
    return box;
  };
  // every hymn has the search section, so the card is on every hymn page
  const card = h('section', {class: 'card links-card'});
  append(card, [foldTitle(card, tr('Listen and links'), 'linksFolded'),   // it folds into its title, as the jukebox does
    section('rec', tr('Recordings'), own), section('inst', tr('Instrumental'), inst),
    section('piano', tr('Piano videos'), piano), section('tunes', tr('New tunes'), tunes), section('search', tr('Search'), find)]);
  return card;
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
  let disposed = false;
  const fav = favorites().includes(hymn.id);

  // Play: while the sheet music is shown (its tab, or beside the lyrics on a wide screen) it plays the sheet as it is shown
  // (sheetplayer.js); else the tune, looped, as in the Android app. It stops when another hymn is opened.
  const tune = DB.tuneFile(hymn);
  const playBtn = h('button', {class: 'icon-btn play', 'aria-pressed': 'false', onclick: () => togglePlay()});
  const sheetShown = () => !!(sheet && sheet.playable && (tab === 'sheet' || wide.matches));
  let tunePlaying = false, hiddenToken = null;   // hiddenToken: the lyrics' Play is playing the sheet unseen (playSheetHidden)
  const showPlay = (on) => { tunePlaying = on; if (!on) hiddenToken = null; refreshPlay(); };
  function refreshPlay() {
    const on = tunePlaying || !!(sheet && sheet.playing) || !!(jukebox && jukebox.playing), onSheet = sheetShown();
    playBtn.replaceChildren(icon(on ? 'pause' : 'play'));
    playBtn.setAttribute('aria-pressed', String(on));
    playBtn.disabled = !on && !onSheet && !tune && !hasSheet;
    const label = on ? tr('Stop (Space)') : onSheet ? tr('Play the sheet (Space)') : tune ? tr('Play the tune (Space)') : hasSheet ? tr('Play the sheet (Space)') : tr('No tune for this hymn');
    playBtn.title = label;
    playBtn.setAttribute('aria-label', label);
  }
  // Play on the lyrics of a hymn with no tune file: open the sheet, wait until it is drawn, play it
  async function playSheetFromLyrics() {
    Player.unlock();
    showTab('sheet');
    for (let i = 0; i < 100 && !disposed && !(sheet && (sheet.playable || sheet.chordsOnly || sheet.failed)); i++) {
      await new Promise((r) => setTimeout(r, 100));
    }
    if (disposed) return;
    if (sheet && sheet.playable) sheet.togglePlay(); else toast(tr('Sorry, no tune for this hymn'));
  }
  // Play on the lyrics of a hymn with no tune file, without opening the sheet (as the Android app's hidden sheet player,
  // android/play.js): the melody with a guitar's folk strum by default (the guitar sheet's Strumming choice: this hymn's
  // own, else the device's), or the piano part when the sheet names one or the sheet's Both hands is on. If the sheet
  // cannot be read here, the sheet is opened and played as before.
  async function playSheetHidden() {
    Player.unlock();
    const mine = hiddenToken = {};
    showPlay(true);
    try {
      await loadSheetPanel();   // also loads music.js, which scoreOf needs
      const [S, P] = await Promise.all([import('./sheet.js'), import('./piano.js')]);
      const [xml, saved] = await Promise.all([host.mei(hymn.sheetId), host.edits.get(hymn.sheetId).catch(() => null)]);
      const doc = S.soundDoc(xml, saved && saved.bars);
      const named = S.handsOf(doc), id = hymn.sheetId;
      const piano = !!store.get('sheet', {}).hands || !!named;
      const choice = piano
        ? (store.get(P.SAVED.handsOf, {})[id] || named || P.DEFAULT)
        : P.strumChoice(store.get(P.SAVED.strumOf, {})[id] || P.STRUM_DEFAULT, S.capoOf(doc));
      const score = P.scoreOf(doc, choice, {hands: true, loop: true});
      if (!score || !score.events.length) throw new Error('nothing to play in ' + id);
      let bpm = S.bpmOf(doc) || 110;
      while (bpm > 250) bpm /= 2;
      while (bpm < 40) bpm *= 2;
      if (disposed || hiddenToken !== mine) return;   // stopped (or left the hymn) while loading
      Player.playScore(score, {from: 0, bpm, loop: true, mute: {}});
    } catch (e) {
      console.error(e);
      if (hiddenToken !== mine) return;
      hiddenToken = null;
      showPlay(false);
      playSheetFromLyrics();
    }
  }
  // Play on the lyrics (a narrow screen: the sheet music is another tab, with a playback panel of its own): the jukebox card
  // shows above the lyrics and plays in it. Where there is no melody to play in it, the tune plays as before.
  const jukeboxHere = () => !!jukebox && tab === 'lyrics' && !wide.matches;
  function togglePlay() {
    if (jukebox && jukebox.playing) { jukebox.stopPlay(); return; }
    if (jukeboxHere() && !hiddenToken && Player.playing() !== hymn.id) {
      jukebox.toggle().then((ok) => { if (!ok && !disposed) togglePlayPlain(); });
      return;
    }
    togglePlayPlain();
  }
  function togglePlayPlain() {
    if (hiddenToken) { hiddenToken = null; Player.stop(); showPlay(false); return; }
    if (Player.playing() === hymn.id) { Player.stop(); showPlay(false); return; }
    if (sheet && sheet.playing) { sheet.togglePlay(); return; }
    if (sheetShown()) { sheet.togglePlay(); return; }
    if (!tune && hasSheet) { playSheetHidden(); return; }   // no tune file: the sheet is the tune (played from the lyrics)
    if (!tune) { toast(tr('Sorry, no tune for this hymn')); return; }
    showPlay(true);
    Player.play(tune, hymn.id).catch(() => { showPlay(false); toast(tr('Could not play the tune')); });
  }

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
      favBtn),
    hymn.category || hymn.newTune ? h('p', {class: 'category', dir: g.rtl ? 'rtl' : null, lang: langOf(hymn.group)},
      hymn.category ? h('span', {class: 'cat-main'}, hymn.category) : null,
      hymn.subcategory ? h('span', {class: 'cat-sub'}, hymn.subcategory) : null,
      hymn.newTune ? h('span', {class: 'cat-newtune'}, '(New Tune)') : null) : null,   // as the Android header: a last line
    familyNode(hymn));

  const tabs = hasSheet ? h('div', {class: 'tabs', role: 'tablist'},
    h('button', {role: 'tab', 'data-tab': 'lyrics', onclick: () => showTab('lyrics')}, tr('Lyrics')),
    h('button', {role: 'tab', 'data-tab': 'sheet', onclick: () => showTab('sheet')}, tr('Sheet music'))) : null;

  const jukebox = hasSheet ? jukeboxCard(hymn, () => { Player.stop(); showPlay(false); }, () => refreshPlay()) : null;
  const lyricsPane = h('section', {class: 'pane lyrics-pane'}, jukebox && jukebox.el, h('div', {class: 'lyrics-box'}, lyricsNode(hymn)), sameTuneNode(hymn), metaNode(hymn),
    linksNode(hymn));
  const sheetPane = hasSheet ? h('section', {class: 'pane sheet-pane'}) : null;
  const panes = h('div', {class: 'panes' + (hasSheet ? ' two' : '')}, lyricsPane, sheetPane);
  const page = h('article', {class: 'hymn', style: groupStyle(hymn.group)}, head, tabs, panes, swapBackButton(hymn));
  installHintFor(page);   // above the hymn number, right under the search bar
  view.appendChild(page);

  let sheet = null;
  function ensureSheet() {
    if (sheet || !hasSheet) return;
    sheet = sheetPanel(sheetPane, hymn, {full: false, stopTune: () => { Player.stop(); showPlay(false); }, onplay: () => refreshPlay()});
  }
  function showTab(t) {
    tab = t;
    if (t === 'sheet' && jukebox) jukebox.stopPlay();   // the sheet has a playback panel of its own
    document.body.classList.remove('bars-away', 'tabs-away');
    page.dataset.tab = t;
    if (tabs) for (const b of tabs.children) b.setAttribute('aria-selected', String(b.dataset.tab === t));
    if (t === 'sheet' || wide.matches) ensureSheet();
    const params = Object.fromEntries(route.params);
    if (t === 'sheet') params.tab = 'sheet'; else delete params.tab;
    quietly(href('/h/' + hymn.id, params));
    refreshPlay();
  }
  showTab(tab);
  showPlay(Player.playing() === hymn.id);
  const onWide = () => { if (wide.matches) ensureSheet(); refreshPlay(); };
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
    disposed = true;
    wide.removeEventListener('change', onWide);
    if (sheet) sheet.destroy();
    if (jukebox) jukebox.stop();
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
    ' ': () => sheet.togglePlay(),   // the sheet alone: Space plays it (with the lyrics beside it, Space plays the tune)
    ...sheetKeys(() => sheet),
  };
  cleanup = () => { sheet.destroy(); keys = {}; };
}

// ---- the sheet toolbar and view (sheetpanel.js), with the web app's links and URL ----

let sheetModPromise = null;
const loadSheetPanel = () => sheetModPromise || (sheetModPromise = Promise.all([loadScript('music.js'), import('./sheetpanel.js')]).then(([, m]) => m));

function sheetKeys(getSheet) {
  const with_ = (fn) => () => { const s = getSheet(); if (s) fn(s); };
  return {
    p: with_((s) => s.set({guitar: false})),
    g: with_((s) => s.set({guitar: true})),
    h: with_((s) => s.set({staff: !s.state.staff})),
    b: with_((s) => s.set({hands: !s.state.hands})),
    m: with_((s) => s.togglePlay()),
    e: with_((s) => s.setEdit(!document.body.classList.contains('editing-chords'))),
    o: with_((s) => s.set({original: !s.state.original})),
    '+': with_((s) => s.set({shift: (s.state.shift || 0) + 1})),
    '=': with_((s) => s.set({shift: (s.state.shift || 0) + 1})),
    '-': with_((s) => s.set({shift: (s.state.shift || 0) - 1})),
    '0': with_((s) => s.set({shift: 0})),
    z: with_((s) => s.set({scale: (s.state.scale || 40) - 5})),
    Z: with_((s) => s.set({scale: (s.state.scale || 40) + 5})),
  };
}

function sheetPanel(pane, hymn, {full, stopTune, onplay} = {}) {
  const note = hymn.sheetId !== hymn.id
    ? h('p', {class: 'sheet-from'}, trh('Music of {0} ({1})', h('a', {href: '#/h/' + hymn.sheetId}, hymn.sheetId), BY_CODE[splitId(hymn.sheetId).group].name),
      hymn.lyricsId ? tr(', with the words of {0}', hymn.id) : '')
    : null;
  let inner = null, dead = false, failed = false;
  const opts = {
    sheetId: hymn.sheetId, lyricsId: hymn.lyricsId, id: hymn.id,
    params: route.params,
    // the sheet's settings are in the URL (a link opens the same view); the other parameters (the tab) stay
    onParams: (sheet) => {
      const params = Object.assign(Object.fromEntries([...route.params].filter(([k]) => !['v', 'staff', 't', 'z'].includes(k))), sheet);
      quietly(href('/' + route.parts[0] + '/' + hymn.id, params));
    },
    full, tune: DB.tuneFile(hymn), note,
    pinch: matchMedia('(pointer: coarse)').matches,   // a phone or tablet: two fingers on the sheet change its size, not the page's zoom
    exit: full ? {icon: 'close', title: tr('Back to the lyrics (Esc)'), href: href('/h/' + hymn.id)} : null,
    sheetOnly: full ? null : (params) => go(href('/sheet/' + hymn.id, params)),
    stopTune, onplay,
  };
  loadSheetPanel().then(({createSheetPanel}) => {
    if (dead || !pane.isConnected) return;
    inner = createSheetPanel(pane, opts);
    if (onplay) onplay();
  }).catch((e) => {
    failed = true;
    if (!dead && pane.isConnected) pane.replaceChildren(h('p', {class: 'sheet-status error'}, String(e)));
  });
  return {
    get state() { return inner ? inner.state : {}; },
    get playable() { return inner ? inner.playable : false; },
    get playing() { return inner ? inner.playing : false; },
    get chordsOnly() { return inner ? inner.chordsOnly : false; },
    get failed() { return failed || (inner ? inner.failed : false); },
    set: (patch) => inner && inner.set(patch),
    setEdit: (on) => inner && inner.setEdit(on),
    togglePlay: () => inner && inner.togglePlay(),
    destroy: () => { dead = true; if (inner) inner.destroy(); },
  };
}

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
      if (pq.id && (DB.exists(pq.id) || (!DB.isFull() && splitId(pq.id)))) { q.blur(); go('#/h/' + pq.id); return; }
      if (route.parts[0] !== 'search') {
        go(href('/search', {q: text}));
      } else if (route.params.get('q') !== text) {
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
  if (cleanup) { cleanup(); cleanup = null; }
  const seq = ++renderSeq;
  const view = $('#view');
  view.innerHTML = '';
  searchScreen(view, route.params.get('q') || '', seq);
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

async function favoritesScreen(view, seq) {
  if (!DB.isFull()) {
    await DB.ensureHymns(favorites());
    if (seq !== renderSeq) return;
  }
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
        onclick: () => {
          store.set('favorites', favorites().filter((x) => x !== id));
          toast(tr('{0} removed', id));
          if (!favorites().some((x) => DB.exists(x))) render(); else row.remove();
        }}, icon('close')));
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
    h('div', {class: 'row'}, h('button', {class: 'btn primary', onclick: async () => {
      if (!area.value.trim()) { toast(tr('Paste a list first')); return; }
      if (!DB.isFull()) await DB.whenFull();
      const n = importFavorites(area.value);
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
    if (window.qrcode) qr.innerHTML = qrSvg(url);
    else loadScript('vendor/qrcode.js').then(() => { if (qr.isConnected) draw(); }).catch(() => {});
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

function settingsScreen(view, seq) {
  const box = h('div', {class: 'page'});
  view.appendChild(box);
  box.appendChild(h('h1', {class: 'page-title'}, icon('settings'), tr('Settings')));

  // install (Firefox and others never offer the install prompt, so the way is told here)
  const standalone = navigator.standalone || window.matchMedia('(display-mode: standalone)').matches;
  const iosDevice = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (!standalone) {
    box.appendChild(h('section', {class: 'card settings-card'},
      h('h2', null, tr('Install the app')),
      h('p', {class: 'muted small'}, iosDevice
        ? trh('Tap {0} Share, then {1}. It opens like an app and works without internet.', icon('share'), h('b', null, tr('Add to Home Screen')))
        : tr('Open your browser’s menu (⋮ or ☰) and tap Install app, Install or Add to Home screen. It opens like an app and works without internet.')),
      deferredInstall ? h('button', {type: 'button', class: 'btn', onclick: async () => { deferredInstall.prompt(); deferredInstall = null; render(); }}, tr('Install')) : null));
  }

  // display
  // text size: Extra Small (the web app's own) and the five Android steps (Small ... XXL) on steps 0-5 of the page's seven (6 only with the A buttons on a hymn)
  const SIZE_NAMES = ['Extra Small', 'Small', 'Medium', 'Large', 'Extra Large', 'XXL'];
  const step = () => Math.max(0, Math.min(5, lyricSize));
  const sizeValue = h('span', null, tr(SIZE_NAMES[step()]));
  const sizeSteps = h('div', {class: 'card size-steps', role: 'group', 'aria-label': tr('Text size')}, SIZE_NAMES.map((name, i) =>
    h('button', {type: 'button', 'aria-label': tr(name), 'aria-pressed': String(i === step()), style: 'font-size:' + Math.round(10 + 3.6 * i) + 'px',
      onclick: () => {
        setLyricSize(i);
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
  const booksSummary = h('p', {class: 'muted small'});
  const updateBooksSummary = () => {
    const hiddenNames = all.filter((g) => !isShown(g.code)).map((g) => g.name);
    booksSummary.textContent = tr('Simplify your view by hiding books you don\'t use ({0}). Hidden books leave the lists, search and the “other languages” row.',
      hiddenNames.length
        ? (hiddenNames.length > 3 ? tr('hiding {0} of {1}', hiddenNames.length, all.length) : tr('hiding {0}', hiddenNames.join(listSeparator())))
        : tr('all {0} shown', all.length));
  };
  updateBooksSummary();
  box.appendChild(h('section', {class: 'card settings-card'},
    h('h2', null, tr('Languages (Hymn Books)')),
    booksSummary,
    h('div', {class: 'hymnal-toggles'}, GROUPS.filter((g) => counts[g.code]).map((g) =>
      h('label', {class: 'hymnal-toggle', style: groupStyle(g.code)},
        h('input', {type: 'checkbox', checked: isShown(g.code) || null, onchange: (e) => {
          if (!e.target.checked && shownGroups().length <= 1) { e.target.checked = true; return; }
          setHidden(g.code, !e.target.checked);
          if (!e.target.checked && currentGroup === g.code) setGroup(shownGroups()[0].code);
          updateBooksSummary();
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
  Edits.all().then(async (list) => {
    if (!DB.isFull() && list.length) await DB.ensureHymns(list.map((r) => r.sheet));
    if (seq !== renderSeq || !editedList.isConnected) return;
    editsInfo.textContent = list.length ? tn('{0} sheet with edits:', '{0} sheets with edits:', list.length) : tr('No chord edits yet.');
    list.sort((a, b) => b.updated - a.updated);
    for (const r of list) {
      const hm = DB.hymn(r.sheet);
      if (hm) editedList.appendChild(hymnRow(hm, h('span', {class: 'snippet'}, tn('{0} bar', '{0} bars', Object.keys(r.bars).length) + ' · ' + new Date(r.updated).toLocaleDateString(lang))));
    }
  });

  // offline
  const offlineStatus = h('p', {class: 'muted small'}, '');
  const offlineBtn = h('button', {class: 'btn', onclick: () => offlineDownload(false)}, tr('Download all sheet music and tunes'));
  const offlineRow = h('div', {class: 'row'}, offlineBtn);
  const sw = 'serviceWorker' in navigator && window.isSecureContext;
  const showOffline = () => {
    const done = store.get('offlineAll', null) === (DB.version && DB.version.build);
    offlineStatus.textContent = !sw ? tr('Offline use needs the app’s https address.') : offlineText
      || (done ? tr('All sheet music and tunes are on this device.')
        : tr('Sheet music and tunes are downloaded in the background (about 30 MB). You can also start it here.'));
    offlineBtn.disabled = offlineRunning;
    offlineRow.hidden = !sw || (done && !offlineRunning);
  };
  offlineListener = showOffline;
  showOffline();
  box.appendChild(h('section', {class: 'card settings-card'},
    h('h2', null, tr('Offline')), offlineStatus, sw ? offlineRow : null));

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
  cleanup = () => { offlineListener = null; };
}

// ---- start ----

function setupServiceWorker() {
  if (!('serviceWorker' in navigator) || !window.isSecureContext) return;
  const hadController = !!navigator.serviceWorker.controller;
  let updateReady = false, reloading = false;
  const canAutoReload = () => document.hidden
    && !document.body.classList.contains('editing-chords')
    && !document.body.classList.contains('sheet-playing')
    && !Player.playing()
    && !offlineRunning
    && $('#loading').hidden;
  const reloadNow = () => { if (reloading) return; reloading = true; location.reload(); };
  navigator.serviceWorker.register('sw.js').then((reg) => {
    // look for a new build when the app comes back to the screen and once an hour, not only when it is opened
    const check = () => reg.update().catch(() => {});
    document.addEventListener('visibilitychange', () => { if (!document.hidden) check(); });
    setInterval(check, 60 * 60 * 1000);
  }).catch((e) => console.warn('service worker', e));
  document.addEventListener('visibilitychange', () => { if (updateReady && canAutoReload()) reloadNow(); });
  // a new build took over. Out of sight and idle: load it by itself. While open: offer to reload so nothing
  // in progress (opening a hymn, editing chords, listening, downloading) is interrupted.
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController) return;
    updateReady = true;
    if (canAutoReload()) { reloadNow(); return; }
    stickyToast(tr('A new version is ready. '), h('button', {class: 'link toast-link', onclick: reloadNow}, tr('Reload')));
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
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstall = e;
    if (onInstallPrompt) { const fn = onInstallPrompt; onInstallPrompt = null; fn(); }
  });
  document.addEventListener('visibilitychange', updateWakeLock);
  setupServiceWorker();

  let cached = false;
  try {
    ({cached} = await DB.init());
    if (cached) {
      try { await DB.openFull(); } catch (e) { cached = false; }
    }
  } catch (e) {
    console.error(e);
    $('#loadingText').textContent = tr('Could not load the hymns: {0}', e.message);
    $('#loading').hidden = false;
    $('#loading').classList.add('error');
    return;
  }
  $('#loading').hidden = true;
  if (cached) document.body.classList.add('db-ready');
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
  await render();
  document.body.classList.add('ready');
  // On a cold visit, load the full SQLite search/browse DB in the background once the landing view has painted
  if (!cached) {
    DB.whenFull().then(() => DB.whenSaved()).then(() => document.body.classList.add('db-ready')).catch(() => {});
  }
  offlineInBackground();
}

start();
