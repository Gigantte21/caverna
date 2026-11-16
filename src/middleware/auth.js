import { timingSafeEqual, createHash } from 'crypto'
import pool from '../db/pool.js'

const hash = s => createHash('sha256').update(String(s)).digest()

export async function adminAuth(request, reply) {
  const token = process.env.ADMIN_TOKEN
  const auth = request.headers['authorization'] || ''
  // Sem ADMIN_TOKEN configurado (ou curto demais), o admin fica fechado — nunca aberto
  if (!token || token.length < 16) {
    return reply.code(503).send({ error: 'Admin não configurado' })
  }
  // Comparação em tempo constante (não vaza o token por diferença de tempo)
  if (!timingSafeEqual(hash(auth), hash(`Bearer ${token}`))) {
    return reply.code(401).send({ error: 'Não autorizado' })
  }
}

export async function formularioAuth(request, reply) {
  try {
    const { t } = request.query
    if (!t) return reply.code(401).send({ error: 'Token ausente' })

    const payload = request.server.jwt.verify(t)

    if (payload.tipo !== 'formulario') {
      return reply.code(401).send({ error: 'Token inválido' })
    }

    const { rows } = await pool.query(
      `SELECT lt.id, lt.usado, lt.expira_em, c.status as chaveiro_status
       FROM link_token lt
       JOIN chaveiro_nfc c ON c.id = lt.chaveiro_id
       WHERE lt.token_jwt = $1 AND lt.tipo = 'formulario'`,
      [t]
    )

    if (!rows.length) return reply.code(401).send({ error: 'Token não encontrado' })

    const token = rows[0]

    // O link vale 7 dias: depois do envio do formulário ele continua servindo só para enviar
    // mídias (o reenvio do formulário é barrado com 409 em /formulario/submit).
    if (token.usado) return reply.code(410).send({ error: 'Link já utilizado' })
    if (new Date(token.expira_em) < new Date()) return reply.code(410).send({ error: 'Link expirado' })
    if (token.chaveiro_status !== 'pendente' && token.chaveiro_status !== 'ativo') {
      return reply.code(403).send({ error: 'Chaveiro inativo' })
    }

    request.tokenPayload = payload
    request.linkTokenId = token.id

  } catch (err) {
    return reply.code(401).send({ error: 'Token inválido' })
  }
}
