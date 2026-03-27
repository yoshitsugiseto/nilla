import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { IssueDetail } from '../components/Issue/IssueDetail'
import type { Issue, ProjectMember, Sprint } from '../types'

const {
  mockGetIssue,
  mockUpdateIssue,
  mockGetIssueChildren,
  mockGetIssueLinks,
  mockCreateIssueLink,
  mockDeleteIssueLink,
  mockGetIssues,
  mockGetAttachments,
  mockGetLabels,
  mockGetProjectMembers,
  mockGetSprints,
} = vi.hoisted(() => ({
  mockGetIssue: vi.fn(),
  mockUpdateIssue: vi.fn(),
  mockGetIssueChildren: vi.fn(),
  mockGetIssueLinks: vi.fn(),
  mockCreateIssueLink: vi.fn(),
  mockDeleteIssueLink: vi.fn(),
  mockGetIssues: vi.fn(),
  mockGetAttachments: vi.fn(),
  mockGetLabels: vi.fn(),
  mockGetProjectMembers: vi.fn(),
  mockGetSprints: vi.fn(),
}))

const mockUseProjectPermissions = vi.fn()
const mockUseToast = vi.fn()

vi.mock('../api/issues', () => ({
  getIssue: mockGetIssue,
  updateIssue: mockUpdateIssue,
  getIssueChildren: mockGetIssueChildren,
  getIssueLinks: mockGetIssueLinks,
  createIssueLink: mockCreateIssueLink,
  deleteIssueLink: mockDeleteIssueLink,
  getIssues: mockGetIssues,
}))

vi.mock('../api/attachments', () => ({
  getAttachments: mockGetAttachments,
}))

vi.mock('../api/labels', () => ({
  getLabels: mockGetLabels,
}))

vi.mock('../api/workspaces', () => ({
  getProjectMembers: mockGetProjectMembers,
}))

vi.mock('../api/sprints', () => ({
  getSprints: mockGetSprints,
}))

vi.mock('../components/Issue/IssueComments', () => ({
  IssueComments: () => <div>IssueComments</div>,
}))

vi.mock('../components/Issue/IssueFiles', () => ({
  IssueFiles: () => <div>IssueFiles</div>,
}))

vi.mock('../components/Issue/IssueActivity', () => ({
  IssueActivity: () => <div>IssueActivity</div>,
}))

vi.mock('../components/common/useToast', () => ({
  useToast: () => mockUseToast,
}))

vi.mock('../hooks/useProjectPermissions', () => ({
  useProjectPermissions: (...args: unknown[]) => mockUseProjectPermissions(...args),
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
    number: 7,
    title: 'Issue detail',
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

function makeSprint(overrides: Partial<Sprint> = {}): Sprint {
  return {
    id: 'sprint-1',
    project_id: 'project-1',
    name: 'Sprint Alpha',
    goal: null,
    status: 'planning',
    start_date: '2026-03-01',
    end_date: '2026-03-14',
    created_at: '2026-03-01T00:00:00Z',
    updated_at: '2026-03-01T00:00:00Z',
    ...overrides,
  }
}

describe('IssueDetail', () => {
  beforeEach(() => {
    mockGetIssue.mockReset()
    mockUpdateIssue.mockReset()
    mockGetIssueChildren.mockReset()
    mockGetIssueLinks.mockReset()
    mockCreateIssueLink.mockReset()
    mockDeleteIssueLink.mockReset()
    mockGetIssues.mockReset()
    mockGetAttachments.mockReset()
    mockGetLabels.mockReset()
    mockGetProjectMembers.mockReset()
    mockGetSprints.mockReset()
    mockUseProjectPermissions.mockReset()
    mockUseToast.mockReset()

    mockGetIssue.mockResolvedValue(makeIssue())
    mockUpdateIssue.mockResolvedValue(makeIssue())
    mockGetIssueChildren.mockResolvedValue([])
    mockGetIssueLinks.mockResolvedValue([])
    mockGetIssues.mockResolvedValue([
      makeIssue({ id: 'epic-1', number: 42, type: 'epic', title: 'Platform epic' }),
    ])
    mockGetLabels.mockResolvedValue([])
    mockGetProjectMembers.mockResolvedValue([
      makeMember(),
      makeMember({ user_id: 'member-2', name: 'Bob', email: 'bob@example.com' }),
    ])
    mockGetSprints.mockResolvedValue([
      makeSprint(),
      makeSprint({ id: 'sprint-2', name: 'Sprint Beta' }),
    ])
    mockUseProjectPermissions.mockReturnValue({
      canEditProject: true,
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  test('fetches epic candidates with a dedicated filtered query', async () => {
    const queryClient = createQueryClient()

    render(
      <QueryClientProvider client={queryClient}>
        <IssueDetail issueId="issue-1" projectId="project-1" />
      </QueryClientProvider>
    )

    expect(await screen.findByText('Issue detail')).toBeInTheDocument()
    await waitFor(() =>
      expect(mockGetIssues).toHaveBeenCalledWith('project-1', { type: 'epic', limit: 1000 })
    )
    expect(screen.getByRole('option', { name: /#42 Platform epic/ })).toBeInTheDocument()
  })

  test('updates priority, assignee, and sprint from inline sidebar controls', async () => {
    const user = userEvent.setup()
    const queryClient = createQueryClient()

    render(
      <QueryClientProvider client={queryClient}>
        <IssueDetail issueId="issue-1" projectId="project-1" />
      </QueryClientProvider>
    )

    expect(await screen.findByText('Issue detail')).toBeInTheDocument()

    await user.selectOptions(screen.getByLabelText('優先度'), 'high')
    await waitFor(() => expect(mockUpdateIssue).toHaveBeenCalledWith('issue-1', { priority: 'high' }))

    await user.selectOptions(screen.getByLabelText('担当者'), 'member-2')
    await waitFor(() => expect(mockUpdateIssue).toHaveBeenCalledWith('issue-1', { assignee_id: 'member-2' }))

    await user.selectOptions(screen.getByLabelText('スプリント'), 'sprint-2')
    await waitFor(() => expect(mockUpdateIssue).toHaveBeenCalledWith('issue-1', { sprint_id: 'sprint-2' }))
  })
})
