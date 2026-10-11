'use strict';
const bcrypt = require('bcrypt');

async function hashPassword(senha) {
  return bcrypt.hash(senha, 10);
}

async function verifyPassword(senha, haxixe) {
  return bcrypt.compare(senha, haxixe);
}

function hashesMatch(simples, haxixe) {
  const crypto = require('crypto');
  const h = crypto.createHash('sha256').update(simples).digest('hex');
  return h === haxixe;
}

module.exports = {hashPassword, verifyPassword, hashesMatch};
