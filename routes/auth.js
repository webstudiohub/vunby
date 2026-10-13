
'use strict';
const { query } = require('../lib/db');
const { hashPassword, verifyPassword, hashesMatch } = require('../lib/auth');
const { generateSessionToken, verifySessionToken, hashToken } = require('../lib/tokens');
const { generateCode } = require('../lib/tokens');
const { json, ok, created, badRequest, unauthorized, notFound, conflict, serverError, readBody, parseSession, setSessionCookie, clearSessionCookie } = require('../lib/http');
const { isEmail, isPhone, isNonEmpty } = require('../lib/validate');
const { normalizePhone } = require('../lib/phone');
const { rateLimit, resetLimit } = require('../lib/rateLimit');
const { sendVerificationEmail, sendPasswordResetEmail } = require('../lib/email');
const { BASE_URL } = require('../lib/config');
const B = require('../lib/billing');

// Link de avaliação do Google Meu Negócio (ex.: https://g.page/r/XXXX/review)
const GOOGLE_HOSTS = ['g.page', 'www.google.com', 'google.com', 'search.google.com', 'maps.google.com', 'www.google.com.br', 'google.com.br', 'maps.app.goo.gl', 'goo.gl', 'g.co'];
function isGoogleReviewLink(l) {
  if (l.length > 300) return false;
  try { const u = new URL(l); return u.protocol === 'https:' && GOOGLE_HOSTS.includes(u.hostname); } catch { return false; }
}

async function getSession(req) {
  const token = parseSession(req);
  if (!token) return null;
  const raw = verifySessionToken(token);
  if (!raw) return null;
  const tokenHash = hashToken(raw);
  const res = await query('SELECT u.id, u.nome, u.email, u.senha_hash, u.telefone, u.telefone_verificado, u.trial_concedido, u.email_verificado, u.nome_empresa, u.google_review_link, (u.logo IS NOT NULL) AS tem_logo, u.created_at FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = $1 AND s.expires_at > NOW() AND u.email_verificado = true', [tokenHash]);
  return res.rows[0] || null;
}

async function requireAuth(req, res) {
  const user = await getSession(req);
  if (!user) { unauthorized(res, 'Sessão inválida. Faça login novamente.'); return null; }
  return user;
}

// Gera e envia um novo código de verificação de e-mail (invalida os anteriores)
async function sendNewEmailCode(user) {
  const code = generateCode(6);
  const codeHash = hashToken(code);
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
  await query('DELETE FROM email_verifications WHERE user_id = $1', [user.id]);
  await query('INSERT INTO email_verifications (user_id, code_hash, expires_at) VALUES ($1,$2,$3)', [user.id, codeHash, expiresAt]);
  return sendVerificationEmail(user.email, code);
}

// Cria sessão (mantém no máximo 3 por usuário: as 2 mais recentes + a nova) e grava o cookie
async function createSession(res, userId) {
  const oldSessions = await query('SELECT token_hash FROM sessions WHERE user_id = $1 ORDER BY created_at DESC OFFSET 2', [userId]);
  for (const s of oldSessions.rows) {
    await query('DELETE FROM sessions WHERE token_hash = $1', [s.token_hash]);
  }
  const token = generateSessionToken();
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + 30 * 24 * 3600 * 1000);
  await query('INSERT INTO sessions (user_id, token_hash, expires_at) VALUES ($1,$2,$3)', [userId, tokenHash, expiresAt]);
  setSessionCookie(res, token);
}

async function handle(req, res) {
  const url = new URL(req.url, 'http://x');
  const path = url.pathname;
  // IP real do visitante. O Render fica atrás da Cloudflare, que envia o IP do cliente em
  // CF-Connecting-IP e bloqueia quem tenta forjar esse cabeçalho. O X-Forwarded-For chega como
  // "cliente, cloudflare, interno-do-render" e o 1º valor pode ser forjado: só fallback (dev local).
  const ip = req.headers['cf-connecting-ip']
    || (req.headers['x-forwarded-for'] || '').split(',')[0].trim()
    || req.socket.remoteAddress || 'unknown';

  // POST /api/auth/register
  if (req.method === 'POST' && path === '/api/auth/register') {
    if (!(await rateLimit(`register:${ip}`, 5, 60_000))) return badRequest(res, 'Muitas tentativas. Aguarde um minuto.');
    let body;
    try { body = await readBody(req); } catch { return badRequest(res, 'Dados inválidos'); }
    const { nome, email, senha, telefone } = body;

    // Validação de nome: mínimo 2 palavras, só letras e espaços, sem números/símbolos
    const nomeClean = (nome || '').trim();
    if (!nomeClean) return badRequest(res, 'Nome completo é obrigatório.');
    if (!/^[A-Za-zÀ-ÖØ-öø-ÿ]+(\s+[A-Za-zÀ-ÖØ-öø-ÿ]+)+$/.test(nomeClean))
      return badRequest(res, 'Informe seu nome completo (nome e sobrenome, apenas letras).');
    if (nomeClean.length < 5) return badRequest(res, 'Nome muito curto. Informe nome e sobrenome.');
    if (nomeClean.length > 80) return badRequest(res, 'Nome muito longo (máximo 80 caracteres).');

    if (!isEmail(email)) return badRequest(res, 'E-mail inválido.');
    if (!senha || senha.length < 8) return badRequest(res, 'Senha deve ter ao menos 8 caracteres.');
    const telNorm = normalizePhone(telefone);
    if (!telNorm) return badRequest(res, 'Telefone inválido.');

    const existing = await query('SELECT id FROM users WHERE email = $1', [email.trim().toLowerCase()]);
    if (existing.rows.length > 0) return conflict(res, 'Este e-mail já está cadastrado.');

    const telHash = hashToken(telNorm);
    const trialUsed = await query('SELECT 1 FROM verified_trial_phones WHERE phone_hash = $1', [telHash]);
    const trialConcedido = trialUsed.rows.length === 0;

    const senhaHash = await hashPassword(senha);
    const result = await query(
      'INSERT INTO users (nome, email, senha_hash, telefone, trial_concedido, telefone_verificado, trial_ate) VALUES ($1,$2,$3,$4,$5,$6, CASE WHEN $5 THEN NOW() + INTERVAL \'14 days\' ELSE NOW() END) RETURNING id',
      [nomeClean, email.trim().toLowerCase(), senhaHash, telNorm, trialConcedido, false]
    );
    const userId = result.rows[0].id;
    await sendNewEmailCode({ id: userId, email: email.trim().toLowerCase() });

    return created(res, { message: 'Conta criada. Verifique seu e-mail.', requiresVerification: true });
  }

  // POST /api/auth/verify-email
  if (req.method === 'POST' && path === '/api/auth/verify-email') {
    let body;
    try { body = await readBody(req); } catch { return badRequest(res, 'Dados inválidos'); }
    const { email, code } = body;
    if (!isEmail(email) || !code) return badRequest(res, 'Dados inválidos.');
    const emailNorm = email.trim().toLowerCase();
    // Máx. 5 tentativas por e-mail a cada 15 min (impede chutar o código de 6 dígitos)
    if (!(await rateLimit(`verify-email:${emailNorm}`, 5, 15 * 60_000))) return badRequest(res, 'Muitas tentativas. Solicite um novo código daqui a alguns minutos.');
    if (!(await rateLimit(`verify-email-ip:${ip}`, 20, 15 * 60_000))) return badRequest(res, 'Muitas tentativas. Aguarde alguns minutos.');
    const userRes = await query('SELECT * FROM users WHERE email = $1', [emailNorm]);
    if (!userRes.rows[0]) return badRequest(res, 'Código incorreto.');
    const user = userRes.rows[0];
    if (user.email_verificado) return badRequest(res, 'E-mail já verificado. Faça login.');
    const vRes = await query('SELECT * FROM email_verifications WHERE user_id = $1 AND expires_at > NOW() ORDER BY created_at DESC LIMIT 1', [user.id]);
    if (!vRes.rows[0]) return badRequest(res, 'Código expirado. Solicite novo código.');
    if (!hashesMatch(String(code).replace(/\D/g, ''), vRes.rows[0].code_hash)) return badRequest(res, 'Código incorreto.');
    await query('UPDATE users SET email_verificado = true WHERE id = $1', [user.id]);
    await query('DELETE FROM email_verifications WHERE user_id = $1', [user.id]);
    await resetLimit(`verify-email:${emailNorm}`);
    // Já entra direto: o usuário provou ter acesso ao e-mail
    await createSession(res, user.id);
    return ok(res, { message: 'E-mail verificado com sucesso!' });
  }

  // POST /api/auth/verify-phone
  if (req.method === 'POST' && path === '/api/auth/verify-phone') {
    let body;
    try { body = await readBody(req); } catch { return badRequest(res, 'Dados inválidos'); }
    const { email, code } = body;
    if (!isEmail(email) || !code) return badRequest(res, 'Dados inválidos.');
    if (!(await rateLimit(`verify-phone:${email.trim().toLowerCase()}`, 5, 15 * 60_000))) return badRequest(res, 'Muitas tentativas. Aguarde alguns minutos.');
    if (!(await rateLimit(`verify-phone-ip:${ip}`, 20, 15 * 60_000))) return badRequest(res, 'Muitas tentativas. Aguarde alguns minutos.');
    const userRes = await query('SELECT * FROM users WHERE email = $1', [email.trim().toLowerCase()]);
    if (!userRes.rows[0]) return badRequest(res, 'Código incorreto.');
    const user = userRes.rows[0];
    const vRes = await query('SELECT * FROM phone_verifications WHERE user_id = $1 AND expires_at > NOW() ORDER BY created_at DESC LIMIT 1', [user.id]);
    if (!vRes.rows[0]) return badRequest(res, 'Código expirado. Solicite novo código.');
    if (!hashesMatch(String(code).trim(), vRes.rows[0].code_hash)) return badRequest(res, 'Código incorreto.');
    await query('UPDATE users SET telefone_verificado = true WHERE id = $1', [user.id]);
    await query('DELETE FROM phone_verifications WHERE user_id = $1', [user.id]);
    if (user.trial_concedido) {
      const telHash = hashToken(user.telefone);
      await query('INSERT INTO verified_trial_phones (phone_hash) VALUES ($1) ON CONFLICT DO NOTHING', [telHash]);
    }
    return ok(res, { message: 'Telefone verificado com sucesso!' });
  }

  // POST /api/auth/login
  if (req.method === 'POST' && path === '/api/auth/login') {
    if (!(await rateLimit(`login:${ip}`, 10, 60_000))) return badRequest(res, 'Muitas tentativas. Aguarde um minuto.');
    let body;
    try { body = await readBody(req); } catch { return badRequest(res, 'Dados inválidos'); }
    const { email, senha } = body;
    if (!isEmail(email) || !senha) return badRequest(res, 'E-mail e senha são obrigatórios.');
    const emailNorm = email.trim().toLowerCase();
    if (!(await rateLimit(`login-email:${emailNorm}`, 10, 15 * 60_000))) return badRequest(res, 'Muitas tentativas para este e-mail. Aguarde alguns minutos.');
    const userRes = await query('SELECT * FROM users WHERE email = $1', [emailNorm]);
    const user = userRes.rows[0];
    if (!user) return unauthorized(res, 'E-mail ou senha incorretos.');
    const ok2 = await verifyPassword(senha, user.senha_hash);
    if (!ok2) return unauthorized(res, 'E-mail ou senha incorretos.');
    await resetLimit(`login-email:${emailNorm}`);
    // E-mail ainda não confirmado: não cria sessão; reenvia o código (no máx. 3 por 10 min) e manda verificar
    if (!user.email_verificado) {
      if (await rateLimit(`login-resend:${emailNorm}`, 3, 10 * 60_000)) await sendNewEmailCode(user);
      return json(res, 403, { error: 'Confirme seu e-mail para entrar. Enviamos um código para você.', emailVerificado: false });
    }
    await createSession(res, user.id);
    return ok(res, { message: 'Login realizado.', nome: user.nome, emailVerificado: true });
  }

  // POST /api/auth/logout
  if (req.method === 'POST' && path === '/api/auth/logout') {
    const token = parseSession(req);
    if (token) {
      const raw = verifySessionToken(token);
      if (raw) {
        const tokenHash = hashToken(raw);
        await query('DELETE FROM sessions WHERE token_hash = $1', [tokenHash]);
      }
    }
    clearSessionCookie(res);
    return ok(res, { message: 'Sessão encerrada.' });
  }

  // GET /api/auth/me
  if (req.method === 'GET' && path === '/api/auth/me') {
    const user = await getSession(req);
    if (!user) return unauthorized(res);
    return ok(res, { id: user.id, nome: user.nome, email: user.email, telefone: user.telefone, nomeEmpresa: user.nome_empresa || '', googleReviewLink: user.google_review_link || '', temLogo: !!user.tem_logo, emailVerificado: user.email_verificado, telefoneVerificado: user.telefone_verificado, trialConcedido: user.trial_concedido });
  }

  // GET /api/auth/logo — logo do próprio usuário (para a tela de Conta)
  if (req.method === 'GET' && path === '/api/auth/logo') {
    const user = await requireAuth(req, res);
    if (!user) return true;
    const r = await query('SELECT logo FROM users WHERE id = $1', [user.id]);
    return ok(res, { logo: r.rows[0]?.logo || null });
  }

  // PUT /api/auth/profile — nome da empresa e logo que aparecem no orçamento do cliente
  if (req.method === 'PUT' && path === '/api/auth/profile') {
    const user = await requireAuth(req, res);
    if (!user) return true;
    let body;
    try { body = await readBody(req, 700_000); } catch { return badRequest(res, 'Imagem muito grande. Use uma imagem menor.'); }
    const updates = {};
    if (body.nomeEmpresa !== undefined) {
      const n = String(body.nomeEmpresa || '').trim();
      if (n.length > 80) return badRequest(res, 'Nome da empresa muito longo (máximo 80 caracteres).');
      updates.nome_empresa = n || null;
    }
    if (body.logo !== undefined) {
      if (body.logo === null || body.logo === '') updates.logo = null;
      else {
        const l = String(body.logo);
        if (!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(l)) return badRequest(res, 'Formato de imagem inválido. Use PNG ou JPG.');
        if (l.length > 600_000) return badRequest(res, 'Imagem muito grande. Use uma imagem menor.');
        updates.logo = l;
      }
    }
    if (body.googleReviewLink !== undefined) {
      const l = String(body.googleReviewLink || '').trim();
      if (!l) updates.google_review_link = null;
      else {
        if (!isGoogleReviewLink(l)) return badRequest(res, 'Link de avaliação inválido. Copie o link do Google Meu Negócio (botão "Pedir avaliações").');
        updates.google_review_link = l;
      }
    }
    if (Object.keys(updates).length === 0) return badRequest(res, 'Nada para atualizar.');
    const cols = Object.keys(updates).map((k, i) => `${k} = $${i + 2}`).join(', ');
    await query(`UPDATE users SET ${cols} WHERE id = $1`, [user.id, ...Object.values(updates)]);
    return ok(res, { message: 'Dados da marca salvos.' });
  }

  // POST /api/auth/resend-verification
  if (req.method === 'POST' && path === '/api/auth/resend-verification') {
    if (!(await rateLimit(`resend-verification:${ip}`, 3, 60_000))) return badRequest(res, 'Muitas tentativas. Aguarde um minuto.');
    let body;
    try { body = await readBody(req); } catch { return badRequest(res, 'Dados inválidos'); }
    const { email } = body;
    if (!isEmail(email)) return badRequest(res, 'E-mail inválido.');
    const userRes = await query('SELECT * FROM users WHERE email = $1', [email.trim().toLowerCase()]);
    const user = userRes.rows[0];
    if (!user) return ok(res, { message: 'Se o e-mail existir, um novo código será enviado.' });
    if (user.email_verificado) return badRequest(res, 'E-mail já verificado.');
    await sendNewEmailCode(user);
    return ok(res, { message: 'Novo código enviado.' });
  }

  // POST /api/auth/forgot-password
  if (req.method === 'POST' && path === '/api/auth/forgot-password') {
    if (!(await rateLimit(`forgot:${ip}`, 3, 60_000))) return badRequest(res, 'Muitas tentativas. Aguarde um minuto.');
    let body;
    try { body = await readBody(req); } catch { return badRequest(res, 'Dados inválidos'); }
    const { email } = body;
    if (!isEmail(email)) return ok(res, { message: 'Se o e-mail existir, um link será enviado.' });
    const userRes = await query('SELECT id FROM users WHERE email = $1', [email.trim().toLowerCase()]);
    if (!userRes.rows[0]) return ok(res, { message: 'Se o e-mail existir, um link será enviado.' });
    const userId = userRes.rows[0].id;
    const code = generateCode(32);
    const codeHash = hashToken(code);
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
    await query('DELETE FROM password_resets WHERE user_id = $1', [userId]);
    await query('INSERT INTO password_resets (user_id, token_hash, expires_at) VALUES ($1,$2,$3)', [userId, codeHash, expiresAt]);
    const link = `${BASE_URL.replace(/\/$/, '')}/redefinir-senha.html?token=${code}`;
    await sendPasswordResetEmail(email.trim(), link);
    return ok(res, { message: 'Se o e-mail existir, um link será enviado.' });
  }

  // POST /api/auth/reset-password
  if (req.method === 'POST' && path === '/api/auth/reset-password') {
    let body;
    try { body = await readBody(req); } catch { return badRequest(res, 'Dados inválidos'); }
    const { token, senha } = body;
    if (!token || !senha || senha.length < 8) return badRequest(res, 'Token e senha (mín. 8 caracteres) são obrigatórios.');
    if (!(await rateLimit(`reset:${ip}`, 10, 15 * 60_000))) return badRequest(res, 'Muitas tentativas. Aguarde alguns minutos.');
    const rows = await query('SELECT * FROM password_resets WHERE token_hash = $1 AND expires_at > NOW()', [hashToken(String(token))]);
    const match = rows.rows[0];
    if (!match) return badRequest(res, 'Link inválido ou expirado.');
    const senhaHash = await hashPassword(senha);
    // Quem abriu o link do e-mail provou ser dono dele: confirma o e-mail também
    await query('UPDATE users SET senha_hash = $1, email_verificado = true WHERE id = $2', [senhaHash, match.user_id]);
    await query('DELETE FROM password_resets WHERE user_id = $1', [match.user_id]);
    await query('DELETE FROM sessions WHERE user_id = $1', [match.user_id]);
    return ok(res, { message: 'Senha redefinida com sucesso.' });
  }

  // PUT /api/auth/password
  if (req.method === 'PUT' && path === '/api/auth/password') {
    const user = await requireAuth(req, res);
    if (!user) return true;
    let body;
    try { body = await readBody(req); } catch { return badRequest(res, 'Dados inválidos'); }
    const { senhaAtual, senhaNova } = body;
    if (!senhaAtual || !senhaNova) return badRequest(res, 'Preencha todos os campos.');
    if (senhaNova.length < 8) return badRequest(res, 'A nova senha deve ter ao menos 8 caracteres.');
    const match = await verifyPassword(senhaAtual, user.senha_hash);
    if (!match) return badRequest(res, 'Senha atual incorreta.');
    const senhaHash = await hashPassword(senhaNova);
    await query('UPDATE users SET senha_hash = $1 WHERE id = $2', [senhaHash, user.id]);
    // Invalidate all other sessions
    const currentToken = parseSession(req);
    if (currentToken) {
      const raw = verifySessionToken(currentToken);
      if (raw) {
        const currentHash = hashToken(raw);
        await query('DELETE FROM sessions WHERE user_id = $1 AND token_hash != $2', [user.id, currentHash]);
      }
    }
    return ok(res, { message: 'Senha alterada com sucesso.' });
  }

  // DELETE /api/auth/account
  if (req.method === 'DELETE' && path === '/api/auth/account') {
    const user = await requireAuth(req, res);
    if (!user) return true;
    // Assinatura ativa: cancela no Mercado Pago antes de apagar (senão o cartão continua sendo cobrado)
    const bu = await B.getBillingUser(user.id);
    if (bu && bu.mp_preapproval_id && ['ativa', 'pausada', 'pendente'].includes(bu.assinatura_status)) {
      if (!B.mpConfigurado()) return json(res, 503, { error: 'Não foi possível cancelar sua assinatura agora. Tente novamente mais tarde.' });
      const r = await B.mpRequest('PUT', '/preapproval/' + encodeURIComponent(bu.mp_preapproval_id), { status: 'cancelled' })
        .catch(e => ({ status: 0, data: { message: e.message } }));
      if (r.status !== 200 && bu.assinatura_status !== 'pendente') {
        console.error('Excluir conta: falha ao cancelar MP', r.status, JSON.stringify(r.data).slice(0, 300));
        return json(res, 502, { error: 'Não foi possível cancelar sua assinatura agora. Tente novamente em instantes.' });
      }
    }
    await query('DELETE FROM sessions WHERE user_id = $1', [user.id]);
    await query('DELETE FROM users WHERE id = $1', [user.id]);
    clearSessionCookie(res);
    return ok(res, { message: 'Conta excluída.' });
  }

  return null;
}

module.exports = { handle, getSession, requireAuth };
