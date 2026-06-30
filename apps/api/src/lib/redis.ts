import Redis from 'ioredis'
import { logger } from './logger'

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379'

// Check if we are running in production and using a secure connection string
const isSecure = REDIS_URL.startsWith('rediss://') || process.env.NODE_ENV === 'production'

export const redis = new Redis(REDIS_URL, {
  // 🔒 CRITICAL FOR PRODUCTION: Enable TLS/SSL connection wrapper
  tls: isSecure ? {
    rejectUnauthorized: false // Necessary for many cloud providers like Redis Labs/Upstash
  } : undefined,
  
  maxRetriesPerRequest: null,
  retryStrategy(times) {
    // Exponential backoff reconnect strategy
    const delay = Math.min(times * 50, 2000)
    return delay
  }
})

// Listen for connection drops gracefully without crashing Fastify
redis.on('error', (err) => {
  console.error('⚠️ [Redis Error]:', err.message)
})

redis.on('connect', () => {
  console.log(`🚀 [Redis Status]: Successfully connected via ${isSecure ? 'SECURE TLS' : 'LOCAL'}`)
})


export async function redisSet(key: string, value: string, ttlSeconds: number) {
  try {
    await redis.set(key, value, 'EX', ttlSeconds)
  } catch (err) {
    console.error(`Failed to set Redis key: ${key}`, err)
  }
}


// Separate pub/sub clients for Socket.io adapter
export const pubClient = new Redis(REDIS_URL, { lazyConnect: true })
export const subClient = pubClient.duplicate()

// Rate limit key helpers
export const RATE_KEYS = {
  otpRequest: (phone: string) => `otp:req:${phone}`,
  otpVerify: (phone: string) => `otp:verify:${phone}`,
  swipe: (userId: string) => `swipe:daily:${userId}`,
  tokenBlacklist: (jti: string) => `blacklist:${jti}`,
  userPresence: (userId: string) => `presence:${userId}`,
  swipeCache: (userId: string) => `swipe:deck:${userId}`,
}
