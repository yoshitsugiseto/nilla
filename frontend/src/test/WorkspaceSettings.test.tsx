import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { WorkspaceSettings } from '../components/Settings/WorkspaceSettings'
import { useAuthStore } from '../store/auth'
import { useAppStore } from '../store'
import type { User, WorkspaceAutomationSettings, WorkspaceMember } from '../types'

const {
  mockGetWorkspaceMembers,
  mockGetWorkspaceAutomationSettings,
  mockAddWorkspaceMember,
  mockRemoveWorkspaceMember,
  mockUpdateMemberRole,
  mockUpdateWorkspaceAutomationSettings,
  mockUpdateWorkspace,
  mockGetUsers,
  mockShowToast,
} = vi.hoisted(() => ({
  mockGetWorkspaceMembers: vi.fn(),
  mockGetWorkspaceAutomationSettings: vi.fn(),
  mockAddWorkspaceMember: vi.fn(),
  mockRemoveWorkspaceMember: vi.fn(),
  mockUpdateMemberRole: vi.fn(),
  mockUpdateWorkspaceAutomationSettings: vi.fn(),
  mockUpdateWorkspace: vi.fn(),
  mockGetUsers: vi.fn(),
  mockShowToast: vi.fn(),
}))

vi.mock('../api/workspaces', () => ({
  getWorkspaceMembers: mockGetWorkspaceMembers,
  getWorkspaceAutomationSettings: mockGetWorkspaceAutomationSettings,
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
    mockGetWorkspaceMembers.mockReset()
    mockGetWorkspaceAutomationSettings.mockReset()
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
      searchPresets: [],
      boardFilters: {},
    })
    mockGetWorkspaceAutomationSettings.mockResolvedValue(makeAutomationSettings())
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

    await screen.findByText('Automation')
    await user.click(screen.getByLabelText('レビュー待ちを通知'))

    await waitFor(() =>
      expect(mockUpdateWorkspaceAutomationSettings).toHaveBeenCalledWith('workspace-1', {
        notify_on_review_ready: false,
      })
    )
    expect(invalidateQueriesSpy).toHaveBeenCalledWith({ queryKey: ['workspace-automation', 'workspace-1'] })
  })
})
