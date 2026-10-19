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
