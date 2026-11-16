-- ================================================================
-- POLÍTICA DE RETENÇÃO LGPD — Caverna NFC
-- Rodar manualmente ou agendar via pg_cron / job externo
-- ================================================================

-- 1. Anonimiza logs de acesso com mais de 6 meses
--    Marco Civil da Internet (Lei 12.965/2014, art. 15): registros de acesso
--    (IP, data e hora) devem ser guardados por 6 meses — não anonimizar antes.
--    Depois disso, mantém o registro só para estatística, sem dado pessoal.
UPDATE acesso_log
SET
  ip          = 'anonimizado',
  user_agent  = 'anonimizado',
  geo_cidade  = NULL
WHERE
  acessado_em < NOW() - INTERVAL '6 months'
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
  termos_ip       = NULL,
  observacoes     = NULL,
  cep = NULL, logradouro = NULL, numero = NULL, complemento = NULL, bairro = NULL
WHERE
  chaveiro_id IN (
    SELECT id FROM chaveiro_nfc
    WHERE status = 'cancelado'
    AND criado_em < NOW() - INTERVAL '90 days'
  )
  AND nome_comprador != 'removido';
