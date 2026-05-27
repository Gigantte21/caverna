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

    if (!body.termos_aceitos || body.termos_aceitos !== true) {
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

    // Gera QR Code automaticamente após criação da página
    const qr = await gerarEsalvarQRCode(pagina.id, slug)

    await pool.query(
      `UPDATE link_token SET usado = true WHERE id = $1`,
      [req.linkTokenId]
    )

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

    const { rows: pRows } = await pool.query(
      'SELECT id FROM pagina_romantica WHERE chaveiro_id = $1', [chaveiro_id]
    )
    if (!pRows.length) {
      return reply.code(404).send({ error: 'Preencha o formulário principal antes de enviar mídias' })
    }
    const paginaId = pRows[0].id
    const parts = req.parts()
    const resultados = []

    for await (const part of parts) {
      if (part.type !== 'file') continue

      const tipo = part.fields?.tipo?.value || 'foto'
      const legenda = sanitizeText(part.fields?.legenda?.value || '', 255)
      const isCarrossel = part.fields?.is_carrossel?.value === 'true'
      const ordem = parseInt(part.fields?.ordem?.value || '0')

      if (isCarrossel) {
        const { rows: ct } = await pool.query(
          `SELECT COUNT(*) FROM midia WHERE pagina_id = $1 AND is_carrossel = true`,
          [paginaId]
        )
        if (parseInt(ct[0].count) >= 4) {
          return reply.code(400).send({ error: 'Máximo de 4 fotos no carrossel atingido' })
        }
      }

      const url = await uploadMidia(part, tipo, paginaId)
      const { rows } = await pool.query(
        `INSERT INTO midia (pagina_id, tipo, url, ordem, legenda, is_carrossel)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
        [paginaId, tipo, url, ordem, legenda, isCarrossel]
      )
      resultados.push(rows[0])
    }

    return resultados
  })
}
