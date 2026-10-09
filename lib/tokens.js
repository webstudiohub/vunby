'use strict';
const crypto = require('crypto');

function generatePublicToken() {
  return crypto.randomBytes(24).toString('base64url');
}

function generateCode(digits = 6) {
  const max = Math.pow(10, digits);
  return String(Math.floor(Math.random() * max)).padStart(digits, '0');
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
