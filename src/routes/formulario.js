import pool from '../db/pool.js'
import { formularioAuth } from '../middleware/auth.js'
import { gerarSlugUnico } from '../services/tokens.js'
import { uploadMidia } from '../services/r2.js'
import { sanitizeText, sanitizeLonga, sanitizeUrl, sanitizeData } from '../services/sanitize.js'
import { gerarEsalvarQRCode } from '../services/qrcode.js'

export default async function formularioRoutes(fastify) {

  fastify.get('/formulario/dados', { preHandler: formularioAuth }, async (req, reply) => {
    const { chaveiro_id } = req.tokenPayload
    const { rows } = await pool.query(
      `SELECT p.*, c.codigo_unico
       FROM pagina_romantica p
       JOIN chaveiro_nfc c ON c.id = p.chaveiro_id
       WHERE p.chaveiro_id = $1`,
      [chaveiro_id]
    )
    return { ja_preenchido: rows.length > 0, pagina: rows[0] || null }
  })

  fastify.post('/formulario/submit', { preHandler: formularioAuth }, async (req, reply) => {
    const { chaveiro_id } = req.tokenPayload
    const body = req.body || {}

    if (!body.termos_aceitos) {
      return reply.code(400).send({ error: 'Aceite dos termos de uso é obrigatório' })
    }

    const titulo = sanitizeText(body.titulo_personalizado || '', 255)
    const mensagem = sanitizeLonga(body.mensagem_especial || '', 2000)
    const dataRelacionamento = sanitizeData(body.data_inicio_relacionamento)
    const tema = sanitizeText(body.tema || 'classico', 32)
    const spotifyUrl = sanitizeUrl(body.spotify_url || '')
    const spotifyNome = sanitizeText(body.spotify_nome || '', 255)
    const spotifyTema = sanitizeText(body.spotify_tema || '', 64)

    if (!titulo) return reply.code(400).send({ error: 'Título é obrigatório' })
    if (!mensagem) return reply.code(400).send({ error: 'Mensagem é obrigatória' })
    if (!dataRelacionamento) return reply.code(400).send({ error: 'Data de início é obrigatória' })

    const existente = await pool.query(
      'SELECT id FROM pagina_romantica WHERE chaveiro_id = $1', [chaveiro_id]
    )
    if (existente.rows.length > 0) {
      return reply.code(409).send({ error: 'Formulário já preenchido para este chaveiro' })
    }

    const slug = await gerarSlugUnico()
    const ip = req.headers['cf-connecting-ip'] || req.ip

    const { rows } = await pool.query(
      `INSERT INTO pagina_romantica
         (chaveiro_id, slug_url, titulo_personalizado, mensagem_especial, data_inicio_relacionamento, tema)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [chaveiro_id, slug, titulo, mensagem, dataRelacionamento, tema]
    )
    const pagina = rows[0]

    await pool.query(
      `UPDATE pedido
       SET termos_aceitos = true, termos_aceitos_em = NOW(), termos_ip = $1
       WHERE chaveiro_id = $2 AND termos_aceitos = false`,
      [ip, chaveiro_id]
    )

    if (spotifyUrl) {
      await pool.query(
        `INSERT INTO playlist_spotify (pagina_id, spotify_url, nome_playlist, tema)
         VALUES ($1,$2,$3,$4)`,
        [pagina.id, spotifyUrl, spotifyNome || null, spotifyTema || null]
      )
    }

    const qr = await gerarEsalvarQRCode(pagina.id, slug)

    const urlPagina = `${process.env.BASE_URL}/p/${slug}`
    return reply.code(201).send({
      pagina,
      url_pagina: urlPagina,
      qr_code: qr.url_imagem,
      qr_destino: qr.url_destino
    })
  })

  fastify.post('/formulario/midia', { preHandler: formularioAuth }, async (req, reply) => {
    const { chaveiro_id } = req.tokenPayload

    // Lê parâmetros da querystring — mais confiável que multipart fields
    const tipo = req.query.tipo || 'foto'
    const isCarrossel = req.query.is_carrossel === 'true'
    const ordem = parseInt(req.query.ordem || '0')

    const { rows: pRows } = await pool.query(
      'SELECT id FROM pagina_romantica WHERE chaveiro_id = $1', [chaveiro_id]
    )
    if (!pRows.length) {
      return reply.code(404).send({ error: 'Preencha o formulário principal antes de enviar mídias' })
    }
    const paginaId = pRows[0].id

    if (isCarrossel) {
      const { rows: ct } = await pool.query(
        `SELECT COUNT(*) FROM midia WHERE pagina_id = $1 AND is_carrossel = true`,
        [paginaId]
      )
      if (parseInt(ct[0].count) >= 4) {
        return reply.code(400).send({ error: 'Máximo de 4 fotos no carrossel atingido' })
      }
    }

    // Pega o arquivo do multipart
    const data = await req.file()
    if (!data) return reply.code(400).send({ error: 'Nenhum arquivo enviado' })

    let url
    try {
      url = await uploadMidia(data, tipo, paginaId)
      fastify.log.info({ url, isCarrossel, ordem }, 'upload R2 ok')
    } catch (uploadErr) {
      fastify.log.error({ erro: uploadErr.message }, 'erro upload R2')
      return reply.code(500).send({ error: `Erro no upload: ${uploadErr.message}` })
    }

    const { rows } = await pool.query(
      `INSERT INTO midia (pagina_id, tipo, url, ordem, legenda, is_carrossel)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [paginaId, tipo, url, ordem, '', isCarrossel]
    )

    return rows[0]
  })
}
