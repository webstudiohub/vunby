'use strict';
const { query } = require('../lib/db');
const { requireAuth } = require('./auth');
const { ok, created, badRequest, notFound, forbidden, readBody } = require('../lib/http');
const { generatePublicToken } = require('../lib/tokens');
const { isNonEmpty, isPositiveNumber } = require('../lib/validate');
const { buildWhatsAppLink } = require('../lib/phone');
const { STATUS, isValidStatus, isFinal } = require('../lib/status');
const { BASE_URL } = require('../lib/config');

async function getQuoteForUser(quoteId, userId) {
  const r = await query(
    `SELECT q.*, c.nome as cliente_nome, c.telefone as cliente_telefone
     FROM quotes q JOIN clients c ON c.id = q.client_id
     WHERE q.id = $1 AND q.user_id = $2`,
    [quoteId, userId]
  );
  return r.rows[0] || null;
}

async function handle(req, res) {
  const url = new URL(req.url, 'http://x');
  const path = url.pathname;
  const user = await requireAuth(req, res);
  if (!user) return true;

  // GET /api/quotes — lista todos
  if (req.method === 'GET' && path === '/api/quotes') {
    const status = url.searchParams.get('status');
    let q = `SELECT q.*, c.nome as cliente_nome, c.telefone as cliente_telefone
             FROM quotes q JOIN clients c ON c.id = q.client_id
             WHERE q.user_id = $1`;
    const params = [user.id];
    if (status) { q += ' AND q.status = $2'; params.push(status); }
    q += ' ORDER BY q.created_at DESC';
    const r = await query(q, params);
    return ok(res, r.rows);
  }

  // POST /api/quotes — modo rápido
  if (req.method === 'POST' && path === '/api/quotes') {
    let body; try { body = await readBody(req); } catch { return badRequest(res); }
    const { clientId, servico, valor, validade, observacoes, pacoteIds, precisaFollowUp } = body;
    if (!clientId || !isNonEmpty(servico)) return badRequest(res, 'Cliente e serviço são obrigatórios.');
    if (!isPositiveNumber(valor)) return badRequest(res, 'Valor inválido.');

    const clientRes = await query('SELECT id, telefone FROM clients WHERE id = $1 AND user_id = $2', [clientId, user.id]);
    if (!clientRes.rows[0]) return notFound(res, 'Cliente não encontrado.');
    const client = clientRes.rows[0];

    const publicToken = generatePublicToken();
    const r = await query(
      `INSERT INTO quotes (user_id, client_id, servico, valor, validade, observacoes, status, public_token, precisa_follow_up)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [user.id, clientId, servico.trim(), parseFloat(valor), validade || null, observacoes || null, STATUS.ENVIADO, publicToken, !!precisaFollowUp]
    );
    const quote = r.rows[0];

    // Cópia congelada dos pacotes selecionados (snapshot)
    if (Array.isArray(pacoteIds) && pacoteIds.length > 0) {
      for (const pkgId of pacoteIds) {
        const pkgRes = await query('SELECT * FROM package_templates WHERE id = $1 AND user_id = $2', [pkgId, user.id]);
        if (pkgRes.rows[0]) {
          const p = pkgRes.rows[0];
          await query(
            'INSERT INTO quote_packages (quote_id, template_id, nome, conteudo, preco, destaque) VALUES ($1,$2,$3,$4,$5,$6)',
            [quote.id, p.id, p.nome, p.conteudo, p.preco, p.destaque]
          );
        }
      }
    }

    const publicUrl = `${BASE_URL}/orcamento.html?token=${encodeURIComponent(publicToken)}`;
    const msg = `Olá! Segue seu orçamento para ${servico.trim()}:\n${publicUrl}`;
    const whatsappLink = buildWhatsAppLink(client.telefone, msg);

    return created(res, { ...quote, whatsappLink, publicUrl });
  }

  // GET /api/quotes/:id
  const idMatch = path.match(/^\/api\/quotes\/(\d+)$/);
  if (req.method === 'GET' && idMatch) {
    const id = parseInt(idMatch[1], 10);
    const quote = await getQuoteForUser(id, user.id);
    if (!quote) return notFound(res, 'Orçamento não encontrado.');

    const pacs = await query('SELECT * FROM quote_packages WHERE quote_id = $1', [id]);
    const fus = await query('SELECT * FROM follow_ups WHERE quote_id = $1 ORDER BY created_at', [id]);

    const expirado = quote.validade ? new Date(quote.validade) < new Date() : false;
    const publicUrl = `${BASE_URL}/orcamento.html?token=${encodeURIComponent(quote.public_token)}`;
    const msg = `Olá! Segue seu orçamento:\n${publicUrl}`;
    const whatsappLink = buildWhatsAppLink(quote.cliente_telefone, msg);

    return ok(res, {
      ...quote,
      expirado,
      publicUrl,
      whatsappLink,
      cliente: { nome: quote.cliente_nome, telefone: quote.cliente_telefone },
      pacotes: pacs.rows,
      followUps: fus.rows,
    });
  }

  // PATCH /api/quotes/:id — atualizar status, follow_up flag, etc.
  if (req.method === 'PATCH' && idMatch) {
    const id = parseInt(idMatch[1], 10);
    const quote = await getQuoteForUser(id, user.id);
    if (!quote) return notFound(res, 'Orçamento não encontrado.');

    let body; try { body = await readBody(req); } catch { return badRequest(res); }
    const updates = {};

    if (body.status !== undefined) {
      if (!isValidStatus(body.status)) return badRequest(res, 'Status inválido.');
      if (isFinal(quote.status)) return forbidden(res, 'Orçamento já finalizado.');
      // Validade: bloqueia aprovação/recusa se expirado
      if ([STATUS.APROVADO, STATUS.RECUSADO].includes(body.status)) {
        if (quote.validade && new Date(quote.validade) < new Date()) {
          return badRequest(res, 'Orçamento expirado. Renove a validade para registrar resposta.');
        }
      }
      updates.status = body.status;
    }

    if (body.precisaFollowUp !== undefined) updates.precisa_follow_up = !!body.precisaFollowUp;
    if (body.validade !== undefined) updates.validade = body.validade || null;
    if (body.observacoes !== undefined) updates.observacoes = body.observacoes || null;

    if (Object.keys(updates).length === 0) return badRequest(res, 'Nada para atualizar.');

    const cols = Object.keys(updates).map((k, i) => `${k} = $${i + 2}`).join(', ');
    const vals = Object.values(updates);
    const r = await query(`UPDATE quotes SET ${cols} WHERE id = $1 RETURNING *`, [id, ...vals]);
    return ok(res, r.rows[0]);
  }

  // DELETE /api/quotes/:id
  if (req.method === 'DELETE' && idMatch) {
    const id = parseInt(idMatch[1], 10);
    const quote = await getQuoteForUser(id, user.id);
    if (!quote) return notFound(res, 'Orçamento não encontrado.');
    await query('DELETE FROM quotes WHERE id = $1', [id]);
    return ok(res, { message: 'Orçamento removido.' });
  }

  return null;
}

module.exports = { handle };
