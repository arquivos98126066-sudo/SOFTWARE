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
    if (saindo) { var u = saindo; saindo = null; e.stopImmediatePropagation(); setTimeout(function () { location.replace(u); }, 30); return; }
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
    /* faixa transparente por cima de tudo, na base da tela: o toque nao passa para o que esta embaixo */
    var faixa = function () {
      if (document.getElementById('alterna-base')) return;
      var d = document.createElement('div'); d.id = 'alterna-base';
      d.style.cssText = 'position:fixed;left:0;right:0;bottom:0;height:calc(44px + env(safe-area-inset-bottom,0px));z-index:2147483647;background:transparent;touch-action:none;-webkit-tap-highlight-color:transparent;';
      var tocou = false;
      d.addEventListener('touchstart', function (e) { e.stopPropagation(); tocou = true; }, { passive: true });
      d.addEventListener('touchend', function (e) { e.stopPropagation(); if (e.cancelable) e.preventDefault(); if (tocou) { tocou = false; A.botao(); } });
      d.addEventListener('touchcancel', function () { tocou = false; }, { passive: true });
      d.addEventListener('click', function (e) { e.stopPropagation(); e.preventDefault(); if (!('ontouchstart' in window)) A.botao(); });
      d.addEventListener('mousedown', function (e) { e.stopPropagation(); });
      document.documentElement.appendChild(d);
    };
    if (document.documentElement) faixa(); else document.addEventListener('DOMContentLoaded', faixa);
  }

  /* Tapete, Meu CRM e ADM: nao mostra a pagina enquanto os dados do aparelho ainda estao entrando (senao os nomes aparecem carregando) */
  if (eu === 'tapete' || eu === 'crm' || eu === 'adm') {
    try {
      var est = document.createElement('style'); est.id = 'alterna-quieto'; est.textContent = 'html{visibility:hidden}';
      (document.head || document.documentElement).appendChild(est);
      var solta = function () { clearTimeout(tq); clearTimeout(tmax); if (mo) mo.disconnect(); var x = document.getElementById('alterna-quieto'); if (x) x.remove(); };
      var tq, tmax = setTimeout(solta, 1200), mo = null, carregou = false;
      var espera = function () { clearTimeout(tq); if (carregou) tq = setTimeout(solta, 160); };
      mo = new MutationObserver(espera); mo.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
      window.addEventListener('load', function () { carregou = true; espera(); });
      if (document.readyState === 'complete') { carregou = true; espera(); }
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
      var inicia = function () { setTimeout(aplica, 350); };
      if (document.readyState === 'complete') inicia(); else window.addEventListener('load', inicia);
    }
  }
  return A;
})();

/* ===== Cópia automática dos dados que só existem no aparelho =====
   Mapas do Rico, lista de HTMLs do Plano (inclui os enviados), versões enviadas pelo menu, ordem e nomes do Estudo e as conexões
   do zigue-zague vão para o Firestore (só acrescenta e atualiza, nunca apaga), para entrar nos backups e voltar se o celular se perder. */
(function () {
  if (window.parent !== window) return;
  var PROJ = 'https://firestore.googleapis.com/v1/projects/meus-apps-8ca76/databases/(default)/documents/';
  var CHAVE = 'AIzaSyDPJvM-XZWfa8HQ7h8v0Usb1Hf3q8sDqpg';
  var LIMITE = 900000, ESPERA = 10 * 60 * 1000;
  function hash(s) { var h = 5381, i = s.length; while (i) h = (h * 33) ^ s.charCodeAt(--i); return (h >>> 0).toString(36) + ':' + s.length; }
  function idDe(k) { return String(k).replace(/[^A-Za-z0-9_.-]/g, '_').slice(0, 140) || '_'; }
  function ler(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
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

  async function envia() {
    if (!navigator.onLine) return;
    try {
      var t = +ler('backup.ap.t') || 0;
      if (Date.now() - t < ESPERA) return;
      var col = await coleta(), sig = sigLer(), mudou = false, falhas = 0, grandes = [];
      for (var i = 0; i < col.docs.length; i++) {
        var d = col.docs[i], caminho = d[0] + '/' + d[1], v = d[3];
        if (v == null) continue;
        if (v.length > LIMITE) { grandes.push(d[2]); continue; }
        var h = hash(v);
        if (sig[caminho] === h) continue;
        var corpo = { fields: { k: { stringValue: d[2] }, v: { stringValue: v }, t: { integerValue: String(Date.now()) } } };
        try {
          var r = await fetch(PROJ + d[0] + '/' + encodeURIComponent(d[1]) + '?key=' + CHAVE, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) });
          if (r.ok) { sig[caminho] = h; mudou = true; } else falhas++;
        } catch (e) { falhas++; }
      }
      var hg = grandes.length ? hash(JSON.stringify(grandes)) : null;
      if (grandes.length && sig._grandes !== hg) {
        sig._grandes = hg; mudou = true;
        try { await fetch(PROJ + 'aparelho_backup/_grandes?key=' + CHAVE, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fields: { v: { stringValue: JSON.stringify(grandes) }, t: { integerValue: String(Date.now()) } } }) }); } catch (e) {}
      }
      if (mudou) localStorage.setItem('backup.ap.sig', JSON.stringify(sig));
      if (!falhas) localStorage.setItem('backup.ap.t', String(Date.now()));
    } catch (e) {}
  }
  /* uma vez por abertura, com a tela livre, e só se faz mais de 10 minutos desde a última */
  function agenda() { var f = function () { envia(); }; if (window.requestIdleCallback) requestIdleCallback(f, { timeout: 15000 }); else setTimeout(f, 8000); }
  if (document.readyState === 'complete') setTimeout(agenda, 8000); else window.addEventListener('load', function () { setTimeout(agenda, 8000); });
  window.AparelhoBackup = { envia: function () { try { localStorage.removeItem('backup.ap.t'); } catch (e) {} return envia(); } };
})();
