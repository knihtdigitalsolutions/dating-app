import { FastifyInstance } from 'fastify'
import { prisma } from '@dating/db'
import { authenticate } from '../middleware/auth'

export async function callRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate)

  app.get('/history', async (req, reply) => {
    const calls = await prisma.call.findMany({
      where: { OR: [{ callerId: req.userId }, { calleeId: req.userId }] },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: {
        caller: { include: { profile: { select: { displayName: true, photos: { where: { isMain: true }, take: 1 } } } } },
        callee: { include: { profile: { select: { displayName: true, photos: { where: { isMain: true }, take: 1 } } } } },
      },
    })
    return reply.send({ success: true, data: calls })
  })
}

export async function uploadRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate)

  // Returns a presigned R2 URL for direct upload
  app.post('/presign', async (req, reply) => {
    const { filename, contentType, folder = 'photos' } = req.body as any

    const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3')
    const { getSignedUrl } = await import('@aws-sdk/s3-request-presigner')

    const s3 = new S3Client({
      region: 'auto',
      endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID!,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
      },
    })

    const key = `${folder}/${req.userId}/${Date.now()}-${filename}`
    const command = new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME!,
      Key: key,
      ContentType: contentType,
    })

    const uploadUrl = await getSignedUrl(s3, command, { expiresIn: 300 })
    const publicUrl = `${process.env.R2_PUBLIC_URL}/${key}`

    return reply.send({ success: true, data: { uploadUrl, key, publicUrl } })
  })

  // Register photo after upload
  app.post('/photos/confirm', async (req, reply) => {
    const { r2Key, url, order, isMain } = req.body as any

    const profile = await prisma.profile.findUnique({ where: { userId: req.userId } })
    if (!profile) return reply.status(404).send({ success: false, error: 'Profile not found' })

    if (isMain) {
      await prisma.photo.updateMany({ where: { profileId: profile.id }, data: { isMain: false } })
    }

    const photo = await prisma.photo.create({
      data: { profileId: profile.id, r2Key, url, order: order || 0, isMain: isMain || false },
    })

    // Moderate async
    import('../services/ai').then(({ moderateImage }) => {
      moderateImage(url).then(async (result) => {
        await prisma.photo.update({
          where: { id: photo.id },
          data: { isVerified: result.safe },
        })
      })
    })

    return reply.status(201).send({ success: true, data: photo })
  })
}

export async function notificationRoutes(app: FastifyInstance) {
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

export async function adminRoutes(app: FastifyInstance) {
  // TODO: Add admin auth middleware
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
      include: {
        reporter: { include: { profile: { select: { displayName: true } } } },
        reported: { include: { profile: { select: { displayName: true } } } },
      },
      orderBy: { createdAt: 'desc' },
    })
    return reply.send({ success: true, data: reports })
  })
}

export default callRoutes
