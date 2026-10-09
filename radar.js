'use strict';
const { query } = require('../lib/db');
const { requireAuth } = require('./auth');
const { ok } = require('../lib/http');
const { OPEN_STATUS } = require('../lib/status');

async function handle(req, res) {
  const url = new URL(req.url, 'http://x');
  const path = url.pathname;

  if (req.method === 'GET' && path === '/api/radar') {
    const user = await requireAuth(req, res);
    if (!user) return true;

    const placeholders = OPEN_STATUS.map((_, i) => `$${i + 2}`).join(',');
    const r = await query(
      `SELECT q.*, c.nome as cliente_nome, c.telefone as cliente_telefone
       FROM quotes q JOIN clients c ON c.id = q.client_id
       WHERE q.user_id = $1 AND q.status IN (${placeholders})
       ORDER BY q.created_at DESC`,
      [user.id, ...OPEN_STATUS]
    );

    const quotes = r.rows;
    const valorEmAberto = quotes.reduce((sum, q) => sum + parseFloat(q.valor || 0), 0);

    return ok(res, {
      quotes,
      valorEmAberto,
      total: quotes.length,
    });
  }

  return null;
}

module.exports = { handle };
