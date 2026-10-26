/* Rico ao vivo na nuvem: os mapas e as listas (chaves rico.* do aparelho) passam a morar no Firestore (coleção rico_vivo).
   Quem muda grava na nuvem; os outros aparelhos recebem na hora. O aparelho continua guardando uma cópia para abrir rápido. */
import { db, authReady } from "https://arquivos98126066-sudo.github.io/SOFTWARE/firebase-sync.js";
import { collection, doc, setDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

var COL = 'rico_vivo', LIMITE = 900000, TK = 'nv.t.v1', PEND = 'nv.pend.v1';
var orig = { set: Storage.prototype.setItem, rem: Storage.prototype.removeItem };
var pronto = false, aplicando = false, timer = null, ultimoToque = Date.now(), recarregar = false;
var nuvem = {};

function sincroniza(k) { return typeof k === 'string' && k.indexOf('rico.') === 0 && k.indexOf('rico.seed.') !== 0 && !/\.foto$/.test(k) && k.indexOf('rico.y.') !== 0 && k.indexOf('rico.rd.') !== 0 && k.indexOf('rico.fixarTela') !== 0; }
function ler(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
function mapa(k) { try { return JSON.parse(ler(k) || '{}') || {}; } catch (e) { return {}; } }
function grava(k, o) { try { orig.set.call(localStorage, k, JSON.stringify(o)); } catch (e) {} }
function idDe(k) { return String(k).replace(/[^A-Za-z0-9_.-]/g, '_').slice(0, 140) || '_'; }
function marca(k, apagado) { var t = mapa(TK), p = mapa(PEND); t[k] = Date.now(); p[k] = apagado ? 2 : 1; grava(TK, t); grava(PEND, p); }

Storage.prototype.setItem = function (k, v) {
  var r = orig.set.apply(this, arguments);
  if (this === localStorage && pronto && !aplicando && sincroniza(k)) { marca(k, false); agenda(); }
  return r;
};
Storage.prototype.removeItem = function (k) {
  var r = orig.rem.apply(this, arguments);
  if (this === localStorage && pronto && !aplicando && sincroniza(k)) { marca(k, true); agenda(); }
  return r;
};

function agenda() { clearTimeout(timer); timer = setTimeout(envia, 1200); }
async function envia() {
  var p = mapa(PEND), t = mapa(TK), ks = Object.keys(p), falhou = false;
  for (var i = 0; i < ks.length; i++) {
    var k = ks[i], apagado = p[k] === 2, v = apagado ? '' : ler(k);
    if (!apagado && v == null) apagado = true;
    if (!apagado && v.length > LIMITE) { delete p[k]; continue; }
    try {
      await setDoc(doc(db, COL, idDe(k)), { k: k, v: v, ap: apagado, t: t[k] || Date.now() });
      nuvem[k] = { v: v, ap: apagado, t: t[k] || 0 };
      delete p[k];
    } catch (e) { falhou = true; }
  }
  grava(PEND, p);
  if (falhou) setTimeout(agenda, 15000);
}
['touchstart', 'keydown', 'pointerdown'].forEach(function (e) { addEventListener(e, function () { ultimoToque = Date.now(); }, { capture: true, passive: true }); });
document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') { clearTimeout(timer); envia(); } });
addEventListener('online', agenda);

function aplica(d) {
  var k = d.k, local = ler(k), t = mapa(TK), p = mapa(PEND);
  if (!sincroniza(k)) return false;
  var rv = d.ap ? null : d.v;
  if (rv === local) { if (t[k] !== d.t) { t[k] = d.t; grava(TK, t); } return false; }
  /* mudança local ainda não enviada e mais nova: ela vale e sobe */
  if (p[k] && (t[k] || 0) > d.t) return false;
  /* aparelho antigo, sem marca de tempo da chave: o que já está nele vale e sobe (o aparelho novo recebe a nuvem) */
  if (!t[k] && local != null && ler('backup.ap.sig')) { marca(k, false); agenda(); return false; }
  aplicando = true;
  try { if (d.ap) orig.rem.call(localStorage, k); else orig.set.call(localStorage, k, d.v); } catch (e) { aplicando = false; return false; }
  aplicando = false;
  t[k] = d.t; grava(TK, t);
  return true;
}
function recarrega() {
  if (Date.now() - ultimoToque > 2500 && !document.querySelector('textarea:focus,input:focus,[contenteditable="true"]:focus')) location.reload();
  else setTimeout(recarrega, 1500);
}

function diag(est) {
  try {
    var id = ler('nv.dev') || ('d' + Math.random().toString(36).slice(2, 8)); orig.set.call(localStorage, 'nv.dev', id);
    setDoc(doc(db, COL, '_dev_' + id), { est: est, t: Date.now(), ua: navigator.userAgent.slice(0, 80), pend: Object.keys(mapa(PEND)).length }).catch(function () {});
  } catch (e) {}
}
diag('carregou');
authReady.then(function () {
  diag('login ok');
  var primeira = true;
  onSnapshot(collection(db, COL), function (s) {
    var mudou = false;
    s.docChanges().forEach(function (c) {
      if (c.type === 'removed') return;
      var d = c.doc.data(); if (!d || !d.k) return;
      nuvem[d.k] = { v: d.v, ap: d.ap, t: d.t };
      if (aplica(d)) mudou = true;
    });
    if (primeira) {
      primeira = false;
      /* chaves do aparelho que a nuvem ainda não tem: só sobem se este é um aparelho antigo (já enviava cópia) */
      if (ler('backup.ap.sig')) {
        var t = mapa(TK), alvo = false;
        for (var i = 0; i < localStorage.length; i++) { var k = localStorage.key(i); if (sincroniza(k) && !nuvem[k]) { t[k] = t[k] || Date.now(); var p = mapa(PEND); p[k] = 1; grava(PEND, p); alvo = true; } }
        grava(TK, t); if (alvo) agenda();
      }
      pronto = true; agenda(); diag('ouvindo nuvem');
    }
    if (mudou && !recarregar) { recarregar = true; recarrega(); }
  }, function () { pronto = true; });
});
setTimeout(function () { pronto = true; }, 6000);
