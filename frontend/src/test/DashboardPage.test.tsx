import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { DashboardPage } from '../pages/DashboardPage'
import { useAppStore } from '../store'
import { useAuthStore } from '../store/auth'

const {
  mockGetIssues,
  mockGetActivity,
  mockGetSprints,
  mockGetProjectMembers,
} = vi.hoisted(() => ({
  mockGetIssues: vi.fn(),
  mockGetActivity: vi.fn(),
  mockGetSprints: vi.fn(),
  mockGetProjectMembers: vi.fn(),
}))

vi.mock('../api/issues', () => ({
  getIssues: mockGetIssues,
  getActivity: mockGetActivity,
}))

vi.mock('../api/sprints', () => ({
  getSprints: mockGetSprints,
}))

vi.mock('../api/workspaces', () => ({
  getProjectMembers: mockGetProjectMembers,
}))

vi.mock('../components/Issue/IssueDetail', () => ({
  IssueDetail: () => <div>IssueDetail</div>,
}))

vi.mock('../components/Board/VelocityChart', () => ({
  VelocityChart: ({ projectId }: { projectId: string }) => <div>VelocityChart:{projectId}</div>,
}))

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
}

describe('DashboardPage', () => {
  beforeEach(() => {
    mockGetIssues.mockReset()
    mockGetActivity.mockReset()
    mockGetSprints.mockReset()
    mockGetProjectMembers.mockReset()
    mockGetIssues.mockResolvedValue([])
    mockGetActivity.mockResolvedValue([])
    mockGetSprints.mockResolvedValue([])
    mockGetProjectMembers.mockResolvedValue([
      {
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
      },
    ])
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
      searchPresets: [],
      boardFilters: {},
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

  test('shows getting started guidance when the project is still empty', async () => {
    const queryClient = createQueryClient()

    render(
      <QueryClientProvider client={queryClient}>
        <DashboardPage />
      </QueryClientProvider>
    )

    await waitFor(() => expect(mockGetIssues).toHaveBeenCalledWith('project-1'))
    expect(await screen.findByLabelText('はじめての使い方')).toBeInTheDocument()
    expect(screen.getByText('1. バックログ')).toBeInTheDocument()
    expect(screen.getByText('2. スプリント')).toBeInTheDocument()
    expect(screen.getByText('3. ボード')).toBeInTheDocument()
  })

  test('distinguishes projects with no high-priority issues from completed ones', async () => {
    const queryClient = createQueryClient()

    mockGetIssues.mockResolvedValue([
      {
        id: 'issue-1',
        project_id: 'project-1',
        sprint_id: null,
        parent_id: null,
        epic_id: null,
        epic_title: null,
        number: 1,
        title: 'Normal issue',
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
    ])

    render(
      <QueryClientProvider client={queryClient}>
        <DashboardPage />
      </QueryClientProvider>
    )

    await waitFor(() => expect(mockGetIssues).toHaveBeenCalledWith('project-1'))
    const emptyState = await screen.findByText('High / Critical のイシューはありません')
    expect(emptyState).toHaveClass('text-gray-400')
    expect(emptyState).toHaveClass('italic')
    expect(screen.queryByText('すべて対応済みです')).not.toBeInTheDocument()
  })

  test('shows delivery snapshots and recent sprint trend widgets', async () => {
    const queryClient = createQueryClient()

    mockGetIssues.mockResolvedValue([
      {
        id: 'issue-done-1',
        project_id: 'project-1',
        sprint_id: 'sprint-1',
        parent_id: null,
        epic_id: null,
        epic_title: null,
        number: 1,
        title: 'Done one',
        description: null,
        type: 'task',
        status: 'done',
        priority: 'medium',
        points: 5,
        assignee_id: 'user-1',
        assignee_name: 'Alice',
        assignee_avatar_url: null,
        labels: [],
        position: 0,
        due_date: null,
        created_at: '2026-03-15T00:00:00Z',
        updated_at: '2026-03-18T00:00:00Z',
      },
      {
        id: 'issue-done-2',
        project_id: 'project-1',
        sprint_id: 'sprint-1',
        parent_id: null,
        epic_id: null,
        epic_title: null,
        number: 2,
        title: 'Done two',
        description: null,
        type: 'bug',
        status: 'done',
        priority: 'high',
        points: 8,
        assignee_id: 'user-1',
        assignee_name: 'Alice',
        assignee_avatar_url: null,
        labels: [],
        position: 1000,
        due_date: null,
        created_at: '2026-03-19T00:00:00Z',
        updated_at: '2026-03-22T00:00:00Z',
      },
      {
        id: 'issue-open',
        project_id: 'project-1',
        sprint_id: 'sprint-1',
        parent_id: null,
        epic_id: null,
        epic_title: null,
        number: 3,
        title: 'Needs review',
        description: null,
        type: 'story',
        status: 'in_review',
        priority: 'critical',
        points: 3,
        assignee_id: null,
        assignee_name: null,
        assignee_avatar_url: null,
        labels: [],
        position: 2000,
        due_date: '2026-03-01',
        created_at: '2026-03-10T00:00:00Z',
        updated_at: '2026-03-23T00:00:00Z',
      },
    ])
    mockGetSprints.mockResolvedValue([
      {
        id: 'sprint-1',
        project_id: 'project-1',
        name: 'Sprint Alpha',
        goal: 'Ship reporting',
        status: 'active',
        start_date: '2026-03-14',
        end_date: '2026-03-28',
        created_at: '2026-03-01T00:00:00Z',
        updated_at: '2026-03-01T00:00:00Z',
      },
    ])
    mockGetActivity.mockImplementation(async (issueId: string) => {
      if (issueId === 'issue-done-1') {
        return [
          {
            id: 'activity-1',
            issue_id: issueId,
            field: 'status',
            old_value: 'todo',
            new_value: 'in_progress',
            created_at: '2026-03-16T00:00:00Z',
          },
          {
            id: 'activity-2',
            issue_id: issueId,
            field: 'status',
            old_value: 'in_progress',
            new_value: 'done',
            created_at: '2026-03-18T00:00:00Z',
          },
        ]
      }
      if (issueId === 'issue-done-2') {
        return [
          {
            id: 'activity-3',
            issue_id: issueId,
            field: 'status',
            old_value: 'todo',
            new_value: 'in_progress',
            created_at: '2026-03-20T00:00:00Z',
          },
          {
            id: 'activity-4',
            issue_id: issueId,
            field: 'status',
            old_value: 'in_progress',
            new_value: 'done',
            created_at: '2026-03-22T00:00:00Z',
          },
        ]
      }
      return []
    })

    render(
      <QueryClientProvider client={queryClient}>
        <DashboardPage />
      </QueryClientProvider>
    )

    await waitFor(() => expect(mockGetIssues).toHaveBeenCalledWith('project-1'))
    expect(await screen.findByLabelText('デリバリースナップショット')).toBeInTheDocument()
    expect(screen.getByText('13pt 完了')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByText('2日')).toBeInTheDocument())
    expect(screen.getByText('期限超過')).toBeInTheDocument()
    expect(screen.getAllByText('レビュー待ち').length).toBeGreaterThan(0)
    expect(screen.getByText('VelocityChart:project-1')).toBeInTheDocument()
  })

  test('opens drill-down searches from delivery snapshot actions', async () => {
    const user = userEvent.setup()
    const onOpenSearch = vi.fn()
    const queryClient = createQueryClient()

    mockGetIssues.mockResolvedValue([
      {
        id: 'issue-overdue',
        project_id: 'project-1',
        sprint_id: null,
        parent_id: null,
        epic_id: null,
        epic_title: null,
        number: 10,
        title: 'Overdue issue',
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
        due_date: '2026-03-01',
        created_at: '2026-03-01T00:00:00Z',
        updated_at: '2026-03-02T00:00:00Z',
      },
      {
        id: 'issue-review',
        project_id: 'project-1',
        sprint_id: null,
        parent_id: null,
        epic_id: null,
        epic_title: null,
        number: 11,
        title: 'Review issue',
        description: null,
        type: 'task',
        status: 'in_review',
        priority: 'medium',
        points: null,
        assignee_id: 'user-1',
        assignee_name: 'Alice',
        assignee_avatar_url: null,
        labels: [],
        position: 1000,
        due_date: null,
        created_at: '2026-03-01T00:00:00Z',
        updated_at: '2026-03-02T00:00:00Z',
      },
    ])

    render(
      <QueryClientProvider client={queryClient}>
        <DashboardPage onOpenSearch={onOpenSearch} />
      </QueryClientProvider>
    )

    await waitFor(() => expect(mockGetIssues).toHaveBeenCalledWith('project-1'))

    await user.click(await screen.findByRole('button', { name: '対象イシューを見る' }))
    expect(onOpenSearch).toHaveBeenCalledWith('', {
      status: '',
      type: '',
      priority: '',
      assignee_id: '',
      sprint_id: '',
      due_state: 'overdue',
    })

    await user.click(await screen.findByRole('button', { name: 'レビュー待ちを見る' }))
    expect(onOpenSearch).toHaveBeenLastCalledWith('', {
      status: 'in_review',
      type: '',
      priority: '',
      assignee_id: '',
      sprint_id: '',
      due_state: '',
    })
  })

  test('hides delivery snapshot drill-down actions when matching counts are zero', async () => {
    const queryClient = createQueryClient()

    mockGetIssues.mockResolvedValue([
      {
        id: 'issue-done-1',
        project_id: 'project-1',
        sprint_id: 'sprint-1',
        parent_id: null,
        epic_id: null,
        epic_title: null,
        number: 1,
        title: 'Done one',
        description: null,
        type: 'task',
        status: 'done',
        priority: 'medium',
        points: 5,
        assignee_id: 'user-1',
        assignee_name: 'Alice',
        assignee_avatar_url: null,
        labels: [],
        position: 0,
        due_date: null,
        created_at: '2026-03-15T00:00:00Z',
        updated_at: '2026-03-18T00:00:00Z',
      },
    ])

    render(
      <QueryClientProvider client={queryClient}>
        <DashboardPage />
      </QueryClientProvider>
    )

    await waitFor(() => expect(mockGetIssues).toHaveBeenCalledWith('project-1'))

    expect(screen.queryByRole('button', { name: '対象イシューを見る' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'レビュー待ちを見る' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '未アサインを見る' })).not.toBeInTheDocument()
  })
})
