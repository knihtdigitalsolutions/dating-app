/**
 * Security Service — Dating App
 *
 * Central hub for all security operations:
 * - Activity event logging with risk scoring
 * - Threat pattern detection
 * - Device session management
 * - IP blocking
 * - Real-time anomaly alerts
 */

import { prisma } from '@dating/db'
import { redis } from '../lib/redis'
import { logger } from '../lib/logger'
import UAParser from 'ua-parser-js'

// ─────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────

export interface SecurityContext {
  userId?: string
  ipAddress?: string
  userAgent?: string
  deviceId?: string
  platform?: string
}

export interface LogEventOptions {
  userId?: string
  eventType: string
  severity?: 'INFO' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
  ipAddress?: string
  userAgent?: string
  deviceId?: string
  platform?: string
  resourceType?: string
  resourceId?: string
  description?: string
  metadata?: Record<string, any>
  riskScore?: number
}

// ─────────────────────────────────────────────────────────
// RISK SCORE MATRIX
// Maps event types to base risk scores (0–100)
// ─────────────────────────────────────────────────────────

const RISK_SCORES: Record<string, number> = {
  LOGIN_SUCCESS: 0,
  LOGIN_FAILED: 20,
  LOGOUT: 0,
  OTP_REQUESTED: 0,
  OTP_VERIFIED: 0,
  OTP_FAILED: 25,
  OTP_EXPIRED: 5,
  TOKEN_REFRESHED: 0,
  TOKEN_REVOKED: 10,
  SESSION_CREATED: 0,
  SESSION_EXPIRED: 0,
  SESSION_REVOKED: 15,
  CONCURRENT_SESSION_DETECTED: 35,
  ACCOUNT_LOCKED: 50,
  ACCOUNT_BANNED: 70,
  UNAUTHORIZED_ACCESS: 60,
  FORBIDDEN_RESOURCE: 50,
  RATE_LIMIT_HIT: 40,
  SUSPICIOUS_ACTIVITY: 75,
  IP_BLOCKED: 80,
  DEVICE_FINGERPRINT_MISMATCH: 65,
  BRUTE_FORCE_ATTEMPT: 90,
  BOT_ACTIVITY_DETECTED: 85,
  UNUSUAL_LOCATION_LOGIN: 55,
  MULTIPLE_FAILED_OTPS: 80,
  PAYMENT_FAILED: 10,
  PAYMENT_COMPLETED: 0,
  ADMIN_USER_BANNED: 30,
  PHOTO_FLAGGED: 40,
  REPORT_SUBMITTED: 20,
}

// ─────────────────────────────────────────────────────────
// CORE LOG FUNCTION
// ─────────────────────────────────────────────────────────

export async function logSecurityEvent(opts: LogEventOptions): Promise<void> {
  try {
    const baseRisk = RISK_SCORES[opts.eventType] ?? 0
    const riskScore = opts.riskScore !== undefined ? opts.riskScore : baseRisk

    // Auto-determine severity from risk score if not provided
    const severity = opts.severity ?? riskFromScore(riskScore)

    // Parse user agent for device info
    let parsedUA: { browser?: string; os?: string; device?: string } = {}
    if (opts.userAgent) {
      const parser = new UAParser(opts.userAgent)
      const result = parser.getResult()
      parsedUA = {
        browser: result.browser.name ? `${result.browser.name} ${result.browser.version}` : undefined,
        os: result.os.name ? `${result.os.name} ${result.os.version}` : undefined,
        device: result.device.vendor ? `${result.device.vendor} ${result.device.model}` : undefined,
      }
    }

    await prisma.securityEvent.create({
      data: {
        userId: opts.userId,
        eventType: opts.eventType as any,
        severity: severity as any,
        ipAddress: opts.ipAddress,
        userAgent: opts.userAgent,
        deviceId: opts.deviceId,
        platform: opts.platform,
        resourceType: opts.resourceType,
        resourceId: opts.resourceId,
        description: opts.description,
        metadata: opts.metadata ? { ...opts.metadata, ...parsedUA } : parsedUA,
        riskScore,
      },
    })

    // Log high-severity events immediately
    if (severity === 'HIGH' || severity === 'CRITICAL') {
      logger.warn({ eventType: opts.eventType, userId: opts.userId, ip: opts.ipAddress, riskScore }, `🚨 Security event: ${opts.eventType}`)
    }

    // Trigger threat analysis asynchronously for suspicious events
    if (riskScore >= 40 && opts.userId) {
      analyzeUserThreatLevel(opts.userId, opts.ipAddress).catch(() => {})
    } else if (riskScore >= 40 && opts.ipAddress) {
      analyzeIpThreatLevel(opts.ipAddress).catch(() => {})
    }

  } catch (err) {
    // Security logging must NEVER crash the main application
    logger.error({ err }, 'Failed to log security event')
  }
}

// ─────────────────────────────────────────────────────────
// THREAT ANALYSIS
// ─────────────────────────────────────────────────────────

/**
 * Analyses recent events for a user and escalates if patterns are detected.
 * Called automatically when a medium+ risk event is logged.
 */
export async function analyzeUserThreatLevel(userId: string, ipAddress?: string): Promise<void> {
  const windowMs = 15 * 60 * 1000 // 15 minutes
  const since = new Date(Date.now() - windowMs)

  const recentEvents = await prisma.securityEvent.findMany({
    where: { userId, createdAt: { gte: since } },
    select: { eventType: true, riskScore: true, ipAddress: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
  })

  // Pattern: multiple failed OTPs
  const failedOtps = recentEvents.filter((e: any) => e.eventType === 'OTP_FAILED')
  if (failedOtps.length >= 3) {
    await logSecurityEvent({
      userId,
      ipAddress,
      eventType: 'MULTIPLE_FAILED_OTPS',
      severity: 'HIGH',
      riskScore: 80,
      description: `${failedOtps.length} failed OTP attempts in 15 minutes`,
      metadata: { count: failedOtps.length, window: '15m' },
    })
    // Lock OTP for this user for 30 minutes
    await redis.set(`otp:locked:${userId}`, '1', 'EX', 1800)
  }

  // Pattern: brute force login
  const failedLogins = recentEvents.filter((e: any) => e.eventType === 'LOGIN_FAILED')
  if (failedLogins.length >= 5) {
    await logSecurityEvent({
      userId,
      ipAddress,
      eventType: 'BRUTE_FORCE_ATTEMPT',
      severity: 'CRITICAL',
      riskScore: 90,
      description: `${failedLogins.length} failed login attempts in 15 minutes`,
      metadata: { count: failedLogins.length, window: '15m' },
    })
    // Temporarily lock account
    await redis.set(`account:locked:${userId}`, '1', 'EX', 3600) // 1 hour
    await prisma.user.update({ where: { id: userId }, data: { isBanned: false } }) // not banned, just locked
  }

  // Pattern: multiple IPs in short window (account sharing / compromise)
  const uniqueIps = new Set(recentEvents.map((e: any) => e.ipAddress).filter(Boolean))
  if (uniqueIps.size >= 3) {
    await logSecurityEvent({
      userId,
      ipAddress,
      eventType: 'SUSPICIOUS_ACTIVITY',
      severity: 'HIGH',
      riskScore: 70,
      description: `Activity from ${uniqueIps.size} different IPs in 15 minutes`,
      metadata: { ipCount: uniqueIps.size, ips: Array.from(uniqueIps) },
    })
  }
}

/**
 * Analyses events from a specific IP for attack patterns.
 */
export async function analyzeIpThreatLevel(ipAddress: string): Promise<void> {
  const since = new Date(Date.now() - 15 * 60 * 1000)

  const events = await prisma.securityEvent.findMany({
    where: { ipAddress, createdAt: { gte: since } },
    select: { eventType: true, userId: true },
  })

  const failedAttempts = events.filter((e: any) =>
    ['LOGIN_FAILED', 'OTP_FAILED', 'UNAUTHORIZED_ACCESS'].includes(e.eventType)
  )

  const uniqueUsers = new Set(events.map((e: any) => e.userId).filter(Boolean))

  // Same IP hitting many user accounts = credential stuffing / bot
  if (uniqueUsers.size >= 10 || failedAttempts.length >= 20) {
    await logSecurityEvent({
      ipAddress,
      eventType: 'BOT_ACTIVITY_DETECTED',
      severity: 'CRITICAL',
      riskScore: 95,
      description: `IP targeting ${uniqueUsers.size} accounts with ${failedAttempts.length} failed attempts`,
      metadata: { uniqueUsers: uniqueUsers.size, failedAttempts: failedAttempts.length },
    })

    // Auto-block this IP for 24 hours
    const existing = await prisma.blockedIp.findUnique({ where: { ipAddress } })
    if (!existing) {
      await prisma.blockedIp.create({
        data: {
          ipAddress,
          reason: `Auto-blocked: ${failedAttempts.length} attacks against ${uniqueUsers.size} accounts`,
          blockedBy: 'system',
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
      })
      await redis.set(`ip:blocked:${ipAddress}`, '1', 'EX', 86400)
    }
  }
}

// ─────────────────────────────────────────────────────────
// IP BLOCKING CHECK
// ─────────────────────────────────────────────────────────

export async function isIpBlocked(ipAddress: string): Promise<boolean> {
  // Fast Redis cache check first
  const cached = await redis.get(`ip:blocked:${ipAddress}`)
  if (cached) return true

  // Fall back to DB
  const blocked = await prisma.blockedIp.findFirst({
    where: {
      ipAddress,
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
  })

  if (blocked) {
    await redis.set(`ip:blocked:${ipAddress}`, '1', 'EX', 3600) // cache for 1hr
    return true
  }

  return false
}

// ─────────────────────────────────────────────────────────
// ACCOUNT LOCK CHECK
// ─────────────────────────────────────────────────────────

export async function isAccountLocked(userId: string): Promise<{ locked: boolean; ttl?: number }> {
  const ttl = await redis.ttl(`account:locked:${userId}`)
  if (ttl > 0) return { locked: true, ttl }
  return { locked: false }
}

export async function isOtpLocked(identifier: string): Promise<{ locked: boolean; ttl?: number }> {
  const ttl = await redis.ttl(`otp:locked:${identifier}`)
  if (ttl > 0) return { locked: true, ttl }
  return { locked: false }
}

// ─────────────────────────────────────────────────────────
// DEVICE SESSION MANAGEMENT
// ─────────────────────────────────────────────────────────

export async function registerDeviceSession(opts: {
  userId: string
  sessionId: string
  userAgent?: string
  ipAddress?: string
  platform?: string
}): Promise<void> {
  try {
    let deviceName = 'Unknown device'
    let browser: string | undefined
    let os: string | undefined

    if (opts.userAgent) {
      const parser = new UAParser(opts.userAgent)
      const result = parser.getResult()
      browser = result.browser.name ? `${result.browser.name} ${result.browser.version}` : undefined
      os = result.os.name ? `${result.os.name} ${result.os.version}` : undefined
      const device = result.device.vendor ? `${result.device.vendor} ${result.device.model}` : null
      deviceName = device || browser || 'Unknown device'
    }

    // Check for concurrent sessions from very different locations
    const activeSessions = await prisma.deviceSession.findMany({
      where: { userId: opts.userId, isActive: true },
      select: { ipAddress: true, country: true },
    })

    await prisma.deviceSession.create({
      data: {
        userId: opts.userId,
        sessionId: opts.sessionId as any,
        deviceName,
        platform: opts.platform,
        browser,
        os,
        ipAddress: opts.ipAddress,
        lastActiveAt: new Date(),
      },
    })

    // If active sessions from 3+ IPs, flag as suspicious
    const ips = new Set([...activeSessions.map((s: any) => s.ipAddress), opts.ipAddress].filter(Boolean))
    if (ips.size >= 3) {
      await logSecurityEvent({
        userId: opts.userId,
        ipAddress: opts.ipAddress,
        userAgent: opts.userAgent,
        eventType: 'CONCURRENT_SESSION_DETECTED',
        severity: 'MEDIUM',
        riskScore: 35,
        description: `${ips.size} active sessions from different IPs`,
        metadata: { activeSessionCount: activeSessions.length + 1, ipCount: ips.size },
      })
    }
  } catch (err) {
    logger.error({ err }, 'Failed to register device session')
  }
}

export async function revokeDeviceSession(sessionId: string, reason?: string): Promise<void> {
  await prisma.deviceSession.updateMany({
    where: { sessionId: sessionId as any },
    data: { isActive: false, revokedAt: new Date(), revokedReason: reason },
  })
}

// ─────────────────────────────────────────────────────────
// SECURITY DASHBOARD DATA
// ─────────────────────────────────────────────────────────

export async function getSecurityDashboard() {
  const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000)
  const last7d  = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)

  const [
    totalEvents24h,
    criticalEvents24h,
    highEvents24h,
    topThreats,
    recentCritical,
    loginStats,
    blockedIps,
    rateLimitViolations,
    eventsByHour,
  ] = await Promise.all([
    prisma.securityEvent.count({ where: { createdAt: { gte: last24h } } }),
    prisma.securityEvent.count({ where: { severity: 'CRITICAL', createdAt: { gte: last24h } } }),
    prisma.securityEvent.count({ where: { severity: 'HIGH', createdAt: { gte: last24h } } }),
    prisma.securityEvent.groupBy({
      by: ['eventType'],
      _count: { eventType: true },
      where: { createdAt: { gte: last7d }, severity: { in: ['HIGH', 'CRITICAL'] } },
      orderBy: { _count: { eventType: 'desc' } },
      take: 8,
    }),
    prisma.securityEvent.findMany({
      where: { severity: { in: ['HIGH', 'CRITICAL'] }, createdAt: { gte: last24h } },
      orderBy: { createdAt: 'desc' },
      take: 20,
      include: { user: { include: { profile: { select: { displayName: true } } } } },
    }),
    prisma.securityEvent.groupBy({
      by: ['eventType'],
      _count: { eventType: true },
      where: { eventType: { in: ['LOGIN_SUCCESS', 'LOGIN_FAILED', 'OTP_FAILED'] }, createdAt: { gte: last24h } },
    }),
    prisma.blockedIp.findMany({
      where: { OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
      orderBy: { createdAt: 'desc' },
      take: 20,
    }),
    prisma.rateLimitViolation.count({ where: { createdAt: { gte: last24h } } }),
    // Events grouped by hour for the chart
    prisma.$queryRaw<{ hour: Date; count: bigint }[]>`
      SELECT DATE_TRUNC('hour', "createdAt") as hour, COUNT(*) as count
      FROM "SecurityEvent"
      WHERE "createdAt" >= ${last24h}
      GROUP BY hour ORDER BY hour ASC
    `,
  ])

  return {
    summary: {
      totalEvents24h,
      criticalEvents24h,
      highEvents24h,
      blockedIps: blockedIps.length,
      rateLimitViolations,
    },
    topThreats: topThreats.map((t: any) => ({ type: t.eventType, count: t._count.eventType })),
    recentCritical: recentCritical.map((e: any) => ({
      id: e.id,
      type: e.eventType,
      severity: e.severity,
      ip: e.ipAddress,
      user: e.user?.profile?.displayName || e.userId,
      description: e.description,
      riskScore: e.riskScore,
      at: e.createdAt,
    })),
    loginStats: {
      success: loginStats.find((s: any) => s.eventType === 'LOGIN_SUCCESS')?._count.eventType || 0,
      failed: loginStats.find((s: any) => s.eventType === 'LOGIN_FAILED')?._count.eventType || 0,
      otpFailed: loginStats.find((s: any) => s.eventType === 'OTP_FAILED')?._count.eventType || 0,
    },
    blockedIps,
    eventsByHour: eventsByHour.map((e: any) => ({ hour: e.hour, count: Number(e.count) })),
  }
}

export async function getUserActivityLog(userId: string, page = 1, limit = 50) {
  const skip = (page - 1) * limit
  const [events, total] = await Promise.all([
    prisma.securityEvent.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.securityEvent.count({ where: { userId } }),
  ])
  return { events, total, page, pages: Math.ceil(total / limit) }
}

// ─────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────

function riskFromScore(score: number): 'INFO' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' {
  if (score === 0)       return 'INFO'
  if (score <= 25)      return 'LOW'
  if (score <= 50)      return 'MEDIUM'
  if (score <= 75)      return 'HIGH'
  return 'CRITICAL'
}
