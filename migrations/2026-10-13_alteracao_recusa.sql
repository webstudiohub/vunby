-- Cliente pode pedir alteração no orçamento e dizer o motivo da recusa
ALTER TABLE quotes
  ADD COLUMN IF NOT EXISTS alteracao_texto      TEXT,
  ADD COLUMN IF NOT EXISTS alteracao_em         TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS alteracao_resolvida  BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS recusa_motivo        TEXT;
