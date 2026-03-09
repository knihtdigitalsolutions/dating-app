'use client'

import { useEffect, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import toast from 'react-hot-toast'
import { useAuthStore } from '@/lib/store/auth'
import { getSocket } from '@/lib/socket'
import { api } from '@/lib/api'
import { useQuery } from '@tanstack/react-query'

type Status = 'ringing' | 'connecting' | 'active' | 'ended'

// This is a standalone page that lives outside the dashboard layout
export default function CallPage({ params }: { params: { matchId: string } }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const type = searchParams.get('type') as 'VOICE' | 'VIDEO' || 'VOICE'
  const calleeId = searchParams.get('calleeId')
  const incomingCallId = searchParams.get('callId')
  const { accessToken, user } = useAuthStore()

  const [status, setStatus] = useState<Status>(incomingCallId ? 'ringing' : 'connecting')
  const [duration, setDuration] = useState(0)
  const [isMuted, setIsMuted] = useState(false)
  const [isCamOff, setIsCamOff] = useState(false)
  const [callId, setCallId] = useState(incomingCallId || null)

  const { data: otherProfile } = useQuery({
    queryKey: ['profile', calleeId],
    queryFn: async () => (await api.get(`/profiles/${calleeId}`)).data.data,
    enabled: !!calleeId,
  })

  // Duration counter
  useEffect(() => {
    if (status !== 'active') return
    const t = setInterval(() => setDuration(d => d + 1), 1000)
    return () => clearInterval(t)
  }, [status])

  // Socket listeners
  useEffect(() => {
    if (!accessToken) return
    const socket = getSocket(accessToken)

    socket.on('call:accepted', ({ callId: cid }: any) => {
      setCallId(cid)
      setStatus('active')
      toast.success('Connected!')
    })

    socket.on('call:declined', () => {
      toast.error('Call declined')
      router.back()
    })

    socket.on('call:ended', ({ duration: d }: any) => {
      toast(`Call ended · ${formatDuration(d || duration)}`, { icon: '📵' })
      router.back()
    })

    return () => { socket.off('call:accepted'); socket.off('call:declined'); socket.off('call:ended') }
  }, [accessToken, router, duration])

  const accept = () => {
    if (!accessToken || !incomingCallId) return
    getSocket(accessToken).emit('call:accept', { callId: incomingCallId })
    setStatus('connecting')
  }

  const end = () => {
    if (!accessToken) return
    if (callId) getSocket(accessToken).emit('call:end', { callId })
    router.back()
  }

  const formatDuration = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

  const photo = otherProfile?.photos?.[0]?.url
  const name = otherProfile?.displayName || 'Calling...'

  return (
    <div className="min-h-screen bg-surface-base flex items-center justify-center relative overflow-hidden">
      {/* Background glow */}
      <div className="absolute inset-0 bg-gradient-radial from-gold-500/10 via-transparent to-stone-400/10" />

      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
        className="relative z-10 flex flex-col items-center gap-8 text-center p-8 w-full max-w-sm">

        {/* Avatar */}
        <motion.div animate={{ boxShadow: status === 'ringing' ? ['0 0 0px var(--color-gold-500)', '0 0 40px var(--color-gold-500)', '0 0 0px var(--color-gold-500)'] : 'none' }}
          transition={{ repeat: Infinity, duration: 1.5 }}
          className="w-32 h-32 rounded-full overflow-hidden border-4 border-gold-500/30">
          {photo ? (
            <img src={photo} alt="" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full bg-surface-raised flex items-center justify-center text-5xl">👤</div>
          )}
        </motion.div>

        {/* Name + status */}
        <div>
          <h2 className="text-white text-2xl font-display font-bold">{name}</h2>
          <p className="text-gray-400 font-mono text-sm mt-1">
            {status === 'ringing' && incomingCallId ? `Incoming ${type.toLowerCase()} call` :
             status === 'ringing' ? 'Ringing...' :
             status === 'connecting' ? 'Connecting...' :
             status === 'active' ? `${type === 'VIDEO' ? '📹' : '📞'} ${formatDuration(duration)}` :
             'Call ended'}
          </p>
        </div>

        {/* Controls */}
        {status === 'ringing' && incomingCallId ? (
          // Incoming - accept / decline
          <div className="flex gap-8">
            <CallBtn onClick={end} icon="📵" bg="var(--color-gold-500)" label="Decline" />
            <CallBtn onClick={accept} icon={type === 'VIDEO' ? '📹' : '📞'} bg="#4ade80" label="Accept" />
          </div>
        ) : (
          // Active call controls
          <div className="flex gap-4">
            <CallBtn onClick={() => setIsMuted(!isMuted)} icon={isMuted ? '🔇' : '🎙️'}
              bg={isMuted ? 'var(--color-gold-500)22' : 'var(--color-surface-overlay)'} label={isMuted ? 'Unmute' : 'Mute'} small />
            {type === 'VIDEO' && (
              <CallBtn onClick={() => setIsCamOff(!isCamOff)} icon={isCamOff ? '🚫' : '📹'}
                bg={isCamOff ? 'var(--color-gold-500)22' : 'var(--color-surface-overlay)'} label={isCamOff ? 'Start cam' : 'Stop cam'} small />
            )}
            <CallBtn onClick={end} icon="📵" bg="var(--color-gold-500)" label="End call" />
          </div>
        )}

        {status === 'connecting' && (
          <div className="w-6 h-6 rounded-full border-2 border-gold-500 border-t-transparent animate-spin" />
        )}
      </motion.div>
    </div>
  )
}

function CallBtn({ onClick, icon, bg, label, small }: { onClick: () => void; icon: string; bg: string; label: string; small?: boolean }) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <motion.button whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} onClick={onClick}
        className={`${small ? 'w-12 h-12' : 'w-16 h-16'} rounded-full flex items-center justify-center text-xl border border-white/10 transition-all`}
        style={{ background: bg }}>
        {icon}
      </motion.button>
      <span className="text-gray-600 font-mono text-xs">{label}</span>
    </div>
  )
}
