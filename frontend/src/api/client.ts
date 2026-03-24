import axios from 'axios'
import { useAuthStore } from '../store/auth'

const client = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true, // refresh token cookie のため
})

// リクエストにアクセストークンを付与
client.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// 401 時にリフレッシュを試みる
let isRefreshing = false
let refreshSubscribers: ((token: string) => void)[] = []

client.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config

    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true

      if (!isRefreshing) {
        isRefreshing = true
        try {
          const { data } = await axios.post(
            '/api/auth/refresh',
            {},
            { withCredentials: true }
          )
          const newToken: string = data.access_token
          useAuthStore.getState().setAccessToken(newToken)
          refreshSubscribers.forEach((cb) => cb(newToken))
          refreshSubscribers = []
          isRefreshing = false

          originalRequest.headers.Authorization = `Bearer ${newToken}`
          return client(originalRequest)
        } catch {
          isRefreshing = false
          refreshSubscribers = []
          useAuthStore.getState().clearAuth()
          window.location.href = '/'
          return Promise.reject(error)
        }
      }

      // リフレッシュ中の他リクエストはキューに積む
      return new Promise((resolve) => {
        refreshSubscribers.push((token: string) => {
          originalRequest.headers.Authorization = `Bearer ${token}`
          resolve(client(originalRequest))
        })
      })
    }

    return Promise.reject(error)
  }
)

export default client

export function extractErrorMessage(error: unknown, fallback: string): string {
  if (axios.isAxiosError(error) && error.response?.data?.error) {
    return String(error.response.data.error)
  }
  return fallback
}
