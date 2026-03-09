'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
  BarChart, Bar, Cell,
} from 'recharts'
import { formatDistanceToNow, format } from 'date-fns'
import toast from 'react-hot-toast'
import { api } from '@/lib/api'

const SEVERITY_COLOR: Record<string, string> = {
  INFO: '#6b7280', LOW: '#4ade80', MEDIUM: 'var(--color-gold-500)',
  HIGH: 'var(--color-gold-300)', CRITICAL: 'var(--color-gold-500)',
}

export default function AdminSecurityPage() {
  const [blockIp, setBlockIp]     = useState('')
  const [blockReason, setBlockReason] = useState('')
  const [blockHours, setBlockHours]   = useState('24')
  const qc = useQueryClient()

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['admin', 'security'],
    queryFn: async () => (await api.get('/security/admin/dashboard')).data.data,
    refetchInterval: 30000, // live-refresh every 30s
  })

  const blockMutation = useMutation({
    mutationFn: () => api.post('/security/admin/block-ip', {
      ipAddress: blockIp,
      reason: blockReason,
      durationHours: parseInt(blockHours),
    }),
    onSuccess: () => {
      toast.success(`IP ${blockIp} blocked`)
      setBlockIp(''); setBlockReason('')
      qc.invalidateQueries({ queryKey: ['admin', 'security'] })
    },
    onError: () => toast.error('Failed to block IP'),
  })

  const unblockMutation = useMutation({
    mutationFn: (ip: string) => api.delete(`/security/admin/block-ip/${encodeURIComponent(ip)}`),
    onSuccess: () => { toast.success('IP unblocked'); qc.invalidateQueries({ queryKey: ['admin', 'security'] }) },
  })

  const resolveMutation = useMutation({
    mutationFn: (id: string) => api.post(`/security/admin/resolve-event/${id}`, { note: 'Reviewed by admin' }),
    onSuccess: () => { toast.success('Event resolved'); qc.invalidateQueries({ queryKey: ['admin', 'security'] }) },
  })

  if (isLoading) return <AdminSkeleton />

  const d = data || {}
  const { summary = {}, topThreats = [], recentCritical = [], loginStats = {}, blockedIps = [], eventsByHour = [] } = d

  // Chart data
  const hourlyData = eventsByHour.map((e: any) => ({
    time: format(new Date(e.hour), 'HH:mm'),
    events: e.count,
  }))

  const threatData = topThreats.map((t: any) => ({
    name: t.type.replace(/_/g, ' '),
    count: t.count,
  }))

  return (
    <div className="min-h-screen bg-surface-base p-6 space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-display font-bold text-white">Security Command Centre</h1>
          <p className="text-gray-500 font-mono text-xs mt-1">
            Real-time threat monitoring · Auto-refreshes every 30s
          </p>
        </div>
        <button onClick={() => refetch()}
          className="text-gold-500 font-mono text-xs border border-gold-500/20 px-3 py-2 rounded-xl
                     hover:bg-gold-500/10 transition-colors">
          ↻ Refresh
        </button>
      </div>

      {/* Summary metrics */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: 'Events (24h)',      value: summary.totalEvents24h,       color: 'var(--color-stone-400)' },
          { label: 'Critical (24h)',    value: summary.criticalEvents24h,    color: 'var(--color-gold-500)',
            alert: summary.criticalEvents24h > 0 },
          { label: 'High severity',     value: summary.highEvents24h,        color: 'var(--color-gold-300)',
            alert: summary.highEvents24h > 5 },
          { label: 'Blocked IPs',       value: summary.blockedIps,           color: 'var(--color-gold-500)' },
          { label: 'Rate limit hits',   value: summary.rateLimitViolations,  color: '#4ade80' },
        ].map((m) => (
          <motion.div key={m.label} whileHover={{ y: -2 }}
            className={`card p-4 ${m.alert ? 'border-gold-500/40 animate-pulse-glow' : ''}`}>
            <p className="text-3xl font-display font-black" style={{ color: m.color }}>
              {m.value ?? '—'}
            </p>
            <p className="section-label mt-1">{m.label}</p>
          </motion.div>
        ))}
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* Events over time */}
        <div className="card p-5 lg:col-span-2">
          <p className="section-label mb-4">Events over last 24 hours</p>
          {hourlyData.length > 0 ? (
            <ResponsiveContainer width="100%" height={180}>
              <AreaChart data={hourlyData}>
                <defs>
                  <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--color-gold-500)" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="var(--color-gold-500)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="time" tick={{ fill: 'var(--color-text-tertiary)', fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: 'var(--color-text-tertiary)', fontSize: 10 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ background: 'var(--color-surface-raised)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 8, color: '#e8e6f0', fontSize: 12 }} />
                <Area type="monotone" dataKey="events" stroke="var(--color-gold-500)" fill="url(#areaGrad)" strokeWidth={2} dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-44 flex items-center justify-center text-gray-600 font-mono text-sm">
              No events in last 24 hours
            </div>
          )}
        </div>

        {/* Top threat types */}
        <div className="card p-5">
          <p className="section-label mb-4">Top threat types (7 days)</p>
          {threatData.length > 0 ? (
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={threatData} layout="vertical" barSize={10}>
                <XAxis type="number" tick={{ fill: 'var(--color-text-tertiary)', fontSize: 9 }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" tick={{ fill: '#9a9aa0', fontSize: 9 }} axisLine={false} tickLine={false} width={120} />
                <Tooltip contentStyle={{ background: 'var(--color-surface-raised)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 8, color: '#e8e6f0', fontSize: 11 }} />
                <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                  {threatData.map((_: any, i: number) => (
                    <Cell key={i} fill={i === 0 ? 'var(--color-gold-500)' : i === 1 ? 'var(--color-gold-300)' : i === 2 ? 'var(--color-gold-500)' : 'var(--color-stone-400)'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-44 flex items-center justify-center text-gray-600 font-mono text-sm">
              No threats detected
            </div>
          )}
        </div>
      </div>

      {/* Login stats */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Successful logins', value: loginStats.success, color: '#4ade80', icon: '✅' },
          { label: 'Failed logins',     value: loginStats.failed,  color: 'var(--color-gold-300)', icon: '❌' },
          { label: 'Failed OTPs',       value: loginStats.otpFailed, color: 'var(--color-gold-500)', icon: '🔢' },
        ].map((s) => (
          <div key={s.label} className="card p-4 flex items-center gap-4">
            <span className="text-2xl">{s.icon}</span>
            <div>
              <p className="text-2xl font-display font-bold" style={{ color: s.color }}>{s.value ?? 0}</p>
              <p className="section-label mt-0.5">{s.label} (24h)</p>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Recent critical events */}
        <div className="card p-5">
          <p className="section-label mb-4">Recent critical & high events</p>
          {recentCritical.length === 0 ? (
            <div className="py-8 text-center">
              <span className="text-4xl">✅</span>
              <p className="text-gray-500 text-sm mt-2">No critical events in 24 hours</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {recentCritical.map((e: any) => (
                <div key={e.id}
                  className="flex items-start gap-3 p-3 rounded-xl hover:bg-surface-overlay transition-colors group">
                  <div className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0"
                    style={{ background: SEVERITY_COLOR[e.severity] || '#6b7280' }} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-white text-xs font-mono font-semibold">
                        {e.type.replace(/_/g, ' ')}
                      </span>
                      <span className="font-mono text-xs px-1.5 py-0.5 rounded"
                        style={{ background: SEVERITY_COLOR[e.severity] + '22', color: SEVERITY_COLOR[e.severity] }}>
                        {e.severity}
                      </span>
                      <span className="text-gold-300 font-mono text-xs">Risk {e.riskScore}</span>
                    </div>
                    <div className="flex gap-3 mt-0.5">
                      {e.user && <p className="text-gray-500 font-mono text-xs">👤 {e.user}</p>}
                      {e.ip   && <p className="text-gray-500 font-mono text-xs">🌐 {e.ip}</p>}
                    </div>
                    {e.description && <p className="text-gray-600 text-xs mt-0.5 truncate">{e.description}</p>}
                  </div>
                  <div className="flex flex-col items-end gap-1 flex-shrink-0">
                    <p className="text-gray-600 font-mono text-xs">
                      {formatDistanceToNow(new Date(e.at), { addSuffix: true })}
                    </p>
                    <button
                      onClick={() => resolveMutation.mutate(e.id)}
                      className="opacity-0 group-hover:opacity-100 text-success font-mono text-xs
                                 border border-success/20 px-2 py-0.5 rounded hover:bg-success/10
                                 transition-all">
                      ✓ Resolve
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* IP Management */}
        <div className="card p-5 space-y-4">
          <p className="section-label">IP Block Management</p>

          {/* Block form */}
          <div className="space-y-2">
            <input value={blockIp} onChange={e => setBlockIp(e.target.value)}
              className="input text-sm" placeholder="IP address to block (e.g. 192.168.1.1)" />
            <input value={blockReason} onChange={e => setBlockReason(e.target.value)}
              className="input text-sm" placeholder="Reason" />
            <div className="flex gap-2">
              <select value={blockHours} onChange={e => setBlockHours(e.target.value)} className="input text-sm flex-1">
                <option value="1">1 hour</option>
                <option value="6">6 hours</option>
                <option value="24">24 hours</option>
                <option value="168">7 days</option>
                <option value="720">30 days</option>
                <option value="8760">1 year</option>
              </select>
              <button
                onClick={() => blockMutation.mutate()}
                disabled={!blockIp || !blockReason || blockMutation.isPending}
                className="btn-primary text-sm px-4">
                {blockMutation.isPending ? '…' : 'Block'}
              </button>
            </div>
          </div>

          {/* Active blocks */}
          <div>
            <p className="text-gray-600 font-mono text-xs mb-2">
              {blockedIps.length} active block{blockedIps.length !== 1 ? 's' : ''}
            </p>
            <div className="space-y-1.5 max-h-52 overflow-y-auto">
              {blockedIps.length === 0 ? (
                <p className="text-gray-600 font-mono text-xs py-3 text-center">No IPs currently blocked</p>
              ) : (
                blockedIps.map((b: any) => (
                  <div key={b.id}
                    className="flex items-center gap-3 p-2.5 bg-surface-overlay rounded-lg border border-border-subtle">
                    <span className="text-gold-500 font-mono text-xs flex-1 truncate">{b.ipAddress}</span>
                    <span className="text-gray-500 font-mono text-xs truncate flex-1">{b.reason}</span>
                    {b.expiresAt && (
                      <span className="text-gray-600 font-mono text-xs flex-shrink-0">
                        {formatDistanceToNow(new Date(b.expiresAt))}
                      </span>
                    )}
                    <button
                      onClick={() => unblockMutation.mutate(b.ipAddress)}
                      className="text-success font-mono text-xs hover:underline flex-shrink-0">
                      Unblock
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function AdminSkeleton() {
  return (
    <div className="min-h-screen bg-surface-base p-6 space-y-6">
      <div className="h-10 w-64 bg-surface-raised rounded-xl animate-pulse" />
      <div className="grid grid-cols-5 gap-3">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-20 bg-surface-raised rounded-2xl animate-pulse" />
        ))}
      </div>
      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-2 h-64 bg-surface-raised rounded-2xl animate-pulse" />
        <div className="h-64 bg-surface-raised rounded-2xl animate-pulse" />
      </div>
    </div>
  )
}
