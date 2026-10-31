/* Antigo firebase-sync: agora só confere o login (Cloudflare) e entrega o banco do servidor (nv-fs.js). */
export { db } from "./nv-fs.js";
export const authReady = new Promise(resolve => {
  var ok = false; try { ok = !!localStorage.getItem('nv.rt2'); } catch (e) {}
  if (ok) resolve(null); else location.replace('index.html');
});
/* quem importa este arquivo sem usar o nome acima ainda é mandado ao menu se não entrou */
authReady.catch(function () {});
