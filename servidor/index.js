/* Servidor único dos apps (Cloudflare Worker + Durable Object).
   Uma "Conta" guarda todos os documentos: (coleção, id) -> JSON. Cada gravação ganha um número de ordem (seq)
   dado só aqui; todos os aparelhos recebem as mudanças na mesma ordem, então ficam iguais.
   Canal: WebSocket em /ws. Mensagens:
     {t:'sub', col, desde}                 -> {t:'docs', col, docs:[{id,x}], fim:true, seq}
     {t:'grava', q, ops:[{col,id,troca,set:[[caminho,valor]],apaga:[caminho]}]}  -> {t:'ok', q, seq} e {t:'docs'} para quem ouve
     {t:'pega', q, col, id}                -> {t:'doc', q, x}
     {t:'eu'}                              -> {t:'eu', email, admin, areas, chave}
     {t:'usuarios'} / {t:'usuario', email, areas, ativo}   (só o dono)
   Acesso: login do Firebase (o mesmo e-mail e senha do menu). O servidor confere a assinatura do Google e libera
   só as áreas daquela pessoa. O dono vê tudo. Enquanto ACEITA_CHAVE não for "0", quem vem sem login ainda entra
   (fase de troca dos celulares).
   Administração (cópia e exportação) só com a senha guardada no servidor. */
import { DurableObject } from 'cloudflare:workers';

const CHAVE_APP = 'nv1-meus-apps';
const PROJETO = 'meus-apps-8ca76', DONO_UID = 'UhH3Luc0AYW9URS6OahnSqWTTgw2';
/* cada coleção pertence a uma área; a pessoa só vê as áreas liberadas para ela */
const AREAS = {
  rico: ['rico_vivo', 'born_rich'], plano: ['plano', 'v2_plano_procs'], estudo: ['estudo'],
  crm: ['crm', /^v2_crm_/], tapete: ['tapete', /^v2_tap_/], adm: [/^v2_adm_/],
  prevenda: ['pre_venda', 'prevenda_lixeira'], retina: ['painel_ia'], opa: ['metodo_opa'], workshop: [/^launcher_/]
};
function areaDe(col) {
  if (col === 'diag' || col === 'v2_conflitos') return 'sistema';
  for (const a of Object.keys(AREAS)) if (AREAS[a].some(x => typeof x === 'string' ? x === col : x.test(col))) return a;
  return 'outros';
}
/* sistema: todos gravam (diagnóstico e conflitos), só o dono lê */
function pode(u, col, grava) {
  if (u.admin) return true;
  const a = areaDe(col);
  if (a === 'sistema') return !!grava;
  return u.areas.indexOf(a) >= 0;
}

/* confere o login do Firebase: assinatura do Google, projeto e validade */
let chaves = null, chavesAte = 0;
function b64url(s) { s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; return Uint8Array.from(atob(s), c => c.charCodeAt(0)); }
async function confereToken(t, env) {
  if (!t) return null;
  if (env.TESTE === '1' && t.indexOf('teste:') === 0) { const [, uid, email] = t.split(':'); return { uid, email }; }
  try {
    const [h, c, a] = t.split('.');
    const cab = JSON.parse(new TextDecoder().decode(b64url(h))), dado = JSON.parse(new TextDecoder().decode(b64url(c)));
    const agora = Date.now() / 1000;
    if (cab.alg !== 'RS256' || dado.aud !== PROJETO || dado.iss !== 'https://securetoken.google.com/' + PROJETO || !(dado.exp > agora) || !(dado.iat < agora + 300) || !dado.sub) return null;
    if (!chaves || Date.now() > chavesAte) {
      const r = await fetch('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com');
      chaves = (await r.json()).keys || []; chavesAte = Date.now() + 3600000;
    }
    const jwk = chaves.find(k => k.kid === cab.kid); if (!jwk) return null;
    const k = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
    const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', k, b64url(a), new TextEncoder().encode(h + '.' + c));
    return ok ? { uid: dado.sub, email: String(dado.email || '').toLowerCase() } : null;
  } catch (e) { return null; }
}
async function quem(req, u, env) {
  const p = await confereToken(u.searchParams.get('t'), env);
  if (p) return p;
  if (u.searchParams.get('k') === CHAVE_APP && env.ACEITA_CHAVE !== '0') return { chave: true };
  return null;
}
function comQuem(req, p) {
  const h = new Headers(req.headers);
  h.set('x-nv-quem', JSON.stringify(p));
  return new Request(req, { headers: h });
}
/* Firebase antigo: só para a cópia inicial e para o retrato de conferência */
const FB = 'https://firestore.googleapis.com/v1/projects/meus-apps-8ca76/databases/(default)/documents', FB_CH = 'AIzaSyDPJvM-XZWfa8HQ7h8v0Usb1Hf3q8sDqpg';
const FB_COLS = ['rico_vivo', 'plano', 'estudo', 'crm', 'tapete', 'born_rich', 'v2_conflitos', 'v2_adm_config', 'v2_adm_lanc', 'v2_crm_agenda', 'v2_crm_arquivo', 'v2_crm_ativos', 'v2_crm_contatos', 'v2_crm_reunioes', 'v2_plano_procs', 'v2_tap_cadastro', 'v2_tap_clientes', 'v2_tap_config', 'v2_tap_pedidos', 'v2_tap_ruas'];
/* páginas que usavam o Firestore direto (Pré-venda, Retina, Método OPA, Workshop) */
const FB_COLS2 = ['pre_venda', 'prevenda_lixeira', 'painel_ia', 'metodo_opa', 'launcher_apps', 'launcher_ck', 'launcher_fm', 'launcher_fm_prefs', 'launcher_trash', 'launcher_ad'];
function fbVal(f) {
  if (!f) return null;
  if ('stringValue' in f) return f.stringValue;
  if ('integerValue' in f) return +f.integerValue;
  if ('doubleValue' in f) return f.doubleValue;
  if ('booleanValue' in f) return f.booleanValue;
  if ('timestampValue' in f) return f.timestampValue;
  if ('mapValue' in f) { const o = {}; for (const k of Object.keys(f.mapValue.fields || {})) o[k] = fbVal(f.mapValue.fields[k]); return o; }
  if ('arrayValue' in f) return (f.arrayValue.values || []).map(fbVal);
  return null;
}

export default {
  async fetch(req, env) {
    const u = new URL(req.url);
    if (req.method === 'OPTIONS') return cors(new Response(null, { status: 204 }));
    const conta = env.CONTA.get(env.CONTA.idFromName('principal'));
    if (u.pathname === '/' || u.pathname === '') return env.ASSETS.fetch(new Request(new URL('/index.html', u), req));
    if (u.pathname === '/ws') {
      if (req.headers.get('Upgrade') !== 'websocket') return new Response('so websocket', { status: 426 });
      const p = await quem(req, u, env);
      if (!p) return new Response('sem acesso', { status: 403 });
      return conta.fetch(comQuem(req, p));
    }
    if (u.pathname.startsWith('/admin/')) {
      if (!env.ADMIN || req.headers.get('x-admin') !== env.ADMIN) return new Response('nao', { status: 403 });
      return conta.fetch(req);
    }
    /* fotos dos apps: guardadas no R2 (pasta imagens/apps); ver é livre (o nome é um código longo), enviar precisa de acesso */
    if (u.pathname.startsWith('/midia/')) {
      const k = u.pathname.slice(7);
      if (!/^[a-z0-9]{8,40}\.[a-z0-9]{1,5}$/.test(k)) return cors(new Response('nome inválido', { status: 400 }));
      if (req.method === 'POST') {
        if (!(await quem(req, u, env))) return cors(new Response('sem acesso', { status: 403 }));
        if (!(await env.MIDIA.head('imagens/apps/' + k))) await env.MIDIA.put('imagens/apps/' + k, req.body, { httpMetadata: { contentType: req.headers.get('Content-Type') || 'application/octet-stream', cacheControl: 'public, max-age=31536000, immutable' } });
        return cors(new Response('ok'));
      }
      const o = await env.MIDIA.get('imagens/apps/' + k);
      if (!o) return cors(new Response('não achei', { status: 404 }));
      const h = new Headers(); o.writeHttpMetadata(h); h.set('Cache-Control', 'public, max-age=31536000, immutable'); h.set('Access-Control-Allow-Origin', '*');
      return new Response(o.body, { headers: h });
    }
    /* mudança de endereço: o antigo envia (com login), o novo busca só com o código secreto */
    if (u.pathname === '/mudanca') {
      if (req.method === 'POST' && !(await quem(req, u, env))) return cors(new Response('sem acesso', { status: 403 }));
      return cors(await conta.fetch(req));
    }
    if (u.pathname === '/le') {
      const p = await quem(req, u, env);
      if (!p) return cors(new Response('sem acesso', { status: 403 }));
      return cors(await conta.fetch(comQuem(req, p)));
    }
    return new Response('não encontrado', { status: 404 });
  },
  /* tarefa agendada: cópia inicial do Firebase (uma vez) e um retrato do estado no Firebase, para conferência */
  async scheduled(ev, env, ctx) {
    const conta = env.CONTA.get(env.CONTA.idFromName('principal'));
    ctx.waitUntil(conta.fetch('https://interno/interno/cron'));
  }
};
function cors(r) { const h = new Headers(r.headers); h.set('Access-Control-Allow-Origin', '*'); h.set('Access-Control-Allow-Headers', '*'); return new Response(r.body, { status: r.status, headers: h }); }
function json(o, s) { return new Response(JSON.stringify(o), { status: s || 200, headers: { 'Content-Type': 'application/json' } }); }

export class Conta extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec('CREATE TABLE IF NOT EXISTS docs (col TEXT NOT NULL, id TEXT NOT NULL, x TEXT NOT NULL, seq INTEGER NOT NULL, PRIMARY KEY (col, id))');
    this.sql.exec('CREATE INDEX IF NOT EXISTS docs_seq ON docs (col, seq)');
    this.sql.exec('CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v INTEGER NOT NULL)');
    this.sql.exec('CREATE TABLE IF NOT EXISTS usuarios (email TEXT PRIMARY KEY, areas TEXT NOT NULL, ativo INTEGER NOT NULL, t INTEGER NOT NULL)');
    this.sql.exec('CREATE TABLE IF NOT EXISTS mudancas (c TEXT NOT NULL, i INTEGER NOT NULL, n INTEGER NOT NULL, dado TEXT NOT NULL, t INTEGER NOT NULL, PRIMARY KEY (c, i))');
    this.sql.exec('CREATE TABLE IF NOT EXISTS entradas (quem TEXT PRIMARY KEY, chave INTEGER NOT NULL, ua TEXT, t INTEGER NOT NULL)');
    const r = this.sql.exec("SELECT v FROM meta WHERE k = 'seq'").toArray();
    this.seq = r.length ? r[0].v : 0;
  }

  async fetch(req) {
    const u = new URL(req.url);
    if (u.pathname === '/ws') {
      const par = new WebSocketPair();
      this.ctx.acceptWebSocket(par[1]);
      const p = this.perfil(JSON.parse(req.headers.get('x-nv-quem') || '{}'));
      this.sql.exec('INSERT OR REPLACE INTO entradas (quem, chave, ua, t) VALUES (?, ?, ?, ?)', p.chave ? 'sem login ' + (req.headers.get('User-Agent') || '').slice(0, 80) : p.email + ' ' + (p.uid || '') + (p.transicao ? ' (troca)' : ''), p.chave ? 1 : 0, (req.headers.get('User-Agent') || '').slice(0, 160), Date.now());
      par[1].serializeAttachment({ subs: [], u: p });
      return new Response(null, { status: 101, webSocket: par[0] });
    }
    if (u.pathname === '/mudanca') {
      const c = u.searchParams.get('c') || '', i = +u.searchParams.get('i') || 0;
      if (c.length < 20) return new Response('código curto', { status: 400 });
      if (req.method === 'POST') {
        const n = +u.searchParams.get('n') || 1, dado = await req.text();
        this.sql.exec('INSERT OR REPLACE INTO mudancas (c, i, n, dado, t) VALUES (?, ?, ?, ?, ?)', c, i, n, dado, Date.now());
        return json({ ok: 1 });
      }
      const r = this.sql.exec('SELECT n, dado, t FROM mudancas WHERE c = ? AND i = ?', c, i).toArray();
      if (!r.length || Date.now() - r[0].t > 7 * 86400000) return new Response('não achei', { status: 404 });
      return new Response(r[0].dado, { headers: { 'x-partes': String(r[0].n), 'Access-Control-Expose-Headers': 'x-partes' } });
    }
    if (u.pathname === '/interno/cron') return json(await this.cron());
    if (u.pathname === '/le') {
      const p = this.perfil(JSON.parse(req.headers.get('x-nv-quem') || '{}')), col = u.searchParams.get('col') || '';
      if (!pode(p, col, false)) return json({ col, negado: true, docs: [] }, 403);
      return json(this.le(col, +u.searchParams.get('desde') || 0));
    }
    if (u.pathname === '/admin/zera' && this.env.TESTE === '1') { this.sql.exec('DELETE FROM docs'); this.sql.exec('DELETE FROM meta'); this.seq = 0; return json({ ok: 1 }); }
    if (u.pathname === '/admin/cols') return json(this.sql.exec('SELECT col, COUNT(*) AS n, MAX(seq) AS seq FROM docs GROUP BY col').toArray());
    if (u.pathname === '/admin/exporta') {
      const col = u.searchParams.get('col');
      const rows = col ? this.sql.exec('SELECT col, id, x, seq FROM docs WHERE col = ?', col).toArray() : this.sql.exec('SELECT col, id, x, seq FROM docs').toArray();
      return json({ seq: this.seq, docs: rows });
    }
    if (u.pathname === '/admin/importa' && req.method === 'POST') {
      /* só cria o que não existe; com ?ate=N troca também o que ninguém mexeu aqui depois da ordem N */
      const corpo = await req.json(), ate = +u.searchParams.get('ate') || 0;
      let n = 0;
      for (const d of corpo.docs || []) {
        const tem = this.sql.exec('SELECT seq FROM docs WHERE col = ? AND id = ?', d.col, d.id).toArray();
        if (tem.length && !(ate && tem[0].seq <= ate)) continue;
        this.seq++; const x = Object.assign({}, d.x, { st: this.seq });
        this.sql.exec('INSERT OR REPLACE INTO docs (col, id, x, seq) VALUES (?, ?, ?, ?)', d.col, d.id, JSON.stringify(x), this.seq);
        n++;
      }
      this.sql.exec("INSERT OR REPLACE INTO meta (k, v) VALUES ('seq', ?)", this.seq);
      return json({ criados: n, seq: this.seq });
    }
    return new Response('?', { status: 404 });
  }

  async cron() {
    const copia = {};
    for (const [flag, lista] of [['migrou', FB_COLS], ['migrou2', FB_COLS2]]) {
      if (this.sql.exec('SELECT v FROM meta WHERE k = ?', flag).toArray().length) continue;
      for (const col of lista) {
        let pg = '', n = 0;
        for (let i = 0; i < 50; i++) {
          const r = await fetch(FB + '/' + col + '?pageSize=300&key=' + FB_CH + pg);
          if (!r.ok) { copia[col] = 'erro ' + r.status; break; }
          const j = await r.json();
          for (const d of j.documents || []) {
            const id = decodeURIComponent(d.name.split('/').pop());
            if (this.sql.exec('SELECT 1 FROM docs WHERE col = ? AND id = ?', col, id).toArray().length) continue;
            const x = {}; for (const k of Object.keys(d.fields || {})) if (k !== 'st') x[k] = fbVal(d.fields[k]);
            this.seq++; x.st = this.seq;
            this.sql.exec('INSERT INTO docs (col, id, x, seq) VALUES (?, ?, ?, ?)', col, id, JSON.stringify(x), this.seq);
            n++;
          }
          if (!j.nextPageToken) break;
          pg = '&pageToken=' + encodeURIComponent(j.nextPageToken);
        }
        if (copia[col] === undefined) copia[col] = n;
      }
      this.sql.exec("INSERT OR REPLACE INTO meta (k, v) VALUES ('seq', ?)", this.seq);
      this.sql.exec('INSERT OR REPLACE INTO meta (k, v) VALUES (?, ?)', flag, this.seq);
    }
    const cols = this.sql.exec('SELECT col, COUNT(*) AS n, MAX(seq) AS seq FROM docs GROUP BY col').toArray();
    const diag = this.sql.exec("SELECT x FROM docs WHERE col = 'diag'").toArray().map(r => JSON.parse(r.x));
    const entradas = this.sql.exec('SELECT quem, chave, t FROM entradas ORDER BY t DESC LIMIT 30').toArray();
    const estado = { t: Date.now(), seq: this.seq, copia, cols, diag, entradas };
    const w = await fetch(FB + '/cf_estado/agora?key=' + FB_CH, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fields: { j: { stringValue: JSON.stringify(estado) } } }) });
    console.log('cron', this.seq, JSON.stringify(copia), 'retrato', w.status, w.ok ? '' : (await w.text()).slice(0, 300));
    return estado;
  }

  /* quem é a pessoa: o dono vê tudo; sem login (fase de troca) também; os outros, só as áreas liberadas */
  perfil(q) {
    if (q.chave) return { chave: true, admin: true, areas: ['*'], email: '' };
    if (q.uid === DONO_UID) return { uid: q.uid, email: q.email, admin: true, areas: ['*'] };
    const r = this.sql.exec('SELECT areas, ativo FROM usuarios WHERE email = ?', q.email || '').toArray();
    /* fase de troca: login de quem ainda não foi cadastrado entra como antes (vale até ACEITA_CHAVE = "0") */
    if (!r.length && this.env.ACEITA_CHAVE !== '0') return { uid: q.uid, email: q.email, admin: true, areas: ['*'], transicao: true };
    return { uid: q.uid, email: q.email, admin: false, areas: r.length && r[0].ativo ? JSON.parse(r[0].areas) : [] };
  }
  usuarioDe(ws) { const a = ws.deserializeAttachment() || {}; return a.u ? this.perfil(a.u.chave ? { chave: true } : a.u) : { areas: [] }; }

  le(col, desde) {
    const rows = this.sql.exec('SELECT id, x FROM docs WHERE col = ? AND seq > ? ORDER BY seq', col, desde).toArray();
    return { col, seq: this.seq, docs: rows.map(r => ({ id: r.id, x: JSON.parse(r.x) })) };
  }

  aplica(op) {
    const r = this.sql.exec('SELECT x FROM docs WHERE col = ? AND id = ?', op.col, op.id).toArray();
    let x = op.troca || !r.length ? {} : JSON.parse(r[0].x);
    for (const [cam, v] of op.set || []) poeEm(x, cam, v);
    for (const cam of op.apaga || []) tiraDe(x, cam);
    this.seq++;
    x.st = this.seq;
    this.sql.exec('INSERT OR REPLACE INTO docs (col, id, x, seq) VALUES (?, ?, ?, ?)', op.col, op.id, JSON.stringify(x), this.seq);
    return x;
  }

  async webSocketMessage(ws, msg) {
    let m; try { m = JSON.parse(msg); } catch (e) { return; }
    const quem = this.usuarioDe(ws);
    if (m.t === 'eu') { ws.send(JSON.stringify({ t: 'eu', q: m.q, email: quem.email, admin: !!quem.admin, areas: quem.areas, chave: !!quem.chave })); return; }
    if (m.t === 'usuarios' || m.t === 'usuario') {
      if (!quem.admin || quem.chave || quem.transicao) { ws.send(JSON.stringify({ t: 'negado', q: m.q })); return; }
      if (m.t === 'usuario') {
        const email = String(m.email || '').trim().toLowerCase();
        if (email) this.sql.exec('INSERT OR REPLACE INTO usuarios (email, areas, ativo, t) VALUES (?, ?, ?, ?)', email, JSON.stringify((m.areas || []).filter(a => AREAS[a])), m.ativo === false ? 0 : 1, Date.now());
      }
      const lista = this.sql.exec('SELECT email, areas, ativo, t FROM usuarios ORDER BY email').toArray().map(r => ({ email: r.email, areas: JSON.parse(r.areas), ativo: !!r.ativo, t: r.t }));
      ws.send(JSON.stringify({ t: 'usuarios', q: m.q, lista, areas: Object.keys(AREAS) }));
      return;
    }
    if ((m.t === 'sub' || m.t === 'pega') && !pode(quem, m.col, false)) { ws.send(JSON.stringify({ t: 'negado', col: m.col, q: m.q })); return; }
    if (m.t === 'sub') {
      const a = ws.deserializeAttachment() || { subs: [] };
      if (a.subs.indexOf(m.col) < 0) { a.subs.push(m.col); ws.serializeAttachment(a); }
      /* em pedaços de até ~400 KB, para nenhuma mensagem passar do limite */
      const r = this.le(m.col, +m.desde || 0);
      let parte = [], tam = 0;
      for (const d of r.docs) {
        const t = JSON.stringify(d).length;
        if (parte.length && tam + t > 400000) { ws.send(JSON.stringify({ t: 'docs', col: m.col, docs: parte, seq: r.seq })); parte = []; tam = 0; }
        parte.push(d); tam += t;
      }
      ws.send(JSON.stringify({ t: 'docs', col: m.col, docs: parte, fim: true, seq: r.seq }));
      return;
    }
    if (m.t === 'pega') {
      const r = this.sql.exec('SELECT x FROM docs WHERE col = ? AND id = ?', m.col, m.id).toArray();
      ws.send(JSON.stringify({ t: 'doc', q: m.q, x: r.length ? JSON.parse(r[0].x) : null }));
      return;
    }
    if (m.t === 'grava') {
      const porCol = {};
      for (const op of m.ops || []) {
        if (!op || typeof op.col !== 'string' || typeof op.id !== 'string') continue;
        if (!pode(quem, op.col, true)) continue;
        const x = this.aplica(op);
        (porCol[op.col] = porCol[op.col] || []).push({ id: op.id, x });
      }
      this.sql.exec("INSERT OR REPLACE INTO meta (k, v) VALUES ('seq', ?)", this.seq);
      ws.send(JSON.stringify({ t: 'ok', q: m.q, seq: this.seq }));
      for (const outro of this.ctx.getWebSockets()) {
        const a = outro.deserializeAttachment() || { subs: [] };
        if (!a.subs.some(c => porCol[c])) continue;
        const p = this.usuarioDe(outro);
        for (const col of Object.keys(porCol)) if (a.subs.indexOf(col) >= 0 && pode(p, col, false)) { try { outro.send(JSON.stringify({ t: 'docs', col, docs: porCol[col], seq: this.seq })); } catch (e) {} }
      }
      return;
    }
    if (m.t === 'ping') ws.send('{"t":"pong"}');
  }
  async webSocketClose(ws, code) { try { ws.close(code, 'fim'); } catch (e) {} }
  async webSocketError() {}
}

function poeEm(x, cam, v) { let o = x; for (let i = 0; i < cam.length - 1; i++) { if (!o[cam[i]] || typeof o[cam[i]] !== 'object') o[cam[i]] = {}; o = o[cam[i]]; } o[cam[cam.length - 1]] = v; }
function tiraDe(x, cam) { let o = x; for (let i = 0; i < cam.length - 1; i++) { o = o && o[cam[i]]; } if (o && typeof o === 'object') delete o[cam[cam.length - 1]]; }
