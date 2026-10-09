'use strict';

function normalizePhone(raw) {
  if (!raw) return null;
  let digits = raw.replace(/\D/g, '');
  if (digits.startsWith('55') && digits.length >= 12) return '+' + digits;
  if (digits.length === 11 || digits.length === 10) return '+55' + digits;
  return '+' + digits;
}

function buildWhatsAppLink(phone, message) {
  const clean = (phone || '').replace(/\D/g, '');
  const encoded = encodeURIComponent(message || '');
  return `https://wa.me/${clean}?text=${encoded}`;
}

module.exports = { normalizePhone, buildWhatsAppLink };
