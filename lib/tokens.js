'use strict';
const crypto = require('crypto');

function generatePublicToken() {
  return crypto.randomBytes(24).toString('base64url');
}

// Código numérico com gerador criptográfico (Math.random é previsível)
function generateCode(digits = 6) {
  let out = '';
  for (let i = 0; i < digits; i++) out += crypto.randomInt(0, 10);
  return out;
}

function generateSessionToken() {
  return crypto.randomBytes(32).toString('base64url');
}

function verifySessionToken(token) {
  if (!token || typeof token !== 'string') return null;
  return token;
}

function hashToken(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

module.exports = { generatePublicToken, generateCode, generateSessionToken, verifySessionToken, hashToken };
