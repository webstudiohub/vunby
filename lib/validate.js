'use strict';

function isEmail(v) { return typeof v === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim()); }
function isPhone(v) { return typeof v === 'string' && /^\+?[\d\s\-()]{8,20}$/.test(v.trim()); }
function isNonEmpty(v) { return typeof v === 'string' && v.trim().length > 0; }
function isPositiveNumber(v) { const n = parseFloat(v); return !isNaN(n) && n >= 0; }

module.exports = { isEmail, isPhone, isNonEmpty, isPositiveNumber };
