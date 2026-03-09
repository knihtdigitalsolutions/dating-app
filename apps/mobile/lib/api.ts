/**
 * lib/api.ts — Cross-platform HTTP client
 *
 * Cross-platform concerns handled here:
 * - Platform header: backend knows iOS vs Android vs web
 * - Network error detection: "Network Error" vs server error
 * - Token refresh with request queue (prevents concurrent 401 loops)
 * - Timeout: 15s — Android on slow East African mobile networks needs this
 */

import axios, { AxiosError } from 'axios'
import { Platform } from 'react-native'

export const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:4000'

export const api = axios.create({
  baseURL: API_URL,
  timeout: 15000,
  headers: {
    'Content-Type':    'application/json',
    // Tell the backend which platform this request comes from.
    // The security middleware reads X-Expo-Platform to set platform on security events.
    'X-Expo-Platform': Platform.OS,    // 'ios' | 'android' | 'web'
    // Tell the backend the OS version — useful for support debugging
    'X-OS-Version':    String(Platform.Version),
  },
})

// ── Request interceptor — attach access token ────────────
api.interceptors.request.use(async config => {
  const { useAuthStore } = await import('./store/auth')
  const token = useAuthStore.getState().accessToken
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// ── Response interceptor — refresh on 401 ────────────────
// Queue pattern: if a refresh is already in flight, queue other
// 401s instead of issuing duplicate refresh calls.
let isRefreshing = false
let failedQueue: { resolve: (v: string) => void; reject: (e: any) => void }[] = []

const flushQueue = (token: string | null, error?: AxiosError) => {
  failedQueue.forEach(({ resolve, reject }) => {
    if (token) resolve(token)
    else reject(error)
  })
  failedQueue = []
}

api.interceptors.response.use(
  response => response,

  async (error: AxiosError) => {
    const original = error.config as any

    // ── Network error (no internet, DNS failure, timeout) ──
    // On Android this is common on 2G/3G; on iOS it shows on airplane mode.
    // error.response is undefined when there's no network.
    if (!error.response) {
      const message = error.code === 'ECONNABORTED'
        ? 'Request timed out. Check your connection.'
        : 'No internet connection. Please check your network.'
      return Promise.reject(new Error(message))
    }

    // ── 401 — token expired ───────────────────────────────
    if (error.response.status === 401 && !original._retry) {
      if (isRefreshing) {
        // Queue this request until refresh completes
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject })
        }).then(token => {
          original.headers.Authorization = `Bearer ${token}`
          return api(original)
        })
      }

      original._retry = true
      isRefreshing = true

      const { useAuthStore } = await import('./store/auth')
      const success = await useAuthStore.getState().refreshToken()
      isRefreshing = false

      if (success) {
        const newToken = useAuthStore.getState().accessToken!
        flushQueue(newToken)
        original.headers.Authorization = `Bearer ${newToken}`
        return api(original)
      } else {
        flushQueue(null, error)
        return Promise.reject(error)
      }
    }

    return Promise.reject(error)
  },
)
