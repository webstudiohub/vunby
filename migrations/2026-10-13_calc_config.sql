-- Preços padrão das calculadoras (mudança, depois m²), por prestador
ALTER TABLE users ADD COLUMN IF NOT EXISTS calc_config JSONB;
