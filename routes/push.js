'use strict';
// Inscrições de notificação push (/api/push/...)
const { query } = require('../lib/db');
const { requireAuth } = require('./auth');
const { json, ok, badRequest, readBody } = require('../lib/http');
const { rateLimit } = require('../lib/rateLimit');
const P = require('../lib/push');

async function handle(req, res) {
  const url = new URL(req.url, 'http://x');
  const path = url.pathname;
  if (!path.startsWith('/api/push')) return null;
  const user = await requireAuth(req, res);
  if (!user) return true;

  // GET /api/push/status — chave pública + quantos aparelhos deste usuário já estão inscritos
  if (req.method === 'GET' && path === '/api/push/status') {
    const r = await query('SELECT COUNT(*)::int AS n FROM push_inscricoes WHERE user_id = $1', [user.id]);
    return ok(res, { disponivel: P.configurado(), chave: P.chavePublica(), aparelhos: r.rows[0].n });
  }

  // POST /api/push/inscrever { endpoint, keys: { p256dh, auth } }
  if (req.method === 'POST' && path === '/api/push/inscrever') {
    if (!P.configurado()) return json(res, 503, { error: 'Notificações ainda não estão disponíveis.' });
    if (!(await rateLimit('pushins:' + user.id, 20, 60 * 60_000))) return json(res, 429, { error: 'Muitas tentativas.' });
    let b; try { b = await readBody(req, 5_000); } catch { return badRequest(res); }
    const endpoint = String(b.endpoint || '');
    const k = b.keys || {};
    if (!/^https:\/\/[^\s]{10,1000}$/.test(endpoint) || !/^[A-Za-z0-9_-]{20,200}$/.test(String(k.p256dh || '')) || !/^[A-Za-z0-9_-]{8,100}$/.test(String(k.auth || ''))) return badRequest(res, 'Inscrição inválida.');
    const n = await query('SELECT COUNT(*)::int AS n FROM push_inscricoes WHERE user_id = $1 AND endpoint <> $2', [user.id, endpoint]);
    if (n.rows[0].n >= 10) return badRequest(res, 'Limite de aparelhos atingido.');
    await query(
      `INSERT INTO push_inscricoes (user_id, endpoint, p256dh, auth) VALUES ($1,$2,$3,$4)
       ON CONFLICT (endpoint) DO UPDATE SET user_id = EXCLUDED.user_id, p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth`,
      [user.id, endpoint, k.p256dh, k.auth]
    );
    return ok(res, { inscrito: true });
  }

  // POST /api/push/cancelar { endpoint }
  if (req.method === 'POST' && path === '/api/push/cancelar') {
    let b; try { b = await readBody(req, 5_000); } catch { return badRequest(res); }
    await query('DELETE FROM push_inscricoes WHERE user_id = $1 AND endpoint = $2', [user.id, String(b.endpoint || '')]);
    return ok(res, {});
  }

  // POST /api/push/teste — manda uma notificação de teste para os aparelhos do próprio usuário
  if (req.method === 'POST' && path === '/api/push/teste') {
    if (!(await rateLimit('pushteste:' + user.id, 5, 10 * 60_000))) return json(res, 429, { error: 'Aguarde alguns minutos.' });
    const r = await P.notificar(user.id, { titulo: 'VUNBY: notificações ativadas', texto: 'Pronto! Você vai ser avisado quando um cliente abrir seu orçamento.', url: '/dashboard.html', tag: 'teste' });
    return ok(res, r);
  }

  return null;
}

module.exports = { handle };
