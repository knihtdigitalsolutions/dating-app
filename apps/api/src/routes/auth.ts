/**
 * Auth Routes — Fully secured with activity logging at every step
 * Optimized for HttpOnly Cookies to eliminate XSS token-theft vectors.
 */

import { FastifyInstance, FastifyReply } from 'fastify'
import { z } from 'zod'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { prisma } from '@dating/db'
import { redis, RATE_KEYS, redisSet } from '../lib/redis'
import { sendOtp } from '../services/sms'
import { authenticate } from '../middleware/auth'
import { getClientIp } from '../middleware/security'
import {
  logSecurityEvent,
  isAccountLocked,
  isOtpLocked,
  registerDeviceSession,
  revokeDeviceSession,
} from '../services/security'

// ── Validation schemas ────────────────────────────────────
const requestOtpSchema = z.object({
  phone: z.string().regex(/^\+256\d{9}$|^\+254\d{9}$|^\+255\d{9}$/, {
    message: 'Valid East African phone number required (+256, +254, or +255)',
  }),
})

const verifyOtpSchema = z.object({
  phone: z.string(),
  code: z.string().length(6),
  deviceId: z.string().optional(),
})

// Cookie Configuration Constant
const COOKIE_OPTIONS = {
  path: '/',
  httpOnly: true, // 防止 XSS 攻击的关键：JavaScript 无法读取此 Cookie
  secure: process.env.NODE_ENV === 'production', // 仅在生产环境中要求 HTTPS
  sameSite: 'lax' as const, // 防止 CSRF 攻击
}

export default async function authRoutes(app: FastifyInstance) {

  // ── GET /auth/me ─────────────────────────────────────────
  // Used by Zustand's initializeAuth() to verify ongoing sessions seamlessly
  app.get('/me', { preHandler: [authenticate] }, async (req, reply) => {
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      include: { profile: true, subscription: true },
    })

    if (!user) {
      return reply.status(404).send({ success: false, error: 'User not found.' })
    }

    return reply.send({
      success: true,
      user: {
        id: user.id,
        phone: user.phone,
        hasProfile: !!user.profile,
        plan: user.subscription?.plan || 'FREE',
      },
    })
  })

  // ── POST /auth/otp/request ──────────────────────────────
  app.post('/otp/request', {
    config: { rateLimit: { max: 3, timeWindow: '10 minutes' } },
  }, async (req, reply) => {
    const ip  = getClientIp(req)
    const ua  = req.headers['user-agent'] as string
    const ctx = (req as any).securityCtx

    const body = requestOtpSchema.safeParse(req.body)
    if (!body.success) {
      return reply.status(400).send({ success: false, error: body.error.errors[0].message })
    }

    const { phone } = body.data

    const otpLock = await isOtpLocked(phone)
    if (otpLock.locked) {
      await logSecurityEvent({
        ipAddress: ip, userAgent: ua, platform: ctx?.platform,
        eventType: 'RATE_LIMIT_HIT', severity: 'MEDIUM', riskScore: 45,
        description: `OTP request blocked — phone locked for ${Math.ceil((otpLock.ttl || 0) / 60)} more minutes`,
        metadata: { phone: phone.slice(0, 7) + '***', ttl: otpLock.ttl },
      })
      return reply.status(429).send({
        success: false,
        error: `Too many attempts. Try again in ${Math.ceil((otpLock.ttl || 0) / 60)} minutes.`,
        code: 'OTP_LOCKED',
      })
    }

    const recentKey = RATE_KEYS.otpRequest(phone)
    const recent = await redis.get(recentKey)
    if (recent) {
      return reply.status(429).send({
        success: false,
        error: 'Please wait 2 minutes before requesting another code.',
        code: 'OTP_TOO_SOON',
      })
    }

    let user = await prisma.user.findUnique({ where: { phone } })
    if (!user) {
      user = await prisma.user.create({ data: { phone } })
    }

    if (user.isBanned) {
      await logSecurityEvent({
        userId: user.id, ipAddress: ip, userAgent: ua, platform: ctx?.platform,
        eventType: 'LOGIN_FAILED', severity: 'MEDIUM', riskScore: 30,
        description: 'Login attempt on banned account',
        metadata: { phone: phone.slice(0, 7) + '***' },
      })
      return reply.status(403).send({ success: false, error: 'Account suspended.', code: 'ACCOUNT_BANNED' })
    }

    const lock = await isAccountLocked(user.id)
    if (lock.locked) {
      await logSecurityEvent({
        userId: user.id, ipAddress: ip, userAgent: ua, platform: ctx?.platform,
        eventType: 'ACCOUNT_LOCKED', severity: 'HIGH', riskScore: 50,
        description: 'OTP request on temporarily locked account',
        metadata: { ttl: lock.ttl },
      })
      return reply.status(429).send({
        success: false,
        error: `Account temporarily locked. Try again in ${Math.ceil((lock.ttl || 0) / 60)} minutes.`,
        code: 'ACCOUNT_LOCKED',
      })
    }

    const code = Math.floor(100000 + Math.random() * 900000).toString()
    const hashed = await bcrypt.hash(code, 12)
    const expiresAt = new Date(Date.now() + 2 * 60 * 1000)

    await prisma.otpCode.updateMany({
      where: { phone, usedAt: null },
      data: { usedAt: new Date() },
    })

    await prisma.otpCode.create({
      data: { userId: user.id, phone, code: hashed, expiresAt },
    })

    await redisSet(recentKey, '1', 120)

    if (process.env.NODE_ENV !== 'development') {
      await sendOtp(phone, code)
    } else {
      console.log(`\n📱 DEV OTP for ${phone}: \x1b[33m${code}\x1b[0m\n`)
    }

    await logSecurityEvent({
      userId: user.id, ipAddress: ip, userAgent: ua, platform: ctx?.platform,
      eventType: 'OTP_REQUESTED', severity: 'INFO', riskScore: 0,
      description: 'OTP sent via SMS',
      metadata: { phone: phone.slice(0, 7) + '***' },
    })

    return reply.send({ success: true, message: 'Verification code sent.' })
  })

  // ── POST /auth/otp/verify ───────────────────────────────
  app.post('/otp/verify', {
    config: { rateLimit: { max: 10, timeWindow: '10 minutes' } },
  }, async (req, reply) => {
    const ip  = getClientIp(req)
    const ua  = req.headers['user-agent'] as string
    const ctx = (req as any).securityCtx

    const body = verifyOtpSchema.safeParse(req.body)
    if (!body.success) {
      return reply.status(400).send({ success: false, error: 'Invalid request' })
    }

    const { phone, code, deviceId } = body.data

    const attemptsKey = RATE_KEYS.otpVerify(phone)
    const attempts = parseInt(await redis.get(attemptsKey) || '0')

    if (attempts >= 5) {
      const user = await prisma.user.findUnique({ where: { phone } })
      await logSecurityEvent({
        userId: user?.id, ipAddress: ip, userAgent: ua, platform: ctx?.platform,
        eventType: 'MULTIPLE_FAILED_OTPS', severity: 'HIGH', riskScore: 80,
        description: `${attempts} failed OTP attempts for this phone`,
        metadata: { attempts, phone: phone.slice(0, 7) + '***' },
      })
      return reply.status(429).send({
        success: false,
        error: 'Too many failed attempts. Request a new code.',
        code: 'TOO_MANY_ATTEMPTS',
      })
    }

    const otp = await prisma.otpCode.findFirst({
      where: { phone, usedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    })

    const user = await prisma.user.findUnique({
      where: { phone },
      include: { profile: true, subscription: true },
    })

    if (!otp || !user) {
      await redis.incr(attemptsKey)
      await redis.expire(attemptsKey, 600)

      await logSecurityEvent({
        userId: user?.id, ipAddress: ip, userAgent: ua, platform: ctx?.platform,
        eventType: 'OTP_FAILED', severity: 'LOW', riskScore: 20,
        description: 'OTP verification failed — code not found or expired',
        metadata: { attempt: attempts + 1, phone: phone.slice(0, 7) + '***' },
      })

      return reply.status(401).send({ success: false, error: 'Invalid or expired code.', code: 'INVALID_OTP' })
    }

    const valid = await bcrypt.compare(code, otp.code)
    if (!valid) {
      await redis.incr(attemptsKey)
      await redis.expire(attemptsKey, 600)

      await logSecurityEvent({
        userId: user.id, ipAddress: ip, userAgent: ua, platform: ctx?.platform,
        deviceId: deviceId || ctx?.deviceFingerprint,
        eventType: 'OTP_FAILED', severity: 'LOW', riskScore: 25,
        description: `Incorrect OTP — attempt ${attempts + 1} of 5`,
        metadata: { attempt: attempts + 1 },
      })

      return reply.status(401).send({
        success: false,
        error: `Incorrect code. ${4 - attempts} attempt${4 - attempts !== 1 ? 's' : ''} remaining.`,
        code: 'WRONG_OTP',
        attemptsLeft: 4 - attempts,
      })
    }

    await prisma.otpCode.update({ where: { id: otp.id }, data: { usedAt: new Date() } })
    await redis.del(attemptsKey)
    await redis.del(RATE_KEYS.otpRequest(phone))

    // Create session + tokens
    const { accessToken, refreshToken, sessionId } = await createSession(
      user.id,
      user.subscription?.plan || 'FREE',
      req
    )

    await registerDeviceSession({
      userId: user.id,
      sessionId,
      userAgent: ua,
      ipAddress: ip,
      platform: ctx?.platform,
    })

    await logSecurityEvent({
      userId: user.id, ipAddress: ip, userAgent: ua, platform: ctx?.platform,
      deviceId: deviceId || ctx?.deviceFingerprint,
      eventType: 'LOGIN_SUCCESS', severity: 'INFO', riskScore: 0,
      description: 'Successful OTP login',
      metadata: { isNewUser: !user.profile, plan: user.subscription?.plan || 'FREE' },
    })

    await logSecurityEvent({
      userId: user.id, ipAddress: ip, userAgent: ua, platform: ctx?.platform,
      eventType: 'OTP_VERIFIED', severity: 'INFO', riskScore: 0,
      description: 'OTP verified successfully',
    })

    await prisma.user.update({ where: { id: user.id }, data: { lastSeen: new Date() } })

    // 🌟 SECURE INJECTION: Stream tokens directly into HttpOnly Cookies
    setAuthCookies(reply, accessToken, refreshToken)

    // Return safely sanitized telemetry back to Zustand UI state tracking
    return reply.send({
      success: true,
      data: {
        user: {
          id: user.id,
          phone: user.phone,
          hasProfile: !!user.profile,
          plan: user.subscription?.plan || 'FREE',
        },
      },
    })
  })

  // ── POST /auth/refresh ──────────────────────────────────
  app.post('/refresh', async (req, reply) => {
    const ip  = getClientIp(req)
    const ua  = req.headers['user-agent'] as string
    const ctx = (req as any).securityCtx

    // 🌟 SECURE INJECTION: Read the token from cookies instead of the request body
    const refreshToken = req.cookies?.refresh_token

    if (!refreshToken) {
      return reply.status(401).send({ success: false, error: 'No refresh token provided.', code: 'NO_TOKEN' })
    }

    try {
      jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET!)

      const session = await prisma.session.findUnique({
        where: { refreshToken },
        include: { user: { include: { subscription: true } } },
      })

      if (!session || session.revokedAt || session.expiresAt < new Date()) {
        await logSecurityEvent({
          ipAddress: ip, userAgent: ua, platform: ctx?.platform,
          eventType: 'TOKEN_REVOKED', severity: 'HIGH', riskScore: 70,
          description: 'Attempted use of revoked or expired refresh token',
          metadata: { hasSession: !!session, wasRevoked: !!session?.revokedAt },
        })
        return reply.status(401).send({ success: false, error: 'Session expired. Please log in again.', code: 'SESSION_EXPIRED' })
      }

      await prisma.session.update({ where: { id: session.id }, data: { revokedAt: new Date() } })

      const { accessToken, refreshToken: newRefreshToken, sessionId } = await createSession(
        session.userId,
        session.user.subscription?.plan || 'FREE',
        req
      )

      await registerDeviceSession({
        userId: session.userId,
        sessionId,
        userAgent: ua,
        ipAddress: ip,
        platform: ctx?.platform,
      })

      await logSecurityEvent({
        userId: session.userId, ipAddress: ip, userAgent: ua, platform: ctx?.platform,
        eventType: 'TOKEN_REFRESHED', severity: 'INFO', riskScore: 0,
        description: 'Access token refreshed successfully',
      })

      // 🌟 SECURE INJECTION: Push rotated tokens back into cookies
      setAuthCookies(reply, accessToken, newRefreshToken)

      return reply.send({ success: true })
    } catch {
      await logSecurityEvent({
        ipAddress: ip, userAgent: ua, platform: ctx?.platform,
        eventType: 'TOKEN_REVOKED', severity: 'MEDIUM', riskScore: 55,
        description: 'Invalid refresh token signature — possible forgery attempt',
      })
      return reply.status(401).send({ success: false, error: 'Invalid token.', code: 'INVALID_TOKEN' })
    }
  })

  // ── POST /auth/logout ───────────────────────────────────
  app.post('/logout', { preHandler: [authenticate] }, async (req, reply) => {
    const ip = getClientIp(req)
    const ua = req.headers['user-agent'] as string
    const ctx = (req as any).securityCtx

    // Clear access token out of memory arrays
    const authHeader = req.headers.authorization
    if (authHeader) {
      const token = authHeader.slice(7)
      const payload = jwt.decode(token) as { iat: number }
      if (payload) {
        await redisSet(RATE_KEYS.tokenBlacklist(req.userId + ':' + payload.iat), '1', 15 * 60)
      }
    }

    // 🌟 SECURE INJECTION: Target the incoming HttpOnly token for revocation
    const refreshToken = req.cookies?.refresh_token
    if (refreshToken) {
      const session = await prisma.session.findUnique({ where: { refreshToken } })
      if (session) {
        await prisma.session.update({ where: { id: session.id }, data: { revokedAt: new Date() } })
        await revokeDeviceSession(session.id, 'user_logout')
      }
    }

    await logSecurityEvent({
      userId: req.userId, ipAddress: ip, userAgent: ua, platform: ctx?.platform,
      eventType: 'LOGOUT', severity: 'INFO', riskScore: 0,
      description: 'User logged out',
    })

    // 🌟 SECURE INJECTION: Instruct client to fully scrub tracking headers out of cookie storage
    reply.clearCookie('access_token', COOKIE_OPTIONS)
    reply.clearCookie('refresh_token', COOKIE_OPTIONS)

    return reply.send({ success: true, message: 'Logged out successfully.' })
  })

  // ── GET /auth/sessions ──────────────────────────────────
  app.get('/sessions', { preHandler: [authenticate] }, async (req, reply) => {
    const sessions = await prisma.deviceSession.findMany({
      where: { userId: req.userId, isActive: true },
      orderBy: { lastActiveAt: 'desc' },
    })
    return reply.send({ success: true, data: sessions })
  })

  // ── DELETE /auth/sessions/:sessionId ───────────────────
  app.delete('/sessions/:sessionId', { preHandler: [authenticate] }, async (req, reply) => {
    const { sessionId } = req.params as { sessionId: string }
    const ip = getClientIp(req)

    const session = await prisma.deviceSession.findFirst({
      where: { id: sessionId, userId: req.userId },
    })

    if (!session) {
      return reply.status(404).send({ success: false, error: 'Session not found.' })
    }

    await revokeDeviceSession(session.sessionId, 'user_revoked')
    await prisma.deviceSession.update({
      where: { id: sessionId },
      data: { isActive: false, revokedAt: new Date(), revokedReason: 'user_revoked' },
    })

    await logSecurityEvent({
      userId: req.userId, ipAddress: ip,
      eventType: 'SESSION_REVOKED', severity: 'LOW', riskScore: 10,
      description: 'User revoked a remote session',
      metadata: { revokedSessionId: sessionId, deviceName: session.deviceName },
    })

    return reply.send({ success: true, message: 'Session revoked.' })
  })
}

// ─────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────

async function createSession(userId: string, plan: string, req: any) {
  const accessToken = jwt.sign(
    { sub: userId, plan },
    process.env.JWT_ACCESS_SECRET!,
    { expiresIn: '15m', algorithm: 'HS256' }
  )

  const refreshToken = jwt.sign(
    { sub: userId },
    process.env.JWT_REFRESH_SECRET!,
    { expiresIn: '7d', algorithm: 'HS256' }
  )

  const session = await prisma.session.create({
    data: {
      userId,
      refreshToken,
      deviceInfo:  req.headers['user-agent'],
      ipAddress:   req.ip,
      userAgent:   req.headers['user-agent'],
      expiresAt:   new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
  })

  return { accessToken, refreshToken, expiresIn: 900, sessionId: session.id }
}

// Global cookie hydration controller
function setAuthCookies(reply: FastifyReply, accessToken: string, refreshToken: string) {
  reply.setCookie('access_token', accessToken, {
    ...COOKIE_OPTIONS,
    maxAge: 15 * 60, // 15 mins
  })

  reply.setCookie('refresh_token', refreshToken, {
    ...COOKIE_OPTIONS,
    maxAge: 7 * 24 * 60 * 60, // 7 days
  })
}