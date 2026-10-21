-- Contador de visitas do site, sem cookies e sem guardar IP (21/10/2026)
CREATE TABLE IF NOT EXISTS site_visitas (
  dia      DATE NOT NULL,
  pagina   TEXT NOT NULL,
  origem   TEXT NOT NULL,
  visitas  INT  NOT NULL DEFAULT 0,
  unicos   INT  NOT NULL DEFAULT 0,
  PRIMARY KEY (dia, pagina, origem)
);
ALTER TABLE site_visitas ENABLE ROW LEVEL SECURITY;
