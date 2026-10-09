'use strict';

const buckets = new Map();

function rateLimit(key, maxRequests = 10, windowMs = 60_000) {
  const now = Date.now();
  let bucket = buckets.get(key);
  if (!bucket || now - bucket.start > windowMs) {
    bucket = { count: 0, start: now };
    buckets.set(key, bucket);
  }
  bucket.count++;
  return bucket.count <= maxRequests;
}

// Limpa buckets antigos a cada 5 minutos
setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of buckets.entries()) {
    if (now - bucket.start > 300_000) buckets.delete(key);
  }
}, 300_000).unref();

module.exports = { rateLimit };
