// Regras de pagamento dos pedidos da loja.
import pool from '../db/pool.js'
import { criarLinkFormulario } from './tokens.js'
import { buscarPagamento, STATUS_PAGO, STATUS_ESTORNADO } from './asaas.js'

// Marca como pago, ativa o chaveiro e gera o link do formulário. Pode ser chamada várias
// vezes para o mesmo pedido (webhook repetido + consulta da página): só age na primeira.
export async function confirmarPagamento(fastify, pedidoId) {
  const { rows } = await pool.query(
    `UPDATE pedido SET status_pagamento = 'pago', pago_em = NOW()
     WHERE id = $1 AND status_pagamento = 'pendente' RETURNING chaveiro_id`,
    [pedidoId]
  )
  if (!rows.length) return false
  const chaveiroId = rows[0].chaveiro_id
  await pool.query(
    `UPDATE chaveiro_nfc SET status = 'ativo', ativado_em = NOW() WHERE id = $1 AND status = 'pendente'`,
    [chaveiroId]
  )
  await criarLinkFormulario(fastify, chaveiroId)
  fastify.log.info({ pedido: pedidoId }, 'pagamento confirmado')
  return true
}

// Pergunta ao Asaas o estado real da cobrança e atualiza o pedido.
// Nunca confia só no aviso recebido: o valor e o status vêm da API do Asaas.
export async function sincronizarPagamento(fastify, pedido) {
  if (!pedido.asaas_payment_id) return pedido.status_pagamento
  const pg = await buscarPagamento(pedido.asaas_payment_id)
  await pool.query('UPDATE pedido SET asaas_verificado_em = NOW() WHERE id = $1', [pedido.id])

  const total = Number(pedido.valor_pago) + Number(pedido.frete)
  if (STATUS_PAGO.includes(pg.status)) {
    if (Number(pg.value) + 0.001 < total) {
      fastify.log.error({ pedido: pedido.id, pago: pg.value, total }, 'valor pago menor que o do pedido')
      return pedido.status_pagamento
    }
    await confirmarPagamento(fastify, pedido.id)
    return 'pago'
  }
  if (STATUS_ESTORNADO.includes(pg.status)) {
    await pool.query(`UPDATE pedido SET status_pagamento = 'estornado' WHERE id = $1`, [pedido.id])
    fastify.log.warn({ pedido: pedido.id }, 'pagamento estornado')
    return 'estornado'
  }
  return pedido.status_pagamento
}

// Para onde o cliente vai depois de pagar: a página pronta ou o formulário para montá-la.
// Devolve caminho relativo, para funcionar em qualquer domínio.
export async function proximoPasso(fastify, chaveiroId) {
  const { rows: pagina } = await pool.query(
    'SELECT slug_url FROM pagina_romantica WHERE chaveiro_id = $1', [chaveiroId]
  )
  if (pagina.length) return { tipo: 'pagina', url: `/p/${pagina[0].slug_url}` }

  const { rows } = await pool.query(
    `SELECT token_jwt FROM link_token
     WHERE chaveiro_id = $1 AND tipo = 'formulario' AND usado = false
       AND expira_em > NOW() + INTERVAL '1 hour'
     ORDER BY criado_em DESC LIMIT 1`,
    [chaveiroId]
  )
  if (rows.length) return { tipo: 'formulario', url: `/formulario?t=${rows[0].token_jwt}` }

  // Link venceu antes de o cliente montar a página: gera outro
  const novo = new URL(await criarLinkFormulario(fastify, chaveiroId), 'http://x')
  return { tipo: 'formulario', url: novo.pathname + novo.search }
}
