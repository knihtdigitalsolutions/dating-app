'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import toast from 'react-hot-toast'
import { api } from '@/lib/api'
import { useAuthStore } from '@/lib/store/auth'
import { PLAN_FEATURES } from '@dating/types'
import Link from 'next/link'

export default function ProfilePage() {
  const { user } = useAuthStore()
  const qc = useQueryClient()
  const [editing, setEditing] = useState(false)

  const { data: profile, isLoading } = useQuery({
    queryKey: ['profile', 'me'],
    queryFn: async () => (await api.get('/profiles/me')).data.data,
  })

  const updateMutation = useMutation({
    mutationFn: async (data: any) => (await api.patch('/profiles/me', data)).data.data,
    onSuccess: () => { toast.success('Profile updated!'); qc.invalidateQueries({ queryKey: ['profile', 'me'] }); setEditing(false) },
    onError: () => toast.error('Update failed'),
  })

  const [form, setForm] = useState({ bio: '', occupation: '' })

  const startEdit = () => {
    setForm({ bio: profile?.bio || '', occupation: profile?.occupation || '' })
    setEditing(true)
  }

  const plan = user?.plan || 'FREE'
  const features = PLAN_FEATURES[plan as keyof typeof PLAN_FEATURES]
  const mainPhoto = profile?.photos?.find((p: any) => p.isMain) || profile?.photos?.[0]

  if (isLoading) return <div className="flex-1 flex items-center justify-center"><div className="w-6 h-6 rounded-full border-2 border-gold-500 border-t-transparent animate-spin" /></div>

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-2xl mx-auto p-8 space-y-6">

        {/* Header */}
        <div className="flex items-start gap-6">
          <div className="w-24 h-24 rounded-2xl overflow-hidden bg-surface-raised border border-border-subtle flex-shrink-0">
            {mainPhoto?.url ? (
              <img src={mainPhoto.url} alt="" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-3xl">👤</div>
            )}
          </div>
          <div className="flex-1">
            <h1 className="text-3xl font-display font-bold text-white">
              {profile?.displayName}{profile?.age ? `, ${profile.age}` : ''}
            </h1>
            {profile?.locationName && <p className="text-gray-500 text-sm mt-1">📍 {profile.locationName}</p>}
            <div className="flex items-center gap-3 mt-3">
              <span className={`tag font-mono text-xs ${plan === 'FREE' ? 'tag-muted' : plan === 'GOLD' ? 'bg-gold-500/10 text-gold-500 border-gold-500/20' : 'bg-stone-400/10 text-stone-400 border-stone-400/20'}`}>
                {plan === 'FREE' ? '🆓 Free' : plan === 'GOLD' ? '🥇 Gold' : '💎 Platinum'}
              </span>
              {profile?.verificationStatus === 'VERIFIED' && (
                <span className="tag bg-stone-300/10 text-stone-300 border-stone-300/20">✓ Verified</span>
              )}
            </div>
          </div>
          <button onClick={startEdit} className="btn-secondary text-sm">Edit Profile</button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Profile Views', value: profile?.profileViews || 0, icon: '👁️' },
            { label: 'Likes Received', value: profile?.likesReceived || 0, icon: '💘' },
            { label: 'Super Likes', value: profile?.superLikesReceived || 0, icon: '⭐' },
          ].map(s => (
            <div key={s.label} className="card p-4 text-center">
              <p className="text-2xl mb-1">{s.icon}</p>
              <p className="text-white text-2xl font-display font-bold">{s.value}</p>
              <p className="section-label mt-1">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Edit form */}
        {editing && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="card p-5 space-y-4 border-gold-500/20">
            <h3 className="text-white font-semibold">Edit Profile</h3>
            <div>
              <label className="section-label block mb-2">Bio</label>
              <textarea className="input resize-none" rows={4} value={form.bio} onChange={e => setForm(f => ({ ...f, bio: e.target.value }))} maxLength={500} />
            </div>
            <div>
              <label className="section-label block mb-2">Occupation</label>
              <input className="input" value={form.occupation} onChange={e => setForm(f => ({ ...f, occupation: e.target.value }))} />
            </div>
            <div className="flex gap-3">
              <button onClick={() => updateMutation.mutate(form)} disabled={updateMutation.isPending} className="btn-primary">
                {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
              </button>
              <button onClick={() => setEditing(false)} className="btn-secondary">Cancel</button>
            </div>
          </motion.div>
        )}

        {/* Bio */}
        {profile?.bio && !editing && (
          <div className="card p-5">
            <p className="section-label mb-3">About</p>
            <p className="text-gray-300 leading-relaxed text-sm">{profile.bio}</p>
          </div>
        )}

        {/* Interests */}
        {profile?.interests?.length > 0 && (
          <div className="card p-5">
            <p className="section-label mb-3">Interests</p>
            <div className="flex flex-wrap gap-2">
              {profile.interests.map((i: string) => <span key={i} className="tag-pink">{i}</span>)}
            </div>
          </div>
        )}

        {/* Plan features */}
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <p className="section-label">Your Plan Features</p>
            {plan === 'FREE' && <Link href="/upgrade" className="text-gold-500 font-mono text-xs hover:underline">Upgrade →</Link>}
          </div>
          <div className="grid grid-cols-2 gap-2 text-sm">
            {[
              ['Daily likes', features.dailyLikes === -1 ? 'Unlimited' : features.dailyLikes],
              ['Super Likes', `${features.superLikes}/day`],
              ['See who liked you', features.seeWhoLikedYou],
              ['Rewind', features.rewind],
              ['Read receipts', features.readReceipts],
              ['Video calls', features.videoCalls],
              ['Voice calls', features.voiceCalls],
            ].map(([label, val]) => (
              <div key={String(label)} className="flex items-center gap-2">
                <span style={{ color: val === false ? 'var(--color-surface-subtle)' : '#4ade80' }}>{val === false ? '✕' : '✓'}</span>
                <span style={{ color: val === false ? 'var(--color-surface-subtle)' : '#9a9aa0' }} className="text-xs">{label}: {typeof val === 'boolean' ? '' : val}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Photos */}
        <div className="card p-5">
          <p className="section-label mb-3">Photos</p>
          <div className="grid grid-cols-3 gap-2">
            {profile?.photos?.map((p: any) => (
              <div key={p.id} className="aspect-square rounded-xl overflow-hidden bg-surface-overlay border border-border-subtle">
                <img src={p.url} alt="" className="w-full h-full object-cover" />
              </div>
            ))}
            <div className="aspect-square rounded-xl border-2 border-dashed border-border-subtle flex items-center justify-center text-gray-600 cursor-pointer hover:border-gold-500/40 transition-colors text-2xl">
              +
            </div>
          </div>
        </div>

      </div>
    </div>
  )
}
