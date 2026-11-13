// Offline play (opt-in from Settings → Offline play). Only installed when a player turns it on.
//
// - The page sends the full list of game files (its own code, styles, fonts and the three.js /
//   supabase-js modules from jsDelivr) and this worker saves them.
// - Game files: network first, saved copy as the fallback, so online players always get the latest
//   version and the saved copy is refreshed as they play.
// - jsDelivr files are pinned to exact versions, so the saved copy is used straight away.
// - Accounts, matchmaking and Cloudflare's bot check are never cached; they need the internet.
const CACHE = 'jps-offline-v1';
const CDN = 'https://cdn.jsdelivr.net/';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const key of await caches.keys()) if (key.startsWith('jps-offline-') && key !== CACHE) await caches.delete(key);
    await self.clients.claim();
  })());
});

const cacheable = (url) => url.origin === self.location.origin || url.href.startsWith(CDN);

// Saves every URL it can; one failure doesn't stop the rest. Replies with progress and a summary.
self.addEventListener('message', (e) => {
  if (e.data?.type !== 'precache') return;
  const port = e.ports[0];
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    const urls = [...new Set(e.data.urls)];
    let done = 0, failed = 0;
    await Promise.all(urls.map(async (u) => {
      try {
        const res = await fetch(u, { cache: 'reload' });
        if (!res.ok) throw new Error(res.status);
        await cache.put(u, res);
      } catch { failed++; }
      done++;
      port?.postMessage({ type: 'progress', done, total: urls.length });
    }));
    port?.postMessage({ type: 'done', saved: urls.length - failed, failed });
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (!cacheable(url)) return;

  // jsDelivr: versioned and immutable, so use the saved copy first.
  if (url.href.startsWith(CDN)) {
    e.respondWith((async () => {
      const hit = await caches.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok) (await caches.open(CACHE)).put(req, res.clone());
      return res;
    })());
    return;
  }

  // The game's own files: try the network, keep the saved copy fresh, fall back to it offline.
  e.respondWith((async () => {
    try {
      const res = await fetch(req);
      if (res.ok && url.search === '') (await caches.open(CACHE)).put(req, res.clone());
      return res;
    } catch (err) {
      const hit = await caches.match(req, { ignoreSearch: true });
      if (hit) return hit;
      // Any page navigation offline gets the game itself.
      if (req.mode === 'navigate') {
        const shell = await caches.match(new URL('index.html', self.registration.scope).href) || await caches.match(self.registration.scope);
        if (shell) return shell;
      }
      throw err;
    }
  })());
});
