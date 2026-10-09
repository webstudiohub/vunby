'use strict';
const crypto = require('crypto');

function generatePublicToken() {
  return crypto.randomBytes(24).toString('base64url');
}

function generateCode(digits = 6) {
  const max = Math.pow(10, digits);
  return String(Math.floor(Math.random() * max)).padStart(digits, '0');
}

module.exports = { generatePublicToken, generateCode };
