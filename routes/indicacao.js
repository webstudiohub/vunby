'use strict';
// Indique e ganhe: /api/indicacao (meu link e números) e /api/ref/visita (contagem de cliques no link, público)
const { query } = require('../lib/db');
const { requireAuth } = require('./auth');
const { json, ok, badRequest, readBody } = require('../lib/http');
const { rateLimit } = require('../lib/rateLimit');
const { BASE_URL } = require('../lib/config');
const IND = require('../lib/indicacao');

function ipDe(req) {
  return String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
}

async function handle(req, res) {
  const path = new URL(req.url, 'http://x').pathname;

  // POST /api/ref/visita { codigo } — alguém abriu o site por um link de indicação
  if (req.method === 'POST' && path === '/api/ref/visita') {
    let b; try { b = await readBody(req, 1_000); } catch { return badRequest(res); }
    const r = await IND.resolver(b.codigo).catch(() => null);
    if (!r) return ok(res, { valido: false });
    if (await rateLimit('refvis:' + ipDe(req) + ':' + r.codigo, 1, 6 * 60 * 60_000)) {
      await query('INSERT INTO ref_visitas (codigo) VALUES ($1)', [r.codigo]);
    }
    return ok(res, { valido: true, bonusDias: IND.BONUS_INDICADO_DIAS });
  }

  if (!path.startsWith('/api/indicacao')) return null;
  const user = await requireAuth(req, res);
  if (!user) return true;

  // GET /api/indicacao — link e resultados de quem está indicando
  if (req.method === 'GET' && path === '/api/indicacao') {
    const codigo = await IND.codigoDoUsuario(user.id);
    const n = await query(
      `SELECT COUNT(*)::int AS cadastros, COUNT(*) FILTER (WHERE indicacao_premiada)::int AS pagantes
         FROM users WHERE indicado_por = $1`, [user.id]);
    const base = String(BASE_URL || 'https://vunby.com.br').replace(/\/$/, '');
    return ok(res, {
      codigo, link: base + '/?ref=' + codigo,
      cadastros: n.rows[0].cadastros, pagantes: n.rows[0].pagantes, mesesGanhos: n.rows[0].pagantes,
      bonusDias: IND.BONUS_INDICADO_DIAS,
    });
  }
  return json(res, 404, { error: 'Rota não encontrada' });
}

module.exports = { handle };
