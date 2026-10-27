/* Motor de chaves ao vivo (Rico, lista e marcações do Plano, Estudo, textos do CRM e do Tapete).
   Cada chave do aparelho (localStorage) vira um documento na nuvem: {k, v, ap (apagada), st (hora do servidor)}.
   r9, econômico e sem perda:
   - ao abrir, desce só o que mudou desde a última vez (consulta por st), não a coleção inteira;
   - junta mudanças de dois aparelhos na mesma chave por partes (base, aparelho e nuvem): células diferentes não se apagam;
   - empate no mesmo pedaço: fica a mudança mais nova e a outra vai para a coleção de conflitos (nada some);
   - a ordem é a do servidor, não o relógio do celular;
   - envia 0,4 s depois da última letra (no máximo 1 envio por segundo enquanto digita);
   - diagnóstico em coleção própria (diag), sem acordar os outros celulares.
   r11: o servidor é o da Cloudflare (nv-canal.js), que numera cada mudança; todos recebem na mesma ordem.
   Uso: nuvem-rico.js (Rico) ou nuvem-rico.js?col=plano&k=chave1,prefixo* (&so=1 só recebe). */
var VER = 'r11', CH = 'AIzaSyDPJvM-XZWfa8HQ7h8v0Usb1Hf3q8sDqpg', PROJ = 'projects/meus-apps-8ca76/databases/(default)/documents';
var QS = new URL(import.meta.url).searchParams, OUTRO = QS.get('col');
var URL0 = 'https://firestore.googleapis.com/v1/' + PROJ, PRE = self.NV_COL ? self.NV_COL + '_' : '';
var COL = OUTRO ? PRE + OUTRO : (self.NV_COL || 'rico_vivo'), CONF = PRE + 'v2_conflitos', DIAG = PRE + 'diag';
var CHAVES = (QS.get('k') || '').split(',').filter(Boolean), SO = OUTRO ? QS.get('so') === '1' : !!self.NV_SORECEBE;
var NS = OUTRO ? 'nv.' + OUTRO + '.' : 'nv.', LIMITE = 900000, PEND = NS + 'pend.v1', ST = NS + 'seq.cf1', JUNTO = NS + 'junto.v2', RT = 'nv.rt';
var orig = { set: Storage.prototype.setItem, rem: Storage.prototype.removeItem, get: Storage.prototype.getItem };
var timer = null, primeiraMudanca = 0, enviando = false, lendo = false, aplicando = false, ultimoToque = Date.now(), iniciado = false;
var vivo = 0, canal = null, base = {}, baseOk = false, tok = null, tokAte = 0, est = 'carregou', erro = '', envios = 0, recebidos = 0;
self.NV_VER = VER;

function sincroniza(k) { if (OUTRO) return typeof k === 'string' && CHAVES.some(function (c) { return c.slice(-1) === '*' ? k.indexOf(c.slice(0, -1)) === 0 : k === c; }); return typeof k === 'string' && k.indexOf('rico.') === 0 && k.indexOf('rico.seed.') !== 0 && !/\.foto$/.test(k) && k.indexOf('rico.y.') !== 0 && k.indexOf('rico.rd.') !== 0 && k.indexOf('rico.fixarTela') !== 0; }
function ler(k) { try { return orig.get.call(localStorage, k); } catch (e) { return null; } }
function mapa(k) { try { return JSON.parse(ler(k) || '{}') || {}; } catch (e) { return {}; } }
function grava(k, o) { try { orig.set.call(localStorage, k, typeof o === 'string' ? o : JSON.stringify(o)); } catch (e) { erro = 'aparelho cheio: ' + e.name; } }
function idDe(k) { return String(k).replace(/[^A-Za-z0-9_.-]/g, '_').slice(0, 140) || '_'; }
function pares(o) { return Object.keys(o).map(function (c) { return [[c], o[c]]; }); }
function lim(pr, ms) { return Promise.race([pr, new Promise(function (_, rj) { setTimeout(function () { rj(new Error('demorou')); }, ms); })]); }
var devId = ler('nv.dev') || ('d' + Math.random().toString(36).slice(2, 8)); grava('nv.dev', devId);
/* o que já estava pendente de sessões anteriores é mudança de verdade deste aparelho (não valor de fábrica) */
var pendAntigo = mapa(PEND);

/* base = último valor confirmado pela nuvem de cada chave (no IndexedDB), para juntar por partes */
var idb = null;
function abreIdb() {
  if (idb) return idb;
  idb = new Promise(function (ok) {
    try { var q = indexedDB.open('nv_motor', 1); q.onupgradeneeded = function () { q.result.createObjectStore('base'); }; q.onsuccess = function () { ok(q.result); }; q.onerror = function () { ok(null); }; } catch (e) { ok(null); }
  });
  return idb;
}
async function carregaBase() {
  var db = await abreIdb();
  if (db) await new Promise(function (ok) {
    try {
      var r = db.transaction('base', 'readonly').objectStore('base').openCursor(IDBKeyRange.bound(COL + '|', COL + '|￿'));
      r.onsuccess = function () { var c = r.result; if (!c) { ok(); return; } var kk = c.key.slice(COL.length + 1); base[kk] = c.value; lembra(kk, c.value); c.continue(); };
      r.onerror = function () { ok(); };
    } catch (e) { ok(); }
  });
  baseOk = true;
}
async function poeBase(k, v) {
  base[k] = v; lembra(k, v); var db = await abreIdb(); if (!db) return;
  try { db.transaction('base', 'readwrite').objectStore('base').put(v, COL + '|' + k); } catch (e) {}
}

/* pendências: chave -> 1 (mudou) ou 2 (apagou) */
function marca(k, apagado) { var p = mapa(PEND); p[k] = apagado ? 2 : 1; grava(PEND, p); }
Storage.prototype.setItem = function (k, v) {
  var vigia = this === localStorage && !aplicando && !SO && sincroniza(k), antes = vigia ? ler(k) : null;
  var r = orig.set.apply(this, arguments);
  if (vigia && antes !== String(v)) { marca(k, false); agenda(); }
  return r;
};
Storage.prototype.removeItem = function (k) {
  var tinha = this === localStorage && !aplicando && !SO && sincroniza(k) && ler(k) != null;
  var r = orig.rem.apply(this, arguments);
  if (tinha) { marca(k, true); agenda(); }
  return r;
};

/* login: usa a chave de renovação guardada pelo menu; sem ela vai sem login (enquanto as regras permitirem) */
async function token() {
  if (tok && tokAte > Date.now() + 60000) return tok;
  var rt = ler(RT); if (!rt) return null;
  try {
    var r = await lim(fetch('https://securetoken.googleapis.com/v1/token?key=' + CH, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'grant_type=refresh_token&refresh_token=' + encodeURIComponent(rt) }), 15000);
    if (!r.ok) return null;
    var j = await r.json(); tok = j.id_token; tokAte = Date.now() + (+j.expires_in || 3600) * 1000; grava(RT, j.refresh_token || rt);
    return tok;
  } catch (e) { return null; }
}
async function pede(caminho, metodo, corpo) {
  if (self.NV_EMU) throw new Error('rest desligado no teste');
  var h = { 'Content-Type': 'application/json' }, t = await token();
  if (t) h.Authorization = 'Bearer ' + t;
  var r = await lim(fetch(URL0 + caminho + (caminho.indexOf('?') < 0 ? '?' : '&') + 'key=' + CH, { method: metodo || 'GET', headers: h, body: corpo ? JSON.stringify(corpo) : undefined, cache: 'no-store' }), 20000);
  if (!r.ok) throw new Error(caminho.split('?')[0].slice(-30) + ' ' + r.status);
  return r.json();
}

/* junta por partes. b = base, l = aparelho, r = nuvem. O que só um lado mudou desde a base vale.
   Os dois mudaram o mesmo pedaço: vale o lado "pref" e o outro vai para os conflitos. */
function igual(a, b) { return a === b || JSON.stringify(a) === JSON.stringify(b); }
function obj(x) { return !!x && typeof x === 'object' && !Array.isArray(x); }
function comIds(x) { return Array.isArray(x) && x.length > 0 && x.every(function (i) { return obj(i) && i.id != null; }); }
function vazioOuIds(x) { return x == null || (Array.isArray(x) && (!x.length || comIds(x))); }
function junta(b, l, r, pref, perdas, cam) {
  if (igual(l, r)) return l;
  if (b !== undefined && igual(l, b)) return r;
  if (b !== undefined && igual(r, b)) return l;
  if (obj(l) && obj(r)) {
    var bb = obj(b) ? b : undefined, o = {}, ks = {};
    Object.keys(l).concat(Object.keys(r)).forEach(function (k) { ks[k] = 1; });
    Object.keys(ks).forEach(function (k) {
      var tl = k in l, tr = k in r, tb = !!bb && k in bb;
      if (tl && tr) { o[k] = junta(tb ? bb[k] : undefined, l[k], r[k], pref, perdas, cam + '.' + k); return; }
      var so = tl ? l[k] : r[k];
      /* existe de um lado só: se o outro apagou e este não mexeu, fica apagado */
      if (tb && igual(so, bb[k])) return;
      if (tb) perdas.push({ cam: cam + '.' + k, v: so, apagado: tl ? 'nuvem' : 'aparelho' });
      o[k] = so;
    });
    return o;
  }
  if (vazioOuIds(l) && vazioOuIds(r) && (comIds(l) || comIds(r))) {
    var mb = {}, ml = {}, mr = {}, ordem = [], out = [];
    if (comIds(b)) b.forEach(function (i) { mb[i.id] = i; });
    (l || []).forEach(function (i) { ml[i.id] = i; ordem.push(i.id); });
    (r || []).forEach(function (i) { mr[i.id] = i; if (!(i.id in ml)) ordem.push(i.id); });
    ordem.forEach(function (id) {
      var nb = mb[id], nl = ml[id], nr = mr[id];
      if (nl && nr) { out.push(junta(nb, nl, nr, pref, perdas, cam + '[' + id + ']')); return; }
      var so = nl || nr;
      if (nb && igual(so, nb)) return;
      if (nb) perdas.push({ cam: cam + '[' + id + ']', v: so, apagado: nl ? 'nuvem' : 'aparelho' });
      out.push(so);
    });
    return out;
  }
  /* listas de listas do mesmo tamanho (as etapas do Rico guardam as células assim): junta posição por posição */
  if (Array.isArray(l) && Array.isArray(r) && l.length === r.length && l.length && l.every(function (x) { return Array.isArray(x) || obj(x); }) && r.every(function (x) { return Array.isArray(x) || obj(x); })) {
    var bl = Array.isArray(b) && b.length === l.length ? b : [];
    return l.map(function (x, i) { return junta(bl[i], x, r[i], pref, perdas, cam + '[' + i + ']'); });
  }
  perdas.push({ cam: cam, v: pref === 'l' ? r : l });
  return pref === 'l' ? l : r;
}
/* depois de juntar um mapa do Rico: as células da etapa atual e as "children" são a mesma lista; ficam iguais */
function arruma(n) {
  if (!obj(n)) return n;
  if (obj(n.et) && Array.isArray(n.et.s) && Array.isArray(n.children) && n.et.s[n.et.cur] !== undefined) n.et.s[n.et.cur] = n.children;
  if (Array.isArray(n.children)) n.children.forEach(arruma);
  if (obj(n.et) && Array.isArray(n.et.s)) n.et.s.forEach(function (st) { if (Array.isArray(st)) st.forEach(arruma); });
  return n;
}
/* cada gravação leva "pai" = resumo do valor em que ela se baseou; quem recebe uma gravação feita sem ver a sua
   junta as duas a partir desse pai (guardado no histórico curto de cada chave) */
var hist = {};
function resumo(v) { v = v == null ? '\u0000' : String(v); var h = 5381; for (var i = 0; i < v.length; i++) h = ((h << 5) + h + v.charCodeAt(i)) | 0; return (h >>> 0).toString(36) + v.length.toString(36); }
function lembra(k, v) { var m = hist[k] || (hist[k] = {}), r = resumo(v); m[r] = v; var ks = Object.keys(m); if (ks.length > 12) delete m[ks[0]]; return r; }
function parse(v) { if (v == null) return undefined; try { return JSON.parse(v); } catch (e) { return undefined; } }

function guardaConflito(k, valor, motivo) {
  var id = (idDe(COL + '_' + k).slice(0, 90) + '_' + devId + '_' + Date.now()).replace(/\./g, '_');
  var corpo = { k: k, v: String(valor == null ? '(apagado)' : valor).slice(0, LIMITE), dev: devId, col: COL, motivo: String(motivo).slice(0, 300), t: Date.now() };
  if (canal) canal.grava([{ col: CONF, id: id, troca: true, set: pares(corpo) }]);
}

/* chegou da nuvem: d = {k, v, ap, st} */
function aplica(d) {
  var k = d.k; if (!sincroniza(k)) return false;
  var rv = d.ap ? null : d.v, local = ler(k), p = mapa(PEND), b = base[k];
  if (rv === local) { if (p[k]) { delete p[k]; grava(PEND, p); } poeBase(k, rv); return false; }
  var novo = rv, reenvia = false;
  if (p[k] && !SO) {
    var semBase = b === undefined, pref = semBase && !pendAntigo[k] ? 'r' : 'l';
    var lj = parse(local), rj = parse(rv), bj = semBase ? undefined : parse(b);
    if (lj !== undefined && rj !== undefined && (obj(lj) || Array.isArray(lj)) && (obj(rj) || Array.isArray(rj))) {
      var perd = [];
      var j = junta(semBase ? undefined : (bj === undefined ? null : bj), lj, rj, pref, perd, '');
      novo = JSON.stringify(arruma(j));
      if (perd.length) guardaConflito(k, pref === 'l' ? rv : local, (semBase ? 'primeira junção' : 'os dois mudaram') + ': ' + perd.map(function (x) { return x.cam || '(tudo)'; }).slice(0, 8).join(', '));
      reenvia = novo !== rv;
    } else if (pref === 'l') {
      novo = local; reenvia = true; guardaConflito(k, rv, 'os dois mudaram');
    } else {
      novo = rv; if (local != null) guardaConflito(k, local, 'primeira junção: o aparelho tinha outro valor');
    }
  } else if (!SO && d.pai && d.por !== devId && b !== undefined && d.pai !== resumo(b) && hist[k] && hist[k][d.pai] !== undefined && local != null && rv != null) {
    /* o outro aparelho gravou em cima de uma versão antiga: junta a partir dela, sem perder o que este aparelho já tinha mandado */
    var anc = parse(hist[k][d.pai]), lj3 = parse(local), rj3 = parse(rv);
    if (lj3 !== undefined && rj3 !== undefined && (obj(lj3) || Array.isArray(lj3))) {
      var perd3 = [], j3 = junta(anc === undefined ? null : anc, lj3, rj3, 'r', perd3, '');
      novo = JSON.stringify(arruma(j3)); reenvia = novo !== rv;
      if (perd3.length) guardaConflito(k, local, 'gravado em cima: ' + perd3.map(function (x) { return x.cam || '(tudo)'; }).slice(0, 8).join(', '));
    } else if (local !== rv) guardaConflito(k, local, 'gravado em cima');
  } else if (b === undefined && local != null && !SO) {
    /* aparelho sem base e sem pendência: vale a nuvem, mas o que ele tinha vai para os conflitos */
    guardaConflito(k, local, 'aparelho tinha outro valor');
  }
  poeBase(k, rv);
  if (novo !== local) {
    aplicando = true;
    try { if (novo == null) orig.rem.call(localStorage, k); else orig.set.call(localStorage, k, novo); } catch (e) { aplicando = false; erro = 'aparelho cheio'; return false; }
    aplicando = false;
  }
  var p2 = mapa(PEND);
  if (reenvia) { p2[k] = novo == null ? 2 : 1; grava(PEND, p2); agenda(); }
  else if (p2[k]) { delete p2[k]; grava(PEND, p2); }
  return novo !== local;
}

var mudadas = {}, telaT = null;
function ocupado() { return Date.now() - ultimoToque < 400 || !!(window.rcMapa && window.rcMapa.ocupado && window.rcMapa.ocupado()); }
function atualizaTela() {
  telaT = null;
  if (ocupado()) { telaT = setTimeout(atualizaTela, 400); return; }
  var ks = Object.keys(mudadas); mudadas = {};
  if (!ks.length) return;
  var f = OUTRO ? (window.nvTela && window.nvTela[OUTRO]) : (window.rcMapa && window.rcMapa.nuvem && window.rcMapa.nuvem.bind(window.rcMapa));
  if (f) { try { f(ks); } catch (e) { erro = 'tela: ' + e.message; } }
}
var espera = [];
function recebe(docs) {
  if (!baseOk) { espera = espera.concat(docs); return; }
  var mudou = false, maior = +ler(ST) || 0;
  docs.forEach(function (d) {
    if (d.st && d.st > maior) maior = d.st;
    if (!d.k) return;
    recebidos++;
    if (aplica(d)) { mudou = true; mudadas[d.k] = 1; }
  });
  if (maior) grava(ST, String(maior));
  if (mudou && !telaT) atualizaTela();
}

/* envio: 60 ms depois da última mudança e no máximo 0,25 s de espera enquanto digita; tudo num lote só */
function agenda() {
  if (SO) return;
  clearTimeout(timer);
  if (!primeiraMudanca) primeiraMudanca = Date.now();
  timer = setTimeout(envia, Math.min(60, Math.max(0, 250 - (Date.now() - primeiraMudanca))));
}
async function envia() {
  primeiraMudanca = 0;
  if (!iniciado || enviando) { if (enviando) agenda(); return; }
  if (!navigator.onLine) return;
  enviando = true;
  var p = mapa(PEND), lote = [], falhou = false;
  Object.keys(p).forEach(function (k) {
    var apagado = p[k] === 2, v = apagado ? null : ler(k);
    if (!apagado && v == null) apagado = true;
    if (!apagado && v.length > LIMITE) { erro = 'grande demais: ' + k + ' (' + Math.round(v.length / 1024) + ' KB), fica só no aparelho'; return; }
    lote.push({ k: k, v: apagado ? '' : v, ap: apagado, marca: p[k], pai: base[k] === undefined ? '' : resumo(base[k]) });
  });
  for (var i = 0; i < lote.length; i += 300) {
    var l = lote.slice(i, i + 300);
    try {
      if (!canal) throw new Error('sem servidor');
      await lim(canal.grava(l.map(function (x) { return { col: COL, id: idDe(x.k), troca: true, set: pares({ k: x.k, v: x.v, ap: x.ap, t: Date.now(), pai: x.pai, por: devId }) }; })), 15000);
      var p2 = mapa(PEND);
      l.forEach(function (x) {
        /* só sai da fila se não mudou de novo enquanto enviava */
        var agora = ler(x.k);
        if (p2[x.k] === x.marca && (x.ap ? agora == null : agora === x.v)) { delete p2[x.k]; delete pendAntigo[x.k]; poeBase(x.k, x.ap ? null : x.v); }
      });
      grava(PEND, p2); envios += l.length;
    } catch (e) { falhou = true; erro = 'envio: ' + (e.code || e.message); }
  }
  enviando = false;
  if (falhou) { diag(); clearTimeout(timer); timer = setTimeout(envia, 15000); }
  else if (Object.keys(mapa(PEND)).length) agenda();
}
['touchstart', 'keydown', 'pointerdown'].forEach(function (e) { addEventListener(e, function () { ultimoToque = Date.now(); }, { capture: true, passive: true }); });
document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') { clearTimeout(timer); envia(); diag(); } });
addEventListener('pagehide', function () { clearTimeout(timer); envia(); });
addEventListener('online', function () { agenda(); if (!vivo) busca(); });

/* reserva por leitura simples (sem conexão ao vivo), só quando o canal não abre */
function campos(x) { x = x || {}; return { k: x.k, v: x.v == null ? '' : String(x.v), ap: !!x.ap, pai: x.pai || '', por: x.por || '', st: +x.st || 0 }; }
async function busca() {
  if (lendo || vivo || document.visibilityState === 'hidden' || self.NV_EMU) return;
  lendo = true;
  try {
    var desde = (ler(JUNTO) && +ler(ST)) || 0, srv = (self.NV_SERVIDOR || (location.protocol === 'https:' && !/github\.io$/.test(location.hostname) ? 'wss://' + location.host : 'wss://nv-dados.meusapps.workers.dev')).replace(/^ws/, 'http');
    var r = await lim(fetch(srv + '/le?k=nv1-meus-apps&col=' + encodeURIComponent(COL) + '&desde=' + desde, { cache: 'no-store' }), 20000);
    if (!r.ok) throw new Error('leitura ' + r.status);
    var j = await r.json();
    recebe((j.docs || []).map(function (d) { return campos(d.x); }));
  } catch (e) { erro = 'leitura: ' + e.message; }
  lendo = false;
}

/* canal ao vivo: só o que mudou desde a última vez. Na primeira vez com este servidor, lê tudo uma vez. */
async function aoVivo() {
  try {
    if (!self.NvCanal) await import(new URL('nv-canal.js', import.meta.url).href);
    canal = self.NvCanal;
    canal.estado(function (v) { vivo = v ? (vivo || Date.now()) : 0; if (v) agenda(); });
    var desde = (ler(JUNTO) && +ler(ST)) || 0;
    canal.ouve(COL, desde, function (lista, fim) {
      if (!vivo) vivo = Date.now();
      var docs = lista.map(function (d) { return campos(d.x); }).filter(function (x) { return x.k; });
      if (docs.length) recebe(docs);
      if (!iniciado && fim) comeca();
    });
  } catch (e) { vivo = 0; erro = 'ao vivo: ' + e.message; busca(); }
}

/* depois da primeira leitura: chaves que só este aparelho tem sobem; o que estava na fila sai */
function comeca() {
  if (iniciado) return; iniciado = true;
  est = 'ouvindo nuvem';
  if (espera.length) { var f = espera; espera = []; recebe(f); }
  if (!SO && !ler(JUNTO)) {
    var p = mapa(PEND);
    for (var j = 0; j < localStorage.length; j++) { var k = localStorage.key(j); if (sincroniza(k) && base[k] === undefined && !p[k]) p[k] = 1; }
    grava(PEND, p);
  }
  grava(JUNTO, ler(JUNTO) || String(Date.now()));
  agenda(); diag();
}

/* diagnóstico: 1 documento por aparelho e coleção, fora das coleções de dados; só grava quando muda */
var ultDiag = '';
function diag(e) {
  if (e) est = e;
  if (!canal) return;
  var o = { dev: devId, col: COL, ver: VER, pag: location.pathname.split('/').pop() || 'menu', ua: navigator.userAgent.slice(0, 160), pend: Object.keys(mapa(PEND)).length, aovivo: vivo ? 'sim' : 'nao', login: tok ? 'sim' : 'nao', est: est, erro: erro, cache: self.NV_CACHE || '' };
  var s = JSON.stringify(o); if (s === ultDiag) return; ultDiag = s;
  o.envios = envios; o.recebidos = recebidos; o.t = Date.now();
  canal.grava([{ col: DIAG, id: devId + '_' + idDe(COL), troca: true, set: pares(o) }]);
}

(async function () {
  await carregaBase();
  if (espera.length) { var f = espera; espera = []; recebe(f); }
  aoVivo();
  setTimeout(function () { if (!iniciado) busca().then(comeca); }, 8000);
  setInterval(function () { if (!vivo) busca(); }, 10000);
  setInterval(function () { if (document.visibilityState !== 'hidden') diag(); }, 600000);
})();
