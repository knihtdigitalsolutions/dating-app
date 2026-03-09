import { FastifyInstance } from 'fastify'
import { prisma } from '@dating/db'
import { authenticate } from '../middleware/auth'

export default async function notificationRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate)

  app.get('/', async (req, reply) => {
    const notifications = await prisma.notification.findMany({
      where: { userId: req.userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    })
    return reply.send({ success: true, data: notifications })
  })

  app.patch('/read-all', async (req, reply) => {
    await prisma.notification.updateMany({
      where: { userId: req.userId, isRead: false },
      data: { isRead: true, readAt: new Date() },
    })
    return reply.send({ success: true })
  })

  app.post('/push-token', async (req, reply) => {
    const { token, platform } = req.body as any
    await prisma.pushToken.upsert({
      where: { token },
      update: { userId: req.userId, platform, updatedAt: new Date() },
      create: { userId: req.userId, token, platform },
    })
    return reply.send({ success: true })
  })
}
