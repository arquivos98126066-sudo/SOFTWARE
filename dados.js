/* Camada única de dados dos apps (CRM, Tapete, ADM, Plano...). Cada item de uma lista vira um documento na nuvem:
   v2_<nome>/<id> = { ij (id original), d: { campo: valor em JSON }, del (apagado), st (hora do servidor), por (aparelho), area }.
   - O app continua com a lista dele; depois de salvar, chama Dados.mudou(nome). A camada compara campo a campo e envia só o que mudou.
   - Fila no aparelho (IndexedDB): o que não foi confirmado pela nuvem sobrevive a fechar o app e volta a subir sozinho.
   - Ao abrir, desce só o que mudou desde a última vez. Dois aparelhos mudando campos diferentes: os dois valem.
     Mesmo campo nos dois: vale o mais novo no servidor e o outro vai para v2_conflitos (nada some).
   - Apagar vira marca (del), para cópia antiga não fazer o item voltar. Restaurar é só salvar o item de novo.
   - Envio 0,4 s depois da última mudança (no máximo 1 s esperando enquanto digita).
   Uso: Dados.liga({ nome, ler: () => lista, escrever: (lista, ids) => {...}, novoNoInicio, area }) */
(function () {
  if (window.Dados) return;
  var VER = 'd2', CH = 'AIzaSyDPJvM-XZWfa8HQ7h8v0Usb1Hf3q8sDqpg', PRE = window.NV_COL ? window.NV_COL + '_' : '';
  var LIMITE_CAMPO = 700000, LIMITE_DOC = 950000;
  var F = null, db = null, cols = {}, dev = null, carregando = null;
  function lerLs(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  dev = lerLs('nv.dev') || ('d' + Math.random().toString(36).slice(2, 8));
  try { localStorage.setItem('nv.dev', dev); } catch (e) {}

  /* ---------- IndexedDB: base (último confirmado), fila (não confirmado) e meta ---------- */
  var idbP = null;
  function idb() {
    if (idbP) return idbP;
    idbP = new Promise(function (ok) {
      try {
        var q = indexedDB.open('nv_dados', 1);
        q.onupgradeneeded = function () { ['base', 'fila', 'meta'].forEach(function (s) { q.result.createObjectStore(s); }); };
        q.onsuccess = function () { ok(q.result); }; q.onerror = function () { ok(null); };
      } catch (e) { ok(null); }
    });
    return idbP;
  }
  function todos(loja, pref) {
    return idb().then(function (b) {
      if (!b) return {};
      return new Promise(function (ok) {
        var o = {};
        try {
          var r = b.transaction(loja, 'readonly').objectStore(loja).openCursor(IDBKeyRange.bound(pref, pref + '￿'));
          r.onsuccess = function () { var c = r.result; if (!c) return ok(o); o[c.key.slice(pref.length)] = c.value; c.continue(); };
          r.onerror = function () { ok(o); };
        } catch (e) { ok(o); }
      });
    });
  }
  function poe(loja, k, v) { return idb().then(function (b) { if (!b) return; return new Promise(function (ok) { try { var t = b.transaction(loja, 'readwrite'); if (v === undefined) t.objectStore(loja).delete(k); else t.objectStore(loja).put(v, k); t.oncomplete = ok; t.onerror = ok; t.onabort = ok; } catch (e) { ok(); } }); }); }

  /* ---------- Firestore (app "nv", o mesmo canal dos outros) ---------- */
  function banco() {
    if (carregando) return carregando;
    carregando = (async function () {
      var A = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js');
      F = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js');
      var app = A.getApps().filter(function (a) { return a.name === 'nv'; })[0] || A.initializeApp({ apiKey: CH, projectId: 'meus-apps-8ca76', appId: '1:768854372271:web:467b541baf3c513f03095a' }, 'nv');
      db = window.__nvDb;
      if (!db) {
        try { db = F.initializeFirestore(app, { experimentalAutoDetectLongPolling: true }); } catch (e) { db = F.getFirestore(app); }
        if (window.NV_EMU) { try { F.connectFirestoreEmulator(db, '127.0.0.1', window.NV_EMU); } catch (e) {} }
        window.__nvDb = db;
      }
      return db;
    })();
    return carregando;
  }
  function idDoc(id) { var s = String(id).replace(/\//g, '%2F'); if (s === '.' || s === '..' || !s) s = '_' + s; return s.slice(0, 700); }

  /* fotos guardadas no próprio item (data:...) ficam só no aparelho até irem para o armazenamento de arquivos */
  function ehMidia(v) { return typeof v === 'string' && v.length > 2000 && v.slice(0, 5) === 'data:'; }
  function semMidia(v) {
    if (ehMidia(v)) return undefined;
    if (Array.isArray(v)) return v.map(semMidia).filter(function (x) { return x !== undefined; });
    if (v && typeof v === 'object') { var o = {}; Object.keys(v).forEach(function (k) { var x = semMidia(v[k]); if (x !== undefined) o[k] = x; }); return o; }
    return v;
  }
  function temMidia(v) { return ehMidia(v) || (Array.isArray(v) ? v.some(temMidia) : !!v && typeof v === 'object' && Object.keys(v).some(function (k) { return temMidia(v[k]); })); }
  /* junta o que chegou da nuvem com as fotos que só este aparelho tem */
  function reinsere(novo, velho) {
    if (velho === undefined || !temMidia(velho)) return novo;
    if (ehMidia(velho) && novo === undefined) return velho;
    if (Array.isArray(velho) && (Array.isArray(novo) || novo === undefined)) return (novo || []).concat(velho.filter(ehMidia));
    if (velho && typeof velho === 'object' && novo && typeof novo === 'object' && !Array.isArray(novo)) { var o = Object.assign({}, novo); Object.keys(velho).forEach(function (k) { var x = reinsere(novo[k], velho[k]); if (x !== undefined) o[k] = x; }); return o; }
    return novo;
  }
  /* JSON com as chaves sempre na mesma ordem: o mesmo conteúdo dá sempre o mesmo texto (senão a ordem diferente parecia mudança) */
  function estavel(v) {
    if (Array.isArray(v)) return '[' + v.map(function (x) { return x === undefined || typeof x === 'function' ? 'null' : estavel(x); }).join(',') + ']';
    if (v && typeof v === 'object') return '{' + Object.keys(v).sort().filter(function (k) { return v[k] !== undefined && typeof v[k] !== 'function'; }).map(function (k) { return JSON.stringify(k) + ':' + estavel(v[k]); }).join(',') + '}';
    return JSON.stringify(v === undefined ? null : v);
  }
  function canon(t) { try { return estavel(JSON.parse(t)); } catch (e) { return t; } }
  /* campos de um item: { campo: JSON }, sem o id */
  function campos(item, cfg) {
    var o = {}, ign = (cfg && cfg.ignora) || [];
    if (!item || typeof item !== 'object') return o;
    Object.keys(item).forEach(function (c) {
      if (c === 'id' || ign.indexOf(c) >= 0) return;
      var v = item[c]; if (v === undefined || typeof v === 'function') return;
      if (cfg && cfg.semMidia) { v = semMidia(v); if (v === undefined) return; }
      try { o[c] = estavel(v); } catch (e) {}
    });
    return o;
  }
  function monta(id, cs) { var o = { id: id }; Object.keys(cs).forEach(function (c) { try { o[c] = JSON.parse(cs[c]); } catch (e) {} }); return o; }
  function mesmo(a, b) { var ka = Object.keys(a || {}), kb = Object.keys(b || {}); if (ka.length !== kb.length) return false; for (var i = 0; i < ka.length; i++) if (a[ka[i]] !== b[ka[i]]) return false; return true; }

  function liga(cfg) {
    var nome = cfg.nome, C = {
      cfg: cfg, col: PRE + 'v2_' + nome, atual: {}, ids: {}, base: {}, fila: {}, meta: {}, pronto: false, iniciado: false,
      meus: {}, timer: null, diffT: null, primeira: 0, enviando: false, aplicando: false, erro: '', envios: 0, recebidos: 0, vivo: false, espera: []
    };
    cols[nome] = C;
    var p = Promise.all([todos('base', nome + '|'), todos('fila', nome + '|'), todos('meta', nome + '|')]).then(function (r) {
      C.base = r[0]; C.fila = r[1]; C.meta = r[2][''] || {};
      Object.keys(C.base).forEach(function (k) { var b = C.base[k]; if (b && b.d) Object.keys(b.d).forEach(function (c) { b.d[c] = canon(b.d[c]); }); });
      /* o que o app tem agora; o que difere da base e não está na fila é mudança que ainda não subiu */
      var lista = lista0(C);
      lista.forEach(function (it) { var k = idDoc(it.id); C.ids[k] = it.id; C.atual[k] = campos(it, cfg); });
      if (C.meta.junto) {
        Object.keys(C.atual).forEach(function (k) { if (!C.fila[k] && C.base[k] && !mesmo(C.atual[k], C.base[k].d)) marcaTudo(C, k, C.base[k].d); });
        Object.keys(C.base).forEach(function (k) { if (!C.atual[k] && !C.base[k].del && !C.fila[k]) {/* sumiu do app sem passar pela camada: não apaga (pode ser cache vazio); espera a nuvem */} });
      }
      C.pronto = true;
      ouve(C);
    });
    C.prontoP = p;
    return C;
  }
  function lista0(C) { try { return (C.cfg.ler() || []).filter(function (x) { return x && x.id != null; }); } catch (e) { return []; } }
  function marcaTudo(C, k, antes) {
    var cs = C.atual[k] || {}, f = C.fila[k] || { campos: {}, del: false, v: 0 };
    Object.keys(cs).forEach(function (c) { if (!antes || antes[c] !== cs[c]) f.campos[c] = 1; });
    Object.keys(antes || {}).forEach(function (c) { if (!(c in cs)) f.campos[c] = 1; });
    f.del = false; f.v = (f.v || 0) + 1; C.fila[k] = f; poe('fila', C.cfg.nome + '|' + k, f);
  }

  /* o app salvou: compara (no máximo a cada 0,25 s) */
  function mudou(nome, forca) {
    var C = cols[nome]; if (!C || C.aplicando) return;
    if (forca) C.forca = true;
    clearTimeout(C.diffT); C.diffT = setTimeout(function () { compara(C); }, 250);
  }
  function compara(C) {
    if (!C.pronto) { C.diffT = setTimeout(function () { compara(C); }, 300); return; }
    var lista = lista0(C), vistos = {}, mudou = false;
    lista.forEach(function (it) {
      var k = idDoc(it.id), cs = campos(it, C.cfg), antes = C.atual[k];
      vistos[k] = 1; C.ids[k] = it.id;
      if (antes && mesmo(antes, cs) && !(C.fila[k] && C.fila[k].del)) return;
      C.atual[k] = cs; marcaTudo(C, k, antes); mudou = true;
    });
    var some = Object.keys(C.atual).filter(function (k) { return !vistos[k]; });
    /* muitos sumindo de uma vez (lista vazia por erro de carga): não apaga na nuvem */
    var forca = C.forca; C.forca = false;
    if (!forca && some.length > 5 && some.length > Object.keys(C.atual).length * 0.3) { C.erro = 'apagar ' + some.length + ' de uma vez: segurado'; diag(C); return mudou && agenda(C); }
    some.forEach(function (k) { delete C.atual[k]; var f = C.fila[k] || { campos: {}, v: 0 }; f.del = true; f.campos = {}; f.v = (f.v || 0) + 1; C.fila[k] = f; poe('fila', C.cfg.nome + '|' + k, f); mudou = true; });
    if (mudou) agenda(C);
  }
  function agenda(C) {
    clearTimeout(C.timer);
    if (!C.primeira) C.primeira = Date.now();
    C.timer = setTimeout(function () { envia(C); }, Math.min(400, Math.max(0, 1000 - (Date.now() - C.primeira))));
  }
  async function envia(C) {
    C.primeira = 0;
    if (!C.iniciado || !db) return;
    if (C.enviando) { agenda(C); return; }
    if (!navigator.onLine) return;
    var ks = Object.keys(C.fila); if (!ks.length) return;
    C.enviando = true;
    var lote = F.writeBatch(db), itens = [], n = 0;
    ks.slice(0, 300).forEach(function (k) {
      var f = C.fila[k], ref = F.doc(db, C.col, k), cab = { ij: JSON.stringify(C.ids[k] != null ? C.ids[k] : k), st: F.serverTimestamp(), por: dev, area: C.cfg.area || 'geral' };
      if (f.del) { cab.del = true; lote.set(ref, cab, { merge: true }); itens.push({ k: k, v: f.v, del: true }); n++; return; }
      var cs = C.atual[k] || {}, caminhos = ['ij', 'st', 'por', 'area', 'del'], dados = Object.assign({ del: false }, cab), d = {}, tam = 0, grandes = [];
      Object.keys(f.campos).forEach(function (c) {
        if (c in cs) {
          if (cs[c].length > LIMITE_CAMPO || tam + cs[c].length > LIMITE_DOC) { grandes.push(c); return; }
          d[c] = cs[c]; tam += cs[c].length;
        } else d[c] = F.deleteField();
        caminhos.push(new F.FieldPath('d', c));
      });
      if (grandes.length) C.erro = 'grande demais (fica só no aparelho): ' + C.cfg.nome + ' ' + k + ' ' + grandes.join(',');
      dados.d = d;
      lote.set(ref, dados, { mergeFields: caminhos });
      itens.push({ k: k, v: f.v, d: d, grandes: grandes }); n++;
    });
    try {
      await Promise.race([lote.commit(), new Promise(function (_, rj) { setTimeout(function () { rj(new Error('demorou')); }, 15000); })]);
      itens.forEach(function (x) {
        var f = C.fila[x.k]; if (!f || f.v !== x.v) return;
        var b = C.base[x.k] || { d: {} };
        if (x.del) b = { d: b.d, del: true };
        else { b = { d: Object.assign({}, b.d), del: false }; Object.keys(x.d).forEach(function (c) { if (typeof x.d[c] === 'string') b.d[c] = x.d[c]; else delete b.d[c]; C.meus[x.k + '|' + c] = Date.now(); }); }
        C.base[x.k] = b; poe('base', C.cfg.nome + '|' + x.k, b);
        if (x.grandes && x.grandes.length) { f.campos = {}; x.grandes.forEach(function (c) { f.campos[c] = 1; }); f.grande = true; poe('fila', C.cfg.nome + '|' + x.k, f); }
        else { delete C.fila[x.k]; poe('fila', C.cfg.nome + '|' + x.k, undefined); }
      });
      C.envios += n; if (/^envio/.test(C.erro)) C.erro = ''; diag(C);
      if (window.syncShow && !Object.keys(cols).some(function (q) { return Object.keys(cols[q].fila).some(function (k) { return !cols[q].fila[k].grande; }); })) try { syncShow.synced(C.cfg.rotulo || ''); } catch (e) {}
    } catch (e) { C.erro = 'envio: ' + (e.code || e.message); diag(C); if (window.syncShow) try { syncShow.offline(); } catch (x) {} C.enviando = false; clearTimeout(C.timer); C.timer = setTimeout(function () { envia(C); }, 15000); return; }
    C.enviando = false;
    var resta = Object.keys(C.fila).filter(function (k) { return !C.fila[k].grande; });
    if (resta.length) agenda(C);
  }

  /* ---------- receber ---------- */
  function guardaConflito(C, k, campo, valor, motivo) {
    if (!db) return;
    F.addDoc(F.collection(db, PRE + 'v2_conflitos'), { col: C.col, id: k, campo: campo, v: String(valor == null ? '(apagado)' : valor).slice(0, 900000), motivo: motivo, dev: dev, t: Date.now() }).catch(function () {});
  }
  async function ouve(C) {
    try { await banco(); } catch (e) { C.erro = 'sem firebase: ' + e.message; return; }
    var desde = C.meta.junto && C.meta.st;
    var q = desde ? F.query(F.collection(db, C.col), F.where('st', '>', F.Timestamp.fromDate(new Date(desde)))) : F.collection(db, C.col);
    F.onSnapshot(q, function (snap) {
      C.vivo = true;
      var docs = [];
      snap.docChanges().forEach(function (ch) { if (ch.type !== 'removed' && !ch.doc.metadata.hasPendingWrites) docs.push({ k: ch.doc.id, x: ch.doc.data() }); });
      recebe(C, docs, !C.iniciado);
      if (!C.iniciado) comeca(C);
    }, function (e) { C.vivo = false; C.erro = 'ao vivo: ' + (e.code || e.message); diag(C); setTimeout(function () { ouve(C); }, 15000); });
  }
  function recebe(C, docs, primeira) {
    var mudados = [], maior = C.meta.st || '';
    docs.forEach(function (doc) {
      var k = doc.k, x = doc.x || {}, st = x.st && x.st.toDate ? x.st.toDate().toISOString() : '';
      if (st > maior) maior = st;
      C.recebidos++;
      var R = {}; Object.keys(x.d || {}).forEach(function (c) { if (typeof x.d[c] === 'string') R[c] = canon(x.d[c]); });
      var id; try { id = x.ij != null ? JSON.parse(x.ij) : k; } catch (e) { id = k; }
      C.ids[k] = id;
      var L = C.atual[k], B = C.base[k], P = C.fila[k];
      C.base[k] = { d: R, del: !!x.del }; poe('base', C.cfg.nome + '|' + k, C.base[k]);
      if (x.del) {
        if (P && !P.del && L) { guardaConflito(C, k, '*', JSON.stringify(monta(id, L)), 'apagado em outro aparelho e mudado aqui: ficou'); marcaTudo(C, k, null); return; }
        if (L) { delete C.atual[k]; mudados.push(k); }
        if (P) { delete C.fila[k]; poe('fila', C.cfg.nome + '|' + k, undefined); }
        return;
      }
      if (!L) { C.atual[k] = R; mudados.push(k); if (P && P.del) { delete C.fila[k]; poe('fila', C.cfg.nome + '|' + k, undefined); } return; }
      var novo = {}, reenvia = {}, todosCampos = {};
      Object.keys(R).concat(Object.keys(L)).forEach(function (c) { todosCampos[c] = 1; });
      var semBase = !B || B.del;
      Object.keys(todosCampos).forEach(function (c) {
        var r = R[c], l = L[c], b = semBase ? undefined : B.d[c], pend = P && P.campos[c];
        if (r === l) { if (r !== undefined) novo[c] = r; return; }
        if (pend) {
          /* mudança deste aparelho ainda não confirmada: vale ela; se a nuvem também mudou o campo, a da nuvem vira conflito */
          if (l !== undefined) novo[c] = l;
          if (!semBase && r !== b && r !== undefined) guardaConflito(C, k, c, r, 'os dois mudaram');
          reenvia[c] = 1; return;
        }
        if (semBase) {
          /* primeira junção: vale a nuvem; o que só o aparelho tem fica e sobe; valor diferente do aparelho vira conflito */
          if (r === undefined) { novo[c] = l; reenvia[c] = 1; return; }
          novo[c] = r; if (l !== undefined) guardaConflito(C, k, c, l, 'primeira junção: o aparelho tinha outro valor'); return;
        }
        /* outro aparelho gravou o mesmo campo logo depois deste: vale o mais novo e o deste vai para os conflitos */
        if (x.por && x.por !== dev && l !== undefined && Date.now() - (C.meus[k + '|' + c] || 0) < 60000) guardaConflito(C, k, c, l, 'gravado em cima por outro aparelho');
        if (r !== undefined) novo[c] = r;
      });
      if (!mesmo(novo, L)) { C.atual[k] = novo; mudados.push(k); }
      if (Object.keys(reenvia).length) { var f = C.fila[k] || { campos: {}, del: false, v: 0 }; Object.keys(reenvia).forEach(function (c) { f.campos[c] = 1; }); f.v = (f.v || 0) + 1; C.fila[k] = f; poe('fila', C.cfg.nome + '|' + k, f); agenda(C); }
      else if (P && !Object.keys(P.campos).length && !P.del) { delete C.fila[k]; poe('fila', C.cfg.nome + '|' + k, undefined); }
    });
    if (maior && C.iniciado) { C.meta.st = maior; poe('meta', C.cfg.nome + '|', C.meta); }
    else if (maior) C.stPendente = maior;
    if (mudados.length) { escreve(C, mudados); if (C.iniciado) diag(C); }
  }
  function escreve(C, mudados) {
    var lista = lista0(C), porK = {}, ordem = [];
    lista.forEach(function (it) { var k = idDoc(it.id); porK[k] = it; ordem.push(k); });
    var novos = [];
    mudados.forEach(function (k) {
      if (!C.atual[k]) { delete porK[k]; return; }
      var it = monta(C.ids[k], C.atual[k]);
      if (porK[k]) {
        /* troca os campos dentro do mesmo objeto (o app pode ter referências a ele) */
        var o = porK[k], ign = C.cfg.ignora || [];
        Object.keys(o).forEach(function (c) { if (c !== 'id' && !(c in it) && ign.indexOf(c) < 0 && !(C.cfg.semMidia && temMidia(o[c]))) delete o[c]; });
        Object.keys(it).forEach(function (c) { if (c !== 'id') o[c] = C.cfg.semMidia ? reinsere(it[c], o[c]) : it[c]; });
      } else { porK[k] = it; novos.push(k); }
    });
    var final = (C.cfg.novoNoInicio ? novos : []).concat(ordem).concat(C.cfg.novoNoInicio ? [] : novos).filter(function (k) { return porK[k]; }).map(function (k) { return porK[k]; });
    C.aplicando = true;
    try { C.cfg.escrever(final, mudados.map(function (k) { return C.ids[k]; })); } catch (e) { C.erro = 'tela: ' + e.message; }
    C.aplicando = false;
  }
  /* depois da primeira leitura: o que só este aparelho tem sobe (junção, nada se perde) */
  function comeca(C) {
    C.iniciado = true;
    if (!C.meta.junto) {
      /* item de fábrica (criado só porque o aparelho estava vazio) não sobe; se a nuvem já tem itens, sai daqui */
      var nuvemTem = Object.keys(C.base).some(function (k) { return !C.base[k].del; }), tirar = [];
      Object.keys(C.atual).forEach(function (k) {
        if (C.base[k] || C.fila[k]) return;
        if (C.cfg.padrao && C.cfg.padrao(monta(C.ids[k], C.atual[k]))) { if (nuvemTem) { delete C.atual[k]; tirar.push(k); } return; }
        marcaTudo(C, k, null);
      });
      if (tirar.length) escreve(C, tirar);
      C.meta.junto = Date.now();
    }
    if (C.stPendente) { C.meta.st = C.stPendente; C.stPendente = null; }
    poe('meta', C.cfg.nome + '|', C.meta);
    agenda(C); diag(C);
  }

  /* ---------- diagnóstico (só quando muda) ---------- */
  function diag(C) {
    if (!db) return;
    var vivos = Object.keys(C.atual), soma = 0; vivos.sort().forEach(function (k) { for (var i = 0; i < k.length; i++) soma = (soma * 31 + k.charCodeAt(i)) | 0; });
    var o = { dev: dev, col: C.col, ver: VER, itens: vivos.length, ids: (soma >>> 0).toString(36), pag: location.pathname.split('/').pop() || 'menu', fila: Object.keys(C.fila).length, aovivo: C.vivo ? 'sim' : 'nao', erro: C.erro, cache: window.NV_CACHE || '', ua: navigator.userAgent.slice(0, 160) };
    var s = JSON.stringify(o); if (s === C.ultDiag) return;
    /* no máximo 1 diagnóstico a cada 30 s por coleção */
    var falta = 30000 - (Date.now() - (C.ultDiagT || 0));
    if (falta > 0) { clearTimeout(C.diagT); C.diagT = setTimeout(function () { diag(C); }, falta); return; }
    C.ultDiag = s; C.ultDiagT = Date.now();
    o.envios = C.envios; o.recebidos = C.recebidos; o.t = Date.now();
    F.setDoc(F.doc(db, PRE + 'diag', dev + '_' + C.col), o).catch(function () {});
  }
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') Object.keys(cols).forEach(function (n) { var C = cols[n]; clearTimeout(C.diffT); compara(C); clearTimeout(C.timer); envia(C); diag(C); }); });
  addEventListener('online', function () { Object.keys(cols).forEach(function (n) { agenda(cols[n]); }); });
  setInterval(function () { if (document.visibilityState !== 'hidden') Object.keys(cols).forEach(function (n) { diag(cols[n]); }); }, 600000);

  window.Dados = {
    VER: VER, liga: liga, mudou: mudou,
    estado: function (nome, id) { var C = cols[nome]; if (!C) return 'desligado'; var f = C.fila[idDoc(id)]; return f ? (f.grande ? 'grande' : 'pendente') : 'confirmado'; },
    pendentes: function (nome) { var C = cols[nome]; return C ? Object.keys(C.fila).length : 0; },
    info: function (nome) { var C = cols[nome]; return C && { fila: Object.keys(C.fila).length, erro: C.erro, vivo: C.vivo, iniciado: C.iniciado, envios: C.envios, recebidos: C.recebidos }; },
    itens: function (nome) { var C = cols[nome]; return C ? Object.keys(C.atual).map(function (k) { return monta(C.ids[k], C.atual[k]); }) : []; },
    banco: banco
  };
})();
