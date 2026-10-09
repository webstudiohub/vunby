'use strict';
const { query } = require('../lib/db');
const { requireAuth } = require('./auth');
const { ok, created, badRequest, notFound, readBody } = require('../lib/http');
const { buildWhatsAppLink } = require('../lib/phone');
const { BASE_URL } = require('../lib/config');

async function handle(req, res) {
  const url = new URL(req.url, 'http://x');
  const path = url.pathname;

  // POST /api/quotes/:id/followups
  const fuCreate = path.match(/^\/api\/quotes\/(\d+)\/followups$/);
  if (req.method === 'POST' && fuCreate) {
    const user = await requireAuth(req, res);
    if (!user) return true;
    const quoteId = parseInt(fuCreate[1], 10);
    const qRes = await query('SELECT q.*, c.telefone FROM quotes q JOIN clients c ON c.id = q.client_id WHERE q.id = $1 AND q.user_id = $2', [quoteId, user.id]);
    if (!qRes.rows[0]) return notFound(res, 'Orçamento não encontrado.');
    const quote = qRes.rows[0];

    let body; try { body = await readBody(req); } catch { return badRequest(res); }
    const { mensagem } = body;
    const texto = mensagem?.trim() || 'Olá! Gostaria de saber se você teve a oportunidade de analisar o orçamento.';

    const fuRes = await query(
      'INSERT INTO follow_ups (quote_id, mensagem, estado) VALUES ($1,$2,$3) RETURNING *',
      [quoteId, texto, 'preparado']
    );
    const fu = fuRes.rows[0];

    const publicUrl = `${BASE_URL}/orcamento.html?token=${encodeURIComponent(quote.public_token)}`;
    const msgCompleta = `${texto}\n\n${publicUrl}`;
    const whatsappLink = buildWhatsAppLink(quote.telefone, msgCompleta);

    // Abre WhatsApp — usuário precisa confirmar manualmente
    return created(res, { ...fu, whatsappLink });
  }

  // POST /api/quotes/:id/followups/:fuId/confirmar
  const fuConfirm = path.match(/^\/api\/quotes\/(\d+)\/followups\/(\d+)\/confirmar$/);
  if (req.method === 'POST' && fuConfirm) {
    const user = await requireAuth(req, res);
    if (!user) return true;
    const quoteId = parseInt(fuConfirm[1], 10);
    const fuId = parseInt(fuConfirm[2], 10);
    const qRes = await query('SELECT id FROM quotes WHERE id = $1 AND user_id = $2', [quoteId, user.id]);
    if (!qRes.rows[0]) return notFound(res, 'Orçamento não encontrado.');
    const fuRes = await query('SELECT id, estado FROM follow_ups WHERE id = $1 AND quote_id = $2', [fuId, quoteId]);
    if (!fuRes.rows[0]) return notFound(res, 'Follow-up não encontrado.');
    const r = await query('UPDATE follow_ups SET estado = $1, confirmed_at = NOW() WHERE id = $2 RETURNING *', ['enviado', fuId]);
    return ok(res, r.rows[0]);
  }

  // GET /api/quotes/:id/followups
  const fuList = path.match(/^\/api\/quotes\/(\d+)\/followups$/);
  if (req.method === 'GET' && fuList) {
    const user = await requireAuth(req, res);
    if (!user) return true;
    const quoteId = parseInt(fuList[1], 10);
    const qRes = await query('SELECT id FROM quotes WHERE id = $1 AND user_id = $2', [quoteId, user.id]);
    if (!qRes.rows[0]) return notFound(res, 'Orçamento não encontrado.');
    const r = await query('SELECT * FROM follow_ups WHERE quote_id = $1 ORDER BY created_at', [quoteId]);
    return ok(res, r.rows);
  }

  return null;
}

module.exports = { handle };
