// The service worker: makes the app open and work without a network.
// build.py writes the build id and the file lists into this file, so every build is a new service worker.
//   - the app itself (SHELL) is stored on install, under the build id, and served from there;
//   - data files with a hash in their name (DATA: sheets, sheet lyrics, the music renderer) are kept once fetched;
//     they never change, so they are served from the store without asking the network;
//   - tunes (midi/<hash>.mid) are kept once played, the same way; there are too many to list, so they are matched by name
//   - data/version.json is asked from the network first, so a new build is noticed, and from the store offline;
//   - the database itself is not stored here: the app keeps it unpacked in IndexedDB.
const BUILD = '/*BUILD*/';
const SHELL = /*SHELL*/[];
const DATA = /*DATA*/[];
const SHELL_CACHE = 'hymns-shell-' + BUILD;
const DATA_CACHE = 'hymns-data';
const TUNE = /^midi\/[0-9a-f]{10}\.(mid|mp3)$/;

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(SHELL_CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const name of await caches.keys()) {
      if (name.startsWith('hymns-shell-') && name !== SHELL_CACHE) await caches.delete(name);
    }
    // data files of older builds
    const data = await caches.open(DATA_CACHE);
    const keep = new Set(DATA.map((f) => new URL(f, self.registration.scope).href));
    keep.add(new URL('data/version.json', self.registration.scope).href);
    for (const req of await data.keys()) if (!keep.has(req.url) && !TUNE.test(rel(new URL(req.url)) || '')) await data.delete(req);
    await self.clients.claim();
  })());
});

function rel(url) {
  return url.href.startsWith(self.registration.scope) ? url.href.slice(self.registration.scope.length) : null;
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const path = rel(url);
  if (path === null) return;                                  // another site (YouTube links and the like)

  if (req.mode === 'navigate') {                              // the page itself: the stored one, whatever the hash
    event.respondWith(caches.match('./', {cacheName: SHELL_CACHE}).then((r) => r || fetch(req)));
    return;
  }
  if (path === 'data/version.json') {
    event.respondWith(networkFirst(req, url.origin + url.pathname));
    return;
  }
  if ((DATA.includes(path) && !/^data\/hymns-/.test(path)) || TUNE.test(path)) {
    event.respondWith(cacheFirst(req));
    return;
  }
  const bare = url.pathname.slice(new URL(self.registration.scope).pathname.length);
  if (SHELL.includes(bare)) {
    event.respondWith(caches.match(bare, {cacheName: SHELL_CACHE}).then((r) => r || fetch(req)));
  }
});

async function cacheFirst(req) {
  const cache = await caches.open(DATA_CACHE);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) await cache.put(req, res.clone());
  return res;
}

async function networkFirst(req, key) {
  const cache = await caches.open(DATA_CACHE);
  try {
    const res = await fetch(req, {cache: 'no-cache'});
    if (res.ok) await cache.put(key, res.clone());
    return res;
  } catch (e) {
    const hit = await cache.match(key);
    if (hit) return hit;
    throw e;
  }
}
