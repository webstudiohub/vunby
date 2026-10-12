'use strict';

// Devolvem true: em server.js os handlers são encadeados com "??", e só null/undefined
// passa para o próximo. Retornar true garante que a requisição pare aqui depois de respondida.
function json(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
  return true;
}

function ok(res, data = {}) { return json(res, 200, data); }
function created(res, data = {}) { return json(res, 201, data); }
function badRequest(res, message = 'Dados inválidos') { return json(res, 400, { error: message }); }
function unauthorized(res, message = 'Não autorizado') { return json(res, 401, { error: message }); }
function forbidden(res, message = 'Proibido') { return json(res, 403, { error: message }); }
function notFound(res, message = 'Não encontrado') { return json(res, 404, { error: message }); }
function conflict(res, message = 'Conflito') { return json(res, 409, { error: message }); }
function serverError(res, message = 'Erro interno') { return json(res, 500, { error: message }); }

async function readBody(req, maxBytes = 100_000) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => { body += chunk; if (body.length > maxBytes) { req.destroy(); reject(new Error('Payload muito grande')); } });
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
