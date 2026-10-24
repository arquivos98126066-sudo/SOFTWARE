const CACHE_NAME = 'meus-apps-v295';
// HTMLs enviados pelo menu (segurar o app > Enviar um novo): ficam fora da limpeza de versões antigas
const ENVIADOS = 'apps-enviados';

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
        keys.filter(key => key !== CACHE_NAME && key !== ENVIADOS).map(key => caches.delete(key))
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
  event.respondWith((async () => {
    if (isLocal) {
      const enviado = await caches.open(ENVIADOS).then(c => c.match(req, {ignoreSearch: true})).catch(() => null);
      if (enviado) {
        const tipo = enviado.headers.get('content-type') || '';
        if (!/html/i.test(tipo)) return enviado;
        /* HTML enviado pelo menu: garante o app-boost (barra do celular com a cor da página) */
        const txt = await enviado.clone().text();
        if (txt.indexOf('app-boost.js') !== -1) return enviado;
        const novo = /<head[^>]*>/i.test(txt) ? txt.replace(/<head[^>]*>/i, m => m + '<script src="app-boost.js"></script>') : '<script src="app-boost.js"></script>' + txt;
        return new Response(novo, {status: 200, headers: {'content-type': 'text/html; charset=utf-8'}});
      }
    }
    const rede = fetch(req.url, isLocal ? {cache: 'no-store'} : undefined).then(response => {
      if (response && (response.status === 200 || response.type === 'opaque')) {
        const clone = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(req, clone));
      }
      return response;
    });
    event.waitUntil(rede.catch(() => {}));
    const cached = await caches.match(req, {ignoreSearch: true});
    return cached || rede;
  })());
});
