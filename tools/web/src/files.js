// Fetching the data files. Big files are stored gzipped (GitHub Pages does not send them compressed), so they are
// unpacked here; a server that already unpacked them (Content-Encoding: gzip) is fine too.

const GZIP = [0x1f, 0x8b];

// the bytes of a file, with progress (0..1) when the size is known
export async function fetchBytes(url, size, onProgress) {
  const res = await fetch(url);
  if (!res.ok) throw new Error('HTTP ' + res.status + ' for ' + url);
  if (!onProgress || !res.body || !res.body.getReader) return new Uint8Array(await res.arrayBuffer());
  const total = size || parseInt(res.headers.get('Content-Length') || '0', 10) || 0;
  const reader = res.body.getReader();
  const chunks = [];
  let got = 0;
  for (;;) {
    const {done, value} = await reader.read();
    if (done) break;
    chunks.push(value);
    got += value.length;
    if (total) onProgress(Math.min(1, got / total));
  }
  const all = new Uint8Array(got);
  let at = 0;
  for (const c of chunks) { all.set(c, at); at += c.length; }
  return all;
}

export async function gunzip(bytes) {
  if (bytes[0] !== GZIP[0] || bytes[1] !== GZIP[1]) return bytes;   // already unpacked on the way
  if (typeof DecompressionStream === 'undefined') throw new Error('This browser is too old (it cannot unpack the hymn files).');
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

const scriptPromises = new Map();

// load a non-module browser script once on demand (vendor/sql-wasm.js, vendor/qrcode.js, music.js)
export function loadScript(url) {
  if (!scriptPromises.has(url)) {
    scriptPromises.set(url, new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = url;
      s.onload = () => resolve();
      s.onerror = () => { scriptPromises.delete(url); reject(new Error('Could not load ' + url)); };
      document.head.appendChild(s);
    }));
  }
  return scriptPromises.get(url);
}

// store a fetched response in the service worker's data cache, so files fetched on the very first visit
// (before the service worker controls the page) are still available immediately offline
export async function cacheDataResponse(url, res) {
  try {
    if (!('caches' in window) || !res || !res.ok) return;
    const cache = await caches.open('hymns-data');
    await cache.put(new URL(url, location.href).href, res);
  } catch (e) { /* private mode or unsupported */ }
}

const jsonCache = new Map();

// a gzipped JSON file, kept in memory once read
export function fetchGzJson(url) {
  if (!jsonCache.has(url)) {
    jsonCache.set(url, (async () => {
      const res = await fetch(url);
      if (!res.ok) throw new Error('HTTP ' + res.status + ' for ' + url);
      cacheDataResponse(url, res.clone());
      const bytes = await gunzip(new Uint8Array(await res.arrayBuffer()));
      return JSON.parse(new TextDecoder().decode(bytes));
    })().catch((e) => { jsonCache.delete(url); throw e; }));
  }
  return jsonCache.get(url);
}
