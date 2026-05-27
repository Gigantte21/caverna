import 'dotenv/config'
import path from 'path'
import { fileURLToPath } from 'url'
import Fastify from 'fastify'
import fastifyJwt from '@fastify/jwt'
import fastifyMultipart from '@fastify/multipart'
import fastifyCors from '@fastify/cors'
import fastifyHelmet from '@fastify/helmet'
import fastifyRateLimit from '@fastify/rate-limit'
import fastifyStatic from '@fastify/static'

import adminRoutes from './routes/admin.js'
import formularioRoutes from './routes/formulario.js'
import paginaRoutes from './routes/pagina.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const fastify = Fastify({
  logger: process.env.NODE_ENV !== 'production' ? { level: 'info' } : true,
  trustProxy: true
})

await fastify.register(fastifyHelmet, {
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      imgSrc: ["'self'", "data:", process.env.R2_PUBLIC_URL, "https://i.scdn.co"],
      mediaSrc: ["'self'", process.env.R2_PUBLIC_URL],
      frameSrc: ["'self'", "https://open.spotify.com"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"]
    }
  }
})

await fastify.register(fastifyRateLimit, {
  global: true,
  max: 60,
  timeWindow: '1 minute',
  keyGenerator: (req) => req.headers['cf-connecting-ip'] || req.ip,
  errorResponseBuilder: () => ({ error: 'Muitas requisições. Tente novamente em instantes.' })
})

await fastify.register(fastifyCors, {
  origin: process.env.ALLOWED_ORIGINS?.split(',') || false
})

await fastify.register(fastifyJwt, {
  secret: process.env.JWT_SECRET
})

await fastify.register(fastifyMultipart, {
  limits: { fileSize: 20 * 1024 * 1024, files: 20 }
})

// Serve arquivos estáticos da pasta public
await fastify.register(fastifyStatic, {
  root: path.join(__dirname, '..', 'public'),
  prefix: '/static/'
})

// Página romântica — serve o HTML e deixa o JS do browser buscar os dados via API
fastify.get('/p/:slug', async (req, reply) => {
  return reply.sendFile('pagina.html')
})

// Formulário — serve o HTML
fastify.get('/formulario', async (req, reply) => {
  return reply.sendFile('formulario.html')
})

// Rate limit mais restrito nas rotas de formulário
await fastify.register(async (instance) => {
  await instance.register(fastifyRateLimit, {
    max: 10,
    timeWindow: '5 minutes',
    keyGenerator: (req) => req.headers['cf-connecting-ip'] || req.ip
  })
  instance.register(formularioRoutes)
})

await fastify.register(adminRoutes)
await fastify.register(paginaRoutes)

fastify.get('/health', async () => ({ status: 'ok', ts: new Date().toISOString() }))

fastify.setErrorHandler((error, request, reply) => {
  fastify.log.error(error)
  const status = error.statusCode || 500
  reply.code(status).send({ error: status === 500 ? 'Erro interno' : error.message })
})

try {
  await fastify.listen({ port: parseInt(process.env.PORT || '3000'), host: '0.0.0.0' })
} catch (err) {
  fastify.log.error(err)
  process.exit(1)
}
