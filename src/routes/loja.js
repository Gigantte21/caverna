// Loja pública: o cliente compra sozinho, paga pelo Asaas e recebe o link do formulário.
import { randomBytes, timingSafeEqual, createHash } from 'crypto'
import validator from 'validator'
import pool from '../db/pool.js'
import { PRODUTOS } from '../services/produtos.js'
import { sanitizeText } from '../services/sanitize.js'
import { gerarCodigoUnico } from '../services/tokens.js'
import { asaasConfigurado, criarCobranca } from '../services/asaas.js'
import { sincronizarPagamento, proximoPasso } from '../services/pedidos.js'

const UFS = 'AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' ')
const frete = () => Math.max(0, Number(process.env.FRETE_FIXO ?? 15)) || 0
const digitos = v => String(v ?? '').replace(/\D/g, '')
const hash = s => createHash('sha256').update(String(s)).digest()

function cpfValido(cpf) {
  if (!/^\d{11}$/.test(cpf) || /^(\d)\1{10}$/.test(cpf)) return false
  const dv = n => {
    let soma = 0
    for (let i = 0; i < n; i++) soma += Number(cpf[i]) * (n + 1 - i)
    const r = (soma * 10) % 11
    return r === 10 ? 0 : r
  }
  return dv(9) === Number(cpf[9]) && dv(10) === Number(cpf[10])
}

export default async function lojaRoutes(fastify) {

  fastify.get('/', async (req, reply) => reply.sendFile('loja.html'))
  fastify.get('/pedido/:token', async (req, reply) => reply.sendFile('pedido.html'))

  fastify.get('/loja/produtos', async () => ({
    produtos: PRODUTOS.filter(p => p.preco),
    frete: frete(),
    compra_online: asaasConfigurado()
  }))

  // ── NOVO PEDIDO ──
  fastify.post('/loja/pedido', {
    config: { rateLimit: { max: 8, timeWindow: '10 minutes' } }
  }, async (req, reply) => {
    if (!asaasConfigurado()) {
      return reply.code(503).send({ error: 'A compra online ainda não está disponível.' })
    }
    const b = req.body || {}
    const erro = msg => reply.code(400).send({ error: msg })

    // O preço vem sempre do catálogo do servidor, nunca do navegador
    const produto = PRODUTOS.find(p => p.id === b.produto && p.preco)
    if (!produto) return erro('Escolha um produto.')

    const c = {
      nome: sanitizeText(b.nome, 255),
      email: String(b.email || '').trim().toLowerCase().slice(0, 255),
      telefone: digitos(b.telefone),
      cpf: digitos(b.cpf),
      cep: digitos(b.cep),
      logradouro: sanitizeText(b.logradouro, 255),
      numero: sanitizeText(b.numero, 16),
      complemento: sanitizeText(b.complemento, 64),
      bairro: sanitizeText(b.bairro, 64),
      cidade: sanitizeText(b.cidade, 64),
      uf: String(b.uf || '').toUpperCase()
    }
    const observacoes = sanitizeText(b.observacoes, 500)

    if (c.nome.length < 3) return erro('Informe seu nome completo.')
    if (!validator.isEmail(c.email)) return erro('E-mail inválido.')
    if (c.telefone.length < 10 || c.telefone.length > 11) return erro('Telefone inválido. Use DDD + número.')
    if (!cpfValido(c.cpf)) return erro('CPF inválido.')
    if (c.cep.length !== 8) return erro('CEP inválido.')
    if (!c.logradouro || !c.numero || !c.bairro || !c.cidade) return erro('Preencha o endereço completo.')
    if (!UFS.includes(c.uf)) return erro('Estado inválido.')

    const valorFrete = frete()
    const token = randomBytes(18).toString('hex')
    const ip = req.headers['cf-connecting-ip'] || req.ip

    const { rows: ch } = await pool.query(
      'INSERT INTO chaveiro_nfc (codigo_unico) VALUES ($1) RETURNING id', [gerarCodigoUnico()]
    )
    const chaveiroId = ch[0].id
    const { rows: pe } = await pool.query(
      `INSERT INTO pedido
         (chaveiro_id, produto, finalidade, origem, nome_comprador, email_comprador, telefone,
          metodo_pagamento, valor_pago, frete, status_pagamento, observacoes,
          cep, logradouro, numero, complemento, bairro, cidade, uf, acompanhamento_token, termos_ip)
       VALUES ($1,$2,'venda','loja',$3,$4,$5,'asaas',$6,$7,'pendente',$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
       RETURNING id`,
      [chaveiroId, produto.id, c.nome, c.email, c.telefone, produto.preco, valorFrete, observacoes || null,
       c.cep, c.logradouro, c.numero, c.complemento || null, c.bairro, c.cidade, c.uf, token, ip]
    )
    const pedidoId = pe[0].id

    try {
      // O CPF vai só para o Asaas (exigência para emitir a cobrança) e não é gravado aqui
      const cobranca = await criarCobranca({
        cliente: c,
        valor: Math.round((produto.preco + valorFrete) * 100) / 100,
        descricao: `A Caverna — ${produto.nome}`,
        referencia: pedidoId,
        urlRetorno: `${req.protocol}://${req.hostname}/pedido/${token}`
      })
      await pool.query(
        'UPDATE pedido SET asaas_payment_id = $1, asaas_invoice_url = $2 WHERE id = $3',
        [cobranca.id, cobranca.invoiceUrl, pedidoId]
      )
    } catch (err) {
      // Sem cobrança não há pedido: desfaz para não deixar registro órfão
      await pool.query('DELETE FROM pedido WHERE id = $1', [pedidoId])
      await pool.query('DELETE FROM chaveiro_nfc WHERE id = $1', [chaveiroId])
      fastify.log.error({ erro: err.message }, 'falha ao criar cobrança no Asaas')
      return reply.code(502).send({ error: 'Não foi possível gerar o pagamento agora. Tente de novo em instantes.' })
    }

    return reply.code(201).send({ acompanhamento: `/pedido/${token}` })
  })

  // ── ACOMPANHAMENTO ──
  fastify.get('/api/pedido/:token', async (req, reply) => {
    const { rows } = await pool.query(
      `SELECT id, chaveiro_id, produto, nome_comprador, valor_pago, frete, status_pagamento,
              asaas_payment_id, asaas_invoice_url,
              (asaas_verificado_em IS NULL OR asaas_verificado_em < NOW() - INTERVAL '20 seconds') AS pode_verificar
       FROM pedido WHERE acompanhamento_token = $1`,
      [String(req.params.token).slice(0, 64)]
    )
    if (!rows.length) return reply.code(404).send({ error: 'Pedido não encontrado' })
    const p = rows[0]

    // Rede de segurança caso o aviso do Asaas atrase ou falhe: consulta direto, no máximo a cada 20s
    let status = p.status_pagamento
    if (status === 'pendente' && p.pode_verificar && asaasConfigurado()) {
      try { status = await sincronizarPagamento(fastify, p) } catch (err) {
        fastify.log.warn({ erro: err.message }, 'consulta ao Asaas falhou')
      }
    }

    const item = PRODUTOS.find(x => x.id === p.produto)
    return {
      status,
      nome: p.nome_comprador.split(' ')[0],
      produto: item ? item.nome : p.produto,
      total: Number(p.valor_pago) + Number(p.frete),
      pagamento: status === 'pendente' ? p.asaas_invoice_url : null,
      proximo: status === 'pago' ? await proximoPasso(fastify, p.chaveiro_id) : null
    }
  })

  // ── AVISOS DO ASAAS ──
  fastify.post('/webhooks/asaas', async (req, reply) => {
    const recebido = req.headers['asaas-access-token'] || ''
    if (!asaasConfigurado() || !timingSafeEqual(hash(recebido), hash(process.env.ASAAS_WEBHOOK_TOKEN))) {
      return reply.code(401).send({ error: 'Não autorizado' })
    }
    const id = req.body?.payment?.id
    if (!id) return { ok: true }

    const { rows } = await pool.query(
      `SELECT id, valor_pago, frete, status_pagamento, asaas_payment_id
       FROM pedido WHERE asaas_payment_id = $1`, [String(id)]
    )
    // O aviso só serve de gatilho: o estado real é sempre conferido na API do Asaas
    if (rows.length) await sincronizarPagamento(fastify, rows[0])
    return { ok: true }
  })
}
