import { FastifyInstance } from 'fastify'
import { prisma } from '@dating/db'

export default async function adminRoutes(app: FastifyInstance) {
  app.get('/stats', async (req, reply) => {
    const [users, matches, activeSubscriptions] = await Promise.all([
      prisma.user.count(),
      prisma.match.count(),
      prisma.subscription.count({ where: { status: 'ACTIVE', plan: { not: 'FREE' } } }),
    ])
    return reply.send({ success: true, data: { users, matches, activeSubscriptions } })
  })

  app.get('/reports', async (req, reply) => {
    const reports = await prisma.report.findMany({
      where: { status: 'PENDING' },
      orderBy: { createdAt: 'desc' },
      take: 50,
    })
    return reply.send({ success: true, data: reports })
  })
}
