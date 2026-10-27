/* Servidor único dos apps (Cloudflare Worker + Durable Object).
   Uma "Conta" guarda todos os documentos: (coleção, id) -> JSON. Cada gravação ganha um número de ordem (seq)
   dado só aqui; todos os aparelhos recebem as mudanças na mesma ordem, então ficam iguais.
   Canal: WebSocket em /ws. Mensagens:
     {t:'sub', col, desde}                 -> {t:'docs', col, docs:[{id,x}], fim:true, seq}
     {t:'grava', q, ops:[{col,id,troca,set:[[caminho,valor]],apaga:[caminho]}]}  -> {t:'ok', q, seq} e {t:'docs'} para quem ouve
     {t:'pega', q, col, id}                -> {t:'doc', q, x}
   Administração (cópia e exportação) só com a senha guardada no servidor. */
import { DurableObject } from 'cloudflare:workers';

const CHAVE_APP = 'nv1-meus-apps';
/* Firebase antigo: só para a cópia inicial e para o retrato de conferência */
const FB = 'https://firestore.googleapis.com/v1/projects/meus-apps-8ca76/databases/(default)/documents', FB_CH = 'AIzaSyDPJvM-XZWfa8HQ7h8v0Usb1Hf3q8sDqpg';
const FB_COLS = ['rico_vivo', 'plano', 'estudo', 'crm', 'tapete', 'born_rich', 'v2_conflitos', 'v2_adm_config', 'v2_adm_lanc', 'v2_crm_agenda', 'v2_crm_arquivo', 'v2_crm_ativos', 'v2_crm_contatos', 'v2_crm_reunioes', 'v2_plano_procs', 'v2_tap_cadastro', 'v2_tap_clientes', 'v2_tap_config', 'v2_tap_pedidos', 'v2_tap_ruas'];
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
    if (u.pathname === '/ws') {
      if (u.searchParams.get('k') !== CHAVE_APP) return new Response('sem chave', { status: 403 });
      if (req.headers.get('Upgrade') !== 'websocket') return new Response('so websocket', { status: 426 });
      return conta.fetch(req);
    }
    if (u.pathname.startsWith('/admin/')) {
      if (!env.ADMIN || req.headers.get('x-admin') !== env.ADMIN) return new Response('nao', { status: 403 });
      return conta.fetch(req);
    }
    if (u.pathname === '/le') {
      if (u.searchParams.get('k') !== CHAVE_APP) return cors(new Response('sem chave', { status: 403 }));
      return cors(await conta.fetch(req));
    }
    return new Response('ok');
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
    const r = this.sql.exec("SELECT v FROM meta WHERE k = 'seq'").toArray();
    this.seq = r.length ? r[0].v : 0;
  }

  async fetch(req) {
    const u = new URL(req.url);
    if (u.pathname === '/ws') {
      const par = new WebSocketPair();
      this.ctx.acceptWebSocket(par[1]);
      par[1].serializeAttachment({ subs: [] });
      return new Response(null, { status: 101, webSocket: par[0] });
    }
    if (u.pathname === '/interno/cron') return json(await this.cron());
    if (u.pathname === '/le') return json(this.le(u.searchParams.get('col') || '', +u.searchParams.get('desde') || 0));
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
    const feito = this.sql.exec("SELECT v FROM meta WHERE k = 'migrou'").toArray();
    let copia = null;
    if (!feito.length) {
      copia = {};
      for (const col of FB_COLS) {
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
      this.sql.exec("INSERT OR REPLACE INTO meta (k, v) VALUES ('migrou', ?)", this.seq);
    }
    const cols = this.sql.exec('SELECT col, COUNT(*) AS n, MAX(seq) AS seq FROM docs GROUP BY col').toArray();
    const diag = this.sql.exec("SELECT x FROM docs WHERE col = 'diag'").toArray().map(r => JSON.parse(r.x));
    const estado = { t: Date.now(), seq: this.seq, copia, cols, diag };
    const w = await fetch(FB + '/cf_estado/agora?key=' + FB_CH, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fields: { j: { stringValue: JSON.stringify(estado) } } }) });
    console.log('cron', this.seq, JSON.stringify(copia), 'retrato', w.status, w.ok ? '' : (await w.text()).slice(0, 300));
    return estado;
  }

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
        const x = this.aplica(op);
        (porCol[op.col] = porCol[op.col] || []).push({ id: op.id, x });
      }
      this.sql.exec("INSERT OR REPLACE INTO meta (k, v) VALUES ('seq', ?)", this.seq);
      ws.send(JSON.stringify({ t: 'ok', q: m.q, seq: this.seq }));
      for (const outro of this.ctx.getWebSockets()) {
        const a = outro.deserializeAttachment() || { subs: [] };
        for (const col of Object.keys(porCol)) if (a.subs.indexOf(col) >= 0) { try { outro.send(JSON.stringify({ t: 'docs', col, docs: porCol[col], seq: this.seq })); } catch (e) {} }
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
