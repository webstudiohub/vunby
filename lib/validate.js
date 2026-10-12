'use strict';

function isEmail(v) { return typeof v === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim()); }
function isPhone(v) { return typeof v === 'string' && /^\+?[\d\s\-()]{8,20}$/.test(v.trim()); }
function isNonEmpty(v) { return typeof v === 'string' && v.trim().length > 0; }
function isPositiveNumber(v) { const n = parseFloat(v); return Number.isFinite(n) && n >= 0 && n <= 100_000_000; }
// Data 'AAAA-MM-DD' válida (ou vazia)
function isDateOrEmpty(v) { return v == null || v === '' || (/^\d{4}-\d{2}-\d{2}$/.test(String(v)) && !isNaN(Date.parse(v))); }

module.exports = { isEmail, isPhone, isNonEmpty, isPositiveNumber, isDateOrEmpty };
