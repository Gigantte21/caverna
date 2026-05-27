# Caverna NFC — Backend MVP

## Stack
- Node.js 18+ / Fastify
- PostgreSQL (Railway)
- Cloudflare R2 (storage de mídia)
- Cloudflare (proxy, SSL, cache)

## Setup local

```bash
cp .env.example .env
# preencha o .env

npm install
node src/server.js
```

## Setup banco

No Railway, abra o shell do PostgreSQL e rode:

```bash
psql $DATABASE_URL < src/db/schema.sql
```

## Deploy Railway

1. Crie projeto no Railway
2. Adicione serviço PostgreSQL
3. Conecte repositório GitHub
4. Configure variáveis de ambiente (copie do `.env.example`)
5. Deploy automático a cada `git push`

## Endpoints

### Admin (header: `Authorization: Bearer $ADMIN_TOKEN`)

| Método | Rota | Descrição |
|--------|------|-----------|
| POST | `/admin/chaveiros` | Cria novo chaveiro |
| GET | `/admin/chaveiros` | Lista todos |
| PATCH | `/admin/chaveiros/:id/status` | Ativa/bloqueia/cancela |
| POST | `/admin/chaveiros/:id/pedido` | Registra venda + gera link formulário |
| GET | `/admin/chaveiros/:id/logs` | Logs de acesso |

### Formulário (query: `?t=TOKEN_JWT`)

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/formulario/dados` | Verifica se já preencheu |
| POST | `/formulario/submit` | Salva conteúdo da página |
| POST | `/formulario/midia` | Upload de fotos/vídeos/músicas |

### Público

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/p/:slug` | Exibe página romântica |
| GET | `/health` | Health check |

## Fluxo completo

1. Admin cria chaveiro → `POST /admin/chaveiros`
2. Admin registra venda → `POST /admin/chaveiros/:id/pedido`
   - Retorna `link_formulario` pra enviar ao cliente
3. Cliente acessa o link → preenche formulário → faz upload de mídias
4. Sistema gera slug único → página fica ativa em `/p/:slug`
5. NFC aponta pra `BASE_URL/p/:slug?origem=nfc`
6. Cada acesso é logado com IP, device e origem

## Segurança

- Link do formulário expira em 7 dias e é de uso único
- Página ativa enquanto `chaveiro_nfc.status = 'ativo'`
- Bloquear chaveiro desativa a página instantaneamente
- Todo acesso registrado para fins jurídicos
- Admin protegido por token fixo no `.env`
