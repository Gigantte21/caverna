# Configuração do Chip NFC

## Chip recomendado
NTAG213 ou NTAG215 — ambos funcionam. O NTAG213 é mais barato e suficiente.

## URL a gravar no chip

```
https://seudominio.com.br/p/SLUG_DA_PAGINA?origem=nfc
```

O `origem=nfc` é obrigatório — é ele que diferencia o acesso via NFC de outros acessos no log.

## Como gravar (Android)
1. Instale o app **NFC Tools** (gratuito, Play Store)
2. Abra o app → Write → Add a record → URL
3. Cole a URL da página
4. Toque o celular no chip → gravado

## Como gravar (iPhone)
1. Instale o app **NFC for iPhone** ou **NFC Tools**  
2. Mesmos passos acima

## Fluxo completo

```
1. Admin cria chaveiro     →  POST /admin/chaveiros
2. Admin registra venda    →  POST /admin/chaveiros/:id/pedido
                              └─ retorna link_formulario (enviar ao cliente)
3. Cliente preenche        →  GET  /formulario?t=TOKEN
                              └─ página HTML, preenche e envia
4. Sistema gera            →  slug único + QR Code + página ativa
5. Admin grava no chip     →  URL: /p/SLUG?origem=nfc
6. Entrega o chaveiro      →  cliente aproxima → abre a página
```

## Trocar a URL do chip
Se precisar trocar o slug (ex: cliente pediu edição), basta regravar o chip com a nova URL.
O chip NFC pode ser regravado quantas vezes quiser enquanto não estiver bloqueado.

## Bloquear acesso emergencial
```bash
curl -X PATCH https://seudominio.com.br/admin/chaveiros/ID/status \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"status": "bloqueado"}'
```
A página some instantaneamente, sem precisar regravar o chip.
