const CACHE = 'jarvis-v10';
const SHELL = [
  '/',
  '/index.html',
  '/style.css',
  '/app.js',
  '/manifest.json',
  '/icon.svg',
  '/offline.html',
];

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

  // App shell assets — cache-first, fallback to network
  e.respondWith(
    caches.match(e.request).then(r => r || fetch(e.request))
  );
});
