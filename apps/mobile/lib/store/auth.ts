import { create } from 'zustand'
import { Platform } from 'react-native'
import * as SecureStore from 'expo-secure-store'
import { api } from '../api'  // ← fixed: was '../lib/api'

// ── SecureStore web fallback ───────────────────────────────
// expo-secure-store only works on iOS/Android.
// On web (Expo web build), fall back to localStorage.
const storage = {
  async getItem(key: string): Promise<string | null> {
    if (Platform.OS === 'web') {
      return typeof window !== 'undefined' ? window.localStorage.getItem(key) : null
    }
    return SecureStore.getItemAsync(key)
  },
  async setItem(key: string, value: string): Promise<void> {
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined') window.localStorage.setItem(key, value)
      return
    }
    await SecureStore.setItemAsync(key, value)
  },
  async removeItem(key: string): Promise<void> {
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined') window.localStorage.removeItem(key)
      return
    }
    await SecureStore.deleteItemAsync(key)
  },
}

interface User {
  id: string
  phone?: string
  email?: string
  hasProfile: boolean
  plan: 'FREE' | 'GOLD' | 'PLATINUM'
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
    await storage.setItem('refreshToken', refreshToken)
    set({ accessToken, isAuthenticated: true })
  },

  setUser: (user) => set({ user }),

  logout: async () => {
    const { accessToken } = get()
    const refreshToken = await storage.getItem('refreshToken')
    try {
      await api.post('/auth/logout', { refreshToken }, {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
    } catch {}
    await storage.removeItem('refreshToken')
    set({ user: null, accessToken: null, isAuthenticated: false })
  },

  refreshToken: async () => {
    const refreshToken = await storage.getItem('refreshToken')
    if (!refreshToken) return false
    try {
      const res = await api.post('/auth/refresh', { refreshToken })
      const { tokens } = res.data.data
      await storage.setItem('refreshToken', tokens.refreshToken)
      set({ accessToken: tokens.accessToken })
      return true
    } catch {
      await storage.removeItem('refreshToken')
      set({ user: null, accessToken: null, isAuthenticated: false })
      return false
    }
  },

  loadFromStorage: async () => {
    set({ isLoading: true })
    try {
      const refreshToken = await storage.getItem('refreshToken')
      if (!refreshToken) return
      const res = await api.post('/auth/refresh', { refreshToken })
      const { tokens } = res.data.data
      await storage.setItem('refreshToken', tokens.refreshToken)
      set({ accessToken: tokens.accessToken, isAuthenticated: true })
    } catch {
      await storage.removeItem('refreshToken')
    } finally {
      set({ isLoading: false })
    }
  },
}))
