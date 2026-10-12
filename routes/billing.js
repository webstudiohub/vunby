'use strict';
// Rotas de assinatura (/api/billing/...) e da pesquisa de opinião (/api/feedback/...)
const { query } = require('../lib/db');
const { requireAuth } = require('./auth');
const { json, ok, badRequest, conflict, readBody } = require('../lib/http');
const { rateLimit } = require('../lib/rateLimit');
const { BASE_URL } = require('../lib/config');
const B = require('../lib/billing');

const FEEDBACK_DIAS = 30;

function texto(v, max = 2000) {
  if (typeof v !== 'string') return null;
  const t = v.trim().slice(0, max);
  return t || null;
}

async function feedbackPendente(userId) {
  const r = await query(
    `SELECT 1 FROM users u
     WHERE u.id = $1 AND u.assinado_em IS NOT NULL
       AND u.assinado_em < NOW() - make_interval(days => $2)
       AND (u.feedback_adiado_ate IS NULL OR u.feedback_adiado_ate < NOW())
       AND NOT EXISTS (SELECT 1 FROM feedbacks f WHERE f.user_id = u.id)`,
    [userId, FEEDBACK_DIAS]
  );
  return r.rows.length > 0;
}

async function handle(req, res) {
  const url = new URL(req.url, 'http://x');
  const path = url.pathname;
  if (!path.startsWith('/api/billing') && !path.startsWith('/api/feedback')) return null;

  // ── Webhook do Mercado Pago (sem login). Nunca confia no corpo: relê a assinatura na API.
  if (path === '/api/billing/webhook') {
    if (req.method !== 'POST') return json(res, 405, { error: 'Método não permitido' });
    let body = {};
    try { body = await readBody(req, 20_000); } catch { body = {}; }
    const tipo = body.type || body.topic || url.searchParams.get('type') || url.searchParams.get('topic') || '';
    const id = (body.data && body.data.id) || url.searchParams.get('data.id') || url.searchParams.get('id');
    try {
      if (B.mpConfigurado() && id) {
        if (tipo === 'subscription_preapproval' || tipo === 'preapproval') {
          await B.sincronizarPreapproval(id);
        } else if (tipo === 'subscription_authorized_payment' || tipo === 'authorized_payment') {
          if (/^\d{1,30}$/.test(String(id))) {
            const r = await B.mpRequest('GET', '/authorized_payments/' + id);
            if (r.status === 200 && r.data.preapproval_id) await B.sincronizarPreapproval(r.data.preapproval_id);
          }
        }
      }
    } catch (e) { console.error('webhook MP:', e.message); }
    // Sempre 200 para o Mercado Pago não ficar reenviando
    return ok(res, { recebido: true });
  }

  const user = await requireAuth(req, res);
  if (!user) return true;

  // GET /api/billing/status
  if (req.method === 'GET' && path === '/api/billing/status') {
    const u = await B.getBillingUser(user.id);
    const s = B.situacao(u);
    const vagas = await B.vagasFundadorRestantes();
    const precoOferta = (u.fundador || vagas > 0) ? B.PRECO_FUNDADOR : B.PRECO_PADRAO;
    return ok(res, {
      ...s,
      fundador: !!u.fundador,
      precoAssinatura: u.preco_assinatura != null ? Number(u.preco_assinatura) : null,
      precoPadrao: B.PRECO_PADRAO,
      precoFundador: B.PRECO_FUNDADOR,
      precoOferta,
      vagasFundador: vagas,
      pagamentoConfigurado: B.mpConfigurado(),
      feedbackPendente: await feedbackPendente(user.id),
    });
  }

  // POST /api/billing/checkout — cria a assinatura no Mercado Pago e devolve o link de pagamento
  if (req.method === 'POST' && path === '/api/billing/checkout') {
    if (!B.mpConfigurado()) return json(res, 503, { error: 'O pagamento ainda está sendo configurado. Tente de novo mais tarde.' });
    if (!(await rateLimit('checkout:' + user.id, 5, 10 * 60_000))) return json(res, 429, { error: 'Muitas tentativas. Aguarde alguns minutos.' });
    const u = await B.getBillingUser(user.id);
    if (u.assinatura_status === 'ativa' || u.assinatura_status === 'cortesia') return conflict(res, 'Sua assinatura já está ativa.');
    const vagas = await B.vagasFundadorRestantes();
    const fundador = u.fundador || vagas > 0;
    const valor = fundador ? B.PRECO_FUNDADOR : B.PRECO_PADRAO;
    const r = await B.mpRequest('POST', '/preapproval', {
      reason: fundador ? 'VUNBY — Plano Fundador' : 'VUNBY — Assinatura mensal',
      external_reference: String(user.id),
      payer_email: u.email,
      back_url: BASE_URL.replace(/\/$/, '') + '/planos.html?retorno=1',
      status: 'pending',
      auto_recurring: { frequency: 1, frequency_type: 'months', transaction_amount: valor, currency_id: 'BRL' },
    }).catch(e => ({ status: 0, data: { message: e.message } }));
    if ((r.status !== 200 && r.status !== 201) || !r.data.init_point) {
      console.error('MP POST preapproval', r.status, JSON.stringify(r.data).slice(0, 500));
      return json(res, 502, { error: 'Não foi possível abrir o pagamento agora. Tente novamente em instantes.' });
    }
    await query(
      `UPDATE users SET mp_preapproval_id = $2,
         assinatura_status = CASE WHEN assinatura_status IN ('nenhuma','pendente') THEN 'pendente' ELSE assinatura_status END
       WHERE id = $1`,
      [user.id, r.data.id]
    );
    return ok(res, { url: r.data.init_point, valor, fundador });
  }

  // POST /api/billing/sync — chamado na volta do pagamento (não depende só do webhook)
  if (req.method === 'POST' && path === '/api/billing/sync') {
    const u = await B.getBillingUser(user.id);
    if (B.mpConfigurado() && u.mp_preapproval_id) {
      if (await rateLimit('sync:' + user.id, 20, 10 * 60_000)) {
        await B.sincronizarPreapproval(u.mp_preapproval_id).catch(e => console.error('sync MP:', e.message));
      }
    }
    const u2 = await B.getBillingUser(user.id);
    return ok(res, B.situacao(u2));
  }

  // POST /api/billing/cancel — cancelar em 1 clique; o acesso continua até o fim do mês pago
  if (req.method === 'POST' && path === '/api/billing/cancel') {
    const u = await B.getBillingUser(user.id);
    if (u.assinatura_status !== 'ativa' && u.assinatura_status !== 'pausada') return badRequest(res, 'Não há assinatura ativa para cancelar.');
    if (!B.mpConfigurado() || !u.mp_preapproval_id) return json(res, 503, { error: 'Não foi possível cancelar agora. Fale com o suporte.' });
    const r = await B.mpRequest('PUT', '/preapproval/' + encodeURIComponent(u.mp_preapproval_id), { status: 'cancelled' })
      .catch(e => ({ status: 0, data: { message: e.message } }));
    if (r.status !== 200) {
      console.error('MP cancel', r.status, JSON.stringify(r.data).slice(0, 300));
      return json(res, 502, { error: 'Não foi possível cancelar agora. Tente novamente em instantes.' });
    }
    await B.aplicarPreapproval(r.data);
    const u2 = await B.getBillingUser(user.id);
    return ok(res, B.situacao(u2));
  }

  // POST /api/feedback — respostas da pesquisa de opinião
  if (req.method === 'POST' && path === '/api/feedback') {
    if (!(await rateLimit('feedback:' + user.id, 5, 60 * 60_000))) return json(res, 429, { error: 'Muitas tentativas. Tente mais tarde.' });
    let b; try { b = await readBody(req, 30_000); } catch { return badRequest(res); }
    const nota = parseInt(b.nota, 10);
    if (!(nota >= 0 && nota <= 10)) return badRequest(res, 'Escolha uma nota de 0 a 10.');
    const pagaria = ['sim', 'talvez', 'nao'].includes(b.pagaria) ? b.pagaria : null;
    if (!pagaria) return badRequest(res, 'Responda se pagaria R$49,90.');
    await query(
      `INSERT INTO feedbacks (user_id, nota, experiencia, gostando, melhorar, nao_gostou, falta, pagaria_4990, comentario_preco)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [user.id, nota, texto(b.experiencia), texto(b.gostando), texto(b.melhorar), texto(b.naoGostou), texto(b.falta), pagaria, texto(b.comentarioPreco, 500)]
    );
    return ok(res, { obrigado: true });
  }

  // POST /api/feedback/adiar — "responder depois" (volta a aparecer em 3 dias)
  if (req.method === 'POST' && path === '/api/feedback/adiar') {
    await query(`UPDATE users SET feedback_adiado_ate = NOW() + INTERVAL '3 days' WHERE id = $1`, [user.id]);
    return ok(res, {});
  }

  return null;
}

// ── Tarefas periódicas: e-mail de "teste acabou" e convite da pesquisa de opinião ──
async function rodarTarefas(sendEmail) {
  const base = BASE_URL.replace(/\/$/, '');
  const btn = (href, txt) => `<a href="${href}" style="display:inline-block;background:#6C47FF;color:white;padding:12px 24px;border-radius:6px;text-decoration:none;margin:16px 0">${txt}</a>`;

  // 1) Teste grátis acabou (um e-mail por pessoa)
  const exp = await query(
    `SELECT id, email, nome FROM users
     WHERE email_verificado = true AND trial_aviso_em IS NULL AND trial_ate < NOW()
       AND assinatura_status IN ('nenhuma','pendente') AND (acesso_ate IS NULL OR acesso_ate < NOW())
     LIMIT 50`
  );
  for (const u of exp.rows) {
    await query('UPDATE users SET trial_aviso_em = NOW() WHERE id = $1', [u.id]);
    const nome = String(u.nome || '').split(' ')[0].replace(/[<>&"]/g, '');
    await sendEmail({
      to: u.email,
      subject: 'Seu teste grátis do VUNBY terminou',
      html: `<div style="font-family:Arial,sans-serif;max-width:480px"><h2 style="color:#6C47FF">VUNBY</h2><p>Olá, ${nome}!</p><p>Seus 14 dias de teste grátis terminaram. Seus orçamentos continuam salvos e você pode vê-los quando quiser.</p><p>Para continuar criando orçamentos, assine o VUNBY. Os 100 primeiros assinantes pagam <b>R$29,90/mês para sempre</b> (preço normal R$49,90).</p>${btn(base + '/planos.html', 'Ver planos')}<p style="color:#888;font-size:12px">Cancele quando quiser, em 1 clique.</p></div>`,
    });
  }

  // 2) Pesquisa de opinião 30 dias depois de assinar
  const fb = await query(
    `SELECT u.id, u.email, u.nome FROM users u
     WHERE u.assinado_em IS NOT NULL AND u.assinado_em < NOW() - make_interval(days => $1)
       AND u.feedback_email_em IS NULL
       AND NOT EXISTS (SELECT 1 FROM feedbacks f WHERE f.user_id = u.id)
     LIMIT 50`,
    [FEEDBACK_DIAS]
  );
  for (const u of fb.rows) {
    await query('UPDATE users SET feedback_email_em = NOW() WHERE id = $1', [u.id]);
    const nome = String(u.nome || '').split(' ')[0].replace(/[<>&"]/g, '');
    await sendEmail({
      to: u.email,
      subject: 'Como está sendo o VUNBY para você?',
      html: `<div style="font-family:Arial,sans-serif;max-width:480px"><h2 style="color:#6C47FF">VUNBY</h2><p>Olá, ${nome}!</p><p>Você é um dos fundadores do VUNBY e faz 1 mês que está com a gente. Queremos saber a sua opinião de verdade: o que está bom, o que não está e o que falta.</p><p>São perguntas rápidas (2 minutos).</p>${btn(base + '/opiniao.html', 'Dar minha opinião')}<p>Obrigado por construir o VUNBY com a gente.</p></div>`,
    });
  }
}

module.exports = { handle, rodarTarefas };
