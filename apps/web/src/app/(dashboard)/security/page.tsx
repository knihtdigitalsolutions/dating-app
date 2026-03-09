'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { formatDistanceToNow, format } from 'date-fns'
import { api } from '@/lib/api'

// ── Severity config ────────────────────────────────────────
const SEVERITY = {
  INFO:     { color: 'var(--color-text-tertiary)', bg: 'oklch(100% 0 0 / 4%)',      label: 'Info',     dot: 'var(--color-stone-600)' },
  LOW:      { color: '#4ade80',                    bg: 'oklch(70% 0.18 145 / 8%)',  label: 'Low',      dot: '#4ade80' },
  MEDIUM:   { color: 'var(--color-gold-400)',      bg: 'oklch(80% 0.15 85 / 8%)',   label: 'Medium',   dot: 'var(--color-gold-500)' },
  HIGH:     { color: 'var(--color-gold-300)',      bg: 'oklch(88% 0.15 85 / 8%)',   label: 'High',     dot: 'var(--color-gold-300)' },
  CRITICAL: { color: '#f87171',                   bg: 'oklch(65% 0.18 25 / 10%)',  label: 'Critical', dot: '#f87171' },
} as const

// ── Event display names & icons ────────────────────────────
const EVENT_META: Record<string, { icon: string; label: string }> = {
  LOGIN_SUCCESS:               { icon: '✅', label: 'Login successful' },
  LOGIN_FAILED:                { icon: '❌', label: 'Login failed' },
  LOGOUT:                      { icon: '👋', label: 'Logged out' },
  OTP_REQUESTED:               { icon: '📱', label: 'OTP code requested' },
  OTP_VERIFIED:                { icon: '✔️',  label: 'OTP verified' },
  OTP_FAILED:                  { icon: '🔢', label: 'Wrong OTP code entered' },
  OTP_EXPIRED:                 { icon: '⏰', label: 'OTP code expired' },
  TOKEN_REFRESHED:             { icon: '🔄', label: 'Session refreshed' },
  TOKEN_REVOKED:               { icon: '🚫', label: 'Session token revoked' },
  SESSION_CREATED:             { icon: '🔑', label: 'New session created' },
  SESSION_EXPIRED:             { icon: '⌛', label: 'Session expired' },
  SESSION_REVOKED:             { icon: '🔐', label: 'Session revoked' },
  CONCURRENT_SESSION_DETECTED: { icon: '⚠️', label: 'Login from new location detected' },
  ACCOUNT_LOCKED:              { icon: '🔒', label: 'Account temporarily locked' },
  ACCOUNT_BANNED:              { icon: '🚷', label: 'Account suspended' },
  PHONE_CHANGED:               { icon: '📞', label: 'Phone number changed' },
  PROFILE_UPDATED:             { icon: '✏️',  label: 'Profile updated' },
  UNAUTHORIZED_ACCESS:         { icon: '🛑', label: 'Unauthorized access attempt' },
  RATE_LIMIT_HIT:              { icon: '⛔', label: 'Rate limit reached' },
  SUSPICIOUS_ACTIVITY:         { icon: '🔎', label: 'Suspicious activity detected' },
  BRUTE_FORCE_ATTEMPT:         { icon: '💥', label: 'Brute force attempt detected' },
  MULTIPLE_FAILED_OTPS:        { icon: '⚠️', label: 'Multiple failed OTP attempts' },
  PAYMENT_INITIATED:           { icon: '💳', label: 'Payment initiated' },
  PAYMENT_COMPLETED:           { icon: '✅', label: 'Payment completed' },
  PAYMENT_FAILED:              { icon: '❌', label: 'Payment failed' },
  SUBSCRIPTION_ACTIVATED:      { icon: '⭐', label: 'Subscription activated' },
  SUBSCRIPTION_CANCELLED:      { icon: '❎', label: 'Subscription cancelled' },
  DATA_DOWNLOAD_REQUESTED:     { icon: '📦', label: 'Data export requested' },
  PHOTO_FLAGGED:               { icon: '🖼️', label: 'Photo flagged for review' },
  REPORT_SUBMITTED:            { icon: '📢', label: 'Report submitted' },
  CALL_INITIATED:              { icon: '📞', label: 'Call initiated' },
  CALL_ANSWERED:               { icon: '✅', label: 'Call answered' },
  CALL_ENDED:                  { icon: '📵', label: 'Call ended' },
}

type SeverityFilter = 'ALL' | 'INFO' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'

export default function SecurityActivityPage() {
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>('ALL')
  const [page, setPage] = useState(1)
  const [expanded, setExpanded] = useState<string | null>(null)

  // Summary card
  const { data: summary } = useQuery({
    queryKey: ['security', 'summary'],
    queryFn: async () => (await api.get('/security/activity/summary')).data.data,
  })

  // Activity log
  const { data, isLoading } = useQuery({
    queryKey: ['security', 'activity', severityFilter, page],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page), limit: '20' })
      if (severityFilter !== 'ALL') params.set('severity', severityFilter)
      return (await api.get(`/security/activity?${params}`)).data.data
    },
  })

  const events = data?.events || []
  const totalPages = data?.pages || 1

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-4xl mx-auto p-8 space-y-6">

        {/* Header */}
        <div>
          <h1 className="text-3xl font-display font-bold text-white">Security & Activity</h1>
          <p className="text-gray-500 text-sm mt-1 font-mono">
            Everything that happens on your account is logged here.
          </p>
        </div>

        {/* Summary cards */}
        {summary && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <SummaryCard icon="✅" label="Logins (30d)"   value={summary.totalLogins}   color="green" />
            <SummaryCard icon="❌" label="Failed attempts" value={summary.failedLogins}  color={summary.failedLogins > 5 ? 'red' : 'yellow'} />
            <SummaryCard icon="📱" label="Active sessions" value={summary.activeSessions} color="blue" />
            <SummaryCard icon="⚠️" label="High-risk events" value={summary.recentHighRisk?.length || 0} color={summary.recentHighRisk?.length > 0 ? 'red' : 'green'} />
          </div>
        )}

        {/* High-risk alerts */}
        {summary?.recentHighRisk?.length > 0 && (
          <div className="card border-gold-500/30 p-4 space-y-2">
            <p className="text-gold-500 font-mono text-xs tracking-widest">⚠ ALERTS IN LAST 30 DAYS</p>
            {summary.recentHighRisk.map((e: any, i: number) => (
              <div key={i} className="flex items-start gap-3 py-2 border-t border-border-subtle">
                <span className="text-lg flex-shrink-0">{EVENT_META[e.eventType]?.icon || '🔔'}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm font-medium">{EVENT_META[e.eventType]?.label || e.eventType}</p>
                  {e.description && <p className="text-gray-500 text-xs mt-0.5">{e.description}</p>}
                </div>
                <p className="text-gray-600 font-mono text-xs flex-shrink-0">
                  {formatDistanceToNow(new Date(e.createdAt), { addSuffix: true })}
                </p>
              </div>
            ))}
          </div>
        )}

        {/* Filters */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-gray-600 font-mono text-xs mr-1">FILTER:</span>
          {(['ALL', 'INFO', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as SeverityFilter[]).map(s => (
            <button key={s} onClick={() => { setSeverityFilter(s); setPage(1) }}
              className="px-3 py-1.5 rounded-lg font-mono text-xs border transition-all"
              style={{
                borderColor: severityFilter === s
                  ? (s === 'ALL' ? 'var(--color-stone-400)' : SEVERITY[s as keyof typeof SEVERITY]?.dot || 'var(--color-stone-400)')
                  : 'rgba(255,255,255,0.07)',
                background: severityFilter === s
                  ? (s === 'ALL' ? 'rgba(124,106,247,0.1)' : SEVERITY[s as keyof typeof SEVERITY]?.bg || 'rgba(124,106,247,0.1)')
                  : 'transparent',
                color: severityFilter === s
                  ? (s === 'ALL' ? 'var(--color-stone-400)' : SEVERITY[s as keyof typeof SEVERITY]?.color || 'var(--color-stone-400)')
                  : '#6b7280',
              }}>
              {s}
            </button>
          ))}
        </div>

        {/* Events list */}
        <div className="space-y-1">
          {isLoading ? (
            [...Array(8)].map((_, i) => (
              <div key={i} className="h-16 rounded-xl bg-surface-raised animate-pulse" />
            ))
          ) : events.length === 0 ? (
            <div className="text-center py-16 text-gray-500">
              <p className="text-4xl mb-3">🔍</p>
              <p className="font-sans">No events found for this filter.</p>
            </div>
          ) : (
            <AnimatePresence initial={false}>
              {events.map((event: any) => {
                const sev = SEVERITY[event.severity as keyof typeof SEVERITY] || SEVERITY.INFO
                const meta = EVENT_META[event.eventType]
                const isOpen = expanded === event.id

                return (
                  <motion.div key={event.id} layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                    className="card overflow-hidden cursor-pointer hover:border-white/10 transition-colors"
                    onClick={() => setExpanded(isOpen ? null : event.id)}>

                    {/* Main row */}
                    <div className="flex items-center gap-4 p-4">
                      {/* Severity dot */}
                      <div className="flex-shrink-0 w-2 h-2 rounded-full" style={{ background: sev.dot }} />

                      {/* Icon + label */}
                      <span className="text-lg flex-shrink-0">{meta?.icon || '📋'}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-white text-sm font-medium">{meta?.label || event.eventType}</p>
                        <div className="flex items-center gap-3 mt-0.5">
                          {event.ipAddress && (
                            <span className="text-gray-600 font-mono text-xs">🌐 {event.ipAddress}</span>
                          )}
                          {event.platform && (
                            <span className="text-gray-600 font-mono text-xs">
                              {event.platform === 'ios' ? '🍎' : event.platform === 'android' ? '🤖' : '🌐'} {event.platform}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Risk score */}
                      {event.riskScore > 0 && (
                        <div className="flex-shrink-0">
                          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg"
                            style={{ background: sev.bg }}>
                            <span className="font-mono text-xs font-bold" style={{ color: sev.color }}>
                              Risk {event.riskScore}
                            </span>
                          </div>
                        </div>
                      )}

                      {/* Severity badge */}
                      <div className="flex-shrink-0 px-2.5 py-1 rounded-lg"
                        style={{ background: sev.bg }}>
                        <span className="font-mono text-xs" style={{ color: sev.color }}>{sev.label}</span>
                      </div>

                      {/* Time */}
                      <div className="flex-shrink-0 text-right">
                        <p className="text-gray-500 font-mono text-xs">
                          {formatDistanceToNow(new Date(event.createdAt), { addSuffix: true })}
                        </p>
                      </div>

                      <span className="text-gray-600 text-xs flex-shrink-0">{isOpen ? '▲' : '▼'}</span>
                    </div>

                    {/* Expanded detail */}
                    <AnimatePresence>
                      {isOpen && (
                        <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }}
                          className="overflow-hidden border-t border-border-subtle">
                          <div className="px-6 py-4 space-y-3">
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                              <Detail label="Event Type"  value={event.eventType} mono />
                              <Detail label="Severity"    value={event.severity} />
                              <Detail label="Risk Score"  value={`${event.riskScore}/100`} mono />
                              <Detail label="Time"        value={format(new Date(event.createdAt), 'PPpp')} />
                              {event.ipAddress && <Detail label="IP Address" value={event.ipAddress} mono />}
                              {event.platform  && <Detail label="Platform"   value={event.platform} />}
                            </div>
                            {event.description && (
                              <div>
                                <p className="section-label mb-1">Description</p>
                                <p className="text-gray-300 text-sm">{event.description}</p>
                              </div>
                            )}
                            {event.metadata && Object.keys(event.metadata).length > 0 && (
                              <div>
                                <p className="section-label mb-1">Details</p>
                                <pre className="text-gray-400 text-xs font-mono bg-surface-base rounded-lg p-3 overflow-x-auto">
                                  {JSON.stringify(event.metadata, null, 2)}
                                </pre>
                              </div>
                            )}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                )
              })}
            </AnimatePresence>
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 pt-4">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
              className="px-4 py-2 rounded-xl border border-border-subtle text-gray-400 font-mono text-sm disabled:opacity-40 hover:border-gray-500 transition-colors">
              ← Prev
            </button>
            <span className="text-gray-500 font-mono text-sm">Page {page} of {totalPages}</span>
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
              className="px-4 py-2 rounded-xl border border-border-subtle text-gray-400 font-mono text-sm disabled:opacity-40 hover:border-gray-500 transition-colors">
              Next →
            </button>
          </div>
        )}

      </div>
    </div>
  )
}

function SummaryCard({ icon, label, value, color }: { icon: string; label: string; value: number; color: string }) {
  const colors: Record<string, string> = {
    green: '#4ade80',
    red:   '#f87171',
    yellow: 'var(--color-gold-400)',
    blue:  'var(--color-stone-300)',
  }
  return (
    <div className="card p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xl">{icon}</span>
        <div className="w-2 h-2 rounded-full" style={{ background: colors[color] }} />
      </div>
      <p className="text-2xl font-display font-bold text-white">{value}</p>
      <p className="section-label mt-1">{label}</p>
    </div>
  )
}

function Detail({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <p className="section-label mb-0.5">{label}</p>
      <p className={`text-gray-300 text-sm ${mono ? 'font-mono' : ''}`}>{value}</p>
    </div>
  )
}
