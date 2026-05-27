-- ================================================================
-- POLÍTICA DE RETENÇÃO LGPD — Caverna NFC
-- Rodar manualmente ou agendar via pg_cron / job externo
-- ================================================================

-- 1. Anonimiza logs de acesso com mais de 90 dias
--    Mantém o registro para fins estatísticos, mas remove dados pessoais
UPDATE acesso_log
SET
  ip          = 'anonimizado',
  user_agent  = 'anonimizado',
  geo_cidade  = NULL
WHERE
  acessado_em < NOW() - INTERVAL '90 days'
  AND ip != 'anonimizado';

-- 2. Remove logs de acesso com mais de 1 ano (após anonimização prévia)
DELETE FROM acesso_log
WHERE acessado_em < NOW() - INTERVAL '1 year';

-- 3. Anonimiza dados pessoais de pedidos cujos chaveiros foram cancelados há mais de 90 dias
UPDATE pedido
SET
  nome_comprador  = 'removido',
  email_comprador = 'removido@removido.com',
  telefone        = NULL,
  termos_ip       = NULL
WHERE
  chaveiro_id IN (
    SELECT id FROM chaveiro_nfc
    WHERE status = 'cancelado'
    AND criado_em < NOW() - INTERVAL '90 days'
  )
  AND nome_comprador != 'removido';
