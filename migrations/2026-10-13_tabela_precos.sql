-- "Minha tabela de preços": serviços e móveis de cada prestador, com o preço dele
CREATE TABLE IF NOT EXISTS catalog_items (
  id           BIGSERIAL PRIMARY KEY,
  user_id      BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  grupo        TEXT NOT NULL DEFAULT 'Serviços',
  nome         TEXT NOT NULL,
  unidade      TEXT NOT NULL DEFAULT 'un',
  preco_cents  BIGINT NOT NULL DEFAULT 0,
  m3           NUMERIC(8,3),            -- móveis (mudança): volume por peça
  capacidade_m3 NUMERIC(8,2),           -- veículos (mudança): quanto cabe
  desmonta     BOOLEAN NOT NULL DEFAULT FALSE,
  preco_desm_cents BIGINT NOT NULL DEFAULT 0,
  preco_mont_cents BIGINT NOT NULL DEFAULT 0,
  posicao      INT NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_catalog_user ON catalog_items(user_id, grupo, posicao);
ALTER TABLE catalog_items ENABLE ROW LEVEL SECURITY;
