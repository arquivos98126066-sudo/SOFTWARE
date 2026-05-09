const CACHE_NAME = 'meus-apps-v6';
const URLS_TO_CACHE = [
  '/SOFTWARE/',
  '/SOFTWARE/index.html',
  '/SOFTWARE/ADM.html',
  '/SOFTWARE/TAPETE-CRM.html',
  '/SOFTWARE/TAPETES.html',
  '/SOFTWARE/PRE-VENDA.html',
  '/SOFTWARE/MEU-CRM.html',
  '/SOFTWARE/METODO-OPA.html',
  '/SOFTWARE/RETINA.html',
  '/SOFTWARE/WEBSITE.html',
  '/SOFTWARE/OUTROS.html',
  '/SOFTWARE/RICO.html',
  '/SOFTWARE/Workshop.html',
  '/SOFTWARE/DOA.html',
  '/SOFTWARE/ESTUDO.html',
  '/SOFTWARE/Code.html',
  '/SOFTWARE/manifest.json',
  '/SOFTWARE/icon-192.png',
  '/SOFTWARE/icon-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(URLS_TO_CACHE).catch(err => {
        console.warn('Alguns arquivos não puderam ser cacheados:', err);
      });
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  event.respondWith(
    fetch(event.request)
      .then(response => {
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => {
        return caches.match(event.request);
      })
  );
});
