-- =============================================
-- VUNBY — Schema SQL para Supabase (Postgres)
-- Rodar no Editor SQL do Supabase
-- =============================================

-- Extensão para UUIDs (opcional, não usamos UUID aqui mas é boa prática)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─────────────────────────────────────────────
-- USUÁRIOS
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id                   BIGSERIAL PRIMARY KEY,
  nome                 TEXT NOT NULL,
  email                TEXT NOT NULL UNIQUE,
  senha_hash           TEXT NOT NULL,
  telefone             TEXT NOT NULL,
  telefone_verificado  BOOLEAN NOT NULL DEFAULT FALSE,
  trial_concedido      BOOLEAN NOT NULL DEFAULT FALSE,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- ─────────────────────────────────────────────
-- SESSÕES
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sessions (
  id          BIGSERIAL PRIMARY KEY,
  user_id     BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  TEXT NOT NULL UNIQUE,
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sessions_token_hash ON sessions(token_hash);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);

-- ─────────────────────────────────────────────
-- VERIFICAÇÕES DE TELEFONE
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS phone_verifications (
  id          BIGSERIAL PRIMARY KEY,
  user_id     BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash   TEXT NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────
-- TELEFONES COM TRIAL JÁ CONCEDIDO
-- Persiste após exclusão de conta (não apaga)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS verified_trial_phones (
  id          BIGSERIAL PRIMARY KEY,
  phone_hash  TEXT NOT NULL UNIQUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────
-- RECUPERAÇÃO DE SENHA
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS password_resets (
  id          BIGSERIAL PRIMARY KEY,
  user_id     BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  TEXT NOT NULL UNIQUE,
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────
-- CLIENTES
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS clients (
  id           BIGSERIAL PRIMARY KEY,
  user_id      BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  nome         TEXT NOT NULL,
  telefone     TEXT NOT NULL,
  observacoes  TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_clients_user_id ON clients(user_id);

-- ─────────────────────────────────────────────
-- MODELOS DE PACOTE (templates — reutilizáveis)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS package_templates (
  id          BIGSERIAL PRIMARY KEY,
  user_id     BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  nome        TEXT NOT NULL,
  conteudo    TEXT,
  preco       NUMERIC(12,2) NOT NULL DEFAULT 0,
  destaque    BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────
-- ORÇAMENTOS
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS quotes (
  id                BIGSERIAL PRIMARY KEY,
  user_id           BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client_id         BIGINT NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
  servico           TEXT NOT NULL,
  valor             NUMERIC(12,2) NOT NULL DEFAULT 0,
  validade          DATE,
  observacoes       TEXT,
  status            TEXT NOT NULL DEFAULT 'Enviado'
                    CHECK (status IN ('Enviado','Visualizado','Sem resposta','Aprovado','Recusado')),
  public_token      TEXT NOT NULL UNIQUE,
  precisa_follow_up BOOLEAN NOT NULL DEFAULT FALSE,
  resposta_cliente  TEXT,
  viewed_at         TIMESTAMPTZ,
  responded_at      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_quotes_user_id ON quotes(user_id);
CREATE INDEX IF NOT EXISTS idx_quotes_public_token ON quotes(public_token);
CREATE INDEX IF NOT EXISTS idx_quotes_status ON quotes(user_id, status);

-- ─────────────────────────────────────────────
-- PACOTES DO ORÇAMENTO (snapshot congelado)
-- Editar o template NÃO altera estes registros
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS quote_packages (
  id           BIGSERIAL PRIMARY KEY,
  quote_id     BIGINT NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  template_id  BIGINT REFERENCES package_templates(id) ON DELETE SET NULL,
  nome         TEXT NOT NULL,
  conteudo     TEXT,
  preco        NUMERIC(12,2) NOT NULL DEFAULT 0,
  destaque     BOOLEAN NOT NULL DEFAULT FALSE,
  escolhido    BOOLEAN NOT NULL DEFAULT FALSE
);

-- ─────────────────────────────────────────────
-- FOLLOW-UPS
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS follow_ups (
  id           BIGSERIAL PRIMARY KEY,
  quote_id     BIGINT NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  mensagem     TEXT,
  estado       TEXT NOT NULL DEFAULT 'preparado'
               CHECK (estado IN ('preparado','enviado')),
  confirmed_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_followups_quote_id ON follow_ups(quote_id);

-- ─────────────────────────────────────────────
-- TRIGGER: atualiza updated_at automaticamente
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_quotes_updated_at
  BEFORE UPDATE ON quotes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─────────────────────────────────────────────
-- ADIÇÕES POSTERIORES (já aplicadas no Supabase)
-- ─────────────────────────────────────────────
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verificado BOOLEAN DEFAULT false;

CREATE TABLE IF NOT EXISTS email_verifications (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash  TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Marca do prestador no orçamento (Conta → Sua marca)
ALTER TABLE users ADD COLUMN IF NOT EXISTS nome_empresa TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS logo TEXT;

-- Rate limit persistente (lib/rateLimit.js)
CREATE TABLE IF NOT EXISTS rate_limits (
  key          TEXT PRIMARY KEY,
  count        INTEGER NOT NULL DEFAULT 0,
  window_start TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_rate_limits_window_start ON rate_limits(window_start);

ALTER FUNCTION update_updated_at() SET search_path = '';

-- ─────────────────────────────────────────────
-- ROW LEVEL SECURITY
-- LIGADO em todas as tabelas, SEM políticas. Isso bloqueia o acesso pela API
-- pública do Supabase (roles anon/authenticated). O servidor Node conecta como
-- "postgres" (dono das tabelas, com BYPASSRLS), então não é afetado.
-- Atenção: se um dia o servidor passar a conectar com outro usuário, ele
-- precisa ser dono das tabelas ou ter BYPASSRLS, senão o app para.
-- ─────────────────────────────────────────────
ALTER TABLE users                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions              ENABLE ROW LEVEL SECURITY;
ALTER TABLE phone_verifications   ENABLE ROW LEVEL SECURITY;
ALTER TABLE verified_trial_phones ENABLE ROW LEVEL SECURITY;
ALTER TABLE password_resets       ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients               ENABLE ROW LEVEL SECURITY;
ALTER TABLE package_templates     ENABLE ROW LEVEL SECURITY;
ALTER TABLE quotes                ENABLE ROW LEVEL SECURITY;
ALTER TABLE quote_packages        ENABLE ROW LEVEL SECURITY;
ALTER TABLE follow_ups            ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_verifications   ENABLE ROW LEVEL SECURITY;
ALTER TABLE rate_limits           ENABLE ROW LEVEL SECURITY;
