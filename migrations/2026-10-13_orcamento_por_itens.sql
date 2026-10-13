-- Orçamento por itens (etapa 1): itens com tipo incluído/opcional/recomendado, desconto, taxa, sinal,
-- versão do orçamento e registro congelado da aprovação.
CREATE TABLE IF NOT EXISTS quote_items (
  id           BIGSERIAL PRIMARY KEY,
  quote_id     BIGINT NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  posicao      INT NOT NULL DEFAULT 0,
  descricao    TEXT NOT NULL,
  qtd          NUMERIC(12,3) NOT NULL DEFAULT 1,
  unidade      TEXT NOT NULL DEFAULT 'un',
  preco_cents  BIGINT NOT NULL DEFAULT 0,
  tipo         TEXT NOT NULL DEFAULT 'incluido' CHECK (tipo IN ('incluido','opcional','recomendado')),
  escolhido    BOOLEAN,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_quote_items_quote ON quote_items(quote_id, posicao);
ALTER TABLE quote_items ENABLE ROW LEVEL SECURITY;

ALTER TABLE quotes
  ADD COLUMN IF NOT EXISTS usa_itens      BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS desconto_cents BIGINT  NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS taxa_cents     BIGINT  NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS taxa_nome      TEXT,
  ADD COLUMN IF NOT EXISTS sinal_pct      NUMERIC(5,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS condicoes      TEXT,
  ADD COLUMN IF NOT EXISTS versao         INT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS aprovacao      JSONB;
