import axios from 'axios'
import { useAuthStore } from '@/lib/store/auth'

export const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'

export const api = axios.create({
  baseURL: API_URL,
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true,
})

// Attach access token from store on every request
api.interceptors.request.use(async (config) => {
  // Lazy import to avoid circular dependencies
  // const { useAuthStore } = await import('@/lib/store/auth')
  const token = useAuthStore.getState().accessToken
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// Auto-refresh on 401
let isRefreshing = false
let queue: { resolve: (v: any) => void; reject: (e: any) => void }[] = []

api.interceptors.response.use(
  (r) => r,
  async (error) => {
    const orig = error.config
    if (error.response?.status === 401 && !orig._retry) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => queue.push({ resolve, reject }))
          .then(token => { orig.headers.Authorization = `Bearer ${token}`; return api(orig) })
      }
      orig._retry = true
      isRefreshing = true
      const ok = await useAuthStore.getState().refreshToken()
      isRefreshing = false
      if (ok) {
        const token = useAuthStore.getState().accessToken
        queue.forEach(({ resolve }) => resolve(token))
        queue = []
        orig.headers.Authorization = `Bearer ${token}`
        return api(orig)
      }
      queue.forEach(({ reject }) => reject(error))
      queue = []
    }
    return Promise.reject(error)
  }
)
