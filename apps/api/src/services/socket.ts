import { Server, Socket } from 'socket.io'
import jwt from 'jsonwebtoken'
import { prisma } from '@dating/db'
import { redis, RATE_KEYS } from '../lib/redis'
import { logger } from '../lib/logger'
import { createLiveKitToken } from './livekit'

interface AuthenticatedSocket extends Socket {
  userId: string
  userPlan: string
}

export function registerSocketHandlers(io: Server) {
  // ── Auth middleware ──────────────────────────────────────
  io.use(async (socket: any, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.headers?.authorization?.slice(7)

    if (!token) {
      return next(new Error('Authentication required'))
    }

    try {
      const payload = jwt.verify(token, process.env.JWT_ACCESS_SECRET!) as { sub: string; plan: string }

      const isBlacklisted = await redis.exists(RATE_KEYS.tokenBlacklist(payload.sub + ':' + (payload as any).iat))
      if (isBlacklisted) return next(new Error('Token revoked'))

      socket.userId = payload.sub
      socket.userPlan = payload.plan
      next()
    } catch {
      next(new Error('Invalid token'))
    }
  })

  io.on('connection', async (socket: AuthenticatedSocket | any) => {
    const userId = socket.userId
    logger.info({ userId }, 'Socket connected')

    // Join personal room
    socket.join(`user:${userId}`)

    // Mark user online
    await redis.set(RATE_KEYS.userPresence(userId), Date.now().toString(), 'EX', 300)
    await prisma.user.update({ where: { id: userId }, data: { lastSeen: new Date() } })

    // Broadcast online status to matches
    const matches = await getUserMatchIds(userId)
    matches.forEach((matchUserId) => {
      io.to(`user:${matchUserId}`).emit('presence:update', {
        userId,
        isOnline: true,
        lastSeen: new Date().toISOString(),
      })
    })

    // ── Message events ───────────────────────────────────
    socket.on('message:send', async (data: any) => {
      try {
        const { matchId, type, content, mediaUrl, duration } = data

        // Verify user is in this match
        const match = await prisma.match.findFirst({
          where: {
            id: matchId,
            OR: [{ user1Id: userId }, { user2Id: userId }],
            isActive: true,
          },
        })

        if (!match) return

        const message = await prisma.message.create({
          data: { matchId, senderId: userId, type, content, mediaUrl, duration },
        })

        await prisma.match.update({
          where: { id: matchId },
          data: { lastMessageAt: new Date() },
        })

        const otherId = match.user1Id === userId ? match.user2Id : match.user1Id

        // Send to recipient
        io.to(`user:${otherId}`).emit('message:new', {
          id: message.id,
          matchId,
          senderId: userId,
          type,
          content,
          mediaUrl,
          duration,
          isRead: false,
          createdAt: message.createdAt.toISOString(),
        })

        // Confirm to sender
        socket.emit('message:sent', { id: message.id, createdAt: message.createdAt })
      } catch (err) {
        logger.error({ err }, 'message:send error')
      }
    })

    socket.on('message:read', async ({ messageId }: { messageId: string }) => {
      const message = await prisma.message.update({
        where: { id: messageId },
        data: { isRead: true, readAt: new Date() },
      })

      // Notify sender
      io.to(`user:${message.senderId}`).emit('message:read:ack', {
        messageId,
        readAt: message.readAt!.toISOString(),
      })
    })

    // ── Typing events ────────────────────────────────────
    socket.on('typing:start', async ({ matchId }: { matchId: string }) => {
      const otherId = await getOtherUserId(matchId, userId)
      if (otherId) {
        io.to(`user:${otherId}`).emit('typing:indicator', { matchId, userId, isTyping: true })
      }
    })

    socket.on('typing:stop', async ({ matchId }: { matchId: string }) => {
      const otherId = await getOtherUserId(matchId, userId)
      if (otherId) {
        io.to(`user:${otherId}`).emit('typing:indicator', { matchId, userId, isTyping: false })
      }
    })

    // ── Call events ──────────────────────────────────────
    socket.on('call:initiate', async (data: any) => {
      const { matchId, calleeId, type } = data

      // Premium feature check
      if (socket.userPlan === 'FREE') {
        socket.emit('call:error', { error: 'Calls require Gold or Platinum plan', upgradeRequired: true })
        return
      }

      // Create call record
      const call = await prisma.call.create({
        data: { matchId, callerId: userId, calleeId, type, status: 'RINGING' },
      })

      const caller = await prisma.profile.findUnique({
        where: { userId },
        include: { photos: { where: { isMain: true }, take: 1 } },
      })

      // Notify callee
      io.to(`user:${calleeId}`).emit('call:incoming', {
        id: call.id,
        matchId,
        callerId: userId,
        callerName: caller?.displayName,
        callerPhoto: caller?.photos[0]?.url,
        type,
        status: 'RINGING',
      })

      // Auto-decline if no answer in 45s
      setTimeout(async () => {
        const activeCall = await prisma.call.findUnique({ where: { id: call.id } })
        if (activeCall?.status === 'RINGING') {
          await prisma.call.update({ where: { id: call.id }, data: { status: 'MISSED' } })
          socket.emit('call:ended', { callId: call.id, reason: 'no_answer' })
        }
      }, 45000)
    })

    socket.on('call:accept', async ({ callId }: { callId: string }) => {
      const call = await prisma.call.findUnique({ where: { id: callId } })
      if (!call || call.calleeId !== userId) return

      // Generate LiveKit room
      const roomName = `call-${callId}`
      const [callerToken, calleeToken] = await Promise.all([
        createLiveKitToken(roomName, call.callerId),
        createLiveKitToken(roomName, call.calleeId),
      ])

      await prisma.call.update({
        where: { id: callId },
        data: { status: 'ACTIVE', roomName, startedAt: new Date() },
      })

      // Give each party their token
      io.to(`user:${call.callerId}`).emit('call:accepted', { callId, roomToken: callerToken, roomName })
      socket.emit('call:accepted', { callId, roomToken: calleeToken, roomName })
    })

    socket.on('call:decline', async ({ callId }: { callId: string }) => {
      const call = await prisma.call.findUnique({ where: { id: callId } })
      if (!call) return

      await prisma.call.update({ where: { id: callId }, data: { status: 'DECLINED', endedAt: new Date() } })

      io.to(`user:${call.callerId}`).emit('call:declined', { callId })
    })

    socket.on('call:end', async ({ callId }: { callId: string }) => {
      const call = await prisma.call.findUnique({ where: { id: callId } })
      if (!call) return

      const duration = call.startedAt
        ? Math.floor((Date.now() - call.startedAt.getTime()) / 1000)
        : 0

      await prisma.call.update({
        where: { id: callId },
        data: { status: 'ENDED', endedAt: new Date(), duration },
      })

      const otherId = call.callerId === userId ? call.calleeId : call.callerId
      io.to(`user:${otherId}`).emit('call:ended', { callId, duration })
    })

    // ── Presence ping ────────────────────────────────────
    socket.on('presence:ping', async () => {
      await redis.set(RATE_KEYS.userPresence(userId), Date.now().toString(), 'EX', 300)
      await prisma.user.update({ where: { id: userId }, data: { lastSeen: new Date() } })
    })

    // ── Disconnect ───────────────────────────────────────
    socket.on('disconnect', async () => {
      logger.info({ userId }, 'Socket disconnected')
      await redis.del(RATE_KEYS.userPresence(userId))

      const matchUserIds = await getUserMatchIds(userId)
      matchUserIds.forEach((matchUserId) => {
        io.to(`user:${matchUserId}`).emit('presence:update', {
          userId,
          isOnline: false,
          lastSeen: new Date().toISOString(),
        })
      })
    })
  })
}

async function getUserMatchIds(userId: string): Promise<string[]> {
  const matches = await prisma.match.findMany({
    where: { OR: [{ user1Id: userId }, { user2Id: userId }], isActive: true },
    select: { user1Id: true, user2Id: true },
  })
  return matches.map((m: any) => (m.user1Id === userId ? m.user2Id : m.user1Id))
}

async function getOtherUserId(matchId: string, userId: string): Promise<string | null> {
  const match = await prisma.match.findUnique({ where: { id: matchId } })
  if (!match) return null
  return match.user1Id === userId ? match.user2Id : match.user1Id
}
