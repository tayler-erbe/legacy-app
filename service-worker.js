/**
 * Service worker — caches the app shell so Legacy works offline.
 *
 * Strategy:
 *   - App shell (same-origin): network-first, falling back to cache. Online
 *     users always get the latest code; offline users get the last good copy.
 *     (Cache-first would pin installed users to whatever version they first saw.)
 *   - Google Fonts: cache-first with background refresh — they never change.
 *
 * Bump CACHE_VERSION when the precache list changes; old caches are cleaned on activate.
 * IndexedDB (memories, images, audio) is NEVER touched here — it lives in the
 * browser storage layer and is not fetched over HTTP.
 */
const CACHE_VERSION = 'legacy-v3';
const CORE_ASSETS = [
  './',
  './index.html',
  './styles.css',
  './archive.js',
  './app.js',
  './manifest.webmanifest',
  './icons/icon-32.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) =>
      // addAll fails the whole install if any asset 404s; keep the list minimal & correct.
      cache.addAll(CORE_ASSETS).catch((err) => {
        console.warn('SW precache failed:', err);
      })
    )
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

function putInCache(req, res) {
  if (res && res.ok && res.type !== 'opaque') {
    const clone = res.clone();
    caches.open(CACHE_VERSION).then((cache) => cache.put(req, clone));
  }
  return res;
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Google Fonts: cache-first with background refresh
  if (url.origin === 'https://fonts.googleapis.com' || url.origin === 'https://fonts.gstatic.com') {
    event.respondWith(
      caches.match(req).then((cached) => {
        const network = fetch(req).then((res) => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(req, clone));
          }
          return res;
        }).catch(() => cached);
        return cached || network;
      })
    );
    return;
  }

  // Same-origin: network-first, fall back to cache (and to the shell for navigations)
  if (url.origin === self.location.origin) {
    event.respondWith(
      fetch(req)
        .then((res) => putInCache(req, res))
        .catch(() =>
          caches.match(req, { ignoreSearch: true }).then((cached) => {
            if (cached) return cached;
            if (req.mode === 'navigate') return caches.match('./index.html');
            return Response.error();
          })
        )
    );
  }
});
