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
