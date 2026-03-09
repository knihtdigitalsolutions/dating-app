import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '@dating/db'
import { authenticate } from '../middleware/auth'
import { generateProfileEmbedding } from '../services/ai'

const createProfileSchema = z.object({
  displayName: z.string().min(2).max(50),
  bio: z.string().max(500).optional(),
  age: z.number().int().min(18).max(100),
  birthDate: z.string(),
  gender: z.enum(['MALE', 'FEMALE', 'NON_BINARY', 'OTHER']),
  interestedIn: z.array(z.enum(['MALE', 'FEMALE', 'NON_BINARY', 'OTHER'])).min(1),
  interests: z.array(z.string()).max(20).optional(),
  lookingFor: z.string().optional(),
  height: z.number().int().min(100).max(250).optional(),
  occupation: z.string().max(100).optional(),
  education: z.string().optional(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  locationName: z.string().optional(),
})

export default async function profileRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate)

  // GET /profiles/me
  app.get('/me', async (req, reply) => {
    const profile = await prisma.profile.findUnique({
      where: { userId: req.userId },
      include: {
        photos: { orderBy: { order: 'asc' } },
        videos: true,
        user: { include: { subscription: true } },
      },
    })

    if (!profile) return reply.status(404).send({ success: false, error: 'Profile not found' })
    return reply.send({ success: true, data: profile })
  })

  // POST /profiles
  app.post('/', async (req, reply) => {
    const body = createProfileSchema.safeParse(req.body)
    if (!body.success) {
      return reply.status(400).send({ success: false, error: body.error.errors[0].message })
    }

    const existing = await prisma.profile.findUnique({ where: { userId: req.userId } })
    if (existing) {
      return reply.status(409).send({ success: false, error: 'Profile already exists' })
    }

    const profile = await prisma.profile.create({
      data: {
        ...body.data,
        birthDate: new Date(body.data.birthDate),
        userId: req.userId,
        interestedIn: body.data.interestedIn as any[],
      },
    })

    // Generate AI embedding async
    generateProfileEmbedding(profile.id)

    return reply.status(201).send({ success: true, data: profile })
  })

  // PATCH /profiles/me
  app.patch('/me', async (req, reply) => {
    const profile = await prisma.profile.update({
      where: { userId: req.userId },
      data: req.body as any,
    })

    // Regenerate embedding if bio or interests changed
    if ((req.body as any).bio || (req.body as any).interests) {
      generateProfileEmbedding(profile.id)
    }

    return reply.send({ success: true, data: profile })
  })

  // GET /profiles/:userId
  app.get('/:userId', async (req, reply) => {
    const { userId } = req.params as { userId: string }

    // Check if blocked
    const blocked = await prisma.block.findFirst({
      where: {
        OR: [
          { blockerId: req.userId, blockedId: userId },
          { blockerId: userId, blockedId: req.userId },
        ],
      },
    })

    if (blocked) return reply.status(404).send({ success: false, error: 'Profile not found' })

    const profile = await prisma.profile.findUnique({
      where: { userId },
      include: {
        photos: { where: { isVerified: true }, orderBy: { order: 'asc' } },
        videos: { where: { isVerified: true } },
      },
    })

    if (!profile) return reply.status(404).send({ success: false, error: 'Profile not found' })

    // Increment view count
    await prisma.profile.update({
      where: { id: profile.id },
      data: { profileViews: { increment: 1 } },
    })

    return reply.send({ success: true, data: profile })
  })
}
