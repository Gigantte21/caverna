CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE chaveiro_nfc (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  codigo_unico VARCHAR(32) UNIQUE NOT NULL,
  nfc_uid VARCHAR(64) UNIQUE,
  status VARCHAR(16) NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','ativo','bloqueado','cancelado')),
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ativado_em TIMESTAMPTZ
);

CREATE TABLE pedido (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  chaveiro_id UUID NOT NULL REFERENCES chaveiro_nfc(id),
  produto VARCHAR(32) NOT NULL DEFAULT 'chaveiro',
  finalidade VARCHAR(16) NOT NULL DEFAULT 'venda', -- 'venda' ou 'marketing' (cortesia, fora do faturamento)
  nome_comprador VARCHAR(255) NOT NULL,
  email_comprador VARCHAR(255) NOT NULL,
  telefone VARCHAR(32),
  metodo_pagamento VARCHAR(32),
  valor_pago NUMERIC(10,2),
  status_pagamento VARCHAR(16) NOT NULL DEFAULT 'pendente' CHECK (status_pagamento IN ('pendente','pago','estornado')),
  termos_aceitos BOOLEAN NOT NULL DEFAULT FALSE,
  termos_versao VARCHAR(8) NOT NULL DEFAULT 'v1.0',
  termos_aceitos_em TIMESTAMPTZ,
  termos_ip VARCHAR(64),
  pago_em TIMESTAMPTZ
);

CREATE TABLE link_token (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  chaveiro_id UUID NOT NULL REFERENCES chaveiro_nfc(id),
  tipo VARCHAR(16) NOT NULL CHECK (tipo IN ('formulario','admin')),
  token_jwt TEXT NOT NULL,
  usado BOOLEAN NOT NULL DEFAULT FALSE,
  expira_em TIMESTAMPTZ NOT NULL,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE pagina_romantica (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  chaveiro_id UUID NOT NULL UNIQUE REFERENCES chaveiro_nfc(id),
  slug_url VARCHAR(64) UNIQUE NOT NULL,
  titulo_personalizado VARCHAR(255),
  mensagem_especial TEXT,
  data_inicio_relacionamento DATE,
  tema VARCHAR(32) NOT NULL DEFAULT 'classico',
  mensagem_encerramento TEXT,
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE midia (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  pagina_id UUID NOT NULL REFERENCES pagina_romantica(id) ON DELETE CASCADE,
  tipo VARCHAR(16) NOT NULL CHECK (tipo IN ('foto','video','musica')),
  url TEXT NOT NULL,
  ordem INT NOT NULL DEFAULT 0,
  legenda VARCHAR(255),
  data_foto DATE,
  is_carrossel BOOLEAN NOT NULL DEFAULT FALSE,
  enviado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE playlist_spotify (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  pagina_id UUID NOT NULL UNIQUE REFERENCES pagina_romantica(id) ON DELETE CASCADE,
  spotify_url TEXT NOT NULL,
  nome_playlist VARCHAR(255),
  tema VARCHAR(64)
);

CREATE TABLE qr_code (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  pagina_id UUID NOT NULL UNIQUE REFERENCES pagina_romantica(id) ON DELETE CASCADE,
  url_destino TEXT NOT NULL,
  url_imagem TEXT NOT NULL,
  gerado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE timeline_eventos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  pagina_id UUID NOT NULL REFERENCES pagina_romantica(id) ON DELETE CASCADE,
  titulo VARCHAR(255) NOT NULL,
  descricao TEXT,
  data_evento DATE NOT NULL,
  ordem INT NOT NULL DEFAULT 0
);

CREATE TABLE acesso_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  pagina_id UUID NOT NULL REFERENCES pagina_romantica(id) ON DELETE CASCADE,
  link_token_id UUID REFERENCES link_token(id) ON DELETE SET NULL,
  ip VARCHAR(64),
  user_agent TEXT,
  geo_pais VARCHAR(64),
  geo_cidade VARCHAR(64),
  origem VARCHAR(16) CHECK (origem IN ('nfc','qrcode','link_direto','formulario')),
  acessado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_chaveiro_status ON chaveiro_nfc(status);
CREATE INDEX idx_pagina_slug ON pagina_romantica(slug_url);
CREATE INDEX idx_acesso_pagina ON acesso_log(pagina_id);
CREATE INDEX idx_token_chaveiro ON link_token(chaveiro_id);
CREATE INDEX idx_midia_pagina ON midia(pagina_id);
CREATE INDEX idx_timeline_pagina ON timeline_eventos(pagina_id);
