// src/services/deletar.js
import pool from '../db/pool.js'
import { deleteMidia } from './r2.js'

export async function deletarPagina(paginaId) {
  // 1. Busca todas as mídias para deletar do R2
  const { rows: midias } = await pool.query(
    'SELECT url FROM midia WHERE pagina_id = $1',
    [paginaId]
  )

  // 2. Busca QR Code
  const { rows: qrs } = await pool.query(
    'SELECT url_imagem FROM qr_code WHERE pagina_id = $1',
    [paginaId]
  )

  // 3. Deleta arquivos do R2
  for (const m of midias) {
    try { await deleteMidia(m.url) } catch (e) { console.error('Erro R2 midia:', e.message) }
  }
  for (const q of qrs) {
    try { await deleteMidia(q.url_imagem) } catch (e) { console.error('Erro R2 qr:', e.message) }
  }

  // 4. Deleta registros do banco (CASCADE cuida das dependências)
  await pool.query('DELETE FROM pagina_romantica WHERE id = $1', [paginaId])

  return { midias_removidas: midias.length, qrs_removidos: qrs.length }
}

export async function deletarChaveiro(chaveiroId) {
  // Busca página associada
  const { rows } = await pool.query(
    'SELECT id FROM pagina_romantica WHERE chaveiro_id = $1',
    [chaveiroId]
  )

  let resultado = { pagina: false, midias_removidas: 0 }

  if (rows.length) {
    resultado = await deletarPagina(rows[0].id)
    resultado.pagina = true
  }

  // Deleta pedido, tokens e chaveiro
  await pool.query('DELETE FROM link_token WHERE chaveiro_id = $1', [chaveiroId])
  await pool.query('DELETE FROM pedido WHERE chaveiro_id = $1', [chaveiroId])
  await pool.query('DELETE FROM chaveiro_nfc WHERE id = $1', [chaveiroId])

  return resultado
}
