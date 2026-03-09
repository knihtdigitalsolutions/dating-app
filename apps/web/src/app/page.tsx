'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/lib/store/auth'

export default function RootPage() {
  const router = useRouter()
  const { isAuthenticated, isLoading, user } = useAuthStore()

  useEffect(() => {
    if (isLoading) return
    if (!isAuthenticated) {
      router.replace('/login')
    } else if (!user?.hasProfile) {
      router.replace('/onboarding')
    } else {
      router.replace('/discover')
    }
  }, [isAuthenticated, isLoading, user, router])

  return (
    <div className="flex h-screen items-center justify-center bg-surface-base">
      <div className="flex flex-col items-center gap-4">
        <div className="w-10 h-10 rounded-full border-2 border-gold-500 border-t-transparent animate-spin" />
        <p className="text-gray-600 font-mono text-xs tracking-widest">LOADING</p>
      </div>
    </div>
  )
}
