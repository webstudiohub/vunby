'use strict';
// Assinatura do VUNBY (Mercado Pago — "assinaturas sem plano", API /preapproval).
// Regras decididas com o fundador em 12/10/2026:
//   • preço normal R$49,90/mês; os 100 primeiros assinantes são "fundadores" e pagam R$29,90/mês para sempre;
//   • 14 dias de teste grátis;
//   • quando o teste acaba sem assinatura, a pessoa continua vendo os orçamentos dela, mas não cria novos.
const https = require('https');
const { query } = require('./db');

const PRECO_PADRAO = 49.90;
const PRECO_FUNDADOR = 29.90;
const VAGAS_FUNDADOR = 100;
const TRIAL_DIAS = 14;

function mpConfigurado() { return !!process.env.MP_ACCESS_TOKEN; }

// Chamada à API do Mercado Pago. Devolve { status, data }.
function mpRequest(method, path, body) {
  return new Promise((resolve, reject) => {
    const token = process.env.MP_ACCESS_TOKEN;
    if (!token) return reject(new Error('MP_ACCESS_TOKEN não configurado'));
    const payload = body ? JSON.stringify(body) : null;
    const headers = { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' };
    if (payload) headers['Content-Length'] = Buffer.byteLength(payload);
    const req = https.request({ hostname: 'api.mercadopago.com', path, method, headers, timeout: 15000 }, (res) => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => {
        let parsed = {};
        try { parsed = data ? JSON.parse(data) : {}; } catch { parsed = { raw: data }; }
        resolve({ status: res.statusCode, data: parsed });
      });
    });
    req.on('timeout', () => req.destroy(new Error('Mercado Pago não respondeu')));
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function vagasFundadorRestantes() {
  const r = await query('SELECT COUNT(*)::int AS n FROM users WHERE fundador = true');
  return Math.max(0, VAGAS_FUNDADOR - r.rows[0].n);
}

// Situação de acesso do usuário (linha de users com as colunas de assinatura)
function situacao(u) {
  const agora = Date.now();
  const trialAte = u.trial_ate ? new Date(u.trial_ate).getTime() : 0;
  const acessoAte = u.acesso_ate ? new Date(u.acesso_ate).getTime() : 0;
  const status = u.assinatura_status || 'nenhuma';
  let tipo;
  if (status === 'cortesia') tipo = 'cortesia';
  else if (status === 'ativa') tipo = 'ativa';
  else if (acessoAte > agora) tipo = 'cancelada_com_acesso';
  else if (trialAte > agora) tipo = 'trial';
  else tipo = 'expirado';
  const diasTrial = trialAte > agora ? Math.ceil((trialAte - agora) / 86400000) : 0;
  return { tipo, podeCriar: tipo !== 'expirado', diasTrial, trialAte: u.trial_ate, acessoAte: u.acesso_ate, status };
}

const COLS = 'id, email, nome, trial_ate, assinatura_status, mp_preapproval_id, preco_assinatura, fundador, assinado_em, acesso_ate';

async function getBillingUser(userId) {
  const r = await query(`SELECT ${COLS} FROM users WHERE id = $1`, [userId]);
  return r.rows[0] || null;
}

async function podeCriarOrcamento(userId) {
  const u = await getBillingUser(userId);
  return !!u && situacao(u).podeCriar;
}

// Aplica no banco o estado de uma assinatura (preapproval) lido da API do Mercado Pago.
// Sempre lemos da API com o nosso token: o corpo do webhook nunca é confiado.
async function aplicarPreapproval(pre) {
  if (!pre || !pre.id) return null;
  const userId = parseInt(pre.external_reference, 10);
  if (!userId) return null;
  const u = await getBillingUser(userId);
  if (!u) return null;
  // Só aceita a assinatura que está gravada no usuário, ou uma autorizada (ex.: pagou um link antigo)
  if (u.mp_preapproval_id !== pre.id && pre.status !== 'authorized') return null;

  const valor = Number(pre.auto_recurring && pre.auto_recurring.transaction_amount) || null;
  const proximo = pre.next_payment_date ? new Date(pre.next_payment_date) : null;

  if (pre.status === 'authorized') {
    await query(
      `UPDATE users SET assinatura_status = 'ativa', mp_preapproval_id = $2, preco_assinatura = $3,
         fundador = fundador OR ($3 IS NOT NULL AND $3 <= $4),
         assinado_em = COALESCE(assinado_em, NOW()), acesso_ate = COALESCE($5, acesso_ate)
       WHERE id = $1 AND assinatura_status <> 'cortesia'`,
      [userId, pre.id, valor, PRECO_FUNDADOR, proximo]
    );
  } else if (pre.status === 'paused' || pre.status === 'cancelled') {
    // Mantém o acesso até a data do próximo pagamento (o mês já pago)
    await query(
      `UPDATE users SET assinatura_status = $2, acesso_ate = COALESCE($3, acesso_ate)
       WHERE id = $1 AND mp_preapproval_id = $4 AND assinatura_status <> 'cortesia'`,
      [userId, pre.status === 'paused' ? 'pausada' : 'cancelada', proximo, pre.id]
    );
  } else if (pre.status === 'pending') {
    await query(
      `UPDATE users SET assinatura_status = 'pendente'
       WHERE id = $1 AND mp_preapproval_id = $2 AND assinatura_status IN ('nenhuma','pendente')`,
      [userId, pre.id]
    );
  }
  return userId;
}

async function sincronizarPreapproval(preapprovalId) {
  if (!/^[A-Za-z0-9_-]{6,64}$/.test(String(preapprovalId || ''))) return null;
  const r = await module.exports.mpRequest('GET', '/preapproval/' + encodeURIComponent(preapprovalId));
  if (r.status !== 200) { console.error('MP GET preapproval', r.status, JSON.stringify(r.data).slice(0, 300)); return null; }
  return aplicarPreapproval(r.data);
}

module.exports = {
  PRECO_PADRAO, PRECO_FUNDADOR, VAGAS_FUNDADOR, TRIAL_DIAS,
  mpConfigurado, mpRequest, vagasFundadorRestantes, situacao, getBillingUser,
  podeCriarOrcamento, aplicarPreapproval, sincronizarPreapproval,
};
