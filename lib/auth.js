'use strict';
const bcrypt = require('bcrypt');

async function hashPassword(password) {
  return bcrypt.hash(password, 10);
}

async function verifyPassword(password, hash) {
  return bcrypt.compare(password, hash);
}

function hashesMatch(plain, hash) {
  const crypto = require('crypto');
  const h = crypto.createHash('sha256').update(plain).digest('hex');
  return h === hash;
}

module.exports = { hashPassword, verifyPassword, hashesMatch };
