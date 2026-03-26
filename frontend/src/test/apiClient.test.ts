import {
  afterEach,
  beforeEach,
  describe,
  expect,
  test,
  vi,
  type MockedFunction,
} from 'vitest'
import axios, {
  AxiosHeaders,
  type AxiosAdapter,
  type AxiosInstance,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from 'axios'
import client, { createApiClient, extractErrorMessage } from '../api/client'
import { getProjects } from '../api/projects'
import { useAuthStore } from '../store/auth'

type MockAuthStore = {
  getState: () => {
    accessToken: string | null
    setAccessToken: (token: string) => void
    clearAuth: () => void
  }
  state: {
    accessToken: string | null
    clearAuthCalls: number
  }
}

function createResponse<T>(
  config: InternalAxiosRequestConfig,
  status: number,
  data: T
): AxiosResponse<T> {
  return {
    data,
    status,
    statusText: status >= 400 ? 'Error' : 'OK',
    headers: {},
    config,
  }
}

function createRejectedResponse<T>(
  config: InternalAxiosRequestConfig,
  status: number,
  data: T
): Promise<never> {
  const response = createResponse(config, status, data)
  return Promise.reject(
    new axios.AxiosError(
      `Request failed with status code ${status}`,
      undefined,
      config,
      undefined,
      response
    )
  )
}

function readAuthorizationHeader(config: InternalAxiosRequestConfig): string | undefined {
  const value = AxiosHeaders.from(config.headers ?? {}).get('Authorization')
  return typeof value === 'string' ? value : undefined
}

function createMockAuthStore(initialToken: string | null): MockAuthStore {
  const state = {
    accessToken: initialToken,
    clearAuthCalls: 0,
  }

  return {
    state,
    getState: () => ({
      accessToken: state.accessToken,
      setAccessToken: (token: string) => {
        state.accessToken = token
      },
      clearAuth: () => {
        state.accessToken = null
        state.clearAuthCalls += 1
      },
    }),
  }
}

function createTestClient(adapter: AxiosAdapter): AxiosInstance {
  return axios.create({
    baseURL: '/api',
    headers: { 'Content-Type': 'application/json' },
    withCredentials: true,
    adapter,
  })
}

describe('api client', () => {
  let originalAdapter: AxiosInstance['defaults']['adapter']

  beforeEach(() => {
    originalAdapter = client.defaults.adapter
    useAuthStore.setState({ accessToken: null, user: null, isLoading: false })
  })

  afterEach(() => {
    client.defaults.adapter = originalAdapter
    useAuthStore.setState({ accessToken: null, user: null, isLoading: false })
    vi.restoreAllMocks()
  })

  test('getProjects attaches bearer token and workspace query params', async () => {
    useAuthStore.setState({ accessToken: 'access-123' })

    let receivedConfig: InternalAxiosRequestConfig | null = null
    let receivedParams: unknown = null
    const adapter: AxiosAdapter = async (config) => {
      receivedConfig = config
      receivedParams = config.params
      return createResponse(config, 200, [])
    }

    client.defaults.adapter = adapter

    const projects = await getProjects('workspace-001')

    expect(projects).toEqual([])
    expect(receivedConfig).not.toBeNull()
    expect(readAuthorizationHeader(receivedConfig!)).toBe('Bearer access-123')
    expect(receivedParams).toEqual({ workspace_id: 'workspace-001' })
  })

  test('401 response refreshes token and retries the original request', async () => {
    const authStore = createMockAuthStore('expired-token')
    const refreshAccessToken = vi.fn().mockResolvedValue('fresh-token')
    const onAuthFailure = vi.fn()

    let requestCount = 0
    const adapter: AxiosAdapter = async (config) => {
      requestCount += 1

      if (requestCount === 1) {
        return createRejectedResponse(config, 401, { error: 'expired' })
      }

      expect(readAuthorizationHeader(config)).toBe('Bearer fresh-token')
      return createResponse(config, 200, [{ id: 'project-1' }])
    }

    const apiClient = createApiClient({
      authStore,
      client: createTestClient(adapter),
      refreshAccessToken,
      onAuthFailure,
    })

    const response = await apiClient.get('/projects')

    expect(response.data).toEqual([{ id: 'project-1' }])
    expect(requestCount).toBe(2)
    expect(authStore.state.accessToken).toBe('fresh-token')
    expect(refreshAccessToken).toHaveBeenCalledTimes(1)
    expect(onAuthFailure).not.toHaveBeenCalled()
  })

  test('refresh failure clears auth and triggers auth failure handler', async () => {
    const authStore = createMockAuthStore('expired-token')
    const refreshAccessToken = vi.fn().mockRejectedValue(new Error('refresh failed'))
    const onAuthFailure = vi.fn()

    const apiClient = createApiClient({
      authStore,
      client: createTestClient(async (config) => createRejectedResponse(config, 401, { error: 'expired' })),
      refreshAccessToken,
      onAuthFailure,
    })

    await expect(apiClient.get('/projects')).rejects.toMatchObject({
      response: { status: 401 },
    })

    expect(authStore.state.accessToken).toBeNull()
    expect(authStore.state.clearAuthCalls).toBe(1)
    expect(refreshAccessToken).toHaveBeenCalledTimes(1)
    expect(onAuthFailure).toHaveBeenCalledTimes(1)
  })

  test.each([
    { status: 403, errorMessage: 'forbidden' },
    { status: 500, errorMessage: 'internal server error' },
  ])(
    'non-401 status $status is propagated without refresh side effects',
    async ({ status, errorMessage }) => {
      const authStore = createMockAuthStore('stable-token')
      const refreshAccessToken = vi.fn() as MockedFunction<() => Promise<string>>
      const onAuthFailure = vi.fn()

      const apiClient = createApiClient({
        authStore,
        client: createTestClient(async (config) => createRejectedResponse(config, status, { error: errorMessage })),
        refreshAccessToken,
        onAuthFailure,
      })

      try {
        await apiClient.get('/projects')
        throw new Error('request should have failed')
      } catch (error) {
        expect(axios.isAxiosError(error)).toBe(true)
        if (!axios.isAxiosError(error)) {
          throw error
        }
        expect(error.response?.status).toBe(status)
        expect(extractErrorMessage(error, 'fallback')).toBe(errorMessage)
      }

      expect(authStore.state.accessToken).toBe('stable-token')
      expect(authStore.state.clearAuthCalls).toBe(0)
      expect(refreshAccessToken).not.toHaveBeenCalled()
      expect(onAuthFailure).not.toHaveBeenCalled()
    }
  )
})
