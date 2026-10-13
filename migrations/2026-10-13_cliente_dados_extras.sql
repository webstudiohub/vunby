-- Dados opcionais do cliente: e-mail, endereço do serviço e CPF/CNPJ
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS email     TEXT,
  ADD COLUMN IF NOT EXISTS endereco  TEXT,
  ADD COLUMN IF NOT EXISTS documento TEXT;
