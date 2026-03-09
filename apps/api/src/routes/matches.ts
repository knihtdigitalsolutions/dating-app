import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '@dating/db'
import { authenticate } from '../middleware/auth'
import { redis, RATE_KEYS } from '../lib/redis'
import { getAiCompatibilityScore } from '../services/ai'
import { sendMatchNotification } from '../services/notifications'

const swipeSchema = z.object({
  swipedId: z.string().uuid(),
  action: z.enum(['LIKE', 'PASS', 'SUPER_LIKE']),
})

export default async function matchRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate)

  // ── GET /matches/discover ────────────────────────────────
  // Returns paginated profile cards for swiping
  app.get('/discover', async (req, reply) => {
    const userId = req.userId

    // Try cache first
    const cacheKey = RATE_KEYS.swipeCache(userId)
    const cached = await redis.get(cacheKey)
    if (cached) {
      return reply.send({ success: true, data: JSON.parse(cached) })
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { profile: true },
    })

    if (!user?.profile) {
      return reply.status(400).send({ success: false, error: 'Complete your profile first' })
    }

    // Get IDs to exclude (already swiped, blocked, self)
    const [swipedIds, blockedIds] = await Promise.all([
      prisma.swipe.findMany({
        where: { swiperId: userId },
        select: { swipedId: true },
      }),
      prisma.block.findMany({
        where: { OR: [{ blockerId: userId }, { blockedId: userId }] },
        select: { blockerId: true, blockedId: true },
      }),
    ])

    const excludeIds = [
      userId,
      ...swipedIds.map((s) => s.swipedId),
      ...blockedIds.map((b) => b.blockerId === userId ? b.blockedId : b.blockerId),
    ]

    const profiles = await prisma.profile.findMany({
      where: {
        userId: { notIn: excludeIds },
        gender: { in: user.profile.interestedIn as any[] },
        age: { gte: 18, lte: 60 },
        // Only show verified photos
        photos: { some: { isVerified: true } },
      },
      include: {
        photos: { where: { isVerified: true }, orderBy: { order: 'asc' }, take: 6 },
        videos: { where: { isVerified: true }, take: 1 },
        user: { select: { lastSeen: true } },
      },
      take: 20,
      orderBy: { createdAt: 'desc' },
    })

    const cards = profiles.map((p) => ({
      id: p.id,
      userId: p.userId,
      displayName: p.displayName,
      age: p.age,
      bio: p.bio,
      gender: p.gender,
      interests: p.interests,
      locationName: p.locationName,
      verificationStatus: p.verificationStatus,
      photos: p.photos.map((ph) => ({ url: ph.url, order: ph.order })),
      videos: p.videos.map((v) => ({ streamVideoId: v.streamVideoId, thumbnailUrl: v.thumbnailUrl })),
      isOnline: isOnline(p.user.lastSeen),
    }))

    // Cache for 5 minutes
    await redis.set(cacheKey, JSON.stringify(cards), 'EX', 300)

    return reply.send({ success: true, data: cards })
  })

  // ── POST /matches/swipe ──────────────────────────────────
  app.post('/swipe', {
    config: { rateLimit: { max: 200, timeWindow: '1 minute' } },
  }, async (req, reply) => {
    const body = swipeSchema.safeParse(req.body)
    if (!body.success) {
      return reply.status(400).send({ success: false, error: 'Invalid swipe data' })
    }

    const { swipedId, action } = body.data
    const swiperId = req.userId

    if (swiperId === swipedId) {
      return reply.status(400).send({ success: false, error: 'Cannot swipe yourself' })
    }

    // Check daily like limit for FREE users
    if (action === 'LIKE' && req.userPlan === 'FREE') {
      const dailyKey = RATE_KEYS.swipe(swiperId)
      const todayLikes = parseInt(await redis.get(dailyKey) || '0')
      if (todayLikes >= 20) {
        return reply.status(429).send({
          success: false,
          error: 'Daily like limit reached. Upgrade to Gold for more!',
          upgradeRequired: true,
        })
      }
      const ttl = secondsUntilMidnight()
      await redis.set(dailyKey, todayLikes + 1, 'EX', ttl)
    }

    // Record swipe (upsert in case of retry)
    await prisma.swipe.upsert({
      where: { swiperId_swipedId: { swiperId, swipedId } },
      update: { action: action as any },
      create: { swiperId, swipedId, action: action as any },
    })

    // Invalidate swipe deck cache
    await redis.del(RATE_KEYS.swipeCache(swiperId))

    // Check for mutual match
    let matchResult = { isMatch: false, match: null as any }

    if (action === 'LIKE' || action === 'SUPER_LIKE') {
      const theirSwipe = await prisma.swipe.findUnique({
        where: { swiperId_swipedId: { swiperId: swipedId, swipedId: swiperId } },
      })

      if (theirSwipe && (theirSwipe.action === 'LIKE' || theirSwipe.action === 'SUPER_LIKE')) {
        // It's a match!
        const [user1Id, user2Id] = [swiperId, swipedId].sort()

        const match = await prisma.match.upsert({
          where: { user1Id_user2Id: { user1Id, user2Id } },
          update: { isActive: true },
          create: {
            user1Id,
            user2Id,
            isSuperMatch: action === 'SUPER_LIKE' || theirSwipe.action === 'SUPER_LIKE',
          },
        })

        // Compute AI compatibility in background
        getAiCompatibilityScore(user1Id, user2Id).then(async (score) => {
          if (score) {
            await prisma.match.update({ where: { id: match.id }, data: { compatibilityScore: score } })
          }
        })

        // Send push notifications to both
        await sendMatchNotification(swiperId, swipedId, match.id)

        matchResult = { isMatch: true, match: { id: match.id } }
      }
    }

    return reply.send({ success: true, data: matchResult })
  })

  // ── GET /matches ─────────────────────────────────────────
  app.get('/', async (req, reply) => {
    const userId = req.userId

    const matches = await prisma.match.findMany({
      where: {
        OR: [{ user1Id: userId }, { user2Id: userId }],
        isActive: true,
      },
      include: {
        user1: { include: { profile: { include: { photos: { where: { isMain: true }, take: 1 } } } } },
        user2: { include: { profile: { include: { photos: { where: { isMain: true }, take: 1 } } } } },
        messages: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
      orderBy: { lastMessageAt: { sort: 'desc', nulls: 'last' } },
    })

    const formatted = matches.map((m) => {
      const other = m.user1Id === userId ? m.user2 : m.user1
      return {
        id: m.id,
        matchedAt: m.matchedAt,
        compatibilityScore: m.compatibilityScore,
        isSuperMatch: m.isSuperMatch,
        other: {
          id: other.id,
          displayName: other.profile?.displayName,
          photo: other.profile?.photos[0]?.url,
          isOnline: isOnline(other.lastSeen),
        },
        lastMessage: m.messages[0] ? {
          content: m.messages[0].content,
          type: m.messages[0].type,
          createdAt: m.messages[0].createdAt,
          isRead: m.messages[0].isRead,
          isMine: m.messages[0].senderId === userId,
        } : null,
      }
    })

    return reply.send({ success: true, data: formatted })
  })
}

function isOnline(lastSeen: Date): boolean {
  return Date.now() - lastSeen.getTime() < 5 * 60 * 1000 // 5 minutes
}

function secondsUntilMidnight(): number {
  const now = new Date()
  const midnight = new Date(now)
  midnight.setHours(24, 0, 0, 0)
  return Math.floor((midnight.getTime() - now.getTime()) / 1000)
}
