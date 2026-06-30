// apps/mobile/src/lib/api.ts
import axios from 'axios'
import * as SecureStore from 'expo-secure-store'

export const api = axios.create({
  baseURL: 'http://192.168.56.1:3001', // Your Fastify local network interface hook
  headers: {
    'x-client-platform': 'mobile',
    'Content-Type': 'application/json'
  }
})

// Automatically attach Access Tokens to outbound requests
api.interceptors.request.use(async (config) => {
  const token = await SecureStore.getItemAsync('access_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// Handle token expiration challenges silently in the background
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true
      
      try {
        const refreshToken = await SecureStore.getItemAsync('refresh_token')
        const res = await axios.post('http://192.168.56.1:3001/auth/refresh', { refreshToken })
        
        const { accessToken: newAccess, refreshToken: newRefresh } = res.data.data.tokens
        
        await SecureStore.setItemAsync('access_token', newAccess)
        await SecureStore.setItemAsync('refresh_token', newRefresh)
        
        originalRequest.headers.Authorization = `Bearer ${newAccess}`
        return api(originalRequest)
      } catch {
        // Refresh token has also expired; wipe local vault memory and boot to login screen
        await SecureStore.deleteItemAsync('access_token')
        await SecureStore.deleteItemAsync('refresh_token')
      }
    }
    return Promise.reject(error)
  }
)