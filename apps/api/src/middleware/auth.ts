import { FastifyRequest, FastifyReply } from 'fastify'
import jwt from 'jsonwebtoken'
import { redis, RATE_KEYS } from '../lib/redis'
import type { JwtPayload } from '@dating/types'

declare module 'fastify' {
  interface FastifyRequest {
    userId: string
    userPlan: string
  }
}

export async function authenticate(req: FastifyRequest, reply: FastifyReply) {
  try {
    const authHeader = req.headers.authorization
    if (!authHeader?.startsWith('Bearer ')) {
      return reply.status(401).send({ success: false, error: 'Missing auth token' })
    }

    const token = authHeader.slice(7)
    const payload = jwt.verify(token, process.env.JWT_ACCESS_SECRET!) as JwtPayload

    // Check blacklist (logged-out tokens)
    const isBlacklisted = await redis.exists(RATE_KEYS.tokenBlacklist(payload.sub + ':' + payload.iat))
    if (isBlacklisted) {
      return reply.status(401).send({ success: false, error: 'Token revoked' })
    }

    req.userId = payload.sub
    req.userPlan = payload.plan
  } catch {
    return reply.status(401).send({ success: false, error: 'Invalid or expired token' })
  }
}

export function requirePlan(minPlan: 'GOLD' | 'PLATINUM') {
  const planRank = { FREE: 0, GOLD: 1, PLATINUM: 2 }
  return async (req: FastifyRequest, reply: FastifyReply) => {
    const userRank = planRank[req.userPlan as keyof typeof planRank] ?? 0
    const requiredRank = planRank[minPlan]
    if (userRank < requiredRank) {
      return reply.status(403).send({
        success: false,
        error: `This feature requires ${minPlan} plan`,
        upgradeRequired: true,
      })
    }
  }
}
