const CACHE = 'jarvis-v12';
const SHELL = [
  '/',
  '/index.html',
  '/style.css?v=12',
  '/app.js?v=11',
  '/manifest.json',
  '/icon.svg',
  '/offline.html',
];

// These files change on every deploy — always fetch fresh from network.
// Cache is kept as offline fallback only.
const NETWORK_FIRST = new Set(['/', '/index.html', '/style.css', '/app.js', '/style.css?v=12', '/app.js?v=11']);

// Install: pre-cache the app shell
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(SHELL))
  );
  self.skipWaiting();
});

// Activate: purge old caches
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch strategy
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // External API calls (weather, news, fonts) — network-first, no offline fallback
  if (url.hostname !== self.location.hostname) {
    e.respondWith(
      fetch(e.request).catch(() => caches.match(e.request))
    );
    return;
  }

  // Navigation (HTML page loads) — network-first → cache → offline.html
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request)
        .catch(() => caches.match(e.request)
          .then(r => r || caches.match('/offline.html'))
        )
    );
    return;
  }

  // CSS / JS / HTML — network-first so deploys are visible immediately.
  // Falls back to cache when offline.
  if (NETWORK_FIRST.has(url.pathname)) {
    e.respondWith(
      fetch(e.request)
        .then(res => {
          // Update cache in background so offline still works
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
          return res;
        })
        .catch(() => caches.match(e.request))
    );
    return;
  }

  // Everything else (icons, manifest) — cache-first, fallback to network
  e.respondWith(
    caches.match(e.request).then(r => r || fetch(e.request))
  );
});
