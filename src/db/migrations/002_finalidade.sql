-- 002 — finalidade do pedido: venda ou peça de marketing/cortesia (2026-11-16)
-- Peças de marketing não entram no faturamento. Pode rodar de novo sem efeito.
ALTER TABLE pedido ADD COLUMN IF NOT EXISTS finalidade VARCHAR(16) NOT NULL DEFAULT 'venda';
