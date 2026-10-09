'use strict';
const { query } = require('../lib/db');
const { requireAuth } = require('./auth');
const { ok, created, badRequest, notFound, serverError, readBody } = require('../lib/http');
const { isNonEmpty, isPhone } = require('../lib/validate');
const { normalizePhone } = require('../lib/phone');

async function handle(req, res) {
  const url = new URL(req.url, 'http://x');
  const path = url.pathname;
  const user = await requireAuth(req, res);
  if (!user) return;

  // --- CLIENTES ---
  // GET /api/clients
  if (req.method === 'GET' && path === '/api/clients') {
    const res2 = await query('SELECT * FROM clients WHERE user_id = $1 ORDER BY nome', [user.id]);
    return ok(res, res2.rows);
  }

  // POST /api/clients
  if (req.method === 'POST' && path === '/api/clients') {
    let body; try { body = await readBody(req); } catch { return badRequest(res); }
    const { nome, telefone, observacoes } = body;
    if (!isNonEmpty(nome)) return badRequest(res, 'Nome é obrigatório.');
    const telNorm = normalizePhone(telefone);
    if (!telNorm) return badRequest(res, 'Telefone inválido.');
    const r = await query(
      'INSERT INTO clients (user_id, nome, telefone, observacoes) VALUES ($1,$2,$3,$4) RETURNING *',
      [user.id, nome.trim(), telNorm, observacoes || null]
    );
    return created(res, r.rows[0]);
  }

  // PUT /api/clients/:id
  const clientMatch = path.match(/^\/api\/clients\/(\d+)$/);
  if (req.method === 'PUT' && clientMatch) {
    const id = parseInt(clientMatch[1], 10);
    let body; try { body = await readBody(req); } catch { return badRequest(res); }
    const { nome, telefone, observacoes } = body;
    const existing = await query('SELECT id FROM clients WHERE id = $1 AND user_id = $2', [id, user.id]);
    if (!existing.rows[0]) return notFound(res, 'Cliente não encontrado.');
    const telNorm = normalizePhone(telefone);
    const r = await query(
      'UPDATE clients SET nome=$1, telefone=$2, observacoes=$3 WHERE id=$4 RETURNING *',
      [nome?.trim() || existing.rows[0].nome, telNorm || existing.rows[0].telefone, observacoes ?? null, id]
    );
    return ok(res, r.rows[0]);
  }

  // DELETE /api/clients/:id
  if (req.method === 'DELETE' && clientMatch) {
    const id = parseInt(clientMatch[1], 10);
    const existing = await query('SELECT id FROM clients WHERE id = $1 AND user_id = $2', [id, user.id]);
    if (!existing.rows[0]) return notFound(res, 'Cliente não encontrado.');
    await query('DELETE FROM clients WHERE id = $1', [id]);
    return ok(res, { message: 'Cliente removido.' });
  }

  // --- MODELOS DE PACOTE ---
  // GET /api/packages
  if (req.method === 'GET' && path === '/api/packages') {
    const r = await query('SELECT * FROM package_templates WHERE user_id = $1 ORDER BY nome', [user.id]);
    return ok(res, r.rows);
  }

  // POST /api/packages
  if (req.method === 'POST' && path === '/api/packages') {
    let body; try { body = await readBody(req); } catch { return badRequest(res); }
    const { nome, conteudo, preco, destaque } = body;
    if (!isNonEmpty(nome)) return badRequest(res, 'Nome é obrigatório.');
    const r = await query(
      'INSERT INTO package_templates (user_id, nome, conteudo, preco, destaque) VALUES ($1,$2,$3,$4,$5) RETURNING *',
      [user.id, nome.trim(), conteudo || null, parseFloat(preco) || 0, !!destaque]
    );
    return created(res, r.rows[0]);
  }

  // PUT /api/packages/:id
  const pkgMatch = path.match(/^\/api\/packages\/(\d+)$/);
  if (req.method === 'PUT' && pkgMatch) {
    const id = parseInt(pkgMatch[1], 10);
    let body; try { body = await readBody(req); } catch { return badRequest(res); }
    const existing = await query('SELECT id FROM package_templates WHERE id = $1 AND user_id = $2', [id, user.id]);
    if (!existing.rows[0]) return notFound(res, 'Modelo não encontrado.');
    const { nome, conteudo, preco, destaque } = body;
    const r = await query(
      'UPDATE package_templates SET nome=$1, conteudo=$2, preco=$3, destaque=$4 WHERE id=$5 RETURNING *',
      [nome?.trim(), conteudo || null, parseFloat(preco) || 0, !!destaque, id]
    );
    return ok(res, r.rows[0]);
  }

  // DELETE /api/packages/:id
  if (req.method === 'DELETE' && pkgMatch) {
    const id = parseInt(pkgMatch[1], 10);
    const existing = await query('SELECT id FROM package_templates WHERE id = $1 AND user_id = $2', [id, user.id]);
    if (!existing.rows[0]) return notFound(res, 'Modelo não encontrado.');
    await query('DELETE FROM package_templates WHERE id = $1', [id]);
    return ok(res, { message: 'Modelo removido.' });
  }

  return null;
}

module.exports = { handle };
