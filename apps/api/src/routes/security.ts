/**
 * Security Routes
 *
 * Endpoints for:
 * - User's own activity log
 * - Device session management
 * - Admin security dashboard
 * - IP block management
 * - Export personal security data (GDPR)
 */

import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '@dating/db'
import { authenticate, requirePlan } from '../middleware/auth'
import { getClientIp } from '../middleware/security'
import {
  logSecurityEvent,
  getSecurityDashboard,
  getUserActivityLog,
} from '../services/security'

export default async function securityRoutes(app: FastifyInstance) {

  // ── GET /security/activity ──────────────────────────────
  // The user's own security activity log — shows on their profile
  app.get('/activity', { preHandler: [authenticate] }, async (req, reply) => {
    const { page = '1', limit = '30', severity, type } = req.query as any

    const where: any = { userId: req.userId }
    if (severity) where.severity = severity
    if (type)     where.eventType = type

    const [events, total] = await Promise.all([
      prisma.securityEvent.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (parseInt(page) - 1) * parseInt(limit),
        take: parseInt(limit),
        select: {
          id: true, eventType: true, severity: true,
          ipAddress: true, platform: true, description: true,
          riskScore: true, createdAt: true,
          metadata: true,
        },
      }),
      prisma.securityEvent.count({ where }),
    ])

    return reply.send({
      success: true,
      data: {
        events,
        total,
        page: parseInt(page),
        pages: Math.ceil(total / parseInt(limit)),
      },
    })
  })

  // ── GET /security/activity/summary ─────────────────────
  // Quick summary for the user's security dashboard card
  app.get('/activity/summary', { preHandler: [authenticate] }, async (req, reply) => {
    const last30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)

    const [totalLogins, failedLogins, activeSessions, recentHighRisk] = await Promise.all([
      prisma.securityEvent.count({
        where: { userId: req.userId, eventType: 'LOGIN_SUCCESS', createdAt: { gte: last30d } },
      }),
      prisma.securityEvent.count({
        where: { userId: req.userId, eventType: { in: ['LOGIN_FAILED', 'OTP_FAILED'] }, createdAt: { gte: last30d } },
      }),
      prisma.deviceSession.count({
        where: { userId: req.userId, isActive: true },
      }),
      prisma.securityEvent.findMany({
        where: { userId: req.userId, severity: { in: ['HIGH', 'CRITICAL'] }, createdAt: { gte: last30d } },
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: { eventType: true, severity: true, ipAddress: true, createdAt: true, description: true },
      }),
    ])

    return reply.send({
      success: true,
      data: { totalLogins, failedLogins, activeSessions, recentHighRisk },
    })
  })

  // ── GET /security/sessions ──────────────────────────────
  // All active device sessions for the user
  app.get('/sessions', { preHandler: [authenticate] }, async (req, reply) => {
    const sessions = await prisma.deviceSession.findMany({
      where: { userId: req.userId, isActive: true },
      orderBy: { lastActiveAt: 'desc' },
    })
    return reply.send({ success: true, data: sessions })
  })

  // ── DELETE /security/sessions/:id ──────────────────────
  app.delete('/sessions/:id', { preHandler: [authenticate] }, async (req, reply) => {
    const { id } = req.params as { id: string }
    const ip = getClientIp(req)

    const session = await prisma.deviceSession.findFirst({
      where: { id, userId: req.userId },
    })

    if (!session) return reply.status(404).send({ success: false, error: 'Session not found.' })

    await prisma.deviceSession.update({
      where: { id },
      data: { isActive: false, revokedAt: new Date(), revokedReason: 'user_revoked' },
    })

    // Also revoke the JWT session
    await prisma.session.updateMany({
      where: { id: session.sessionId, userId: req.userId },
      data: { revokedAt: new Date() },
    })

    await logSecurityEvent({
      userId: req.userId, ipAddress: ip,
      eventType: 'SESSION_REVOKED', severity: 'LOW',
      description: `User revoked session on ${session.deviceName || 'unknown device'}`,
      metadata: { deviceName: session.deviceName, platform: session.platform },
    })

    return reply.send({ success: true, message: 'Session revoked.' })
  })

  // ── DELETE /security/sessions — revoke ALL other sessions
  app.delete('/sessions', { preHandler: [authenticate] }, async (req, reply) => {
    const ip = getClientIp(req)
    const currentToken = req.headers.authorization?.slice(7)

    // Revoke all sessions except current
    const revoked = await prisma.session.updateMany({
      where: { userId: req.userId, revokedAt: null },
      data: { revokedAt: new Date() },
    })

    await prisma.deviceSession.updateMany({
      where: { userId: req.userId, isActive: true },
      data: { isActive: false, revokedAt: new Date(), revokedReason: 'user_revoked_all' },
    })

    await logSecurityEvent({
      userId: req.userId, ipAddress: ip,
      eventType: 'SESSION_REVOKED', severity: 'MEDIUM',
      description: `User revoked all sessions (${revoked.count} sessions)`,
      metadata: { count: revoked.count },
    })

    return reply.send({ success: true, message: `All ${revoked.count} other sessions revoked.` })
  })

  // ── POST /security/data-request ────────────────────────
  // GDPR: user requests export of their data
  app.post('/data-request', { preHandler: [authenticate] }, async (req, reply) => {
    const { type } = req.body as { type: 'EXPORT' | 'DELETE' }
    const ip = getClientIp(req)

    const existing = await prisma.dataRequest.findFirst({
      where: { userId: req.userId, type, status: { in: ['PENDING', 'PROCESSING'] } },
    })

    if (existing) {
      return reply.status(409).send({
        success: false,
        error: 'A data request is already in progress.',
        requestedAt: existing.requestedAt,
      })
    }

    const request = await prisma.dataRequest.create({
      data: { userId: req.userId, type, ipAddress: ip },
    })

    await logSecurityEvent({
      userId: req.userId, ipAddress: ip,
      eventType: 'DATA_DOWNLOAD_REQUESTED', severity: 'LOW',
      description: `User requested data ${type.toLowerCase()}`,
      metadata: { requestId: request.id, type },
    })

    return reply.status(201).send({
      success: true,
      message: type === 'EXPORT'
        ? 'Data export requested. You will receive an email with your download link within 24 hours.'
        : 'Account deletion requested. Your account will be deleted within 30 days.',
      data: { requestId: request.id },
    })
  })

  // ─────────────────────────────────────────────────────────
  // ADMIN-ONLY ROUTES
  // ─────────────────────────────────────────────────────────

  // ── GET /security/admin/dashboard ──────────────────────
  app.get('/admin/dashboard', { preHandler: [authenticate] }, async (req, reply) => {
    // TODO: add admin role check middleware
    const data = await getSecurityDashboard()
    return reply.send({ success: true, data })
  })

  // ── GET /security/admin/events ──────────────────────────
  app.get('/admin/events', { preHandler: [authenticate] }, async (req, reply) => {
    const { page = '1', limit = '50', severity, type, userId, ip } = req.query as any

    const where: any = {}
    if (severity) where.severity = severity
    if (type)     where.eventType = type
    if (userId)   where.userId = userId
    if (ip)       where.ipAddress = ip

    const [events, total] = await Promise.all([
      prisma.securityEvent.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (parseInt(page) - 1) * parseInt(limit),
        take: parseInt(limit),
        include: {
          user: { include: { profile: { select: { displayName: true } } } },
        },
      }),
      prisma.securityEvent.count({ where }),
    ])

    return reply.send({
      success: true,
      data: { events, total, page: parseInt(page), pages: Math.ceil(total / parseInt(limit)) },
    })
  })

  // ── GET /security/admin/user/:userId ───────────────────
  app.get('/admin/user/:userId', { preHandler: [authenticate] }, async (req, reply) => {
    const { userId } = req.params as { userId: string }

    const [events, sessions, riskProfile] = await Promise.all([
      prisma.securityEvent.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
      prisma.deviceSession.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
      // Aggregate risk score
      prisma.securityEvent.aggregate({
        where: { userId, createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } },
        _avg: { riskScore: true },
        _max: { riskScore: true },
        _count: { id: true },
      }),
    ])

    return reply.send({
      success: true,
      data: {
        events,
        sessions,
        riskProfile: {
          avgRiskScore: Math.round(riskProfile._avg.riskScore || 0),
          maxRiskScore: riskProfile._max.riskScore || 0,
          totalEvents: riskProfile._count.id,
        },
      },
    })
  })

  // ── POST /security/admin/block-ip ──────────────────────
  app.post('/admin/block-ip', { preHandler: [authenticate] }, async (req, reply) => {
    const { ipAddress, reason, durationHours } = req.body as any
    const adminId = req.userId
    const ip = getClientIp(req)

    const expiresAt = durationHours
      ? new Date(Date.now() + durationHours * 60 * 60 * 1000)
      : null

    await prisma.blockedIp.upsert({
      where: { ipAddress },
      update: { reason, blockedBy: adminId, expiresAt },
      create: { ipAddress, reason, blockedBy: adminId, expiresAt },
    })

    // Cache in Redis for fast lookup
    const ttl = durationHours ? durationHours * 3600 : 86400 * 365
    await redis.set(`ip:blocked:${ipAddress}`, '1', 'EX', ttl)

    await logSecurityEvent({
      userId: adminId, ipAddress: ip,
      eventType: 'IP_BLOCKED', severity: 'HIGH',
      description: `Admin blocked IP: ${ipAddress}. Reason: ${reason}`,
      metadata: { blockedIp: ipAddress, durationHours, reason },
    })

    return reply.send({ success: true, message: `IP ${ipAddress} blocked.` })
  })

  // ── DELETE /security/admin/block-ip/:ip ────────────────
  app.delete('/admin/block-ip/:ip', { preHandler: [authenticate] }, async (req, reply) => {
    const { ip: blockedIp } = req.params as { ip: string }
    const ip = getClientIp(req)

    await prisma.blockedIp.deleteMany({ where: { ipAddress: blockedIp } })
    await redis.del(`ip:blocked:${blockedIp}`)

    await logSecurityEvent({
      userId: req.userId, ipAddress: ip,
      eventType: 'ADMIN_USER_UNBANNED', severity: 'LOW',
      description: `Admin unblocked IP: ${blockedIp}`,
      metadata: { unblockedIp: blockedIp },
    })

    return reply.send({ success: true, message: `IP ${blockedIp} unblocked.` })
  })

  // ── POST /security/admin/resolve-event/:id ─────────────
  app.post('/admin/resolve-event/:id', { preHandler: [authenticate] }, async (req, reply) => {
    const { id } = req.params as { id: string }
    const { note } = req.body as { note?: string }

    await prisma.securityEvent.update({
      where: { id },
      data: { isReviewed: true, reviewedBy: req.userId, reviewNote: note },
    })

    return reply.send({ success: true })
  })
}
