// Offline play: an opt-in service worker (sw.js) that saves the game so bot matches and the training
// range work without internet. Off by default; Settings → Offline play turns it on or off.
export const offlineSupported = () => 'serviceWorker' in navigator && 'caches' in window && window.isSecureContext;

// Modules the game only loads when needed; loaded here first so they're in the list.
const LAZY = ['../net/api.js', '../game/replay.js', '../game/replaystore.js', '../data/challenges.js', '../data/seasons.js'];

// Every file the game needs: what this page has loaded (its code, styles, fonts and the jsDelivr
// modules) plus the lazily loaded modules and every font file listed in fonts.css.
async function gameFiles() {
  await Promise.all(LAZY.map((m) => import(m).catch(() => null)));
  const base = new URL('./', location.href);
  const urls = new Set(['./', 'index.html', 'favicon.svg', '404.html'].map((u) => new URL(u, base).href));
  for (const e of performance.getEntriesByType('resource')) {
    const u = new URL(e.name);
    if ((u.origin === location.origin && u.search === '') || u.href.startsWith('https://cdn.jsdelivr.net/')) urls.add(u.href);
  }
  try {
    const css = await (await fetch(new URL('css/fonts.css', base))).text();
    for (const m of css.matchAll(/url\(["']?([^"')]+)["']?\)/g)) urls.add(new URL(m[1], new URL('css/', base)).href);
  } catch { /* fonts that already loaded are in the list anyway */ }
  return [...urls];
}

// Installs the worker and saves the game. onProgress(done, total). Resolves {saved, failed}.
export async function enableOffline(onProgress) {
  if (!offlineSupported()) throw new Error('This browser doesn’t support offline play.');
  if (!navigator.onLine) throw new Error('Connect to the internet once to download the game for offline play.');
  const reg = await navigator.serviceWorker.register(new URL('../../sw.js', import.meta.url), { scope: new URL('../../', import.meta.url).pathname });
  const worker = reg.active || reg.waiting || reg.installing;
  if (worker.state !== 'activated') await new Promise((r) => worker.addEventListener('statechange', () => worker.state === 'activated' && r()));
  const urls = await gameFiles();
  return new Promise((resolve) => {
    const ch = new MessageChannel();
    ch.port1.onmessage = (e) => {
      if (e.data.type === 'progress') onProgress?.(e.data.done, e.data.total);
      if (e.data.type === 'done') resolve(e.data);
    };
    (reg.active || worker).postMessage({ type: 'precache', urls }, [ch.port2]);
  });
}

// Removes the worker and everything it saved.
export async function disableOffline() {
  if (!('serviceWorker' in navigator)) return;
  for (const reg of await navigator.serviceWorker.getRegistrations()) {
    if (new URL(reg.active?.scriptURL || reg.installing?.scriptURL || 'x:', location.href).pathname.endsWith('/sw.js')) await reg.unregister();
  }
  for (const key of await caches.keys()) if (key.startsWith('jps-offline-')) await caches.delete(key);
}

// Keeps the browser in line with the setting (e.g. turned off in another tab).
export async function syncOffline(enabled) {
  if (!offlineSupported()) return;
  const regs = await navigator.serviceWorker.getRegistrations();
  const ours = regs.some((r) => (r.active || r.installing || r.waiting)?.scriptURL.endsWith('/sw.js'));
  if (!enabled && ours) await disableOffline();
}
