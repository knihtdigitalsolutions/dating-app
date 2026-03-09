import { FastifyInstance } from 'fastify'
import { prisma } from '@dating/db'
import { authenticate } from '../middleware/auth'
import { sendMessageNotification } from '../services/notifications'

export default async function messageRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate)

  // GET /messages/:matchId
  app.get('/:matchId', async (req, reply) => {
    const { matchId } = req.params as { matchId: string }
    const { cursor, limit = 30 } = req.query as { cursor?: string; limit?: number }

    const match = await prisma.match.findFirst({
      where: {
        id: matchId,
        OR: [{ user1Id: req.userId }, { user2Id: req.userId }],
      },
    })

    if (!match) return reply.status(404).send({ success: false, error: 'Match not found' })

    const messages = await prisma.message.findMany({
      where: {
        matchId,
        deletedAt: null,
        ...(cursor ? { createdAt: { lt: new Date(cursor) } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: Number(limit),
    })

    // Mark messages as read
    await prisma.message.updateMany({
      where: { matchId, senderId: { not: req.userId }, isRead: false },
      data: { isRead: true, readAt: new Date() },
    })

    return reply.send({
      success: true,
      data: messages.reverse(),
      hasMore: messages.length === Number(limit),
    })
  })

  // POST /messages (HTTP fallback, prefer socket)
  app.post('/', async (req, reply) => {
    const { matchId, type, content, mediaUrl, duration } = req.body as any

    const match = await prisma.match.findFirst({
      where: {
        id: matchId,
        OR: [{ user1Id: req.userId }, { user2Id: req.userId }],
        isActive: true,
      },
    })

    if (!match) return reply.status(403).send({ success: false, error: 'Not authorized' })

    const message = await prisma.message.create({
      data: { matchId, senderId: req.userId, type, content, mediaUrl, duration },
    })

    const recipientId = match.user1Id === req.userId ? match.user2Id : match.user1Id
    await sendMessageNotification(req.userId, recipientId, matchId)

    return reply.status(201).send({ success: true, data: message })
  })
}
