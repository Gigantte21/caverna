// Sanitização simples sem dependência externa
// Remove tags HTML, limita tamanho e normaliza espaços

function stripTags(str) {
  return str.replace(/<[^>]*>/g, '')
}

function normalize(str) {
  return str.replace(/\s+/g, ' ').trim()
}

export function sanitizeText(value, maxLength = 255) {
  if (typeof value !== 'string') return ''
  return normalize(stripTags(value)).slice(0, maxLength)
}

export function sanitizeLonga(value, maxLength = 2000) {
  if (typeof value !== 'string') return ''
  return normalize(stripTags(value)).slice(0, maxLength)
}

export function sanitizeUrl(value) {
  if (typeof value !== 'string') return ''
  try {
    const url = new URL(value)
    if (!['https:', 'http:'].includes(url.protocol)) return ''
    return url.toString()
  } catch {
    return ''
  }
}

export function sanitizeData(value) {
  if (!value) return null
  const d = new Date(value)
  if (isNaN(d.getTime())) return null
  return d.toISOString().split('T')[0]
}
