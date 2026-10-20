const CACHE_NAME = 'meus-apps-v107';

const URLS_TO_CACHE = [
  './',
  './index.html',
  './ADM.html',
  './TAPETE-CRM.html',
  './TAPETES.html',
  './PRE-VENDA.html',
  './MEU-CRM.html',
  './METODO-OPA.html',
  './RETINA.html',
  './WEBSITE.html',
  './OUTROS.html',
  './RICO.html',
  './Workshop.html',
  './DOA.html',
  './plano-hub.js',
  './plano-html/Leads.html',
  './plano-html/Cidades.html',
  './plano-html/Site.html',
  './ESTUDO.html',
  './LER.html',
  './Code.html',
  './manifest.json',
  './menu.webp',
  './icon-192.png',
  './icon-512.png',
  './open-external.js',
  './auth-check.js',
  './firebase-sync.js',
  './sync-indicator.js',
  './app-boost.js'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(URLS_TO_CACHE).catch(err => {
        console.warn('Alguns arquivos nao cacheados:', err);
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
  const url = new URL(event.request.url);

  if (
    url.hostname === 'identitytoolkit.googleapis.com' ||
    url.hostname === 'securetoken.googleapis.com' ||
    url.hostname === 'firestore.googleapis.com' ||
    event.request.method !== 'GET'
  ) {
    return;
  }

  const req = event.request;
  const isLocal = url.hostname === self.location.hostname;
  const rede = fetch(req.url, isLocal ? {cache: 'no-store'} : undefined).then(response => {
    if (response && (response.status === 200 || response.type === 'opaque')) {
      const clone = response.clone();
      caches.open(CACHE_NAME).then(cache => cache.put(req, clone));
    }
    return response;
  });
  event.waitUntil(rede.catch(() => {}));
  event.respondWith(
    caches.match(req).then(cached => cached || rede)
  );
});
