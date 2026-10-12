'use strict';
// Datas no fuso de Brasília (UTC-3), formato 'AAAA-MM-DD'
function todayBR() {
  return new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10);
}
function dateOnly(v) {
  if (!v) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).slice(0, 10);
}
// Expira no fim do dia da validade (horário de Brasília)
function isExpired(validade) {
  const d = dateOnly(validade);
  return !!d && d < todayBR();
}
module.exports = { todayBR, dateOnly, isExpired };
