import { FastifyInstance } from 'fastify'
import { prisma } from '@dating/db'
import { authenticate } from '../middleware/auth'

export default async function uploadRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate)

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
    const command = new PutObjectCommand({ Bucket: process.env.R2_BUCKET_NAME!, Key: key, ContentType: contentType })
    const uploadUrl = await getSignedUrl(s3, command, { expiresIn: 300 })
    const publicUrl = `${process.env.R2_PUBLIC_URL}/${key}`

    return reply.send({ success: true, data: { uploadUrl, key, publicUrl } })
  })

  app.post('/photos/confirm', async (req, reply) => {
    const { r2Key, url, order, isMain } = req.body as any
    const profile = await prisma.profile.findUnique({ where: { userId: req.userId } })
    if (!profile) return reply.status(404).send({ success: false, error: 'Profile not found' })

    if (isMain) await prisma.photo.updateMany({ where: { profileId: profile.id }, data: { isMain: false } })

    const photo = await prisma.photo.create({
      data: { profileId: profile.id, r2Key, url, order: order || 0, isMain: isMain || false },
    })

    import('../services/ai').then(({ moderateImage }) => {
      moderateImage(url).then(async (result) => {
        await prisma.photo.update({ where: { id: photo.id }, data: { isVerified: result.safe } })
      })
    })

    return reply.status(201).send({ success: true, data: photo })
  })
}
