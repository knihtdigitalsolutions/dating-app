'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { format } from 'date-fns'
import Link from 'next/link'
import toast from 'react-hot-toast'
import { api } from '@/lib/api'
import { useAuthStore } from '@/lib/store/auth'
import { getSocket } from '@/lib/socket'

export default function ChatPage() {
  const { matchId } = useParams<{ matchId: string }>()
  const router = useRouter()
  const { user, accessToken } = useAuthStore()
  const qc = useQueryClient()
  const bottomRef = useRef<HTMLDivElement>(null)
  const [text, setText] = useState('')
  const [theyTyping, setTheyTyping] = useState(false)
  const [isTyping, setIsTyping] = useState(false)
  const typingTimer = useRef<any>()

  const { data, isLoading } = useQuery({
    queryKey: ['chat', matchId],
    queryFn: async () => {
      const [msgs, matchesRes] = await Promise.all([
        api.get(`/messages/${matchId}`),
        api.get('/matches'),
      ])
      const match = matchesRes.data.data.find((m: any) => m.id === matchId)
      return { messages: msgs.data.data, match }
    },
  })

  // Scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [data?.messages?.length, theyTyping])

  // Socket.io real-time
  useEffect(() => {
    if (!accessToken) return
    const socket = getSocket(accessToken)

    socket.on('message:new', (msg: any) => {
      if (msg.matchId !== matchId) return
      qc.setQueryData(['chat', matchId], (old: any) => old ? ({ ...old, messages: [...old.messages, msg] }) : old)
    })

    socket.on('typing:indicator', ({ matchId: mid, isTyping: typing }: any) => {
      if (mid === matchId) setTheyTyping(typing)
    })

    return () => { socket.off('message:new'); socket.off('typing:indicator') }
  }, [accessToken, matchId, qc])

  const sendMutation = useMutation({
    mutationFn: async (content: string) =>
      (await api.post('/messages', { matchId, type: 'TEXT', content })).data.data,
    onSuccess: (msg) => {
      qc.setQueryData(['chat', matchId], (old: any) =>
        old ? ({ ...old, messages: [...old.messages, msg] }) : old)
    },
    onError: () => toast.error('Failed to send message'),
  })

  const handleType = useCallback((val: string) => {
    setText(val)
    if (!accessToken) return
    const socket = getSocket(accessToken)
    if (!isTyping) { setIsTyping(true); socket.emit('typing:start', { matchId }) }
    clearTimeout(typingTimer.current)
    typingTimer.current = setTimeout(() => { setIsTyping(false); socket.emit('typing:stop', { matchId }) }, 1500)
  }, [isTyping, matchId, accessToken])

  const send = () => {
    const t = text.trim()
    if (!t) return
    sendMutation.mutate(t)
    setText('')
  }

  const startCall = (type: 'VOICE' | 'VIDEO') => {
    if (!accessToken) return
    if (user?.plan === 'FREE') { toast.error('Calls require Gold or Platinum plan'); return }
    const other = data?.match?.other
    if (!other) return
    const socket = getSocket(accessToken)
    socket.emit('call:initiate', { matchId, calleeId: other.id, type })
    router.push(`/call/${matchId}?type=${type}&calleeId=${other.id}`)
  }

  const other = data?.match?.other
  const messages = data?.messages || []

  return (
    <div className="flex-1 flex overflow-hidden">

      {/* Matches sidebar */}
      <MatchesSidebar activeMatchId={matchId} />

      {/* Chat area */}
      <div className="flex-1 flex flex-col overflow-hidden border-l border-border-subtle">

        {/* Header */}
        <div className="flex items-center gap-4 px-5 py-4 border-b border-border-subtle bg-surface-raised flex-shrink-0">
          {other?.photo ? (
            <img src={other.photo} alt="" className="w-10 h-10 rounded-full object-cover border border-border-subtle" />
          ) : (
            <div className="w-10 h-10 rounded-full bg-surface-overlay flex items-center justify-center border border-border-subtle">👤</div>
          )}
          <div className="flex-1">
            <p className="text-white font-semibold text-sm">{other?.displayName || '...'}</p>
            <p className="font-mono text-xs" style={{ color: other?.isOnline ? '#4ade80' : 'var(--color-text-tertiary)' }}>
              {other?.isOnline ? 'Online now' : 'Offline'}
            </p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => startCall('VOICE')}
              className="w-9 h-9 rounded-xl bg-surface-overlay border border-border-subtle flex items-center justify-center hover:border-stone-300/40 transition-colors" title="Voice call">
              📞
            </button>
            <button onClick={() => startCall('VIDEO')}
              className="w-9 h-9 rounded-xl bg-surface-overlay border border-border-subtle flex items-center justify-center hover:border-gold-500/40 transition-colors" title="Video call">
              📹
            </button>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-2">
          {isLoading ? (
            <div className="flex items-center justify-center h-full">
              <div className="w-6 h-6 rounded-full border-2 border-gold-500 border-t-transparent animate-spin" />
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-center">
              <span className="text-4xl">💬</span>
              <p className="text-white font-display text-lg">Start the conversation!</p>
              <p className="text-gray-500 text-sm">Say hello to {other?.displayName}</p>
            </div>
          ) : (
            messages.map((msg: any) => {
              const mine = msg.senderId === user?.id
              return (
                <motion.div key={msg.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                  className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-xs lg:max-w-md rounded-2xl px-4 py-2.5 ${mine ? 'bg-gold-500 text-white rounded-tr-sm' : 'bg-surface-raised text-gray-200 rounded-tl-sm border border-border-subtle'}`}>
                    <p className="text-sm leading-relaxed break-words">{msg.content}</p>
                    <p className={`text-xs mt-1 ${mine ? 'text-white/60 text-right' : 'text-gray-600'}`}>
                      {format(new Date(msg.createdAt), 'HH:mm')}
                      {mine && (msg.isRead ? ' ✓✓' : ' ✓')}
                    </p>
                  </div>
                </motion.div>
              )
            })
          )}

          {theyTyping && (
            <div className="flex justify-start">
              <div className="bg-surface-raised border border-border-subtle rounded-2xl rounded-tl-sm px-4 py-2.5">
                <div className="flex gap-1 items-center h-4">
                  {[0, 0.2, 0.4].map(d => (
                    <motion.span key={d} className="w-1.5 h-1.5 rounded-full bg-gray-500"
                      animate={{ y: [0, -4, 0] }} transition={{ duration: 0.6, repeat: Infinity, delay: d }} />
                  ))}
                </div>
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="px-5 py-4 border-t border-border-subtle flex items-end gap-3">
          <textarea
            value={text}
            onChange={e => handleType(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
            placeholder={`Message ${other?.displayName || ''}...`}
            className="input flex-1 resize-none min-h-[44px] max-h-32 py-2.5"
            rows={1}
          />
          <button onClick={send} disabled={!text.trim() || sendMutation.isPending}
            className="w-10 h-10 rounded-xl flex items-center justify-center transition-all flex-shrink-0"
            style={{ background: text.trim() ? 'var(--color-gold-500)' : 'var(--color-surface-overlay)', opacity: text.trim() ? 1 : 0.5 }}>
            ↑
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Left sidebar showing all matches ────────────────────
function MatchesSidebar({ activeMatchId }: { activeMatchId: string }) {
  const { data: matches = [] } = useQuery({
    queryKey: ['matches'],
    queryFn: async () => (await api.get('/matches')).data.data,
  })

  return (
    <div className="w-72 flex-shrink-0 flex flex-col border-r border-border-subtle">
      <div className="p-4 border-b border-border-subtle">
        <p className="text-white font-semibold">Messages</p>
      </div>
      <div className="flex-1 overflow-y-auto">
        {matches.map((match: any) => (
          <Link key={match.id} href={`/chat/${match.id}`}>
            <div className={`flex items-center gap-3 px-4 py-3 hover:bg-surface-raised transition-colors ${activeMatchId === match.id ? 'bg-surface-raised border-r-2 border-gold-500' : ''}`}>
              <div className="relative w-10 h-10 rounded-full overflow-hidden bg-surface-overlay flex-shrink-0 border border-border-subtle">
                {match.other.photo ? <img src={match.other.photo} alt="" className="w-full h-full object-cover" /> : <span className="text-lg flex items-center justify-center w-full h-full">👤</span>}
                {match.other.isOnline && <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-success border border-surface-base" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-white text-sm font-medium truncate">{match.other.displayName}</p>
                <p className="text-gray-500 text-xs truncate">{match.lastMessage?.content || 'Say hello!'}</p>
              </div>
              {match.lastMessage && !match.lastMessage.isRead && !match.lastMessage.isMine && (
                <span className="w-2 h-2 rounded-full bg-gold-500 flex-shrink-0" />
              )}
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
