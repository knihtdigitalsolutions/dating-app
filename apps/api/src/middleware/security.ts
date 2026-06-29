/**
 * Security Middleware
 *
 * Runs on EVERY request before reaching any route:
 * 1. Checks if the IP is blocked
 * 2. Logs rate limit violations
 * 3. Extracts device fingerprint
 * 4. Attaches security context to request
 */

import { FastifyRequest, FastifyReply } from 'fastify'
import { isIpBlocked, logSecurityEvent } from '../services/security'
import crypto from 'crypto'

declare module 'fastify' {
  interface FastifyRequest {
    userId: string
    userPlan: string
    securityCtx: {
      ipAddress: string
      userAgent: string
      deviceFingerprint: string
      platform: string
    }
  }
}

// ── IP Blocker ───────────────────────────────────────────
export async function ipBlockerMiddleware(req: FastifyRequest, reply: FastifyReply) {
  const ip = getClientIp(req)

  const blocked = await isIpBlocked(ip)
  if (blocked) {
    await logSecurityEvent({
      ipAddress: ip,
      userAgent: req.headers['user-agent'],
      eventType: 'IP_BLOCKED',
      severity: 'HIGH',
      description: `Blocked IP attempted access to ${req.method} ${req.url}`,
      metadata: { url: req.url, method: req.method },
    })
    return reply.status(403).send({
      success: false,
      error: 'Access denied.',
      code: 'IP_BLOCKED',
    })
  }
}

// ── Security Context Builder ─────────────────────────────
// Attaches IP, UA, and device fingerprint to every request
export async function securityContextMiddleware(req: FastifyRequest, _reply: FastifyReply) {
  const ip = getClientIp(req)
  const ua = (req.headers['user-agent'] as string) || 'unknown'
  const platform = detectPlatform(ua, req.headers)

  // Device fingerprint: hash of IP + UA + Accept-Language (stable per device, not per session)
  const fingerprint = crypto
    .createHash('sha256')
    .update(`${ip}:${ua}:${req.headers['accept-language'] || ''}`)
    .digest('hex')
    .slice(0, 16)

  req.securityCtx = {
    ipAddress: ip,
    userAgent: ua,
    deviceFingerprint: fingerprint,
    platform,
  }
}

// ── Rate Limit Violation Logger ──────────────────────────
export async function onRateLimitExceeded(req: FastifyRequest, reply: FastifyReply) {
  const ip = getClientIp(req)
  const userId = (req as any).userId

  // Record to DB
  try {
    const { prisma } = await import('@dating/db')
    const now = new Date()
    const windowStart = new Date(now.getTime() - 60000)

    await prisma.rateLimitViolation.create({
      data: {
        ipAddress: ip,
        userId: userId || null,
        endpoint: req.url,
        method: req.method,
        windowStart,
        windowEnd: now,
      },
    })
  } catch {}

  await logSecurityEvent({
    userId,
    ipAddress: ip,
    userAgent: req.headers['user-agent'] as string,
    eventType: 'RATE_LIMIT_HIT',
    severity: 'MEDIUM',
    riskScore: 40,
    description: `Rate limit exceeded on ${req.method} ${req.url}`,
    metadata: { url: req.url, method: req.method },
  })

  return reply.status(429).send({
    success: false,
    error: 'Too many requests. Please slow down.',
    code: 'RATE_LIMIT',
    retryAfter: 60,
  })
}

// ── Request Audit Logger ─────────────────────────────────
// Logs all authenticated requests to sensitive endpoints
const SENSITIVE_PATTERNS = [
  /^\/payments/,
  /^\/auth/,
  /^\/uploads/,
  /^\/admin/,
  /^\/profiles\/.*\/delete/,
]

export async function auditLogMiddleware(req: FastifyRequest, _reply: FastifyReply) {
  const isSensitive = SENSITIVE_PATTERNS.some(p => p.test(req.url))
  if (!isSensitive) return

  const userId = (req as any).userId
  if (!userId) return

  // Fire-and-forget audit log — don't slow down the request
  logSecurityEvent({
    userId,
    ipAddress: req.securityCtx?.ipAddress,
    userAgent: req.securityCtx?.userAgent,
    platform: req.securityCtx?.platform,
    deviceId: req.securityCtx?.deviceFingerprint,
    eventType: 'PROFILE_VIEWED',
    severity: 'INFO',
    riskScore: 0,
    description: `${req.method} ${req.url}`,
    metadata: { method: req.method, url: req.url },
  }).catch(() => {})
}

// ─────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────

export function getClientIp(req: FastifyRequest): string {
  // Trust Cloudflare's CF-Connecting-IP header first (most accurate when behind CF)
  const cfIp = req.headers['cf-connecting-ip'] as string
  if (cfIp) return cfIp

  // Then X-Forwarded-For (set by load balancers / proxies)
  const forwarded = req.headers['x-forwarded-for'] as string
  if (forwarded) return forwarded.split(',')[0].trim()

  // Fall back to direct connection IP
  return req.ip || '0.0.0.0'
}

function detectPlatform(ua: string, headers: any): string {
  const expoHeader = headers['x-expo-platform']
  if (expoHeader) return expoHeader

  if (/iPhone|iPad|iOS/.test(ua)) return 'ios'
  if (/Android/.test(ua)) return 'android'
  if (/Mozilla|Chrome|Safari|Firefox/.test(ua)) return 'web'
  return 'unknown'
}
