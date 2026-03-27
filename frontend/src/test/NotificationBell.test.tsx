import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { NotificationBell } from '../components/Layout/NotificationBell'
import { useAuthStore } from '../store/auth'
import { useAppStore } from '../store'

const {
  mockGetNotifications,
  mockMarkNotificationRead,
  mockMarkAllNotificationsRead,
  mockDeleteNotification,
  mockGetIssue,
  mockUpdateIssue,
  mockGetProject,
  mockUseToast,
} = vi.hoisted(() => ({
  mockGetNotifications: vi.fn(),
  mockMarkNotificationRead: vi.fn(),
  mockMarkAllNotificationsRead: vi.fn(),
  mockDeleteNotification: vi.fn(),
  mockGetIssue: vi.fn(),
  mockUpdateIssue: vi.fn(),
  mockGetProject: vi.fn(),
  mockUseToast: vi.fn(),
}))

vi.mock('../api/notifications', () => ({
  getNotifications: mockGetNotifications,
  markNotificationRead: mockMarkNotificationRead,
  markAllNotificationsRead: mockMarkAllNotificationsRead,
  deleteNotification: mockDeleteNotification,
}))

vi.mock('../api/issues', () => ({
  getIssue: mockGetIssue,
  updateIssue: mockUpdateIssue,
}))

vi.mock('../api/projects', () => ({
  getProject: mockGetProject,
}))

vi.mock('../components/common/useToast', () => ({
  useToast: () => mockUseToast,
}))

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
}

describe('NotificationBell', () => {
  beforeEach(() => {
    mockGetNotifications.mockReset()
    mockMarkNotificationRead.mockReset()
    mockMarkAllNotificationsRead.mockReset()
    mockDeleteNotification.mockReset()
    mockGetIssue.mockReset()
    mockUpdateIssue.mockReset()
    mockGetProject.mockReset()
    mockUseToast.mockReset()

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
      activeProjectId: null,
      activeSprint: null,
      activeWorkspaceId: null,
      pendingOpenIssueId: null,
      pendingOpenIssueTitle: null,
      searchPresets: [],
      boardFilters: {},
    })

    mockGetNotifications.mockResolvedValue([
      {
        id: 'notif-1',
        user_id: 'user-1',
        issue_id: 'issue-1',
        type: 'mention',
        message: 'Issue updated',
        read: false,
        created_at: '2026-03-26T00:00:00Z',
      },
      {
        id: 'notif-2',
        user_id: 'user-1',
        issue_id: null,
        type: 'comment',
        message: 'Comment added',
        read: true,
        created_at: '2026-03-26T01:00:00Z',
      },
    ])
    mockMarkNotificationRead.mockResolvedValue(undefined)
    mockMarkAllNotificationsRead.mockResolvedValue(undefined)
    mockDeleteNotification.mockResolvedValue(undefined)
    mockGetIssue.mockResolvedValue({
      id: 'issue-1',
      project_id: 'project-1',
      title: 'Issue from notification',
      priority: 'high',
      status: 'todo',
    })
    mockUpdateIssue.mockResolvedValue(undefined)
  mockGetProject.mockResolvedValue({
      id: 'project-1',
      workspace_id: 'workspace-1',
    })
  })

  afterEach(() => {
    useAuthStore.setState({ accessToken: null, user: null, isLoading: false })
    useAppStore.setState({
      activeProjectId: null,
      activeSprint: null,
      activeWorkspaceId: null,
      pendingOpenIssueId: null,
      pendingOpenIssueTitle: null,
      searchPresets: [],
      boardFilters: {},
    })
    vi.restoreAllMocks()
  })

  test('clicking a notification stores issue title in shared app state', async () => {
    const user = userEvent.setup()
    const queryClient = createQueryClient()

    render(
      <QueryClientProvider client={queryClient}>
        <NotificationBell />
      </QueryClientProvider>
    )

    await user.click(screen.getByRole('button', { name: '通知' }))
    await user.click(await screen.findByRole('button', { name: /Issue updated/ }))

    await waitFor(() => expect(mockGetIssue).toHaveBeenCalledWith('issue-1'))
    expect(useAppStore.getState().activeWorkspaceId).toBe('workspace-1')
    expect(useAppStore.getState().activeProjectId).toBe('project-1')
    expect(useAppStore.getState().pendingOpenIssueId).toBe('issue-1')
    expect(useAppStore.getState().pendingOpenIssueTitle).toBe('Issue from notification')
  })

  test('filters notifications by type', async () => {
    const user = userEvent.setup()
    const queryClient = createQueryClient()

    render(
      <QueryClientProvider client={queryClient}>
        <NotificationBell />
      </QueryClientProvider>
    )

    await user.click(screen.getByRole('button', { name: '通知' }))
    expect(await screen.findByText('Issue updated')).toBeInTheDocument()
    expect(screen.getByText('Comment added')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'メンション' }))

    expect(screen.getByText('Issue updated')).toBeInTheDocument()
    expect(screen.queryByText('Comment added')).not.toBeInTheDocument()
  })

  test('filters review-ready and overdue notifications', async () => {
    const user = userEvent.setup()
    const queryClient = createQueryClient()

    mockGetNotifications.mockResolvedValue([
      {
        id: 'notif-1',
        user_id: 'user-1',
        issue_id: 'issue-1',
        type: 'review_ready',
        message: 'Review is ready',
        read: false,
        created_at: '2026-03-26T03:00:00Z',
      },
      {
        id: 'notif-2',
        user_id: 'user-1',
        issue_id: 'issue-2',
        type: 'overdue',
        message: 'Issue is overdue',
        read: false,
        created_at: '2026-03-26T04:00:00Z',
      },
    ])

    render(
      <QueryClientProvider client={queryClient}>
        <NotificationBell />
      </QueryClientProvider>
    )

    await user.click(screen.getByRole('button', { name: '通知' }))
    expect(await screen.findByText('Review is ready')).toBeInTheDocument()
    expect(screen.getByText('Issue is overdue')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'レビュー待ち' }))
    expect(screen.getByText('Review is ready')).toBeInTheDocument()
    expect(screen.queryByText('Issue is overdue')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '期限超過' }))
    expect(screen.getByText('Issue is overdue')).toBeInTheDocument()
    expect(screen.queryByText('Review is ready')).not.toBeInTheDocument()
  })

  test('supports quick notification actions', async () => {
    const user = userEvent.setup()
    const queryClient = createQueryClient()

    mockGetNotifications.mockResolvedValue([
      {
        id: 'notif-1',
        user_id: 'user-1',
        issue_id: 'issue-1',
        type: 'assigned',
        message: 'Issue assigned',
        read: false,
        created_at: '2026-03-26T03:00:00Z',
      },
      {
        id: 'notif-2',
        user_id: 'user-1',
        issue_id: 'issue-1',
        type: 'overdue',
        message: 'Issue is overdue',
        read: false,
        created_at: '2026-03-26T04:00:00Z',
      },
    ])

    render(
      <QueryClientProvider client={queryClient}>
        <NotificationBell />
      </QueryClientProvider>
    )

    await user.click(screen.getByRole('button', { name: '通知' }))
    expect(await screen.findByText('Issue assigned')).toBeInTheDocument()
    expect(screen.getByText('Issue is overdue')).toBeInTheDocument()

    await user.click(screen.getAllByRole('button', { name: '担当する' })[0])
    await waitFor(() => expect(mockUpdateIssue).toHaveBeenCalledWith('issue-1', { assignee_id: 'user-1' }))

    await user.click(screen.getByRole('button', { name: '着手する' }))
    await waitFor(() => expect(mockUpdateIssue).toHaveBeenCalledWith('issue-1', { status: 'in_progress' }))

    await user.click(screen.getByRole('button', { name: '優先度を上げる' }))
    await waitFor(() => expect(mockUpdateIssue).toHaveBeenCalledWith('issue-1', { priority: 'critical' }))
  })

  test('shows info toast when start-work action is already applied', async () => {
    const user = userEvent.setup()
    const queryClient = createQueryClient()

    mockGetNotifications.mockResolvedValue([
      {
        id: 'notif-1',
        user_id: 'user-1',
        issue_id: 'issue-1',
        type: 'review_ready',
        message: 'Review is ready',
        read: false,
        created_at: '2026-03-26T04:00:00Z',
      },
    ])
    mockGetIssue.mockResolvedValue({
      id: 'issue-1',
      project_id: 'project-1',
      title: 'Issue from notification',
      priority: 'high',
      status: 'in_progress',
    })

    render(
      <QueryClientProvider client={queryClient}>
        <NotificationBell />
      </QueryClientProvider>
    )

    await user.click(screen.getByRole('button', { name: '通知' }))
    expect(await screen.findByText('Review is ready')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '着手する' }))
    await waitFor(() => expect(mockUseToast).toHaveBeenCalledWith('すでに進行中です', 'info'))
  })

  test('shows info toast when assigning to self again', async () => {
    const user = userEvent.setup()
    const queryClient = createQueryClient()

    mockGetNotifications.mockResolvedValue([
      {
        id: 'notif-1',
        user_id: 'user-1',
        issue_id: 'issue-1',
        type: 'assigned',
        message: 'Issue assigned',
        read: false,
        created_at: '2026-03-26T03:00:00Z',
      },
    ])
    mockGetIssue.mockResolvedValue({
      id: 'issue-1',
      project_id: 'project-1',
      title: 'Issue from notification',
      priority: 'high',
      status: 'todo',
      assignee_id: 'user-1',
    })

    render(
      <QueryClientProvider client={queryClient}>
        <NotificationBell />
      </QueryClientProvider>
    )

    await user.click(screen.getByRole('button', { name: '通知' }))
    await user.click(screen.getByRole('button', { name: '担当する' }))
    await waitFor(() => expect(mockUseToast).toHaveBeenCalledWith('すでに自分が担当です', 'info'))
  })

  test('shows localized notification badges', async () => {
    const user = userEvent.setup()
    const queryClient = createQueryClient()

    render(
      <QueryClientProvider client={queryClient}>
        <NotificationBell />
      </QueryClientProvider>
    )

    await user.click(screen.getByRole('button', { name: '通知' }))

    expect(await screen.findByText('Issue updated')).toBeInTheDocument()
    expect(screen.getAllByText('メンション').length).toBeGreaterThan(1)
    expect(screen.getAllByText('コメント').length).toBeGreaterThan(1)
  })

  test('uses wrapped filter chips instead of horizontal scrolling', async () => {
    const user = userEvent.setup()
    const queryClient = createQueryClient()

    render(
      <QueryClientProvider client={queryClient}>
        <NotificationBell />
      </QueryClientProvider>
    )

    await user.click(screen.getByRole('button', { name: '通知' }))

    await screen.findByText('絞り込み')
    const filterChips = screen.getByLabelText('通知フィルター')

    expect(filterChips).toHaveClass('flex-wrap')
    expect(filterChips).not.toHaveClass('overflow-x-auto')
  })

  test('prioritizes unread direct notifications before older read comments', async () => {
    const user = userEvent.setup()
    const queryClient = createQueryClient()

    mockGetNotifications.mockResolvedValue([
      {
        id: 'notif-1',
        user_id: 'user-1',
        issue_id: 'issue-1',
        type: 'comment',
        message: 'Read comment',
        read: true,
        created_at: '2026-03-26T02:00:00Z',
      },
      {
        id: 'notif-2',
        user_id: 'user-1',
        issue_id: 'issue-2',
        type: 'assigned',
        message: 'Unread assign',
        read: false,
        created_at: '2026-03-26T01:00:00Z',
      },
      {
        id: 'notif-3',
        user_id: 'user-1',
        issue_id: 'issue-3',
        type: 'mention',
        message: 'Unread mention',
        read: false,
        created_at: '2026-03-26T00:00:00Z',
      },
    ])

    render(
      <QueryClientProvider client={queryClient}>
        <NotificationBell />
      </QueryClientProvider>
    )

    await user.click(screen.getByRole('button', { name: '通知' }))
    const notificationList = await screen.findByLabelText('通知一覧')
    const buttons = within(notificationList).getAllByRole('button', { name: /通知を開く:/ })

    expect(buttons.map(button => button.getAttribute('aria-label'))).toEqual([
      '通知を開く: Unread mention',
      '通知を開く: Unread assign',
      '通知を開く: Read comment',
    ])
  })
})
