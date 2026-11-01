/* Versão deste programa (igual ao número do cache do service-worker.js; sobe junto a cada publicação).
   App aberto há tempo: quando volta para a tela (ou a cada 5 min), confere se saiu versão nova; se saiu, troca
   sozinho assim que a pessoa não estiver digitando, uma vez por versão (nunca fica preso recarregando). */
window.NV_APP = 'meus-apps-v403';
(function () {
  try {
    if (window.top !== window || /(reparar|exportar|entrar|copia|atualiza)\.html$/i.test(location.pathname)) return;
    var tecla = 0;
    document.addEventListener('input', function () { tecla = Date.now(); }, true);
    function noAr() { return fetch('service-worker.js?v=' + Date.now(), { cache: 'no-store' }).then(function (r) { return r.ok ? r.text() : ''; }).then(function (t) { return (t.match(/meus-apps-v\d+/) || [])[0] || null; }).catch(function () { return null; }); }
    function digitando() { var a = document.activeElement; return (a && a !== document.body && (/^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) || a.isContentEditable)) || Date.now() - tecla < 4000; }
    function troca(v) {
      if (document.visibilityState !== 'visible') return;
      if (digitando()) { setTimeout(function () { troca(v); }, 3000); return; }
      try { if (localStorage.getItem('nv.atualizou') === v) return; localStorage.setItem('nv.atualizou', v); } catch (e) { return; }
      try { navigator.serviceWorker && navigator.serviceWorker.getRegistration().then(function (r) { r && r.update(); }); } catch (e) {}
      setTimeout(function () { location.reload(); }, 300);
    }
    var ult = 0;
    function confere() {
      if (document.visibilityState !== 'visible' || !navigator.onLine || Date.now() - ult < 5000) return;
      ult = Date.now();
      noAr().then(function (v) { if (v && v !== window.NV_APP && +v.slice(11) > +window.NV_APP.slice(11)) troca(v); });
    }
    document.addEventListener('visibilitychange', confere);
    setInterval(confere, 300000);
    setTimeout(confere, 8000);
  } catch (e) {}
})();

/* Preservação (fase 0): copia o localStorage na hora em que a página abre, antes de os apps juntarem com a nuvem,
   e carrega o preserva.js, que guarda uma cópia cifrada deste aparelho (não muda nada dos apps) */
(function () {
  try {
    if (window.top !== window || window.__PV_LS) return;
    var r = {}; for (var i = 0; i < localStorage.length; i++) { var k = localStorage.key(i); r[k] = localStorage.getItem(k); }
    window.__PV_LS = r; window.__PV_T = Date.now();
    /* versão guardada no aparelho, para o diagnóstico mostrar o que este celular está rodando */
    try { caches.keys().then(function (k) { window.NV_CACHE = k.filter(function (x) { return x.indexOf('meus-apps') === 0; }).join(','); }); } catch (e) {}
    if (/(reparar|exportar)\.html$/i.test(location.pathname)) return;
    var s = document.createElement('script'); s.src = 'preserva.js?v=' + Date.now(); s.async = true; (document.head || document.documentElement).appendChild(s);
  } catch (e) {}
})();

/* Regras de velocidade e firmeza para todos os apps: sem zoom, sem tela deslocada para o lado */
(function () {
  var st = document.createElement('style');
  st.textContent = 'html,body{overscroll-behavior-y:contain}html{touch-action:pan-x pan-y;overscroll-behavior-x:none}'; /* sem puxar para atualizar: a página não recarrega sem querer */
  (document.head || document.documentElement).appendChild(st);
  /* pinça: bloqueada pelo touch-action acima; um ouvinte não passivo aqui faria toda rolagem esperar o app */
  ['gesturestart', 'gesturechange', 'gestureend'].forEach(function (n) { document.addEventListener(n, function (e) { e.preventDefault(); }); });
  function zera() {
    if (window.scrollX) window.scrollTo(0, window.scrollY);
    if (document.documentElement.scrollLeft) document.documentElement.scrollLeft = 0;
  }
  window.addEventListener('scroll', zera, { passive: true });
  if (window.visualViewport) { visualViewport.addEventListener('resize', zera); visualViewport.addEventListener('scroll', zera); }
})();

/* Barra do celular (relógio, bateria) com a cor do HTML aberto: CorBarra.de(html) ao abrir, CorBarra.volta() ao fechar */
var CorBarra = window.CorBarra = (function () {
  var meta = null, orig = null;
  function alvo() {
    if (!meta) {
      meta = document.querySelector('meta[name="theme-color"]');
      if (!meta) { meta = document.createElement('meta'); meta.name = 'theme-color'; document.head.appendChild(meta); }
      orig = meta.getAttribute('content');
    }
    return meta;
  }
  function vars(css) {
    var v = {}, re = /(--[\w-]+)\s*:\s*([^;}]+)/g, m;
    while ((m = re.exec(css))) v[m[1]] = m[2].trim();
    return v;
  }
  function cor(t) {
    if (!t) return null;
    var m = String(t).match(/#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)|hsla?\([^)]*\)/);
    return m ? m[0] : null;
  }
  function acha(html) {
    var css = (html.match(/<style[^>]*>[\s\S]*?<\/style>/gi) || []).join('\n');
    var v = vars(css);
    var b = css.match(/(?:^|[}\s,])body\s*{[^}]*?background(?:-color)?\s*:\s*([^;}]+)/i)
         || css.match(/(?:^|[}\s,])html\s*{[^}]*?background(?:-color)?\s*:\s*([^;}]+)/i);
    if (b) {
      var t = b[1].trim(), r = t.match(/var\(\s*(--[\w-]+)/);
      if (r) t = v[r[1]] || '';
      var c2 = cor(t);
      if (c2) return c2;
    }
    if (v['--bg'] && cor(v['--bg'])) return cor(v['--bg']);
    var m = html.match(/<meta[^>]+name=["']theme-color["'][^>]*>/i);
    if (m) { var c = m[0].match(/content=["']([^"']+)["']/i); if (c) return c[1]; }
    return null;
  }
  return {
    cor: function (html) { return acha(String(html || '')); },
    de: function (html) { var c = acha(String(html || '')); alvo(); if (c) meta.setAttribute('content', c); else CorBarra.volta(); },
    volta: function () { if (meta && orig != null) meta.setAttribute('content', orig); }
  };
})();

/* Barra do celular acompanha a cor de fundo da própria página (vale para todo app, inclusive os enviados pelo menu) */
(function () {
  function fundo() {
    var el = document.body, c = '';
    [document.body, document.documentElement].some(function (e) {
      if (!e) return false;
      c = getComputedStyle(e).backgroundColor;
      return c && c !== 'transparent' && !/rgba\([^)]*,\s*0\)$/.test(c);
    });
    return c && c !== 'transparent' && !/rgba\([^)]*,\s*0\)$/.test(c) ? c : null;
  }
  function aplica() {
    var m = document.querySelector('meta[name="theme-color"]');
    if (m && m.hasAttribute('data-fixa')) return;
    var c = fundo(); if (!c) return;
    if (!m) { m = document.createElement('meta'); m.name = 'theme-color'; document.head.appendChild(m); }
    if (m.getAttribute('content') !== c) m.setAttribute('content', c);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', aplica); else aplica();
  window.addEventListener('load', aplica);
  document.addEventListener('visibilitychange', function () { if (!document.hidden) aplica(); });
})();

/* Botão voltar do celular: fecha a janela aberta ou volta uma tela, como no Estudo; sem nada aberto, volta ao menu */
window.Voltar = (function () {
  var pilha = [], ignorar = 0, emPop = false, base = typeof WeakSet === 'function' ? new WeakSet() : null, pronto = false, tm1, tm2;
  var SEL = '[class~="sidebar"],[class*="modal"],[class*="overlay"],[class*="sheet"],[class*="drawer"],[class*="-ov"],[class*="popup"],[class*="dialog"],[class*="scrim"],[class*="rcm-conf"],[id*="modal"],[id*="overlay"],[id*="sheet"],[id*="drawer"]';
  var FECHA = /\b(fechar|close)(Modal|Sheet|Menu|Cloud|Escolha|Celula|Editor|Hab|Pick|Sidebar|Painel|Overlay|Drawer|Popup|Opcoes|Mais)[A-Za-z0-9_]*\s*\(/;

  function visivel(el) {
    if (!el.isConnected) return false;
    var cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) < 0.05) return false;
    if (cs.position !== 'fixed' && cs.position !== 'absolute') return false;
    var r = el.getBoundingClientRect();
    /* fora da tela (painel escondido para o lado) não conta */
    var dentro = Math.min(r.right, innerWidth) - Math.max(r.left, 0);
    if (dentro < r.width * 0.6 || r.bottom < innerHeight * 0.3 || r.top > innerHeight * 0.7) return false;
    return (r.width >= innerWidth * 0.9 && r.height >= innerHeight * 0.5) || (r.height >= innerHeight * 0.9 && r.width >= 240);
  }
  function abertas() {
    var v = [];
    document.querySelectorAll(SEL).forEach(function (el) { if (visivel(el)) v.push(el); });
    return v.filter(function (el) { return !v.some(function (o) { return o !== el && o.contains(el); }); });
  }
  function empurra() { try { history.pushState({ _voltar: 1 }, ''); } catch (e) {} }
  function volta(n) { if (n > 0) { ignorar++; try { history.go(-n); } catch (e) { ignorar--; } } }

  function varre() {
    if (!pronto) return;
    var v = abertas();
    /* as que estavam abertas desde o início só passam a contar depois de fechar uma vez */
    document.querySelectorAll(SEL).forEach(function (el) { if (base && base.has(el) && v.indexOf(el) === -1) base.delete(el); });
    var aberta = v.filter(function (el) { return !(base && base.has(el)); });
    /* as que fecharam sozinhas */
    var fechadas = 0;
    pilha = pilha.filter(function (p) {
      if (!p.els) return true;
      if (p.els.some(function (e) { return v.indexOf(e) !== -1; })) return true;
      fechadas++; return false;
    });
    /* as novas (várias abertas juntas valem por uma só volta) */
    var novas = aberta.filter(function (el) { return !pilha.some(function (p) { return p.els && p.els.indexOf(el) !== -1; }); });
    if (novas.length) { pilha.push({ els: novas }); empurra(); }
    volta(fechadas);
  }
  function agenda() { clearTimeout(tm1); clearTimeout(tm2); tm1 = setTimeout(varre, 90); tm2 = setTimeout(varre, 450); }

  function fecha(el) {
    var alvo = null;
    el.querySelectorAll('[onclick]').forEach(function (b) { if (!alvo && FECHA.test(b.getAttribute('onclick') || '')) alvo = b; });
    if (!alvo) alvo = el.querySelector('.close,.fechar,[data-fechar],[aria-label="Fechar"],[aria-label="fechar"]');
    if (alvo) alvo.click(); else el.click();
    setTimeout(function () {
      if (!visivel(el)) return;
      el.click();
      setTimeout(function () {
        if (!visivel(el)) return;
        ['open', 'on', 'show', 'active', 'aberto'].forEach(function (c) { el.classList.remove(c); });
        if (visivel(el)) el.style.display = 'none';
      }, 120);
    }, 120);
  }

  var saindo = null;
  window.addEventListener('popstate', function (e) {
    if (saindo) { var u = saindo; saindo = null; e.stopImmediatePropagation(); location.replace(u); return; }
    if (ignorar > 0) { ignorar--; e.stopImmediatePropagation(); return; }
    /* descarta as que já fecharam por conta própria */
    while (pilha.length && pilha[pilha.length - 1].els && !pilha[pilha.length - 1].els.some(visivel)) pilha.pop();
    if (!pilha.length) return;
    var p = pilha.pop();
    e.stopImmediatePropagation();
    if (p.fn) { emPop = true; try { p.fn(); } finally { emPop = false; } }
    else p.els.forEach(function (el) { if (visivel(el)) fecha(el); });
  }, true);

  ['click', 'touchend', 'keyup', 'change'].forEach(function (n) { document.addEventListener(n, agenda, true); });
  setTimeout(function () {
    if (base) abertas().forEach(function (el) { base.add(el); });
    pronto = true;
  }, 1800);

  return {
    /* tela interna aberta pelo app: fn volta uma tela */
    empurra: function (fn) { pilha.push({ fn: fn }); empurra(); },
    /* o app voltou uma tela por conta própria (botão do próprio app) */
    desempilha: function () {
      if (emPop) return;
      for (var i = pilha.length - 1; i >= 0; i--) if (pilha[i].fn) { pilha.splice(i, 1); volta(1); return; }
    },
    varre: varre,
    /* troca de página sem deixar passos do histórico para trás: desfaz o que esta página empurrou e só então troca */
    sai: function (url) {
      var d = (history.state && history.state._d) || 0;
      if (!d) { location.replace(url); return; }
      saindo = url;
      try { history.go(-d); } catch (e) { saindo = null; location.replace(url); return; }
      setTimeout(function () { if (saindo) { var u = saindo; saindo = null; location.replace(u); } }, 700);
    }
  };
})();

/* cada passo que a página empurra no histórico leva a sua profundidade (_d): serve para sair da página sem deixar passos sobrando */
(function () {
  var push = history.pushState;
  history.pushState = function (st, t, u) {
    var d = (history.state && history.state._d) || 0;
    var n = (st && typeof st === 'object') ? Object.assign({}, st) : {};
    n._d = d + 1;
    return push.call(history, n, t, u);
  };
})();


/* ===== Alternar entre apps ===== 
   Ir e voltar com o dedo na horizontal (zigue-zague):
     - app sem par: vai para o menu e guarda de onde saiu; no próximo app, outro zigue-zague conecta os dois e já alterna;
     - app com par: vai direto para o par (e de lá, volta);
   Dois dedos tocando juntos: desfaz a conexão do app em que você está (o próximo zigue-zague volta ao menu). */
window.AlternaGestos = {
  vaiVolta: function gestoVaiVolta(aoFazer){
    var pts = null, t0 = 0;
    function ehVaiVolta(p){
      if (p.length < 4) return false;
      var x0 = p[0].x, m = 0, minY = p[0].y, maxY = p[0].y, i;
      for (i = 1; i < p.length; i++){
        if (Math.abs(p[i].x - x0) > Math.abs(p[m].x - x0)) m = i;
        if (p[i].y < minY) minY = p[i].y;
        if (p[i].y > maxY) maxY = p[i].y;
      }
      var ida = p[m].x - x0, aida = Math.abs(ida), fim = p[p.length - 1];
      if (aida < 40) return false;
      if (m < 1 || m > p.length - 2) return false;
      if ((fim.x - p[m].x) * ida > 0) return false;
      if (Math.abs(p[m].x - fim.x) < aida * 0.6) return false;
      if (maxY - minY > Math.max(45, aida * 0.8)) return false;
      return true;
    }
    function fimToque(){
      var p = pts; pts = null;
      if (p && Date.now() - t0 <= 2200 && ehVaiVolta(p)) aoFazer();
    }
    document.addEventListener('touchstart', function(e){
      if (e.touches.length !== 1 || (e.target === document.activeElement && /^(INPUT|TEXTAREA|SELECT)$/.test((e.target.tagName || '')))) { pts = null; return; }
      var t = e.touches[0]; pts = [{x: t.clientX, y: t.clientY}]; t0 = Date.now();
    }, {passive: true});
    document.addEventListener('touchmove', function(e){
      if (!pts) return;
      if (e.touches.length !== 1) { pts = null; return; }
      var t = e.touches[0], u = pts[pts.length - 1];
      if (Math.hypot(t.clientX - u.x, t.clientY - u.y) >= 5) pts.push({x: t.clientX, y: t.clientY});
    }, {passive: true});
    document.addEventListener('touchend', fimToque, {passive: true});
    document.addEventListener('touchcancel', fimToque, {passive: true});
  },
  v: function gestoV(aoFazer){
    var pts = null, t0 = 0;
    function reto(a, b){ return Math.hypot(b.x - a.x, b.y - a.y); }
    function ehV(p){
      if (p.length < 4) return false;
      var n = p.length, v = 0, minx = p[0].x, maxx = p[0].x;
      for (var i = 1; i < n; i++){ if (p[i].y > p[v].y) v = i; if (p[i].x < minx) minx = p[i].x; if (p[i].x > maxx) maxx = p[i].x; }
      if (v < 1 || v > n - 2) return false;
      var a = p[0], b = p[v], c = p[n - 1];
      var desce = b.y - a.y, sobe = b.y - c.y;
      if (desce < 45 || sobe < 28 || sobe < desce * 0.2 || sobe > desce * 4) return false;
      if (maxx - minx < 22 || maxx - minx < desce * 0.18) return false;
      var cam = 0; for (var k = 1; k < n; k++) cam += reto(p[k - 1], p[k]);
      return cam <= (reto(a, b) + reto(b, c)) * 3;
    }
    function fimToque(){
      var p = pts; pts = null;
      if (p && Date.now() - t0 <= 2500 && ehV(p)) aoFazer();
    }
    document.addEventListener('touchstart', function(e){
      if (e.touches.length !== 1 || (e.target === document.activeElement && /^(INPUT|TEXTAREA|SELECT)$/.test((e.target.tagName || '')))) { pts = null; return; }
      var t = e.touches[0]; pts = [{x: t.clientX, y: t.clientY}]; t0 = Date.now();
    }, {passive: true});
    document.addEventListener('touchmove', function(e){
      if (!pts) return;
      if (e.touches.length !== 1) { pts = null; return; }
      var t = e.touches[0], u = pts[pts.length - 1];
      if (Math.hypot(t.clientX - u.x, t.clientY - u.y) >= 4) pts.push({x: t.clientX, y: t.clientY});
    }, {passive: true});
    document.addEventListener('touchend', fimToque, {passive: true});
    document.addEventListener('touchcancel', fimToque, {passive: true});
  },
  doisDedos: function gestoDoisDedos(aoFazer){
    var t1 = 0, ini = null;
    function longe(e){
      for (var i = 0; i < e.touches.length; i++){
        var t = e.touches[i], o = ini.p[t.identifier];
        if (o && Math.hypot(t.clientX - o.x, t.clientY - o.y) > 24) return true;
      }
      return false;
    }
    document.addEventListener('touchstart', function(e){
      if (e.touches.length === 1){ t1 = Date.now(); ini = null; return; }
      if (e.touches.length === 2 && (e.changedTouches.length === 2 || Date.now() - t1 <= 300)){
        ini = {t: Date.now(), p: {}};
        for (var i = 0; i < 2; i++) ini.p[e.touches[i].identifier] = {x: e.touches[i].clientX, y: e.touches[i].clientY};
      } else ini = null;
    }, {passive: true});
    document.addEventListener('touchmove', function(e){ if (ini && longe(e)) ini = null; }, {passive: true});
    document.addEventListener('touchend', function(){
      var g = ini; ini = null;
      if (g && Date.now() - g.t <= 500) aoFazer();
    }, {passive: true});
    document.addEventListener('touchcancel', function(){ ini = null; }, {passive: true});
  }
};

window.Alterna = (function () {
  var K = 'alterna.v1', VALE = 30 * 60 * 1000;
  var URLS = { tapete: 'TAPETE-CRM.html', crm: 'MEU-CRM.html', plano: 'DOA.html', adm: 'ADM.html', rico: 'RICO.html', ricop: 'RICO.html?i=plano', estudo: 'LER.html', menu: 'index.html' };
  var CODIGO = { plano: 'DOA', estudo: 'LER', rico: 'RICO', ricop: 'RICOP', tapete: 'TAPETE', crm: 'CRM', adm: 'ADM' };
  function quem() {
    var f = (location.pathname.split('/').pop() || '').toLowerCase();
    if (f === 'tapete-crm.html') return 'tapete';
    if (f === 'meu-crm.html') return 'crm';
    if (f === 'doa.html') return 'plano';
    if (f === 'adm.html') return 'adm';
    if (f === 'rico.html') return /[?&]i=plano\b/.test(location.search) ? 'ricop' : 'rico';
    if (f === 'ler.html') return 'estudo';
    return null;
  }
  var eu = quem();
  function ler() {
    try { var s = JSON.parse(localStorage.getItem(K) || 'null'); if (s && typeof s === 'object' && s.p) return s; } catch (e) {}
    return { p: {}, o: null, t: 0 };
  }
  function grava(s) { try { localStorage.setItem(K, JSON.stringify(s)); } catch (e) {} }
  function vibra(p) { try { navigator.vibrate && navigator.vibrate(p); } catch (e) {} }
  function desliga(s, id) { var q = s.p[id]; if (q) delete s.p[q]; delete s.p[id]; }
  var A = {
    eu: eu,
    /* o app define aoSair(destino) para guardar onde você estava (pasta, rolagem...) antes de trocar */
    aoSair: null,
    ir: function (id) {
      try { if (A.aoSair) A.aoSair(id); } catch (e) {}
      try { var c = CODIGO[id]; if (c) sessionStorage.setItem('troca', c); else sessionStorage.removeItem('troca'); } catch (e) {}
      var url = URLS[id]; if (!url) return;
      if (window.Voltar) Voltar.sai(url); else location.replace(url);
    },
    zig: function () {
      if (!eu) return;
      var s = ler(), par = s.p[eu];
      if (par && URLS[par]) { vibra(25); A.ir(par); return; }
      if (s.o && s.o !== eu && URLS[s.o] && Date.now() - s.t < VALE) {
        var alvo = s.o;
        desliga(s, eu); desliga(s, alvo);
        s.p[eu] = alvo; s.p[alvo] = eu; s.o = null; grava(s);
        vibra([30, 60, 30]); A.ir(alvo); return;
      }
      s.o = eu; s.t = Date.now(); grava(s);
      vibra(25); A.ir('menu');
    },
    /* V: de qualquer app (ou HTML do Plano) volta ao menu dos 6, sem mexer nas conexões */
    menu: function () {
      if (!eu) return;
      vibra(25); A.ir('menu');
    },
    /* faixa invisivel embaixo: vai ao menu e guarda de onde saiu, para o app abrir igual quando voce tocar nele no menu */
    botao: function () {
      if (!eu) return;
      try {
        var v = JSON.parse(localStorage.getItem('alterna.volta') || '{}'), t = Date.now();
        var c = CODIGO[eu]; if (c) v[c] = t;
        if (eu === 'ricop') v.DOA = t;
        localStorage.setItem('alterna.volta', JSON.stringify(v));
      } catch (e) {}
      vibra(25); A.ir('menu');
    },
    quebra: function () {
      if (!eu) return;
      var s = ler();
      if (s.p[eu]) { desliga(s, eu); vibra([60, 40, 60]); }
      s.o = null; grava(s);
    }
  };
  if (eu) {
    window.AlternaGestos.vaiVolta(A.zig);
    window.AlternaGestos.doisDedos(A.quebra);
    /* faixa transparente no lado direito, no meio da altura (nada na base da tela: la ficam os botoes do app); o toque nao passa para o que esta embaixo */
    var faixa = function () {
      if (document.getElementById('alterna-base')) return;
      var d = document.createElement('div'); d.id = 'alterna-base';
      d.style.cssText = 'position:fixed;right:0;top:50%;bottom:0;width:calc(48px + env(safe-area-inset-right,0px));z-index:2147483647;background:transparent;touch-action:pan-y;-webkit-tap-highlight-color:transparent;';
      var tocou = false, ultimo = 0;
      /* botao que fica por baixo da faixa (menu inferior do app): so ele recebe o toque, na hora; fora dele, dois toques levam ao menu */
      var botaoAbaixo = function (x, y) {
        try {
          var l = document.elementsFromPoint(x, y), el = null, i;
          for (i = 0; i < l.length; i++) if (l[i] !== d && l[i].id !== 'alterna-base') { el = l[i]; break; }
          for (i = 0; el && el !== document.body && i < 6; i++, el = el.parentElement) {
            var r = el.getBoundingClientRect();
            if (r.height > 130 || r.width > innerWidth * 0.8) continue;
            if ((el.matches && el.matches('button,a[href],input,select,textarea,label,summary,[onclick],[role=button],[role=tab]')) || getComputedStyle(el).cursor === 'pointer') return el;
          }
        } catch (e) {}
        return null;
      };
      var ultimo = 0, tocou = false;
      var toque = function (x, y) {
        /* faixa do meio da tela: sempre e so para sair (dois toques); nas laterais, botao de baixo funciona na hora */
        /* a faixa fica no lado direito, no meio da altura: a base da tela fica 100% livre para os botoes do app */
        A.botao();
      };
      var x0 = 0, y0 = 0;
      d.addEventListener('touchstart', function (e) { e.stopPropagation(); tocou = true; var c0 = e.touches && e.touches[0]; x0 = c0 ? c0.clientX : 0; y0 = c0 ? c0.clientY : 0; }, { passive: true });
      d.addEventListener('touchend', function (e) { e.stopPropagation(); if (e.cancelable) e.preventDefault(); if (tocou) { tocou = false; var c = e.changedTouches && e.changedTouches[0]; if (c && (Math.abs(c.clientX - x0) > 12 || Math.abs(c.clientY - y0) > 12)) return; toque(c ? c.clientX : 0, c ? c.clientY : 0); } });
      d.addEventListener('touchcancel', function () { tocou = false; }, { passive: true });
      d.addEventListener('click', function (e) { e.stopPropagation(); e.preventDefault(); if (!('ontouchstart' in window)) toque(e.clientX, e.clientY); });
      d.addEventListener('mousedown', function (e) { e.stopPropagation(); });
      document.documentElement.appendChild(d);
    };
    /* faixa do lado direito REMOVIDA (pedido do Klebson, 2026-11-01): tocar ali não sai mais do app; a troca de apps segue só pelo zigue-zague */
    /* if (document.documentElement) faixa(); else document.addEventListener('DOMContentLoaded', faixa); */
  }

  /* Tapete, Meu CRM e ADM: nao mostra a pagina enquanto os dados do aparelho ainda estao entrando (senao os nomes aparecem carregando) */
  if (eu === 'tapete' || eu === 'crm' || eu === 'adm') {
    try {
      var est = document.createElement('style'); est.id = 'alterna-quieto'; est.textContent = 'html{visibility:hidden}';
      (document.head || document.documentElement).appendChild(est);
      var solta = function () { clearTimeout(tq); clearTimeout(tmax); if (mo) mo.disconnect(); var x = document.getElementById('alterna-quieto'); if (x) x.remove(); };
      var tq, tmax = setTimeout(solta, 1200), mo = null, carregou = false;
      var espera = function () { clearTimeout(tq); if (carregou) tq = setTimeout(solta, 40); };
      mo = new MutationObserver(espera); mo.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
      var dcl = function () { carregou = true; espera(); };
      if (document.readyState !== 'loading') dcl(); else document.addEventListener('DOMContentLoaded', dcl);
    } catch (e) {}
  }

  /* ----- Tapete CRM, Meu CRM e ADM: voltam na tela e na rolagem em que estavam ----- */
  var GEN = { tapete: 'TAPETE', crm: 'CRM', adm: 'ADM' };
  if (eu && GEN[eu]) {
    var KE = 'alterna.est.' + eu, chegou = false, tocou = false, estilo = null;
    try { chegou = sessionStorage.getItem('troca') === GEN[eu]; } catch (e) {}
    function cam(el) { var p = []; while (el && el !== document.body && el.parentNode) { var i = 0, s2 = el; while ((s2 = s2.previousElementSibling)) i++; p.unshift(i); el = el.parentNode; } return p.join('.'); }
    function ach(c) { var el = document.body, a = c ? c.split('.') : []; for (var i = 0; i < a.length; i++) el = el && el.children[+a[i]]; return el || null; }
    var SEGURAS = { home: 1, clientes: 1, config: 1, fila: 1, registrar: 1 };
    function tela() {
      var e;
      if (eu === 'tapete') { e = document.querySelector('.screen.active'); return e && e.id ? e.id.replace('screen-', '') : null; }
      if (eu === 'crm') { e = document.querySelector('.page.active'); return e && e.id ? e.id.replace('page-', '') : null; }
      e = document.querySelector('.pnl.on'); return e && e.id ? +e.id.replace('p', '') : null;
    }
    function poeTela(t) {
      try {
        if (t === null || t === undefined) return;
        if (eu === 'tapete') { if (SEGURAS[t] && window.showScreen && tela() !== t) { window.showScreen(t, false); if (window.setNav && (t === 'registrar' || t === 'home')) window.setNav(t === 'registrar' ? 0 : 1); } }
        else if (eu === 'crm') { if (window.navigate && tela() !== t) window.navigate(t); }
        else if (window.irPara && tela() !== t) window.irPara(t);
      } catch (e) {}
    }
    A.aoSair = function () {
      try {
        var rolos = [], l = document.body ? document.body.querySelectorAll('*') : [];
        for (var i = 0; i < l.length; i++) { var e = l[i]; if (e.scrollTop > 0 && e.scrollHeight > e.clientHeight + 4) rolos.push([cam(e), e.scrollTop]); }
        localStorage.setItem(KE, JSON.stringify({ t: tela(), y: window.scrollY || 0, r: rolos, ts: Date.now() }));
      } catch (e) {}
    };
    if (chegou) {
      /* não mostra a tela por um instante: ela só aparece já na tela e na rolagem certas */
      estilo = document.createElement('style'); estilo.textContent = 'html{visibility:hidden}';
      (document.head || document.documentElement).appendChild(estilo);
      document.addEventListener('touchstart', function () { tocou = true; }, { passive: true, capture: true });
      var revela = function () { if (estilo) { estilo.remove(); estilo = null; } };
      setTimeout(revela, 1600);
      var feito = false;
      var aplica = function () {
        if (feito) return; feito = true;
        var s2 = null;
        try { sessionStorage.removeItem('troca'); s2 = JSON.parse(localStorage.getItem(KE) || 'null'); } catch (e) {}
        if (!s2 || (s2.ts && Date.now() - s2.ts > 3600000)) { revela(); return; }
        poeTela(s2.t);
        var rola = function () {
          if (tocou) return;
          (s2.r || []).forEach(function (r) { var e = ach(r[0]); if (e && Math.abs(e.scrollTop - r[1]) > 2) e.scrollTo({ top: r[1], behavior: 'instant' }); });
          if (s2.y && Math.abs(window.scrollY - s2.y) > 2) window.scrollTo({ top: s2.y, behavior: 'instant' });
        };
        requestAnimationFrame(function () { rola(); requestAnimationFrame(function () { rola(); revela(); setTimeout(rola, 300); setTimeout(rola, 900); }); });
      };
      /* espera o app montar a primeira tela com os dados do aparelho */
      var inicia = function () { setTimeout(aplica, 30); };
      if (document.readyState !== 'loading') inicia(); else document.addEventListener('DOMContentLoaded', inicia);
    }
  }
  return A;
})();

/* ===== Cópia automática dos dados que só existem no aparelho =====
   Mapas do Rico, lista de HTMLs do Plano (inclui os enviados), versões enviadas pelo menu, ordem e nomes do Estudo e as conexões
   do zigue-zague vão para o servidor da Cloudflare (só acrescenta e atualiza, nunca apaga), para entrar nos backups e voltar se o celular se perder. */
(function () {
  if (window.parent !== window) return;
  var COLB = 'aparelho_backup';
  var LIMITE = 900000, ESPERA = 10 * 60 * 1000;
  function hash(s) { var h = 5381, i = s.length; while (i) h = (h * 33) ^ s.charCodeAt(--i); return (h >>> 0).toString(36) + ':' + s.length; }
  function idDe(k) { return String(k).replace(/[^A-Za-z0-9_.-]/g, '_').slice(0, 140) || '_'; }
  function ler(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  /* login: o passe vem do nv-canal.js (Cloudflare); sem login o servidor recusa a cópia */
  var passos = window.__bk = [];
  function p(x) { passos.push(x); }
  function limite(pr, ms, nome) { return Promise.race([pr, new Promise(function (_, rj) { setTimeout(function () { rj(new Error(nome + ' demorou mais de ' + ms / 1000 + 's')); }, ms); })]); }
  var _tkp = null, _tkt = 0;
  function token() {
    if (_tkp && Date.now() - _tkt < 30 * 60 * 1000) return _tkp;
    _tkt = Date.now();
    _tkp = token0().then(function (t) { if (!t) _tkp = null; return t; });
    return _tkp;
  }
  async function canal() { if (!window.NvCanal) await limite(import('./nv-canal.js'), 8000, 'carregar canal'); return window.NvCanal; }
  async function token0() {
    try {
      var C = await canal(), t = await limite(C.passe(), 10000, 'pegar passe');
      p(t ? 'login ok' : 'sem login');
      return t || null;
    } catch (e) { p('erro: ' + e); return null; }
  }
  window.__tokenBk = token;
  function pares(o) { return Object.keys(o).map(function (c) { return [[c], o[c]]; }); }
  function poe(id, o) { return canal().then(function (C) { return limite(C.grava([{ col: COLB, id: id, troca: true, set: pares(o) }]), 20000, 'gravar'); }); }
  /* lê a coleção da cópia uma vez; devolve {id, x} só dos documentos "<pasta>/<nome>" da pasta pedida */
  var _todos = null;
  function todos() {
    if (_todos) return _todos;
    _todos = canal().then(function (C) { return limite(new Promise(function (ok) { var acc = [], feito = false; C.ouve(COLB, 0, function (docs, fim) { if (feito) return; acc = acc.concat(docs); if (fim) { feito = true; ok(acc); } }); }), 30000, 'ler a cópia'); });
    _todos.catch(function () { _todos = null; });
    return _todos;
  }
  /* aparelho vazio + login: traz a cópia do servidor (só preenche o que não existe, nunca apaga) */
  async function restaura() {
    try {
      if (!navigator.onLine || ler('backup.ap.rest')) return false;
      /* fase 0: só traz a cópia da nuvem depois de este aparelho ter guardado a cópia dele (preserva.js); senão o que ele tinha se perdia */
      if (!ler('pv.ok')) return false;
      /* aparelho novo = nunca enviou cópia (sem marca de envio). Os apps já gravaram valores de fábrica aqui, por isso não dá para olhar se está vazio */
      if (ler('backup.ap.sig') || ler('backup.ap.t')) { localStorage.setItem('backup.ap.rest', 'nao'); return false; }
      var tk = await token(); if (!tk) return false;
      var TODOS = await todos();
      async function lista(col) { return TODOS.filter(function (d) { return d.id.indexOf(col + '/') === 0; }).map(function (d) { return { id: d.id.slice(col.length + 1), x: d.x }; }); }
      function campo(d, c) { return d.x && d.x[c] != null ? d.x[c] : null; }
      var mudou = false, orig = Storage.prototype.setItem, dest = {};
      function idDoc(d) { return d.id; }
      var bk = await lista('aparelho_backup'), man = null;
      bk.forEach(function (d) { if (idDoc(d) === '_chaves') { try { man = JSON.parse(campo(d, 'v')); } catch (e) {} } });
      /* sem a lista de chaves (o aparelho antigo ainda não enviou a nova versão) não traz nada: traria também o que você já apagou */
      if (!man) return false;
      var ok = {}; man.forEach(function (c) { ok[c] = 1; });
      var rico = await lista('aparelho_rico');
      rico.forEach(function (d) { var kk = campo(d, 'k'), v = campo(d, 'v'); if (kk && v != null && kk.indexOf('rico.seed.') !== 0 && ok['aparelho_rico/' + idDoc(d)]) dest[kk] = v; });
      var pl = await lista('aparelho_plano'), itens = {}, ordem = null, seeds = null;
      pl.forEach(function (d) {
        var kk = campo(d, 'k'), v = campo(d, 'v'); if (!kk || v == null || !ok['aparelho_plano/' + idDoc(d)]) return;
        try {
          if (kk === 'doa_htmls_v1/_ordem') { var o = JSON.parse(v); ordem = o.ids || []; seeds = o.seeds; }
          else { var it = JSON.parse(v); if (it && it.id) itens[it.id] = it; }
        } catch (e) {}
      });
      if (Object.keys(itens).length) {
        var arr = [], usados = {};
        (ordem || []).forEach(function (id) { if (itens[id]) { arr.push(itens[id]); usados[id] = 1; } });
        Object.keys(itens).forEach(function (id) { if (!usados[id]) arr.push(itens[id]); });
        dest['doa_htmls_v1'] = JSON.stringify(arr);
        if (seeds != null) dest['doa_htmls_v1_seeds'] = seeds;
      }
      bk.forEach(function (d) { var kk = campo(d, 'k'), v = campo(d, 'v'); if (kk === 'estudos.meta.v1' && v != null && ok['aparelho_backup/' + idDoc(d)]) dest[kk] = v; });
      mudou = Object.keys(dest).length > 0;
      if (mudou) {
        /* até recarregar, o app não pode regravar os valores de fábrica por cima do que veio da cópia */
        Storage.prototype.setItem = function (k) { if (dest[k] !== undefined) return; return orig.apply(this, arguments); };
        Object.keys(dest).forEach(function (kk) { orig.call(localStorage, kk, dest[kk]); });
      }
      localStorage.setItem('backup.ap.rest', mudou ? 'sim' : 'vazio');
      if (mudou) { location.reload(); return true; }
    } catch (e) {}
    return false;
  }
  function sigLer() { try { return JSON.parse(localStorage.getItem('backup.ap.sig') || '{}') || {}; } catch (e) { return {}; } }

  async function coleta() {
    var docs = [], avisos = [], i, k, v;
    try {
      for (i = 0; i < localStorage.length; i++) {
        k = localStorage.key(i);
        if (k && k.indexOf('rico.') === 0 && k.indexOf('rico.seed.') !== 0) docs.push(['aparelho_rico', idDe(k), k, ler(k)]);
      }
    } catch (e) {}
    var lista = ler('doa_htmls_v1');
    if (lista) {
      try {
        var itens = JSON.parse(lista) || [];
        itens.forEach(function (it) { if (it && it.id) docs.push(['aparelho_plano', 'h_' + idDe(it.id), 'doa_htmls_v1/' + it.id, JSON.stringify(it)]); });
        docs.push(['aparelho_plano', '_ordem', 'doa_htmls_v1/_ordem', JSON.stringify({ ids: itens.map(function (x) { return x && x.id; }), seeds: ler('doa_htmls_v1_seeds') })]);
      } catch (e) {}
    }
    ['estudos.meta.v1', 'alterna.v1'].forEach(function (c) { v = ler(c); if (v) docs.push(['aparelho_backup', idDe(c), c, v]); });
    try {
      if (window.caches) {
        var cx = await caches.open('apps-enviados'), reqs = await cx.keys();
        for (i = 0; i < reqs.length; i++) {
          var resp = await cx.match(reqs[i]), txt = await resp.text();
          docs.push(['aparelho_menu', idDe(new URL(reqs[i].url).pathname.split('/').pop()), 'apps-enviados/' + reqs[i].url, txt]);
        }
      }
    } catch (e) {}
    return { docs: docs, avisos: avisos };
  }

  async function diario(tk, o) {
    try { o.t = Date.now(); o.p = location.pathname.split('/').pop(); await poe(COLB + '/_log', { k: '_log', v: JSON.stringify(o), t: Date.now() }); } catch (e) {}
  }
  var rodando = false;
  async function envia(forca) {
    if (!navigator.onLine) return 'sem internet';
    if (rodando) return 'já está enviando';
    rodando = true;
    try {
      var t = +ler('backup.ap.t') || 0;
      if (Date.now() - t < ESPERA) return 'enviou há menos de 10 minutos';
      var tk = await token();
      if (!tk) return 'sem login de usuário (entre pelo menu com e-mail e senha)';
      /* aparelho novo só envia depois de restaurar: senão os valores de fábrica dele cobriam a cópia boa */
      if (!forca && !ler('backup.ap.sig') && !ler('backup.ap.t') && ler('backup.ap.rest') !== 'sim') { await diario(tk, { r: 'novo-sem-restaurar' }); return 'aparelho novo: ainda não restaurou'; }
      var col = await coleta(), sig = sigLer(), mudou = false, falhas = 0, grandes = [], enviados = 0;
      for (var i = 0; i < col.docs.length; i++) {
        var d = col.docs[i], caminho = d[0] + '/' + d[1], v = d[3];
        if (v == null) continue;
        if (v.length > LIMITE) { grandes.push(d[2]); continue; }
        var h = hash(v);
        if (sig[caminho] === h) continue;
        try {
          var r = await poe(caminho, { k: d[2], v: v, t: Date.now() });
          if (r != null) { sig[caminho] = h; mudou = true; enviados++; } else falhas++;
        } catch (e) { falhas++; }
      }
      var hg = grandes.length ? hash(JSON.stringify(grandes)) : null;
      if (grandes.length && sig._grandes !== hg) {
        sig._grandes = hg; mudou = true;
        try { await poe(COLB + '/_grandes', { k: '_grandes', v: JSON.stringify(grandes), t: Date.now() }); } catch (e) {}
      }
      /* lista do que existe agora no aparelho: a restauração só traz o que está nela (o que você apagou não volta) */
      var lc = JSON.stringify(col.docs.map(function (d) { return d[0] + '/' + d[1]; })), hc = hash(lc);
      if (col.docs.length && sig._chaves !== hc) {
        try {
          var rc = await poe(COLB + '/_chaves', { k: '_chaves', v: lc, t: Date.now() });
          if (rc != null) { sig._chaves = hc; mudou = true; } else falhas++;
        } catch (e) { falhas++; }
      }
      if (mudou) localStorage.setItem('backup.ap.sig', JSON.stringify(sig));
      if (!falhas) localStorage.setItem('backup.ap.t', String(Date.now()));
      await diario(tk, { r: 'ok', docs: col.docs.length, env: enviados, falhas: falhas, grandes: grandes.length });
      return 'ok: ' + col.docs.length + ' itens no aparelho, ' + enviados + ' enviados agora, ' + falhas + ' falhas, ' + grandes.length + ' grandes demais';
    } catch (e) { return 'erro: ' + e; } finally { rodando = false; }
  }
  /* uma vez por abertura, com a tela livre, e só se faz mais de 10 minutos desde a última */
  function agenda() { var f = function () { envia(); }; if (window.requestIdleCallback) requestIdleCallback(f, { timeout: 3000 }); else setTimeout(f, 2500); }
  if (document.readyState === 'complete') setTimeout(agenda, 1500); else window.addEventListener('load', function () { setTimeout(agenda, 1500); });
  /* saiu do app (troca rápida entre apps): tenta enviar na hora, o app nem sempre fica aberto 8 segundos */
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') envia(); });
  /* aparelho vazio: traz a cópia logo no começo (antes da cópia de ida) */
  setTimeout(function () { restaura(); }, 600);
  window.AparelhoBackup = { envia: function (forca) { try { localStorage.removeItem('backup.ap.t'); } catch (e) {} return envia(forca); } };
})();

/* Rico ao vivo em qualquer app aberto: os dados do Rico chegam da nuvem mesmo fora dele, e ao entrar no Rico já estão em dia (aqui só recebe; quem envia é o Rico) */
(function () {
  try {
    if (window.top !== window || /RICO\.html$/i.test(location.pathname) || /(entrar|copia|reparar|atualiza)\.html$/i.test(location.pathname)) return;
    window.NV_SORECEBE = true;
    import('./nuvem-rico.js?v=' + Date.now()).catch(function () {});
    if (!/LER\.html$/i.test(location.pathname)) import('./nuvem-rico.js?col=estudo&so=1&k=estudos.meta.v1&v=' + Date.now()).catch(function () {});
    if (!/DOA\.html$/i.test(location.pathname)) import('./nuvem-rico.js?col=plano&so=1&k=doa_htmls_v1,doa_htmls_v1_seeds,ph:*&v=' + Date.now()).catch(function () {});
  } catch (e) {}
})();

/* Ao vivo sem piscar: AoVivo.pinta(nome, desenhar) redesenha o que chegou da nuvem na mesma rolagem;
   se você está digitando num campo, espera sair dele (o desenho não apaga o que está sendo escrito) */
window.AoVivo = window.AoVivo || (function () {
  /* espera só enquanto a pessoa digita de verdade (campo visível e tecla há menos de 3 s);
     campo esquecido com foco (janela fechada) não segura mais as atualizações. Depois do desenho, o campo
     em edição volta com o mesmo texto, o foco e o cursor no lugar */
  var fila = {}, presa = null, ultTecla = 0, espera = null;
  document.addEventListener('input', function () { ultTecla = Date.now(); }, true);
  function visivel(a) { return !!(a.offsetParent || (a.getClientRects && a.getClientRects().length)); }
  function digitando() { var a = document.activeElement; return a && a !== document.body && (/^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) || a.isContentEditable) && visivel(a) ? a : null; }
  function roda() {
    var ks = Object.keys(fila); if (!ks.length) return;
    var a = digitando();
    if (a && Date.now() - ultTecla < 3000) {
      if (presa !== a) { presa = a; a.addEventListener('blur', function () { presa = null; setTimeout(roda, 0); }, { once: true }); }
      clearTimeout(espera); espera = setTimeout(roda, 3100 - (Date.now() - ultTecla));
      return;
    }
    var fs = ks.map(function (k) { return fila[k]; }); fila = {};
    var y = window.scrollY, foco = a && a.id ? { id: a.id, v: a.value, i: a.selectionStart, f: a.selectionEnd } : null;
    var rol = []; document.querySelectorAll('[id]').forEach(function (e) { if (e.scrollTop > 0 && e !== document.documentElement) rol.push([e.id, e.scrollTop]); });
    fs.forEach(function (f) { try { f(); } catch (e) {} });
    if (Math.abs(window.scrollY - y) > 1) window.scrollTo({ top: y, behavior: 'instant' });
    rol.forEach(function (r) { var e = document.getElementById(r[0]); if (e && Math.abs(e.scrollTop - r[1]) > 1) e.scrollTop = r[1]; });
    if (foco) { var n = document.getElementById(foco.id); if (n && n !== document.activeElement) { try { if (n.value !== foco.v) n.value = foco.v; n.focus({ preventScroll: true }); n.setSelectionRange && n.setSelectionRange(foco.i, foco.f); } catch (e) {} } }
  }
  return { pinta: function (nome, f) { fila[nome] = f; roda(); } };
})();
