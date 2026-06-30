import { NextResponse } from 'next/server'
import { prisma } from '@dating/db'
import { hashOtp } from '@/lib/store/auth-utils'
import { sendSms } from '@/lib/sms' // Pull in our newly constructed delivery engine

export async function POST(request: Request) {
  try {
    const { phone } = await request.json()
    const ip = request.headers.get('x-forwarded-for') || '127.0.0.1'

    if (!phone) {
      return NextResponse.json({ error: 'Phone number is required' }, { status: 400 })
    }

    // Rate limiting validation code block remains unchanged...
    const checkWindow = new Date(Date.now() - 1 * 60 * 1000)
    const recentRequests = await prisma.otpCode.count({
      where: {
        OR: [{ phone }],
        createdAt: { gte: checkWindow }
      }
    })

    if (recentRequests >= 3) {
      return NextResponse.json({ error: 'Too many verification requests. Please slow down.' }, { status: 429 })
    }

    // Generate explicit 6-digit numeric OTP string
    const plainOtp = Math.floor(100000 + Math.random() * 900000).toString()
    const hashedCode = hashOtp(plainOtp)
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000) // Valid for 5 minutes

    const existingUser = await prisma.user.findUnique({ where: { phone } })

    // Database record write operation block
    await prisma.otpCode.create({
      data: {
        phone,
        code: hashedCode,
        expiresAt,
        userId: existingUser?.id || null,
      },
    })

    // Execute transmission using Africa's Talking
    const messageContent = `Your verification code is: ${plainOtp}. Valid for 5 minutes.`
    const smsSent = await sendSms(phone, messageContent)

    if (!smsSent) {
      return NextResponse.json({ error: 'Sms delivery network failure. Try again shortly.' }, { status: 502 })
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('[OTP REQUEST EXCEPTION]:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}