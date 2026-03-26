import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ComponentProps } from 'react'
import { describe, expect, test, vi, beforeEach, afterEach } from 'vitest'
import { IssueForm } from '../components/Issue/IssueForm'
import type { Issue, IssueTemplate, ProjectLabel, WorkspaceMember } from '../types'

const {
  mockCreateIssue,
  mockUpdateIssue,
  mockGetIssues,
  mockGetProjectMembers,
  mockGetTemplates,
  mockGetLabels,
  mockShowToast,
  mockExtractErrorMessage,
} = vi.hoisted(() => ({
  mockCreateIssue: vi.fn(),
  mockUpdateIssue: vi.fn(),
  mockGetIssues: vi.fn(),
  mockGetProjectMembers: vi.fn(),
  mockGetTemplates: vi.fn(),
  mockGetLabels: vi.fn(),
  mockShowToast: vi.fn(),
  mockExtractErrorMessage: vi.fn(),
}))

vi.mock('../api/issues', () => ({
  createIssue: mockCreateIssue,
  updateIssue: mockUpdateIssue,
  getIssues: mockGetIssues,
}))

vi.mock('../api/workspaces', () => ({
  getProjectMembers: mockGetProjectMembers,
}))

vi.mock('../api/templates', () => ({
  getTemplates: mockGetTemplates,
}))

vi.mock('../api/labels', () => ({
  getLabels: mockGetLabels,
}))

vi.mock('../components/common/useToast', () => ({
  useToast: () => mockShowToast,
}))

vi.mock('../api/client', () => ({
  extractErrorMessage: mockExtractErrorMessage,
}))

function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
      mutations: {
        retry: false,
      },
    },
  })
}

function renderIssueForm(props: ComponentProps<typeof IssueForm>) {
  const queryClient = createQueryClient()
  const invalidateQueriesSpy = vi.spyOn(queryClient, 'invalidateQueries')

  render(
    <QueryClientProvider client={queryClient}>
      <IssueForm {...props} />
    </QueryClientProvider>
  )

  return { queryClient, invalidateQueriesSpy }
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
    title: 'Existing issue',
    description: 'Existing description',
    type: 'task',
    status: 'todo',
    priority: 'medium',
    points: 3,
    assignee_id: 'member-1',
    assignee_name: 'Alice',
    assignee_avatar_url: null,
    labels: ['Backend'],
    position: 0,
    due_date: '2026-04-01',
    created_at: '2026-03-01T00:00:00Z',
    updated_at: '2026-03-01T00:00:00Z',
    ...overrides,
  }
}

function makeTemplate(overrides: Partial<IssueTemplate> = {}): IssueTemplate {
  return {
    id: 'template-1',
    project_id: 'project-1',
    name: 'Bug Template',
    description: 'Investigate and fix',
    type: 'bug',
    priority: 'high',
    labels: ['Frontend'],
    points: 5,
    created_at: '2026-03-01T00:00:00Z',
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

function makeLabel(overrides: Partial<ProjectLabel> = {}): ProjectLabel {
  return {
    id: 'label-1',
    project_id: 'project-1',
    name: 'Frontend',
    color: '#2563eb',
    created_at: '2026-03-01T00:00:00Z',
    ...overrides,
  }
}

describe('IssueForm', () => {
  beforeEach(() => {
    mockCreateIssue.mockReset()
    mockUpdateIssue.mockReset()
    mockGetIssues.mockReset()
    mockGetProjectMembers.mockReset()
    mockGetTemplates.mockReset()
    mockGetLabels.mockReset()
    mockShowToast.mockReset()
    mockExtractErrorMessage.mockReset()
    mockExtractErrorMessage.mockReturnValue('抽出済みエラー')

    mockGetIssues.mockResolvedValue([])
    mockGetProjectMembers.mockResolvedValue([makeMember()])
    mockGetTemplates.mockResolvedValue([])
    mockGetLabels.mockResolvedValue([
      makeLabel(),
      makeLabel({ id: 'label-2', name: 'Backend', color: '#16a34a' }),
    ])
    mockCreateIssue.mockResolvedValue(makeIssue())
    mockUpdateIssue.mockResolvedValue(makeIssue())
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  test('create mode submits normalized payload and invalidates issue list', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    const { invalidateQueriesSpy } = renderIssueForm({
      projectId: 'project-1',
      sprintId: 'sprint-1',
      onClose,
    })

    await waitFor(() => expect(mockGetIssues).toHaveBeenCalledWith('project-1'))

    await user.type(screen.getByLabelText('タイトル *'), 'New issue')
    await user.type(screen.getByLabelText('ストーリーポイント (0〜999)'), '8')
    await user.selectOptions(screen.getByLabelText('担当者'), 'member-1')
    await user.type(screen.getByLabelText('期限日'), '2026-04-10')
    await user.click(screen.getByRole('button', { name: 'Frontend' }))
    await user.click(screen.getByRole('button', { name: '作成' }))

    await waitFor(() => expect(mockCreateIssue).toHaveBeenCalledTimes(1))
    expect(mockCreateIssue).toHaveBeenCalledWith('project-1', {
      title: 'New issue',
      description: '',
      type: 'task',
      priority: 'medium',
      points: 8,
      assignee_id: 'member-1',
      parent_id: undefined,
      epic_id: undefined,
      due_date: '2026-04-10',
      labels: ['Frontend'],
      sprint_id: 'sprint-1',
    })
    await waitFor(() =>
      expect(invalidateQueriesSpy).toHaveBeenCalledWith({ queryKey: ['issues', 'project-1'] })
    )
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  test('edit mode sends null for cleared nullable fields and invalidates detail query', async () => {
    const user = userEvent.setup()
    const issue = makeIssue({
      parent_id: 'story-1',
      epic_id: 'epic-1',
      labels: ['Frontend', 'Backend'],
    })
    mockGetIssues.mockResolvedValue([
      makeIssue({ id: 'story-1', number: 11, title: 'Parent Story', type: 'story' }),
      makeIssue({ id: 'epic-1', number: 10, title: 'Platform Epic', type: 'epic' }),
    ])
    const onClose = vi.fn()
    const { invalidateQueriesSpy } = renderIssueForm({
      projectId: 'project-1',
      issue,
      onClose,
    })

    await waitFor(() => expect(mockGetIssues).toHaveBeenCalledWith('project-1'))

    await user.selectOptions(screen.getByLabelText('担当者'), '')
    await user.selectOptions(screen.getByLabelText('親ストーリー'), '')
    await user.selectOptions(screen.getByLabelText('エピック'), '')
    await user.clear(screen.getByLabelText('期限日'))
    await user.click(screen.getByRole('button', { name: 'Frontend' }))
    await user.click(screen.getByRole('button', { name: 'Backend' }))
    await user.click(screen.getByRole('button', { name: '更新' }))

    await waitFor(() => expect(mockUpdateIssue).toHaveBeenCalledTimes(1))
    expect(mockUpdateIssue).toHaveBeenCalledWith('issue-1', {
      title: 'Existing issue',
      description: 'Existing description',
      type: 'task',
      priority: 'medium',
      points: 3,
      assignee_id: null,
      parent_id: null,
      epic_id: null,
      due_date: null,
      labels: [],
    })
    await waitFor(() =>
      expect(invalidateQueriesSpy).toHaveBeenCalledWith({ queryKey: ['issues', 'project-1'] })
    )
    expect(invalidateQueriesSpy).toHaveBeenCalledWith({ queryKey: ['issue', 'issue-1'] })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  test('template selection populates fields and parent selection restricts allowed types', async () => {
    const user = userEvent.setup()
    mockGetTemplates.mockResolvedValue([makeTemplate()])
    mockGetIssues.mockResolvedValue([
      makeIssue({ id: 'epic-1', number: 10, title: 'Platform Epic', type: 'epic' }),
      makeIssue({ id: 'story-1', number: 11, title: 'Parent Story', type: 'story' }),
    ])

    renderIssueForm({
      projectId: 'project-1',
      onClose: vi.fn(),
    })

    await waitFor(() =>
      expect(screen.getByRole('option', { name: 'Bug Template' })).toBeInTheDocument()
    )

    await user.selectOptions(
      screen.getByLabelText('テンプレートから作成'),
      'template-1'
    )
    expect(screen.getByLabelText('タイトル *')).toHaveValue('Bug Template')
    expect(screen.getByLabelText('説明')).toHaveValue('Investigate and fix')
    expect(screen.getByLabelText('タイプ')).toHaveValue('bug')
    expect(screen.getByLabelText('優先度')).toHaveValue('high')
    expect(screen.getByLabelText('ストーリーポイント (0〜999)')).toHaveValue(5)
    expect(screen.getByRole('button', { name: 'Frontend' })).toHaveClass('text-white')

    await user.selectOptions(screen.getByLabelText('エピック'), 'epic-1')
    const typeSelectAfterEpic = screen.getByLabelText('タイプ')
    expect(typeSelectAfterEpic).not.toHaveTextContent('Epic')

    await user.selectOptions(screen.getByLabelText('親ストーリー'), 'story-1')
    const typeSelectAfterParent = screen.getByLabelText('タイプ')
    expect(typeSelectAfterParent).toHaveValue('bug')
    expect(typeSelectAfterParent).not.toHaveTextContent('Epic')
    expect(typeSelectAfterParent).not.toHaveTextContent('Story')
  })

  test('epic selection resets epic type to story', async () => {
    const user = userEvent.setup()
    mockGetIssues.mockResolvedValue([
      makeIssue({ id: 'epic-1', number: 10, title: 'Platform Epic', type: 'epic' }),
    ])

    renderIssueForm({
      projectId: 'project-1',
      onClose: vi.fn(),
    })

    await waitFor(() => expect(mockGetIssues).toHaveBeenCalled())

    await user.selectOptions(screen.getByLabelText('タイプ'), 'epic')
    expect(screen.getByLabelText('タイプ')).toHaveValue('epic')

    await user.selectOptions(screen.getByLabelText('エピック'), 'epic-1')
    expect(screen.getByLabelText('タイプ')).toHaveValue('story')
  })

  test('mutation error shows toast with extracted message', async () => {
    const user = userEvent.setup()
    const error = new Error('request failed')
    mockCreateIssue.mockRejectedValue(error)

    renderIssueForm({
      projectId: 'project-1',
      onClose: vi.fn(),
    })

    await user.type(screen.getByLabelText('タイトル *'), 'Broken issue')
    await user.click(screen.getByRole('button', { name: '作成' }))

    await waitFor(() => expect(mockCreateIssue).toHaveBeenCalledTimes(1))
    await waitFor(() =>
      expect(mockShowToast).toHaveBeenCalledWith('抽出済みエラー', 'error')
    )
    expect(mockExtractErrorMessage).toHaveBeenCalledWith(
      error,
      'イシューの作成に失敗しました'
    )
  })
})
