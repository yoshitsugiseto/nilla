import { create } from 'zustand'

export interface AuthUser {
  id: string
  name: string
  email: string | null
  avatar_url: string | null
  provider: string
}

interface AuthState {
  accessToken: string | null
  user: AuthUser | null
  isLoading: boolean
  setAuth: (token: string, user: AuthUser) => void
  setAccessToken: (token: string) => void
  clearAuth: () => void
  setLoading: (loading: boolean) => void
}

// アクセストークンはメモリのみ保持 (localStorageには保存しない)
export const useAuthStore = create<AuthState>()((set) => ({
  accessToken: null,
  user: null,
  isLoading: true,
  setAuth: (token, user) => set({ accessToken: token, user, isLoading: false }),
  setAccessToken: (token) => set({ accessToken: token }),
  clearAuth: () => set({ accessToken: null, user: null, isLoading: false }),
  setLoading: (loading) => set({ isLoading: loading }),
}))
