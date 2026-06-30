import { headers } from 'next/headers'
import jwt from 'jsonwebtoken'
import { prisma } from '@dating/db'

const JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'super-secret-access-key'

export async function authenticateUser() {
  const reqHeaders = await headers()
  const authHeader = reqHeaders.get('authorization')

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new Error('Missing token')
  }

  const token = authHeader.split(' ')[1]

  try {
    const decoded = jwt.verify(token, JWT_ACCESS_SECRET) as { userId: string }
    
    // Cross-verify status and make sure user is active and unbanned
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: { id: true, isBanned: true, isActive: true },
    })

    if (!user || user.isBanned || !user.isActive) {
      throw new Error('Unauthorized')
    }

    // Security Session verification validation
    const activeSession = await prisma.session.findFirst({
      where: { userId: user.id, revokedAt: null },
    })

    if (!activeSession) {
      throw new Error('Session revoked or completely terminated')
    }

    return user
  } catch (err) {
    throw new Error('Invalid token security footprint context')
  }
}