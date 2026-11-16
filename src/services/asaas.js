// Cobranças pelo Asaas (PIX, cartão e boleto na página de pagamento do próprio Asaas —
// nenhum dado de cartão passa por este servidor).
// Variáveis: ASAAS_API_KEY, ASAAS_WEBHOOK_TOKEN, ASAAS_ENV ('sandbox' padrão | 'production').

const BASES = {
  sandbox: 'https://api-sandbox.asaas.com/v3',
  production: 'https://api.asaas.com/v3'
}

const base = () =>
  process.env.ASAAS_API_URL || BASES[process.env.ASAAS_ENV === 'production' ? 'production' : 'sandbox']

export const asaasConfigurado = () =>
  Boolean(process.env.ASAAS_API_KEY && process.env.ASAAS_WEBHOOK_TOKEN)

// Status do Asaas que significam "dinheiro confirmado"
export const STATUS_PAGO = ['RECEIVED', 'CONFIRMED', 'RECEIVED_IN_CASH']
export const STATUS_ESTORNADO = ['REFUNDED', 'CHARGEBACK_REQUESTED', 'CHARGEBACK_DISPUTE']

async function chamar(method, path, body) {
  const res = await fetch(base() + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'caverna-nfc',
      access_token: process.env.ASAAS_API_KEY
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15000)
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) {
    const err = new Error(json.errors?.[0]?.description || `Asaas respondeu ${res.status}`)
    err.asaasStatus = res.status
    throw err
  }
  return json
}

// Vencimento em 2 dias, no fuso de Brasília
const vencimento = () => new Date(Date.now() + 2 * 864e5 - 3 * 36e5).toISOString().slice(0, 10)

export async function criarCobranca({ cliente, valor, descricao, referencia, urlRetorno }) {
  const customer = await chamar('POST', '/customers', {
    name: cliente.nome,
    cpfCnpj: cliente.cpf,
    email: cliente.email,
    mobilePhone: cliente.telefone,
    postalCode: cliente.cep,
    address: cliente.logradouro,
    addressNumber: cliente.numero,
    complement: cliente.complemento || undefined,
    province: cliente.bairro,
    externalReference: referencia
  })

  const cobranca = {
    customer: customer.id,
    billingType: 'UNDEFINED', // o cliente escolhe PIX, cartão ou boleto
    value: valor,
    dueDate: vencimento(),
    description: descricao,
    externalReference: referencia
  }

  // Volta automática para o site depois de pagar. O Asaas só aceita domínio cadastrado
  // na conta; se recusar, cria a cobrança sem a volta (a página de acompanhamento resolve).
  if (urlRetorno?.startsWith('https://')) {
    try {
      return await chamar('POST', '/payments', {
        ...cobranca,
        callback: { successUrl: urlRetorno, autoRedirect: true }
      })
    } catch (err) {
      if (err.asaasStatus !== 400) throw err
    }
  }
  return chamar('POST', '/payments', cobranca)
}

export const buscarPagamento = id => chamar('GET', `/payments/${encodeURIComponent(id)}`)
