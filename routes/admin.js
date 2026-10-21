'use strict';
// Painel de administrador (/api/admin/...) — só o e-mail do dono (ADMIN_EMAIL) entra
const { query } = require('../lib/db');
const { requireAuth } = require('./auth');
const { json, ok, badRequest, forbidden, readBody } = require('../lib/http');
const { rateLimit } = require('../lib/rateLimit');

const ADMIN_EMAIL = String(process.env.ADMIN_EMAIL || 'adiminvunby@gmail.com').trim().toLowerCase();

function ehAdmin(u) {
  return !!u && String(u.email || '').trim().toLowerCase() === ADMIN_EMAIL && u.email_verificado !== false;
}

async function handle(req, res) {
  const path = new URL(req.url, 'http://x').pathname;
  if (!path.startsWith('/api/admin')) return null;
  const user = await requireAuth(req, res);
  if (!user) return true;
  if (!ehAdmin(user)) return json(res, 403, { error: 'Acesso negado.' });
  if (!(await rateLimit('admin:' + user.id, 120, 60_000))) return json(res, 429, { error: 'Muitas requisições.' });

  // GET /api/admin/resumo — números, usuários, opiniões, sugestões e pagamentos
  if (req.method === 'GET' && path === '/api/admin/resumo') {
    const [num, usuarios, feedbacks, pulsos, sugestoes, pix] = await Promise.all([
      query(`SELECT
          COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days')::int AS novos_7d,
          COUNT(*) FILTER (WHERE assinatura_status = 'ativa')::int AS cartao,
          COUNT(*) FILTER (WHERE assinatura_status = 'pix' AND acesso_ate > NOW())::int AS pix,
          COUNT(*) FILTER (WHERE assinatura_status = 'cortesia')::int AS cortesia,
          COUNT(*) FILTER (WHERE assinatura_status IN ('nenhuma','pendente') AND trial_ate > NOW())::int AS em_teste,
          COUNT(*) FILTER (WHERE assinatura_status IN ('nenhuma','pendente','cancelada','pausada') AND COALESCE(acesso_ate, trial_ate) <= NOW())::int AS vencidos,
          COUNT(*) FILTER (WHERE assinatura_status = 'pix' AND acesso_ate BETWEEN NOW() AND NOW() + INTERVAL '3 days')::int AS vencendo,
          COALESCE(SUM(preco_assinatura) FILTER (WHERE assinatura_status = 'ativa' OR (assinatura_status = 'pix' AND acesso_ate > NOW())),0)::float AS receita_mensal,
          (SELECT COUNT(*)::int FROM quotes) AS orcamentos,
          (SELECT COUNT(*)::int FROM quotes WHERE created_at > NOW() - INTERVAL '7 days') AS orcamentos_7d,
          (SELECT COUNT(*)::int FROM push_inscricoes) AS aparelhos_push
        FROM users`),
      query(`SELECT u.id, u.nome, u.email, u.nome_empresa, u.created_at, u.assinatura_status, u.trial_ate, u.acesso_ate,
                    u.preco_assinatura::float AS preco, u.fundador,
                    (SELECT COUNT(*)::int FROM quotes q WHERE q.user_id = u.id) AS orcamentos
               FROM users u ORDER BY u.created_at DESC LIMIT 200`),
      query(`SELECT f.id, f.nota, f.experiencia, f.gostando, f.melhorar, f.nao_gostou, f.falta, f.pagaria_4990, f.comentario_preco, f.created_at, u.nome, u.email
               FROM feedbacks f JOIN users u ON u.id = f.user_id ORDER BY f.created_at DESC LIMIT 30`),
      query(`SELECT p.id, p.nota, p.comentario, p.created_at, u.nome, u.email
               FROM pulso p JOIN users u ON u.id = p.user_id ORDER BY p.created_at DESC LIMIT 30`),
      query(`SELECT s.id, s.tipo, s.mensagem, s.created_at, u.nome, u.email
               FROM sugestoes s JOIN users u ON u.id = s.user_id ORDER BY s.created_at DESC LIMIT 50`),
      query(`SELECT x.id, x.valor::float AS valor, x.status, x.criado_em, x.aprovado_em, u.nome, u.email
               FROM pix_pagamentos x JOIN users u ON u.id = x.user_id ORDER BY x.criado_em DESC LIMIT 30`),
    ]);
    return ok(res, {
      numeros: num.rows[0], usuarios: usuarios.rows, feedbacks: feedbacks.rows,
      pulsos: pulsos.rows, sugestoes: sugestoes.rows, pix: pix.rows,
    });
  }

  // POST /api/admin/acesso { userId, dias } — soma dias de acesso (cortesia curta, compensação etc.)
  if (req.method === 'POST' && path === '/api/admin/acesso') {
    let b; try { b = await readBody(req, 2_000); } catch { return badRequest(res); }
    const id = Number(b.userId), dias = Number(b.dias);
    if (!Number.isInteger(id) || id <= 0 || !Number.isInteger(dias) || dias < 1 || dias > 365) return badRequest(res, 'Dados inválidos.');
    const r = await query(
      `UPDATE users SET acesso_ate = GREATEST(COALESCE(acesso_ate, NOW()), NOW()) + make_interval(days => $2::int),
              assinatura_status = CASE WHEN assinatura_status IN ('nenhuma','pendente','cancelada','pausada') THEN 'pix' ELSE assinatura_status END,
              updated_at = NOW()
        WHERE id = $1 RETURNING id, acesso_ate`, [id, dias]);
    if (!r.rows[0]) return json(res, 404, { error: 'Usuário não encontrado.' });
    return ok(res, { acessoAte: r.rows[0].acesso_ate });
  }

  // POST /api/admin/cortesia { userId, ativo } — liga/desliga acesso grátis sem prazo
  if (req.method === 'POST' && path === '/api/admin/cortesia') {
    let b; try { b = await readBody(req, 2_000); } catch { return badRequest(res); }
    const id = Number(b.userId);
    if (!Number.isInteger(id) || id <= 0) return badRequest(res, 'Dados inválidos.');
    const r = b.ativo
      ? await query(`UPDATE users SET assinatura_status = 'cortesia', updated_at = NOW() WHERE id = $1 AND assinatura_status NOT IN ('ativa') RETURNING id`, [id])
      : await query(`UPDATE users SET assinatura_status = 'nenhuma', updated_at = NOW() WHERE id = $1 AND assinatura_status = 'cortesia' RETURNING id`, [id]);
    if (!r.rows[0]) return badRequest(res, 'Não foi possível alterar (cartão ativo ou usuário inexistente).');
    return ok(res, { ok: true });
  }

  return json(res, 404, { error: 'Rota não encontrada' });
}

module.exports = { handle, ehAdmin };
