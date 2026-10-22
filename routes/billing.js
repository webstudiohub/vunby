'use strict';
// Rotas de assinatura (/api/billing/...) e da pesquisa de opinião (/api/feedback/...)
const { query } = require('../lib/db');
const { requireAuth } = require('./auth');
const { json, ok, badRequest, conflict, readBody } = require('../lib/http');
const { rateLimit } = require('../lib/rateLimit');
const { BASE_URL } = require('../lib/config');
const B = require('../lib/billing');
const E = require('../lib/email');
const PUSH = require('../lib/push');

const PULSO_DIAS = 90;          // pesquisa curta a cada 3 meses
const NOTA_BAIXA = 6;           // nota até 6 avisa o fundador na hora
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'adiminvunby@gmail.com';

// Avisa o fundador (e-mail) para ele chamar o cliente no WhatsApp
async function avisarAdmin(assunto, linhas) {
  const corpo = linhas.map(l => E.p(l)).join('');
  return E.sendEmail({ to: ADMIN_EMAIL, subject: assunto, html: E.layout({ preheader: assunto, titulo: E.escHtml(assunto), corpo }) }).catch(() => ({ ok: false }));
}
async function dadosCliente(userId) {
  const r = await query('SELECT nome, email, telefone FROM users WHERE id = $1', [userId]);
  const u = r.rows[0] || {};
  return `<strong>${E.escHtml(u.nome || '(sem nome)')}</strong> · ${E.escHtml(u.email || '')}${u.telefone ? ' · ' + E.escHtml(u.telefone) : ''}`;
}

// Pesquisa curta: só depois que a completa foi respondida, e a cada 90 dias desde a última resposta
async function pulsoPendente(userId) {
  const r = await query(
    `SELECT 1 FROM users u
     WHERE u.id = $1 AND u.assinado_em IS NOT NULL
       AND (u.pulso_adiado_ate IS NULL OR u.pulso_adiado_ate < NOW())
       AND EXISTS (SELECT 1 FROM feedbacks f WHERE f.user_id = u.id)
       AND GREATEST(
             COALESCE((SELECT MAX(created_at) FROM feedbacks WHERE user_id = u.id), 'epoch'),
             COALESCE((SELECT MAX(created_at) FROM pulso WHERE user_id = u.id), 'epoch')
           ) < NOW() - make_interval(days => $2::int)`,
    [userId, PULSO_DIAS]
  );
  return r.rows.length > 0;
}

const FEEDBACK_DIAS = 20;

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
        } else if (tipo === 'payment') {
          await B.sincronizarPagamento(id);
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
    const precoOferta = B.valorPara(u, u.fundador || vagas > 0);
    return ok(res, {
      ...s,
      fundador: !!u.fundador,
      precoAssinatura: u.preco_assinatura != null ? Number(u.preco_assinatura) : null,
      precoPadrao: B.PRECO_PADRAO,
      precoFundador: B.PRECO_FUNDADOR,
      precoOferta,
      vagasFundador: vagas,
      pagamentoConfigurado: B.mpConfigurado(),
      mpPublicKey: B.mpConfigurado() ? (process.env.MP_PUBLIC_KEY || null) : null,
      feedbackPendente: await feedbackPendente(user.id),
      pulsoPendente: await pulsoPendente(user.id),
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
    const valor = B.valorPara(u, fundador);
    const r = await B.mpRequest('POST', '/preapproval', {
      reason: fundador ? 'VUNBY — Plano Fundador' : 'VUNBY — Assinatura mensal',
      external_reference: String(user.id),
      payer_email: u.email,
      back_url: BASE_URL.replace(/\/$/, '') + '/planos.html?retorno=1',
      status: 'pending',
      auto_recurring: { frequency: 1, frequency_type: 'months', transaction_amount: valor, currency_id: 'BRL', ...inicioCobranca(u) },
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

  // POST /api/billing/cartao — assinatura no cartão sem sair do VUNBY.
  // O formulário do Mercado Pago (na página) transforma o cartão em um "token"; o número do cartão nunca passa pelo VUNBY.
  if (req.method === 'POST' && path === '/api/billing/cartao') {
    if (!B.mpConfigurado()) return json(res, 503, { error: 'O pagamento ainda está sendo configurado. Tente de novo mais tarde.' });
    if (!(await rateLimit('cartao:' + user.id, 6, 10 * 60_000))) return json(res, 429, { error: 'Muitas tentativas. Aguarde alguns minutos.' });
    let b; try { b = await readBody(req, 10_000); } catch { return badRequest(res); }
    const token = String(b.token || '');
    if (!/^[A-Za-z0-9_-]{8,128}$/.test(token)) return badRequest(res, 'Confira os dados do cartão e tente de novo.');
    const u = await B.getBillingUser(user.id);
    if (u.assinatura_status === 'ativa' || u.assinatura_status === 'cortesia') return conflict(res, 'Sua assinatura já está ativa.');
    const vagas = await B.vagasFundadorRestantes();
    const fundador = u.fundador || vagas > 0;
    const valor = B.valorPara(u, fundador);
    const r = await B.mpRequest('POST', '/preapproval', {
      reason: fundador ? 'VUNBY — Plano Fundador' : 'VUNBY — Assinatura mensal',
      external_reference: String(user.id),
      payer_email: u.email,
      card_token_id: token,
      back_url: BASE_URL.replace(/\/$/, '') + '/planos.html',
      status: 'authorized',
      auto_recurring: { frequency: 1, frequency_type: 'months', transaction_amount: valor, currency_id: 'BRL', ...inicioCobranca(u) },
    }).catch(e => ({ status: 0, data: { message: e.message } }));
    if ((r.status !== 200 && r.status !== 201) || !r.data.id) {
      console.error('MP POST preapproval cartão', r.status, JSON.stringify(r.data).slice(0, 500));
      dadosCliente(user.id).then(quem => avisarAdmin('Cartão recusado no VUNBY', [quem, 'Valor: R$ ' + valor, 'Resposta do Mercado Pago: ' + E.escHtml(String((r.data && r.data.message) || r.status)), 'Chame o cliente no WhatsApp e ofereça o Pix. Mande este e-mail para o JARVIS analisar.'])).catch(() => {});
      const m = String((r.data && r.data.message) || '');
      const erro = /same user/i.test(m) ? 'Este e-mail é o mesmo da conta que recebe os pagamentos. Use outra conta para assinar.'
        : /card|token|rejected|invalid/i.test(m) ? 'O cartão não foi aceito pelo banco. Confira os dados, tente outro cartão ou pague com Pix.'
        : 'Não foi possível concluir o pagamento agora. Tente novamente em instantes.';
      return json(res, 400, { error: erro });
    }
    await query('UPDATE users SET mp_preapproval_id = $2 WHERE id = $1', [user.id, r.data.id]);
    await B.aplicarPreapproval(r.data);
    const u2 = await B.getBillingUser(user.id);
    const s = B.situacao(u2);
    if (s.tipo !== 'ativa') return json(res, 400, { error: 'O cartão não foi aprovado. Confira os dados ou use outro cartão.' });
    return ok(res, s);
  }

  // POST /api/billing/pix — gera o QR Code do Pix (30 dias de acesso), mostrado na própria página
  if (req.method === 'POST' && path === '/api/billing/pix') {
    if (!B.mpConfigurado()) return json(res, 503, { error: 'O pagamento ainda está sendo configurado. Tente de novo mais tarde.' });
    if (!(await rateLimit('pix:' + user.id, 6, 10 * 60_000))) return json(res, 429, { error: 'Muitas tentativas. Aguarde alguns minutos.' });
    const u = await B.getBillingUser(user.id);
    if (u.assinatura_status === 'ativa' || u.assinatura_status === 'cortesia') return conflict(res, 'Sua assinatura já está ativa no cartão.');
    const vagas = await B.vagasFundadorRestantes();
    const fundador = u.fundador || vagas > 0;
    const valor = B.valorPara(u, fundador);
    // Vence em 30 minutos (horário de Brasília)
    const exp = new Date(Date.now() + 30 * 60_000 - 3 * 3600_000).toISOString().replace('Z', '-03:00');
    const nome = String(u.nome || '').trim().split(/\s+/);
    const r = await B.mpRequest('POST', '/v1/payments', {
      transaction_amount: valor,
      description: fundador ? 'VUNBY — Plano Fundador (30 dias)' : 'VUNBY — Assinatura (30 dias)',
      payment_method_id: 'pix',
      external_reference: 'pix:' + user.id,
      notification_url: BASE_URL.replace(/\/$/, '') + '/api/billing/webhook',
      date_of_expiration: exp,
      payer: { email: u.email, first_name: nome[0] || undefined, last_name: nome.slice(1).join(' ') || undefined },
    }, { 'X-Idempotency-Key': require('crypto').randomUUID() }).catch(e => ({ status: 0, data: { message: e.message } }));
    const tx = r.data && r.data.point_of_interaction && r.data.point_of_interaction.transaction_data;
    if ((r.status !== 200 && r.status !== 201) || !tx || !tx.qr_code) {
      console.error('MP POST payment pix', r.status, JSON.stringify(r.data).slice(0, 500));
      const m = String((r.data && r.data.message) || '');
      return json(res, 502, { error: /same user|collector/i.test(m) ? 'Este e-mail é o mesmo da conta que recebe os pagamentos. Use outra conta para assinar.' : 'Não foi possível gerar o Pix agora. Tente novamente em instantes.' });
    }
    await query('INSERT INTO pix_pagamentos (id, user_id, valor, status) VALUES ($1,$2,$3,$4) ON CONFLICT (id) DO NOTHING',
      [String(r.data.id), user.id, valor, String(r.data.status || 'pending').slice(0, 30)]);
    return ok(res, { id: String(r.data.id), qrCode: tx.qr_code, qrBase64: tx.qr_code_base64 || null, valor, expira: r.data.date_of_expiration || null });
  }

  // GET /api/billing/pix/:id — a página pergunta se o Pix já foi pago
  const mPix = path.match(/^\/api\/billing\/pix\/(\d{1,30})$/);
  if (req.method === 'GET' && mPix) {
    const row = await query('SELECT status, creditado FROM pix_pagamentos WHERE id = $1 AND user_id = $2', [mPix[1], user.id]);
    if (!row.rows.length) return json(res, 404, { error: 'Pagamento não encontrado.' });
    if (!row.rows[0].creditado && B.mpConfigurado() && (await rateLimit('pixst:' + user.id, 60, 10 * 60_000))) {
      await B.sincronizarPagamento(mPix[1]).catch(e => console.error('pix status:', e.message));
    }
    const row2 = await query('SELECT status, creditado FROM pix_pagamentos WHERE id = $1', [mPix[1]]);
    const u2 = await B.getBillingUser(user.id);
    return ok(res, { pago: !!row2.rows[0].creditado, status: row2.rows[0].status, situacao: B.situacao(u2) });
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
    if (nota <= NOTA_BAIXA) {
      const quem = await dadosCliente(user.id);
      avisarAdmin(`Nota ${nota} no VUNBY: chame esse cliente`, [quem, `Nota: <strong>${nota}</strong>. Não gostou: ${E.escHtml(texto(b.naoGostou) || '-')}. Melhorar: ${E.escHtml(texto(b.melhorar) || '-')}.`]);
    }
    return ok(res, { obrigado: true });
  }

  // POST /api/feedback/pulso — pesquisa curta (nota + comentário opcional)
  if (req.method === 'POST' && path === '/api/feedback/pulso') {
    if (!(await rateLimit('pulso:' + user.id, 5, 60 * 60_000))) return json(res, 429, { error: 'Muitas tentativas. Tente mais tarde.' });
    let b; try { b = await readBody(req, 10_000); } catch { return badRequest(res); }
    const nota = parseInt(b.nota, 10);
    if (!(nota >= 0 && nota <= 10)) return badRequest(res, 'Escolha uma nota de 0 a 10.');
    const comentario = texto(b.comentario, 1000);
    await query('INSERT INTO pulso (user_id, nota, comentario) VALUES ($1,$2,$3)', [user.id, nota, comentario]);
    if (nota <= NOTA_BAIXA) {
      const quem = await dadosCliente(user.id);
      avisarAdmin(`Nota ${nota} no VUNBY: chame esse cliente`, [quem, `Nota: <strong>${nota}</strong>. Comentário: ${E.escHtml(comentario || '-')}.`]);
    }
    return ok(res, { obrigado: true });
  }

  // POST /api/feedback/pulso/adiar
  if (req.method === 'POST' && path === '/api/feedback/pulso/adiar') {
    await query(`UPDATE users SET pulso_adiado_ate = NOW() + INTERVAL '7 days' WHERE id = $1`, [user.id]);
    return ok(res, {});
  }

  // POST /api/feedback/sugestao — sugestão livre, a qualquer momento (botão na Conta)
  if (req.method === 'POST' && path === '/api/feedback/sugestao') {
    if (!(await rateLimit('sugestao:' + user.id, 8, 60 * 60_000))) return json(res, 429, { error: 'Muitas mensagens. Tente mais tarde.' });
    let b; try { b = await readBody(req, 10_000); } catch { return badRequest(res); }
    const mensagem = texto(b.mensagem, 2000);
    if (!mensagem || mensagem.length < 5) return badRequest(res, 'Escreva sua sugestão (mínimo 5 letras).');
    const tipo = ['ideia', 'problema', 'elogio'].includes(b.tipo) ? b.tipo : 'ideia';
    await query('INSERT INTO sugestoes (user_id, tipo, mensagem) VALUES ($1,$2,$3)', [user.id, tipo, mensagem]);
    const quem = await dadosCliente(user.id);
    avisarAdmin(`Nova ${tipo === 'problema' ? 'reclamação' : tipo === 'elogio' ? 'mensagem' : 'sugestão'} no VUNBY`, [quem, E.escHtml(mensagem)]);
    return ok(res, { obrigado: true });
  }

  // POST /api/feedback/saida — por que a pessoa saiu (cancelou, não assinou depois do teste, não renovou o Pix)
  if (req.method === 'POST' && path === '/api/feedback/saida') {
    if (!(await rateLimit('saida:' + user.id, 5, 60 * 60_000))) return json(res, 429, { error: 'Muitas tentativas. Tente mais tarde.' });
    let b; try { b = await readBody(req, 10_000); } catch { return badRequest(res); }
    const MOTIVOS = { caro: 'Achei caro', pouco_uso: 'Usei pouco / não tive tempo', dificil: 'Achei difícil de usar', faltou: 'Faltou algo que eu precisava', outro_app: 'Vou usar outro app', parei: 'Parei de trabalhar / mudei de área', problema: 'Tive problema técnico', outro: 'Outro motivo' };
    if (!MOTIVOS[b.motivo]) return badRequest(res, 'Escolha um motivo.');
    const tipo = ['cancelou', 'nao_assinou', 'nao_renovou'].includes(b.tipo) ? b.tipo : 'cancelou';
    const comentario = texto(b.comentario, 2000);
    const avisar = b.avisar !== false;
    await query('INSERT INTO saidas (user_id, tipo, motivo, comentario, avisar_melhoria) VALUES ($1,$2,$3,$4,$5)', [user.id, tipo, b.motivo, comentario || null, avisar]);
    const quem = await dadosCliente(user.id);
    const rot = { cancelou: 'cancelou a assinatura', nao_assinou: 'não assinou depois do teste', nao_renovou: 'não renovou o Pix' }[tipo];
    avisarAdmin(`Saída: cliente ${rot}`, [quem, '<strong>Motivo:</strong> ' + E.escHtml(MOTIVOS[b.motivo]), comentario ? '<strong>Comentário:</strong> ' + E.escHtml(comentario) : '', avisar ? 'Quer ser avisado quando melhorar.' : 'Não quer ser avisado.'].filter(Boolean));
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
  const { layout, botao, p, escHtml } = require('../lib/email');

  // 1) Teste grátis acabou (um e-mail por pessoa)
  const exp = await query(
    `SELECT id, email, nome FROM users
     WHERE email_verificado = true AND trial_aviso_em IS NULL AND trial_ate < NOW()
       AND assinatura_status IN ('nenhuma','pendente') AND (acesso_ate IS NULL OR acesso_ate < NOW())
     LIMIT 50`
  );
  for (const u of exp.rows) {
    await query('UPDATE users SET trial_aviso_em = NOW() WHERE id = $1', [u.id]);
    const nome = escHtml(String(u.nome || '').split(' ')[0]);
    await sendEmail({
      to: u.email,
      subject: 'Seu teste grátis do VUNBY terminou',
      html: layout({
        preheader: 'Seus orçamentos continuam salvos. Assine para continuar criando novos.',
        titulo: `${nome}, seu teste grátis terminou`,
        corpo: p('Seus <strong>14 dias de teste</strong> acabaram. Fique tranquilo: <strong>seus orçamentos continuam salvos</strong> e você pode vê-los quando quiser.') +
          p('Para continuar criando orçamentos, assine o VUNBY. Os <strong>100 primeiros assinantes</strong> pagam <strong>R$29,90/mês para sempre</strong> (preço normal R$49,90).') +
          botao(base + '/planos.html', 'Ver planos') +
          p('<span style="color:#6B7280;font-size:14px">Sem fidelidade: cancele quando quiser, em 1 clique.</span>') +
          p('<span style="color:#6B7280;font-size:14px">Não vai assinar agora? <a href="' + base + '/saida.html?tipo=nao_assinou" style="color:#0F3A8C">Conta pra gente o motivo em 30 segundos</a> — é assim que o VUNBY melhora.</span>'),
      }),
    });
  }

  // 1b) Pix vence em até 3 dias: lembrete para pagar o próximo mês (um por período)
  const pv = await query(
    `SELECT id, email, nome, acesso_ate FROM users
     WHERE assinatura_status = 'pix' AND pix_aviso_em IS NULL
       AND acesso_ate > NOW() AND acesso_ate < NOW() + INTERVAL '3 days'
     LIMIT 50`
  );
  for (const u of pv.rows) {
    await query('UPDATE users SET pix_aviso_em = NOW() WHERE id = $1', [u.id]);
    const nome = escHtml(String(u.nome || '').split(' ')[0]);
    const dia = new Date(u.acesso_ate).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    PUSH.notificarSilencioso(u.id, { titulo: 'Seu acesso ao VUNBY vence em breve', texto: `Vence dia ${dia}. Pague o próximo mês pelo Pix em 1 minuto.`, url: '/planos.html', tag: 'vencimento' });
    await sendEmail({
      to: u.email,
      subject: 'Seu acesso ao VUNBY vence em breve',
      html: layout({
        preheader: 'Pague o próximo mês pelo Pix para não perder o acesso.',
        titulo: `${nome}, seu acesso vence dia ${dia}`,
        corpo: p('Seu mês pago com <strong>Pix</strong> está terminando. Para continuar criando orçamentos, pague o próximo mês. Leva menos de 1 minuto.') +
          botao(base + '/planos.html', 'Pagar com Pix') +
          p('<span style="color:#6B7280;font-size:14px">Prefere não lembrar todo mês? Assine no cartão e a cobrança é automática.</span>'),
      }),
    });
  }

  // 2) Pesquisa de opinião 20 dias depois de assinar (longe do aviso de vencimento)
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
    PUSH.notificarSilencioso(u.id, { titulo: 'Como está sendo o VUNBY?', texto: '2 minutos para nos contar. Sua opinião melhora o app.', url: '/opiniao.html', tag: 'opiniao' });
    const nome = escHtml(String(u.nome || '').split(' ')[0]);
    await sendEmail({
      to: u.email,
      subject: 'Como está sendo o VUNBY para você?',
      html: layout({
        preheader: '2 minutos para nos contar o que está bom e o que falta.',
        titulo: `${nome}, queremos ouvir você`,
        corpo: p('Você é um dos <strong>fundadores do VUNBY</strong> e já faz quase 3 semanas que está com a gente. Queremos saber sua opinião de verdade: o que está bom, o que não está e o que falta.') +
          p('São perguntas rápidas, leva uns 2 minutos.') +
          botao(base + '/opiniao.html', 'Dar minha opinião') +
          p('Obrigado por construir o VUNBY com a gente. 💛'),
      }),
    });
  }
}

// Quem ainda está no teste grátis só começa a pagar no cartão quando o teste acaba
// (a conta de teste do cartão, TESTE_EMAIL, é cobrada na hora para dar para conferir).
function inicioCobranca(u) {
  const teste = String(process.env.TESTE_EMAIL || '').trim().toLowerCase();
  if (teste && String(u.email || '').toLowerCase() === teste) return {};
  const fim = u.trial_ate ? new Date(u.trial_ate) : null;
  if (!fim || fim.getTime() - Date.now() < 86400000) return {};
  return { start_date: fim.toISOString() };
}

module.exports = { handle, rodarTarefas };
