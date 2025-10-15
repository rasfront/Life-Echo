// Simple offline cache for Life Echo static assets (GitHub Pages friendly)
// Cache-first strategy with versioned cache
const CACHE_NAME = 'life-echo-cache-v2';
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './src/app.js',
  './src/recorder.js',
  './src/storage.js',
  './src/thumbnail.js',
  './manifest.json'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.map((k) => {
      if (k !== CACHE_NAME) return caches.delete(k);
    })))
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  event.respondWith(
    caches.match(req).then((cached) => cached || fetch(req).then((res) => {
      const copy = res.clone();
      const type = copy.headers.get('content-type') || '';
      if (copy.ok && (type.includes('text/html') || type.includes('text/css') || type.includes('application/javascript') || type.includes('application/json') || type.includes('application/manifest+json'))) {
        caches.open(CACHE_NAME).then((cache) => cache.put(req, copy)).catch(() => {});
      }
      return res;
    }).catch(() => cached))
  );
});