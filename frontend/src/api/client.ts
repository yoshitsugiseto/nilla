import axios, {
  AxiosHeaders,
  type AxiosInstance,
  type InternalAxiosRequestConfig,
} from 'axios'
import { useAuthStore } from '../store/auth'

type AuthStoreSnapshot = {
  accessToken: string | null
  setAccessToken: (token: string) => void
  clearAuth: () => void
}

type AuthStoreLike = {
  getState: () => AuthStoreSnapshot
}

type RefreshSubscriber = {
  resolve: (token: string) => void
  reject: (error: unknown) => void
}

type RetriableRequestConfig = InternalAxiosRequestConfig & {
  _retry?: boolean
}

type CreateApiClientOptions = {
  authStore?: AuthStoreLike
  client?: AxiosInstance
  refreshAccessToken?: () => Promise<string>
  onAuthFailure?: () => void
}

function setAuthorizationHeader(
  config: { headers?: InternalAxiosRequestConfig['headers'] },
  token: string
): void {
  const headers = AxiosHeaders.from(config.headers ?? {})
  headers.set('Authorization', `Bearer ${token}`)
  config.headers = headers
}

async function defaultRefreshAccessToken(): Promise<string> {
  const { data } = await axios.post(
    '/api/auth/refresh',
    {},
    { withCredentials: true }
  )
  return data.access_token as string
}

function defaultOnAuthFailure(): void {
  window.location.href = '/'
}

export function createApiClient(options: CreateApiClientOptions = {}): AxiosInstance {
  const authStore = options.authStore ?? useAuthStore
  const client = options.client ?? axios.create({
    baseURL: '/api',
    headers: { 'Content-Type': 'application/json' },
    withCredentials: true,
  })
  const refreshAccessToken = options.refreshAccessToken ?? defaultRefreshAccessToken
  const onAuthFailure = options.onAuthFailure ?? defaultOnAuthFailure

  let isRefreshing = false
  let refreshSubscribers: RefreshSubscriber[] = []

  client.interceptors.request.use((config) => {
    const token = authStore.getState().accessToken
    if (token) {
      setAuthorizationHeader(config, token)
    }
    return config
  })

  client.interceptors.response.use(
    (response) => response,
    async (error) => {
      const originalRequest = error.config as RetriableRequestConfig | undefined

      if (
        error.response?.status !== 401 ||
        !originalRequest ||
        originalRequest._retry
      ) {
        return Promise.reject(error)
      }

      originalRequest._retry = true

      if (!isRefreshing) {
        isRefreshing = true
        try {
          const newToken = await refreshAccessToken()
          authStore.getState().setAccessToken(newToken)

          refreshSubscribers.forEach((subscriber) => subscriber.resolve(newToken))
          refreshSubscribers = []
          isRefreshing = false

          setAuthorizationHeader(originalRequest, newToken)
          return client(originalRequest)
        } catch (refreshError) {
          isRefreshing = false
          refreshSubscribers.forEach((subscriber) => subscriber.reject(refreshError))
          refreshSubscribers = []
          authStore.getState().clearAuth()
          onAuthFailure()
          return Promise.reject(error)
        }
      }

      return new Promise((resolve, reject) => {
        refreshSubscribers.push({
          resolve: (token: string) => {
            setAuthorizationHeader(originalRequest, token)
            resolve(client(originalRequest))
          },
          reject,
        })
      })
    }
  )

  return client
}

const client = createApiClient()

export default client

export function extractErrorMessage(error: unknown, fallback: string): string {
  if (axios.isAxiosError(error) && error.response?.data?.error) {
    return String(error.response.data.error)
  }
  return fallback
}
