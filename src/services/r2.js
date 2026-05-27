import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'
import { randomUUID } from 'crypto'
import path from 'path'

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

// MIME types permitidos com extensão esperada
const ALLOWED_TYPES = {
  foto:   { mimes: ['image/jpeg', 'image/png', 'image/webp'], ext: { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' } },
  video:  { mimes: ['video/mp4', 'video/quicktime'],           ext: { 'video/mp4': '.mp4', 'video/quicktime': '.mov' } },
  musica: { mimes: ['audio/mpeg', 'audio/mp4', 'audio/ogg'],  ext: { 'audio/mpeg': '.mp3', 'audio/mp4': '.m4a', 'audio/ogg': '.ogg' } }
}

const MAX_SIZE = 20 * 1024 * 1024 // 20MB pra todos os tipos

// Assinatura de bytes (magic bytes) por MIME
const MAGIC = {
  'image/jpeg':    [0xFF, 0xD8, 0xFF],
  'image/png':     [0x89, 0x50, 0x4E, 0x47],
  'image/webp':    [0x52, 0x49, 0x46, 0x46], // RIFF
  'video/mp4':     null, // mp4 não tem magic bytes simples, confia no MIME + extensão
  'video/quicktime': null,
  'audio/mpeg':    [0xFF, 0xFB],
  'audio/mp4':     null,
  'audio/ogg':     [0x4F, 0x67, 0x67, 0x53]
}

function validarMagicBytes(buffer, mime) {
  const expected = MAGIC[mime]
  if (!expected) return true // tipos sem magic bytes conhecidos: passa
  return expected.every((byte, i) => buffer[i] === byte)
}

export async function uploadMidia(file, tipo, paginaId) {
  const config = ALLOWED_TYPES[tipo]
  if (!config) throw new Error(`Tipo inválido: ${tipo}`)

  if (!config.mimes.includes(file.mimetype)) {
    throw new Error(`Formato não permitido para ${tipo}. Aceitos: ${config.mimes.join(', ')}`)
  }

  const buffer = await file.toBuffer()

  if (buffer.length > MAX_SIZE) {
    throw new Error(`Arquivo excede o limite de 20MB`)
  }

  if (!validarMagicBytes(buffer, file.mimetype)) {
    throw new Error(`Conteúdo do arquivo não corresponde ao tipo declarado`)
  }

  const ext = config.ext[file.mimetype] || '.bin'
  const key = `midias/${paginaId}/${tipo}/${randomUUID()}${ext}`

  await r2.send(new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    Body: buffer,
    ContentType: file.mimetype,
    CacheControl: 'public, max-age=31536000'
  }))

  return `${PUBLIC_URL}/${key}`
}

export async function deleteMidia(url) {
  const key = url.replace(`${PUBLIC_URL}/`, '')
  await r2.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }))
}
