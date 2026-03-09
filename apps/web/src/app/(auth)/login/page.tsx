'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import toast from 'react-hot-toast'
import { api } from '@/lib/api'
import { useAuthStore } from '@/lib/store/auth'

type Step = 'phone' | 'otp'

const COUNTRIES = [
  { code: '+256', flag: '🇺🇬', name: 'Uganda',   pattern: /^\+256\d{9}$/ },
  { code: '+254', flag: '🇰🇪', name: 'Kenya',    pattern: /^\+254\d{9}$/ },
  { code: '+255', flag: '🇹🇿', name: 'Tanzania', pattern: /^\+255\d{9}$/ },
]

export default function LoginPage() {
  const router = useRouter()
  const { setTokens, setUser } = useAuthStore()
  const [step, setStep]       = useState<Step>('phone')
  const [phone, setPhone]     = useState('+256')
  const [otp, setOtp]         = useState('')
  const [loading, setLoading] = useState(false)
  const [countdown, setCountdown] = useState(0)

  const activeCountry = COUNTRIES.find(c => phone.startsWith(c.code)) || COUNTRIES[0]

  const startCountdown = () => {
    setCountdown(120)
    const t = setInterval(() => setCountdown(c => { if (c <= 1) { clearInterval(t); return 0 } return c - 1 }), 1000)
  }

  const requestOtp = async () => {
    const valid = COUNTRIES.some(c => c.pattern.test(phone))
    if (!valid) { toast.error('Enter a valid phone number'); return }
    setLoading(true)
    try {
      await api.post('/auth/otp/request', { phone })
      setStep('otp')
      startCountdown()
      toast.success('Code sent to your phone')
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Failed to send code')
    } finally { setLoading(false) }
  }

  const verifyOtp = async () => {
    if (otp.length !== 6) return
    setLoading(true)
    try {
      const res = await api.post('/auth/otp/verify', { phone, code: otp })
      const { tokens, user } = res.data.data
      await setTokens(tokens.accessToken, tokens.refreshToken)
      setUser(user)
      router.push(user.hasProfile ? '/discover' : '/onboarding')
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Incorrect code')
      setOtp('')
    } finally { setLoading(false) }
  }

  const inputStyle = {
    width: '100%',
    background: 'var(--color-surface-overlay)',
    border: '1px solid var(--color-border-default)',
    borderRadius: 10,
    padding: '12px 16px',
    color: 'var(--color-text-primary)',
    fontFamily: 'var(--font-sans)',
    fontSize: 15,
    outline: 'none',
    transition: 'border-color 0.15s, box-shadow 0.15s',
  }

  return (
    <div style={{ animation: 'var(--animate-fade-up)' }}>

      {/* Wordmark */}
      <div style={{ textAlign: 'center', marginBottom: 40 }}>
        <div style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: 52, height: 52, borderRadius: 14,
          background: 'linear-gradient(135deg, var(--color-gold-500), var(--color-gold-700))',
          boxShadow: 'var(--shadow-gold)', marginBottom: 16, fontSize: 22,
          color: 'var(--color-stone-950)', fontWeight: 700,
        }}>◆</div>

        <h1 style={{
          fontFamily: 'var(--font-display)', fontSize: 34, fontWeight: 700,
          color: 'var(--color-text-primary)', letterSpacing: '-0.02em', marginBottom: 6,
        }}>Dating App</h1>

        <p style={{ color: 'var(--color-text-tertiary)', fontSize: 13, fontFamily: 'var(--font-mono)', letterSpacing: '0.04em' }}>
          EAST AFRICA · REAL CONNECTIONS
        </p>
      </div>

      {/* Card */}
      <div className="card" style={{ padding: 28, boxShadow: 'var(--shadow-lg)' }}>

        <AnimatePresence mode="wait">

          {/* ── Step 1: Phone ── */}
          {step === 'phone' && (
            <motion.div key="phone"
              initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 12 }}
              style={{ display: 'flex', flexDirection: 'column', gap: 16 }}
            >
              <div>
                <p className="label-overline" style={{ marginBottom: 10 }}>Your phone number</p>

                {/* Country selector */}
                <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
                  {COUNTRIES.map(c => (
                    <button key={c.code} onClick={() => setPhone(c.code)}
                      style={{
                        flex: 1, padding: '8px 4px', borderRadius: 8, cursor: 'pointer',
                        fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 500,
                        border: `1px solid ${phone.startsWith(c.code) ? 'var(--color-border-gold)' : 'var(--color-border-subtle)'}`,
                        background: phone.startsWith(c.code) ? 'oklch(80% 0.15 85 / 8%)' : 'var(--color-surface-overlay)',
                        color: phone.startsWith(c.code) ? 'var(--color-gold-400)' : 'var(--color-text-tertiary)',
                        transition: 'all 0.15s',
                      }}>
                      {c.flag} {c.code}
                    </button>
                  ))}
                </div>

                <input
                  type="tel"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && requestOtp()}
                  style={{ ...inputStyle, fontSize: 17, letterSpacing: '0.04em' }}
                  onFocus={e => { e.target.style.borderColor = 'oklch(80% 0.12 85 / 50%)'; e.target.style.boxShadow = '0 0 0 3px oklch(80% 0.12 85 / 10%)' }}
                  onBlur={e => { e.target.style.borderColor = 'var(--color-border-default)'; e.target.style.boxShadow = 'none' }}
                  placeholder={`${activeCountry.code} 700 000 000`}
                  autoFocus
                />
              </div>

              <button className="btn-gold" onClick={requestOtp} disabled={loading} style={{ width: '100%', justifyContent: 'center', padding: '13px 20px' }}>
                {loading ? <Spinner /> : 'Send Verification Code →'}
              </button>
            </motion.div>
          )}

          {/* ── Step 2: OTP ── */}
          {step === 'otp' && (
            <motion.div key="otp"
              initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }}
              style={{ display: 'flex', flexDirection: 'column', gap: 16 }}
            >
              <div>
                <button onClick={() => setStep('phone')}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-gold-500)', fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.06em', padding: 0, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 4 }}>
                  ← CHANGE NUMBER
                </button>

                <p className="label-overline" style={{ marginBottom: 4 }}>6-digit code</p>
                <p style={{ color: 'var(--color-text-secondary)', fontSize: 13, marginBottom: 12 }}>
                  Sent to <span style={{ color: 'var(--color-text-primary)', fontWeight: 500 }}>{phone}</span>
                </p>

                <input
                  type="text"
                  inputMode="numeric"
                  value={otp}
                  onChange={e => {
                    const v = e.target.value.replace(/\D/g, '').slice(0, 6)
                    setOtp(v)
                    if (v.length === 6) setTimeout(verifyOtp, 80)
                  }}
                  style={{
                    ...inputStyle,
                    fontSize: 30,
                    textAlign: 'center',
                    letterSpacing: '0.28em',
                    fontFamily: 'var(--font-mono)',
                    fontWeight: 600,
                  }}
                  onFocus={e => { e.target.style.borderColor = 'oklch(80% 0.12 85 / 50%)'; e.target.style.boxShadow = '0 0 0 3px oklch(80% 0.12 85 / 10%)' }}
                  onBlur={e => { e.target.style.borderColor = 'var(--color-border-default)'; e.target.style.boxShadow = 'none' }}
                  placeholder="· · · · · ·"
                  maxLength={6}
                  autoFocus
                />
              </div>

              <button className="btn-gold" onClick={verifyOtp} disabled={loading || otp.length < 6}
                style={{ width: '100%', justifyContent: 'center', padding: '13px 20px', opacity: otp.length < 6 ? 0.45 : 1 }}>
                {loading ? <Spinner /> : 'Verify & Continue'}
              </button>

              <button onClick={countdown === 0 ? requestOtp : undefined} disabled={countdown > 0}
                style={{
                  background: 'none', border: 'none', cursor: countdown > 0 ? 'default' : 'pointer',
                  textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: 12,
                  color: countdown > 0 ? 'var(--color-text-tertiary)' : 'var(--color-gold-500)',
                  padding: '4px 0',
                  textDecoration: countdown === 0 ? 'underline' : 'none',
                }}>
                {countdown > 0 ? `Resend in ${countdown}s` : 'Resend code'}
              </button>
            </motion.div>
          )}

        </AnimatePresence>
      </div>

      <p style={{ textAlign: 'center', color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-mono)', fontSize: 11, marginTop: 20, letterSpacing: '0.03em' }}>
        By continuing you agree to our Terms & Privacy Policy
      </p>
    </div>
  )
}

function Spinner() {
  return (
    <span style={{
      width: 16, height: 16, borderRadius: '50%',
      border: '2px solid rgba(0,0,0,0.2)',
      borderTopColor: 'var(--color-stone-950)',
      animation: 'spin 0.7s linear infinite',
      display: 'inline-block',
    }} />
  )
}
