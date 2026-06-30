import { prisma, SecurityEventType, SecurityEventSeverity } from '@dating/db'

interface RequestMeta {
  ipAddress: string
  userAgent: string
  platform?: string
  deviceName?: string
  deviceFingerprint?: string
}

// 1. Unified Audit Logger
export async function logSecurityEvent(
  userId: string | null,
  eventType: SecurityEventType,
  severity: SecurityEventSeverity,
  meta: RequestMeta,
  description?: string,
  riskScore: number = 0
) {
  try {
    await prisma.securityEvent.create({
      data: {
        userId,
        eventType,
        severity,
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
        deviceId: meta.deviceFingerprint,
        platform: meta.platform || 'web',
        description,
        riskScore,
      },
    })
  } catch (error) {
    console.error('Failed to commit security audit log:', error)
  }
}

// 2. Active Session & Device Track Constructor
export async function registerDeviceSession(
  userId: string,
  sessionId: string,
  meta: RequestMeta
) {
  // Flag alternative sessions to prevent concurrent account multi-logging abuse
  const activeSessionsCount = await prisma.deviceSession.count({
    where: { userId, isActive: true },
  })

  if (activeSessionsCount >= 3) {
    await logSecurityEvent(
      userId,
      SecurityEventType.CONCURRENT_SESSION_DETECTED,
      SecurityEventSeverity.MEDIUM,
      meta,
      `User has ${activeSessionsCount} concurrent connections.`,
      40
    )
  }

  // Record the footprint inside DeviceSession
  await prisma.deviceSession.create({
    data: {
      userId,
      sessionId,
      deviceFingerprint: meta.deviceFingerprint || null,
      deviceName: meta.deviceName || 'Unknown Device',
      platform: meta.platform || 'web',
      ipAddress: meta.ipAddress,
      isActive: true,
    },
  })
}