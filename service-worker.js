const CACHE_NAME = 'meus-apps-v1';
const URLS_TO_CACHE = [
  '/SOFTWARE/ADM.html',
  '/SOFTWARE/TAPETE_CRM.html',
  '/SOFTWARE/TAPETES.html',
  '/SOFTWARE/PRÉ-VENDA.html',
  '/SOFTWARE/MEU CRM.html',
  '/SOFTWARE/MÉTODO OPA.html',
  '/SOFTWARE/RETINA.html',
  '/SOFTWARE/WEBSITE.html',
  '/SOFTWARE/manifest.json',
  '/SOFTWARE/icon-192.png',
  '/SOFTWARE/icon-512.png'
];

// Instala e faz cache dos arquivos principais
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

// Ativa e limpa caches antigos
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

// Intercepta requisições: rede primeiro, cache como fallback
self.addEventListener('fetch', event => {
  event.respondWith(
    fetch(event.request)
      .then(response => {
        // Salva no cache se a resposta for válida
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => {
        // Offline: retorna do cache
        return caches.match(event.request);
      })
  );
});
