import { NextResponse } from 'next/server'
import { prisma } from '@dating/db'
import jwt from 'jsonwebtoken'
import { generateTokens } from '@/lib/store/auth-utils'

const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'super-secret-refresh-key'

export async function POST(request: Request) {
  try {
    const { refreshToken } = await request.json()

    if (!refreshToken) {
      return NextResponse.json({ error: 'Refresh token required' }, { status: 400 })
    }

    // Find token in database and ensure it hasn't been revoked
    const savedSession = await prisma.session.findUnique({
      where: { refreshToken },
    })

    if (!savedSession || savedSession.revokedAt || new Date() > savedSession.expiresAt) {
      return NextResponse.json({ error: 'Invalid or expired session' }, { status: 401 })
    }

    // Verify JWT cryptographic signature
    const decoded = jwt.verify(refreshToken, JWT_REFRESH_SECRET) as { userId: string }

    // Generate fresh pair
    const tokens = generateTokens(decoded.userId)

    // Secure Token Rotation: Delete old session record, create new one
    await prisma.session.delete({ where: { id: savedSession.id } })
    await prisma.session.create({
      data: {
        userId: decoded.userId,
        refreshToken: tokens.refreshToken,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    })

    return NextResponse.json({ data: { tokens } })
  } catch (error) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
}