import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { BacklogPage } from '../pages/BacklogPage'
import { useAppStore } from '../store'
import { useAuthStore } from '../store/auth'
import type { Issue, ProjectLabel, ProjectMember, Sprint } from '../types'

const {
  mockGetIssues,
  mockUpdateIssueSprint,
  mockDeleteIssue,
  mockReorderIssues,
  mockBulkUpdateIssues,
  mockGetSprints,
  mockGetProjectMembers,
  mockGetLabels,
  mockShowToast,
} = vi.hoisted(() => ({
  mockGetIssues: vi.fn(),
  mockUpdateIssueSprint: vi.fn(),
  mockDeleteIssue: vi.fn(),
  mockReorderIssues: vi.fn(),
  mockBulkUpdateIssues: vi.fn(),
  mockGetSprints: vi.fn(),
  mockGetProjectMembers: vi.fn(),
  mockGetLabels: vi.fn(),
  mockShowToast: vi.fn(),
}))

vi.mock('../api/issues', () => ({
  getIssues: mockGetIssues,
  updateIssueSprint: mockUpdateIssueSprint,
  deleteIssue: mockDeleteIssue,
  reorderIssues: mockReorderIssues,
  bulkUpdateIssues: mockBulkUpdateIssues,
}))

vi.mock('../api/sprints', () => ({
  getSprints: mockGetSprints,
}))

vi.mock('../api/workspaces', () => ({
  getProjectMembers: mockGetProjectMembers,
}))

vi.mock('../api/labels', () => ({
  getLabels: mockGetLabels,
}))

vi.mock('../components/common/useToast', () => ({
  useToast: () => mockShowToast,
}))

vi.mock('../components/Issue/IssueForm', () => ({
  IssueForm: ({ projectId, defaultType }: { projectId: string; defaultType?: string }) => <div>IssueForm:{projectId}:{defaultType ?? 'none'}</div>,
}))

vi.mock('../components/Issue/IssueDetail', () => ({
  IssueDetail: ({ issueId }: { issueId: string }) => <div>IssueDetail:{issueId}</div>,
}))

vi.mock('@hello-pangea/dnd', () => ({
  DragDropContext: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Droppable: ({ children }: { children: (provided: { innerRef: () => void; droppableProps: Record<string, never>; placeholder: null }, snapshot: { isDraggingOver: boolean }) => ReactNode }) =>
    children({ innerRef: () => undefined, droppableProps: {}, placeholder: null }, { isDraggingOver: false }),
  Draggable: ({ children }: { children: (provided: { innerRef: () => void; draggableProps: { style: Record<string, never> }; dragHandleProps: Record<string, never> }, snapshot: { isDragging: boolean; isDropAnimating: boolean }) => ReactNode }) =>
    children(
      { innerRef: () => undefined, draggableProps: { style: {} }, dragHandleProps: {} },
      { isDragging: false, isDropAnimating: false }
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

function makeIssue(overrides: Partial<Issue> = {}): Issue {
  return {
    id: 'issue-1',
    project_id: 'project-1',
    sprint_id: null,
    parent_id: null,
    epic_id: null,
    epic_title: null,
    number: 1,
    title: 'Backlog task',
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

function makeSprint(overrides: Partial<Sprint> = {}): Sprint {
  return {
    id: 'sprint-1',
    project_id: 'project-1',
    name: 'Sprint Alpha',
    goal: 'Ship backlog work',
    status: 'planning',
    start_date: '2026-03-01',
    end_date: '2026-03-14',
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

function makeLabel(overrides: Partial<ProjectLabel> = {}): ProjectLabel {
  return {
    id: 'label-1',
    project_id: 'project-1',
    name: 'Frontend',
    color: '#3b82f6',
    created_at: '2026-03-01T00:00:00Z',
    ...overrides,
  }
}

function renderBacklogPage() {
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

  render(
    <QueryClientProvider client={queryClient}>
      <BacklogPage />
    </QueryClientProvider>
  )
}

describe('BacklogPage', () => {
  beforeEach(() => {
    localStorage.clear()
    mockGetIssues.mockReset()
    mockUpdateIssueSprint.mockReset()
    mockDeleteIssue.mockReset()
    mockReorderIssues.mockReset()
    mockBulkUpdateIssues.mockReset()
    mockGetSprints.mockReset()
    mockGetProjectMembers.mockReset()
    mockGetLabels.mockReset()
    mockShowToast.mockReset()
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

    mockGetIssues.mockResolvedValue([makeIssue(), makeIssue({ id: 'issue-2', number: 2, title: 'Second task' })])
    mockUpdateIssueSprint.mockResolvedValue(undefined)
    mockDeleteIssue.mockResolvedValue(undefined)
    mockReorderIssues.mockResolvedValue(undefined)
    mockBulkUpdateIssues.mockResolvedValue({
      items: [],
      updated_count: 1,
      skipped_ids: [],
    })
    mockGetSprints.mockResolvedValue([makeSprint()])
    mockGetProjectMembers.mockResolvedValue([makeMember()])
    mockGetLabels.mockResolvedValue([makeLabel(), makeLabel({ id: 'label-2', name: 'Backend', color: '#10b981' })])
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

  test('opens create modal and detail panel from the backlog list', async () => {
    const user = userEvent.setup()

    renderBacklogPage()

    await waitFor(() => expect(mockGetIssues).toHaveBeenCalledWith('project-1'))
    expect(await screen.findByText('Backlog task')).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: 'Issueを作成' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Issueを作成' }))
    expect(screen.getByText('IssueForm:project-1:task')).toBeInTheDocument()

    await user.click(screen.getByText('Backlog task'))
    expect(screen.getByText('IssueDetail:issue-1')).toBeInTheDocument()
  })

  test('opens quick create with the selected issue type', async () => {
    const user = userEvent.setup()

    renderBacklogPage()

    await waitFor(() => expect(mockGetIssues).toHaveBeenCalled())
    await user.click(await screen.findByRole('button', { name: 'バグ' }))

    expect(screen.getByText('IssueForm:project-1:bug')).toBeInTheDocument()
  })

  test('bulk status change submits selected issues', async () => {
    const user = userEvent.setup()

    renderBacklogPage()

    await waitFor(() => expect(mockGetIssues).toHaveBeenCalled())
    expect(await screen.findByText('Backlog task')).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: '一括操作' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '一括操作' }))
    await waitFor(() => expect(mockGetProjectMembers).toHaveBeenCalledWith('project-1'))

    await user.click(screen.getByText('Backlog task'))
    expect(screen.getByText('1件選択中')).toBeInTheDocument()

    const bulkBar = screen.getByText('1件選択中').closest('div')
    if (!bulkBar) {
      throw new Error('bulk action bar not found')
    }

    await user.selectOptions(within(bulkBar).getAllByRole('combobox')[0], 'done')

    await waitFor(() =>
      expect(mockBulkUpdateIssues).toHaveBeenCalledWith('project-1', {
        issue_ids: ['issue-1'],
        status: 'done',
      })
    )
    expect(mockShowToast).toHaveBeenCalledWith('1件更新しました', 'success')
  })

  test('delete flow confirms and removes an issue', async () => {
    const user = userEvent.setup()

    renderBacklogPage()

    await waitFor(() => expect(mockGetIssues).toHaveBeenCalled())
    expect(await screen.findByText('Backlog task')).toBeInTheDocument()

    await user.click(screen.getAllByRole('button', { name: 'イシューを削除' })[0])
    await user.click(screen.getByRole('button', { name: '削除' }))

    await waitFor(() => expect(mockDeleteIssue).toHaveBeenCalledWith('issue-1'))
  })

  test('bulk priority update submits normalized payload', async () => {
    const user = userEvent.setup()

    renderBacklogPage()

    await waitFor(() => expect(mockGetIssues).toHaveBeenCalled())
    expect(await screen.findByRole('button', { name: '一括操作' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '一括操作' }))
    await waitFor(() => expect(mockGetLabels).toHaveBeenCalledWith('project-1'))
    await user.click(screen.getByText('Backlog task'))

    const bulkBar = screen.getByText('1件選択中').closest('div')
    if (!bulkBar) {
      throw new Error('bulk action bar not found')
    }

    await user.selectOptions(within(bulkBar).getAllByRole('combobox')[3], 'high')
    await waitFor(() =>
      expect(mockBulkUpdateIssues).toHaveBeenLastCalledWith('project-1', {
        issue_ids: ['issue-1'],
        priority: 'high',
      })
    )
  })

  test('bulk assignee update can clear assignments back to unassigned', async () => {
    const user = userEvent.setup()

    renderBacklogPage()

    await waitFor(() => expect(mockGetIssues).toHaveBeenCalled())
    expect(await screen.findByRole('button', { name: '一括操作' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '一括操作' }))
    await user.click(screen.getByText('Backlog task'))

    const bulkBar = screen.getByText('1件選択中').closest('div')
    if (!bulkBar) {
      throw new Error('bulk action bar not found')
    }

    await user.selectOptions(within(bulkBar).getAllByRole('combobox')[2], '__unassigned__')
    await waitFor(() =>
      expect(mockBulkUpdateIssues).toHaveBeenLastCalledWith('project-1', {
        issue_ids: ['issue-1'],
        assignee_id: '',
      })
    )
  })

  test('bulk labels update submits normalized payload', async () => {
    const user = userEvent.setup()

    renderBacklogPage()

    await waitFor(() => expect(mockGetIssues).toHaveBeenCalled())
    expect(await screen.findByRole('button', { name: '一括操作' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '一括操作' }))
    await waitFor(() => expect(mockGetLabels).toHaveBeenCalledWith('project-1'))
    await user.click(screen.getByText('Backlog task'))

    const bulkBar = screen.getByText('1件選択中').closest('div')
    if (!bulkBar) {
      throw new Error('bulk action bar not found')
    }

    await user.type(within(bulkBar).getByPlaceholderText('labels,comma,separated'), 'Frontend, Backend')
    await user.click(within(bulkBar).getByRole('button', { name: 'ラベル反映' }))

    await waitFor(() =>
      expect(mockBulkUpdateIssues).toHaveBeenLastCalledWith('project-1', {
        issue_ids: ['issue-1'],
        labels: ['Frontend', 'Backend'],
      })
    )
  })

  test('bulk due date update submits payload', async () => {
    const user = userEvent.setup()

    renderBacklogPage()

    await waitFor(() => expect(mockGetIssues).toHaveBeenCalled())
    await user.click(await screen.findByRole('button', { name: '一括操作' }))
    await user.click(screen.getByText('Backlog task'))

    const bulkBar = screen.getByText('1件選択中').closest('div')
    if (!bulkBar) {
      throw new Error('bulk action bar not found')
    }

    await user.type(within(bulkBar).getByLabelText('一括期限日'), '2026-03-15')
    await user.click(within(bulkBar).getByRole('button', { name: '期限日反映' }))

    await waitFor(() =>
      expect(mockBulkUpdateIssues).toHaveBeenLastCalledWith('project-1', {
        issue_ids: ['issue-1'],
        due_date: '2026-03-15',
      })
    )
  })

  test('bulk due date clear submits null payload', async () => {
    const user = userEvent.setup()

    renderBacklogPage()

    await waitFor(() => expect(mockGetIssues).toHaveBeenCalled())
    await user.click(await screen.findByRole('button', { name: '一括操作' }))
    await user.click(screen.getByText('Backlog task'))

    const bulkBar = screen.getByText('1件選択中').closest('div')
    if (!bulkBar) {
      throw new Error('bulk action bar not found')
    }

    await user.click(within(bulkBar).getByRole('button', { name: '期限日クリア' }))
    await waitFor(() =>
      expect(mockBulkUpdateIssues).toHaveBeenLastCalledWith('project-1', {
        issue_ids: ['issue-1'],
        due_date: null,
      })
    )
  })

  test('viewers do not see create or bulk edit controls', async () => {
    mockGetProjectMembers.mockResolvedValue([
      makeMember({
        role: 'viewer',
        workspace_role: 'viewer',
      }),
    ])

    renderBacklogPage()

    await waitFor(() => expect(mockGetIssues).toHaveBeenCalled())
    expect(await screen.findByText('Backlog task')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Issueを作成' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '一括操作' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'イシューを編集' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'イシューを削除' })).not.toBeInTheDocument()
  })
})
