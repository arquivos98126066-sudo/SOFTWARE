/* Rico ao vivo na nuvem: os mapas e as listas (chaves rico.* do aparelho) passam a morar no Firestore (coleção rico_vivo).
   Quem muda grava na nuvem; os outros aparelhos recebem em poucos segundos. O aparelho continua guardando uma cópia para abrir rápido.
   Recebe na hora pelo canal ao vivo do Firestore (app próprio "nv", sem esperar o login do SDK, que travava em alguns celulares).
   Grava por REST (fetch simples). Se o canal ao vivo cair, a leitura por REST a cada 3 s assume sozinha. */
var VER = 'r3', CH = 'AIzaSyDPJvM-XZWfa8HQ7h8v0Usb1Hf3q8sDqpg', PROJ = 'projects/meus-apps-8ca76/databases/(default)/documents';
var URL0 = 'https://firestore.googleapis.com/v1/' + PROJ, COL = self.NV_COL || 'rico_vivo';
var LIMITE = 900000, TK = 'nv.t.v1', PEND = 'nv.pend.v1', ST = 'nv.st.v1', RT = 'nv.rt', CADA = 3000;
var orig = { set: Storage.prototype.setItem, rem: Storage.prototype.removeItem };
var pronto = false, aplicando = false, timer = null, ultimoToque = Date.now(), recarregar = false, enviando = false, lendo = false;
var vivo = 0, nuvem = {}, tok = null, tokAte = 0, est = 'carregou', erro = '', ultEnvio = 0, ultLeitura = 0;

function sincroniza(k) { return typeof k === 'string' && k.indexOf('rico.') === 0 && k.indexOf('rico.seed.') !== 0 && !/\.foto$/.test(k) && k.indexOf('rico.y.') !== 0 && k.indexOf('rico.rd.') !== 0 && k.indexOf('rico.fixarTela') !== 0; }
function ler(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
function mapa(k) { try { return JSON.parse(ler(k) || '{}') || {}; } catch (e) { return {}; } }
function grava(k, o) { try { orig.set.call(localStorage, k, typeof o === 'string' ? o : JSON.stringify(o)); } catch (e) {} }
function idDe(k) { return String(k).replace(/[^A-Za-z0-9_.-]/g, '_').slice(0, 140) || '_'; }
function marca(k, apagado) { var t = mapa(TK), p = mapa(PEND); t[k] = Date.now(); p[k] = apagado ? 2 : 1; grava(TK, t); grava(PEND, p); }
function lim(pr, ms) { return Promise.race([pr, new Promise(function (_, rj) { setTimeout(function () { rj(new Error('demorou')); }, ms); })]); }

Storage.prototype.setItem = function (k, v) {
  var r = orig.set.apply(this, arguments);
  if (this === localStorage && pronto && !aplicando && sincroniza(k)) { marca(k, false); agenda(); }
  return r;
};
Storage.prototype.removeItem = function (k) {
  var r = orig.rem.apply(this, arguments);
  if (this === localStorage && pronto && !aplicando && sincroniza(k)) { marca(k, true); agenda(); }
  return r;
};

/* Login: usa a chave de renovação guardada (entrar ou menu). Sem ela, tenta a do login do SDK no aparelho. Sem nenhuma, vai sem login (o banco ainda aceita). */
function rtDoSdk() {
  return lim(new Promise(function (ok) {
    try {
      var q = indexedDB.open('firebaseLocalStorageDb');
      q.onerror = function () { ok(null); };
      q.onsuccess = function () {
        try {
          var g = q.result.transaction('firebaseLocalStorage', 'readonly').objectStore('firebaseLocalStorage').getAll();
          g.onsuccess = function () { var r = null; (g.result || []).forEach(function (x) { var u = x && x.value; if (u && u.uid && u.stsTokenManager && !u.isAnonymous) r = u.stsTokenManager.refreshToken; }); ok(r); };
          g.onerror = function () { ok(null); };
        } catch (e) { ok(null); }
      };
    } catch (e) { ok(null); }
  }), 3000).catch(function () { return null; });
}
async function token() {
  if (tok && tokAte > Date.now() + 60000) return tok;
  var rt = ler(RT) || await rtDoSdk();
  if (!rt) return null;
  try {
    var r = await lim(fetch('https://securetoken.googleapis.com/v1/token?key=' + CH, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'grant_type=refresh_token&refresh_token=' + encodeURIComponent(rt) }), 15000);
    if (!r.ok) { if (r.status === 400) orig.rem.call(localStorage, RT); return null; }
    var j = await r.json(); tok = j.id_token; tokAte = Date.now() + (+j.expires_in || 3600) * 1000;
    grava(RT, j.refresh_token || rt);
    return tok;
  } catch (e) { return null; }
}
async function pede(caminho, metodo, corpo) {
  var h = { 'Content-Type': 'application/json' }, t = await token();
  if (t) h.Authorization = 'Bearer ' + t;
  var r = await lim(fetch(URL0 + caminho, { method: metodo || 'GET', headers: h, body: corpo ? JSON.stringify(corpo) : undefined, cache: 'no-store' }), 20000);
  if (r.status === 401 && t) { tok = null; }
  if (!r.ok) throw new Error(caminho.split('?')[0].slice(-30) + ' ' + r.status);
  return r.json();
}
function campos(d) { var f = d.fields || {}; return { k: f.k && f.k.stringValue, v: f.v ? (f.v.stringValue != null ? f.v.stringValue : '') : '', ap: !!(f.ap && f.ap.booleanValue), t: f.t ? +(f.t.integerValue || f.t.doubleValue || 0) : 0, st: f.st && f.st.timestampValue }; }

function agenda() { clearTimeout(timer); timer = setTimeout(envia, 300); }
async function envia() {
  if (enviando) { agenda(); return; }
  enviando = true;
  var p = mapa(PEND), t = mapa(TK), ks = Object.keys(p), falhou = false;
  for (var i = 0; i < ks.length; i++) {
    var k = ks[i], apagado = p[k] === 2, v = apagado ? '' : ler(k);
    if (!apagado && v == null) { apagado = true; v = ''; }
    if (!apagado && v.length > LIMITE) { delete p[k]; continue; }
    try {
      await pede(':commit', 'POST', { writes: [{
        update: { name: PROJ + '/' + COL + '/' + idDe(k), fields: { k: { stringValue: k }, v: { stringValue: v }, ap: { booleanValue: apagado }, t: { integerValue: String(t[k] || Date.now()) } } },
        updateTransforms: [{ fieldPath: 'st', setToServerValue: 'REQUEST_TIME' }]
      }] });
      nuvem[k] = { v: v, ap: apagado, t: t[k] || 0 };
      var p2 = mapa(PEND); if (p2[k] === p[k] && mapa(TK)[k] === t[k]) { delete p2[k]; grava(PEND, p2); }
      ultEnvio = Date.now();
    } catch (e) { falhou = true; erro = 'envio: ' + e.message; }
  }
  enviando = false;
  if (falhou) { diag(); setTimeout(agenda, 15000); }
}
['touchstart', 'keydown', 'pointerdown'].forEach(function (e) { addEventListener(e, function () { ultimoToque = Date.now(); }, { capture: true, passive: true }); });
document.addEventListener('visibilitychange', function () {
  if (document.visibilityState === 'hidden') { clearTimeout(timer); envia(); }
  else if (pronto) busca();
});
addEventListener('pagehide', function () { clearTimeout(timer); envia(); });
addEventListener('online', function () { agenda(); busca(); });

function aplica(d) {
  var k = d.k, local = ler(k), t = mapa(TK), p = mapa(PEND);
  if (!sincroniza(k)) return false;
  var rv = d.ap ? null : d.v;
  if (rv === local) { if (t[k] !== d.t) { t[k] = d.t; grava(TK, t); } return false; }
  /* mudança local ainda não enviada e mais nova: ela vale e sobe */
  if (p[k] && (t[k] || 0) > d.t) return false;
  /* aparelho antigo, sem marca de tempo da chave: o que já está nele vale e sobe (o aparelho novo recebe a nuvem) */
  if (!t[k] && local != null && ler('backup.ap.sig')) { marca(k, false); agenda(); return false; }
  /* idade do que está no aparelho é desconhecida: antes de trocar pela nuvem, guarda o que ele tinha na nuvem (_conf_), para nada se perder */
  if (!t[k] && local != null) pede('/' + COL + '/_conf_' + devId + '_' + idDe(k).slice(0, 100), 'PATCH', { fields: { ck: { stringValue: k }, v: { stringValue: local.slice(0, LIMITE) }, t: { integerValue: String(Date.now()) } } }).catch(function () {});
  aplicando = true;
  try { if (d.ap) orig.rem.call(localStorage, k); else orig.set.call(localStorage, k, d.v); } catch (e) { aplicando = false; return false; }
  aplicando = false;
  t[k] = d.t; grava(TK, t);
  if (p[k]) { delete p[k]; grava(PEND, p); }
  return true;
}
function recarrega() {
  if (Date.now() - ultimoToque > 2500 && !document.querySelector('textarea:focus,input:focus,[contenteditable="true"]:focus')) location.reload();
  else setTimeout(recarrega, 1500);
}
function recebe(docs) {
  var mudou = false, maior = ler(ST) || '';
  docs.forEach(function (x) {
    var d = campos(x); if (d.st && d.st > maior) maior = d.st;
    if (!d.k) return;
    if (d.st && nuvem[d.k] && nuvem[d.k].st && Date.parse(d.st) < Date.parse(nuvem[d.k].st)) return;
    nuvem[d.k] = { v: d.v, ap: d.ap, t: d.t, st: d.st };
    if (aplica(d)) mudou = true;
  });
  if (maior) grava(ST, maior);
  if (mudou && pronto && !recarregar) { recarregar = true; recarrega(); }
}

/* Primeira carga: a coleção inteira. Depois, a cada 3 s com a tela aberta, só o que mudou desde a última hora do servidor. */
async function carga() {
  var docs = [], pg = '';
  for (var n = 0; n < 20; n++) {
    var j = await pede('/' + COL + '?pageSize=300' + pg);
    docs = docs.concat(j.documents || []);
    if (!j.nextPageToken) break; pg = '&pageToken=' + encodeURIComponent(j.nextPageToken);
  }
  recebe(docs);
}
async function busca() {
  if (lendo || document.visibilityState === 'hidden') return;
  lendo = true;
  try {
    var desde = ler(ST) || '1970-01-01T00:00:00Z';
    var r = await pede(':runQuery', 'POST', { structuredQuery: { from: [{ collectionId: COL }], where: { fieldFilter: { field: { fieldPath: 'st' }, op: 'GREATER_THAN', value: { timestampValue: desde } } }, orderBy: [{ field: { fieldPath: 'st' } }], limit: 300 } });
    recebe((r || []).map(function (x) { return x.document; }).filter(Boolean));
    ultLeitura = Date.now(); if (erro.indexOf('leitura') === 0) erro = '';
  } catch (e) { erro = 'leitura: ' + e.message; }
  lendo = false;
}

/* Canal ao vivo: cada mudança na nuvem chega em menos de 1 s. Usa um app Firebase separado, com cache só em memória e sem login do SDK. */
async function aoVivo() {
  try {
    var A = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js');
    var F = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js');
    var app = A.getApps().filter(function (a) { return a.name === 'nv'; })[0] || A.initializeApp({ apiKey: CH, projectId: 'meus-apps-8ca76', appId: '1:768854372271:web:467b541baf3c513f03095a' }, 'nv');
    var db; try { db = F.initializeFirestore(app, { experimentalAutoDetectLongPolling: true }); } catch (e) { db = F.getFirestore(app); }
    F.onSnapshot(F.collection(db, COL), function (snap) {
      if (snap.metadata.fromCache) return;
      if (!vivo) { vivo = Date.now(); diag(); }
      var docs = [];
      snap.docChanges().forEach(function (c) {
        if (c.type === 'removed') return;
        var x = c.doc.data(); if (!x || !x.k) return;
        docs.push({ fields: { k: { stringValue: x.k }, v: { stringValue: x.v == null ? '' : String(x.v) }, ap: { booleanValue: !!x.ap }, t: { integerValue: String(x.t || 0) }, st: x.st && x.st.toDate ? { timestampValue: x.st.toDate().toISOString() } : undefined } });
      });
      docs.forEach(function (d) { if (!d.fields.st) delete d.fields.st; });
      if (docs.length) { var guardado = ler(ST); recebe(docs); if (guardado != null) grava(ST, guardado); }
    }, function (e) { vivo = 0; erro = 'ao vivo: ' + (e && e.code || e); diag(); setTimeout(aoVivo, 10000); });
  } catch (e) { vivo = 0; erro = 'ao vivo: ' + e.message; diag(); }
}

var devId = ler('nv.dev') || ('d' + Math.random().toString(36).slice(2, 8)); grava('nv.dev', devId);
function diag(e) {
  if (e) est = e;
  var s = function (x) { return { stringValue: String(x) }; };
  pede('/' + COL + '/_dev_' + devId, 'PATCH', { fields: { est: s(est), ver: s(VER), t: { integerValue: String(Date.now()) }, ua: s(navigator.userAgent.slice(0, 120)), pend: { integerValue: String(Object.keys(mapa(PEND)).length) }, login: s(tok ? 'sim' : 'nao'), aovivo: s(vivo ? 'sim' : 'nao'), erro: s(erro), envio: { integerValue: String(ultEnvio) }, leitura: { integerValue: String(ultLeitura) } } }).catch(function () {});
}

setTimeout(function () { pronto = true; }, 6000);
(async function () {
  diag('carregou');
  try { navigator.serviceWorker && navigator.serviceWorker.getRegistration().then(function (r) { r && r.update(); }).catch(function () {}); } catch (e) {}
  for (var i = 0; ; i++) {
    try { await carga(); break; }
    catch (e) { erro = 'carga: ' + e.message; diag('sem nuvem'); await new Promise(function (r) { setTimeout(r, Math.min(30000, 3000 * (i + 1))); }); }
  }
  /* chaves do aparelho que a nuvem ainda não tem: só sobem se este é um aparelho antigo (já enviava cópia) */
  if (ler('backup.ap.sig')) {
    var t = mapa(TK), p = mapa(PEND);
    for (var j = 0; j < localStorage.length; j++) { var k = localStorage.key(j); if (sincroniza(k) && !nuvem[k]) { t[k] = t[k] || Date.now(); p[k] = 1; } }
    grava(TK, t); grava(PEND, p);
  }
  pronto = true; erro = ''; agenda(); diag('ouvindo nuvem');
  aoVivo();
  setInterval(function () { if (!vivo || Date.now() - ultLeitura > 60000) busca(); }, CADA);
  setInterval(function () { if (document.visibilityState !== 'hidden') diag(); }, 120000);
})();
