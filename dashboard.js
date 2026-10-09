'use strict';
const { query } = require('../lib/db');
const { requireAuth } = require('./auth');
const { ok } = require('../lib/http');
const { STATUS, OPEN_STATUS } = require('../lib/status');

async function handle(req, res) {
  const url = new URL(req.url, 'http://x');
  const path = url.pathname;

  if (req.method === 'GET' && path === '/api/dashboard') {
    const user = await requireAuth(req, res);
    if (!user) return true;

    const [totals, openVal, followup] = await Promise.all([
      query(`SELECT status, COUNT(*) as count, COALESCE(SUM(valor),0) as total
             FROM quotes WHERE user_id = $1 GROUP BY status`, [user.id]),
      query(`SELECT COALESCE(SUM(valor),0) as valor FROM quotes WHERE user_id = $1 AND status = ANY($2)`,
            [user.id, OPEN_STATUS]),
      query(`SELECT COUNT(*) as count FROM quotes WHERE user_id = $1 AND precisa_follow_up = true AND status = ANY($2)`,
            [user.id, OPEN_STATUS]),
    ]);

    const stats = {};
    totals.rows.forEach(r => { stats[r.status] = { count: parseInt(r.count), total: parseFloat(r.total) }; });

    return ok(res, {
      stats,
      valorEmAberto: parseFloat(openVal.rows[0].valor),
      pendentesFollowUp: parseInt(followup.rows[0].count),
    });
  }

  return null;
}

module.exports = { handle };
