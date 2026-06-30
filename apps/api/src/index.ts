import 'dotenv/config'
import Fastify from 'fastify'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import rateLimit from '@fastify/rate-limit'
import cookie from '@fastify/cookie'
import { Server as SocketServer } from 'socket.io'
import { createAdapter } from '@socket.io/redis-adapter'
import { redis, pubClient, subClient } from './lib/redis'
import { logger } from './lib/logger'
import {
  ipBlockerMiddleware,
  securityContextMiddleware,
  onRateLimitExceeded,
  auditLogMiddleware,
} from './middleware/security'

// Routes
import authRoutes         from './routes/auth'
import profileRoutes      from './routes/profiles'
import matchRoutes        from './routes/matches'
import messageRoutes      from './routes/messages'
import callRoutes         from './routes/calls'
import paymentRoutes      from './routes/payments'
import uploadRoutes       from './routes/uploads'
import notificationRoutes from './routes/notifications'
import adminRoutes        from './routes/admin'
import webhookRoutes      from './routes/webhooks'
import securityRoutes     from './routes/security'

import { registerSocketHandlers } from './services/socket'

const PORT = Number(process.env.PORT) || 4000
// console.log(PORT)
async function bootstrap() {
  const app = Fastify({
    logger: false,
    trustProxy: true,
    connectionTimeout: 10000,
    requestTimeout: 30000,
  })

  const httpServer = app.server

  // ── 1. Security headers ───────────────────────────────────
  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc:     ["'self'"],
        scriptSrc:      ["'self'"],
        styleSrc:       ["'self'", "'unsafe-inline'"],
        imgSrc:         ["'self'", 'data:', 'https:'],
        connectSrc:     ["'self'", 'wss:'],
        frameAncestors: ["'none'"],
      },
    },
    hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    crossOriginEmbedderPolicy: false,
  })

  // ── 2. CORS ───────────────────────────────────────────────
  await app.register(cors, {
    origin: [
      process.env.FRONTEND_URL || 'http://localhost:3000',
      process.env.MOBILE_URL   || 'http://localhost:8081',
      /\.dating\.app$/,
    ],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID', 'X-Device-ID', 'X-Expo-Platform', 'x-client-platform'],
  })

  // ── 3. Cookies ────────────────────────────────────────────
  await app.register(cookie, { secret: process.env.JWT_REFRESH_SECRET! })

  // ── 4. Rate limiting ──────────────────────────────────────
  await app.register(rateLimit, {
    global: true,
    max: 120,
    timeWindow: '1 minute',
    redis,
    keyGenerator: (req) => {
      const userId  = (req as any).userId
      const ip = (req.headers['cf-connecting-ip'] as string)
             || (req.headers['x-forwarded-for'] as string)?.split(',')[0]
             || req.ip
      return userId ? `rl:user:${userId}` : `rl:ip:${ip}`
    },
    errorResponseBuilder: onRateLimitExceeded as any,
  })

  // ── 5. Global security hooks (every request) ─────────────
  app.addHook('onRequest',   securityContextMiddleware as any)
  app.addHook('onRequest',   ipBlockerMiddleware as any)
  app.addHook('preHandler',  auditLogMiddleware as any)

  // ── 6. Add security headers to every response ─────────────
  app.addHook('onSend', async (_req, reply) => {
    reply.header('X-Content-Type-Options', 'nosniff')
    reply.header('X-Frame-Options', 'DENY')
    reply.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=(self)')
  })

  // ── 7. Routes ─────────────────────────────────────────────
  await app.register(webhookRoutes,      { prefix: '/api/webhooks' })
  await app.register(authRoutes,         { prefix: '/api/auth' })
  await app.register(profileRoutes,      { prefix: '/api/profiles' })
  await app.register(matchRoutes,        { prefix: '/api/matches' })
  await app.register(messageRoutes,      { prefix: '/api/messages' })
  await app.register(callRoutes,         { prefix: '/api/calls' })
  await app.register(paymentRoutes,      { prefix: '/api/payments' })
  await app.register(uploadRoutes,       { prefix: '/api/uploads' })
  await app.register(notificationRoutes, { prefix: '/api/notifications' })
  await app.register(securityRoutes,     { prefix: '/api/security' })
  await app.register(adminRoutes,        { prefix: '/api/admin' })

  // ── 8. Health ──────────────────────────────────────────────
  app.get('/health', async () => ({
    status: 'ok', version: '1.0.0',
    timestamp: new Date().toISOString(), uptime: process.uptime(),
  }))

  // ── 9. Global error handler ────────────────────────────────
  app.setErrorHandler(async (error: any, req, reply) => {
    logger.error({ err: error, url: req.url }, 'Unhandled error')
    const status = error.statusCode || 500
    return reply.status(status).send({
      success: false,
      error: status < 500 ? error.message
        : (process.env.NODE_ENV === 'production' ? 'An unexpected error occurred.' : error.message),
    })
  })

  // ── 10. Socket.io ──────────────────────────────────────────
  // await Promise.all([pubClient.connect(), subClient.connect()])

  const io = new SocketServer(httpServer, {
    cors: {
      origin: [process.env.FRONTEND_URL || 'http://localhost:3000', process.env.MOBILE_URL || 'http://localhost:8081'],
      credentials: true,
    },
    adapter: createAdapter(pubClient, subClient),
    transports: ['websocket', 'polling'],
    pingTimeout: 20000,
    pingInterval: 25000,
  })
  
  registerSocketHandlers(io)

  // ── 11. Start ──────────────────────────────────────────────
  await app.ready()

  // 🌟 UPDATED: Native Fastify listener block optimized for Railway health checks
  try {
    await app.listen({ port: PORT, host: '0.0.0.0' })
    console.log(PORT)
    logger.info(`🚀 API: http://0.0.0.0:${PORT}`)
    logger.info(`🔐 Security middleware: active`)
    logger.info(`🌍 Environment: ${process.env.NODE_ENV}`)
  } catch (err) {
    logger.error(err, 'Failed to bind server port connection')
    process.exit(1)
  }
  const shutdown = async (sig: string) => {
    logger.info(`${sig} — graceful shutdown`)
    await app.close()
    process.exit(0)
  }
  process.on('SIGTERM', () => shutdown('SIGTERM'))
  process.on('SIGINT',  () => shutdown('SIGINT'))
}

bootstrap().catch(err => { console.error('Fatal:', err); process.exit(1) })