// App shell cached on install; same-origin GETs are served from cache and refreshed in the background.
const CACHE = 'corvel-demo-v1';
const ASSETS = ['./', 'index.html', 'style.css', 'app.js', 'data.json', 'manifest.webmanifest', 'icon.svg', 'icon-192.png', 'icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const { request } = e;
  if (request.method !== 'GET' || new URL(request.url).origin !== location.origin) return;
  e.respondWith(caches.open(CACHE).then(async cache => {
    const hit = await cache.match(request, { ignoreSearch: true });
    const fresh = fetch(request).then(res => { if (res.ok) cache.put(request, res.clone()); return res; }).catch(() => null);
    return hit || (await fresh) || cache.match('index.html');
  }));
});
