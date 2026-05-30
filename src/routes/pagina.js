import pool from '../db/pool.js'

export default async function paginaRoutes(fastify) {

  fastify.get('/p/:slug', async (req, reply) => {
    return reply.sendFile('pagina.html')
  })

  fastify.get('/formulario', async (req, reply) => {
    return reply.sendFile('formulario.html')
  })

  fastify.get('/api/p/:slug', async (req, reply) => {
    const { slug } = req.params
    const { rows } = await pool.query(
      `SELECT p.*, c.status as chaveiro_status,
              ps.spotify_url, qr.url_imagem as qr_imagem
       FROM pagina_romantica p
       JOIN chaveiro_nfc c ON c.id = p.chaveiro_id
       LEFT JOIN playlist_spotify ps ON ps.pagina_id = p.id
       LEFT JOIN qr_code qr ON qr.pagina_id = p.id
       WHERE p.slug_url = $1`,
      [slug]
    )
    if (!rows.length) return reply.code(404).send({ error: 'Página não encontrada' })
    const pagina = rows[0]
    if (!pagina.ativo || pagina.chaveiro_status !== 'ativo') {
      return reply.code(403).send({ error: 'Esta página não está disponível' })
    }
    const { rows: midias } = await pool.query(
      `SELECT * FROM midia WHERE pagina_id = $1 ORDER BY is_carrossel DESC, ordem ASC`,
      [pagina.id]
    )
    const ip = req.headers['cf-connecting-ip'] || req.ip
    const origemRaw = req.query.origem || ''
const origemValidas = ['nfc', 'qrcode', 'link_direto', 'formulario']
const origem = origemValidas.includes(origemRaw) ? origemRaw : 'link_direto'
    await pool.query(
      `INSERT INTO acesso_log (pagina_id, ip, user_agent, origem) VALUES ($1,$2,$3,$4)`,
      [pagina.id, ip, req.headers['user-agent'] || '', origem]
    )
    const { chaveiro_status, ...paginaLimpa } = pagina
    return {
      pagina: paginaLimpa,
      midias,
      carrossel: midias.filter(m => m.is_carrossel),
      album: midias.filter(m => !m.is_carrossel)
    }
  })
}