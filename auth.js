'use strict';
const crypto = require('crypto');
const { SESSION_SECRET } = require('./config');

// Hash de senha com scrypt nativo
async function hashPassword(password) {
  return new Promise((resolve, reject) => {
    const salt = crypto.randomBytes(16).toString('hex');
    crypto.scrypt(password, salt, 64, (err, derivedKey) => {
      if (err) reject(err);
      else resolve(`${salt}:${derivedKey.toString('hex')}`);
    });
  });
}

async function verifyPassword(password, stored) {
  return new Promise((resolve, reject) => {
    const [salt, hash] = stored.split(':');
    crypto.scrypt(password, salt, 64, (err, derivedKey) => {
      if (err) reject(err);
      else resolve(crypto.timingSafeEqual(Buffer.from(hash, 'hex'), derivedKey));
    });
  });
}

// Token de sessão: HMAC-SHA256 sobre valor aleatório
function generateSessionToken() {
  const raw = crypto.randomBytes(32).toString('hex');
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(raw).digest('hex');
  return `${raw}.${sig}`;
}

function verifySessionToken(token) {
  if (!token || typeof token !== 'string') return null;
  const [raw, sig] = token.split('.');
  if (!raw || !sig) return null;
  const expected = crypto.createHmac('sha256', SESSION_SECRET).update(raw).digest('hex');
  try {
    const valid = crypto.timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex'));
    return valid ? raw : null;
  } catch { return null; }
}

// Hash de token público (para códigos SMS, links de recuperação etc.)
function hashToken(value) {
  return crypto.createHmac('sha256', SESSION_SECRET).update(String(value)).digest('hex');
}

function hashesMatch(value, storedHash) {
  const h = hashToken(value);
  try {
    return crypto.timingSafeEqual(Buffer.from(h, 'hex'), Buffer.from(storedHash, 'hex'));
  } catch { return false; }
}

module.exports = { hashPassword, verifyPassword, generateSessionToken, verifySessionToken, hashToken, hashesMatch };
