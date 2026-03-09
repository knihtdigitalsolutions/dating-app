import { create } from 'zustand'
import { api } from '@/lib/api'

interface User {
  id: string; phone?: string; email?: string; hasProfile: boolean; plan: 'FREE' | 'GOLD' | 'PLATINUM'
}

interface AuthState {
  user: User | null
  accessToken: string | null
  isLoading: boolean
  isAuthenticated: boolean
  setTokens: (accessToken: string, refreshToken: string) => Promise<void>
  setUser: (user: User) => void
  logout: () => Promise<void>
  refreshToken: () => Promise<boolean>
  loadFromStorage: () => Promise<void>
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  accessToken: null,
  isLoading: true,
  isAuthenticated: false,

  setTokens: async (accessToken, refreshToken) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('dating_refresh_token', refreshToken)
    }
    set({ accessToken, isAuthenticated: true })
  },

  setUser: (user) => set({ user }),

  logout: async () => {
    const { accessToken } = get()
    const refreshToken = typeof window !== 'undefined' ? localStorage.getItem('dating_refresh_token') : null
    try {
      await api.post('/auth/logout', { refreshToken }, { headers: { Authorization: `Bearer ${accessToken}` } })
    } catch {}
    if (typeof window !== 'undefined') localStorage.removeItem('dating_refresh_token')
    set({ user: null, accessToken: null, isAuthenticated: false })
    window.location.href = '/login'
  },

  refreshToken: async () => {
    const refreshToken = typeof window !== 'undefined' ? localStorage.getItem('dating_refresh_token') : null
    if (!refreshToken) return false
    try {
      const res = await api.post('/auth/refresh', { refreshToken })
      const { tokens } = res.data.data
      if (typeof window !== 'undefined') localStorage.setItem('dating_refresh_token', tokens.refreshToken)
      set({ accessToken: tokens.accessToken })
      return true
    } catch {
      if (typeof window !== 'undefined') localStorage.removeItem('dating_refresh_token')
      set({ user: null, accessToken: null, isAuthenticated: false })
      return false
    }
  },

  loadFromStorage: async () => {
    set({ isLoading: true })
    try {
      const refreshToken = typeof window !== 'undefined' ? localStorage.getItem('dating_refresh_token') : null
      if (!refreshToken) { set({ isLoading: false }); return }
      const res = await api.post('/auth/refresh', { refreshToken })
      const { tokens } = res.data.data
      if (typeof window !== 'undefined') localStorage.setItem('dating_refresh_token', tokens.refreshToken)
      set({ accessToken: tokens.accessToken, isAuthenticated: true })
    } catch {
      if (typeof window !== 'undefined') localStorage.removeItem('dating_refresh_token')
    } finally {
      set({ isLoading: false })
    }
  },
}))
