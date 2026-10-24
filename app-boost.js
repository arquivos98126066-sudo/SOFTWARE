/* Regras de velocidade e firmeza para todos os apps: sem zoom, sem tela deslocada para o lado */
(function () {
  var st = document.createElement('style');
  st.textContent = 'html{touch-action:pan-x pan-y;overscroll-behavior-x:none}';
  (document.head || document.documentElement).appendChild(st);
  document.addEventListener('touchstart', function (e) { if (e.touches && e.touches.length > 1) e.preventDefault(); }, { passive: false });
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
