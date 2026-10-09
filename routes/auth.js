'use strict';
const { query } = require('../lib/db');
const { hashPassword, verifyPassword, hashesMatch } = require('../lib/auth');
const { generateSessionToken, verifySessionToken, hashToken } = require('../lib/tokens');
const { generateCode } = require('../lib/tokens');
const { ok, created, badRequest, unauthorized, notFound, conflict, serverError, readBody, parseSession, setSessionCookie, clearSessionCookie } = require('../lib/http');
const { isEmail, isPhone, isNonEmpty } = require('../lib/validate');
const { normalizePhone } = require('../lib/phone');
const { rateLimit } = require('../lib/rateLimit');
const { sendVerificationEmail, sendPasswordResetEmail } = require('../lib/email');

async function getSession(req) {
  const token = parseSession(req);
  if (!token) return null;
  const raw = verifySessionToken(token);
  if (!raw) return null;
  const tokenHash = hashToken(raw);
  const res = await query('SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = $1 AND s.expires_at > NOW()', [tokenHash]);
  return res.rows[0] || null;
}

async function requireAuth(req, res) {
  const user = await getSession(req);
  if (!user) { unauthorized(res, 'Sessão inválida. Faça login novamente.'); return null; }
  return user;
}

async function handle(req, res) {
  const url = new URL(req.url, 'http://x');
  const path = url.pathname;
  const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress || 'unknown';

  // POST /api/auth/register
  if (req.method === 'POST' && path === '/api/auth/register') {
    if (!rateLimit(`register:${ip}`, 5, 60_000)) return badRequest(res, 'Muitas tentativas. Aguarde um minuto.');
    let body;
    try { body = await readBody(req); } catch { return badRequest(res, 'Dados inválidos'); }
    const { nome, email, senha, telefone } = body;
    if (!isNonEmpty(nome)) return badRequest(res, 'Nome é obrigatório.');
    if (!isEmail(email)) return badRequest(res, 'E-mail inválido.');
    if (!senha || senha.length < 8) return badRequest(res, 'Senha deve ter ao menos 8 caracteres.');
    const telNorm = normalizePhone(telefone);
    if (!telNorm) return badRequest(res, 'Telefone inválido.');

    const existing = await query('SELECT id FROM users WHERE email = $1', [email.trim().toLowerCase()]);
    if (existing.rows.length > 0) return conflict(res, 'Este e-mail já está cadastrado.');

    // Verifica trial
    const telHash = hashToken(telNorm);
    const trialUsed = await query('SELECT 1 FROM verified_trial_phones WHERE phone_hash = $1', [telHash]);
    const trialConcedido = trialUsed.rows.length === 0;

    const senhaHash = await hashPassword(senha);
    const result = await query(
      'INSERT INTO users (nome, email, senha_hash, telefone, trial_concedido, telefone_verificado) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id',
      [nome.trim(), email.trim().toLowerCase(), senhaHash, telNorm, trialConcedido, false]
    );
    const userId = result.rows[0].id;

    // Gera código de verificação de e-mail
    const code = generateCode(6);
    const codeHash = hashToken(code);
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
    await query('INSERT INTO email_verifications (user_id, code_hash, expires_at) VALUES ($1,$2,$3)', [userId, codeHash, expiresAt]);

    // Envia e-mail com código
    await sendVerificationEmail(email.trim(), code);

    return created(res, { message: 'Conta criada. Verifique seu e-mail.', requiresVerification: true });
  }

  // POST /api/auth/verify-email
  if (req.method === 'POST' && path === '/api/auth/verify-email') {
    let body;
    try { body = await readBody(req); } catch { return badRequest(res, 'Dados inválidos'); }
    const { email, code } = body;
    if (!email || !code) return badRequest(res, 'Dados inválidos.');
    const userRes = await query('SELECT * FROM users WHERE email = $1', [email.trim().toLowerCase()]);
    if (!userRes.rows[0]) return notFound(res, 'Usuário não encontrado.');
    const user = userRes.rows[0];
    const vRes = await query('SELECT * FROM email_verifications WHERE user_id = $1 AND expires_at > NOW() ORDER BY created_at DESC LIMIT 1', [user.id]);
    if (!vRes.rows[0]) return badRequest(res, 'Código expirado. Solicite novo código.');
    if (!hashesMatch(code, vRes.rows[0].code_hash)) return badRequest(res, 'Código incorreto.');
    await query('UPDATE users SET email_verificado = true WHERE id = $1', [user.id]);
    await query('DELETE FROM email_verifications WHERE user_id = $1', [user.id]);
    return ok(res, { message: 'E-mail verificado com sucesso!' });
  }

  // POST /api/auth/verify-phone
  if (req.method === 'POST' && path === '/api/auth/verify-phone') {
    let body;
    try { body = await readBody(req); } catch { return badRequest(res, 'Dados inválidos'); }
    const { email, code } = body;
    if (!email || !code) return badRequest(res, 'Dados inválidos.');
    const userRes = await query('SELECT * FROM users WHERE email = $1', [email.trim().toLowerCase()]);
    if (!userRes.rows[0]) return notFound(res, 'Usuário não encontrado.');
    const user = userRes.rows[0];
    const vRes = await query('SELECT * FROM phone_verifications WHERE user_id = $1 AND expires_at > NOW() ORDER BY created_at DESC LIMIT 1', [user.id]);
    if (!vRes.rows[0]) return badRequest(res, 'Código expirado. Solicite novo código.');
    if (!hashesMatch(code, vRes.rows[0].code_hash)) return badRequest(res, 'Código incorreto.');
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
    if (!rateLimit(`login:${ip}`, 10, 60_000)) return badRequest(res, 'Muitas tentativas. Aguarde um minuto.');
    let body;
    try { body = await readBody(req); } catch { return badRequest(res, 'Dados inválidos'); }
    const { email, senha } = body;
    if (!isEmail(email) || !senha) return badRequest(res, 'E-mail e senha são obrigatórios.');
    const userRes = await query('SELECT * FROM users WHERE email = $1', [email.trim().toLowerCase()]);
    const user = userRes.rows[0];
    if (!user) return unauthorized(res, 'E-mail ou senha incorretos.');
    const ok2 = await verifyPassword(senha, user.senha_hash);
    if (!ok2) return unauthorized(res, 'E-mail ou senha incorretos.');
    const token = generateSessionToken();
    const [raw] = token.split('.');
    const tokenHash = hashToken(raw);
    const expiresAt = new Date(Date.now() + 30 * 24 * 3600 * 1000);
    await query('INSERT INTO sessions (user_id, token_hash, expires_at) VALUES ($1,$2,$3)', [user.id, tokenHash, expiresAt]);
    setSessionCookie(res, token);
    return ok(res, { message: 'Login realizado.', nome: user.nome, telefoneVerificado: user.telefone_verificado });
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
    return ok(res, { id: user.id, nome: user.nome, email: user.email, telefone: user.telefone, telefoneVerificado: user.telefone_verificado, trialConcedido: user.trial_concedido });
  }

  // POST /api/auth/forgot-password
  if (req.method === 'POST' && path === '/api/auth/forgot-password') {
    if (!rateLimit(`forgot:${ip}`, 3, 60_000)) return badRequest(res, 'Muitas tentativas. Aguarde um minuto.');
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
    const link = `${process.env.BASE_URL}/redefinir-senha?token=${code}`;
    await sendPasswordResetEmail(email.trim(), link);
    return ok(res, { message: 'Se o e-mail existir, um link será enviado.' });
  }

  // POST /api/auth/reset-password
  if (req.method === 'POST' && path === '/api/auth/reset-password') {
    let body;
    try { body = await readBody(req); } catch { return badRequest(res, 'Dados inválidos'); }
    const { token, senha } = body;
    if (!token || !senha || senha.length < 8) return badRequest(res, 'Token e senha (mín. 8 caracteres) são obrigatórios.');
    const rows = await query('SELECT * FROM password_resets WHERE expires_at > NOW()', []);
    const match = rows.rows.find(r => hashesMatch(token, r.token_hash));
    if (!match) return badRequest(res, 'Link inválido ou expirado.');
    const senhaHash = await hashPassword(senha);
    await query('UPDATE users SET senha_hash = $1 WHERE id = $2', [senhaHash, match.user_id]);
    await query('DELETE FROM password_resets WHERE user_id = $1', [match.user_id]);
    await query('DELETE FROM sessions WHERE user_id = $1', [match.user_id]);
    return ok(res, { message: 'Senha redefinida com sucesso.' });
  }

  // DELETE /api/auth/account
  if (req.method === 'DELETE' && path === '/api/auth/account') {
    const user = await requireAuth(req, res);
    if (!user) return;
    await query('DELETE FROM sessions WHERE user_id = $1', [user.id]);
    await query('DELETE FROM users WHERE id = $1', [user.id]);
    clearSessionCookie(res);
    return ok(res, { message: 'Conta excluída.' });
  }

  return null;
}

module.exports = { handle, getSession, requireAuth };