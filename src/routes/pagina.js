import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import pool from '../db/pool.js'
import { EMPRESA } from '../services/empresa.js'
import { TEMAS } from '../services/temas.js'

const PAGINA_HTML = fs.readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'public', 'pagina.html'), 'utf8'
)
const TITULO_PADRAO = '<title id="page-title">Carregando...</title>'
const escAttr = s => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

// Título e foto no próprio HTML, para o link mostrar prévia no WhatsApp e em outros apps
// (eles não executam o JavaScript da página). Não registra acesso: isso é feito em /api/p/:slug.
async function htmlComPrevia(slug) {
  const { rows } = await pool.query(
    `SELECT p.titulo_personalizado, p.tema,
            (SELECT m.url FROM midia m WHERE m.pagina_id = p.id AND m.tipo = 'foto'
             ORDER BY m.is_carrossel DESC, m.ordem ASC LIMIT 1) AS capa
     FROM pagina_romantica p
     JOIN chaveiro_nfc c ON c.id = p.chaveiro_id
     WHERE p.slug_url = $1 AND p.ativo = true AND c.status = 'ativo'`,
    [slug]
  )
  if (!rows.length) return PAGINA_HTML
  const titulo = escAttr(rows[0].titulo_personalizado || 'Nossa memória')
  const tags = [
    `<title id="page-title">${titulo}</title>`,
    `<meta property="og:title" content="${titulo}"/>`,
    '<meta property="og:description" content="Uma memória para sempre · A Caverna"/>',
    '<meta property="og:type" content="website"/>',
    rows[0].capa ? `<meta property="og:image" content="${escAttr(rows[0].capa)}"/>` : '',
    `<meta name="twitter:card" content="${rows[0].capa ? 'summary_large_image' : 'summary'}"/>`
  ].filter(Boolean).join('\n')
  // O tema já vem no HTML: a tela de carregamento abre com as cores certas, sem piscar
  const tema = TEMAS.includes(rows[0].tema) ? rows[0].tema : 'classico'
  return PAGINA_HTML
    .replace(TITULO_PADRAO, tags)
    .replace('<html lang="pt-BR" data-tema="classico">', `<html lang="pt-BR" data-tema="${tema}">`)
}

export default async function paginaRoutes(fastify) {

  fastify.get('/admin', async (req, reply) => {
    return reply.sendFile('admin.html')
  })

  fastify.get('/p/:slug', async (req, reply) => {
    let html = PAGINA_HTML
    try {
      html = await htmlComPrevia(String(req.params.slug).slice(0, 64))
    } catch (err) {
      fastify.log.warn({ erro: err.message }, 'prévia do link indisponível') // a página abre do mesmo jeito
    }
    return reply.type('text/html; charset=utf-8').send(html)
  })

  fastify.get('/formulario', async (req, reply) => {
    return reply.sendFile('formulario.html')
  })

  fastify.get('/termos', async (req, reply) => reply.sendFile('termos.html'))
  fastify.get('/privacidade', async (req, reply) => reply.sendFile('privacidade.html'))
  fastify.get('/empresa', async () => EMPRESA)

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

    const { rows: timeline } = await pool.query(
      `SELECT * FROM timeline_eventos WHERE pagina_id = $1 ORDER BY data_evento ASC, ordem ASC`,
      [pagina.id]
    )

    const ip = req.headers['cf-connecting-ip'] || req.ip
    const origemRaw = req.query.origem || ''
    const origemValidas = ['nfc', 'qrcode', 'link_direto', 'formulario']
    const origem = origemValidas.includes(origemRaw) ? origemRaw : 'link_direto'

    // "?origem=admin" vem do botão "abrir" do painel: a sua conferência não entra na contagem
    if (origemRaw !== 'admin') {
      await pool.query(
        `INSERT INTO acesso_log (pagina_id, ip, user_agent, origem) VALUES ($1,$2,$3,$4)`,
        [pagina.id, ip, req.headers['user-agent'] || '', origem]
      )
    }

    const { chaveiro_status, ...paginaLimpa } = pagina
    return {
      pagina: paginaLimpa,
      midias,
      carrossel: midias.filter(m => m.is_carrossel),
      album: midias.filter(m => !m.is_carrossel && m.tipo === 'foto'),
      video: midias.find(m => m.tipo === 'video') || null,
      audio: midias.find(m => m.tipo === 'musica') || null,
      timeline
    }
  })
}
