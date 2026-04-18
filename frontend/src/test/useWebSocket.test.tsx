import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, waitFor } from '@testing-library/react'
import type { ReactElement } from 'react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { useWebSocket } from '../hooks/useWebSocket'
import { useAppStore } from '../store'
import { useAuthStore } from '../store/auth'

const { mockAxiosPost } = vi.hoisted(() => ({
  mockAxiosPost: vi.fn(),
}))

vi.mock('axios', () => ({
  default: {
    post: mockAxiosPost,
  },
}))

type MockSocketInstance = {
  url: string
  onopen: (() => void) | null
  onmessage: ((event: { data: string }) => void) | null
  onclose: ((event: { code: number }) => void) | null
  onerror: (() => void) | null
  close: ReturnType<typeof vi.fn>
}

class MockWebSocket {
  static instances: MockSocketInstance[] = []

  url: string
  onopen: (() => void) | null = null
  onmessage: ((event: { data: string }) => void) | null = null
  onclose: ((event: { code: number }) => void) | null = null
  onerror: (() => void) | null = null
  close = vi.fn()

  constructor(url: string) {
    this.url = url
    MockWebSocket.instances.push(this)
  }

  static reset() {
    MockWebSocket.instances = []
  }
}

function TestComponent(): ReactElement | null {
  useWebSocket()
  return null
}

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
}

function renderHookComponent(queryClient: QueryClient) {
  return render(
    <QueryClientProvider client={queryClient}>
      <TestComponent />
    </QueryClientProvider>
  )
}

describe('useWebSocket', () => {
  beforeEach(() => {
    vi.useRealTimers()
    MockWebSocket.reset()
    mockAxiosPost.mockReset()
    vi.stubGlobal('WebSocket', MockWebSocket)
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
    useAppStore.setState({
      activeProjectId: 'project-1',
      activeSprint: null,
      activeWorkspaceId: 'workspace-1',
      pendingOpenIssueId: null,
      pendingOpenIssueTitle: null,
      boardFilters: {},
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    useAuthStore.setState({ accessToken: null, user: null, isLoading: false })
    useAppStore.setState({
      activeProjectId: null,
      activeSprint: null,
      activeWorkspaceId: null,
      pendingOpenIssueId: null,
      pendingOpenIssueTitle: null,
      boardFilters: {},
    })
    vi.restoreAllMocks()
  })

  test('fetches a ticket before opening the websocket and includes workspace scope', async () => {
    let resolveTicket: ((value: { data: { ticket: string } }) => void) | undefined
    const ticketPromise = new Promise<{ data: { ticket: string } }>((resolve) => {
      resolveTicket = resolve
    })
    mockAxiosPost.mockReturnValue(ticketPromise)
    const queryClient = createQueryClient()

    renderHookComponent(queryClient)

    await waitFor(() =>
      expect(mockAxiosPost).toHaveBeenCalledWith('/api/auth/ws-ticket', null, {
        headers: { Authorization: 'Bearer access-123' },
      })
    )
    expect(MockWebSocket.instances).toHaveLength(0)

    resolveTicket?.({ data: { ticket: 'ticket-123' } })

    await waitFor(() => expect(MockWebSocket.instances).toHaveLength(1))
    expect(MockWebSocket.instances[0]?.url).toContain('/api/ws?ticket=ticket-123')
    expect(MockWebSocket.instances[0]?.url).toContain('workspace_id=workspace-1')
  })

  test('invalidates the expected queries for scoped realtime events', async () => {
    mockAxiosPost.mockResolvedValue({ data: { ticket: 'ticket-123' } })
    const queryClient = createQueryClient()
    const invalidateQueriesSpy = vi.spyOn(queryClient, 'invalidateQueries')
    const setQueryDataSpy = vi.spyOn(queryClient, 'setQueryData')
    const setQueriesDataSpy = vi.spyOn(queryClient, 'setQueriesData')

    renderHookComponent(queryClient)

    await waitFor(() => expect(MockWebSocket.instances).toHaveLength(1))
    const socket = MockWebSocket.instances[0]
    if (!socket?.onmessage) {
      throw new Error('websocket message handler not registered')
    }

    socket.onmessage({
      data: JSON.stringify({
        type: 'issue.updated',
        project_id: 'project-1',
        issue_id: 'issue-1',
        workspace_id: 'workspace-1',
        issue: {
          id: 'issue-1',
          project_id: 'project-1',
          sprint_id: null,
          parent_id: null,
          epic_id: null,
          epic_title: null,
          number: 1,
          title: 'Realtime issue',
          description: null,
          type: 'task',
          status: 'todo',
          priority: 'medium',
          points: null,
          assignee_id: null,
          assignee_name: null,
          assignee_avatar_url: null,
          labels: [],
          position: 0,
          due_date: null,
          created_at: '2026-03-01T00:00:00Z',
          updated_at: '2026-03-01T00:00:00Z',
        },
      }),
    })
    socket.onmessage({ data: JSON.stringify({ type: 'comment.created', issue_id: 'issue-1', workspace_id: 'workspace-1' }) })
    socket.onmessage({
      data: JSON.stringify({
        type: 'sprint.updated',
        project_id: 'project-1',
        sprint_id: 'sprint-1',
        workspace_id: 'workspace-1',
        sprint: {
          id: 'sprint-1',
          project_id: 'project-1',
          name: 'Sprint A',
          goal: null,
          status: 'active',
          start_date: '2026-03-01',
          end_date: '2026-03-14',
          created_at: '2026-03-01T00:00:00Z',
          updated_at: '2026-03-01T00:00:00Z',
        },
      }),
    })
    socket.onmessage({ data: JSON.stringify({ type: 'notification.new', user_id: 'user-1' }) })
    socket.onmessage({ data: JSON.stringify({ type: 'attachment.created', issue_id: 'issue-1', workspace_id: 'workspace-1' }) })

    expect(setQueryDataSpy).toHaveBeenCalledWith(
      ['issue', 'issue-1'],
      expect.objectContaining({ id: 'issue-1', title: 'Realtime issue' })
    )
    expect(setQueriesDataSpy).toHaveBeenCalledWith(
      { queryKey: ['issues', 'project-1'] },
      expect.any(Function)
    )
    expect(setQueriesDataSpy).toHaveBeenCalledWith(
      { queryKey: ['sprints', 'project-1'] },
      expect.any(Function)
    )
    expect(invalidateQueriesSpy).toHaveBeenCalledWith({ queryKey: ['comments', 'issue-1'] })
    expect(invalidateQueriesSpy).toHaveBeenCalledWith({ queryKey: ['activity', 'issue-1'] })
    expect(invalidateQueriesSpy).toHaveBeenCalledWith({ queryKey: ['issues', 'project-1'] })
    expect(invalidateQueriesSpy).toHaveBeenCalledWith({ queryKey: ['notifications'] })
    expect(invalidateQueriesSpy).toHaveBeenCalledWith({ queryKey: ['attachments', 'issue-1'] })
  })

  test('ignores events from a different workspace', async () => {
    mockAxiosPost.mockResolvedValue({ data: { ticket: 'ticket-123' } })
    const queryClient = createQueryClient()
    const invalidateQueriesSpy = vi.spyOn(queryClient, 'invalidateQueries')

    renderHookComponent(queryClient)

    await waitFor(() => expect(MockWebSocket.instances).toHaveLength(1))
    const socket = MockWebSocket.instances[0]
    if (!socket?.onmessage) {
      throw new Error('websocket message handler not registered')
    }

    socket.onmessage({ data: JSON.stringify({ type: 'issue.updated', project_id: 'project-1', workspace_id: 'workspace-2' }) })

    expect(invalidateQueriesSpy).not.toHaveBeenCalled()
  })

  test('does not reconnect after an unauthorized close', async () => {
    mockAxiosPost.mockResolvedValue({ data: { ticket: 'ticket-123' } })
    const queryClient = createQueryClient()
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout')

    renderHookComponent(queryClient)

    await waitFor(() => expect(MockWebSocket.instances).toHaveLength(1))
    const socket = MockWebSocket.instances[0]
    if (!socket?.onclose) {
      throw new Error('websocket close handler not registered')
    }

    setTimeoutSpy.mockClear()
    socket.onclose({ code: 1008 })

    expect(setTimeoutSpy).not.toHaveBeenCalled()
    expect(mockAxiosPost).toHaveBeenCalledTimes(1)
    expect(MockWebSocket.instances).toHaveLength(1)
  })
})
