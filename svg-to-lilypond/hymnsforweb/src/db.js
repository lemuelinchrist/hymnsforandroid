// The hymn database: the app's SQLite file, opened in the browser with sql.js.
// The file is kept in IndexedDB, so it is downloaded again only when data/version.json says it changed.
import {BY_CODE, GROUPS, splitId} from './groups.js';

let db = null;
let sheetIds = new Set();
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

async function download(url, size, onProgress) {
  const res = await fetch(url);
  if (!res.ok) throw new Error('HTTP ' + res.status + ' for ' + url);
  if (!res.body || !res.body.getReader) return new Uint8Array(await res.arrayBuffer());
  const reader = res.body.getReader();
  const out = new Uint8Array(size);
  let got = 0;
  let chunks = null;
  for (;;) {
    const {done, value} = await reader.read();
    if (done) break;
    if (chunks || got + value.length > out.length) {   // bigger than version.json said: collect instead
      chunks = chunks || [out.subarray(0, got)];
      chunks.push(value);
    } else {
      out.set(value, got);
    }
    got += value.length;
    onProgress(Math.min(1, got / size));
  }
  if (!chunks) return out.subarray(0, got);
  const all = new Uint8Array(got);
  let at = 0;
  for (const c of chunks) { all.set(c, at); at += c.length; }
  return all;
}

export async function open(onProgress = () => {}) {
  // the WebAssembly start-up, the version check, the stored database and the sheet list, all at once
  const sqlReady = window.initSqlJs({locateFile: (f) => 'vendor/' + f});
  const sheetList = fetch('data/sheets.json').then((r) => r.json());
  const version = await fetch('data/version.json', {cache: 'no-cache'}).then((r) => r.json());
  const key = 'db-' + version.db;
  let [SQL, bytes] = await Promise.all([sqlReady, idbGet(key)]);
  if (!bytes) {
    bytes = await download('data/hymns.sqlite', version.dbSize, onProgress);
    await idbPut(key, bytes);
    clearOld(key);
  }
  db = new SQL.Database(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes));
  sheetIds = new Set(await sheetList);
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
  cache.set(id, h);
  return h;
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
  return t.replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

// stanza markup to plain text with \n line breaks
export function plain(html) {
  return (html || '').replace(/<!--[\s\S]*?-->/g, '').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim();
}

// ---- search ----

// What a query means: a hymn ID ("E8", "ns 151"), a number in the current hymnal ("8"), or words.
export function parseQuery(q, group) {
  q = (q || '').trim();
  let m = /^([A-Za-z]{1,2})\s*-?\s*(\d+)$/.exec(q);
  if (m && BY_CODE[m[1].toUpperCase()]) return {id: m[1].toUpperCase() + parseInt(m[2], 10)};
  m = /^#?(\d+)$/.exec(q);
  if (m) return {id: group + parseInt(m[1], 10), number: true};
  return {words: norm(q).split(' ').filter(Boolean)};
}

// Hymns whose text has every word, best first: first line, then chorus line, then anywhere.
// Returns [{id, group, no, first, score}] for all hymnals; the caller filters by hymnal.
export function search(words, limit = 3000) {
  if (!words.length) return [];
  const where = words.map(() => 'body like ?').join(' and ');
  const params = words.map((w) => '%' + w.replace(/[%_]/g, '') + '%');
  const phrase = words.join(' ');
  const found = rows(`select s.id, s.grp, s.first, s.chorus, s.body, h.no, h.first_stanza_line as line
                      from search s join hymns h on h._id = s.id where ${where} limit ${limit}`, params);
  for (const r of found) {
    const first = r.first || '', chorus = r.chorus || '';
    r.score = first.startsWith(phrase) ? 6 : first.includes(phrase) ? 5 : chorus.includes(phrase) ? 4
      : words.every((w) => first.includes(w)) ? 3 : words.every((w) => chorus.includes(w)) ? 2 : 1;
    // in the text: the words together, then as whole words, before parts of words ("flow" before "flowers")
    if (r.score === 1) {
      const body = ' ' + r.body.replace(/ \| /g, ' ') + ' ';
      r.score = body.includes(' ' + phrase + ' ') ? 1.6 : words.every((w) => body.includes(' ' + w + ' ')) ? 1.3 : 1;
    }
    r.group = r.grp;
    delete r.body;
  }
  found.sort((a, b) => b.score - a.score || BY_CODE[a.group].order - BY_CODE[b.group].order || a.no - b.no);
  return found;
}

// the stanza line that best shows why a hymn matched (for results that did not match on the first line)
export function matchLine(id, words) {
  const h = hymn(id);
  if (!h) return null;
  let best = null;
  for (const s of h.stanzas) {
    for (const line of plain(s.text).split('\n')) {
      const n = norm(line);
      const hits = words.filter((w) => n.includes(w)).length;
      if (hits && (!best || hits > best.hits)) best = {line, hits};
      if (best && best.hits === words.length) return best.line;
    }
  }
  return best && best.line;
}

export {GROUPS};
