import Redis from 'ioredis'
import { logger } from './logger'

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379'

export const redis = new Redis(REDIS_URL, {
  maxRetriesPerRequest: 3,
  enableReadyCheck: false,
  lazyConnect: true,
})

// Separate pub/sub clients for Socket.io adapter
export const pubClient = new Redis(REDIS_URL, { lazyConnect: true })
export const subClient = pubClient.duplicate()

redis.on('error', (err) => logger.error({ err }, 'Redis error'))
redis.on('connect', () => logger.info('Redis connected'))

// Helper: set with TTL (seconds)
export async function redisSet(key: string, value: string, ttlSeconds?: number) {
  if (ttlSeconds) {
    await redis.set(key, value, 'EX', ttlSeconds)
  } else {
    await redis.set(key, value)
  }
}

// Rate limit key helpers
export const RATE_KEYS = {
  otpRequest: (phone: string) => `otp:req:${phone}`,
  otpVerify: (phone: string) => `otp:verify:${phone}`,
  swipe: (userId: string) => `swipe:daily:${userId}`,
  tokenBlacklist: (jti: string) => `blacklist:${jti}`,
  userPresence: (userId: string) => `presence:${userId}`,
  swipeCache: (userId: string) => `swipe:deck:${userId}`,
}
