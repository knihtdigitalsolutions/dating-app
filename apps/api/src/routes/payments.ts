import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import axios from 'axios'
import crypto from 'crypto'
import { prisma } from '@dating/db'
import { authenticate } from '../middleware/auth'
import { logger } from '../lib/logger'
import { PLAN_PRICING } from '@dating/types'

const PESAPAL_BASE = process.env.PESAPAL_BASE_URL!
const PESAPAL_KEY = process.env.PESAPAL_CONSUMER_KEY!
const PESAPAL_SECRET = process.env.PESAPAL_CONSUMER_SECRET!
const IPN_URL = process.env.PESAPAL_IPN_URL!
const CALLBACK_URL = process.env.PESAPAL_CALLBACK_URL!

// ── PesaPal API helpers ───────────────────────────────────
let pesapalToken: { token: string; expiresAt: Date } | null = null

async function getPesapalToken(): Promise<string> {
  if (pesapalToken && pesapalToken.expiresAt > new Date()) {
    return pesapalToken.token
  }

  const response = await axios.post(
    `${PESAPAL_BASE}/api/Auth/RequestToken`,
    { consumer_key: PESAPAL_KEY, consumer_secret: PESAPAL_SECRET },
    { headers: { Accept: 'application/json', 'Content-Type': 'application/json' } }
  )

  const { token, expiryDate } = response.data
  pesapalToken = { token, expiresAt: new Date(expiryDate) }
  return token
}

async function registerIPN(): Promise<string> {
  const token = await getPesapalToken()
  const response = await axios.post(
    `${PESAPAL_BASE}/api/URLSetup/RegisterIPN`,
    { url: IPN_URL, ipn_notification_type: 'POST' },
    {
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
    }
  )
  return response.data.ipn_id
}

// Schemas
const subscribeSchema = z.object({
  plan: z.enum(['GOLD', 'PLATINUM']),
  billingCycle: z.enum(['monthly', 'quarterly', 'annual']).default('monthly'),
  phoneNumber: z.string().optional(), // for mobile money
  email: z.string().email().optional(),
})

export default async function paymentRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate)

  // ── POST /payments/subscribe ─────────────────────────────
  app.post('/subscribe', async (req, reply) => {
    const body = subscribeSchema.safeParse(req.body)
    if (!body.success) {
      return reply.status(400).send({ success: false, error: 'Invalid request' })
    }

    const { plan, billingCycle, phoneNumber, email } = body.data
    const userId = req.userId

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { profile: true },
    })

    if (!user) {
      return reply.status(404).send({ success: false, error: 'User not found' })
    }

    const amount = PLAN_PRICING[plan][billingCycle]
    const merchantRef = `ROAM-${userId.slice(0, 8).toUpperCase()}-${Date.now()}`

    // Create payment record
    const payment = await prisma.payment.create({
      data: {
        userId,
        pesapalMerchantRef: merchantRef,
        amount,
        currency: 'UGX',
        status: 'PENDING',
        description: `Dating App ${plan} - ${billingCycle}`,
      },
    })

    // Register IPN if needed
    let ipnId: string
    try {
      ipnId = await registerIPN()
    } catch (err) {
      logger.error({ err }, 'Failed to register IPN')
      ipnId = process.env.PESAPAL_IPN_ID || ''
    }

    // Submit order to PesaPal
    const token = await getPesapalToken()
    const orderPayload: Record<string, any> = {
      id: merchantRef,
      currency: 'UGX',
      amount,
      description: `Dating App ${plan} Subscription - ${billingCycle}`,
      callback_url: CALLBACK_URL,
      notification_id: ipnId,
      billing_address: {
        phone_number: phoneNumber || user.phone,
        email_address: email || user.email,
        first_name: user.profile?.displayName?.split(' ')[0] || 'Customer',
        last_name: user.profile?.displayName?.split(' ').slice(1).join(' ') || '',
        country_code: 'UG',
      },
    }

    const orderResponse = await axios.post(
      `${PESAPAL_BASE}/api/Transactions/SubmitOrderRequest`,
      orderPayload,
      {
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      }
    )

    const { order_tracking_id, redirect_url } = orderResponse.data

    // Update payment with tracking ID
    await prisma.payment.update({
      where: { id: payment.id },
      data: { pesapalOrderId: merchantRef, pesapalTrackingId: order_tracking_id },
    })

    return reply.send({
      success: true,
      data: {
        orderTrackingId: order_tracking_id,
        merchantReference: merchantRef,
        redirectUrl: redirect_url,
        amount,
        currency: 'UGX',
      },
    })
  })

  // ── GET /payments/status/:trackingId ─────────────────────
  app.get('/status/:trackingId', async (req, reply) => {
    const { trackingId } = req.params as { trackingId: string }

    const payment = await prisma.payment.findFirst({
      where: { pesapalTrackingId: trackingId, userId: req.userId },
    })

    if (!payment) {
      return reply.status(404).send({ success: false, error: 'Payment not found' })
    }

    return reply.send({
      success: true,
      data: {
        status: payment.status,
        amount: payment.amount,
        currency: payment.currency,
        description: payment.description,
        createdAt: payment.createdAt,
      },
    })
  })

  // ── GET /payments/history ────────────────────────────────
  app.get('/history', async (req, reply) => {
    const payments = await prisma.payment.findMany({
      where: { userId: req.userId },
      orderBy: { createdAt: 'desc' },
      take: 20,
    })

    return reply.send({ success: true, data: payments })
  })
}

// ── Webhook handler (no auth - verified by HMAC) ─────────
export async function handlePesapalWebhook(req: any, reply: any) {
  const body = req.body as {
    OrderTrackingId: string
    OrderMerchantReference: string
    OrderNotificationType: string
  }

  logger.info({ body }, 'PesaPal webhook received')

  // Verify it's a real notification by querying PesaPal
  try {
    const token = await getPesapalToken()
    const statusResponse = await axios.get(
      `${PESAPAL_BASE}/api/Transactions/GetTransactionStatus?orderTrackingId=${body.OrderTrackingId}`,
      {
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${token}`,
        },
      }
    )

    const txn = statusResponse.data
    logger.info({ txn }, 'PesaPal transaction status')

    const payment = await prisma.payment.findFirst({
      where: { pesapalTrackingId: body.OrderTrackingId },
    })

    if (!payment) {
      return reply.status(404).send({ error: 'Payment not found' })
    }

    const isPaid = txn.payment_status_description === 'Completed'

    await prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: isPaid ? 'COMPLETED' : txn.payment_status_description,
        method: mapPaymentMethod(txn.payment_method),
        webhookVerified: true,
        rawWebhook: txn,
        updatedAt: new Date(),
      },
    })

    if (isPaid) {
      // Activate subscription
      await activateSubscription(payment.userId, payment.description || '')
    }

    return reply.send({ orderNotificationType: body.OrderNotificationType, orderTrackingId: body.OrderTrackingId, orderMerchantReference: body.OrderMerchantReference, status: '200' })
  } catch (err) {
    logger.error({ err }, 'Webhook processing error')
    return reply.status(500).send({ error: 'Processing failed' })
  }
}

async function activateSubscription(userId: string, description: string) {
  const plan = description.includes('PLATINUM') ? 'PLATINUM' : 'GOLD'
  const isAnnual = description.includes('annual')
  const isQuarterly = description.includes('quarterly')
  const months = isAnnual ? 12 : isQuarterly ? 3 : 1

  const periodEnd = new Date()
  periodEnd.setMonth(periodEnd.getMonth() + months)

  await prisma.subscription.upsert({
    where: { userId },
    update: {
      plan: plan as any,
      status: 'ACTIVE',
      currentPeriodStart: new Date(),
      currentPeriodEnd: periodEnd,
    },
    create: {
      userId,
      plan: plan as any,
      status: 'ACTIVE',
      currentPeriodStart: new Date(),
      currentPeriodEnd: periodEnd,
    },
  })

  logger.info({ userId, plan }, 'Subscription activated')
}

function mapPaymentMethod(method: string): any {
  const map: Record<string, string> = {
    'MTN Mobile Money': 'MTN_MOBILE_MONEY',
    'Airtel Money': 'AIRTEL_MONEY',
    'M-PESA': 'MPESA',
    'VISA': 'VISA',
    'MasterCard': 'MASTERCARD',
  }
  return map[method] || null
}
