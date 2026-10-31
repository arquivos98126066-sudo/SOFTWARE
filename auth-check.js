/* Confere o login (Cloudflare): sem a chave de renovação neste aparelho, volta para o menu.
   Quem decide de verdade o que cada pessoa vê é o servidor. */
try { if (!localStorage.getItem('nv.rt2')) window.location.href = 'index.html'; } catch (e) { window.location.href = 'index.html'; }
