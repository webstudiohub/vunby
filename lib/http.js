'use strict';

function json(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function ok(res, data = {}) { json(res, 200, data); }
function created(res, data = {}) { json(res, 201, data); }
function badRequest(res, message = 'Dados inválidos') { json(res, 400, { error: message }); }
function unauthorized(res, message = 'Não autorizado') { json(res, 401, { error: message }); }
function forbidden(res, message = 'Proibido') { json(res, 403, { error: message }); }
function notFound(res, message = 'Não encontrado') { json(res, 404, { error: message }); }
function conflict(res, message = 'Conflito') { json(res, 409, { error: message }); }
function serverError(res, message = 'Erro interno') { json(res, 500, { error: message }); }

async function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => { body += chunk; if (body.length > 100_000) { req.destroy(); reject(new Error('Payload muito grande')); } });
    req.on('end', () => { try { resolve(body ? JSON.parse(body) : {}); } catch { reject(new Error('JSON inválido')); } });
    req.on('error', reject);
  });
}

function parseSession(req) {
  const cookie = req.headers.cookie || '';
  const match = cookie.match(/(?:^|;\s*)session=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

function setSessionCookie(res, token, maxAgeSec = 30 * 24 * 3600) {
  res.setHeader('Set-Cookie', `session=${encodeURIComponent(token)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAgeSec}`);
}

function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', 'session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');
}

module.exports = { json, ok, created, badRequest, unauthorized, forbidden, notFound, conflict, serverError, readBody, parseSession, setSessionCookie, clearSessionCookie };
