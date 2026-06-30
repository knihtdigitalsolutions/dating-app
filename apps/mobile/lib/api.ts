import axios from 'axios'
import * as SecureStore from 'expo-secure-store'

export const api = axios.create({
  baseURL: process.env.EXPO_PUBLIC_API_URL || 'http://192.168.1.100:3000/api',
})

// 1. Automatically attach the Access Token to every outgoing request
api.interceptors.request.use(async (config) => {
  const token = await SecureStore.getItemAsync('accessToken')
  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
}, (error) => Promise.reject(error))

// 2. Intercept 401 errors and silently refresh tokens
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config

    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true
      try {
        const refreshToken = await SecureStore.getItemAsync('refreshToken')
        if (!refreshToken) throw new Error('No refresh token available')

        // Call the refresh endpoint
        const res = await axios.post(`${api.defaults.baseURL}/auth/refresh`, { refreshToken })
        const { tokens } = res.data.data

        // Save new credentials securely
        await SecureStore.setItemAsync('accessToken', tokens.accessToken)
        await SecureStore.setItemAsync('refreshToken', tokens.refreshToken)

        // Retry original request with new token
        originalRequest.headers.Authorization = `Bearer ${tokens.accessToken}`
        return api(originalRequest)
      } catch (refreshError) {
        // Refresh token expired or invalid -> wipe storage and force log out
        await SecureStore.deleteItemAsync('accessToken')
        await SecureStore.deleteItemAsync('refreshToken')
        // Redirect to login using your router state or store here
        return Promise.reject(refreshError)
      }
    }
    return Promise.reject(error)
  }
)