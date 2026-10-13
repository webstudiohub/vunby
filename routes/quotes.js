'use strict';
const { query } = require('../lib/db');
const { requireAuth } = require('./auth');
const { ok, created, badRequest, notFound, forbidden, readBody } = require('../lib/http');
const { generatePublicToken } = require('../lib/tokens');
const { isNonEmpty, isPositiveNumber, isDateOrEmpty } = require('../lib/validate');
const { buildWhatsAppLink } = require('../lib/phone');
const { STATUS, isValidStatus, isFinal } = require('../lib/status');
const { BASE_URL } = require('../lib/config');
const { isExpired } = require('../lib/dates');
const { refreshNoResponse } = require('../lib/autoStatus');
const { podeCriarOrcamento } = require('../lib/billing');
const { json } = require('../lib/http');

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
  // Só trata /api/quotes...; o resto (ex.: /api/public, sem login) segue para os outros handlers
  if (!path.startsWith('/api/quotes')) return null;
  const user = await requireAuth(req, res);
  if (!user) return true;

  // GET /api/quotes — lista todos
  if (req.method === 'GET' && path === '/api/quotes') {
    await refreshNoResponse(user.id);
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
    if (!(await podeCriarOrcamento(user.id))) {
      return json(res, 402, { error: 'Seu teste grátis terminou. Seus orçamentos continuam salvos; para criar novos, assine o VUNBY.', bloqueado: true });
    }
    let body; try { body = await readBody(req); } catch { return badRequest(res); }
    const { clientId, servico, valor, validade, observacoes, pacoteIds, precisaFollowUp } = body;
    if (!clientId || !isNonEmpty(servico)) return badRequest(res, 'Cliente e serviço são obrigatórios.');
    if (!isPositiveNumber(valor)) return badRequest(res, 'Valor inválido.');
    if (!/^\d+$/.test(String(clientId))) return badRequest(res, 'Cliente inválido.');
    if (!isDateOrEmpty(validade)) return badRequest(res, 'Data de validade inválida.');
    if (String(servico).length > 300) return badRequest(res, 'Descrição do serviço muito longa (máximo 300 caracteres).');
    if (observacoes && String(observacoes).length > 3000) return badRequest(res, 'Observações muito longas (máximo 3000 caracteres).');

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
      for (const pkgId of pacoteIds.slice(0, 10)) {
        if (!/^\d+$/.test(String(pkgId))) continue;
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
    await refreshNoResponse(user.id);
    const quote = await getQuoteForUser(id, user.id);
    if (!quote) return notFound(res, 'Orçamento não encontrado.');

    const pacs = await query('SELECT * FROM quote_packages WHERE quote_id = $1', [id]);
    const fus = await query('SELECT * FROM follow_ups WHERE quote_id = $1 ORDER BY created_at', [id]);

    const expirado = isExpired(quote.validade);
    const publicUrl = `${BASE_URL}/orcamento.html?token=${encodeURIComponent(quote.public_token)}`;
    const msg = `Olá! Segue seu orçamento:\n${publicUrl}`;
    const whatsappLink = buildWhatsAppLink(quote.cliente_telefone, msg);

    // Pedido de avaliação no Google: só depois de aprovado e se o prestador cadastrou o link
    let avaliacaoWhatsApp = null;
    if (quote.status === STATUS.APROVADO && user.google_review_link) {
      const primeiro = String(quote.cliente_nome || '').trim().split(/\s+/)[0];
      const empresa = user.nome_empresa || user.nome;
      const texto = `Olá, ${primeiro}! Obrigado por escolher ${empresa}. Se puder, deixe sua avaliação no Google — leva 1 minuto e ajuda muito o nosso trabalho:\n${user.google_review_link}`;
      avaliacaoWhatsApp = buildWhatsAppLink(quote.cliente_telefone, texto);
    }

    return ok(res, {
      ...quote,
      expirado,
      avaliacaoWhatsApp,
      temLinkAvaliacao: !!user.google_review_link,
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
        if (isExpired(quote.validade)) {
          return badRequest(res, 'Orçamento expirado. Renove a validade para registrar resposta.');
        }
      }
      updates.status = body.status;
    }

    if (body.precisaFollowUp !== undefined) updates.precisa_follow_up = !!body.precisaFollowUp;
    // Edição do conteúdo (só enquanto não está aprovado/recusado)
    if (body.servico !== undefined || body.valor !== undefined) {
      if (isFinal(quote.status)) return forbidden(res, 'Orçamento já finalizado não pode ser editado.');
    }
    if (body.servico !== undefined) {
      if (!isNonEmpty(body.servico)) return badRequest(res, 'Descreva o serviço.');
      if (String(body.servico).length > 300) return badRequest(res, 'Descrição do serviço muito longa (máximo 300 caracteres).');
      updates.servico = String(body.servico).trim();
    }
    if (body.valor !== undefined) {
      if (!isPositiveNumber(body.valor)) return badRequest(res, 'Valor inválido.');
      updates.valor = parseFloat(body.valor);
    }
    if (body.validade !== undefined) {
      if (!isDateOrEmpty(body.validade)) return badRequest(res, 'Data de validade inválida.');
      updates.validade = body.validade || null;
    }
    if (body.observacoes !== undefined) {
      if (body.observacoes && String(body.observacoes).length > 3000) return badRequest(res, 'Observações muito longas (máximo 3000 caracteres).');
      updates.observacoes = body.observacoes || null;
    }

    if (Object.keys(updates).length === 0) return badRequest(res, 'Nada para atualizar.');

    const cols = Object.keys(updates).map((k, i) => `${k} = $${i + 2}`).join(', ');
    const vals = Object.values(updates);
    const r = await query(`UPDATE quotes SET ${cols} WHERE id = $1 RETURNING *`, [id, ...vals]);
    return ok(res, r.rows[0]);
  }

  // POST /api/quotes/:id/avaliacao — registra que o prestador pediu a avaliação no Google
  const avMatch = path.match(/^\/api\/quotes\/(\d+)\/avaliacao$/);
  if (req.method === 'POST' && avMatch) {
    const id = parseInt(avMatch[1], 10);
    const quote = await getQuoteForUser(id, user.id);
    if (!quote) return notFound(res, 'Orçamento não encontrado.');
    if (quote.status !== STATUS.APROVADO) return badRequest(res, 'Peça avaliação só depois que o cliente aprovar.');
    await query('UPDATE quotes SET avaliacao_pedida_em = NOW() WHERE id = $1', [id]);
    return ok(res, { ok: true });
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
