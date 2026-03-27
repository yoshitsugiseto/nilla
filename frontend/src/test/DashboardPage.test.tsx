import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { DashboardPage } from '../pages/DashboardPage'
import { useAppStore } from '../store'
import { useAuthStore } from '../store/auth'

const {
  mockGetIssues,
  mockGetSprints,
  mockGetProjectMembers,
} = vi.hoisted(() => ({
  mockGetIssues: vi.fn(),
  mockGetSprints: vi.fn(),
  mockGetProjectMembers: vi.fn(),
}))

vi.mock('../api/issues', () => ({
  getIssues: mockGetIssues,
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
    mockGetSprints.mockReset()
    mockGetProjectMembers.mockReset()
    mockGetIssues.mockResolvedValue([])
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
    expect(screen.getByText('1. Backlog')).toBeInTheDocument()
    expect(screen.getByText('2. Sprints')).toBeInTheDocument()
    expect(screen.getByText('3. Board')).toBeInTheDocument()
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
})
