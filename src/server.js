import './env.js'
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
import lojaRoutes from './routes/loja.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const fastify = Fastify({
  logger: process.env.NODE_ENV !== 'production' ? { level: 'info' } : true,
  trustProxy: true
})

await fastify.register(fastifyHelmet, {
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https://*.r2.dev", "https://pub-708dd0f007bb4c5aa391d840c03b36d6.r2.dev", "https://i.scdn.co"],
      mediaSrc: ["'self'", "https://*.r2.dev", "https://pub-708dd0f007bb4c5aa391d840c03b36d6.r2.dev"],
      frameSrc: ["'self'", "https://open.spotify.com", "https://*.spotify.com"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      connectSrc: ["'self'"]
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

// Admin, formulário e página são servidos pelo próprio site: nenhum outro domínio precisa chamar a API
await fastify.register(fastifyCors, { origin: false })

await fastify.register(fastifyJwt, {
  secret: process.env.JWT_SECRET
})

await fastify.register(fastifyMultipart, {
  limits: { fileSize: 25 * 1024 * 1024, files: 20 } // 25MB = limite do vídeo (r2.js); fotos seguem limitadas a 20MB lá
})

await fastify.register(fastifyStatic, {
  root: path.join(__dirname, '..', 'public'),
  prefix: '/static/'
})

await fastify.register(adminRoutes)
await fastify.register(paginaRoutes)
await fastify.register(lojaRoutes)

await fastify.register(async (instance) => {
  await instance.register(fastifyRateLimit, {
    max: 50,
    timeWindow: '5 minutes',
    keyGenerator: (req) => req.headers['cf-connecting-ip'] || req.ip
  })
  instance.register(formularioRoutes)
})

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
