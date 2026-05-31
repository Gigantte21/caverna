import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'
import { randomUUID } from 'crypto'
import sharp from 'sharp'

const r2 = new S3Client({
  region: 'auto',
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY,
    secretAccessKey: process.env.R2_SECRET_KEY
  }
})

const BUCKET = process.env.R2_BUCKET
const PUBLIC_URL = process.env.R2_PUBLIC_URL

// ── LIMITES ──
export const LIMITES = {
  foto: { max_por_pagina: 30, tamanho_max: 20 * 1024 * 1024 },
  video: { max_por_pagina: 1, tamanho_max: 25 * 1024 * 1024 },
  musica: { max_por_pagina: 1, tamanho_max: 5 * 1024 * 1024 }
}

// ── MIMES PERMITIDOS ──
const MIMES = {
  foto: ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'],
  video: ['video/mp4', 'video/quicktime', 'video/x-m4v'],
  musica: ['audio/mpeg', 'audio/mp4', 'audio/x-m4a', 'audio/ogg']
}

// ── MAGIC BYTES ──
const MAGIC = {
  'image/jpeg':   [0xFF, 0xD8, 0xFF],
  'image/png':    [0x89, 0x50, 0x4E, 0x47],
  'image/webp':   [0x52, 0x49, 0x46, 0x46],
  'video/mp4':    null,
  'video/quicktime': null,
  'audio/mpeg':   [0xFF, 0xFB],
  'audio/ogg':    [0x4F, 0x67, 0x67, 0x53]
}

function validarMagicBytes(buffer, mime) {
  const expected = MAGIC[mime]
  if (!expected) return true
  return expected.every((byte, i) => buffer[i] === byte)
}

// ── PROCESSAMENTO DE IMAGEM ──
async function processarImagem(buffer) {
  const img = sharp(buffer)
  const meta = await img.metadata()

  // Redimensiona se lado maior > 1920px
  const precisaRedimensionar = (meta.width > 1920 || meta.height > 1920)

  let pipeline = img
  if (precisaRedimensionar) {
    pipeline = pipeline.resize(1920, 1920, {
      fit: 'inside',
      withoutEnlargement: true
    })
  }

  // Converte tudo para JPEG 80%
  const resultado = await pipeline
    .jpeg({ quality: 80, progressive: true })
    .toBuffer()

  return resultado
}

// ── UPLOAD PRINCIPAL ──
export async function uploadMidia(file, tipo, paginaId) {
  const mimes = MIMES[tipo]
  if (!mimes) throw new Error(`Tipo inválido: ${tipo}`)

  if (!mimes.includes(file.mimetype)) {
    throw new Error(`Formato não permitido para ${tipo}. Aceitos: ${mimes.join(', ')}`)
  }

  const buffer = await file.toBuffer()

  const limite = LIMITES[tipo]
  if (buffer.length > limite.tamanho_max) {
    const mb = Math.round(limite.tamanho_max / 1024 / 1024)
    throw new Error(`Arquivo excede o limite de ${mb}MB para ${tipo}`)
  }

  if (!validarMagicBytes(buffer, file.mimetype)) {
    throw new Error('Conteúdo do arquivo não corresponde ao tipo declarado')
  }

  let bufferFinal = buffer
  let contentType = file.mimetype
  let ext = '.' + (file.mimetype.split('/')[1] || 'bin')

  // Processa imagens — converte e otimiza
  if (tipo === 'foto') {
    bufferFinal = await processarImagem(buffer)
    contentType = 'image/jpeg'
    ext = '.jpg'
  } else if (tipo === 'musica') {
    ext = file.mimetype.includes('mpeg') ? '.mp3' : '.m4a'
  } else if (tipo === 'video') {
    ext = file.mimetype.includes('quicktime') ? '.mov' : '.mp4'
  }

  const key = `midias/${paginaId}/${tipo}/${randomUUID()}${ext}`

  await r2.send(new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    Body: bufferFinal,
    ContentType: contentType,
    CacheControl: 'public, max-age=31536000'
  }))

  return `${PUBLIC_URL}/${key}`
}

export async function deleteMidia(url) {
  const key = url.replace(`${PUBLIC_URL}/`, '')
  await r2.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }))
}
