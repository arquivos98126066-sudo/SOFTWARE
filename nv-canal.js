/* Canal único com o servidor dos apps (Cloudflare). Uma conexão ao vivo por página, para todas as coleções.
   O servidor numera cada mudança; aqui elas chegam na mesma ordem em todos os aparelhos.
   - ouve(col, desde, cb): manda o que mudou depois de "desde" e depois cada mudança nova, ao vivo;
   - grava(ops): envia; o que não foi confirmado é reenviado na ordem quando a conexão volta;
   - caiu a conexão: volta sozinha (na hora quando a internet volta ou o app reabre). */
(function () {
  if (window.NvCanal) return;
  var URL_WS = (window.NV_SERVIDOR || 'wss://nv-dados.meusapps.workers.dev') + '/ws?k=nv1-meus-apps';
  var ws = null, aberto = false, espera = 500, fila = [], q = 0, subs = {}, ultimo = {}, pedidos = {}, ouvintes = [], pingT = null, pongAte = 0, abrindo = false;
  function estado(v) { aberto = v; ouvintes.forEach(function (f) { try { f(v); } catch (e) {} }); }
  function manda(o) { if (ws && aberto) { try { ws.send(JSON.stringify(o)); return true; } catch (e) {} } return false; }
  function conecta() {
    if (abrindo || (ws && ws.readyState <= 1)) return;
    abrindo = true;
    try { ws = new WebSocket(URL_WS); } catch (e) { abrindo = false; volta(); return; }
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
      } else if (m.t === 'doc') {
        var pd = pedidos[m.q]; if (pd) { delete pedidos[m.q]; pd.ok(m.x); }
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
    pega: function (col, id) {
      return new Promise(function (ok) { var k = 'p' + (++q); pedidos[k] = { msg: { t: 'pega', q: k, col: col, id: id }, ok: ok }; manda(pedidos[k].msg); conecta(); });
    },
    vivo: function () { return aberto; },
    estado: function (f) { ouvintes.push(f); },
    pendentes: function () { return fila.length; }
  };
  conecta();
})();
