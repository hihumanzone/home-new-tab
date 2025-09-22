const VERSION = 'v1.0.5';
const CACHE_NAME = `home-new-tab-${VERSION}`;
const IMG_CACHE = `home-new-tab-img-${VERSION}`;
const PRECACHE = [
  './', 
  './index.html', 
  './wallpaper-dark.jpg',
  './styles/main.css',
  './js/utils.js',
  './js/extension.js',
  './js/search.js',
  './js/shortcuts.js',
  './js/ui.js',
  './js/app.js'
];

// Cache size limits to prevent excessive storage usage
const MAX_IMG_CACHE_SIZE = 50; // Maximum number of favicon images to cache
const MAX_IMG_CACHE_AGE = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds

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
    await Promise.all(
      keys
        .filter(k => (k !== CACHE_NAME && k !== IMG_CACHE) && (k.startsWith('home-new-tab-') || k.startsWith('home-new-tab-img-')))
        .map(k => caches.delete(k))
    );
    
    // Clean up old image cache entries to prevent excessive storage usage
    await cleanupImageCache();
    
    await self.clients.claim();
  })());
});

// Function to clean up old and excessive image cache entries
async function cleanupImageCache() {
  try {
    const imgCache = await caches.open(IMG_CACHE);
    const requests = await imgCache.keys();
    
    // Get cache entries with timestamps
    const entries = await Promise.all(
      requests.map(async (req) => {
        const response = await imgCache.match(req);
        const cacheTime = response?.headers.get('sw-cache-time');
        return {
          request: req,
          timestamp: cacheTime ? parseInt(cacheTime) : Date.now()
        };
      })
    );
    
    // Sort by timestamp (oldest first)
    entries.sort((a, b) => a.timestamp - b.timestamp);
    
    const now = Date.now();
    const toDelete = [];
    
    // Remove entries older than MAX_IMG_CACHE_AGE
    entries.forEach(entry => {
      if (now - entry.timestamp > MAX_IMG_CACHE_AGE) {
        toDelete.push(entry.request);
      }
    });
    
    // Remove excess entries if we're over the limit
    const remaining = entries.length - toDelete.length;
    if (remaining > MAX_IMG_CACHE_SIZE) {
      const excessCount = remaining - MAX_IMG_CACHE_SIZE;
      const validEntries = entries.filter(entry => !toDelete.includes(entry.request));
      for (let i = 0; i < excessCount; i++) {
        toDelete.push(validEntries[i].request);
      }
    }
    
    // Delete the selected entries
    await Promise.all(toDelete.map(req => imgCache.delete(req)));
    
    console.log(`Cleaned up ${toDelete.length} image cache entries`);
  } catch (error) {
    console.warn('Failed to cleanup image cache:', error);
  }
}

// Periodic cleanup - run every time the service worker activates
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'CLEANUP_CACHE') {
    event.waitUntil(cleanupImageCache());
  }
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  if (req.destination === 'image') {
    event.respondWith((async () => {
      const imgCache = await caches.open(IMG_CACHE);
      const cached = await imgCache.match(req);
      if (cached) return cached;
      
      // Only cache favicon images from Google's service to prevent excessive storage
      const url = new URL(req.url);
      const isFavicon = url.hostname === 'www.google.com' && url.pathname.includes('/s2/favicons');
      
      try {
        const res = await fetch(req);
        if (res && (res.ok || res.type === 'opaque') && isFavicon) {
          // Add timestamp header for cache management
          const headers = new Headers(res.headers);
          headers.set('sw-cache-time', Date.now().toString());
          const responseWithTimestamp = new Response(res.body, {
            status: res.status,
            statusText: res.statusText,
            headers: headers
          });
          imgCache.put(req, responseWithTimestamp.clone());
          return responseWithTimestamp;
        }
        return res;
      } catch {
        const appCache = await caches.open(CACHE_NAME);
        const fallbackImg = await appCache.match('./wallpaper-dark.jpg');
        if (fallbackImg) return fallbackImg;
        return new Response('Image unavailable', { status: 504, statusText: 'Gateway Timeout' });
      }
    })());
    return;
  }

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
        // Only cache successful responses for app files, not dynamic content
        if (res && res.status === 200 && res.type === 'basic') {
          // Only cache static assets, not API responses or dynamic content
          const url = new URL(req.url);
          const isStaticAsset = /\.(js|css|html|png|jpg|jpeg|gif|svg|ico|woff|woff2)$/i.test(url.pathname) || 
                               url.pathname === '/' || 
                               PRECACHE.some(p => url.pathname.endsWith(p.replace('./', '')));
          if (isStaticAsset) {
            cache.put(req, res.clone());
          }
        }
        return res;
      } catch {
        const fallbackImg = await cache.match('./wallpaper-dark.jpg');
        if (fallbackImg && req.destination === 'image') return fallbackImg;
        return new Response('Offline', { status: 503, statusText: 'Offline' });
      }
    })());
  }
});
