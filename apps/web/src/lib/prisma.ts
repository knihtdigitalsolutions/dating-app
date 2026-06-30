import { PrismaClient } from '@dating/db'
import dotenv from 'dotenv'
import path from 'path'
import fs from 'fs'

// 1. Define possible resolution paths depending on where pnpm executes the process
const possibleEnvPaths = [
  path.resolve(process.cwd(), '../api/.env'),        // Handled if cwd is apps/web
  path.resolve(process.cwd(), './apps/api/.env'),   // Handled if cwd is monorepo root
]

let envLoaded = false

for (const envPath of possibleEnvPaths) {
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath })
    envLoaded = true
    break
  }
}

// Fail-safe visibility log in your terminal console
if (!envLoaded) {
  console.warn('⚠️ [Prisma Shared Env] Failed to locate server/.env file across workspace paths.')
}

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient }

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma