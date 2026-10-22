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
    const [num, usuarios, feedbacks, pulsos, sugestoes, pix, indic, pendentes, siteDias, siteOrig, saidas] = await Promise.all([
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
          (SELECT COUNT(*)::int FROM quotes q JOIN users x ON x.id = q.user_id WHERE lower(x.email) <> $1) AS orcamentos,
          (SELECT COUNT(*)::int FROM quotes q JOIN users x ON x.id = q.user_id WHERE lower(x.email) <> $1 AND q.created_at > NOW() - INTERVAL '7 days') AS orcamentos_7d,
          (SELECT COUNT(*)::int FROM push_inscricoes p JOIN users x ON x.id = p.user_id WHERE lower(x.email) <> $1) AS aparelhos_push
        FROM users WHERE lower(email) <> $1`, [ADMIN_EMAIL]),   // a conta do administrador (testes) não entra nos números
      query(`SELECT u.id, u.nome, u.email, u.nome_empresa, u.created_at, u.assinatura_status, u.trial_ate, u.acesso_ate,
                    u.preco_assinatura::float AS preco, u.fundador,
                    (SELECT COUNT(*)::int FROM quotes q WHERE q.user_id = u.id) AS orcamentos
               FROM users u ORDER BY u.created_at DESC LIMIT 200`),
      query(`SELECT f.id, f.nota, f.experiencia, f.gostando, f.melhorar, f.nao_gostou, f.falta, f.pagaria_4990, f.comentario_preco, f.created_at, u.nome, u.email
               FROM feedbacks f JOIN users u ON u.id = f.user_id WHERE lower(u.email) <> $1 ORDER BY f.created_at DESC LIMIT 30`, [ADMIN_EMAIL]),
      query(`SELECT p.id, p.nota, p.comentario, p.created_at, u.nome, u.email
               FROM pulso p JOIN users u ON u.id = p.user_id WHERE lower(u.email) <> $1 ORDER BY p.created_at DESC LIMIT 30`, [ADMIN_EMAIL]),
      query(`SELECT s.id, s.tipo, s.mensagem, s.created_at, u.nome, u.email
               FROM sugestoes s JOIN users u ON u.id = s.user_id WHERE lower(u.email) <> $1 ORDER BY s.created_at DESC LIMIT 50`, [ADMIN_EMAIL]),
      query(`SELECT x.id, x.valor::float AS valor, x.status, x.criado_em, x.aprovado_em, u.nome, u.email
               FROM pix_pagamentos x JOIN users u ON u.id = x.user_id WHERE lower(u.email) <> $1 ORDER BY x.criado_em DESC LIMIT 30`, [ADMIN_EMAIL]),
      // Indicações por código: parceiros (ex.: mellos) e usuários que trouxeram alguém
      query(`WITH cods AS (
               SELECT codigo, nome AS dono, 'parceiro' AS tipo FROM parceiros
               UNION ALL
               SELECT ref_codigo, nome, 'usuario' FROM users
                WHERE ref_codigo IS NOT NULL AND EXISTS (SELECT 1 FROM users x WHERE x.indicacao_codigo = users.ref_codigo)
             )
             SELECT c.codigo, c.dono, c.tipo,
                    (SELECT COUNT(*)::int FROM ref_visitas v WHERE v.codigo = c.codigo) AS visitas,
                    (SELECT COUNT(*)::int FROM users x WHERE x.indicacao_codigo = c.codigo) AS cadastros,
                    (SELECT COUNT(*)::int FROM users x WHERE x.indicacao_codigo = c.codigo
                       AND (x.assinatura_status = 'ativa' OR (x.assinatura_status = 'pix' AND x.acesso_ate > NOW()) OR x.indicacao_premiada)) AS pagantes
               FROM cods c ORDER BY cadastros DESC, visitas DESC LIMIT 100`),
      query(`SELECT id, nome, email, meses_gratis_pendentes AS meses FROM users WHERE meses_gratis_pendentes > 0 ORDER BY nome`),
      // Site: últimos 30 dias (visitantes únicos da página inicial, de quem abriu o cadastro e contas criadas)
      query(`WITH d AS (SELECT generate_series((NOW() AT TIME ZONE 'America/Sao_Paulo')::date - 29, (NOW() AT TIME ZONE 'America/Sao_Paulo')::date, '1 day')::date AS dia)
             SELECT d.dia,
               COALESCE((SELECT SUM(unicos) FROM site_visitas v WHERE v.dia = d.dia AND v.pagina = 'landing'),0)::int AS visitantes,
               COALESCE((SELECT SUM(unicos) FROM site_visitas v WHERE v.dia = d.dia AND v.pagina = 'cadastro'),0)::int AS abriu_cadastro,
               (SELECT COUNT(*)::int FROM users u WHERE (u.created_at AT TIME ZONE 'America/Sao_Paulo')::date = d.dia AND lower(u.email) <> $1) AS contas
             FROM d ORDER BY d.dia`, [ADMIN_EMAIL]),
      query(`SELECT origem, SUM(unicos)::int AS visitantes FROM site_visitas
              WHERE pagina = 'landing' AND dia > (NOW() AT TIME ZONE 'America/Sao_Paulo')::date - 30
              GROUP BY origem ORDER BY visitantes DESC LIMIT 10`),
      query(`SELECT x.id, x.tipo, x.motivo, x.comentario, x.avisar_melhoria, x.created_at, u.id AS user_id, u.nome, u.email, u.telefone
               FROM saidas x JOIN users u ON u.id = x.user_id WHERE lower(u.email) <> $1 ORDER BY x.created_at DESC LIMIT 100`, [ADMIN_EMAIL]),
    ]);
    return ok(res, {
      numeros: num.rows[0], usuarios: usuarios.rows, feedbacks: feedbacks.rows,
      pulsos: pulsos.rows, sugestoes: sugestoes.rows, pix: pix.rows, saidas: saidas.rows,
      indicacoes: indic.rows, mesesPendentes: pendentes.rows,
      site: { dias: siteDias.rows, origens: siteOrig.rows },
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

  // POST /api/admin/excluir { userId } — apaga a conta de um usuário (cancela o cartão no Mercado Pago antes)
  if (req.method === 'POST' && path === '/api/admin/excluir') {
    let b; try { b = await readBody(req, 2_000); } catch { return badRequest(res); }
    const id = Number(b.userId);
    if (!Number.isInteger(id) || id <= 0 || id === user.id) return badRequest(res, 'Não dá para excluir esta conta.');
    const r = await query('SELECT id, email, assinatura_status, mp_preapproval_id FROM users WHERE id = $1', [id]);
    const alvo = r.rows[0];
    if (!alvo) return json(res, 404, { error: 'Usuário não encontrado.' });
    if (String(alvo.email).toLowerCase() === ADMIN_EMAIL) return badRequest(res, 'Não dá para excluir a conta do administrador.');
    if (alvo.mp_preapproval_id && ['ativa', 'pausada', 'pendente'].includes(alvo.assinatura_status)) {
      const B = require('../lib/billing');
      if (B.mpConfigurado()) {
        const mp = await B.mpRequest('PUT', '/preapproval/' + encodeURIComponent(alvo.mp_preapproval_id), { status: 'cancelled' }).catch(() => ({ status: 0 }));
        if (mp.status !== 200 && alvo.assinatura_status === 'ativa') return json(res, 502, { error: 'Não consegui cancelar o cartão no Mercado Pago. Tente de novo.' });
      }
    }
    await query('DELETE FROM sessions WHERE user_id = $1', [id]);
    await query('DELETE FROM users WHERE id = $1', [id]);
    return ok(res, { ok: true });
  }

  // POST /api/admin/limpar-teste — apaga os dados de teste da conta do administrador e zera o contador de visitas
  if (req.method === 'POST' && path === '/api/admin/limpar-teste') {
    for (const t of ['quotes', 'clients', 'feedbacks', 'pulso', 'sugestoes', 'saidas', 'pix_pagamentos']) {
      await query(`DELETE FROM ${t} WHERE user_id = $1`, [user.id]);
    }
    await query(`UPDATE users SET nome_empresa = NULL, profissao = NULL, cidade = NULL, fundador = false,
                   feedback_adiado_ate = NULL, pulso_adiado_ate = NULL WHERE id = $1`, [user.id]);
    await query('DELETE FROM ref_visitas');
    await query('DELETE FROM site_visitas');
    return ok(res, { ok: true });
  }

  // POST /api/admin/parceiro { codigo, nome } — cria um link de parceiro (ex.: vunby.com.br/?ref=mellos)
  if (req.method === 'POST' && path === '/api/admin/parceiro') {
    let b; try { b = await readBody(req, 2_000); } catch { return badRequest(res); }
    const codigo = String(b.codigo || '').trim().toLowerCase();
    const nome = String(b.nome || '').trim().slice(0, 80);
    if (!/^[a-z0-9-]{3,24}$/.test(codigo) || nome.length < 2) return badRequest(res, 'Use só letras minúsculas, números ou hífen (3 a 24) e um nome.');
    const usado = await query('SELECT 1 FROM users WHERE ref_codigo = $1', [codigo]);
    if (usado.rows.length) return badRequest(res, 'Esse código já é de um usuário.');
    await query('INSERT INTO parceiros (codigo, nome) VALUES ($1,$2) ON CONFLICT (codigo) DO UPDATE SET nome = EXCLUDED.nome', [codigo, nome]);
    return ok(res, { ok: true });
  }

  // POST /api/admin/mes-abatido { userId } — marca 1 mês grátis (cartão) como já descontado
  if (req.method === 'POST' && path === '/api/admin/mes-abatido') {
    let b; try { b = await readBody(req, 2_000); } catch { return badRequest(res); }
    const id = Number(b.userId);
    if (!Number.isInteger(id) || id <= 0) return badRequest(res, 'Dados inválidos.');
    await query('UPDATE users SET meses_gratis_pendentes = GREATEST(meses_gratis_pendentes - 1, 0) WHERE id = $1', [id]);
    return ok(res, { ok: true });
  }

  return json(res, 404, { error: 'Rota não encontrada' });
}

module.exports = { handle, ehAdmin };
