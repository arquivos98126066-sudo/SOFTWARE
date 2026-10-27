/* Troca do Firestore pelo servidor único (Cloudflare), com os mesmos nomes de funções.
   Para HTMLs que já falavam com o Firestore (Pré-venda, Retina, Método OPA, Workshop): basta importar daqui.
   Cada coleção é ouvida uma vez só por página; documentos apagados viram marca (__apagado), para não voltarem. */
if (!window.NvCanal) await import('./nv-canal.js');
const C = window.NvCanal;
export const db = { nv: true };
const cache = {}, ouvintes = {}, prontos = {};
function chega(col, docs, fim) {
  const m = cache[col] || (cache[col] = {});
  const mudou = [];
  docs.forEach(d => { m[d.id] = d.x; mudou.push(d.id); });
  if (fim) prontos[col] = true;
  if (!prontos[col]) return;
  (ouvintes[col] || []).slice().forEach(f => { try { f(mudou); } catch (e) { console.error(e); } });
}
function liga(col) { if (cache[col]) return; cache[col] = {}; C.ouve(col, 0, (docs, fim) => chega(col, docs, fim)); }
function vivo(x) { return x && !x.__apagado; }
function limpa(x) { const o = Object.assign({}, x); delete o.st; delete o.__apagado; return o; }
function novoId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 10); }
function json(v) { return v === undefined ? null : JSON.parse(JSON.stringify(v)); }

export function collection(_db, col) { return { tipo: 'col', col }; }
export function doc(a, col, id) {
  if (a && a.tipo === 'col') return { tipo: 'doc', col: a.col, id: col || novoId() };
  return { tipo: 'doc', col, id: String(id) };
}
export function serverTimestamp() { return Date.now(); }
export function orderBy(campo, dir) { return { t: 'ordem', campo, dir: dir || 'asc' }; }
export function limit(n) { return { t: 'limite', n }; }
export function where(campo, op, v) { return { t: 'onde', campo, op, v }; }
export function query(ref, ...r) { return { tipo: 'col', col: ref.col, r }; }
export class FieldPath { constructor(...p) { this.p = p; } }

function snapDoc(col, id) {
  const x = (cache[col] || {})[id];
  return { id, ref: { tipo: 'doc', col, id }, exists: () => vivo(x), data: () => (vivo(x) ? limpa(x) : undefined), metadata: { hasPendingWrites: false, fromCache: false } };
}
function snapCol(q, mudou, antes) {
  let ds = Object.keys(cache[q.col] || {}).filter(id => vivo(cache[q.col][id])).map(id => snapDoc(q.col, id));
  for (const r of q.r || []) {
    if (r.t === 'onde') ds = ds.filter(d => { const v = d.data()[r.campo]; return r.op === '==' ? v === r.v : r.op === '>' ? v > r.v : r.op === '<' ? v < r.v : r.op === '>=' ? v >= r.v : r.op === '<=' ? v <= r.v : r.op === '!=' ? v !== r.v : true; });
    if (r.t === 'ordem') ds.sort((a, b) => { const x = a.data()[r.campo], y = b.data()[r.campo]; return (x > y ? 1 : x < y ? -1 : 0) * (r.dir === 'desc' ? -1 : 1); });
    if (r.t === 'limite') ds = ds.slice(0, r.n);
  }
  const ids = {}; ds.forEach(d => { ids[d.id] = 1; });
  const ch = [];
  ds.forEach(d => { if (!antes || !antes[d.id]) ch.push({ type: 'added', doc: d }); else if (mudou.indexOf(d.id) >= 0) ch.push({ type: 'modified', doc: d }); });
  Object.keys(antes || {}).forEach(id => { if (!ids[id]) ch.push({ type: 'removed', doc: snapDoc(q.col, id) }); });
  return { s: { docs: ds, size: ds.length, empty: !ds.length, forEach: f => ds.forEach(f), docChanges: () => ch, metadata: { hasPendingWrites: false, fromCache: false } }, ids };
}
export function onSnapshot(ref, cb, erro) {
  const col = ref.col; let ativo = true, antes = null, primeira = true;
  const f = mudou => {
    if (!ativo) return;
    if (ref.tipo === 'doc') { if (primeira || mudou.indexOf(ref.id) >= 0) { primeira = false; cb(snapDoc(col, ref.id)); } return; }
    const r = snapCol(ref, mudou, antes);
    if (primeira || r.s.docChanges().length) { primeira = false; antes = r.ids; cb(r.s); }
  };
  (ouvintes[col] = ouvintes[col] || []).push(f);
  liga(col);
  if (prontos[col]) setTimeout(() => f([]), 0);
  return () => { ativo = false; ouvintes[col] = (ouvintes[col] || []).filter(x => x !== f); };
}
function espera(col) { liga(col); return prontos[col] ? Promise.resolve() : new Promise(ok => { const f = () => { if (prontos[col]) { ouvintes[col] = ouvintes[col].filter(x => x !== f); ok(); } }; (ouvintes[col] = ouvintes[col] || []).push(f); }); }
export async function getDoc(ref) { await espera(ref.col); return snapDoc(ref.col, ref.id); }
export async function getDocs(q) { await espera(q.col); return snapCol(q, [], null).s; }

/* objeto -> caminhos para gravar. merge: entra em cada mapa (como no Firestore); sem merge: troca o documento todo */
function caminhos(o, base, saida) {
  Object.keys(o).forEach(k => {
    const v = o[k];
    if (v && typeof v === 'object' && !Array.isArray(v)) { const c = base.concat([k]); if (!Object.keys(v).length) saida.push([c, {}]); else caminhos(v, c, saida); }
    else saida.push([base.concat([k]), json(v)]);
  });
  return saida;
}
function opSet(ref, data, op) {
  data = json(data) || {};
  if (op && op.mergeFields) {
    const set = op.mergeFields.map(f => { const p = f instanceof FieldPath ? f.p : String(f).split('.'); let v = data; p.forEach(k => { v = v == null ? undefined : v[k]; }); return [p, json(v)]; });
    return { col: ref.col, id: ref.id, set: set.concat([[['__apagado'], false]]) };
  }
  if (op && op.merge) return { col: ref.col, id: ref.id, set: caminhos(data, [], []).concat([[['__apagado'], false]]) };
  return { col: ref.col, id: ref.id, troca: true, set: Object.keys(data).map(k => [[k], data[k]]) };
}
function opUpdate(ref, data) { return { col: ref.col, id: ref.id, set: Object.keys(data).map(k => [k.split('.'), json(data[k])]) }; }
function opDel(ref) { return { col: ref.col, id: ref.id, troca: true, set: [[['__apagado'], true]] }; }
/* a página vê a própria mudança na hora (como no Firestore), antes da volta do servidor */
function local(op) {
  const m = cache[op.col]; if (!m) return;
  let x = op.troca ? {} : Object.assign({}, m[op.id] || {});
  op.set.forEach(([p, v]) => { let o = x; for (let i = 0; i < p.length - 1; i++) { o[p[i]] = Object.assign({}, o[p[i]] && typeof o[p[i]] === 'object' ? o[p[i]] : {}); o = o[p[i]]; } o[p[p.length - 1]] = v; });
  m[op.id] = Object.assign(x, { st: (m[op.id] && m[op.id].st) || 0 });
}
function manda(ops) { ops.forEach(local); ops.forEach(op => { if (prontos[op.col]) (ouvintes[op.col] || []).slice().forEach(f => { try { f([op.id]); } catch (e) {} }); }); return Promise.race([C.grava(ops), new Promise((_, rj) => setTimeout(() => rj(new Error('sem conexão')), 15000))]); }
export function setDoc(ref, data, op) { return manda([opSet(ref, data, op)]).then(() => undefined); }
export function updateDoc(ref, data) { return manda([opUpdate(ref, data)]).then(() => undefined); }
export function deleteDoc(ref) { return manda([opDel(ref)]).then(() => undefined); }
export async function addDoc(colRef, data) { const ref = doc(colRef); await manda([opSet(ref, data)]); return ref; }
export function writeBatch() {
  const ops = [];
  return { set(r, d, o) { ops.push(opSet(r, d, o)); return this; }, update(r, d) { ops.push(opUpdate(r, d)); return this; }, delete(r) { ops.push(opDel(r)); return this; }, commit() { return manda(ops).then(() => undefined); } };
}
