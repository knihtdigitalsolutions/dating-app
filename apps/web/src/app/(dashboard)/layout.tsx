'use client'

import { useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { useAuthStore } from '@/lib/store/auth'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'

const NAV = [
  { href: '/discover',  icon: '✦',  label: 'Discover'  },
  { href: '/matches',   icon: '◈',  label: 'Matches'   },
  { href: '/chat',      icon: '◎',  label: 'Messages'  },
  { href: '/profile',   icon: '○',  label: 'Profile'   },
  { href: '/upgrade',   icon: '◆',  label: 'Upgrade'   },
  { href: '/security',  icon: '⬡',  label: 'Security'  },
]

const PLAN_LABEL: Record<string, { text: string; style: string }> = {
  FREE:     { text: 'Free',     style: 'badge badge-muted' },
  GOLD:     { text: 'Gold',     style: 'badge badge-gold'  },
  PLATINUM: { text: 'Platinum', style: 'badge badge-gold'  },
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router    = useRouter()
  const pathname  = usePathname()
  const { isAuthenticated, isLoading, user, logout } = useAuthStore()

  const { data: profile } = useQuery({
    queryKey: ['profile', 'me'],
    queryFn: async () => (await api.get('/profiles/me')).data.data,
    enabled: isAuthenticated,
  })

  useEffect(() => {
    if (!isLoading && !isAuthenticated) router.replace('/login')
  }, [isAuthenticated, isLoading, router])

  if (isLoading || !isAuthenticated) {
    return (
      <div style={{
        height: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--color-surface-base)',
      }}>
        <div style={{
          width: 32, height: 32, borderRadius: '50%',
          border: '2px solid var(--color-border-subtle)',
          borderTopColor: 'var(--color-gold-500)',
          animation: 'spin 0.8s linear infinite',
        }} />
      </div>
    )
  }

  const mainPhoto = profile?.photos?.find((p: any) => p.isMain) || profile?.photos?.[0]
  const plan = user?.plan || 'FREE'
  const planConfig = PLAN_LABEL[plan]

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--color-surface-base)' }}>

      {/* ── Sidebar ─────────────────────────────────────── */}
      <aside style={{
        width: 240,
        flexShrink: 0,
        background: 'var(--color-surface-raised)',
        borderRight: '1px solid var(--color-border-subtle)',
        display: 'flex',
        flexDirection: 'column',
      }}>

        {/* Logo */}
        <div style={{ padding: '24px 20px 20px', borderBottom: '1px solid var(--color-border-subtle)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {/* Geometric gold mark */}
            <div style={{
              width: 34, height: 34,
              background: 'linear-gradient(135deg, var(--color-gold-500), var(--color-gold-700))',
              borderRadius: 8,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 14, color: 'var(--color-stone-950)', fontWeight: 700,
              boxShadow: 'var(--shadow-gold)',
              flexShrink: 0,
            }}>◆</div>
            <div>
              <p style={{
                fontFamily: 'var(--font-display)',
                fontSize: 17, fontWeight: 700,
                color: 'var(--color-text-primary)',
                lineHeight: 1.1,
              }}>Dating</p>
              <p style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--color-text-tertiary)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>East Africa</p>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: '12px 10px', display: 'flex', flexDirection: 'column', gap: 2 }}>
          {NAV.map(({ href, icon, label }) => {
            const active = pathname === href || (href !== '/' && pathname.startsWith(href))
            return (
              <Link key={href} href={href} style={{ textDecoration: 'none' }}>
                <motion.div
                  whileHover={{ x: 3 }}
                  whileTap={{ scale: 0.97 }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '9px 12px', borderRadius: 10,
                    background: active ? 'oklch(80% 0.15 85 / 8%)' : 'transparent',
                    border: active ? '1px solid oklch(80% 0.15 85 / 18%)' : '1px solid transparent',
                    cursor: 'pointer', transition: 'all 0.15s ease',
                  }}
                >
                  <span style={{
                    fontSize: 13,
                    color: active ? 'var(--color-gold-400)' : 'var(--color-text-tertiary)',
                    width: 16, textAlign: 'center', flexShrink: 0,
                  }}>{icon}</span>
                  <span style={{
                    fontFamily: 'var(--font-sans)', fontSize: 13.5, fontWeight: active ? 500 : 400,
                    color: active ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                    letterSpacing: '-0.01em',
                  }}>{label}</span>
                  {active && (
                    <div style={{ marginLeft: 'auto', width: 5, height: 5, borderRadius: '50%', background: 'var(--color-gold-500)', flexShrink: 0 }} />
                  )}
                </motion.div>
              </Link>
            )
          })}
        </nav>

        {/* Plan upgrade nudge */}
        {plan === 'FREE' && (
          <div style={{ margin: '0 10px 12px', padding: '12px 14px', background: 'oklch(80% 0.15 85 / 5%)', borderRadius: 12, border: '1px solid var(--color-border-gold)' }}>
            <p style={{ color: 'var(--color-gold-400)', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Unlock Gold</p>
            <p style={{ color: 'var(--color-text-tertiary)', fontSize: 11, lineHeight: 1.5, marginBottom: 10 }}>Unlimited likes, see who liked you, video calls.</p>
            <Link href="/upgrade" style={{ textDecoration: 'none' }}>
              <div className="btn-gold" style={{ width: '100%', fontSize: 11, padding: '6px 12px', justifyContent: 'center' }}>
                Upgrade ◆
              </div>
            </Link>
          </div>
        )}

        {/* User row */}
        <div style={{ padding: '12px 10px 16px', borderTop: '1px solid var(--color-border-subtle)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px' }}>
            <div style={{
              width: 34, height: 34, borderRadius: '50%', overflow: 'hidden', flexShrink: 0,
              background: 'var(--color-surface-overlay)', border: '1px solid var(--color-border-default)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              {mainPhoto?.url
                ? <img src={mainPhoto.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : <span style={{ fontSize: 14, color: 'var(--color-text-tertiary)' }}>○</span>}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {profile?.displayName || user?.phone || 'You'}
              </p>
              <span className={planConfig.style} style={{ marginTop: 2 }}>{planConfig.text}</span>
            </div>
            <button onClick={logout} title="Sign out"
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-tertiary)', fontSize: 14, padding: 4, flexShrink: 0, transition: 'color 0.15s' }}
              onMouseOver={e => (e.currentTarget.style.color = 'var(--color-danger)')}
              onMouseOut={e => (e.currentTarget.style.color = 'var(--color-text-tertiary)')}
            >↪</button>
          </div>
        </div>
      </aside>

      {/* ── Main ─────────────────────────────────────────── */}
      <main style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {children}
      </main>
    </div>
  )
}
