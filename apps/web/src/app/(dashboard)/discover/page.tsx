'use client'

import { useState, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence, useMotionValue, useTransform } from 'framer-motion'
import toast from 'react-hot-toast'
import { api } from '@/lib/api'
import type { ProfileCard } from '@dating/types'

export default function DiscoverPage() {
  const qc = useQueryClient()
  const [index, setIndex] = useState(0)

  const { data: profiles = [], isLoading } = useQuery<ProfileCard[]>({
    queryKey: ['discover'],
    queryFn: async () => (await api.get('/matches/discover')).data.data,
  })

  const swipeMutation = useMutation({
    mutationFn: async ({ swipedId, action }: { swipedId: string; action: string }) =>
      (await api.post('/matches/swipe', { swipedId, action })).data.data,
    onSuccess: (data, { action }) => {
      if (data.isMatch) {
        toast.custom(() => (
          <div className="bg-surface-raised border border-gold-500/30 rounded-2xl p-4 flex items-center gap-3 shadow-xl">
            <span className="text-2xl">💘</span>
            <div><p className="text-white font-semibold text-sm">It's a Match!</p>
            <p className="text-gray-400 text-xs">You both liked each other!</p></div>
          </div>
        ), { duration: 4000 })
      }
    },
  })

  const handleAction = useCallback((action: 'LIKE' | 'PASS' | 'SUPER_LIKE') => {
    const profile = profiles[index]
    if (!profile) return
    swipeMutation.mutate({ swipedId: profile.userId, action })
    setIndex(i => i + 1)
  }, [profiles, index])

  const remaining = profiles.length - index

  if (isLoading) return <DiscoverSkeleton />

  return (
    <div className="flex-1 flex overflow-hidden">

      {/* Card area */}
      <div className="flex-1 flex flex-col items-center justify-center p-8 gap-6">
        <div className="relative w-full max-w-sm h-[540px]">
          {remaining === 0 ? (
            <EmptyState onRefresh={() => { setIndex(0); qc.invalidateQueries({ queryKey: ['discover'] }) }} />
          ) : (
            <AnimatePresence>
              {profiles.slice(index, index + 2).reverse().map((profile, i) => (
                <SwipeCard
                  key={profile.id}
                  profile={profile}
                  isTop={i === Math.min(2, remaining) - 1}
                  onSwipe={handleAction}
                />
              ))}
            </AnimatePresence>
          )}
        </div>

        {/* Action buttons */}
        {remaining > 0 && (
          <div className="flex items-center gap-4">
            <ActionBtn onClick={() => handleAction('PASS')} emoji="✕" color="var(--color-gold-500)" size="lg" label="Pass" />
            <ActionBtn onClick={() => handleAction('SUPER_LIKE')} emoji="⭐" color="var(--color-stone-300)" size="md" label="Super Like" />
            <ActionBtn onClick={() => handleAction('LIKE')} emoji="♥" color="var(--color-gold-500)" size="lg" label="Like" filled />
          </div>
        )}
      </div>

      {/* Profile detail panel */}
      {remaining > 0 && profiles[index] && (
        <ProfilePanel profile={profiles[index]} />
      )}
    </div>
  )
}

// ── Swipe Card ──────────────────────────────────────────
function SwipeCard({ profile, isTop, onSwipe }: { profile: ProfileCard; isTop: boolean; onSwipe: (a: 'LIKE' | 'PASS' | 'SUPER_LIKE') => void }) {
  const x = useMotionValue(0)
  const rotate = useTransform(x, [-200, 200], [-20, 20])
  const likeOpacity = useTransform(x, [30, 100], [0, 1])
  const nopeOpacity = useTransform(x, [-100, -30], [1, 0])
  const [photoIdx, setPhotoIdx] = useState(0)

  const photo = profile.photos[photoIdx]

  const handleDragEnd = (_: any, info: any) => {
    if (info.offset.x > 120) onSwipe('LIKE')
    else if (info.offset.x < -120) onSwipe('PASS')
  }

  return (
    <motion.div
      style={{ x, rotate, position: 'absolute', width: '100%', height: '100%' }}
      drag={isTop ? 'x' : false}
      dragConstraints={{ left: 0, right: 0 }}
      onDragEnd={handleDragEnd}
      whileDrag={{ cursor: 'grabbing' }}
      animate={{ scale: isTop ? 1 : 0.95, y: isTop ? 0 : 12 }}
      exit={{ x: x.get() > 0 ? 500 : -500, opacity: 0, transition: { duration: 0.3 } }}
      className="rounded-3xl overflow-hidden select-none cursor-grab bg-surface-raised"
      style={{ zIndex: isTop ? 10 : 1 } as any}
    >
      {/* Photo */}
      <div className="relative w-full h-full">
        <img
          src={photo?.url || 'https://placekitten.com/400/600'}
          alt={profile.displayName}
          className="w-full h-full object-cover"
          draggable={false}
        />

        {/* Photo dots */}
        <div className="absolute top-3 left-3 right-3 flex gap-1">
          {profile.photos.map((_, i) => (
            <button key={i} onClick={() => setPhotoIdx(i)}
              className="flex-1 h-1 rounded-full transition-colors"
              style={{ background: i === photoIdx ? 'white' : 'rgba(255,255,255,0.4)' }} />
          ))}
        </div>

        {/* Gradient */}
        <div className="absolute bottom-0 left-0 right-0 h-2/3 bg-gradient-to-t from-black/90 via-black/40 to-transparent" />

        {/* LIKE / NOPE indicators */}
        <motion.div style={{ opacity: likeOpacity }} className="absolute top-12 left-6 rotate-[-15deg]">
          <div className="border-3 border-success rounded-xl px-4 py-2">
            <span className="text-success font-display text-3xl font-black tracking-widest">LIKE</span>
          </div>
        </motion.div>
        <motion.div style={{ opacity: nopeOpacity }} className="absolute top-12 right-6 rotate-[15deg]">
          <div className="border-3 border-gold-500 rounded-xl px-4 py-2">
            <span className="text-gold-500 font-display text-3xl font-black tracking-widest">NOPE</span>
          </div>
        </motion.div>

        {/* Info */}
        <div className="absolute bottom-0 left-0 right-0 p-5">
          {profile.isOnline && (
            <div className="flex items-center gap-1.5 mb-2">
              <span className="w-2 h-2 rounded-full bg-success" />
              <span className="text-success font-mono text-xs">Online now</span>
            </div>
          )}
          <h2 className="text-white text-2xl font-display font-bold">
            {profile.displayName}, {profile.age}
          </h2>
          {profile.locationName && (
            <p className="text-gray-300 text-sm mt-0.5">📍 {profile.locationName}</p>
          )}
          <div className="flex flex-wrap gap-1.5 mt-2">
            {profile.interests.slice(0, 3).map(i => (
              <span key={i} className="bg-white/10 text-white/80 font-mono text-xs px-2.5 py-0.5 rounded-full">{i}</span>
            ))}
          </div>
        </div>
      </div>
    </motion.div>
  )
}

// ── Profile detail sidebar ───────────────────────────────
function ProfilePanel({ profile }: { profile: ProfileCard }) {
  return (
    <div className="w-80 border-l border-border-subtle bg-surface-raised overflow-y-auto p-6 space-y-5">
      <div>
        <h2 className="text-white text-2xl font-display font-bold">{profile.displayName}, {profile.age}</h2>
        {profile.locationName && <p className="text-gray-500 text-sm mt-1">📍 {profile.locationName}</p>}
        {profile.compatibilityScore && (
          <p className="text-gold-500 font-mono text-sm mt-1">✦ {Math.round(profile.compatibilityScore * 100)}% match</p>
        )}
      </div>

      {profile.bio && (
        <div>
          <p className="section-label mb-2">About</p>
          <p className="text-gray-300 text-sm leading-relaxed">{profile.bio}</p>
        </div>
      )}

      {profile.interests.length > 0 && (
        <div>
          <p className="section-label mb-2">Interests</p>
          <div className="flex flex-wrap gap-1.5">
            {profile.interests.map(i => <span key={i} className="tag-pink">{i}</span>)}
          </div>
        </div>
      )}

      {profile.verificationStatus === 'VERIFIED' && (
        <div className="flex items-center gap-2 text-stone-300 font-mono text-xs">
          <span>✓</span> Verified profile
        </div>
      )}
    </div>
  )
}

function ActionBtn({ onClick, emoji, color, size, label, filled }: any) {
  const dim = size === 'lg' ? 'w-14 h-14 text-xl' : 'w-12 h-12 text-base'
  return (
    <div className="flex flex-col items-center gap-1">
      <motion.button whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}
        onClick={onClick}
        className={`${dim} rounded-full border flex items-center justify-center transition-all`}
        style={{ background: filled ? color : 'transparent', borderColor: `${color}40`, boxShadow: filled ? `0 0 20px ${color}40` : 'none' }}>
        {emoji}
      </motion.button>
      <span className="text-gray-600 font-mono text-xs">{label}</span>
    </div>
  )
}

function EmptyState({ onRefresh }: { onRefresh: () => void }) {
  return (
    <div className="w-full h-full flex flex-col items-center justify-center gap-4 text-center">
      <span className="text-5xl">✨</span>
      <h3 className="text-white text-xl font-display">You've seen everyone!</h3>
      <p className="text-gray-500 text-sm">Check back later or expand your preferences.</p>
      <button onClick={onRefresh} className="btn-primary mt-2">Refresh</button>
    </div>
  )
}

function DiscoverSkeleton() {
  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="w-full max-w-sm h-[540px] rounded-3xl bg-surface-raised animate-pulse" />
    </div>
  )
}
