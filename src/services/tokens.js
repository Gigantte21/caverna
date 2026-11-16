import { randomBytes } from 'crypto'
import pool from '../db/pool.js'

export function gerarCodigoUnico() {
  // 16 bytes = 32 hex chars — imprevisível, não sequencial
  return randomBytes(16).toString('hex').toUpperCase()
}

export function gerarSlug() {
  // 12 bytes = 24 hex chars — imprevisível, não adivinhável por força bruta
  const raw = randomBytes(12).toString('hex')
  // formata como xxxx-xxxx-xxxx para leitura humana sem perder entropia
  return `${raw.slice(0,8)}-${raw.slice(8,16)}-${raw.slice(16)}`
}

export async function slugDisponivel(slug) {
  const { rows } = await pool.query(
    'SELECT id FROM pagina_romantica WHERE slug_url = $1',
    [slug]
  )
  return rows.length === 0
}

export async function gerarSlugUnico() {
  let slug, disponivel
  do {
    slug = gerarSlug()
    disponivel = await slugDisponivel(slug)
  } while (!disponivel)
  return slug
}

// Endereço em que o site está sendo acessado agora (https://dominio), vindo da própria requisição.
// Os links são montados com ele, e não com BASE_URL, para nunca apontarem para um domínio errado.
export const origemDo = req => `${req.protocol}://${req.hostname}`

export async function criarLinkFormulario(fastify, chaveiroId, origem = process.env.BASE_URL) {
  const token = fastify.jwt.sign(
    { chaveiro_id: chaveiroId, tipo: 'formulario', jti: randomBytes(8).toString('hex') },
    { expiresIn: '7d' }
  )

  const expira = new Date()
  expira.setDate(expira.getDate() + 7)

  await pool.query(
    `INSERT INTO link_token (chaveiro_id, tipo, token_jwt, expira_em)
     VALUES ($1, 'formulario', $2, $3)`,
    [chaveiroId, token, expira]
  )

  return `${origem}/formulario?t=${token}`
}
