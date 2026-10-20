// Chord edits, kept on this device (IndexedDB), one record per sheet:
//   {v: 1, sheet: 'E8', updated: <ms>, bars: {"<bar>": {was: [[beat, chord]], chords: [[beat, chord]]}}}
// A bar is the nth <measure> of the sheet's MEI, a beat its tstamp; chords are in the sheet's original key.
// Export/import moves them between devices, and an exported file can be baked into the sheets themselves
// (see tools/web/README.md).

const DB_NAME = 'hymns-edits';
const STORE = 'sheets';
export const FORMAT = 'hymns-chord-edits';

function open() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run(mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const out = fn(tx.objectStore(STORE));
    tx.oncomplete = () => resolve(out && 'result' in out ? out.result : undefined);
    tx.onerror = tx.onabort = () => reject(tx.error || new Error('could not save'));
  });
}

export async function get(sheet) {
  try {
    return (await run('readonly', (s) => s.get(sheet))) || null;
  } catch (e) {
    return null;
  }
}

// saves the bars of a sheet; no bars removes the record
export async function put(sheet, bars) {
  if (!Object.keys(bars).length) return run('readwrite', (s) => s.delete(sheet));
  return run('readwrite', (s) => s.put({v: 1, sheet, updated: Date.now(), bars}, sheet));
}

export async function all() {
  try {
    return (await run('readonly', (s) => s.getAll())) || [];
  } catch (e) {
    return [];
  }
}

// the file people export: every edited sheet
export async function exportAll() {
  const sheets = {};
  for (const r of await all()) sheets[r.sheet] = {updated: r.updated, bars: r.bars};
  return {format: FORMAT, v: 1, exported: new Date().toISOString(), sheets};
}

// an exported file: a sheet replaces this device's edits of that sheet when it was edited later (or `force`)
export async function importAll(data, {force = false} = {}) {
  if (!data || data.format !== FORMAT || typeof data.sheets !== 'object') throw new Error('This is not a chord edits file.');
  const mine = Object.fromEntries((await all()).map((r) => [r.sheet, r]));
  let added = 0, kept = 0;
  for (const [sheet, rec] of Object.entries(data.sheets)) {
    if (!/^[A-Z]{1,2}\d+$/.test(sheet) || !rec || typeof rec.bars !== 'object') continue;
    const cur = mine[sheet];
    if (cur && !force && (cur.updated || 0) > (rec.updated || 0)) { kept++; continue; }
    await run('readwrite', (s) => s.put({v: 1, sheet, updated: rec.updated || Date.now(), bars: rec.bars}, sheet));
    added++;
  }
  return {added, kept};
}
