-- Pagamento da assinatura por Pix (cada Pix pago libera 30 dias) — 15/10/2026
CREATE TABLE IF NOT EXISTS pix_pagamentos (
  id           TEXT PRIMARY KEY,               -- id do pagamento no Mercado Pago
  user_id      BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  valor        NUMERIC(10,2) NOT NULL,
  status       TEXT NOT NULL DEFAULT 'pending',
  criado_em    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  aprovado_em  TIMESTAMPTZ,
  creditado    BOOLEAN NOT NULL DEFAULT false   -- já somou os 30 dias (evita somar duas vezes)
);
CREATE INDEX IF NOT EXISTS idx_pix_pagamentos_user ON pix_pagamentos(user_id);
ALTER TABLE pix_pagamentos ENABLE ROW LEVEL SECURITY;

-- Último aviso de "seu Pix vence em breve" enviado
ALTER TABLE users ADD COLUMN IF NOT EXISTS pix_aviso_em TIMESTAMPTZ;
