import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { useAuthStore } from '../store/auth'
import type { AuthUser } from '../store/auth'

const initialState = {
  accessToken: null,
  user: null,
  isLoading: true,
}

const sampleUser: AuthUser = {
  id: 'user-1',
  name: 'Alice',
  email: 'alice@example.com',
  avatar_url: null,
  provider: 'github',
}

describe('useAuthStore', () => {
  beforeEach(() => {
    useAuthStore.setState({ ...initialState })
  })

  afterEach(() => {
    useAuthStore.setState({ ...initialState })
  })

  test('has correct initial state', () => {
    const state = useAuthStore.getState()
    expect(state.accessToken).toBeNull()
    expect(state.user).toBeNull()
    expect(state.isLoading).toBe(true)
  })

  test('setAuth updates token, user and sets isLoading to false', () => {
    useAuthStore.getState().setAuth('token-123', sampleUser)

    const state = useAuthStore.getState()
    expect(state.accessToken).toBe('token-123')
    expect(state.user).toEqual(sampleUser)
    expect(state.isLoading).toBe(false)
  })

  test('clearAuth clears token and user and sets isLoading to false', () => {
    useAuthStore.getState().setAuth('token-123', sampleUser)
    useAuthStore.getState().clearAuth()

    const state = useAuthStore.getState()
    expect(state.accessToken).toBeNull()
    expect(state.user).toBeNull()
    expect(state.isLoading).toBe(false)
  })

  test('setAccessToken updates only the token', () => {
    useAuthStore.getState().setAuth('token-123', sampleUser)
    useAuthStore.getState().setAccessToken('token-456')

    const state = useAuthStore.getState()
    expect(state.accessToken).toBe('token-456')
    expect(state.user).toEqual(sampleUser)
    // isLoading should remain unchanged from setAuth
    expect(state.isLoading).toBe(false)
  })

  test('setLoading updates only isLoading', () => {
    useAuthStore.getState().setLoading(false)
    expect(useAuthStore.getState().isLoading).toBe(false)

    useAuthStore.getState().setLoading(true)
    expect(useAuthStore.getState().isLoading).toBe(true)
  })

  test('setLoading does not affect token or user', () => {
    useAuthStore.getState().setAuth('token-123', sampleUser)
    useAuthStore.getState().setLoading(true)

    const state = useAuthStore.getState()
    expect(state.accessToken).toBe('token-123')
    expect(state.user).toEqual(sampleUser)
    expect(state.isLoading).toBe(true)
  })
})
