import { useEffect, useState } from 'react'
import axios from 'axios'
import { useAuthStore } from '../store/auth'

const ERROR_MESSAGES: Record<string, string> = {
  invalid_state: 'セキュリティチェックに失敗しました。もう一度ログインしてください。',
  token_exchange_failed: 'OAuthトークンの取得に失敗しました。クライアントIDとシークレットを確認してください。',
  userinfo_failed: 'ユーザー情報の取得に失敗しました。',
  session_error: 'セッションの作成に失敗しました。',
  server_error: 'サーバーエラーが発生しました。',
}

export function AuthCallbackPage() {
  const { setAuth } = useAuthStore()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const token = params.get('token')
    const errorCode = params.get('error')

    if (errorCode) {
      setError(ERROR_MESSAGES[errorCode] ?? `認証エラー: ${errorCode}`)
      return
    }

    if (!token) {
      window.location.href = '/'
      return
    }

    axios
      .get('/api/auth/me', {
        headers: { Authorization: `Bearer ${token}` },
        withCredentials: true,
      })
      .then((res) => {
        setAuth(token, res.data)
        window.location.href = '/'
      })
      .catch(() => {
        setError('ログインに失敗しました。もう一度お試しください。')
      })
  }, [setAuth])

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 w-full max-w-sm text-center">
          <h1 className="text-2xl font-bold text-blue-600 mb-1">Nilla</h1>
          <p className="text-sm text-gray-500 mb-6">Sprint Manager</p>
          <p className="text-sm text-red-600 mb-6">{error}</p>
          <a
            href="/"
            className="inline-block px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700"
          >
            ログインページへ戻る
          </a>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <p className="text-gray-400 text-sm">認証中...</p>
    </div>
  )
}
