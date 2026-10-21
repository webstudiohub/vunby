'use strict';
// Indique e ganhe: cada usuário tem um código; quem indica ganha 1 mês grátis quando o indicado PAGA.
const crypto = require('crypto');
const { query } = require('./db');

const BONUS_INDICADO_DIAS = 7;   // dias a mais de teste para quem chega por indicação
const PREMIO_DIAS = 30;          // prêmio de quem indicou (por indicado que pagou)
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'adiminvunby@gmail.com';
const LETRAS = 'abcdefghjkmnpqrstuvwxyz23456789';

function normalizar(c) {
  const s = String(c || '').trim().toLowerCase();
  return /^[a-z0-9-]{3,24}$/.test(s) ? s : null;
}

function gerar() {
  const b = crypto.randomBytes(6);
  let s = '';
  for (let i = 0; i < 6; i++) s += LETRAS[b[i] % LETRAS.length];
  return s;
}

// Código do usuário (cria na primeira vez)
async function codigoDoUsuario(userId) {
  const r = await query('SELECT ref_codigo FROM users WHERE id = $1', [userId]);
  if (r.rows[0] && r.rows[0].ref_codigo) return r.rows[0].ref_codigo;
  for (let i = 0; i < 6; i++) {
    const c = gerar();
    const p = await query('SELECT 1 FROM parceiros WHERE codigo = $1', [c]);
    if (p.rows.length) continue;
    try {
      const u = await query('UPDATE users SET ref_codigo = $2 WHERE id = $1 AND ref_codigo IS NULL RETURNING ref_codigo', [userId, c]);
      if (u.rows[0]) return u.rows[0].ref_codigo;
      const again = await query('SELECT ref_codigo FROM users WHERE id = $1', [userId]);
      return again.rows[0] && again.rows[0].ref_codigo;
    } catch (e) { if (e.code !== '23505') throw e; }
  }
  throw new Error('Não foi possível gerar o código de indicação');
}

// Descobre de quem é o código: { codigo, userId } (usuário) ou { codigo, parceiro } ou null
async function resolver(c) {
  const codigo = normalizar(c);
  if (!codigo) return null;
  const u = await query('SELECT id FROM users WHERE ref_codigo = $1', [codigo]);
  if (u.rows[0]) return { codigo, userId: u.rows[0].id };
  const p = await query('SELECT nome FROM parceiros WHERE codigo = $1', [codigo]);
  if (p.rows[0]) return { codigo, parceiro: p.rows[0].nome };
  return null;
}

// Chamado quando um usuário paga pela primeira vez (Pix creditado ou cartão autorizado).
// Marca o indicado como premiado (só uma vez) e dá o mês grátis a quem indicou.
async function premiar(userIdPagante) {
  const m = await query(
    `UPDATE users SET indicacao_premiada = true
      WHERE id = $1 AND indicado_por IS NOT NULL AND indicacao_premiada = false AND indicado_por <> id
      RETURNING indicado_por, nome`, [userIdPagante]);
  if (!m.rows[0]) return null;
  const indicadorId = m.rows[0].indicado_por;
  const nomeIndicado = String(m.rows[0].nome || '').split(' ')[0] || 'Seu indicado';
  const ind = await query('SELECT id, nome, email, assinatura_status FROM users WHERE id = $1', [indicadorId]);
  const u = ind.rows[0];
  if (!u) return null;

  let comoFoi;
  if (u.assinatura_status === 'ativa') {
    // Cartão: o Mercado Pago continua cobrando; o mês grátis fica pendente para o administrador abater
    await query('UPDATE users SET meses_gratis_pendentes = meses_gratis_pendentes + 1 WHERE id = $1', [u.id]);
    comoFoi = 'cartao';
  } else if (u.assinatura_status === 'cortesia') {
    comoFoi = 'cortesia';
  } else {
    await query(
      `UPDATE users SET acesso_ate = GREATEST(COALESCE(acesso_ate, NOW()), COALESCE(trial_ate, NOW()), NOW()) + make_interval(days => $2::int),
              assinatura_status = CASE WHEN assinatura_status IN ('nenhuma','pendente','cancelada','pausada') THEN 'pix' ELSE assinatura_status END,
              pix_aviso_em = NULL
        WHERE id = $1`, [u.id, PREMIO_DIAS]);
    comoFoi = 'dias';
  }

  const E = require('./email');
  const P = require('./push');
  const texto = comoFoi === 'cartao'
    ? `${nomeIndicado} assinou o VUNBY pela sua indicação. Você ganhou 1 mês grátis: ele será descontado da sua assinatura.`
    : `${nomeIndicado} assinou o VUNBY pela sua indicação. Você ganhou 1 mês grátis de acesso!`;
  P.notificarSilencioso(u.id, { titulo: '🎁 Você ganhou 1 mês grátis', texto, url: '/conta.html#indique', tag: 'indicacao' });
  E.sendEmail({ to: u.email, subject: '🎁 Você ganhou 1 mês grátis no VUNBY',
    html: E.layout({ preheader: texto, titulo: 'Você ganhou 1 mês grátis', corpo: `<p style="margin:0 0 14px">${E.escHtml(texto)}</p><p style="margin:0">Obrigado por indicar o VUNBY. Continue indicando: cada indicado que assinar vale mais 1 mês.</p>` }) }).catch(() => {});
  if (comoFoi === 'cartao') {
    E.sendEmail({ to: ADMIN_EMAIL, subject: 'Indicação: abater 1 mês no cartão',
      html: E.layout({ preheader: 'Mês grátis pendente', titulo: 'Mês grátis pendente (cartão)', corpo: `<p>${E.escHtml(u.nome)} (${E.escHtml(u.email)}) ganhou 1 mês grátis por indicação, mas paga no cartão. Veja no painel do administrador → Indicações.</p>` }) }).catch(() => {});
  }
  return { indicadorId: u.id, comoFoi };
}

function premiarSilencioso(userId) {
  premiar(userId).catch(e => console.error('premiar indicacao:', e.message));
}

module.exports = { normalizar, codigoDoUsuario, resolver, premiar, premiarSilencioso, BONUS_INDICADO_DIAS, PREMIO_DIAS };
