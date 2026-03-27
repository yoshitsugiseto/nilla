import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { SprintPage } from '../pages/SprintPage'
import { useAppStore } from '../store'
import { useAuthStore } from '../store/auth'
import type { Issue, ProjectMember, Sprint, WorkspaceAutomationSettings } from '../types'

const {
  mockGetSprints,
  mockCreateSprint,
  mockUpdateSprint,
  mockStartSprint,
  mockCompleteSprint,
  mockGetIssues,
  mockGetActivity,
  mockGetProjectMembers,
  mockGetWorkspaceAutomationSettings,
  mockShowToast,
  mockExtractErrorMessage,
} = vi.hoisted(() => ({
  mockGetSprints: vi.fn(),
  mockCreateSprint: vi.fn(),
  mockUpdateSprint: vi.fn(),
  mockStartSprint: vi.fn(),
  mockCompleteSprint: vi.fn(),
  mockGetIssues: vi.fn(),
  mockGetActivity: vi.fn(),
  mockGetProjectMembers: vi.fn(),
  mockGetWorkspaceAutomationSettings: vi.fn(),
  mockShowToast: vi.fn(),
  mockExtractErrorMessage: vi.fn(),
}))

vi.mock('../api/sprints', () => ({
  getSprints: mockGetSprints,
  createSprint: mockCreateSprint,
  updateSprint: mockUpdateSprint,
  startSprint: mockStartSprint,
  completeSprint: mockCompleteSprint,
}))

vi.mock('../api/issues', () => ({
  getIssues: mockGetIssues,
  getActivity: mockGetActivity,
}))

vi.mock('../api/workspaces', () => ({
  getProjectMembers: mockGetProjectMembers,
  getWorkspaceAutomationSettings: mockGetWorkspaceAutomationSettings,
}))

vi.mock('../components/common/useToast', () => ({
  useToast: () => mockShowToast,
}))

vi.mock('../api/client', () => ({
  extractErrorMessage: mockExtractErrorMessage,
}))

vi.mock('../components/Board/BurndownChart', () => ({
  BurndownChart: () => <div>BurndownChart</div>,
}))

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
}

function makeSprint(overrides: Partial<Sprint> = {}): Sprint {
  return {
    id: 'sprint-1',
    project_id: 'project-1',
    name: 'Sprint Alpha',
    goal: 'Ship sprint work',
    status: 'planning',
    start_date: '2026-03-01',
    end_date: '2026-03-14',
    created_at: '2026-03-01T00:00:00Z',
    updated_at: '2026-03-01T00:00:00Z',
    ...overrides,
  }
}

function makeIssue(overrides: Partial<Issue> = {}): Issue {
  return {
    id: 'issue-1',
    project_id: 'project-1',
    sprint_id: 'sprint-1',
    parent_id: null,
    epic_id: null,
    epic_title: null,
    number: 1,
    title: 'Sprint issue',
    description: 'Description',
    type: 'task',
    status: 'todo',
    priority: 'medium',
    points: 3,
    assignee_id: null,
    assignee_name: null,
    assignee_avatar_url: null,
    labels: [],
    position: 0,
    due_date: null,
    created_at: '2026-03-01T00:00:00Z',
    updated_at: '2026-03-01T00:00:00Z',
    ...overrides,
  }
}

function makeMember(overrides: Partial<ProjectMember> = {}): ProjectMember {
  return {
    workspace_id: 'workspace-1',
    project_id: 'project-1',
    user_id: 'member-1',
    name: 'Alice',
    email: 'alice@example.com',
    avatar_url: null,
    role: 'editor',
    workspace_role: 'member',
    inherited: true,
    joined_at: '2026-03-01T00:00:00Z',
    ...overrides,
  }
}

function makeAutomationSettings(
  overrides: Partial<WorkspaceAutomationSettings> = {}
): WorkspaceAutomationSettings {
  return {
    workspace_id: 'workspace-1',
    notify_on_assignee_change: true,
    notify_on_review_ready: true,
    notify_on_overdue_transition: true,
    sprint_carryover_mode: 'prompt',
    ...overrides,
  }
}

function renderSprintPage(onOpenSearch = vi.fn()) {
  const queryClient = createQueryClient()
  useAppStore.setState({
    activeProjectId: 'project-1',
    activeSprint: null,
      activeWorkspaceId: 'workspace-1',
      pendingOpenIssueId: null,
      pendingOpenIssueTitle: null,
      searchPresets: [],
      boardFilters: {},
    })

  const onNavigate = vi.fn()

  render(
    <QueryClientProvider client={queryClient}>
      <SprintPage onNavigate={onNavigate} onOpenSearch={onOpenSearch} />
    </QueryClientProvider>
  )

  return { onNavigate, onOpenSearch }
}

describe('SprintPage', () => {
  beforeEach(() => {
    localStorage.clear()
    mockGetSprints.mockReset()
    mockCreateSprint.mockReset()
    mockUpdateSprint.mockReset()
    mockStartSprint.mockReset()
    mockCompleteSprint.mockReset()
    mockGetIssues.mockReset()
    mockGetActivity.mockReset()
    mockGetProjectMembers.mockReset()
    mockGetWorkspaceAutomationSettings.mockReset()
    mockShowToast.mockReset()
    mockExtractErrorMessage.mockReset()
    mockExtractErrorMessage.mockReturnValue('抽出済みエラー')
    useAuthStore.setState({
      accessToken: 'access-123',
      user: {
        id: 'member-1',
        name: 'Alice',
        email: 'alice@example.com',
        avatar_url: null,
        provider: 'github',
      },
      isLoading: false,
    })

    mockGetSprints.mockResolvedValue([makeSprint()])
    mockCreateSprint.mockResolvedValue(makeSprint({ id: 'created-sprint', name: 'Sprint Beta' }))
    mockUpdateSprint.mockResolvedValue(makeSprint())
    mockStartSprint.mockResolvedValue(makeSprint({ status: 'active' }))
    mockCompleteSprint.mockResolvedValue(makeSprint({ status: 'completed' }))
    mockGetIssues.mockResolvedValue([])
    mockGetActivity.mockResolvedValue([])
    mockGetProjectMembers.mockResolvedValue([makeMember()])
    mockGetWorkspaceAutomationSettings.mockResolvedValue(makeAutomationSettings())
  })

  afterEach(() => {
    useAppStore.setState({
      activeProjectId: null,
      activeSprint: null,
      activeWorkspaceId: null,
      pendingOpenIssueId: null,
      pendingOpenIssueTitle: null,
      searchPresets: [],
      boardFilters: {},
    })
    useAuthStore.setState({ accessToken: null, user: null, isLoading: false })
    vi.restoreAllMocks()
  })

  test('creates a sprint from the page modal', async () => {
    const user = userEvent.setup()

    renderSprintPage()

    await waitFor(() => expect(mockGetSprints).toHaveBeenCalledWith('project-1'))
    expect(await screen.findByRole('button', { name: 'Sprintを作成' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Sprintを作成' }))
    await user.type(screen.getByLabelText('スプリント名 *'), 'Sprint Beta')
    await user.type(screen.getByLabelText('ゴール'), 'Stabilize test coverage')
    await user.type(screen.getByLabelText('開始日 *'), '2026-04-01')
    await user.type(screen.getByLabelText('終了日 *'), '2026-04-14')
    await user.click(screen.getAllByRole('button', { name: 'Sprintを作成' })[1])

    await waitFor(() =>
      expect(mockCreateSprint).toHaveBeenCalledWith('project-1', {
        name: 'Sprint Beta',
        goal: 'Stabilize test coverage',
        start_date: '2026-04-01',
        end_date: '2026-04-14',
      })
    )
  })

  test('starts a planning sprint', async () => {
    const user = userEvent.setup()

    renderSprintPage()

    await waitFor(() => expect(mockGetSprints).toHaveBeenCalled())
    expect(await screen.findByText('Sprint Alpha')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '開始' }))

    await waitFor(() => expect(mockStartSprint).toHaveBeenCalled())
    expect(mockStartSprint.mock.calls[0]?.[0]).toBe('sprint-1')
  })

  test('completes a sprint and shows the completion report', async () => {
    const user = userEvent.setup()

    mockGetSprints.mockResolvedValue([
      makeSprint({ id: 'sprint-active', name: 'Sprint Active', status: 'active' }),
      makeSprint({ id: 'sprint-prev', name: 'Sprint Prev', status: 'completed', updated_at: '2026-03-10T00:00:00Z' }),
      makeSprint({ id: 'sprint-next', name: 'Sprint Next', status: 'planning' }),
    ])
    mockGetIssues.mockResolvedValue([
      makeIssue({ id: 'issue-1', sprint_id: 'sprint-active', title: 'Carry over issue', status: 'todo', points: 3 }),
      makeIssue({ id: 'issue-2', sprint_id: 'sprint-active', title: 'Done issue', status: 'done', points: 5 }),
      makeIssue({ id: 'issue-3', sprint_id: 'sprint-prev', title: 'Previous done', status: 'done', points: 8 }),
    ])

    renderSprintPage()

    await waitFor(() => expect(mockGetIssues).toHaveBeenCalledWith('project-1'))
    expect(await screen.findByRole('button', { name: '完了' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '完了' }))
    await user.selectOptions(screen.getByLabelText('未完了イシューの移動先'), 'sprint-next')
    await user.click(screen.getByRole('button', { name: 'スプリントを完了' }))

    await waitFor(() => expect(mockCompleteSprint).toHaveBeenCalled())
    expect(mockCompleteSprint.mock.calls[0]?.[0]).toBe('sprint-active')
    expect(mockCompleteSprint.mock.calls[0]?.[1]).toBe('sprint-next')
    expect(await screen.findByText('スプリント完了！')).toBeInTheDocument()
    expect(screen.getByText('1 / 2 件')).toBeInTheDocument()
    expect(screen.getByText('5 / 8 pt')).toBeInTheDocument()
    expect(screen.getByText('Carry over')).toBeInTheDocument()
    expect(screen.getByText('Sprint Prev')).toBeInTheDocument()
  })

  test('viewers do not see sprint mutation controls', async () => {
    mockGetProjectMembers.mockResolvedValue([
      makeMember({
        role: 'viewer',
        workspace_role: 'viewer',
      }),
    ])

    renderSprintPage()

    await waitFor(() => expect(mockGetSprints).toHaveBeenCalled())
    expect(await screen.findByText('Sprint Alpha')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Sprintを作成' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '開始' })).not.toBeInTheDocument()
    expect(screen.queryByTitle('Edit sprint')).not.toBeInTheDocument()
  })

  test('viewer empty state avoids asking for impossible sprint creation', async () => {
    mockGetProjectMembers.mockResolvedValue([
      makeMember({
        role: 'viewer',
        workspace_role: 'viewer',
      }),
    ])
    mockGetSprints.mockResolvedValue([])

    renderSprintPage()

    await waitFor(() => expect(mockGetSprints).toHaveBeenCalled())
    expect(await screen.findByText('スプリントはまだありません。作成が必要な場合はプロジェクト管理者に依頼してください。')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Sprintを作成' })).not.toBeInTheDocument()
  })

  test('surfaces active sprint risk signals for overdue and unassigned work', async () => {
    mockGetSprints.mockResolvedValue([
      makeSprint({ id: 'sprint-active', name: 'Sprint Active', status: 'active', end_date: '2026-03-28' }),
    ])
    mockGetIssues.mockResolvedValue([
      makeIssue({
        id: 'issue-1',
        sprint_id: 'sprint-active',
        title: 'Overdue task',
        status: 'todo',
        due_date: '2026-03-01',
        assignee_id: null,
      }),
      makeIssue({
        id: 'issue-2',
        sprint_id: 'sprint-active',
        title: 'Waiting review',
        status: 'in_review',
        due_date: null,
        assignee_id: 'member-1',
      }),
    ])

    renderSprintPage()

    expect(await screen.findByLabelText('スプリント危険信号')).toBeInTheDocument()
    expect(screen.getByText('期限超過 1件')).toBeInTheDocument()
    expect(screen.getByText('未アサイン 1件')).toBeInTheDocument()
    expect(screen.getByText('レビュー待ち 1件')).toBeInTheDocument()
  })

  test('shows active sprint reporting snapshot with burndown trend', async () => {
    mockGetSprints.mockResolvedValue([
      makeSprint({ id: 'sprint-active', name: 'Sprint Active', status: 'active', end_date: '2026-03-28' }),
    ])
    mockGetIssues.mockResolvedValue([
      makeIssue({
        id: 'issue-1',
        sprint_id: 'sprint-active',
        title: 'Done task',
        status: 'done',
        points: 5,
        assignee_id: 'member-1',
        created_at: '2026-03-01T00:00:00Z',
        updated_at: '2026-03-04T00:00:00Z',
      }),
      makeIssue({
        id: 'issue-2',
        sprint_id: 'sprint-active',
        title: 'Open task',
        status: 'todo',
        points: 3,
        assignee_id: null,
        due_date: '2026-03-01',
        created_at: '2026-03-02T00:00:00Z',
        updated_at: '2026-03-05T00:00:00Z',
      }),
    ])
    mockGetActivity.mockImplementation(async (issueId: string) => {
      if (issueId === 'issue-1') {
        return [
          {
            id: 'activity-1',
            issue_id: issueId,
            field: 'status',
            old_value: 'todo',
            new_value: 'in_progress',
            created_at: '2026-03-02T00:00:00Z',
          },
          {
            id: 'activity-2',
            issue_id: issueId,
            field: 'status',
            old_value: 'in_progress',
            new_value: 'done',
            created_at: '2026-03-04T00:00:00Z',
          },
        ]
      }
      return []
    })

    renderSprintPage()

    expect(await screen.findByLabelText('アクティブスプリントサマリー')).toBeInTheDocument()
    expect(screen.getByText('アクティブスプリントの見通し')).toBeInTheDocument()
    expect(screen.getByText('1/2')).toBeInTheDocument()
    expect(screen.getByText('5/8pt')).toBeInTheDocument()
    expect(screen.getByText('2日')).toBeInTheDocument()
    expect(screen.getByText('バーンダウントレンド')).toBeInTheDocument()
    expect(screen.getByText('BurndownChart')).toBeInTheDocument()
  })

  test('opens sprint drill-down searches from active snapshot and risk chips', async () => {
    const user = userEvent.setup()
    const onOpenSearch = vi.fn()

    mockGetSprints.mockResolvedValue([
      makeSprint({ id: 'sprint-active', name: 'Sprint Active', status: 'active', end_date: '2026-03-28' }),
    ])
    mockGetIssues.mockResolvedValue([
      makeIssue({
        id: 'issue-1',
        sprint_id: 'sprint-active',
        title: 'Overdue task',
        status: 'todo',
        due_date: '2026-03-01',
        assignee_id: null,
      }),
      makeIssue({
        id: 'issue-2',
        sprint_id: 'sprint-active',
        title: 'Waiting review',
        status: 'in_review',
        due_date: null,
        assignee_id: 'member-1',
      }),
      makeIssue({
        id: 'issue-3',
        sprint_id: 'sprint-active',
        title: 'Done task',
        status: 'done',
        due_date: null,
        assignee_id: 'member-1',
      }),
    ])

    renderSprintPage(onOpenSearch)

    expect(await screen.findByLabelText('アクティブスプリントサマリー')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '対象 issue を見る' }))
    expect(onOpenSearch).toHaveBeenCalledWith('', {
      status: '',
      type: '',
      priority: '',
      assignee_id: '',
      sprint_id: 'sprint-active',
      due_state: '',
    })

    await user.click(screen.getByRole('button', { name: '期限超過を見る' }))
    expect(onOpenSearch).toHaveBeenLastCalledWith('', {
      status: '',
      type: '',
      priority: '',
      assignee_id: '',
      sprint_id: 'sprint-active',
      due_state: 'overdue',
    })

    await user.click(screen.getByRole('button', { name: 'レビュー待ち 1件' }))
    expect(onOpenSearch).toHaveBeenLastCalledWith('', {
      status: 'in_review',
      type: '',
      priority: '',
      assignee_id: '',
      sprint_id: 'sprint-active',
      due_state: '',
    })
  })

  test('uses workspace automation for sprint carryover when mode is next_sprint', async () => {
    const user = userEvent.setup()

    mockGetWorkspaceAutomationSettings.mockResolvedValue(
      makeAutomationSettings({ sprint_carryover_mode: 'next_sprint' })
    )
    mockGetSprints.mockResolvedValue([
      makeSprint({ id: 'sprint-active', name: 'Sprint Active', status: 'active' }),
      makeSprint({ id: 'sprint-next', name: 'Sprint Next', status: 'planning' }),
    ])
    mockGetIssues.mockResolvedValue([
      makeIssue({ id: 'issue-1', sprint_id: 'sprint-active', title: 'Carry over issue', status: 'todo', points: 3 }),
    ])

    renderSprintPage()

    expect(await screen.findByRole('button', { name: '完了' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '完了' }))

    expect(screen.queryByLabelText('未完了イシューの移動先')).not.toBeInTheDocument()
    expect(screen.getByText('未完了イシューは「Sprint Next」へ自動で移動します。')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'スプリントを完了' }))

    await waitFor(() => expect(mockCompleteSprint).toHaveBeenCalled())
    expect(mockCompleteSprint.mock.calls[0]?.[0]).toBe('sprint-active')
    expect(mockCompleteSprint.mock.calls[0]?.[1]).toBeNull()
  })
})
