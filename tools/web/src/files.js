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

const jsonCache = new Map();

// a gzipped JSON file, kept in memory once read
export function fetchGzJson(url) {
  if (!jsonCache.has(url)) {
    jsonCache.set(url, fetchBytes(url).then(gunzip).then((b) => JSON.parse(new TextDecoder().decode(b)))
      .catch((e) => { jsonCache.delete(url); throw e; }));
  }
  return jsonCache.get(url);
}
