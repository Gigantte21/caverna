import pool from '../db/pool.js'
import { deletarChaveiro } from '../services/deletar.js'
import { adminAuth } from '../middleware/auth.js'
import { gerarCodigoUnico, criarLinkFormulario } from '../services/tokens.js'
import { PRODUTOS, PRODUTO_IDS } from '../services/produtos.js'

export default async function adminRoutes(fastify) {

  fastify.get('/admin/produtos', { preHandler: adminAuth }, async () => PRODUTOS)

  fastify.post('/admin/chaveiros', { preHandler: adminAuth }, async (req, reply) => {
    const { nfc_uid } = req.body || {}
    const codigo = gerarCodigoUnico()
    const { rows } = await pool.query(
      `INSERT INTO chaveiro_nfc (codigo_unico, nfc_uid) VALUES ($1, $2) RETURNING *`,
      [codigo, nfc_uid || null]
    )
    return reply.code(201).send(rows[0])
  })

  fastify.get('/admin/chaveiros', { preHandler: adminAuth }, async (req, reply) => {
    const { rows } = await pool.query(
      `SELECT c.*, p.slug_url, p.ativo as pagina_ativa,
              pe.nome_comprador, pe.email_comprador, pe.status_pagamento,
              pe.produto, pe.valor_pago
       FROM chaveiro_nfc c
       LEFT JOIN pagina_romantica p ON p.chaveiro_id = c.id
       LEFT JOIN pedido pe ON pe.chaveiro_id = c.id
       ORDER BY c.criado_em DESC`
    )
    return rows
  })

  fastify.patch('/admin/chaveiros/:id/status', { preHandler: adminAuth }, async (req, reply) => {
    const { status } = req.body
    const allowed = ['ativo', 'bloqueado', 'cancelado']
    if (!allowed.includes(status)) {
      return reply.code(400).send({ error: 'Status inválido' })
    }
    const { rows } = await pool.query(
      `UPDATE chaveiro_nfc SET status = $1 WHERE id = $2 RETURNING *`,
      [status, req.params.id]
    )
    if (!rows.length) return reply.code(404).send({ error: 'Chaveiro não encontrado' })
    const ativarPagina = status === 'ativo'
    await pool.query(
      `UPDATE pagina_romantica SET ativo = $1 WHERE chaveiro_id = $2`,
      [ativarPagina, req.params.id]
    )
    return rows[0]
  })

  fastify.post('/admin/chaveiros/:id/pedido', { preHandler: adminAuth }, async (req, reply) => {
    const { nome_comprador, email_comprador, telefone, metodo_pagamento, valor_pago } = req.body
    const produto = req.body.produto || 'chaveiro'
    if (!PRODUTO_IDS.includes(produto)) {
      return reply.code(400).send({ error: 'Produto inválido' })
    }

    const { rows: check } = await pool.query(
      'SELECT id FROM chaveiro_nfc WHERE id = $1', [req.params.id]
    )
    if (!check.length) return reply.code(404).send({ error: 'Chaveiro não encontrado' })

    const ip = req.headers['cf-connecting-ip'] || req.ip

    const { rows } = await pool.query(
      `INSERT INTO pedido
         (chaveiro_id, produto, nome_comprador, email_comprador, telefone,
          metodo_pagamento, valor_pago, status_pagamento, pago_em,
          termos_aceitos, termos_versao, termos_aceitos_em, termos_ip)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'pago',NOW(),false,'v1.0',NULL,NULL)
       RETURNING *`,
      [req.params.id, produto, nome_comprador, email_comprador, telefone, metodo_pagamento, valor_pago]
    )

    await pool.query(
      `UPDATE chaveiro_nfc SET status = 'ativo', ativado_em = NOW() WHERE id = $1`,
      [req.params.id]
    )

    const linkFormulario = await criarLinkFormulario(fastify, req.params.id)
    return reply.code(201).send({ pedido: rows[0], link_formulario: linkFormulario })
  })

  fastify.get('/admin/chaveiros/:id/logs', { preHandler: adminAuth }, async (req, reply) => {
    const { rows } = await pool.query(
      `SELECT al.*, lt.tipo as token_tipo
       FROM acesso_log al
       LEFT JOIN link_token lt ON lt.id = al.link_token_id
       JOIN pagina_romantica p ON p.id = al.pagina_id
       WHERE p.chaveiro_id = $1
       ORDER BY al.acessado_em DESC
       LIMIT 100`,
      [req.params.id]
    )
    return rows
  })

  // ── MÉTRICAS DE ARMAZENAMENTO ──
  fastify.get('/admin/metricas', { preHandler: adminAuth }, async (req, reply) => {
    const { rows: geral } = await pool.query(`
      SELECT
        COUNT(DISTINCT p.id) as total_paginas,
        COUNT(m.id) as total_midias,
        COUNT(CASE WHEN m.tipo = 'foto' THEN 1 END) as total_fotos,
        COUNT(CASE WHEN m.tipo = 'video' THEN 1 END) as total_videos,
        COUNT(CASE WHEN m.tipo = 'musica' THEN 1 END) as total_audios
      FROM pagina_romantica p
      LEFT JOIN midia m ON m.pagina_id = p.id
    `)

    const { rows: porPagina } = await pool.query(`
      SELECT
        p.slug_url,
        p.titulo_personalizado,
        COUNT(m.id) as qtd_midias,
        COUNT(CASE WHEN m.tipo = 'foto' THEN 1 END) as qtd_fotos,
        COUNT(CASE WHEN m.tipo = 'video' THEN 1 END) as qtd_videos
      FROM pagina_romantica p
      LEFT JOIN midia m ON m.pagina_id = p.id
      GROUP BY p.id, p.slug_url, p.titulo_personalizado
      ORDER BY qtd_midias DESC
      LIMIT 20
    `)

    const { rows: chaveiros } = await pool.query(`
      SELECT
        COUNT(*) as total,
        COUNT(CASE WHEN status = 'ativo' THEN 1 END) as ativos,
        COUNT(CASE WHEN status = 'pendente' THEN 1 END) as pendentes,
        COUNT(CASE WHEN status = 'bloqueado' THEN 1 END) as bloqueados
      FROM chaveiro_nfc
    `)

    return {
      chaveiros: chaveiros[0],
      midias: geral[0],
      por_pagina: porPagina,
      limites: {
        foto: { max_por_pagina: 30 },
        video: { max_por_pagina: 1, tamanho_max_mb: 25 },
        musica: { max_por_pagina: 1, tamanho_max_mb: 5 }
      }
    }
  })

  // ── LGPD / LIMPEZA ──
  fastify.post('/admin/lgpd/anonimizar', { preHandler: adminAuth }, async (req, reply) => {
    await pool.query(`
      UPDATE acesso_log
      SET ip = 'anonimizado', user_agent = 'anonimizado', geo_cidade = NULL
      WHERE acessado_em < NOW() - INTERVAL '6 months' AND ip != 'anonimizado' -- Marco Civil art. 15: guardar 6 meses
    `)
    await pool.query(`DELETE FROM acesso_log WHERE acessado_em < NOW() - INTERVAL '1 year'`)
    await pool.query(`
      UPDATE pedido SET
        nome_comprador = 'removido', email_comprador = 'removido@removido.com',
        telefone = NULL, termos_ip = NULL
      WHERE chaveiro_id IN (
        SELECT id FROM chaveiro_nfc WHERE status = 'cancelado'
        AND criado_em < NOW() - INTERVAL '90 days'
      ) AND nome_comprador != 'removido'
    `)
    return { ok: true, executado_em: new Date().toISOString() }
  })

  // ── EXCLUSÃO COMPLETA (R2 + banco) ──
  fastify.delete('/admin/chaveiros/:id', { preHandler: adminAuth }, async (req, reply) => {
    try {
      const resultado = await deletarChaveiro(req.params.id)
      return { ok: true, ...resultado }
    } catch (err) {
      fastify.log.error(err)
      return reply.code(500).send({ error: err.message })
    }
  })

}