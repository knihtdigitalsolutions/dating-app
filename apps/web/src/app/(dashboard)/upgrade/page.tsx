'use client'

import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import toast from 'react-hot-toast'
import { api } from '@/lib/api'
import { PLAN_PRICING, PLAN_FEATURES } from '@dating/types'

type Plan = 'GOLD' | 'PLATINUM'
type Cycle = 'monthly' | 'quarterly' | 'annual'

export default function UpgradePage() {
  const [cycle, setCycle] = useState<Cycle>('monthly')

  const subscribeMutation = useMutation({
    mutationFn: async ({ plan }: { plan: Plan }) =>
      (await api.post('/payments/subscribe', { plan, billingCycle: cycle })).data.data,
    onSuccess: (data) => {
      if (data.redirectUrl) window.open(data.redirectUrl, '_blank')
      toast.success('Redirecting to payment...')
    },
    onError: () => toast.error('Failed to create order. Try again.'),
  })

  const cycles: { key: Cycle; label: string; save?: string }[] = [
    { key: 'monthly', label: 'Monthly' },
    { key: 'quarterly', label: '3 Months', save: 'Save 14%' },
    { key: 'annual', label: 'Annual', save: 'Save 33%' },
  ]

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-4xl mx-auto p-8">

        {/* Header */}
        <div className="text-center mb-10">
          <h1 className="text-4xl font-display font-black text-white mb-2">Upgrade Your Experience</h1>
          <p className="text-gray-400">More likes, better matches, real connections.</p>
        </div>

        {/* Billing cycle toggle */}
        <div className="flex justify-center mb-10">
          <div className="flex gap-1 p-1 bg-surface-raised rounded-xl border border-border-subtle">
            {cycles.map(c => (
              <button key={c.key} onClick={() => setCycle(c.key)}
                className={`px-4 py-2 rounded-lg font-mono text-sm transition-all ${cycle === c.key ? 'bg-gold-500 text-white' : 'text-gray-500 hover:text-white'}`}>
                {c.label} {c.save && <span className="text-success text-xs ml-1">{c.save}</span>}
              </button>
            ))}
          </div>
        </div>

        {/* Plans */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
          {/* Free */}
          <PlanCard
            name="Free" emoji="🆓" color="#6b6880"
            price={0} cycle={cycle}
            features={PLAN_FEATURES.FREE}
            current
          />
          {/* Gold */}
          <PlanCard
            name="Gold" emoji="🥇" color="var(--color-gold-500)"
            price={PLAN_PRICING.GOLD[cycle]} cycle={cycle}
            features={PLAN_FEATURES.GOLD}
            onUpgrade={() => subscribeMutation.mutate({ plan: 'GOLD' })}
            loading={subscribeMutation.isPending}
          />
          {/* Platinum */}
          <PlanCard
            name="Platinum" emoji="💎" color="var(--color-stone-500)"
            price={PLAN_PRICING.PLATINUM[cycle]} cycle={cycle}
            features={PLAN_FEATURES.PLATINUM}
            onUpgrade={() => subscribeMutation.mutate({ plan: 'PLATINUM' })}
            loading={subscribeMutation.isPending}
            featured
          />
        </div>

        {/* Payment methods */}
        <div className="card p-6 text-center">
          <p className="section-label mb-4">Accepted Payment Methods</p>
          <div className="flex justify-center flex-wrap gap-4">
            {[
              { icon: '📱', label: 'MTN Mobile Money' },
              { icon: '📱', label: 'Airtel Money' },
              { icon: '📱', label: 'M-Pesa (KE/TZ)' },
              { icon: '💳', label: 'Visa / Mastercard' },
            ].map(m => (
              <div key={m.label} className="flex items-center gap-2 bg-surface-overlay rounded-xl px-4 py-2.5 border border-border-subtle">
                <span>{m.icon}</span>
                <span className="text-gray-300 font-mono text-xs">{m.label}</span>
              </div>
            ))}
          </div>
          <p className="text-gray-600 font-mono text-xs mt-4">Secured by PesaPal · Cancel anytime · No hidden fees</p>
        </div>
      </div>
    </div>
  )
}

function PlanCard({ name, emoji, color, price, cycle, features, onUpgrade, loading, current, featured }: any) {
  const featureRows = [
    ['Daily likes', features.dailyLikes === -1 ? 'Unlimited' : String(features.dailyLikes)],
    ['Super Likes/day', String(features.superLikes)],
    ['See who liked you', features.seeWhoLikedYou],
    ['Rewind', features.rewind],
    ['Read receipts', features.readReceipts],
    ['Video calls', features.videoCalls],
    ['Voice calls', features.voiceCalls],
    ['Passport mode', features.passportMode],
    ['Incognito', features.incognitoMode],
  ]

  return (
    <motion.div whileHover={{ y: -4 }} className={`card p-6 flex flex-col relative overflow-hidden ${featured ? 'border-stone-400/40' : ''}`}>
      {featured && (
        <div className="absolute top-3 right-3 bg-stone-400/20 text-stone-400 font-mono text-xs px-2 py-0.5 rounded-full border border-stone-400/30">
          Most Popular
        </div>
      )}

      {/* Top bar */}
      <div className="h-1 rounded-full mb-5 -mx-6 -mt-6 mb-6" style={{ background: color }} />

      <div className="mb-4">
        <span className="text-3xl">{emoji}</span>
        <h3 className="text-white text-xl font-display font-bold mt-2">{name}</h3>
        {price === 0 ? (
          <p className="text-gray-500 font-mono text-sm mt-1">Free forever</p>
        ) : (
          <div className="mt-1">
            <span className="text-white text-2xl font-display font-bold">UGX {price.toLocaleString()}</span>
            <span className="text-gray-500 font-mono text-xs ml-1">/{cycle}</span>
          </div>
        )}
      </div>

      <ul className="space-y-2 flex-1 mb-5">
        {featureRows.map(([label, val]) => (
          <li key={String(label)} className="flex items-center gap-2.5 text-sm">
            <span className="text-sm flex-shrink-0" style={{ color: val === false ? 'var(--color-surface-subtle)' : '#4ade80' }}>
              {val === false ? '✕' : '✓'}
            </span>
            <span style={{ color: val === false ? 'var(--color-surface-subtle)' : '#9a9aa0' }}>
              {label}{typeof val === 'string' && val !== 'true' ? `: ${val}` : ''}
            </span>
          </li>
        ))}
      </ul>

      {current ? (
        <div className="w-full py-3 rounded-xl bg-surface-overlay text-center text-gray-600 font-mono text-sm border border-border-subtle">
          Current plan
        </div>
      ) : (
        <button onClick={onUpgrade} disabled={loading}
          className="w-full py-3 rounded-xl font-semibold text-sm transition-all"
          style={{ background: color, color: name === 'Gold' ? 'var(--color-surface-base)' : 'white', opacity: loading ? 0.7 : 1 }}>
          {loading ? 'Processing...' : `Get ${name}`}
        </button>
      )}
    </motion.div>
  )
}
