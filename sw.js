const CACHE = 'meus-apps-v1';
const FILES = [
  '/SOFTWARE/index.html',
  '/SOFTWARE/manifest.json',
  '/SOFTWARE/firebase-sync.js',
  '/SOFTWARE/sync-indicator.js'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(FILES))
  );
});

self.addEventListener('fetch', e => {
  e.respondWith(
    caches.match(e.request).then(r => r || fetch(e.request))
  );
});
