const CACHE_NAME = 'meus-apps-v10';

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
  '/SOFTWARE/icon-512.png',
  '/SOFTWARE/open-external.js',
  '/SOFTWARE/auth-check.js',
  '/SOFTWARE/firebase-sync.js',
  '/SOFTWARE/sync-indicator.js'
];

const EXTERNAL_CACHE = [
  'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js',
  'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js',
  'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js',
  'https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=DM+Sans:wght@400;500&display=swap'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(URLS_TO_CACHE).catch(err => {
        console.warn('Alguns arquivos locais não cacheados:', err);
      });
    }).then(() => {
      return caches.open(CACHE_NAME).then(cache => {
        return Promise.allSettled(
          EXTERNAL_CACHE.map(url => cache.add(url).catch(() => {}))
        );
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

  // Não interceptar requisições Firebase Auth/Firestore nem métodos não-GET
  if (
    url.hostname === 'identitytoolkit.googleapis.com' ||
    url.hostname === 'securetoken.googleapis.com' ||
    url.hostname === 'firestore.googleapis.com' ||
    url.pathname.includes('/v1/') ||
    event.request.method !== 'GET'
  ) {
    return;
  }

  const isLocal = url.hostname === self.location.hostname;

  if (isLocal) {
    // Cache First para arquivos locais
    event.respondWith(
      caches.match(event.request).then(cached => {
        const networkFetch = fetch(event.request).then(response => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          }
          return response;
        }).catch(() => cached);

        return cached || networkFetch;
      })
    );
  } else {
    // Network First para externos (Firebase SDK, fonts)
    event.respondWith(
      fetch(event.request).then(response => {
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => {
        return caches.match(event.request);
      })
    );
  }
});
