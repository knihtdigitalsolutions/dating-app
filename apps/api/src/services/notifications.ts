import axios from 'axios'
import { prisma } from '@dating/db'
import { logger } from '../lib/logger'

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send'

interface PushMessage {
  to: string | string[]
  title: string
  body: string
  data?: Record<string, any>
  sound?: 'default' | null
  badge?: number
  priority?: 'default' | 'normal' | 'high'
}

export async function sendPushNotification(userId: string, notification: Omit<PushMessage, 'to'>) {
  try {
    const tokens = await prisma.pushToken.findMany({ where: { userId } })
    if (!tokens.length) return

    const messages = tokens.map((t: any) => ({
      to: t.token,
      ...notification,
      sound: 'default' as const,
      priority: 'high' as const,
    }))

    // Store notification in DB
    await prisma.notification.create({
      data: {
        userId,
        type: (notification.data?.type as string) || 'SYSTEM',
        title: notification.title,
        body: notification.body,
        data: notification.data,
      },
    })

    await axios.post(EXPO_PUSH_URL, messages, {
      headers: {
        Accept: 'application/json',
        'Accept-Encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.EXPO_ACCESS_TOKEN}`,
      },
    })
  } catch (err) {
    logger.error({ err, userId }, 'Push notification failed')
  }
}

export async function sendMatchNotification(user1Id: string, user2Id: string, matchId: string) {
  const [profile1, profile2] = await Promise.all([
    prisma.profile.findUnique({ where: { userId: user1Id }, select: { displayName: true } }),
    prisma.profile.findUnique({ where: { userId: user2Id }, select: { displayName: true } }),
  ])

  await Promise.all([
    sendPushNotification(user1Id, {
      title: "It's a Match! 💘",
      body: `You and ${profile2?.displayName} liked each other!`,
      data: { type: 'MATCH', matchId },
    }),
    sendPushNotification(user2Id, {
      title: "It's a Match! 💘",
      body: `You and ${profile1?.displayName} liked each other!`,
      data: { type: 'MATCH', matchId },
    }),
  ])
}

export async function sendMessageNotification(senderId: string, recipientId: string, matchId: string) {
  const sender = await prisma.profile.findUnique({
    where: { userId: senderId },
    select: { displayName: true },
  })

  await sendPushNotification(recipientId, {
    title: sender?.displayName || 'New message',
    body: 'Sent you a message',
    data: { type: 'MESSAGE', matchId, senderId },
  })
}
