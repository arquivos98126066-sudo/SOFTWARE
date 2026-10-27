/* Preservação (fase 0): guarda uma cópia completa do que este aparelho tem (localStorage, IndexedDB e HTMLs enviados),
   antes de qualquer migração. A cópia vai cifrada (só a chave privada, fora do GitHub, abre) para a coleção "preservacao",
   cada envio com nome próprio e sem nunca sobrescrever outro. Nada aqui altera os dados dos apps. */
(function () {
  if (window.__PV || window.top !== window) return; window.__PV = 1;
  var VER = 'p1', PUB = 'MIIBojANBgkqhkiG9w0BAQEFAAOCAY8AMIIBigKCAYEA0rIG5uHvxEf9JiVEyggEgRaRqdzkuWrsuvgxm9EHlrSKQg0sW3gC9oFM5IP9gQ979qSQLxwnmOXMzdD1mrbQj9kUVXUQtSdejehhtIz2XBonw4WYuqHoHqmZVac0y+PlRSKFTkVMpC0D09Xjxi8BiUiIakgaHu4bp/NFDnsRErKGHQauYP2KLNKzr/8oB7Wg7xG6H937eSmSnFJ32tqt6ORwr2tdImGWYAnVxkguCMD6cQQwqMQjxTy2+dzc5MMAzyhbhAMvavBxmHGbbjtEd1GHyT3LnqTPfUpGs6uxh4mvulfic90z2NxQBlCWm9nBUXD7Lrv9xUovNkkSbcUvNvv5d+Lj5u45o6h3C07LFXtsITzy/Hae6foIS95OfFQi0Qcj/3jMYMFAobrIQKXJdh84Oile7nEhwsKGvKbrEPSd03HK1hv+aL/BAb00hQA5gbZWk+dYHyl7pbwzJ0IvYegBGJFvbyNdbgPeGHnhAANHUOVD49AlbOPGsfTM+YapAgMBAAE=';
  var BASE = 'https://firestore.googleapis.com/v1/projects/meus-apps-8ca76/databases/(default)/documents/preservacao/', CH = 'AIzaSyDPJvM-XZWfa8HQ7h8v0Usb1Hf3q8sDqpg';
  var PARTE = 700000, CONHECIDOS = ['meus_apps_backup', 'adm_backup', 'doa_processo_db', 'retina_v2', 'firebaseLocalStorageDb', 'firestore/[DEFAULT]/meus-apps-8ca76/main', 'firebase-heartbeat-database', 'firebase-installations-database'];
  var o = { set: Storage.prototype.setItem, get: Storage.prototype.getItem };
  function ler(k) { try { return o.get.call(localStorage, k); } catch (e) { return null; } }
  function grava(k, v) { try { o.set.call(localStorage, k, v); } catch (e) {} }
  var passos = [];
  function diz(t) { passos.push(t); grava('pv.st', new Date().toISOString() + ' ' + t); if (window.PV_MOSTRA) try { window.PV_MOSTRA(t); } catch (e) {} }
  /* o localStorage é copiado na hora em que a página abre (antes de os apps juntarem com a nuvem) */
  var ls = window.__PV_LS || (function () { var r = {}; try { for (var i = 0; i < localStorage.length; i++) { var k = localStorage.key(i); r[k] = localStorage.getItem(k); } } catch (e) {} return r; })();
  Object.keys(ls).forEach(function (k) { if (k.indexOf('pv.') === 0) delete ls[k]; });
  var abriu = window.__PV_T || Date.now();

  function b64(buf) { var u = new Uint8Array(buf), s = '', i; for (i = 0; i < u.length; i += 32768) s += String.fromCharCode.apply(null, u.subarray(i, i + 32768)); return btoa(s); }
  function deB64(s) { var b = atob(s), u = new Uint8Array(b.length); for (var i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; }
  /* valores do IndexedDB que não são JSON comum ganham uma etiqueta, para voltar iguais */
  async function ser(v, n) {
    if (n > 40) return { __pv: 'fundo' };
    if (v == null || typeof v !== 'object') return v;
    if (v instanceof Date) return { __pv: 'data', v: v.toISOString() };
    if (typeof Blob !== 'undefined' && v instanceof Blob) { try { return { __pv: 'blob', tipo: v.type, v: b64(await v.arrayBuffer()) }; } catch (e) { return { __pv: 'blob-erro' }; } }
    if (v instanceof ArrayBuffer) return { __pv: 'bytes', v: b64(v) };
    if (ArrayBuffer.isView(v)) return { __pv: 'bytes', classe: v.constructor && v.constructor.name, v: b64(v.buffer.slice(v.byteOffset, v.byteOffset + v.byteLength)) };
    if (Array.isArray(v)) { var a = []; for (var i = 0; i < v.length; i++) a.push(await ser(v[i], n + 1)); return a; }
    var r = {}; for (var k in v) { if (Object.prototype.hasOwnProperty.call(v, k)) r[k] = await ser(v[k], n + 1); } return r;
  }
  function abre(nome) {
    return new Promise(function (ok) {
      var cancelado = false, q;
      try { q = indexedDB.open(nome); } catch (e) { ok(null); return; }
      /* banco que não existia: não cria nada */
      q.onupgradeneeded = function () { cancelado = true; try { q.transaction.abort(); } catch (e) {} };
      q.onsuccess = function () { if (cancelado) { try { q.result.close(); } catch (e) {} ok(null); } else ok(q.result); };
      q.onerror = function () { ok(null); };
      q.onblocked = function () { ok(null); };
      setTimeout(function () { ok(null); }, 8000);
    });
  }
  function tudo(st) { return new Promise(function (ok, rj) { var ks = st.getAllKeys(), vs = st.getAll(); vs.onsuccess = function () { ok({ ks: ks.result || [], vs: vs.result || [] }); }; vs.onerror = function () { rj(vs.error); }; ks.onerror = function () { rj(ks.error); }; }); }
  async function idb(erros) {
    var nomes = [];
    try { if (indexedDB.databases) nomes = (await indexedDB.databases()).map(function (d) { return d.name; }); } catch (e) { erros.push('lista idb: ' + e); }
    CONHECIDOS.forEach(function (n) { if (nomes.indexOf(n) < 0) nomes.push(n); });
    var r = {};
    for (var i = 0; i < nomes.length; i++) {
      var db = await abre(nomes[i]); if (!db) continue;
      var lojas = {}, ns = [].slice.call(db.objectStoreNames);
      for (var j = 0; j < ns.length; j++) {
        try { var x = await tudo(db.transaction(ns[j], 'readonly').objectStore(ns[j])); lojas[ns[j]] = { chaves: await ser(x.ks, 0), valores: await ser(x.vs, 0) }; }
        catch (e) { erros.push('idb ' + nomes[i] + '/' + ns[j] + ': ' + e); }
      }
      r[nomes[i]] = { versao: db.version, lojas: lojas };
      try { db.close(); } catch (e) {}
    }
    return r;
  }
  async function enviados(erros) {
    var r = [];
    try { if (window.caches && (await caches.keys()).indexOf('apps-enviados') >= 0) { var c = await caches.open('apps-enviados'), q = await c.keys(); for (var i = 0; i < q.length; i++) { var x = await c.match(q[i]); r.push({ url: q[i].url, txt: await x.text() }); } } } catch (e) { erros.push('enviados: ' + e); }
    return r;
  }
  async function versoes() {
    var v = { pv: VER, nv: window.NV_VER || null, pagina: (document.querySelector('meta[name="app-ver"]') || {}).content || null };
    try { v.caches = await caches.keys(); } catch (e) {}
    try { var rg = navigator.serviceWorker && await navigator.serviceWorker.getRegistration(); v.sw = rg && rg.active ? rg.active.scriptURL : null; } catch (e) {}
    return v;
  }
  async function hash(txt) { return b64(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(txt))).slice(0, 32); }
  async function gz(bytes) {
    if (typeof CompressionStream === 'undefined') return { b: bytes, gz: false };
    var s = new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip'));
    return { b: new Uint8Array(await new Response(s).arrayBuffer()), gz: true };
  }
  async function cifra(bytes) {
    var pub = await crypto.subtle.importKey('spki', deB64(PUB), { name: 'RSA-OAEP', hash: 'SHA-256' }, false, ['encrypt']);
    var k = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt']);
    var iv = crypto.getRandomValues(new Uint8Array(12));
    var c = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, k, bytes);
    var bruta = await crypto.subtle.exportKey('raw', k);
    return { c: b64(c), chave: b64(await crypto.subtle.encrypt({ name: 'RSA-OAEP' }, pub, bruta)), iv: b64(iv) };
  }
  function espera(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  /* grava um documento novo; se o nome já existe, não sobrescreve (a nuvem recusa) */
  async function poe(id, campos) {
    for (var t = 0; t < 5; t++) {
      try {
        var r = await fetch(BASE + encodeURIComponent(id) + '?currentDocument.exists=false&key=' + CH, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fields: campos }) });
        if (r.ok) return true;
        if (r.status === 400 || r.status === 409) { var tx = await r.text(); if (/ALREADY_EXISTS|exists/i.test(tx)) return true; }
        if (r.status === 403) throw new Error('recusado pela nuvem (403)');
        if (r.status === 429) throw new Error('a nuvem atingiu o limite do dia (429): tenta de novo depois');
      } catch (e) { if (/403|429/.test(String(e))) throw e; }
      await espera(1000 * Math.pow(2, t));
    }
    throw new Error('não gravou ' + id);
  }
  async function confere(id, n) {
    var r = await fetch(BASE + encodeURIComponent(id) + '?mask.fieldPaths=n&mask.fieldPaths=hash&key=' + CH, { cache: 'no-store' });
    if (!r.ok) return false;
    return true;
  }
  var rodando = null;
  async function roda(forca) {
    if (rodando) return rodando;
    rodando = (async function () {
      var erros = [];
      try {
        if (!navigator.onLine) { diz('sem internet: tenta na próxima abertura'); return { ok: false, motivo: 'sem internet' }; }
        if (!window.crypto || !crypto.subtle) { diz('este navegador não cifra: use o Chrome'); return { ok: false, motivo: 'sem cifra' }; }
        var ult = +ler('pv.ok') || 0;
        /* já guardou nas últimas 20 h: nem lê nada (não pesa na abertura do app) */
        if (!forca && ult && Date.now() - ult < 20 * 3600000) { diz('cópia recente já guardada'); return { ok: true, recente: true }; }
        diz('lendo o que o aparelho guarda');
        var dev = ler('pv.dev') || ler('nv.dev') || ('d' + Math.random().toString(36).slice(2, 8)); grava('pv.dev', dev);
        var foto = { fmt: 'pv1', dev: dev, ua: navigator.userAgent, origem: location.href, abriu: abriu, ls: ls, idb: await idb(erros), enviados: await enviados(erros), versoes: await versoes() };
        foto.erros = erros;
        var txt = JSON.stringify(foto), h = await hash(JSON.stringify([foto.ls, foto.idb, foto.enviados]));
        if (!forca && ler('pv.h') === h) { grava('pv.ok', String(Date.now())); diz('cópia igual à última guardada: nada a enviar'); return { ok: true, igual: true }; }
        var bytes = new TextEncoder().encode(txt), z = await gz(bytes), c = await cifra(z.b);
        var id = dev + '_' + new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14) + '_' + Math.random().toString(36).slice(2, 5);
        var n = Math.ceil(c.c.length / PARTE);
        for (var i = 0; i < n; i++) {
          diz('enviando parte ' + (i + 1) + ' de ' + n);
          await poe(id + '_c' + ('00' + i).slice(-3), { id: { stringValue: id }, i: { integerValue: String(i) }, d: { stringValue: c.c.slice(i * PARTE, (i + 1) * PARTE) } });
        }
        var resumo = { ls: Object.keys(ls).length, lsBytes: txt.length, idb: Object.keys(foto.idb).map(function (d) { var l = foto.idb[d].lojas; return d + ':' + Object.keys(l).map(function (s) { return s + '=' + (l[s].chaves || []).length; }).join(','); }), enviados: foto.enviados.length, erros: erros.length };
        var s = function (x) { return { stringValue: String(x) }; };
        /* a ficha vai por último: só existe quando todas as partes já estão na nuvem */
        await poe(id, { dev: s(dev), ua: s(navigator.userAgent.slice(0, 200)), pag: s(location.pathname.split('/').pop() || 'menu'), t: { integerValue: String(Date.now()) }, ver: s(VER), n: { integerValue: String(n) }, bytes: { integerValue: String(bytes.length) }, gz: { booleanValue: z.gz }, chave: s(c.chave), iv: s(c.iv), hash: s(h), resumo: s(JSON.stringify(resumo)), versoes: s(JSON.stringify(foto.versoes)), forca: { booleanValue: !!forca } });
        if (!(await confere(id, n))) throw new Error('não conferiu');
        grava('pv.ok', String(Date.now())); grava('pv.h', h); grava('pv.ult', id);
        diz('cópia guardada e conferida: ' + n + ' parte(s), ' + Math.round(bytes.length / 1024) + ' KB, ' + resumo.ls + ' itens');
        return { ok: true, id: id, partes: n, kb: Math.round(bytes.length / 1024), itens: resumo.ls, erros: erros };
      } catch (e) { diz('falhou: ' + (e && e.message || e) + ' (tenta de novo na próxima abertura)'); return { ok: false, motivo: String(e && e.message || e) }; }
      finally { rodando = null; }
    })();
    return rodando;
  }
  /* arquivo cifrado para guardar no próprio celular (cópia extra) */
  async function arquivo() {
    var erros = [], foto = { fmt: 'pv1', dev: ler('pv.dev') || ler('nv.dev'), ua: navigator.userAgent, origem: location.href, abriu: abriu, ls: ls, idb: await idb(erros), enviados: await enviados(erros), versoes: await versoes(), erros: erros };
    var z = await gz(new TextEncoder().encode(JSON.stringify(foto))), c = await cifra(z.b);
    return new Blob([JSON.stringify({ fmt: 'pv1-arquivo', gz: z.gz, chave: c.chave, iv: c.iv, c: c.c })], { type: 'application/json' });
  }
  window.Preserva = { roda: roda, arquivo: arquivo, passos: passos };
  if (!window.PV_MANUAL) {
    var vai = function () { setTimeout(function () { roda(false); }, 3000); };
    if (document.readyState === 'complete') vai(); else addEventListener('load', vai);
  }
})();
