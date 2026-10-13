'use strict';
const { query } = require('../lib/db');
const { requireAuth } = require('./auth');
const { ok, created, badRequest, notFound, serverError, readBody } = require('../lib/http');
const { isNonEmpty, isPhone } = require('../lib/validate');
const { normalizePhone } = require('../lib/phone');

// Dados opcionais (e-mail, endereço do serviço, CPF/CNPJ). Devolve { erro } ou { campos } só com o que veio.
function dadosExtras(body) {
  const campos = {};
  if (body.email !== undefined) {
    const e = String(body.email || '').trim().toLowerCase();
    if (e && (e.length > 120 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e))) return { erro: 'E-mail inválido.' };
    campos.email = e || null;
  }
  if (body.endereco !== undefined) {
    const t = String(body.endereco || '').trim();
    if (t.length > 200) return { erro: 'Endereço muito longo (máximo 200 caracteres).' };
    campos.endereco = t || null;
  }
  if (body.documento !== undefined) {
    const d = String(body.documento || '').replace(/\D/g, '');
    if (d && d.length !== 11 && d.length !== 14) return { erro: 'CPF deve ter 11 números e CNPJ 14.' };
    campos.documento = !d ? null : d.length === 11
      ? d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')
      : d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
  }
  return { campos };
}

async function handle(req, res) {
  const url = new URL(req.url, 'http://x');
  const path = url.pathname;
  // Só trata as próprias rotas; o resto segue para os outros handlers (ex.: /api/public, sem login)
  if (!path.startsWith('/api/clients') && !path.startsWith('/api/packages')) return null;
  const user = await requireAuth(req, res);
  if (!user) return true;

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
    if (nome.trim().length > 100) return badRequest(res, 'Nome muito longo (máximo 100 caracteres).');
    const telNorm = normalizePhone(telefone);
    if (!telNorm || telNorm.replace(/\D/g, '').length < 10 || telNorm.replace(/\D/g, '').length > 15) return badRequest(res, 'Telefone inválido. Use DDD + número.');
    const x = dadosExtras(body); if (x.erro) return badRequest(res, x.erro);
    const r = await query(
      'INSERT INTO clients (user_id, nome, telefone, observacoes, email, endereco, documento) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *',
      [user.id, nome.trim(), telNorm, observacoes || null, x.campos.email || null, x.campos.endereco || null, x.campos.documento || null]
    );
    return created(res, r.rows[0]);
  }

  // PUT /api/clients/:id
  const clientMatch = path.match(/^\/api\/clients\/(\d+)$/);
  if (req.method === 'PUT' && clientMatch) {
    const id = parseInt(clientMatch[1], 10);
    let body; try { body = await readBody(req); } catch { return badRequest(res); }
    const { nome, telefone, observacoes } = body;
    const existing = await query('SELECT * FROM clients WHERE id = $1 AND user_id = $2', [id, user.id]);
    if (!existing.rows[0]) return notFound(res, 'Cliente não encontrado.');
    const atual = existing.rows[0];
    if (nome !== undefined) {
      if (!isNonEmpty(nome)) return badRequest(res, 'Nome é obrigatório.');
      if (nome.trim().length > 100) return badRequest(res, 'Nome muito longo (máximo 100 caracteres).');
    }
    let telNorm = atual.telefone;
    if (telefone !== undefined) {
      telNorm = normalizePhone(telefone);
      if (!telNorm || telNorm.replace(/\D/g, '').length < 10 || telNorm.replace(/\D/g, '').length > 15) return badRequest(res, 'Telefone inválido. Use DDD + número.');
    }
    const x = dadosExtras(body); if (x.erro) return badRequest(res, x.erro);
    const v = k => (k in x.campos ? x.campos[k] : atual[k]);
    const r = await query(
      'UPDATE clients SET nome=$1, telefone=$2, observacoes=$3, email=$4, endereco=$5, documento=$6 WHERE id=$7 AND user_id=$8 RETURNING *',
      [nome !== undefined ? nome.trim() : atual.nome, telNorm, observacoes !== undefined ? (observacoes || null) : atual.observacoes, v('email'), v('endereco'), v('documento'), id, user.id]
    );
    return ok(res, r.rows[0]);
  }

  // DELETE /api/clients/:id
  if (req.method === 'DELETE' && clientMatch) {
    const id = parseInt(clientMatch[1], 10);
    const existing = await query('SELECT id FROM clients WHERE id = $1 AND user_id = $2', [id, user.id]);
    if (!existing.rows[0]) return notFound(res, 'Cliente não encontrado.');
    const temOrc = await query('SELECT 1 FROM quotes WHERE client_id = $1 LIMIT 1', [id]);
    if (temOrc.rows[0]) return badRequest(res, 'Este cliente tem orçamentos e não pode ser apagado.');
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
    if (nome.trim().length > 100 || (conteudo && String(conteudo).length > 2000)) return badRequest(res, 'Texto muito longo.');
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
    if (!isNonEmpty(nome)) return badRequest(res, 'Nome é obrigatório.');
    if (nome.trim().length > 100 || (conteudo && String(conteudo).length > 2000)) return badRequest(res, 'Texto muito longo.');
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
