import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { IssueActivity } from '../components/Issue/IssueActivity'

const {
  mockGetActivity,
  mockGetComments,
  mockGetProjectMembers,
  mockGetSprints,
} = vi.hoisted(() => ({
  mockGetActivity: vi.fn(),
  mockGetComments: vi.fn(),
  mockGetProjectMembers: vi.fn(),
  mockGetSprints: vi.fn(),
}))

vi.mock('../api/issues', () => ({
  getActivity: mockGetActivity,
  getComments: mockGetComments,
}))

vi.mock('../api/workspaces', () => ({
  getProjectMembers: mockGetProjectMembers,
}))

vi.mock('../api/sprints', () => ({
  getSprints: mockGetSprints,
}))

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
}

describe('IssueActivity', () => {
  beforeEach(() => {
    mockGetActivity.mockReset()
    mockGetComments.mockReset()
    mockGetProjectMembers.mockReset()
    mockGetSprints.mockReset()

    mockGetComments.mockResolvedValue([
      {
        id: 'comment-1',
        issue_id: 'issue-1',
        user_id: 'user-1',
        author_name: 'Alice',
        author_avatar_url: null,
        body: '確認お願いします',
        created_at: '2026-03-27T09:00:00Z',
        updated_at: '2026-03-27T09:00:00Z',
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
      {
        workspace_id: 'workspace-1',
        project_id: 'project-1',
        user_id: 'user-2',
        name: 'Bob',
        email: 'bob@example.com',
        avatar_url: null,
        role: 'editor',
        workspace_role: 'member',
        inherited: true,
        joined_at: '2026-03-01T00:00:00Z',
      },
    ])
    mockGetSprints.mockResolvedValue([
      {
        id: 'sprint-1',
        project_id: 'project-1',
        name: 'Sprint Alpha',
        goal: null,
        status: 'active',
        start_date: '2026-03-01',
        end_date: '2026-03-14',
        created_at: '2026-03-01T00:00:00Z',
        updated_at: '2026-03-01T00:00:00Z',
      },
      {
        id: 'sprint-2',
        project_id: 'project-1',
        name: 'Sprint Beta',
        goal: null,
        status: 'planning',
        start_date: '2026-03-15',
        end_date: '2026-03-28',
        created_at: '2026-03-15T00:00:00Z',
        updated_at: '2026-03-15T00:00:00Z',
      },
    ])
  })

  test('renders grouped readable activity changes and automation events', async () => {
    const queryClient = createQueryClient()

    mockGetActivity.mockResolvedValue([
      {
        id: 'activity-1',
        issue_id: 'issue-1',
        field: 'assignee_id',
        old_value: null,
        new_value: 'user-2',
        created_at: '2026-03-27T10:00:00Z',
      },
      {
        id: 'activity-2',
        issue_id: 'issue-1',
        field: 'labels',
        old_value: '[]',
        new_value: '["Frontend","Bug"]',
        created_at: '2026-03-27T10:00:00Z',
      },
      {
        id: 'activity-3',
        issue_id: 'issue-1',
        field: 'review_ready',
        old_value: 'Alice',
        new_value: 'user-2',
        created_at: '2026-03-27T10:00:00Z',
      },
      {
        id: 'activity-4',
        issue_id: 'issue-1',
        field: 'sprint_carryover',
        old_value: 'sprint-1',
        new_value: 'sprint-2',
        created_at: '2026-03-27T11:00:00Z',
      },
    ])

    render(
      <QueryClientProvider client={queryClient}>
        <IssueActivity issueId="issue-1" projectId="project-1" />
      </QueryClientProvider>
    )

    expect(await screen.findByText('確認お願いします')).toBeInTheDocument()
    expect(screen.getByText('まとめて更新')).toBeInTheDocument()
    expect(screen.getByText('3件')).toBeInTheDocument()
    expect(screen.getByText('Alice が Bob にレビュー待ち通知を送信')).toBeInTheDocument()
    expect(screen.getByText('スプリント完了に伴い Sprint Alpha から Sprint Beta に移動')).toBeInTheDocument()
    expect(screen.getByText('Bob')).toBeInTheDocument()
    expect(screen.getByText('Frontend')).toBeInTheDocument()
    expect(screen.getByText('Bug')).toBeInTheDocument()
  })
})
