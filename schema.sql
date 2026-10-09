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
-- ROW LEVEL SECURITY (recomendado no Supabase)
-- Desabilita o RLS do Supabase pois usamos
-- nossa própria autenticação via Node.js
-- ─────────────────────────────────────────────
ALTER TABLE users               DISABLE ROW LEVEL SECURITY;
ALTER TABLE sessions            DISABLE ROW LEVEL SECURITY;
ALTER TABLE phone_verifications DISABLE ROW LEVEL SECURITY;
ALTER TABLE verified_trial_phones DISABLE ROW LEVEL SECURITY;
ALTER TABLE password_resets     DISABLE ROW LEVEL SECURITY;
ALTER TABLE clients             DISABLE ROW LEVEL SECURITY;
ALTER TABLE package_templates   DISABLE ROW LEVEL SECURITY;
ALTER TABLE quotes              DISABLE ROW LEVEL SECURITY;
ALTER TABLE quote_packages      DISABLE ROW LEVEL SECURITY;
ALTER TABLE follow_ups          DISABLE ROW LEVEL SECURITY;
