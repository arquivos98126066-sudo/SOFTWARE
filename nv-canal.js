/* Canal único com o servidor dos apps (Cloudflare). Uma conexão ao vivo por página, para todas as coleções.
   O servidor numera cada mudança; aqui elas chegam na mesma ordem em todos os aparelhos.
   - ouve(col, desde, cb): manda o que mudou depois de "desde" e depois cada mudança nova, ao vivo;
   - grava(ops): envia; o que não foi confirmado é reenviado na ordem quando a conexão volta;
   - caiu a conexão: volta sozinha (na hora quando a internet volta ou o app reabre);
   - entra com o login do menu (Firebase): o servidor só libera as áreas daquela pessoa. */
(function () {
  if (window.NvCanal) return;
  /* no endereço próprio (apps.v4cless.com) o servidor é o mesmo endereço; no GitHub, o endereço da Cloudflare */
  var SRV = window.NV_SERVIDOR || (location.protocol === 'https:' && !/github\.io$/.test(location.hostname) ? 'wss://' + location.host : 'wss://nv-dados.meusapps.workers.dev');
  var URL_WS = SRV + '/ws?k=nv1-meus-apps';
  var eu = null, negadas = {};
  var ws = null, aberto = false, espera = 500, fila = [], q = 0, subs = {}, ultimo = {}, pedidos = {}, ouvintes = [], pingT = null, pongAte = 0, abrindo = false;
  function estado(v) { aberto = v; ouvintes.forEach(function (f) { try { f(v); } catch (e) {} }); }
  function manda(o) { if (ws && aberto) { try { ws.send(JSON.stringify(o)); return true; } catch (e) {} } return false; }
  /* login: troca a chave de renovação guardada pelo menu por um passe de 1 hora */
  var CH = 'AIzaSyDPJvM-XZWfa8HQ7h8v0Usb1Hf3q8sDqpg', passe = null, passeAte = 0;
  function lerLs(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function pegaPasse() {
    if (window.NV_TOKEN_TESTE) return Promise.resolve(window.NV_TOKEN_TESTE);
    if (passe && Date.now() < passeAte - 120000) return Promise.resolve(passe);
    var rt = lerLs('nv.rt'); if (!rt) return Promise.resolve(null);
    return Promise.race([fetch('https://securetoken.googleapis.com/v1/token?key=' + CH, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'grant_type=refresh_token&refresh_token=' + encodeURIComponent(rt) }).then(function (r) { return r.ok ? r.json() : null; }), new Promise(function (ok) { setTimeout(function () { ok(null); }, 8000); })])
      .then(function (j) { if (!j || !j.id_token) return null; passe = j.id_token; passeAte = Date.now() + (+j.expires_in || 3600) * 1000; try { if (j.refresh_token) localStorage.setItem('nv.rt', j.refresh_token); } catch (e) {} return passe; })
      .catch(function () { return null; });
  }
  function conecta() {
    if (abrindo || (ws && ws.readyState <= 1)) return;
    abrindo = true;
    pegaPasse().then(function (t) {
      try { ws = new WebSocket(URL_WS + (t ? '&t=' + encodeURIComponent(t) : '')); } catch (e) { abrindo = false; volta(); return; }
      prepara();
    });
  }
  function prepara() {
    ws.onopen = function () {
      abrindo = false; espera = 500; estado(true);
      Object.keys(subs).forEach(function (col) { manda({ t: 'sub', col: col, desde: ultimo[col] || 0 }); });
      fila.forEach(function (p) { manda(p.msg); });
      Object.keys(pedidos).forEach(function (k) { manda(pedidos[k].msg); });
      bate();
    };
    ws.onmessage = function (e) {
      var m; try { m = JSON.parse(e.data); } catch (x) { return; }
      pongAte = 0;
      if (m.t === 'docs') {
        var s = subs[m.col]; if (!s) return;
        (m.docs || []).forEach(function (d) { if (d.x && d.x.st > (ultimo[m.col] || 0)) ultimo[m.col] = d.x.st; });
        s.forEach(function (cb) { try { cb(m.docs || [], !!m.fim); } catch (x) {} });
      } else if (m.t === 'ok') {
        for (var i = 0; i < fila.length; i++) if (fila[i].msg.q === m.q) { var p = fila.splice(i, 1)[0]; p.ok(m.seq); break; }
      } else if (m.t === 'doc' || m.t === 'eu' || m.t === 'usuarios' || m.t === 'negado') {
        if (m.t === 'eu') eu = m;
        if (m.t === 'negado' && m.col && subs[m.col]) negadas[m.col] = 1;
        var pd = pedidos[m.q]; if (pd) { delete pedidos[m.q]; pd.ok(m.t === 'doc' ? m.x : m.t === 'negado' ? (m.col ? null : { negado: true }) : m); }
      }
    };
    ws.onclose = ws.onerror = function () { abrindo = false; if (aberto) estado(false); aberto = false; ws = null; volta(); };
  }
  var voltaT = null;
  function volta() { clearTimeout(voltaT); if (document.visibilityState === 'hidden') return; voltaT = setTimeout(conecta, espera); espera = Math.min(espera * 2, 10000); }
  /* confere a conexão a cada 25 s com a tela aberta (conexão morta no celular nem sempre avisa) */
  function bate() {
    clearTimeout(pingT);
    pingT = setTimeout(function () {
      if (document.visibilityState === 'hidden' || !aberto) return;
      if (pongAte && Date.now() > pongAte) { try { ws.close(); } catch (e) {} return; }
      manda({ t: 'ping' }); pongAte = Date.now() + 10000; bate();
    }, 25000);
  }
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') { espera = 500; if (!ws) conecta(); else bate(); } });
  addEventListener('online', function () { espera = 500; if (!ws) conecta(); });

  function pede(msg) { return new Promise(function (ok) { var k = 'p' + (++q); msg.q = k; pedidos[k] = { msg: msg, ok: ok }; manda(msg); conecta(); }); }
  window.NvCanal = {
    ouve: function (col, desde, cb) {
      if (!subs[col]) subs[col] = [];
      subs[col].push(cb);
      if ((desde || 0) > (ultimo[col] || 0)) ultimo[col] = desde;
      if (subs[col].length === 1) manda({ t: 'sub', col: col, desde: ultimo[col] || 0 });
      else manda({ t: 'sub', col: col, desde: desde || 0 });
      conecta();
    },
    grava: function (ops) {
      return new Promise(function (ok) {
        var msg = { t: 'grava', q: 'g' + (++q) + '_' + Date.now().toString(36), ops: ops };
        fila.push({ msg: msg, ok: ok });
        manda(msg); conecta();
      });
    },
    pega: function (col, id) { return pede({ t: 'pega', col: col, id: id }); },
    /* quem está usando: { email, admin, areas, chave } */
    eu: function () { return pede({ t: 'eu' }); },
    usuarios: function () { return pede({ t: 'usuarios' }); },
    salvaUsuario: function (email, areas, ativo) { return pede({ t: 'usuario', email: email, areas: areas, ativo: ativo !== false }); },
    negada: function (col) { return !!negadas[col]; },
    /* pedido comum ao servidor (fotos), com o mesmo login */
    http: function (caminho, op) { return pegaPasse().then(function (t) { return fetch(SRV.replace(/^ws/, 'http') + caminho + (caminho.indexOf('?') < 0 ? '?' : '&') + 'k=nv1-meus-apps' + (t ? '&t=' + encodeURIComponent(t) : ''), op); }); },
    sair: function () { passe = null; passeAte = 0; try { ws && ws.close(); } catch (e) {} },
    vivo: function () { return aberto; },
    estado: function (f) { ouvintes.push(f); },
    pendentes: function () { return fila.length; }
  };
  conecta();
})();
