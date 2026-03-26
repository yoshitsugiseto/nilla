import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { AuthCallbackPage } from '../pages/AuthCallbackPage'

const { mockAxiosGet, mockSetAuth } = vi.hoisted(() => ({
  mockAxiosGet: vi.fn(),
  mockSetAuth: vi.fn(),
}))

vi.mock('axios', () => ({
  default: {
    get: mockAxiosGet,
  },
}))

vi.mock('../store/auth', () => ({
  useAuthStore: () => ({
    setAuth: mockSetAuth,
  }),
}))

describe('AuthCallbackPage', () => {
  beforeEach(() => {
    mockAxiosGet.mockReset()
    mockSetAuth.mockReset()
    window.history.replaceState({}, '', '/auth/callback')
  })

  afterEach(() => {
    vi.restoreAllMocks()
    window.history.replaceState({}, '', '/')
  })

  test('renders mapped OAuth errors without starting token exchange', () => {
    window.history.replaceState({}, '', '/auth/callback?error=invalid_state')

    render(<AuthCallbackPage />)

    expect(
      screen.getByText('セキュリティチェックに失敗しました。もう一度ログインしてください。')
    ).toBeInTheDocument()
    expect(mockAxiosGet).not.toHaveBeenCalled()
  })

  test('redirects home when no code is present', async () => {
    render(<AuthCallbackPage />)

    await waitFor(() => expect(window.location.pathname).toBe('/'))
    expect(mockAxiosGet).not.toHaveBeenCalled()
  })

  test('exchanges code, loads the user, and stores auth state', async () => {
    window.history.replaceState({}, '', '/auth/callback?code=oauth-code')
    mockAxiosGet
      .mockResolvedValueOnce({ data: { access_token: 'access-123' } })
      .mockResolvedValueOnce({
        data: {
          id: 'user-1',
          name: 'Alice',
          email: 'alice@example.com',
          avatar_url: null,
          provider: 'github',
        },
      })

    render(<AuthCallbackPage />)

    await waitFor(() =>
      expect(mockAxiosGet).toHaveBeenNthCalledWith(1, '/api/auth/token?code=oauth-code', {
        withCredentials: true,
      })
    )
    await waitFor(() =>
      expect(mockAxiosGet).toHaveBeenNthCalledWith(2, '/api/auth/me', {
        headers: { Authorization: 'Bearer access-123' },
        withCredentials: true,
      })
    )
    await waitFor(() =>
      expect(mockSetAuth).toHaveBeenCalledWith('access-123', {
        id: 'user-1',
        name: 'Alice',
        email: 'alice@example.com',
        avatar_url: null,
        provider: 'github',
      })
    )
    expect(window.location.pathname).toBe('/')
  })

  test('redirects to session_error when token exchange fails', async () => {
    window.history.replaceState({}, '', '/auth/callback?code=oauth-code')
    mockAxiosGet.mockRejectedValueOnce(new Error('exchange failed'))

    render(<AuthCallbackPage />)

    await waitFor(() =>
      expect(window.location.pathname).toBe('/auth/callback')
    )
    expect(window.location.search).toBe('?error=session_error')
  })
})
