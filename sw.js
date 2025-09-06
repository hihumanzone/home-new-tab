const VERSION = 'v1.0.1';
const CACHE_NAME = `home-new-tab-${VERSION}`;
const PRECACHE = ['./', './index.html', './wallpaper-dark.jpg'];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(PRECACHE.map(u => new Request(u, { cache: 'reload' })));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k.startsWith('home-new-tab-') && k !== CACHE_NAME).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        return await fetch(req);
      } catch {
        const cache = await caches.open(CACHE_NAME);
        const cached = await cache.match('./index.html');
        return cached || new Response('<!doctype html><meta charset="utf-8"><title>Offline</title><h1>Offline</h1><p>This page will be available after a successful online load.</p>', { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
      }
    })());
    return;
  }

  const sameOrigin = new URL(req.url).origin === self.location.origin;
  if (sameOrigin) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(req);
      if (cached) return cached;
      try {
        const res = await fetch(req);
        if (res && res.status === 200 && res.type === 'basic') cache.put(req, res.clone());
        return res;
      } catch {
        const fallbackImg = await cache.match('./wallpaper-dark.jpg');
        if (fallbackImg && req.destination === 'image') return fallbackImg;
        return new Response('Offline', { status: 503, statusText: 'Offline' });
      }
    })());
  }
});
