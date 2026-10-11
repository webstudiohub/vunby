'use strict';
// Rate limit persistido no Postgres (tabela rate_limits), para não zerar a cada
// reinício/deploy do Render. Se o banco falhar, cai para um contador em memória
// (melhor limitar "mais ou menos" do que derrubar o login).
const { query } = require('./db');

const buckets = new Map();

function memoryLimit(key, maxRequests, windowMs) {
  const now = Date.now();
  let bucket = buckets.get(key);
  if (!bucket || now - bucket.start > windowMs) {
    bucket = { count: 0, start: now };
    buckets.set(key, bucket);
  }
  bucket.count++;
  return bucket.count <= maxRequests;
}

// Incrementa o contador da chave de forma atômica e devolve true se ainda está dentro do limite.
async function rateLimit(key, maxRequests = 10, windowMs = 60_000) {
  try {
    const r = await query(
      `INSERT INTO rate_limits (key, count, window_start) VALUES ($1, 1, NOW())
       ON CONFLICT (key) DO UPDATE SET
         count = CASE WHEN rate_limits.window_start < NOW() - make_interval(secs => $2) THEN 1 ELSE rate_limits.count + 1 END,
         window_start = CASE WHEN rate_limits.window_start < NOW() - make_interval(secs => $2) THEN NOW() ELSE rate_limits.window_start END
       RETURNING count`,
      [key, windowMs / 1000]
    );
    // Limpeza ocasional de chaves velhas (~1% das chamadas)
    if (Math.random() < 0.01) {
      query(`DELETE FROM rate_limits WHERE window_start < NOW() - INTERVAL '1 day'`).catch(() => {});
    }
    return r.rows[0].count <= maxRequests;
  } catch (err) {
    console.error('rateLimit: falha no Postgres, usando memória:', err.message);
    return memoryLimit(key, maxRequests, windowMs);
  }
}

// Zera o contador de uma chave (ex.: após verificação bem-sucedida)
async function resetLimit(key) {
  buckets.delete(key);
  try { await query('DELETE FROM rate_limits WHERE key = $1', [key]); } catch { /* ignora */ }
}

setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of buckets.entries()) {
    if (now - bucket.start > 300_000) buckets.delete(key);
  }
}, 300_000).unref();

module.exports = { rateLimit, resetLimit };
