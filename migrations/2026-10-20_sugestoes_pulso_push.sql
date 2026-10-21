-- Sugestões livres, pesquisa curta trimestral e notificações push — 20/10/2026
CREATE TABLE IF NOT EXISTS sugestoes (
  id         BIGSERIAL PRIMARY KEY,
  user_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tipo       TEXT NOT NULL DEFAULT 'ideia' CHECK (tipo IN ('ideia','problema','elogio')),
  mensagem   TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_sugestoes_user ON sugestoes(user_id);
ALTER TABLE sugestoes ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS pulso (
  id         BIGSERIAL PRIMARY KEY,
  user_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  nota       SMALLINT NOT NULL CHECK (nota BETWEEN 0 AND 10),
  comentario TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pulso_user ON pulso(user_id, created_at DESC);
ALTER TABLE pulso ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ADD COLUMN IF NOT EXISTS pulso_adiado_ate TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS push_inscricoes (
  id         BIGSERIAL PRIMARY KEY,
  user_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint   TEXT NOT NULL UNIQUE,
  p256dh     TEXT NOT NULL,
  auth       TEXT NOT NULL,
  criado_em  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ultimo_ok  TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_push_user ON push_inscricoes(user_id);
ALTER TABLE push_inscricoes ENABLE ROW LEVEL SECURITY;
