import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { WorkspaceSettings } from '../components/Settings/WorkspaceSettings'
import { useAuthStore } from '../store/auth'
import { useAppStore } from '../store'
import type { User, WorkspaceAutomationLog, WorkspaceAutomationSettings, WorkspaceMember } from '../types'

const {
  mockGetWorkspace,
  mockGetWorkspaceMembers,
  mockGetWorkspaceAutomationSettings,
  mockGetWorkspaceAutomationLogs,
  mockAddWorkspaceMember,
  mockRemoveWorkspaceMember,
  mockUpdateMemberRole,
  mockUpdateWorkspaceAutomationSettings,
  mockUpdateWorkspace,
  mockGetUsers,
  mockShowToast,
} = vi.hoisted(() => ({
  mockGetWorkspace: vi.fn(),
  mockGetWorkspaceMembers: vi.fn(),
  mockGetWorkspaceAutomationSettings: vi.fn(),
  mockGetWorkspaceAutomationLogs: vi.fn(),
  mockAddWorkspaceMember: vi.fn(),
  mockRemoveWorkspaceMember: vi.fn(),
  mockUpdateMemberRole: vi.fn(),
  mockUpdateWorkspaceAutomationSettings: vi.fn(),
  mockUpdateWorkspace: vi.fn(),
  mockGetUsers: vi.fn(),
  mockShowToast: vi.fn(),
}))

vi.mock('../api/workspaces', () => ({
  getWorkspace: mockGetWorkspace,
  getWorkspaceMembers: mockGetWorkspaceMembers,
  getWorkspaceAutomationSettings: mockGetWorkspaceAutomationSettings,
  getWorkspaceAutomationLogs: mockGetWorkspaceAutomationLogs,
  addWorkspaceMember: mockAddWorkspaceMember,
  removeWorkspaceMember: mockRemoveWorkspaceMember,
  updateMemberRole: mockUpdateMemberRole,
  updateWorkspaceAutomationSettings: mockUpdateWorkspaceAutomationSettings,
  updateWorkspace: mockUpdateWorkspace,
  getUsers: mockGetUsers,
}))

vi.mock('../components/common/useToast', () => ({
  useToast: () => mockShowToast,
}))

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
}

function makeMember(overrides: Partial<WorkspaceMember> = {}): WorkspaceMember {
  return {
    workspace_id: 'workspace-1',
    user_id: 'user-1',
    name: 'Alice',
    email: 'alice@example.com',
    avatar_url: null,
    role: 'owner',
    joined_at: '2026-03-01T00:00:00Z',
    ...overrides,
  }
}

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 'user-2',
    name: 'Bob',
    email: 'bob@example.com',
    avatar_url: null,
    provider: 'github',
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
    slack_webhook_url: null,
    ...overrides,
  }
}

function makeAutomationLog(
  overrides: Partial<WorkspaceAutomationLog> = {}
): WorkspaceAutomationLog {
  return {
    id: 'log-1',
    workspace_id: 'workspace-1',
    project_id: 'project-1',
    issue_id: 'issue-1',
    issue_title: 'Needs review',
    rule_type: 'review_ready',
    status: 'sent',
    target_user_id: 'user-2',
    target_user_name: 'Bob',
    message: 'Alice が「Needs review」をレビュー待ちにしました',
    created_at: '2026-03-27T09:30:00Z',
    ...overrides,
  }
}

function renderWorkspaceSettings() {
  const queryClient = createQueryClient()
  const invalidateQueriesSpy = vi.spyOn(queryClient, 'invalidateQueries')

  render(
    <QueryClientProvider client={queryClient}>
      <WorkspaceSettings workspaceId="workspace-1" />
    </QueryClientProvider>
  )

  return { invalidateQueriesSpy }
}

describe('WorkspaceSettings', () => {
  beforeEach(() => {
    mockGetWorkspace.mockReset()
    mockGetWorkspaceMembers.mockReset()
    mockGetWorkspaceAutomationSettings.mockReset()
    mockGetWorkspaceAutomationLogs.mockReset()
    mockAddWorkspaceMember.mockReset()
    mockRemoveWorkspaceMember.mockReset()
    mockUpdateMemberRole.mockReset()
    mockUpdateWorkspaceAutomationSettings.mockReset()
    mockUpdateWorkspace.mockReset()
    mockGetUsers.mockReset()
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
    useAppStore.setState({
      activeWorkspaceId: 'workspace-1',
      activeProjectId: 'project-1',
      activeSprint: null,
      pendingOpenIssueId: null,
      pendingOpenIssueTitle: null,
      boardFilters: {},
    })
    mockGetWorkspace.mockResolvedValue({
      id: 'workspace-1',
      name: 'Workspace Alpha',
      created_by: 'user-1',
      created_at: '2026-03-01T00:00:00Z',
      updated_at: '2026-03-01T00:00:00Z',
    })
    mockGetWorkspaceAutomationSettings.mockResolvedValue(makeAutomationSettings())
    mockGetWorkspaceAutomationLogs.mockResolvedValue([])
  })

  afterEach(() => {
    useAuthStore.setState({ accessToken: null, user: null, isLoading: false })
    vi.restoreAllMocks()
  })

  test('adding a workspace member also invalidates project members', async () => {
    const user = userEvent.setup()
    mockGetWorkspaceMembers.mockResolvedValue([makeMember()])
    mockGetUsers.mockResolvedValue([makeUser()])
    mockAddWorkspaceMember.mockResolvedValue(undefined)

    const { invalidateQueriesSpy } = renderWorkspaceSettings()

    await screen.findByText('Alice')
    await user.selectOptions(screen.getByLabelText('追加するユーザー'), 'user-2')
    await user.click(screen.getByRole('button', { name: '追加' }))

    await waitFor(() =>
      expect(mockAddWorkspaceMember).toHaveBeenCalledWith('workspace-1', 'user-2', 'member')
    )
    expect(invalidateQueriesSpy).toHaveBeenCalledWith({ queryKey: ['workspace-members', 'workspace-1'] })
    expect(invalidateQueriesSpy).toHaveBeenCalledWith({ queryKey: ['project-members', 'project-1'] })
  })

  test('removing a workspace member also invalidates project members', async () => {
    const user = userEvent.setup()
    mockGetWorkspaceMembers.mockResolvedValue([
      makeMember(),
      makeMember({
        user_id: 'user-2',
        name: 'Bob',
        email: 'bob@example.com',
        role: 'member',
      }),
    ])
    mockGetUsers.mockResolvedValue([])
    mockRemoveWorkspaceMember.mockResolvedValue(undefined)

    const { invalidateQueriesSpy } = renderWorkspaceSettings()

    await screen.findByText('Bob')
    await user.click(screen.getByRole('button', { name: 'メンバーを削除' }))

    await waitFor(() =>
      expect(mockRemoveWorkspaceMember).toHaveBeenCalledWith('workspace-1', 'user-2')
    )
    expect(invalidateQueriesSpy).toHaveBeenCalledWith({ queryKey: ['workspace-members', 'workspace-1'] })
    expect(invalidateQueriesSpy).toHaveBeenCalledWith({ queryKey: ['project-members', 'project-1'] })
  })

  test('updating automation settings calls the workspace automation API', async () => {
    const user = userEvent.setup()
    mockGetWorkspaceMembers.mockResolvedValue([makeMember()])
    mockGetUsers.mockResolvedValue([])
    mockUpdateWorkspaceAutomationSettings.mockResolvedValue(
      makeAutomationSettings({ notify_on_review_ready: false })
    )

    const { invalidateQueriesSpy } = renderWorkspaceSettings()

    await screen.findByText('自動化')
    await user.click(screen.getByLabelText('レビュー待ちを通知'))

    await waitFor(() =>
      expect(mockUpdateWorkspaceAutomationSettings).toHaveBeenCalledWith('workspace-1', {
        notify_on_review_ready: false,
      })
    )
    expect(invalidateQueriesSpy).toHaveBeenCalledWith({ queryKey: ['workspace-automation', 'workspace-1'] })
  })

  test('loads the workspace name from the dedicated workspace query', async () => {
    mockGetWorkspaceMembers.mockResolvedValue([makeMember()])
    mockGetUsers.mockResolvedValue([])

    renderWorkspaceSettings()

    expect(await screen.findByText('Workspace Alpha')).toBeInTheDocument()
    expect(mockGetWorkspace).toHaveBeenCalledWith('workspace-1')
  })

  test('renders recent automation execution logs', async () => {
    const user = userEvent.setup()
    mockGetWorkspaceMembers.mockResolvedValue([makeMember()])
    mockGetUsers.mockResolvedValue([])
    mockGetWorkspaceAutomationLogs.mockResolvedValue([
      makeAutomationLog(),
      makeAutomationLog({
        id: 'log-2',
        rule_type: 'sprint_carryover',
        status: 'applied',
        issue_title: 'Carry over issue',
        target_user_id: null,
        target_user_name: null,
        message: '未完了イシューを Sprint Beta へ移動しました',
      }),
      makeAutomationLog({
        id: 'log-3',
        rule_type: 'review_ready',
        status: 'skipped',
        issue_title: 'Needs owner',
        target_user_id: null,
        target_user_name: null,
        message: '担当者がいないためレビュー待ち通知を送信しませんでした',
      }),
    ])

    renderWorkspaceSettings()

    expect(await screen.findByText('最近の自動化実行')).toBeInTheDocument()
    expect(await screen.findByText('Needs review')).toBeInTheDocument()
    expect(screen.getByText('Carry over issue')).toBeInTheDocument()
    expect(screen.getAllByText('送信').length).toBeGreaterThan(0)
    expect(screen.getAllByText('適用').length).toBeGreaterThan(0)

    await user.selectOptions(screen.getByLabelText('自動化ルール絞り込み'), 'review_ready')
    expect(screen.getByText('Needs review')).toBeInTheDocument()
    expect(screen.queryByText('Carry over issue')).not.toBeInTheDocument()

    await user.selectOptions(screen.getByLabelText('自動化結果絞り込み'), 'skipped')
    expect(screen.getByText('Needs owner')).toBeInTheDocument()
    expect(screen.queryByText('Needs review')).not.toBeInTheDocument()
  })

  test('loads additional automation logs when requesting more', async () => {
    const user = userEvent.setup()
    mockGetWorkspaceMembers.mockResolvedValue([makeMember()])
    mockGetUsers.mockResolvedValue([])
    mockGetWorkspaceAutomationLogs
      .mockResolvedValueOnce(Array.from({ length: 20 }, (_, index) => makeAutomationLog({
        id: `log-${index + 1}`,
        issue_title: `Issue ${index + 1}`,
      })))
      .mockResolvedValueOnce([
        makeAutomationLog({ id: 'log-21', issue_title: 'Issue 21' }),
        makeAutomationLog({ id: 'log-22', issue_title: 'Issue 22' }),
      ])

    renderWorkspaceSettings()

    expect(await screen.findByText('Issue 1')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'さらに表示' }))

    await waitFor(() =>
      expect(mockGetWorkspaceAutomationLogs).toHaveBeenNthCalledWith(2, 'workspace-1', {
        limit: 20,
        offset: 20,
      })
    )
    expect(await screen.findByText('Issue 22')).toBeInTheDocument()
  })
})
