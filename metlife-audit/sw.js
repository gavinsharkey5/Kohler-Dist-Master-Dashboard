// Network-first cache so the audit form still opens inside the stadium with poor signal.
// Data itself lives in IndexedDB (never in this cache).
const CACHE = 'metlife-audit-v1';
const ASSETS = ['./', './index.html', './manifest.webmanifest', '../assets/kohler-logo-badge.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).catch(() => {})); self.skipWaiting(); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))); self.clients.claim(); });
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;               // fonts etc: let the browser handle them
  if (url.pathname.endsWith('/data/audit.json')) return;    // published data: always live
  e.respondWith(
    fetch(e.request).then(r => { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); return r; })
      .catch(() => caches.match(e.request).then(m => m || caches.match('./index.html')))
  );
});
