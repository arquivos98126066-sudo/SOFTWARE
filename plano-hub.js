/* Hub do Plano: faz os HTMLs e os apps conversarem entre si.
 *
 * Mensagem (envelope): { id, de, para, tipo, dados, em }
 *   de    nome de quem enviou (ex.: 'h-leads', 'rico', 'crm')
 *   para  nome de quem recebe, ou '*' para todos
 *   tipo  texto livre que combina entre os dois lados (ex.: 'bom-dia')
 *   dados qualquer coisa que caiba em JSON
 *
 * Uso dentro de um HTML aberto pelo Plano (carregar com <script src="../plano-hub.js">):
 *   Hub.ouvir('bom-dia', function(m){ Hub.enviar(m.de, 'boa-noite', {}); });
 *   Hub.enviar('h-cidades', 'bom-dia', {});
 *
 * Uso em um app (Rico, CRM...), na mesma origem do Plano:
 *   Hub.entrar('rico');  Hub.enviar('h-leads', 'novo-lead', {...});  Hub.ouvir(...)
 *
 * Quem está fechado não perde nada: a mensagem espera numa fila e chega quando ele abrir.
 */
(function(){
  if (window.Hub) return;
  var CANAL = 'plano-hub', FILA = 'plano_hub_fila', LOG = 'plano_hub_log';
  var dentro = window.parent && window.parent !== window;
  var ouvintes = {}, eu = null, bc = null;

  function lerJson(k){ try { var a = JSON.parse(localStorage.getItem(k)); return Array.isArray(a) ? a : []; } catch(e){ return []; } }
  function gravaJson(k, a){ try { localStorage.setItem(k, JSON.stringify(a)); } catch(e){} }
  function envelope(de, para, tipo, dados){ return { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), de: de, para: para, tipo: tipo, dados: dados === undefined ? null : dados, em: Date.now() }; }
  function entrega(m){
    (ouvintes[m.tipo] || []).concat(ouvintes['*'] || []).forEach(function(fn){ try { fn(m); } catch(e){} });
  }

  var Hub = {
    nome: function(){ return eu; },
    ouvir: function(tipo, fn){ (ouvintes[tipo] = ouvintes[tipo] || []).push(fn); },
    enviar: function(para, tipo, dados){
      var m = envelope(eu, para, tipo, dados);
      if (dentro) window.parent.postMessage({ planoHub: 1, msg: m }, '*');
      else Hub.rotear(m);
      return m;
    },
    /* só o lado de fora (Plano e apps): guarda na fila de quem não está presente, avisa os apps */
    rotear: function(m){
      var log = lerJson(LOG); log.push(m); gravaJson(LOG, log.slice(-50));
      if (Hub.entregaLocal && Hub.entregaLocal(m)) return;
      var f = lerJson(FILA); f.push(m); gravaJson(FILA, f);
      if (bc) try { bc.postMessage(m); } catch(e){}
    },
    /* tira da fila o que é para este nome (ou para todos) */
    retira: function(nome){
      var f = lerJson(FILA), meus = [], resto = [];
      f.forEach(function(m){ (m.para === nome || m.para === '*') && m.de !== nome ? meus.push(m) : resto.push(m); });
      gravaJson(FILA, resto); return meus;
    },
    entrar: function(nome){
      eu = nome;
      if (dentro) return;
      if (window.BroadcastChannel) {
        bc = new BroadcastChannel(CANAL);
        bc.onmessage = function(e){ var m = e.data; if (m && (m.para === eu || m.para === '*') && m.de !== eu) { Hub.retira(eu); entrega(m); } };
      }
      Hub.retira(eu).forEach(entrega);
    },
    _fora: function(m){ entrega(m); },
    _bc: function(){ return bc; }
  };

  if (dentro) {
    window.addEventListener('message', function(e){
      if (e.source !== window.parent || !e.data || !e.data.planoHub) return;
      if (e.data.nome) eu = e.data.nome;
      if (e.data.msg) entrega(e.data.msg);
    });
    /* avisa o Plano que está pronto para receber o que ficou na fila */
    function pronto(){ window.parent.postMessage({ planoHub: 1, pronto: 1 }, '*'); }
    if (document.readyState === 'complete') pronto(); else window.addEventListener('load', pronto);
  }
  window.Hub = Hub;
})();
