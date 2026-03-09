import AfricasTalking from 'africastalking'
import { logger } from '../lib/logger'

// Lazy init — SDK throws on construction if credentials are missing,
// so we defer until first use. This lets the server start without
// AT_API_KEY/AT_USERNAME set (e.g. local dev without SMS).
let _sms: ReturnType<typeof AfricasTalking>['SMS'] | null = null

function getSms() {
  if (_sms) return _sms
  const apiKey = process.env.AT_API_KEY
  const username = process.env.AT_USERNAME
  if (!apiKey || !username) {
    throw new Error('Africa\'s Talking credentials not set (AT_API_KEY, AT_USERNAME)')
  }
  const at = AfricasTalking({ apiKey, username })
  _sms = at.SMS
  return _sms
}

export async function sendOtp(phone: string, code: string): Promise<void> {
  try {
    await getSms().send({
      to: [phone],
      message: `Your Dating App verification code is: ${code}\n\nThis code expires in 2 minutes. Do not share it with anyone.`,
      from: process.env.AT_SENDER_ID || 'DatingApp',
    })
    logger.info({ phone }, "OTP sent via Africa's Talking")
  } catch (err) {
    logger.error({ err, phone }, 'Failed to send OTP')
    throw new Error('Failed to send OTP')
  }
}

export async function sendSms(phone: string, message: string): Promise<void> {
  try {
    await getSms().send({
      to: [phone],
      message,
      from: process.env.AT_SENDER_ID || 'DatingApp',
    })
  } catch (err) {
    logger.error({ err }, 'Failed to send SMS')
  }
}
