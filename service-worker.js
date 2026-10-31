const CACHE_NAME = 'meus-apps-v365';
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
  './app-boost.js',
  './dados.js',
  './nv-canal.js',
  './nv-fs.js',
  './acessos.html'
];

const BASE = new URL('./', self.location).pathname;
const PRE = new Set(URLS_TO_CACHE);

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return Promise.all(URLS_TO_CACHE.map(u => fetch(new Request(u, {cache: 'reload'})).then(r => r.ok ? cache.put(u, r) : null))).catch(err => {
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
    url.hostname === '127.0.0.1' || url.hostname === 'localhost' ||
    event.request.method !== 'GET'
  ) {
    return;
  }

  if (/\/(reparar|atualiza|entrar|copia|exportar|mudar)\.html$/.test(url.pathname) || /\/(nuvem-rico|preserva)\.js$/.test(url.pathname)) return;
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
    /* abrir na hora: o que já está guardado nesta versão abre direto da memória, sem esperar a internet.
       Versão nova chega pelo número do cache (publicar sobe o número), toda de uma vez, na abertura seguinte. */
    const cached0 = await caches.match(req, {ignoreSearch: true});
    if (cached0 && (!isLocal || PRE.has(url.pathname.replace(BASE, './')))) return cached0;
    const rede = fetch(req.url, isLocal ? {cache: 'no-store'} : undefined).then(response => {
      if (response && (response.status === 200 || response.type === 'opaque')) {
        const clone = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(req, clone));
      }
      return response;
    });
    event.waitUntil(rede.catch(() => {}));
    const cached = await caches.match(req, {ignoreSearch: true});
    /* o resto deste site (fora da lista, como a conferência de versão): a rede primeiro (até 1,5 s); sem rede, o guardado */
    const codigo = isLocal && (req.mode === 'navigate' || /\.(html|js|json)$/i.test(url.pathname) || url.pathname.endsWith('/'));
    if (codigo && cached) {
      const tempo = new Promise(ok => setTimeout(() => ok(null), 1500));
      const r = await Promise.race([rede.catch(() => null), tempo]);
      return (r && r.ok) ? r : cached;
    }
    return cached || rede;
  })());
});
