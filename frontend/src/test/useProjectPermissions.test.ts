import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { useProjectPermissions } from '../hooks/useProjectPermissions'
import { useAuthStore } from '../store/auth'
import type { ProjectMember } from '../types'

const { mockGetProjectMembers } = vi.hoisted(() => ({
  mockGetProjectMembers: vi.fn(),
}))

vi.mock('../api/workspaces', () => ({
  getProjectMembers: mockGetProjectMembers,
}))

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
}

function createWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return QueryClientProvider({ client: queryClient, children })
  }
}

const baseMember: ProjectMember = {
  workspace_id: 'workspace-1',
  project_id: 'project-1',
  user_id: 'user-1',
  name: 'Alice',
  email: 'alice@example.com',
  avatar_url: null,
  role: 'editor',
  workspace_role: 'member',
  inherited: true,
  joined_at: '2026-03-01T00:00:00Z',
}

describe('useProjectPermissions', () => {
  beforeEach(() => {
    mockGetProjectMembers.mockReset()
    useAuthStore.setState({
      accessToken: 'access-123',
      user: {
        id: 'user-1',
        name: 'Alice',
        email: 'alice@example.com',
        avatar_url: null,
        provider: 'github',
      },
      isLoading: false,
    })
  })

  afterEach(() => {
    useAuthStore.setState({ accessToken: null, user: null, isLoading: false })
    vi.restoreAllMocks()
  })

  test('returns admin permissions when user has admin role', async () => {
    mockGetProjectMembers.mockResolvedValue([
      { ...baseMember, role: 'admin' },
    ])
    const queryClient = createQueryClient()

    const { result } = renderHook(() => useProjectPermissions('project-1'), {
      wrapper: createWrapper(queryClient),
    })

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.role).toBe('admin')
    expect(result.current.canViewProject).toBe(true)
    expect(result.current.canEditProject).toBe(true)
    expect(result.current.canAdminProject).toBe(true)
  })

  test('returns editor permissions when user has editor role', async () => {
    mockGetProjectMembers.mockResolvedValue([
      { ...baseMember, role: 'editor' },
    ])
    const queryClient = createQueryClient()

    const { result } = renderHook(() => useProjectPermissions('project-1'), {
      wrapper: createWrapper(queryClient),
    })

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.role).toBe('editor')
    expect(result.current.canViewProject).toBe(true)
    expect(result.current.canEditProject).toBe(true)
    expect(result.current.canAdminProject).toBe(false)
  })

  test('returns viewer permissions when user has viewer role', async () => {
    mockGetProjectMembers.mockResolvedValue([
      { ...baseMember, role: 'viewer' },
    ])
    const queryClient = createQueryClient()

    const { result } = renderHook(() => useProjectPermissions('project-1'), {
      wrapper: createWrapper(queryClient),
    })

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.role).toBe('viewer')
    expect(result.current.canViewProject).toBe(true)
    expect(result.current.canEditProject).toBe(false)
    expect(result.current.canAdminProject).toBe(false)
  })

  test('returns owner role normalized to admin', async () => {
    mockGetProjectMembers.mockResolvedValue([
      { ...baseMember, role: 'owner' },
    ])
    const queryClient = createQueryClient()

    const { result } = renderHook(() => useProjectPermissions('project-1'), {
      wrapper: createWrapper(queryClient),
    })

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.role).toBe('admin')
    expect(result.current.canEditProject).toBe(true)
    expect(result.current.canAdminProject).toBe(true)
  })

  test('returns member role normalized to editor', async () => {
    mockGetProjectMembers.mockResolvedValue([
      { ...baseMember, role: 'member' },
    ])
    const queryClient = createQueryClient()

    const { result } = renderHook(() => useProjectPermissions('project-1'), {
      wrapper: createWrapper(queryClient),
    })

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.role).toBe('editor')
    expect(result.current.canEditProject).toBe(true)
    expect(result.current.canAdminProject).toBe(false)
  })

  test('returns no permissions when user is not a member', async () => {
    mockGetProjectMembers.mockResolvedValue([
      { ...baseMember, user_id: 'other-user' },
    ])
    const queryClient = createQueryClient()

    const { result } = renderHook(() => useProjectPermissions('project-1'), {
      wrapper: createWrapper(queryClient),
    })

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.role).toBeUndefined()
    expect(result.current.canViewProject).toBe(false)
    expect(result.current.canEditProject).toBe(false)
    expect(result.current.canAdminProject).toBe(false)
  })

  test('returns no permissions when projectId is null', () => {
    const queryClient = createQueryClient()

    const { result } = renderHook(() => useProjectPermissions(null), {
      wrapper: createWrapper(queryClient),
    })

    // Query should not be enabled, so members default to []
    expect(result.current.role).toBeUndefined()
    expect(result.current.canViewProject).toBe(false)
    expect(result.current.canEditProject).toBe(false)
    expect(result.current.canAdminProject).toBe(false)
    expect(mockGetProjectMembers).not.toHaveBeenCalled()
  })

  test('returns no permissions when projectId is undefined', () => {
    const queryClient = createQueryClient()

    const { result } = renderHook(() => useProjectPermissions(undefined), {
      wrapper: createWrapper(queryClient),
    })

    expect(result.current.canViewProject).toBe(false)
    expect(result.current.canEditProject).toBe(false)
    expect(result.current.canAdminProject).toBe(false)
    expect(mockGetProjectMembers).not.toHaveBeenCalled()
  })
})
