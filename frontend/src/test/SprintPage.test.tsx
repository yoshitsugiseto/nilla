import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { SprintPage } from '../pages/SprintPage'
import { useAppStore } from '../store'
import type { Issue, Sprint } from '../types'

const {
  mockGetSprints,
  mockCreateSprint,
  mockUpdateSprint,
  mockStartSprint,
  mockCompleteSprint,
  mockGetIssues,
  mockShowToast,
  mockExtractErrorMessage,
} = vi.hoisted(() => ({
  mockGetSprints: vi.fn(),
  mockCreateSprint: vi.fn(),
  mockUpdateSprint: vi.fn(),
  mockStartSprint: vi.fn(),
  mockCompleteSprint: vi.fn(),
  mockGetIssues: vi.fn(),
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

function renderSprintPage() {
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
      <SprintPage onNavigate={onNavigate} />
    </QueryClientProvider>
  )

  return { onNavigate }
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
    mockShowToast.mockReset()
    mockExtractErrorMessage.mockReset()
    mockExtractErrorMessage.mockReturnValue('抽出済みエラー')

    mockGetSprints.mockResolvedValue([makeSprint()])
    mockCreateSprint.mockResolvedValue(makeSprint({ id: 'created-sprint', name: 'Sprint Beta' }))
    mockUpdateSprint.mockResolvedValue(makeSprint())
    mockStartSprint.mockResolvedValue(makeSprint({ status: 'active' }))
    mockCompleteSprint.mockResolvedValue(makeSprint({ status: 'completed' }))
    mockGetIssues.mockResolvedValue([])
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
    vi.restoreAllMocks()
  })

  test('creates a sprint from the page modal', async () => {
    const user = userEvent.setup()

    renderSprintPage()

    await waitFor(() => expect(mockGetSprints).toHaveBeenCalledWith('project-1'))

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
    expect(await screen.findByText('Sprint Active')).toBeInTheDocument()

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
})
