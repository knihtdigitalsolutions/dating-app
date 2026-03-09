'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { formatDistanceToNow, format } from 'date-fns'
import toast from 'react-hot-toast'
import { api } from '@/lib/api'

export default function SessionsPage() {
  const qc = useQueryClient()

  const { data: sessions = [], isLoading } = useQuery({
    queryKey: ['security', 'sessions'],
    queryFn: async () => (await api.get('/security/sessions')).data.data,
  })

  const revokeMutation = useMutation({
    mutationFn: async (id: string) => api.delete(`/security/sessions/${id}`),
    onSuccess: () => {
      toast.success('Session revoked')
      qc.invalidateQueries({ queryKey: ['security', 'sessions'] })
    },
    onError: () => toast.error('Failed to revoke session'),
  })

  const revokeAllMutation = useMutation({
    mutationFn: async () => api.delete('/security/sessions'),
    onSuccess: (res) => {
      toast.success((res.data as any).message || 'All sessions revoked')
      qc.invalidateQueries({ queryKey: ['security', 'sessions'] })
    },
  })

  const platformIcon = (p?: string) => {
    if (p === 'ios')     return '🍎'
    if (p === 'android') return '🤖'
    if (p === 'web')     return '🌐'
    return '📱'
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-3xl mx-auto p-8 space-y-6">

        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-display font-bold text-white">Active Sessions</h1>
            <p className="text-gray-500 text-sm mt-1 font-mono">
              Every device currently logged in to your account.
            </p>
          </div>
          {sessions.length > 1 && (
            <button
              onClick={() => revokeAllMutation.mutate()}
              disabled={revokeAllMutation.isPending}
              className="text-gold-500 font-mono text-xs border border-gold-500/30 px-3 py-2 rounded-xl
                         hover:bg-gold-500/10 transition-colors disabled:opacity-50"
            >
              {revokeAllMutation.isPending ? 'Revoking…' : 'Revoke All Other Sessions'}
            </button>
          )}
        </div>

        {/* Security notice */}
        <div className="card p-4 border-gold-500/20 bg-gold-500/5 flex gap-3">
          <span className="text-xl flex-shrink-0">💡</span>
          <div>
            <p className="text-gold-500 text-sm font-semibold">Don't recognise a session?</p>
            <p className="text-gray-400 text-xs mt-0.5 leading-relaxed">
              If you see a device or location you don't recognise, revoke that session immediately
              and change your account settings. Someone else may have access to your account.
            </p>
          </div>
        </div>

        {/* Sessions list */}
        {isLoading ? (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-24 rounded-2xl bg-surface-raised animate-pulse" />
            ))}
          </div>
        ) : sessions.length === 0 ? (
          <div className="text-center py-16 text-gray-500">
            <p className="text-4xl mb-3">📱</p>
            <p>No active sessions found.</p>
          </div>
        ) : (
          <AnimatePresence>
            <div className="space-y-3">
              {sessions.map((session: any, idx: number) => (
                <motion.div
                  key={session.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: 40 }}
                  transition={{ delay: idx * 0.04 }}
                  className="card p-5 flex items-start gap-4"
                >
                  {/* Platform icon */}
                  <div className="w-11 h-11 rounded-xl bg-surface-overlay border border-border-subtle
                                  flex items-center justify-center text-xl flex-shrink-0">
                    {platformIcon(session.platform)}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-white font-semibold text-sm truncate">
                        {session.deviceName || 'Unknown device'}
                      </p>
                      {idx === 0 && (
                        <span className="tag bg-success/10 text-success border-success/20 text-xs">
                          Current session
                        </span>
                      )}
                      {session.isTrusted && (
                        <span className="tag bg-stone-300/10 text-stone-300 border-stone-300/20 text-xs">
                          Trusted
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1.5">
                      {session.os && (
                        <p className="text-gray-500 font-mono text-xs">{session.os}</p>
                      )}
                      {session.browser && (
                        <p className="text-gray-500 font-mono text-xs">{session.browser}</p>
                      )}
                      {session.ipAddress && (
                        <p className="text-gray-500 font-mono text-xs">
                          🌐 {session.ipAddress}
                        </p>
                      )}
                    </div>

                    <div className="flex gap-4 mt-1">
                      <p className="text-gray-600 font-mono text-xs">
                        Last active: {formatDistanceToNow(new Date(session.lastActiveAt), { addSuffix: true })}
                      </p>
                      <p className="text-gray-600 font-mono text-xs">
                        Created: {format(new Date(session.createdAt), 'dd MMM yyyy')}
                      </p>
                    </div>
                  </div>

                  {/* Revoke button (not for current) */}
                  {idx !== 0 && (
                    <button
                      onClick={() => revokeMutation.mutate(session.id)}
                      disabled={revokeMutation.isPending}
                      className="flex-shrink-0 text-gold-500 font-mono text-xs border border-gold-500/20
                                 px-3 py-1.5 rounded-lg hover:bg-gold-500/10 transition-colors
                                 disabled:opacity-50"
                    >
                      Revoke
                    </button>
                  )}
                </motion.div>
              ))}
            </div>
          </AnimatePresence>
        )}
      </div>
    </div>
  )
}
