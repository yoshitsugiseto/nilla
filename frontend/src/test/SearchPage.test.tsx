import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState } from 'react'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { SearchPage } from '../pages/SearchPage'
import { useAppStore } from '../store'
import { useAuthStore } from '../store/auth'
import type { Issue, IssueSearchFilters, WorkspaceMember } from '../types'

const {
  mockGetIssuesPaged,
  mockGetProjectMembers,
  mockGetSprints,
  mockGetLabels,
  mockGetSearchPresets,
  mockCreateSearchPreset,
  mockUpdateSearchPreset,
  mockDeleteSearchPreset,
  mockBulkUpdateIssues,
  mockShowToast,
} = vi.hoisted(() => ({
  mockGetIssuesPaged: vi.fn(),
  mockGetProjectMembers: vi.fn(),
  mockGetSprints: vi.fn(),
  mockGetLabels: vi.fn(),
  mockGetSearchPresets: vi.fn(),
  mockCreateSearchPreset: vi.fn(),
  mockUpdateSearchPreset: vi.fn(),
  mockDeleteSearchPreset: vi.fn(),
  mockBulkUpdateIssues: vi.fn(),
  mockShowToast: vi.fn(),
}))

vi.mock('../api/issues', () => ({
  getIssuesPaged: mockGetIssuesPaged,
  bulkUpdateIssues: mockBulkUpdateIssues,
}))

vi.mock('../api/sprints', () => ({
  getSprints: mockGetSprints,
}))

vi.mock('../api/labels', () => ({
  getLabels: mockGetLabels,
}))

vi.mock('../api/searchPresets', () => ({
  getSearchPresets: mockGetSearchPresets,
  createSearchPreset: mockCreateSearchPreset,
  updateSearchPreset: mockUpdateSearchPreset,
  deleteSearchPreset: mockDeleteSearchPreset,
}))

vi.mock('../api/workspaces', () => ({
  getProjectMembers: mockGetProjectMembers,
}))

vi.mock('../components/common/useToast', () => ({
  useToast: () => mockShowToast,
}))

vi.mock('../components/Issue/IssueDetail', () => ({
  IssueDetail: ({ issueId }: { issueId: string }) => <div>IssueDetail:{issueId}</div>,
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
    title: 'Search result issue',
    description: 'Description',
    type: 'bug',
    status: 'todo',
    priority: 'high',
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

function makeMember(overrides: Partial<WorkspaceMember> = {}): WorkspaceMember {
  return {
    workspace_id: 'workspace-1',
    user_id: 'user-1',
    name: 'Alice',
    email: 'alice@example.com',
    avatar_url: null,
    role: 'member',
    joined_at: '2026-03-01T00:00:00Z',
    ...overrides,
  }
}

function renderSearchPage(
  query: string,
  filters: IssueSearchFilters = {
    status: '',
    type: '',
    priority: '',
    assignee_id: '',
    sprint_id: '',
    due_state: '',
  },
  onApplyPreset: (query: string, filters: IssueSearchFilters) => void = () => undefined,
) {
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

  function Wrapper() {
    const [currentFilters, setCurrentFilters] = useState(filters)

    return (
      <SearchPage
        query={query}
        filters={currentFilters}
        onApplyPreset={onApplyPreset}
        onFiltersChange={setCurrentFilters}
      />
    )
  }

  render(
    <QueryClientProvider client={queryClient}>
      <Wrapper />
    </QueryClientProvider>
  )
}

describe('SearchPage', () => {
  beforeEach(() => {
    localStorage.clear()
    mockGetIssuesPaged.mockReset()
    mockGetProjectMembers.mockReset()
    mockGetSprints.mockReset()
    mockGetLabels.mockReset()
    mockGetSearchPresets.mockReset()
    mockCreateSearchPreset.mockReset()
    mockUpdateSearchPreset.mockReset()
    mockDeleteSearchPreset.mockReset()
    mockBulkUpdateIssues.mockReset()
    mockShowToast.mockReset()
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
    mockGetIssuesPaged.mockResolvedValue({
      items: [makeIssue()],
      total: 41,
    })
    mockGetProjectMembers.mockResolvedValue([makeMember()])
    mockGetSprints.mockResolvedValue([
      {
        id: 'sprint-1',
        project_id: 'project-1',
        name: 'Sprint Alpha',
        goal: 'Ship search',
        status: 'planning',
        start_date: '2026-03-01',
        end_date: '2026-03-14',
        created_at: '2026-03-01T00:00:00Z',
        updated_at: '2026-03-01T00:00:00Z',
      },
    ])
    mockGetLabels.mockResolvedValue([
      {
        id: 'label-1',
        project_id: 'project-1',
        name: 'Frontend',
        color: '#3b82f6',
        created_at: '2026-03-01T00:00:00Z',
      },
    ])
    mockGetSearchPresets.mockResolvedValue([
      {
        id: 'shared-1',
        project_id: 'project-1',
        name: '共有レビュー待ち',
        query: '',
        filters: { status: 'in_review', type: '', priority: '', assignee_id: '', sprint_id: '', due_state: '' },
        created_at: '2026-03-01T00:00:00Z',
        updated_at: '2026-03-01T00:00:00Z',
      },
    ])
    mockCreateSearchPreset.mockResolvedValue({
      id: 'shared-2',
      project_id: 'project-1',
      name: '共有条件',
      query: 'bug',
      filters: { status: '', type: '', priority: '', assignee_id: '', sprint_id: '', due_state: '' },
      created_at: '2026-03-01T00:00:00Z',
      updated_at: '2026-03-01T00:00:00Z',
    })
    mockUpdateSearchPreset.mockResolvedValue(undefined)
    mockDeleteSearchPreset.mockResolvedValue(undefined)
    mockBulkUpdateIssues.mockResolvedValue({
      items: [],
      updated_count: 1,
      skipped_ids: [],
      skipped: [],
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

  test('does not search before the query reaches two characters', () => {
    renderSearchPage('a')

    expect(screen.getByText('2文字以上入力してください')).toBeInTheDocument()
    expect(mockGetIssuesPaged).not.toHaveBeenCalled()
  })

  test('searches when filters are active even without a text query', async () => {
    renderSearchPage('', {
      status: 'done',
      type: '',
      priority: '',
      assignee_id: '',
      sprint_id: '',
      due_state: '',
    })

    await waitFor(() =>
      expect(mockGetIssuesPaged).toHaveBeenCalledWith('project-1', {
        q: undefined,
        limit: 20,
        offset: 0,
        status: 'done',
        type: undefined,
        priority: undefined,
        assignee_id: undefined,
        sprint_id: undefined,
        due_state: undefined,
      })
    )

    expect(screen.getByText('フィルター結果')).toBeInTheDocument()
    expect(screen.queryByText('2文字以上入力してください')).not.toBeInTheDocument()
  })

  test('applies filters including unassigned assignee', async () => {
    const user = userEvent.setup()

    renderSearchPage('bug')

    await waitFor(() =>
      expect(mockGetIssuesPaged).toHaveBeenCalledWith('project-1', {
        q: 'bug',
        limit: 20,
        offset: 0,
        status: undefined,
        type: undefined,
        priority: undefined,
        assignee_id: undefined,
        sprint_id: undefined,
        due_state: undefined,
      })
    )

    await user.click(screen.getByRole('button', { name: 'フィルター' }))
    await waitFor(() => expect(mockGetProjectMembers).toHaveBeenCalledWith('project-1'))

    expect(screen.getByRole('option', { name: '未着手' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: '進行中' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'ストーリー' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: '緊急' })).toBeInTheDocument()

    await user.selectOptions(screen.getByLabelText('ステータス'), 'done')
    await user.selectOptions(screen.getByLabelText('担当者'), '__unassigned__')

    await waitFor(() =>
      expect(mockGetIssuesPaged).toHaveBeenLastCalledWith('project-1', {
        q: 'bug',
        limit: 20,
        offset: 0,
        status: 'done',
        type: undefined,
        priority: undefined,
        assignee_id: '__unassigned__',
        sprint_id: undefined,
        due_state: undefined,
      })
    )
  }, 10000)

  test('supports sprint and overdue filters for drill-down flows', async () => {
    const user = userEvent.setup()

    renderSearchPage('bug')

    await waitFor(() => expect(mockGetIssuesPaged).toHaveBeenCalled())
    await user.click(screen.getByRole('button', { name: 'フィルター' }))
    await waitFor(() => expect(mockGetSprints).toHaveBeenCalledWith('project-1'))

    await user.selectOptions(screen.getByLabelText('Sprint'), 'sprint-1')
    await user.selectOptions(screen.getByLabelText('期限'), 'overdue')

    await waitFor(() =>
      expect(mockGetIssuesPaged).toHaveBeenLastCalledWith('project-1', {
        q: 'bug',
        limit: 20,
        offset: 0,
        status: undefined,
        type: undefined,
        priority: undefined,
        assignee_id: undefined,
        sprint_id: 'sprint-1',
        due_state: 'overdue',
      })
    )
  })

  test('paginates search results', async () => {
    const user = userEvent.setup()

    renderSearchPage('bug')

    await waitFor(() => expect(mockGetIssuesPaged).toHaveBeenCalledTimes(1))
    expect(await screen.findByRole('button', { name: '次のページ' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '次のページ' }))

    await waitFor(() =>
      expect(mockGetIssuesPaged).toHaveBeenLastCalledWith('project-1', {
        q: 'bug',
        limit: 20,
        offset: 20,
        status: undefined,
        type: undefined,
        priority: undefined,
        assignee_id: undefined,
        sprint_id: undefined,
        due_state: undefined,
      })
    )
  })

  test('saves a search preset into shared app state', async () => {
    const user = userEvent.setup()
    const promptSpy = vi.spyOn(window, 'prompt').mockReturnValue('My bugs')

    renderSearchPage('bug')

    await waitFor(() => expect(mockGetIssuesPaged).toHaveBeenCalled())
    await user.click(screen.getByRole('button', { name: '個人保存' }))

    expect(promptSpy).toHaveBeenCalledWith('プリセット名', 'bug')
    expect(useAppStore.getState().searchPresets).toEqual([
      expect.objectContaining({
        name: 'My bugs',
        query: 'bug',
        project_id: 'project-1',
      }),
    ])
  })

  test('saves and applies shared search presets', async () => {
    const user = userEvent.setup()
    const promptSpy = vi.spyOn(window, 'prompt').mockReturnValue('共有条件')
    const onApplyPreset = vi.fn()

    renderSearchPage(
      'bug',
      { status: '', type: '', priority: '', assignee_id: '', sprint_id: '', due_state: '' },
      onApplyPreset,
    )

    await waitFor(() => expect(mockGetSearchPresets).toHaveBeenCalledWith('project-1'))
    expect(await screen.findByText('共有プリセット')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '共有レビュー待ち' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '共有保存' }))
    await waitFor(() =>
      expect(mockCreateSearchPreset).toHaveBeenCalledWith('project-1', {
        name: '共有条件',
        query: 'bug',
        filters: {
          status: '',
          type: '',
          priority: '',
          assignee_id: '',
          sprint_id: '',
          due_state: '',
        },
      })
    )

    await user.click(screen.getByRole('button', { name: '共有レビュー待ち' }))
    expect(onApplyPreset).toHaveBeenCalledWith('', {
      status: 'in_review',
      type: '',
      priority: '',
      assignee_id: '',
      sprint_id: '',
      due_state: '',
    })
    promptSpy.mockRestore()
  })

  test('applies a quick filter for the current user without typing a query', async () => {
    const user = userEvent.setup()

    renderSearchPage('')

    expect(mockGetIssuesPaged).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: '自分の担当' }))

    await waitFor(() =>
      expect(mockGetIssuesPaged).toHaveBeenLastCalledWith('project-1', {
        q: undefined,
        limit: 20,
        offset: 0,
        status: undefined,
        type: undefined,
        priority: undefined,
        assignee_id: 'user-1',
        sprint_id: undefined,
        due_state: undefined,
      })
    )
    expect(screen.getByText('フィルター結果')).toBeInTheDocument()
  })

  test('shows bulk skip details after update', async () => {
    const user = userEvent.setup()

    mockBulkUpdateIssues.mockResolvedValue({
      items: [],
      updated_count: 1,
      skipped_ids: ['missing-id'],
      skipped: [{ issue_id: 'missing-id', reason: '見つからないか対象外' }],
    })

    renderSearchPage('bug')

    await waitFor(() => expect(mockGetIssuesPaged).toHaveBeenCalled())
    await user.click(await screen.findByRole('button', { name: '一括操作' }))
    await user.click(screen.getByRole('button', { name: '表示中を全選択' }))

    const bulkBar = screen.getByText('1件選択中').closest('div')
    if (!bulkBar) {
      throw new Error('bulk action bar not found')
    }

    await user.selectOptions(within(bulkBar).getAllByRole('combobox')[2], '__unassigned__')

    expect(await screen.findByText('一括更新結果')).toBeInTheDocument()
    expect(screen.getByText('missing-id')).toBeInTheDocument()
    expect(screen.getByText('見つからないか対象外')).toBeInTheDocument()
    expect(screen.getByText('見つからないか対象外 1件')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'スキップ分を再選択' }))
    expect(screen.getByText('1件選択中')).toBeInTheDocument()
  })

  test('bulk updates visible search results', async () => {
    const user = userEvent.setup()

    renderSearchPage('bug')

    await waitFor(() => expect(mockGetIssuesPaged).toHaveBeenCalled())
    await user.click(await screen.findByRole('button', { name: '一括操作' }))
    await user.click(screen.getByRole('button', { name: '表示中を全選択' }))

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
    expect(mockShowToast).toHaveBeenCalledWith('1件更新しました', 'success')
  })
})
