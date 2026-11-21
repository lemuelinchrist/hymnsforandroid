// The hymn database: the app's SQLite file, opened in the browser with sql.js.
// The file is kept in IndexedDB, so it is downloaded again only when data/version.json says it changed.
import {BY_CODE, GROUPS, splitId, currentCode, currentId} from './groups.js';
import {fetchBytes, fetchGzJson, gunzip, loadScript, cacheDataResponse} from './files.js';
import {tr} from './i18n.js';

let db = null;
let sheetIds = new Set();
let lyricIds = new Set();   // hymns with their own words for a borrowed sheet (sheetLyrics)
let tunes = {};             // tune code (lower case) -> midi/<hash>.mid, the app's res/raw files
export let version = null;
const cache = new Map();        // hymn ID -> merged hymn (from SQLite)
const shardHymns = new Map();   // hymn ID -> pre-resolved hymn from a shard (before full SQLite opens)
const missingShards = new Set();
let initPromise = null;
let fullPromise = null;
let savedPromise = Promise.resolve();
const progressListeners = new Set();
let lastProgress = 0;

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

async function idbHas(key) {
  try {
    const d = await idb();
    return await new Promise((resolve) => {
      const req = d.transaction('files').objectStore('files').count(key);
      req.onsuccess = () => resolve(req.result > 0);
      req.onerror = () => resolve(false);
    });
  } catch (e) {
    return false;
  }
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

// Stage 1 (fast): read data/version.json (counts, shard directory) and check whether this version's SQLite is already in IndexedDB
export function init() {
  if (!initPromise) {
    initPromise = (async () => {
      const res = await fetch('data/version.json', {cache: 'no-cache'});
      if (!res.ok) throw new Error('HTTP ' + res.status + ' for data/version.json');
      cacheDataResponse('data/version.json', res.clone());
      version = await res.json();
      const cached = await idbHas('db-' + version.db);
      return {version, cached};
    })().catch((e) => { initPromise = null; throw e; });
  }
  return initPromise;
}

export const isFull = () => !!db;
export const whenSaved = () => savedPromise;

export function onFullProgress(fn) {
  progressListeners.add(fn);
  if (lastProgress > 0 && !db) fn(lastProgress);
  return () => progressListeners.delete(fn);
}

// Stage 2 (background or on-demand for search/browse): load sql.js WASM, unpack SQLite, keep saving to IndexedDB non-blocking
export function whenFull() {
  if (db) return Promise.resolve(version);
  if (!fullPromise) {
    fullPromise = (async () => {
      if (!version) await init();
      const key = 'db-' + version.db;
      const notify = (f) => {
        lastProgress = f;
        for (const fn of progressListeners) fn(f);
      };
      const sqlReady = loadScript('vendor/sql-wasm.js').then(() => window.initSqlJs({locateFile: (f) => 'vendor/' + f}));
      const indexPromise = fetch(version.indexFile).then((r) => {
        if (!r.ok) throw new Error('HTTP ' + r.status + ' for ' + version.indexFile);
        cacheDataResponse(version.indexFile, r.clone());
        return r.json();
      });
      let [SQL, bytes] = await Promise.all([sqlReady, idbGet(key)]);
      if (!bytes) {
        bytes = await gunzip(await fetchBytes(version.dbFile, version.dbGzSize, notify));
        const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
        savedPromise = idbPut(key, u8).then(() => clearOld(key));
      } else {
        savedPromise = Promise.resolve();
      }
      const ix = await indexPromise;
      const opened = new SQL.Database(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes));
      sheetIds = new Set(ix.sheets);
      lyricIds = new Set(ix.lyrics);
      tunes = ix.tunes || {};
      cache.clear();
      shardHymns.clear();
      listCache.clear();
      counts = null;
      db = opened;
      lastProgress = 1;
      notify(1);
      return version;
    })().catch((e) => { fullPromise = null; lastProgress = 0; throw e; });
  }
  return fullPromise;
}

export async function openFull(onProgress) {
  if (db) return version;
  const unsub = onProgress ? onFullProgress(onProgress) : null;
  try {
    return await whenFull();
  } finally {
    if (unsub) unsub();
  }
}

export async function open(onProgress = () => {}) {
  await init();
  return openFull(onProgress);
}

// Fetch only the ~100-hymn pre-resolved shard containing this hymn (for instant shared links & recent/favorite rows before SQLite opens)
export async function ensureHymn(rawId) {
  const id = currentId((rawId || '').toUpperCase());
  if (!id) return null;
  if (db) return hymn(id);
  if (shardHymns.has(id)) return shardHymns.get(id);
  const s = splitId(id);
  if (!s || !version || !version.hymnsDir) return null;
  const url = `${version.hymnsDir}/${s.group}-${Math.floor(parseInt(s.no, 10) / 100)}.json.gz`;
  if (missingShards.has(url)) return null;
  try {
    const items = await fetchGzJson(url);
    for (const [k, rec] of Object.entries(items)) shardHymns.set(k, rec);
  } catch (e) {
    if (/HTTP 404\b/.test(e.message)) { missingShards.add(url); return null; }
    throw e;
  }
  return shardHymns.get(id) || null;
}

export async function ensureHymns(ids) {
  await Promise.all([...new Set((ids || []).filter(Boolean))].map((id) => ensureHymn(id).catch(() => null)));
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

const INHERITED = ['author', 'composer', 'time', 'tune', 'key', 'meter', 'verse'];
const TUNE_FIELDS = ['composer', 'time', 'tune', 'key'];   // not inherited by a New Tune

// A hymn as the app shows it: empty fields, categories, stanzas and sheets come from the parent hymn (and its parents, up the tree; HymnsDao.get).
function loadHymn(id, seen, state) {
  id = currentId((id || '').toUpperCase());   // an old code (MY637) finds the hymn under its new one (BUR637)
  if (cache.has(id)) return cache.get(id);
  if (seen.has(id)) { state.cut = true; return null; }
  seen.add(id);
  const row = hymnRow(id);
  if (!row) return null;
  const related = new Set(relatedIds(row.related));
  related.delete(id);
  const h = {
    id, group: row.hymn_group, no: row.no, parentId: row.parent_hymn || null,
    first: row.first_stanza_line, chorus: row.first_chorus_line,
    title: row.title || null,   // its own title, else the parent's (below); null = the first line is the title
    category: row.main_category, subcategory: row.sub_category,
    stanzas: stanzaRows(id), related: [...related], newTune: row.new_tune === 1,   // the hymn's own column, never inherited
  };
  for (const f of INHERITED) h[f] = row[f];
  const parentId = h.parentId ? currentId(h.parentId.toUpperCase()) : null;
  const parent = parentId && parentId !== id ? loadHymn(parentId, seen, state) : null;
  // a New Tune of a hymn with another tune keeps its own music: no tune, sheet, piano videos or recordings from the parent
  // (HymnsDao.startsOwnTune); a translation of a New Tune still borrows from it
  h.ownTune = !!parent && row.new_tune === 1 && !parent.newTune;
  if (parent) {
    for (const f of INHERITED) if (!h[f] && !(h.ownTune && TUNE_FIELDS.includes(f))) h[f] = parent[f];
    if (!h.title) h.title = parent.title || null;   // the nearest forebear's
    if (!h.category) { h.category = parent.category; h.subcategory = parent.subcategory; }
    if (!h.stanzas.length) h.stanzas = parent.stanzas;
    for (const r of parent.related) if (r !== id) related.add(r);
    h.related = [...related];
  }
  if (!h.first && h.stanzas.length) h.first = plain(h.stanzas[0].text).split('\n')[0];
  // the sheet: its own, else its parent's (or grandparent's; SheetMusicButton.getRootMusicSheet)
  h.sheetId = sheetIds.has(id) ? id : (parent && !h.ownTune ? parent.sheetId : null);
  // a translation that borrows the sheet may have its own words for it (sheetLyrics/<id>.json)
  h.lyricsId = h.sheetId && h.sheetId !== id && lyricIds.has(id) ? id : null;
  if (!state.cut) cache.set(id, h);
  return h;
}

export function hymn(id) {
  id = currentId((id || '').toUpperCase());
  if (!db) return shardHymns.get(id) || null;
  return loadHymn(id, new Set(), {cut: false});
}

// the file of a hymn's tune (its own tune code, else its parent's), as the app's Play button finds it; null if none
export function tuneFile(h) {
  if (!db) return (h && h._tuneFile) || null;
  const t = (h && h.tune || '').trim().toLowerCase();
  return t && t !== '0' ? tunes[t] || null : null;
}

export function allTuneFiles() { return [...new Set(Object.values(tunes))]; }

// Other hymns sung to the same tune (the Android app's "similar tune"): one per hymn family (a hymn and its
// translations), shown in the hymnal being read when that family has a version there, else in its own hymnal.
// The tune code must be the same (the app matched any tune starting with it). `shown(code)` says which hymnals are on.
export function sameTune(id, shown = () => true) {
  const h = hymn(id);
  if (!h) return [];
  if (!db) {
    const out = [];
    for (const item of h._sameTune || []) {
      let pick = item.d || null;
      if (!pick && item.f) {
        const fam = item.f.filter((f) => shown(f.group));
        pick = fam.find((f) => f.id === item.r) || fam[0] || null;
      }
      if (pick && pick.id !== h.id) out.push(pick);
    }
    out.sort((a, b) => (a.group === h.group ? 0 : 1) - (b.group === h.group ? 0 : 1)
      || BY_CODE[a.group].order - BY_CODE[b.group].order || a.no - b.no);
    return out;
  }
  const tune = (h.tune || '').trim();
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

// the piano videos of a hymn (the link table, kind 'piano'), else of its parent: [{url, label}]
export function videos(hymnObj) {
  if (!db) return (hymnObj && hymnObj._videos) || [];
  for (const hid of [hymnObj.id, hymnObj.ownTune ? null : hymnObj.parentId]) {
    if (!hid) continue;
    const v = rows("select url, label from link where hymn_id = ? and kind = 'piano' order by n_order", [hid]);
    if (v.length) return v.map((x) => ({url: (x.url || '').trim(), label: (x.label || '').trim()})).filter((x) => x.url);
  }
  return [];
}

// the recordings of a hymn itself (YouTube first, then SoundCloud, in order): [{kind, label, album, instrumental, url}].
// label is the publisher (empty when unknown), album the album or playlist; a link with neither is one a book's editor chose
// (the youth books), which the card always shows (HymnsDao.getRecordings)
export function recordings(hymnObj) {
  if (!db) return (hymnObj && hymnObj._recordings) || [];
  return rows("select kind, label, album, instrumental, url from link where hymn_id = ? and kind in ('youtube', 'soundcloud')"
    + " order by kind desc, n_order", [hymnObj.id])
    .map((x) => ({kind: x.kind, label: (x.label || '').trim(), album: (x.album || '').trim(), instrumental: x.instrumental === 1,
      url: (x.url || '').trim()})).filter((x) => x.url);
}

// the New Tunes of a hymn (the hymns that have it as parent and are marked new_tune), in number order, each with its own
// recordings: [{id, recordings}] (HymnsDao.getNewTunes)
export function newTunes(hymnObj) {
  if (!db) return (hymnObj && hymnObj._newTunes) || [];
  return rows("select _id as id from hymns where parent_hymn = ? and new_tune = 1 and hymn_group = 'BF' order by cast(no as integer)",
    [hymnObj.id]).map((r) => ({id: r.id, recordings: recordings({id: r.id})}));
}

// A hymn with no recording of its own shows those of the nearest hymn above it that has some (its parent, the parent's
// parent, ...): {from, recordings}, or null (HymnsDao.getLinkedAncestor)
export function inheritedLinks(hymnObj) {
  if (!db) return (hymnObj && hymnObj._inheritedLinks) || null;
  if (recordings(hymnObj).length || hymnObj.ownTune) return null;
  let id = hymnObj.parentId;
  for (let depth = 0; depth < 5 && id && id !== hymnObj.id; depth++) {
    const list = recordings({id});
    if (list.length) return {from: id, recordings: list};
    const row = hymnRow(id);
    const up = row && row.parent_hymn && hymnRow(row.parent_hymn);
    if (row && row.new_tune === 1 && up && up.new_tune !== 1) return null;   // stop at a New Tune: above it is another tune
    id = row && row.parent_hymn;
  }
  return null;
}

// the language of a book (HymnGroup.getLanguage): the three English books are English, the youth books and the
// supplements are in their main language
export function languageOf(code) {
  if (['E', 'BF', 'NS', 'CH'].includes(code)) return 'English';
  const g = BY_CODE[code];
  return ((g && (g.long || g.name)) || code).replace(/ \(.*\)$/, '').replace(' Supplement', '').replace(' Youth', '');
}

export function exists(id) {
  const normId = currentId((id || '').toUpperCase());
  if (!normId) return false;
  return db ? !!hymnRow(normId) : shardHymns.has(normId);
}

// Every version of a hymn: the hymn it comes from, everything that comes from that one, and the related lists.
// In hymnal order.
export function family(id) {
  const h = hymn(id);
  if (!h) return [];
  if (!db) return (h._family || []).map((fid) => ({id: fid, ...splitId(fid)}));
  let root = h.id;
  for (let d = 0, cur = h; d < 10 && cur && cur.parentId && cur.parentId !== cur.id; d++) {
    root = cur.parentId;
    cur = hymn(root);
  }
  const ids = new Set([root, ...h.related]);
  const queue = [root], visited = new Set(queue);
  for (let i = 0; i < queue.length && i < 200; i++) {
    const qid = queue[i];
    const qrow = hymnRow(qid);
    if (qrow) relatedIds(qrow.related).forEach((r) => ids.add(r));
    for (const r of rows('select _id from hymns where parent_hymn = ?', [qid])) {
      ids.add(r._id);
      if (!visited.has(r._id)) { visited.add(r._id); queue.push(r._id); }
    }
  }
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
      `select h._id as id, h.no as no, case when h.new_tune = 1 and coalesce(nullif(coalesce(h.first_stanza_line, p.first_stanza_line), ''), '') != '' then coalesce(h.first_stanza_line, p.first_stanza_line) || ' (New Tune)' else coalesce(h.first_stanza_line, p.first_stanza_line) end as first,
              coalesce(h.main_category, p.main_category) as category, coalesce(h.sub_category, p.sub_category) as sub
       from hymns h left join hymns p on p._id = h.parent_hymn
       where h.hymn_group = ? order by cast(h.no as integer)`, [group]));
  }
  return listCache.get(group);
}

export function neighbours(id) {
  const h = hymn(id);
  if (!h) return {prev: null, next: null};
  if (!db) return {prev: h._prev || null, next: h._next || null};
  const all = list(h.group);
  const i = all.findIndex((x) => x.id === h.id);
  return {prev: i > 0 ? all[i - 1].id : null, next: i >= 0 && i < all.length - 1 ? all[i + 1].id : null};
}

let counts = null;
export function groupCounts() {
  if (!db) return (version && version.counts) || {};
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
    const c = h.category || tr('Other');
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
  let m = /^([A-Za-z]{1,3})\s*-?\s*(\d+)$/.exec(q);
  if (m && currentCode(m[1])) return {id: currentCode(m[1]) + parseInt(m[2], 10)};
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

const COLUMNS = ['first', 'title', 'chorus', 'subject', 'people', 'music', 'body'];

// {score, where}: where = the column that shows why the hymn matched (first, chorus, subject, people, music, body)
function score(words, phrase, r) {
  if (phrase && !isShortWord(phrase)) {
    if (r.first.startsWith(phrase)) return [100, 'first'];
    if (r.first.includes(phrase)) return [90, 'first'];
    if (r.title.startsWith(phrase)) return [95, 'title'];
    if (r.title.includes(phrase)) return [85, 'title'];
    if (r.chorus.includes(phrase)) return [80, 'chorus'];
  }
  const all = (text) => !!text && words.every((w) => found(text, w));
  if (all(r.first)) return [70, 'first'];
  if (all(r.title)) return [65, 'title'];
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
export function search(words, phrase = words.join(' '), current = null, limit = 3000, only = null) {
  if (!words.length) return [];
  // only: look in this one column ('music', 'people'), as a link in a hymn's details does; null: everywhere
  const cols = only && COLUMNS.includes(only) ? [only] : COLUMNS;
  const where = words.map(() => '(' + cols.map((c) => 's.' + c + ' like ?').join(' or ') + ')').join(' and ');
  const params = words.flatMap((w) => cols.map(() => '%' + w.replace(/[%_]/g, '') + '%'));
  const found_ = rows(`select s.id, s.grp, s.first, s.title, s.chorus, s.subject, s.people, s.music, s.body, h.no,
                       case when h.new_tune = 1 and coalesce(coalesce(nullif(h.first_stanza_line, ''), h.first_chorus_line), '') != '' then coalesce(nullif(h.first_stanza_line, ''), h.first_chorus_line) || ' (New Tune)' else coalesce(nullif(h.first_stanza_line, ''), h.first_chorus_line) end as line
                       from search s join hymns h on h._id = s.id where ${where}`, params)
    .filter((r) => words.every((w) => !isShortWord(w) || cols.some((c) => found(r[c], w))));
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
