'use strict';
// "Minha tabela de preços": serviços, móveis e veículos de cada prestador, com o preço dele.
const { query } = require('../lib/db');
const { requireAuth } = require('./auth');
const { ok, created, badRequest, notFound, readBody } = require('../lib/http');
const C = require('../public/calc');
const { KITS } = require('../public/kits');

const MAX_ITENS = 300;
const MAX_CENTS = 10_000_000_00;

function linha(r) {
  return {
    id: String(r.id), grupo: r.grupo, nome: r.nome, unidade: r.unidade, preco_cents: Number(r.preco_cents),
    m3: r.m3 == null ? null : Number(r.m3), capacidade_m3: r.capacidade_m3 == null ? null : Number(r.capacidade_m3),
    desmonta: !!r.desmonta, preco_desm_cents: Number(r.preco_desm_cents), preco_mont_cents: Number(r.preco_mont_cents),
    tem_foto: !!(r.tem_foto || r.foto),
  };
}

// Valida o item vindo do app → colunas do banco, ou { erro }
function validar(b, parcial) {
  const out = {};
  const txt = (v, max, rot) => { const t = String(v == null ? '' : v).trim().replace(/\s+/g, ' '); if (!t) return { erro: `Informe ${rot}.` }; if (t.length > max) return { erro: `${rot[0].toUpperCase() + rot.slice(1)} muito longo (máximo ${max} caracteres).` }; return { v: t }; };
  const reais = (v, rot) => { const c = v === '' || v == null ? 0 : C.centavos(v); if (!Number.isInteger(c) || c < 0 || c > MAX_CENTS) return { erro: `${rot} inválido.` }; return { v: c }; };
  const dec = (v, max, rot) => { if (v === '' || v == null) return { v: null }; const n = C.numeroBR(v); if (!Number.isFinite(n) || n <= 0 || n > max) return { erro: `${rot} inválido.` }; return { v: Math.round(n * 1000) / 1000 }; };
  const campos = [
    ['nome', () => txt(b.nome, 80, 'o nome')],
    ['grupo', () => txt(b.grupo || 'Serviços', 40, 'o grupo')],
    ['unidade', () => ({ v: C.UNIDADES.includes(b.unidade) ? b.unidade : 'un' })],
    ['preco_cents', () => reais(b.preco, 'Preço')],
    ['m3', () => dec(b.m3, 100, 'Volume')],
    ['capacidade_m3', () => dec(b.capacidade_m3, 200, 'Capacidade')],
    ['desmonta', () => ({ v: !!b.desmonta })],
    ['preco_desm_cents', () => reais(b.preco_desm, 'Preço de desmontagem')],
    ['preco_mont_cents', () => reais(b.preco_mont, 'Preço de montagem')],
  ];
  const chaveApp = { preco_cents: 'preco', preco_desm_cents: 'preco_desm', preco_mont_cents: 'preco_mont' };
  for (const [col, fn] of campos) {
    if (parcial && b[chaveApp[col] || col] === undefined) continue;
    const r = fn(); if (r.erro) return { erro: r.erro }; out[col] = r.v;
  }
  return { dados: out };
}

async function handle(req, res) {
  const path = new URL(req.url, 'http://x').pathname;
  if (!path.startsWith('/api/catalog')) return null;
  const user = await requireAuth(req, res);
  if (!user) return true;

  if (req.method === 'GET' && path === '/api/catalog') {
    const r = await query('SELECT id, grupo, nome, unidade, preco_cents, m3, capacidade_m3, desmonta, preco_desm_cents, preco_mont_cents, (foto IS NOT NULL) AS tem_foto FROM catalog_items WHERE user_id = $1 ORDER BY posicao, id', [user.id]);
    return ok(res, r.rows.map(linha));
  }

  // POST /api/catalog/kit — carrega o modelo de uma profissão (não duplica o que já existe)
  if (req.method === 'POST' && path === '/api/catalog/kit') {
    let body; try { body = await readBody(req); } catch { return badRequest(res); }
    const kit = KITS[body.kit];
    if (!kit) return badRequest(res, 'Modelo não encontrado.');
    const atuais = (await query('SELECT grupo, nome FROM catalog_items WHERE user_id = $1', [user.id])).rows;
    const tem = new Set(atuais.map(a => (a.grupo + '|' + a.nome).toLowerCase()));
    const novos = kit.itens.filter(([g, n]) => !tem.has((g + '|' + n).toLowerCase()));
    if (atuais.length + novos.length > MAX_ITENS) return badRequest(res, `Sua tabela passaria de ${MAX_ITENS} itens.`);
    let pos = atuais.length;
    for (const [grupo, nome, unidade, preco, x = {}] of novos) {
      await query(`INSERT INTO catalog_items (user_id, grupo, nome, unidade, preco_cents, m3, capacidade_m3, desmonta, preco_desm_cents, preco_mont_cents, posicao)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [user.id, grupo, nome, unidade, Math.round(preco * 100), x.m3 || null, x.cap || null, !!x.d, Math.round((x.pd || 0) * 100), Math.round((x.pm || 0) * 100), pos++]);
    }
    return ok(res, { adicionados: novos.length });
  }

  if (req.method === 'POST' && path === '/api/catalog') {
    let body; try { body = await readBody(req); } catch { return badRequest(res); }
    const v = validar(body, false); if (v.erro) return badRequest(res, v.erro);
    const n = Number((await query('SELECT COUNT(*) AS n FROM catalog_items WHERE user_id = $1', [user.id])).rows[0].n);
    if (n >= MAX_ITENS) return badRequest(res, `Máximo de ${MAX_ITENS} itens na tabela.`);
    const d = v.dados;
    const r = await query(`INSERT INTO catalog_items (user_id, grupo, nome, unidade, preco_cents, m3, capacidade_m3, desmonta, preco_desm_cents, preco_mont_cents, posicao)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [user.id, d.grupo, d.nome, d.unidade, d.preco_cents, d.m3, d.capacidade_m3, d.desmonta, d.preco_desm_cents, d.preco_mont_cents, n]);
    return created(res, linha(r.rows[0]));
  }

  // GET/PUT /api/catalog/:id/foto — foto opcional do item (aparece em miniatura no orçamento do cliente)
  const mf = path.match(/^\/api\/catalog\/(\d+)\/foto$/);
  if (mf && (req.method === 'GET' || req.method === 'PUT')) {
    const atual = (await query('SELECT id, foto FROM catalog_items WHERE id = $1 AND user_id = $2', [mf[1], user.id])).rows[0];
    if (!atual) return notFound(res, 'Item não encontrado.');
    if (req.method === 'GET') {
      const mm = atual.foto && /^data:(image\/(?:png|jpeg|webp));base64,(.+)$/.exec(atual.foto);
      if (!mm) return notFound(res, 'Sem foto.');
      const buf = Buffer.from(mm[2], 'base64');
      res.writeHead(200, { 'Content-Type': mm[1], 'Content-Length': buf.length, 'Cache-Control': 'private, max-age=60' }); res.end(buf); return true;
    }
    let body; try { body = await readBody(req, 400_000); } catch { return badRequest(res, 'Foto muito grande.'); }
    const f = body.foto;
    if (f !== null && !(typeof f === 'string' && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(f) && f.length <= 300_000)) return badRequest(res, 'Foto inválida. Use JPG ou PNG.');
    await query('UPDATE catalog_items SET foto = $2 WHERE id = $1', [mf[1], f]);
    return ok(res, { ok: true });
  }

  const m = path.match(/^\/api\/catalog\/(\d+)$/);
  if (m && (req.method === 'PUT' || req.method === 'DELETE')) {
    const id = m[1];
    const atual = (await query('SELECT id FROM catalog_items WHERE id = $1 AND user_id = $2', [id, user.id])).rows[0];
    if (!atual) return notFound(res, 'Item não encontrado.');
    if (req.method === 'DELETE') { await query('DELETE FROM catalog_items WHERE id = $1', [id]); return ok(res, { ok: true }); }
    let body; try { body = await readBody(req); } catch { return badRequest(res); }
    const v = validar(body, true); if (v.erro) return badRequest(res, v.erro);
    const cols = Object.keys(v.dados);
    if (!cols.length) return badRequest(res, 'Nada para atualizar.');
    const r = await query(`UPDATE catalog_items SET ${cols.map((c, i) => `${c} = $${i + 2}`).join(', ')} WHERE id = $1 RETURNING *`, [id, ...Object.values(v.dados)]);
    return ok(res, linha(r.rows[0]));
  }
  return null;
}

module.exports = { handle };
