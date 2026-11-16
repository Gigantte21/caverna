import QRCode from 'qrcode'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { randomUUID } from 'crypto'
import pool from '../db/pool.js'

const r2 = new S3Client({
  region: 'auto',
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY,
    secretAccessKey: process.env.R2_SECRET_KEY
  }
})

export async function gerarEsalvarQRCode(paginaId, slug, origem = process.env.BASE_URL) {
  // "qrcode" é o nome que a página reconhece no log de acessos
  const urlDestino = `${origem}/p/${slug}?origem=qrcode`

  // Gera PNG do QR Code em memória (buffer)
  const buffer = await QRCode.toBuffer(urlDestino, {
    type: 'png',
    width: 600,
    margin: 2,
    color: {
      dark: '#0a0806',
      light: '#f0e6d3'
    },
    errorCorrectionLevel: 'H'
  })

  const key = `qrcodes/${paginaId}/${randomUUID()}.png`

  await r2.send(new PutObjectCommand({
    Bucket: process.env.R2_BUCKET,
    Key: key,
    Body: buffer,
    ContentType: 'image/png',
    CacheControl: 'public, max-age=31536000'
  }))

  const urlImagem = `${process.env.R2_PUBLIC_URL}/${key}`

  await pool.query(
    `INSERT INTO qr_code (pagina_id, url_destino, url_imagem)
     VALUES ($1, $2, $3)
     ON CONFLICT (pagina_id) DO UPDATE
       SET url_destino = $2, url_imagem = $3, gerado_em = NOW()`,
    [paginaId, urlDestino, urlImagem]
  )

  return { url_destino: urlDestino, url_imagem: urlImagem }
}
