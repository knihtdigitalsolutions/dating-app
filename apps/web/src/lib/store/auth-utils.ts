import crypto from 'crypto'
import jwt from 'jsonwebtoken'

const JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'super-secret-access-key'
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'super-secret-refresh-key'

// Fast, serverless-safe hashing for short 6-digit codes
export function hashOtp(code: string): string {
  return crypto.createHash('sha256').update(code).digest('hex')
}

export function generateTokens(userId: string) {
  const accessToken = jwt.sign({ userId }, JWT_ACCESS_SECRET, { expiresIn: '15m' })
  const refreshToken = jwt.sign({ userId }, JWT_REFRESH_SECRET, { expiresIn: '7d' })
  return { accessToken, refreshToken }
}