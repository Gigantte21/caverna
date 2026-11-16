-- 003 — compra pela loja pública com pagamento Asaas (2026-11-16)
-- Pode rodar de novo sem efeito.
ALTER TABLE pedido ADD COLUMN IF NOT EXISTS origem VARCHAR(8) NOT NULL DEFAULT 'admin';   -- 'admin' ou 'loja'
ALTER TABLE pedido ADD COLUMN IF NOT EXISTS frete NUMERIC(10,2) NOT NULL DEFAULT 0;
ALTER TABLE pedido ADD COLUMN IF NOT EXISTS observacoes TEXT;                             -- o que gravar na peça
ALTER TABLE pedido ADD COLUMN IF NOT EXISTS cep VARCHAR(9);
ALTER TABLE pedido ADD COLUMN IF NOT EXISTS logradouro VARCHAR(255);
ALTER TABLE pedido ADD COLUMN IF NOT EXISTS numero VARCHAR(16);
ALTER TABLE pedido ADD COLUMN IF NOT EXISTS complemento VARCHAR(64);
ALTER TABLE pedido ADD COLUMN IF NOT EXISTS bairro VARCHAR(64);
ALTER TABLE pedido ADD COLUMN IF NOT EXISTS cidade VARCHAR(64);
ALTER TABLE pedido ADD COLUMN IF NOT EXISTS uf CHAR(2);
ALTER TABLE pedido ADD COLUMN IF NOT EXISTS asaas_payment_id VARCHAR(64);
ALTER TABLE pedido ADD COLUMN IF NOT EXISTS asaas_invoice_url TEXT;
ALTER TABLE pedido ADD COLUMN IF NOT EXISTS asaas_verificado_em TIMESTAMPTZ;
ALTER TABLE pedido ADD COLUMN IF NOT EXISTS acompanhamento_token VARCHAR(64);
ALTER TABLE pedido ADD COLUMN IF NOT EXISTS criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW();
CREATE UNIQUE INDEX IF NOT EXISTS idx_pedido_asaas ON pedido(asaas_payment_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_pedido_acompanhamento ON pedido(acompanhamento_token);
