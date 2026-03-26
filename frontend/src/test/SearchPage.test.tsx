import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState } from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { SearchPage } from '../pages/SearchPage'
import { useAppStore } from '../store'
import type { Issue, IssueSearchFilters, WorkspaceMember } from '../types'

const {
  mockGetIssuesPaged,
  mockGetProjectMembers,
} = vi.hoisted(() => ({
  mockGetIssuesPaged: vi.fn(),
  mockGetProjectMembers: vi.fn(),
}))

vi.mock('../api/issues', () => ({
  getIssuesPaged: mockGetIssuesPaged,
}))

vi.mock('../api/workspaces', () => ({
  getProjectMembers: mockGetProjectMembers,
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
    user_id: 'member-1',
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
  filters: IssueSearchFilters = { status: '', type: '', priority: '', assignee_id: '' },
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
    mockGetIssuesPaged.mockResolvedValue({
      items: [makeIssue()],
      total: 41,
    })
    mockGetProjectMembers.mockResolvedValue([makeMember()])
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
      })
    )

    await user.click(screen.getByRole('button', { name: 'フィルター' }))
    await waitFor(() => expect(mockGetProjectMembers).toHaveBeenCalledWith('project-1'))

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
      })
    )
  })

  test('saves a search preset into shared app state', async () => {
    const user = userEvent.setup()
    const promptSpy = vi.spyOn(window, 'prompt').mockReturnValue('My bugs')

    renderSearchPage('bug')

    await waitFor(() => expect(mockGetIssuesPaged).toHaveBeenCalled())
    await user.click(screen.getByRole('button', { name: '条件を保存' }))

    expect(promptSpy).toHaveBeenCalledWith('プリセット名', 'bug')
    expect(useAppStore.getState().searchPresets).toEqual([
      expect.objectContaining({
        name: 'My bugs',
        query: 'bug',
        project_id: 'project-1',
      }),
    ])
  })
})
