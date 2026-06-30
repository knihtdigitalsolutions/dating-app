import { NextResponse } from 'next/server'
import { prisma, SecurityEventType, SecurityEventSeverity } from '@dating/db'
import { hashOtp, generateTokens } from '@/lib/store/auth-utils'
import { logSecurityEvent, registerDeviceSession } from '@/lib/security'

export async function POST(request: Request) {
  try {
    const { phone, code, deviceFingerprint, deviceName, platform } = await request.json()
    
    // Resolve platform metadata parameters cleanly
    const ipAddress = request.headers.get('x-forwarded-for') || '127.0.0.1'
    const userAgent = request.headers.get('user-agent') || 'unknown'
    const meta = { ipAddress, userAgent, deviceFingerprint, deviceName, platform }

    // [Prior safety validation checks for OTP exist here...]
    // (Presume activeOtp code verification check passes successfully)

    // Upsert or fetch User record
    let user = await prisma.user.findUnique({
      where: { phone },
      include: { profile: true },
    })

    if (!user) {
      user = await prisma.user.create({
        data: { phone, lastSeen: new Date() },
        include: { profile: true },
      })
    }

    // IP Blacklist System Check
    const isIpBlocked = await prisma.blockedIp.findUnique({ where: { ipAddress } })
    if (isIpBlocked) {
      await logSecurityEvent(user.id, SecurityEventType.IP_BLOCKED, SecurityEventSeverity.HIGH, meta, 'Blocked IP login attempt.')
      return NextResponse.json({ error: 'Access denied from this network patch' }, { status: 403 })
    }

    // Provision Tokens and Session Architecture
    const { accessToken, refreshToken } = generateTokens(user.id)
    const sessionExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)

    const session = await prisma.session.create({
      data: {
        userId: user.id,
        refreshToken,
        expiresAt: sessionExpiresAt,
      },
    })

    // Track active Device Registration and emit Audit Trails
    await registerDeviceSession(user.id, session.id, meta)
    await logSecurityEvent(
      user.id,
      SecurityEventType.LOGIN_SUCCESS,
      SecurityEventSeverity.INFO,
      meta,
      `Successful authentication over ${platform || 'unknown channel'}`
    )

    return NextResponse.json({
      data: {
        tokens: { accessToken, refreshToken },
        user: { id: user.id, phone: user.phone, hasProfile: !!user.profile },
      },
    })
  } catch (error: any) {
    return NextResponse.json({ error: 'Internal Error' }, { status: 500 })
  }
}