# Caverna NFC — Backend MVP

## Stack
- Node.js 18+ / Fastify
- PostgreSQL (Neon)
- Hospedagem: Render (Starter, não dorme)
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

No Neon, abra o **SQL Editor** e cole o conteúdo de `src/db/schema.sql`.

`src/db/lgpd.sql` não é de instalação: é a limpeza periódica (LGPD) — rode de tempos em tempos.

## Deploy (Render + Neon)

1. Neon: crie um projeto na região AWS us-east-1 e copie a connection string
2. Rode o `schema.sql` no SQL Editor do Neon
3. Render: New → Blueprint → escolha este repositório (lê o `render.yaml`)
4. Preencha as variáveis pedidas (`DATABASE_URL`, `BASE_URL`, `R2_*`)
5. `JWT_SECRET` e `ADMIN_TOKEN` são gerados pelo Render — veja o token no painel
6. Deploy automático a cada `git push` na branch `main`

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
