-- 001 — tipo de produto vendido em cada pedido (2026-11-15)
-- Bancos criados antes desta data: rodar uma vez. Pode rodar de novo sem efeito.
ALTER TABLE pedido ADD COLUMN IF NOT EXISTS produto VARCHAR(32) NOT NULL DEFAULT 'chaveiro';
