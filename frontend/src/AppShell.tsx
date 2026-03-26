import { lazy, Suspense, useEffect } from 'react'
import axios from 'axios'
import { useAuthStore } from './store/auth'
import { LoginPage } from './pages/LoginPage'

const App = lazy(() => import('./App'))

export function AppShell() {
  const { accessToken, isLoading, setAuth, clearAuth } = useAuthStore()

  useEffect(() => {
    if (accessToken) return

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 5000)

    // ページロード時にリフレッシュトークン (cookie) でアクセストークンを取得
    axios
      .post('/api/auth/refresh', {}, { withCredentials: true, signal: controller.signal })
      .then(({ data }) => {
        const token: string = data.access_token
        return axios
          .get('/api/auth/me', {
            headers: { Authorization: `Bearer ${token}` },
            withCredentials: true,
            signal: controller.signal,
          })
          .then((userRes) => {
            setAuth(token, userRes.data)
          })
      })
      .catch(() => {
        clearAuth()
      })
      .finally(() => {
        clearTimeout(timer)
      })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-400 text-sm">読み込み中...</p>
      </div>
    )
  }

  if (!accessToken) {
    return <LoginPage />
  }

  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
          <p className="text-gray-400 text-sm">読み込み中...</p>
        </div>
      }
    >
      <App />
    </Suspense>
  )
}
