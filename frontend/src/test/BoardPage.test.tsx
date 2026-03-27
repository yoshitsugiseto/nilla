import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { BoardPage } from '../pages/BoardPage'
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

vi.mock('../components/Board/Board', () => ({
  Board: () => <div>Board</div>,
}))

vi.mock('../components/Board/BoardFilters', () => ({
  BoardFilters: () => <div>BoardFilters</div>,
}))

vi.mock('../components/Board/BurndownChart', () => ({
  BurndownChart: () => <div>BurndownChart</div>,
}))

vi.mock('../components/Issue/IssueForm', () => ({
  IssueForm: ({ projectId, sprintId, defaultType }: { projectId: string; sprintId?: string; defaultType?: string }) => (
    <div>IssueForm:{projectId}:{sprintId ?? 'none'}:{defaultType ?? 'none'}</div>
  ),
}))

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
}

function renderBoardPage() {
  const queryClient = createQueryClient()

  render(
    <QueryClientProvider client={queryClient}>
      <BoardPage />
    </QueryClientProvider>
  )
}

describe('BoardPage', () => {
  beforeEach(() => {
    mockGetIssues.mockReset()
    mockGetSprints.mockReset()
    mockGetProjectMembers.mockReset()
    mockGetIssues.mockResolvedValue([])
    mockGetSprints.mockResolvedValue([
      {
        id: 'sprint-1',
        project_id: 'project-1',
        name: 'Sprint Alpha',
        goal: 'Ship sprint work',
        status: 'active',
        start_date: '2026-03-01',
        end_date: '2026-03-14',
        created_at: '2026-03-01T00:00:00Z',
        updated_at: '2026-03-01T00:00:00Z',
      },
    ])
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

  test('opens quick create from the board header with the selected type and sprint', async () => {
    const user = userEvent.setup()

    renderBoardPage()

    await waitFor(() => expect(mockGetSprints).toHaveBeenCalledWith('project-1'))
    await user.click(await screen.findByRole('button', { name: 'バグ' }))

    expect(screen.getByText('IssueForm:project-1:sprint-1:bug')).toBeInTheDocument()
  })

  test('shows a guided empty state when no sprints exist', async () => {
    mockGetSprints.mockResolvedValue([])

    renderBoardPage()

    expect(await screen.findByText('スプリントがまだありません')).toBeInTheDocument()
    expect(screen.getByText('最初の流れは「Sprints でスプリント作成 → Board で進捗確認」です。編集権限がない場合はプロジェクト管理者に作成を依頼してください。')).toBeInTheDocument()
  })
})
