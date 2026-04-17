import { Github } from 'lucide-react'
import { useState } from 'react'
import axios from 'axios'
import { useAuthStore } from '../store/auth'

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path fill="#4285F4" d="M16.51 8H8.98v3h4.3c-.18 1-.74 1.48-1.6 2.04v2.01h2.6a7.8 7.8 0 002.38-5.88c0-.57-.05-.66-.15-1.18z" />
      <path fill="#34A853" d="M8.98 17c2.16 0 3.97-.72 5.3-1.94l-2.6-2.01a4.8 4.8 0 01-7.18-2.52H1.83v2.07A8 8 0 008.98 17z" />
      <path fill="#FBBC05" d="M4.5 10.52a4.8 4.8 0 010-3.04V5.41H1.83a8 8 0 000 7.18l2.67-2.07z" />
      <path fill="#EA4335" d="M8.98 4.18c1.17 0 2.23.4 3.06 1.2l2.3-2.3A8 8 0 001.83 5.4L4.5 7.49a4.77 4.77 0 014.48-3.31z" />
    </svg>
  )
}

type Mode = 'login' | 'signup'

interface EmailFormState {
  email: string
  name: string
  password: string
  error: string | null
  loading: boolean
}

function EmailAuthForm({ mode, onSuccess }: { mode: Mode; onSuccess: () => void }) {
  const [form, setForm] = useState<EmailFormState>({
    email: '',
    name: '',
    password: '',
    error: null,
    loading: false,
  })
  const { setAuth } = useAuthStore()

  const update = (field: keyof EmailFormState) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((prev) => ({ ...prev, [field]: e.target.value, error: null }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setForm((prev) => ({ ...prev, loading: true, error: null }))

    const endpoint = mode === 'signup' ? '/api/auth/signup' : '/api/auth/login'
    const payload =
      mode === 'signup'
        ? { email: form.email, name: form.name, password: form.password }
        : { email: form.email, password: form.password }

    try {
      const { data } = await axios.post(endpoint, payload, { withCredentials: true })
      setAuth(data.access_token, data.user)
      onSuccess()
    } catch (err: unknown) {
      const message =
        axios.isAxiosError(err) && err.response?.data?.error
          ? err.response.data.error
          : mode === 'signup'
            ? 'アカウント作成に失敗しました'
            : 'ログインに失敗しました'
      setForm((prev) => ({ ...prev, error: message, loading: false }))
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {mode === 'signup' && (
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">名前</label>
          <input
            type="text"
            value={form.name}
            onChange={update('name')}
            required
            autoComplete="name"
            placeholder="山田 太郎"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      )}
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">メールアドレス</label>
        <input
          type="email"
          value={form.email}
          onChange={update('email')}
          required
          autoComplete="email"
          placeholder="you@example.com"
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">パスワード</label>
        <input
          type="password"
          value={form.password}
          onChange={update('password')}
          required
          autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
          placeholder={mode === 'signup' ? '8文字以上' : ''}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {form.error && (
        <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {form.error}
        </p>
      )}

      <button
        type="submit"
        disabled={form.loading}
        className="w-full px-4 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {form.loading
          ? '処理中...'
          : mode === 'signup'
            ? 'アカウント作成'
            : 'ログイン'}
      </button>
    </form>
  )
}

export function LoginPage() {
  const [mode, setMode] = useState<Mode>('login')
  const [showEmailForm, setShowEmailForm] = useState(false)

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-blue-600 mb-1">Nilla</h1>
          <p className="text-sm text-gray-500">Sprint Manager</p>
        </div>

        <div className="space-y-3">
          <a
            href="/api/auth/google"
            className="flex items-center justify-center gap-3 w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          >
            <GoogleIcon />
            Google でログイン
          </a>

          <a
            href="/api/auth/github"
            className="flex items-center justify-center gap-3 w-full px-4 py-2.5 bg-gray-900 rounded-lg text-sm font-medium text-white hover:bg-gray-800 transition-colors"
          >
            <Github size={18} />
            GitHub でログイン
          </a>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-200" />
            </div>
            <div className="relative flex justify-center">
              <span className="px-2 bg-white text-xs text-gray-400">または</span>
            </div>
          </div>

          {!showEmailForm ? (
            <button
              onClick={() => setShowEmailForm(true)}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              メールアドレスで{mode === 'login' ? 'ログイン' : 'アカウント作成'}
            </button>
          ) : (
            <div className="space-y-3">
              <div className="flex gap-1 p-1 bg-gray-100 rounded-lg">
                {(['login', 'signup'] as Mode[]).map((m) => (
                  <button
                    key={m}
                    onClick={() => setMode(m)}
                    className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors ${
                      mode === m
                        ? 'bg-white text-gray-900 shadow-sm'
                        : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    {m === 'login' ? 'ログイン' : 'アカウント作成'}
                  </button>
                ))}
              </div>
              <EmailAuthForm mode={mode} onSuccess={() => {}} />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
