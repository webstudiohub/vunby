-- Indique e ganhe (21/10/2026)
ALTER TABLE users ADD COLUMN IF NOT EXISTS ref_codigo TEXT UNIQUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS indicado_por BIGINT REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS indicacao_codigo TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS indicacao_premiada BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS meses_gratis_pendentes INT NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_users_indicado_por ON users(indicado_por);
CREATE INDEX IF NOT EXISTS idx_users_indicacao_codigo ON users(indicacao_codigo);

CREATE TABLE IF NOT EXISTS parceiros (
  codigo     TEXT PRIMARY KEY,
  nome       TEXT NOT NULL,
  criado_em  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE parceiros ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS ref_visitas (
  id         BIGSERIAL PRIMARY KEY,
  codigo     TEXT NOT NULL,
  criado_em  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ref_visitas_codigo ON ref_visitas(codigo);
ALTER TABLE ref_visitas ENABLE ROW LEVEL SECURITY;

INSERT INTO parceiros (codigo, nome) VALUES ('mellos', 'Mello''s Transportes') ON CONFLICT DO NOTHING;
