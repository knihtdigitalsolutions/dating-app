import { FastifyInstance } from 'fastify'
import { prisma } from '@dating/db'
import { authenticate } from '../middleware/auth'
import { presignUpload, publicUrl, storageKey } from '../services/storage'

export default async function uploadRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate)

  // Returns a presigned Supabase Storage URL for direct client upload
  app.post('/presign', async (req, reply) => {
    const { filename, contentType, folder = 'photos' } = req.body as any
    const key = storageKey(folder, req.userId, filename)
    const uploadUrl = await presignUpload(key, contentType)
    return reply.send({ success: true, data: { uploadUrl, key, publicUrl: publicUrl(key) } })
  })

  // Called after client finishes uploading — saves photo record to DB
  app.post('/photos/confirm', async (req, reply) => {
    const { storageKey: key, url, order, isMain } = req.body as any
    const profile = await prisma.profile.findUnique({ where: { userId: req.userId } })
    if (!profile) return reply.status(404).send({ success: false, error: 'Profile not found' })

    if (isMain) await prisma.photo.updateMany({ where: { profileId: profile.id }, data: { isMain: false } })

    const photo = await prisma.photo.create({
      data: { profileId: profile.id, storageKey: key, url, order: order || 0, isMain: isMain || false },
    })

    // Async moderation — doesn't block response
    import('../services/ai').then(({ moderateImage }) => {
      moderateImage(url).then(async (result) => {
        await prisma.photo.update({ where: { id: photo.id }, data: { isVerified: result.safe } })
      })
    })

    return reply.status(201).send({ success: true, data: photo })
  })
}
