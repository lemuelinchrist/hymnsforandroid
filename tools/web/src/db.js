// The hymn database: the app's SQLite file, opened in the browser with sql.js.
// The file is kept in IndexedDB, so it is downloaded again only when data/version.json says it changed.
import {BY_CODE, GROUPS, splitId} from './groups.js';
import {fetchBytes, gunzip} from './files.js';

let db = null;
let sheetIds = new Set();
let lyricIds = new Set();   // hymns with their own words for a borrowed sheet (sheetLyrics)
let tunes = {};             // tune code (lower case) -> midi/<hash>.mid, the app's res/raw files
export let version = null;
const cache = new Map();   // hymn ID -> merged hymn

// ---- loading ----

const IDB = 'hymnsforweb';

function idb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore('files');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet(key) {
  try {
    const d = await idb();
    return await new Promise((resolve) => {
      const req = d.transaction('files').objectStore('files').get(key);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });
  } catch (e) {
    return null;
  }
}

async function idbPut(key, value) {
  try {
    const d = await idb();
    await new Promise((resolve) => {
      const tx = d.transaction('files', 'readwrite');
      tx.objectStore('files').put(value, key);
      tx.oncomplete = tx.onerror = tx.onabort = () => resolve();
    });
  } catch (e) { /* private mode or storage full: the next visit downloads again */ }
}

export async function open(onProgress = () => {}) {
  // the WebAssembly start-up, the version check and the stored database, all at once
  const sqlReady = window.initSqlJs({locateFile: (f) => 'vendor/' + f});
  version = await fetch('data/version.json', {cache: 'no-cache'}).then((r) => {
    if (!r.ok) throw new Error('HTTP ' + r.status + ' for data/version.json');
    return r.json();
  });
  const index = fetch(version.indexFile).then((r) => r.json());
  const key = 'db-' + version.db;
  let [SQL, bytes] = await Promise.all([sqlReady, idbGet(key)]);
  if (!bytes) {
    bytes = await gunzip(await fetchBytes(version.dbFile, version.dbGzSize, onProgress));
    await idbPut(key, bytes);
    clearOld(key);
  }
  db = new SQL.Database(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes));
  const ix = await index;
  sheetIds = new Set(ix.sheets);
  lyricIds = new Set(ix.lyrics);
  tunes = ix.tunes || {};
  return version;
}

async function clearOld(keep) {
  try {
    const d = await idb();
    const store = d.transaction('files', 'readwrite').objectStore('files');
    const req = store.getAllKeys();
    req.onsuccess = () => req.result.filter((k) => k !== keep).forEach((k) => store.delete(k));
  } catch (e) { /* nothing to clear */ }
}

// ---- queries ----

function rows(sql, params = []) {
  const st = db.prepare(sql);
  st.bind(params);
  const out = [];
  while (st.step()) out.push(st.getAsObject());
  st.free();
  return out;
}

function hymnRow(id) {
  return rows('select * from hymns where _id = ?', [id])[0] || null;
}

function stanzaRows(id) {
  return rows('select no, text, note from stanza where parent_hymn = ? order by n_order', [id]);
}

function relatedIds(s) {
  return (s || '').split(',').map((x) => x.trim().toUpperCase()).filter(Boolean);
}

const INHERITED = ['author', 'composer', 'time', 'tune', 'sheet_music_link', 'key', 'meter', 'verse'];

// A hymn as the app shows it: empty fields, categories and stanzas come from the parent hymn (HymnsDao.get).
export function hymn(id) {
  id = (id || '').toUpperCase();
  if (cache.has(id)) return cache.get(id);
  const row = hymnRow(id);
  if (!row) return null;
  const h = {
    id, group: row.hymn_group, no: row.no, parentId: row.parent_hymn || null,
    first: row.first_stanza_line, chorus: row.first_chorus_line,
    category: row.main_category, subcategory: row.sub_category,
    stanzas: stanzaRows(id), related: relatedIds(row.related),
  };
  for (const f of INHERITED) h[f] = row[f];
  const parent = h.parentId && hymnRow(h.parentId);
  if (parent) {
    for (const f of INHERITED) if (!h[f]) h[f] = parent[f];
    if (!h.category) { h.category = parent.main_category; h.subcategory = parent.sub_category; }
    if (!h.stanzas.length) h.stanzas = stanzaRows(parent._id);
    h.related.push(...relatedIds(parent.related));
  }
  if (!h.first && h.stanzas.length) h.first = plain(h.stanzas[0].text).split('\n')[0];
  // the sheet: its own, else its parent's (SheetMusicButton.getRootMusicSheet)
  h.sheetId = sheetIds.has(id) ? id : (h.parentId && sheetIds.has(h.parentId) ? h.parentId : null);
  // a translation that borrows the sheet may have its own words for it (sheetLyrics/<id>.json)
  h.lyricsId = h.sheetId && h.sheetId !== id && lyricIds.has(id) ? id : null;
  cache.set(id, h);
  return h;
}

// the file of a hymn's tune (its own tune code, else its parent's), as the app's Play button finds it; null if none
export function tuneFile(h) {
  const t = (h && h.tune || '').trim().toLowerCase();
  return t && t !== '0' ? tunes[t] || null : null;
}

export function allTuneFiles() { return [...new Set(Object.values(tunes))]; }

// Other hymns sung to the same tune (the Android app's "similar tune"): one per hymn family (a hymn and its
// translations), shown in the hymnal being read when that family has a version there, else in its own hymnal.
// The tune code must be the same (the app matched any tune starting with it). `shown(code)` says which hymnals are on.
export function sameTune(id, shown = () => true) {
  const h = hymn(id);
  const tune = (h && h.tune || '').trim();
  if (!tune || tune === '0') return [];
  const mine = h.parentId || h.id;
  const roots = new Set();
  for (const r of rows("select _id, parent_hymn from hymns where trim(tune) = ?", [tune])) {
    const root = r.parent_hymn || r._id;
    if (root !== mine && exists(root)) roots.add(root);
  }
  const out = [];
  for (const root of roots) {
    let pick = splitId(root) && splitId(root).group === h.group ? root : relatedIn(root, h.group);
    if (!pick) {
      const fam = family(root).filter((f) => shown(f.group));
      pick = fam.some((f) => f.id === root) ? root : fam.length ? fam[0].id : null;
    }
    if (pick && pick !== h.id) out.push(hymn(pick));
  }
  out.sort((a, b) => (a.group === h.group ? 0 : 1) - (b.group === h.group ? 0 : 1)
    || BY_CODE[a.group].order - BY_CODE[b.group].order || a.no - b.no);
  return out;
}

// the same hymn in another hymnal, if there is one (the app's "translate" when a hymnal is picked)
export function relatedIn(id, group) {
  const f = family(id).find((x) => x.group === group && x.id !== id);
  return f ? f.id : null;
}

// the curated YouTube videos of a hymn, else of its parent: [{id, label}]
export function videos(hymnObj) {
  for (const hid of [hymnObj.id, hymnObj.parentId]) {
    if (!hid) continue;
    const v = rows('select youtube_link as id, comment as label from tune where _id = ?', [hid]);
    if (v.length) return v.map((x) => ({id: (x.id || '').trim(), label: (x.label || '').trim()})).filter((x) => x.id);
  }
  return [];
}

export function exists(id) {
  return !!(id && hymnRow(id.toUpperCase()));
}

// Every version of a hymn: the hymn it comes from, everything that comes from that one, and the related lists.
// In hymnal order.
export function family(id) {
  const h = hymn(id);
  if (!h) return [];
  const root = h.parentId || id;
  const ids = new Set([root, ...h.related]);
  for (const r of rows('select _id from hymns where parent_hymn = ?', [root])) ids.add(r._id);
  const rootRow = hymnRow(root);
  if (rootRow) relatedIds(rootRow.related).forEach((r) => ids.add(r));
  const out = [];
  for (const fid of ids) {
    const s = splitId(fid);
    if (!s || !exists(fid)) continue;
    out.push({id: fid, group: s.group, no: s.no});
  }
  out.sort((a, b) => BY_CODE[a.group].order - BY_CODE[b.group].order || a.no - b.no);
  return out;
}

const listCache = new Map();

// all hymns of a hymnal in number order: [{id, no, first}]
export function list(group) {
  if (!listCache.has(group)) {
    listCache.set(group, rows(
      `select h._id as id, h.no as no, coalesce(h.first_stanza_line, p.first_stanza_line) as first,
              coalesce(h.main_category, p.main_category) as category, coalesce(h.sub_category, p.sub_category) as sub
       from hymns h left join hymns p on p._id = h.parent_hymn
       where h.hymn_group = ? order by cast(h.no as integer)`, [group]));
  }
  return listCache.get(group);
}

export function neighbours(id) {
  const h = hymn(id);
  const all = list(h.group);
  const i = all.findIndex((x) => x.id === h.id);
  return {prev: i > 0 ? all[i - 1].id : null, next: i >= 0 && i < all.length - 1 ? all[i + 1].id : null};
}

let counts = null;
export function groupCounts() {
  if (!counts) {
    counts = {};
    for (const r of rows('select hymn_group as g, count(*) as n from hymns group by hymn_group')) counts[r.g] = r.n;
  }
  return counts;
}

// categories of a hymnal: [{name, subs: [{name, ids}]}], in the order the hymns first use them
export function categories(group) {
  const cats = new Map();
  for (const h of list(group)) {
    const c = h.category || 'Other';
    if (!cats.has(c)) cats.set(c, new Map());
    const subs = cats.get(c);
    const s = h.sub || '';
    if (!subs.has(s)) subs.set(s, []);
    subs.get(s).push(h);
  }
  return [...cats].map(([name, subs]) => ({name, subs: [...subs].map(([n, hymns]) => ({name: n, hymns}))}));
}

// ---- text ----

// Search form of a text. Must stay identical to norm() in build.py.
export function norm(t) {
  if (!t) return '';
  t = t.replace(/<!--[\s\S]*?-->|<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');
  t = t.normalize('NFD').replace(/[̀-ͯ]/g, '').normalize('NFC').toLowerCase().replace(/ς/g, 'σ');
  return t.replace(/[^\p{L}\p{M}\p{N}]+/gu, ' ').trim();
}

// stanza markup to plain text with \n line breaks
export function plain(html) {
  return (html || '').replace(/<!--[\s\S]*?-->/g, '').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim();
}

// ---- search ----

// What a query means: a hymn ID ("E8", "ns 151"), a number in the current hymnal ("8"), or words. Words are the
// query in search form; text in quotes ("…", “…”, „…“, «…») is one word, an exact phrase. `phrase` is the whole
// query, for ranking hymns that have the words together first. (HymnSearch.parse in the app.)
export function parseQuery(q, group) {
  q = (q || '').trim();
  let m = /^([A-Za-z]{1,2})\s*-?\s*(\d+)$/.exec(q);
  if (m && BY_CODE[m[1].toUpperCase()]) return {id: m[1].toUpperCase() + parseInt(m[2], 10)};
  m = /^#?(\d+)$/.exec(q);
  if (m) return {id: group + parseInt(m[1], 10), number: true};
  const words = [];
  const add = (w) => { if (w && !words.includes(w)) words.push(w); };
  const QUOTED = /["“”„«»]([^"“”„«»]*)["“”„«»]?/g;
  for (const x of q.matchAll(QUOTED)) add(norm(x[1]));
  for (const w of norm(q.replace(QUOTED, ' ')).split(' ')) add(w);
  return {words, phrase: norm(q)};
}

// A word of one or two Latin, Greek or Cyrillic letters or digits ("c", "o", "de") only counts as a whole word: as
// part of a word it is in nearly every hymn. Chinese, Korean, Tamil… text has no spaces, so there it counts anywhere.
export function isShortWord(w) {
  return w.length <= 2 && /^[\p{Script=Latin}\p{Script=Greek}\p{Script=Cyrillic}\p{N}]+$/u.test(w);
}

// whether text in search form has the word: anywhere, or as a whole word if it is a short word
export function found(text, w) {
  if (!text) return false;
  return isShortWord(w) ? (' ' + text.replace(/ \| /g, ' ') + ' ').includes(' ' + w + ' ') : text.includes(w);
}

const COLUMNS = ['first', 'chorus', 'subject', 'people', 'music', 'body'];

// {score, where}: where = the column that shows why the hymn matched (first, chorus, subject, people, music, body)
function score(words, phrase, r) {
  if (phrase && !isShortWord(phrase)) {
    if (r.first.startsWith(phrase)) return [100, 'first'];
    if (r.first.includes(phrase)) return [90, 'first'];
    if (r.chorus.includes(phrase)) return [80, 'chorus'];
  }
  const all = (text) => !!text && words.every((w) => found(text, w));
  if (all(r.first)) return [70, 'first'];
  if (all(r.chorus)) return [60, 'chorus'];
  if (all(r.subject)) return [50, 'subject'];
  if (all(r.people)) return [40, 'people'];
  if (all(r.music)) return [30, 'music'];
  const body = ' ' + r.body.replace(/ \| /g, ' ') + ' ';
  if (phrase && body.includes(' ' + phrase + ' ')) return [26, 'body'];
  return [words.every((w) => body.includes(' ' + w + ' ')) ? 23 : 20, 'body'];
}

// Hymns that have every word somewhere (first line, chorus line, subject, author or composer, key or tune, stanzas),
// one per hymn, best first, then the current hymnal, the drawer's hymnal order and the number; the same order as the app's Search tab
// (HYMNAL_SPEC.md §9.3). Returns [{id, group, no, line, score, where}] for all hymnals; the caller filters by hymnal.
export function search(words, phrase = words.join(' '), current = null, limit = 3000) {
  if (!words.length) return [];
  const where = words.map(() => '(' + COLUMNS.map((c) => 's.' + c + ' like ?').join(' or ') + ')').join(' and ');
  const params = words.flatMap((w) => COLUMNS.map(() => '%' + w.replace(/[%_]/g, '') + '%'));
  const found_ = rows(`select s.id, s.grp, s.first, s.chorus, s.subject, s.people, s.music, s.body, h.no,
                       coalesce(nullif(h.first_stanza_line, ''), h.first_chorus_line) as line
                       from search s join hymns h on h._id = s.id where ${where}`, params)
    .filter((r) => words.every((w) => !isShortWord(w) || COLUMNS.some((c) => found(r[c], w))));
  for (const r of found_) {
    [r.score, r.where] = score(words, phrase, r);
    r.group = r.grp;
    for (const c of COLUMNS) delete r[c];
  }
  found_.sort((a, b) => b.score - a.score || (b.group === current) - (a.group === current)
    || BY_CODE[a.group].order - BY_CODE[b.group].order || a.no - b.no);
  return found_.slice(0, limit);
}

// the stanza line that best shows why a hymn matched: the one with the most of the words (the first one with all of
// them), other than the first line, which the result already shows
export function matchLine(id, words) {
  const h = hymn(id);
  if (!h) return null;
  const skip = norm(h.first);
  let best = null;
  for (const s of h.stanzas) {
    for (const line of plain(s.text).split('\n')) {
      const n = norm(line);
      if (n === skip) continue;
      const hits = words.filter((w) => found(n, w)).length;
      if (hits && (!best || hits > best.hits)) best = {line, hits};
      if (best && best.hits === words.length) return best.line;
    }
  }
  return best && best.line;
}

export {GROUPS};
