const CACHE = 'jarvis-v30';

const SHELL = [
  '/',
  '/index.html',
  '/style.css?v=24',
  '/src/main.js',
  '/src/config.js',
  '/src/utils.js',
  '/src/core/router.js',
  '/src/core/storage.js',
  '/src/core/bus.js',
  '/src/core/pwa.js',
  '/src/modules/clock.js',
  '/src/modules/tasks.js',
  '/src/modules/calendar.js',
  '/src/modules/cash.js',
  '/src/modules/news.js',
  '/src/modules/weather.js',
  '/src/modules/command.js',
  '/src/modules/tools.js',
  '/src/modules/theme.js',
  '/src/modules/briefing.js',
  '/src/modules/charts.js',
  '/src/modules/gcal.js',
  '/src/modules/lock.js',
  '/src/modules/voice.js',
  '/src/modules/sync.js',
  '/src/modules/widgets.js',
  '/src/modules/budget.js',
  '/src/modules/import.js',
  '/src/modules/boot.js',
  '/src/modules/decisions.js',
  '/manifest.json',
  '/icon.png',
  '/offline.html',
];

// All JS modules and CSS use network-first so deploys are immediately visible.
const NETWORK_FIRST = new Set([
  '/', '/index.html',
  '/style.css', '/style.css?v=21', '/style.css?v=22', '/style.css?v=23', '/style.css?v=24',
  '/src/main.js', '/src/config.js', '/src/utils.js',
  '/src/core/router.js', '/src/core/storage.js', '/src/core/bus.js', '/src/core/pwa.js',
  '/src/modules/clock.js', '/src/modules/tasks.js', '/src/modules/calendar.js',
  '/src/modules/cash.js', '/src/modules/news.js', '/src/modules/weather.js',
  '/src/modules/command.js', '/src/modules/tools.js',
  '/src/modules/theme.js', '/src/modules/briefing.js',
  '/src/modules/charts.js', '/src/modules/gcal.js', '/src/modules/lock.js',
  '/src/modules/voice.js', '/src/modules/sync.js', '/src/modules/widgets.js',
  '/src/modules/budget.js', '/src/modules/import.js', '/src/modules/boot.js',
  '/src/modules/decisions.js',
]);

// Install: pre-cache the app shell
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(SHELL))
  );
  self.skipWaiting();
});

// Activate: purge old caches, then FORCE all open windows to reload.
// sw.js is always fetched fresh by the browser on every page open, so
// this activate handler runs on every deploy — no manual cache clearing needed.
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.matchAll({ type: 'window', includeUncontrolled: true }))
      .then(clients => Promise.all(clients.map(c => c.navigate(c.url))))
      .catch(() => {}) // navigate() can throw if window is already unloading — safe to ignore
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

  // JS modules + CSS — network-first so deploys are visible immediately.
  // Falls back to cache when offline.
  if (NETWORK_FIRST.has(url.pathname)) {
    e.respondWith(
      fetch(e.request)
        .then(res => {
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
