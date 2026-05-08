const CACHE_NAME = 'meus-apps-v2';
const URLS_TO_CACHE = [
  '/',
  '/index.html',
  '/ADM.html',
  '/TAPETE-CRM.html',
  '/TAPETES.html',
  '/PRE-VENDA.html',
  '/MEU-CRM.html',
  '/METODO-OPA.html',
  '/RETINA.html',
  '/WEBSITE.html',
  '/OUTROS.html',
  '/RICO.html',
  '/Workshop.html',
  '/DOA.html',
  '/ESTUDO.html',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png'
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
