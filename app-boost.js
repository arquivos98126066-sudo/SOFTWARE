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
      if (e.touches.length !== 1 || /^(INPUT|TEXTAREA|SELECT)$/.test((e.target.tagName || ''))) { pts = null; return; }
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
  var CODIGO = { plano: 'DOA', estudo: 'LER', rico: 'RICO', ricop: 'RICOP' };
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
  }
  return A;
})();
