import { PrismaClient } from '@prisma/client'
import dotenv from 'dotenv'
import path from 'path'
import fs from 'fs'

// 🔥 Monorepo Safe: Scan for the backend server config file from a shared package context
const possibleEnvPaths = [
  path.resolve(__dirname, '../../apps/api/.env'), // Adjust relative steps based on your packages/db location
  path.resolve(process.cwd(), './apps/api/.env'),
  path.resolve(process.cwd(), '../api/.env'),
]

for (const envPath of possibleEnvPaths) {
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath })
    break
  }
}

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient }

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma