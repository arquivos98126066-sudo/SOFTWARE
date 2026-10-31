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
   só as áreas daquela pessoa. O dono vê tudo. Sem login (a chave pública foi fechada em 31/10/2026) ninguém entra
   (fase de troca dos celulares).
   Administração (cópia e exportação) só com a senha guardada no servidor. */
import { DurableObject } from 'cloudflare:workers';

const CHAVE_APP = 'nv1-meus-apps';
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
function b64url(s) { s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; return Uint8Array.from(atob(s), c => c.charCodeAt(0)); }
async function confereToken(t, env) {
  if (!t) return null;
  if (t.indexOf('nv.') === 0) { const o = await abre(env, t, 'a'); return o ? { uid: 'nv:' + o.e, email: o.e } : null; }
  if (env.TESTE === '1' && t.indexOf('teste:') === 0) { const [, uid, email] = t.split(':'); return { uid, email }; }
  return null;
}
async function quem(req, u, env) {
  const p = await confereToken(u.searchParams.get('t'), env);
  if (p) return p;
  return null; /* só quem entrou com e-mail e senha (a chave pública foi fechada em 31/10/2026) */
}
function comQuem(req, p) {
  const h = new Headers(req.headers);
  h.set('x-nv-quem', JSON.stringify(p));
  return new Request(req, { headers: h });
}
/* ---- login próprio (Cloudflare), no lugar do Firebase Auth (2026-10-31) ----
   Senha guardada só como PBKDF2-SHA256 com sal. O passe de acesso ("nv.") vale 1 hora; o de renovação, 90 dias.
   Assinatura HMAC com o segredo AUTH_SECRET (guardado no servidor, nunca no código). */
const ITER = 100000;
const enc = new TextEncoder();
function b64u(bytes) { let s = ''; bytes.forEach(b => { s += String.fromCharCode(b); }); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
async function hmacChave(env) { return crypto.subtle.importKey('raw', enc.encode(env.AUTH_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']); }
async function assina(env, obj) {
  const p = b64u(enc.encode(JSON.stringify(obj)));
  const s = b64u(new Uint8Array(await crypto.subtle.sign('HMAC', await hmacChave(env), enc.encode(p))));
  return 'nv.' + p + '.' + s;
}
async function abre(env, t, tipo) {
  try {
    if (!env.AUTH_SECRET || !t || t.indexOf('nv.') !== 0) return null;
    const [, p, s] = t.split('.');
    if (!(await crypto.subtle.verify('HMAC', await hmacChave(env), b64url(s), enc.encode(p)))) return null;
    const o = JSON.parse(new TextDecoder().decode(b64url(p)));
    return o.k === tipo && o.x > Date.now() && o.e ? o : null;
  } catch (e) { return null; }
}
async function hashSenha(senha, salt) {
  const k = await crypto.subtle.importKey('raw', enc.encode(senha), 'PBKDF2', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: ITER }, k, 256));
}
function igual(a, b) { if (a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a[i] ^ b[i]; return d === 0; }

export default {
  async fetch(req, env) {
    const u = new URL(req.url);
    if (req.method === 'OPTIONS') return cors(new Response(null, { status: 204 }));
    const conta = contaDe(env);
    if (u.pathname === '/' || u.pathname === '') return env.ASSETS.fetch(new Request(new URL('/index.html', u), req));
    if (u.pathname.startsWith('/auth/')) return cors(await conta.fetch(req));
    /* formulário público do site: grava só um contato novo no CRM, sem login e sem ler nada */
    if (u.pathname === '/lead' && req.method === 'POST') {
      let b = null; try { b = await req.json(); } catch (e) {}
      const t = (v, n) => String(v == null ? '' : v).slice(0, n);
      if (!b || !t(b.nome, 120).trim() || !t(b.numero, 40).replace(/\D/g, '')) return cors(json({ erro: 'dados faltando' }, 400));
      return cors(await conta.fetch(new Request(new URL('/lead', u), { method: 'POST', body: JSON.stringify({ nome: t(b.nome, 120), numero: t(b.numero, 40).replace(/\D/g, ''), email: t(b.email, 160), segmento: t(b.segmento, 120) }) })));
    }
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
    const conta = contaDe(env);
    ctx.waitUntil(conta.fetch('https://interno/interno/cron'));
  }
};
/* servidor perto do Brasil (Miami): o antigo ('principal') ficou longe; o novo traz tudo dele na primeira vez */
const NOVO = 'sul', ANTIGO = 'principal';
function contaDe(env) { return env.CONTA.get(env.CONTA.idFromName(NOVO), { locationHint: 'sam' }); }
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
    this.sql.exec('CREATE TABLE IF NOT EXISTS credenciais (email TEXT PRIMARY KEY, salt TEXT NOT NULL, hash TEXT NOT NULL, dono INTEGER NOT NULL, t INTEGER NOT NULL)');
    this.sql.exec('CREATE TABLE IF NOT EXISTS falhas (email TEXT NOT NULL, t INTEGER NOT NULL)');
    this.sql.exec('CREATE TABLE IF NOT EXISTS mudancas (c TEXT NOT NULL, i INTEGER NOT NULL, n INTEGER NOT NULL, dado TEXT NOT NULL, t INTEGER NOT NULL, PRIMARY KEY (c, i))');
    this.sql.exec('CREATE TABLE IF NOT EXISTS entradas (quem TEXT PRIMARY KEY, chave INTEGER NOT NULL, ua TEXT, t INTEGER NOT NULL)');
    const r = this.sql.exec("SELECT v FROM meta WHERE k = 'seq'").toArray();
    this.seq = r.length ? r[0].v : 0;
    this.foi = this.sql.exec("SELECT v FROM meta WHERE k = 'foi'").toArray().length > 0;
    this.vazio = !r.length && !this.foi && !this.sql.exec("SELECT v FROM meta WHERE k = 'veio'").toArray().length;
  }

  /* mudança de lugar: o servidor novo (vazio) copia tudo do antigo, com a mesma numeração */
  async trazer() {
    const antigo = this.env.CONTA.get(this.env.CONTA.idFromName(ANTIGO));
    const d = await (await antigo.fetch('https://interno/interno/despejo')).json();
    const t = { docs: ['col', 'id', 'x', 'seq'], meta: ['k', 'v'], usuarios: ['email', 'areas', 'ativo', 't'], mudancas: ['c', 'i', 'n', 'dado', 't'], entradas: ['quem', 'chave', 'ua', 't'] };
    this.ctx.storage.transactionSync(() => {
      for (const tab of Object.keys(t)) for (const row of d[tab] || []) this.sql.exec('INSERT OR REPLACE INTO ' + tab + ' (' + t[tab].join(', ') + ') VALUES (' + t[tab].map(() => '?').join(', ') + ')', ...t[tab].map(c => row[c]));
      this.sql.exec("DELETE FROM meta WHERE k = 'foi'");
      this.sql.exec("INSERT OR REPLACE INTO meta (k, v) VALUES ('veio', ?)", Date.now());
    });
    const r = this.sql.exec("SELECT v FROM meta WHERE k = 'seq'").toArray();
    this.seq = r.length ? r[0].v : 0;
  }

  async fetch(req) {
    const u = new URL(req.url);
    if (u.pathname === '/interno/despejo') {
      /* tudo de uma vez, sem pausa: depois daqui este servidor não aceita mais nada (os aparelhos reconectam no novo) */
      this.foi = true;
      this.sql.exec("INSERT OR REPLACE INTO meta (k, v) VALUES ('foi', ?)", Date.now());
      for (const ws of this.ctx.getWebSockets()) try { ws.close(1012, 'mudou'); } catch (e) {}
      const d = {};
      for (const tab of ['docs', 'meta', 'usuarios', 'mudancas', 'entradas']) d[tab] = this.sql.exec('SELECT * FROM ' + tab).toArray();
      return json(d);
    }
    if (this.foi) return new Response('mudou de lugar', { status: 503 });
    if (this.vazio) { await this.ctx.blockConcurrencyWhile(async () => { if (this.vazio) { await this.trazer(); this.vazio = false; } }); }
    if (u.pathname.startsWith('/auth/')) return this.auth(req, u);
    if (u.pathname === '/lead') {
      const b = await req.json(), agora = Date.now(), id = 'site_' + agora.toString(36) + Math.random().toString(36).slice(2, 8);
      const op = { col: 'meu_crm_contatos', id, troca: true, set: [['nome', b.nome], ['numero', b.numero], ['obs', 'Email: ' + b.email + ' | Segmento: ' + b.segmento + ' | Origem: SoftDelivery'], ['indicado', 'Site SoftDelivery'], ['tentativas', 0], ['status', 'ativo'], ['createdAt', agora], ['updatedAt', agora]].map(p => [[p[0]], p[1]]) };
      const x = this.aplica(op);
      this.sql.exec("INSERT OR REPLACE INTO meta (k, v) VALUES ('seq', ?)", this.seq);
      for (const outro of this.ctx.getWebSockets()) {
        const a = outro.deserializeAttachment() || { subs: [] };
        if (a.subs.indexOf(op.col) < 0 || !pode(this.usuarioDe(outro), op.col, false)) continue;
        try { outro.send(JSON.stringify({ t: 'docs', col: op.col, docs: [{ id, x }], seq: this.seq })); } catch (e) {}
      }
      return json({ ok: true });
    }
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
    if (u.pathname === '/admin/zera' && this.env.TESTE === '1') { this.sql.exec('DELETE FROM docs'); this.sql.exec("DELETE FROM meta WHERE k != 'veio'"); this.seq = 0; return json({ ok: 1 }); }
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
    /* cópia diária de todos os dados para o R2 (arquivo novo a cada dia, nunca sobrescreve nem apaga) */
    try {
      const ult = this.sql.exec("SELECT v FROM meta WHERE k = 'bk_t'").toArray();
      if (this.env.MIDIA && (!ult.length || Date.now() - +ult[0].v > 23 * 3600000)) {
        const dump = { t: Date.now(), seq: this.seq, docs: this.sql.exec('SELECT col, id, x FROM docs').toArray(), usuarios: this.sql.exec('SELECT * FROM usuarios').toArray() };
        const gz = new Blob([JSON.stringify(dump)]).stream().pipeThrough(new CompressionStream('gzip'));
        const nome = 'backup-servidor/' + new Date().toISOString().replace(/[-:]/g, '').slice(0, 13) + '.json.gz';
        if (!(await this.env.MIDIA.head(nome))) await this.env.MIDIA.put(nome, await new Response(gz).arrayBuffer(), { httpMetadata: { contentType: 'application/gzip' } });
        this.sql.exec("INSERT OR REPLACE INTO meta (k, v) VALUES ('bk_t', ?)", String(Date.now()));
        copia.backup = nome;
      }
    } catch (e) { copia.backup = 'erro ' + String(e).slice(0, 80); }
    const cols = this.sql.exec('SELECT col, COUNT(*) AS n, MAX(seq) AS seq FROM docs GROUP BY col').toArray();
    const diag = this.sql.exec("SELECT x FROM docs WHERE col = 'diag'").toArray().map(r => JSON.parse(r.x));
    const entradas = this.sql.exec('SELECT quem, chave, t FROM entradas ORDER BY t DESC LIMIT 30').toArray();
    const estado = { t: Date.now(), seq: this.seq, copia, cols, diag, entradas };
    return estado;
  }

  /* login próprio: primeira (dono), login, refresh, senha, definir (só o dono) */
  async auth(req, u) {
    const env = this.env;
    if (!env.AUTH_SECRET) return json({ erro: 'login ainda não ligado' }, 503);
    if (req.method !== 'POST') return json({ erro: 'use POST' }, 405);
    const c = await req.json().catch(() => ({}));
    const rota = u.pathname.slice(6), email = String(c.email || '').trim().toLowerCase();
    const quemEh = async (t) => { const o = await abre(env, t, 'a'); return o ? o.e : null; };
    const dono = (e) => { const r = this.sql.exec('SELECT dono FROM credenciais WHERE email = ?', e).toArray(); return !!(r.length && r[0].dono); };
    const emite = async (e) => json({ email: e, token: await assina(env, { k: 'a', e, x: Date.now() + 3600000 }), refresh: await assina(env, { k: 'r', e, x: Date.now() + 90 * 86400000 }), expira: 3600 });
    const grava = async (e, senha, ehDono) => {
      const salt = crypto.getRandomValues(new Uint8Array(16)), h = await hashSenha(senha, salt);
      this.sql.exec('INSERT OR REPLACE INTO credenciais (email, salt, hash, dono, t) VALUES (?, ?, ?, ?, ?)', e, b64u(salt), b64u(h), ehDono ? 1 : 0, Date.now());
    };
    if (rota === 'primeira') {
      /* só uma vez: cria o dono, com o código de instalação guardado no servidor */
      if (!env.SETUP_KEY || c.setup !== env.SETUP_KEY) return json({ erro: 'código de instalação errado' }, 403);
      if (this.sql.exec('SELECT 1 FROM credenciais WHERE dono = 1').toArray().length) return json({ erro: 'o dono já foi criado' }, 409);
      if (!email || String(c.senha || '').length < 8) return json({ erro: 'e-mail e senha de 8 letras ou mais' }, 400);
      await grava(email, String(c.senha), true);
      return emite(email);
    }
    if (rota === 'login') {
      const agora = Date.now();
      this.sql.exec('DELETE FROM falhas WHERE t < ?', agora - 600000);
      if (this.sql.exec('SELECT COUNT(*) AS n FROM falhas WHERE email = ?', email).toArray()[0].n >= 8) return json({ erro: 'muitas tentativas; espere 10 minutos' }, 429);
      const r = this.sql.exec('SELECT salt, hash FROM credenciais WHERE email = ?', email).toArray();
      const h = await hashSenha(String(c.senha || ''), r.length ? b64url(r[0].salt) : new Uint8Array(16));
      if (!r.length || !igual(h, b64url(r[0].hash))) { this.sql.exec('INSERT INTO falhas (email, t) VALUES (?, ?)', email, agora); return json({ erro: 'e-mail ou senha errados' }, 401); }
      return emite(email);
    }
    if (rota === 'refresh') {
      const o = await abre(env, String(c.refresh || ''), 'r');
      if (!o || !this.sql.exec('SELECT 1 FROM credenciais WHERE email = ?', o.e).toArray().length) return json({ erro: 'entre de novo' }, 401);
      return emite(o.e);
    }
    if (rota === 'senha') {
      const e = await quemEh(String(c.token || ''));
      if (!e) return json({ erro: 'entre de novo' }, 401);
      const r = this.sql.exec('SELECT salt, hash FROM credenciais WHERE email = ?', e).toArray();
      if (!r.length || !igual(await hashSenha(String(c.atual || ''), b64url(r[0].salt)), b64url(r[0].hash))) return json({ erro: 'senha atual errada' }, 401);
      if (String(c.nova || '').length < 8) return json({ erro: 'senha nova com 8 letras ou mais' }, 400);
      await grava(e, String(c.nova), dono(e));
      return json({ ok: 1 });
    }
    if (rota === 'definir') {
      const e = await quemEh(String(c.token || ''));
      if (!e || !dono(e)) return json({ erro: 'só o dono' }, 403);
      if (!email || String(c.senha || '').length < 8) return json({ erro: 'e-mail e senha de 8 letras ou mais' }, 400);
      await grava(email, String(c.senha), dono(email));
      return json({ ok: 1, email });
    }
    return json({ erro: 'rota?' }, 404);
  }

  /* quem é a pessoa: o dono vê tudo; sem login (fase de troca) também; os outros, só as áreas liberadas */
  perfil(q) {
    if (q.chave) return { chave: true, admin: true, areas: ['*'], email: '' };
    if (q.uid && q.uid.indexOf('nv:') === 0) { const d = this.sql.exec('SELECT dono FROM credenciais WHERE email = ?', q.email || '').toArray(); if (d.length && d[0].dono) return { uid: q.uid, email: q.email, admin: true, areas: ['*'] }; }
    const r = this.sql.exec('SELECT areas, ativo FROM usuarios WHERE email = ?', q.email || '').toArray();
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
    if (this.foi) { try { ws.close(1012, 'mudou'); } catch (e) {} return; }
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
