import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { ProjectSettings } from '../components/Settings/ProjectSettings'
import { useAuthStore } from '../store/auth'
import type { ProjectMember } from '../types'

const {
  mockGetProjectMembers,
  mockUpdateProjectMemberRole,
  mockClearProjectMemberRole,
  mockShowToast,
} = vi.hoisted(() => ({
  mockGetProjectMembers: vi.fn(),
  mockUpdateProjectMemberRole: vi.fn(),
  mockClearProjectMemberRole: vi.fn(),
  mockShowToast: vi.fn(),
}))

vi.mock('../api/workspaces', () => ({
  getProjectMembers: mockGetProjectMembers,
  updateProjectMemberRole: mockUpdateProjectMemberRole,
  clearProjectMemberRole: mockClearProjectMemberRole,
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

function makeMember(overrides: Partial<ProjectMember> = {}): ProjectMember {
  return {
    workspace_id: 'workspace-1',
    project_id: 'project-1',
    user_id: 'user-1',
    name: 'Alice',
    email: 'alice@example.com',
    avatar_url: null,
    role: 'admin',
    workspace_role: 'owner',
    inherited: true,
    joined_at: '2026-03-01T00:00:00Z',
    ...overrides,
  }
}

function renderProjectSettings() {
  const queryClient = createQueryClient()

  render(
    <QueryClientProvider client={queryClient}>
      <ProjectSettings projectId="project-1" />
    </QueryClientProvider>
  )
}

describe('ProjectSettings', () => {
  beforeEach(() => {
    mockGetProjectMembers.mockReset()
    mockUpdateProjectMemberRole.mockReset()
    mockClearProjectMemberRole.mockReset()
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
  })

  afterEach(() => {
    useAuthStore.setState({ accessToken: null, user: null, isLoading: false })
    vi.restoreAllMocks()
  })

  test('project admins can update and clear member overrides', async () => {
    const user = userEvent.setup()
    mockGetProjectMembers.mockResolvedValue([
      makeMember(),
      makeMember({
        user_id: 'user-2',
        name: 'Bob',
        role: 'viewer',
        workspace_role: 'member',
        inherited: false,
      }),
    ])
    mockUpdateProjectMemberRole.mockResolvedValue(undefined)
    mockClearProjectMemberRole.mockResolvedValue(undefined)

    renderProjectSettings()

    expect(await screen.findByText('Bob')).toBeInTheDocument()

    const selects = screen.getAllByRole('combobox')
    await user.selectOptions(selects[1], 'editor')

    await waitFor(() =>
      expect(mockUpdateProjectMemberRole).toHaveBeenCalledWith('project-1', 'user-2', 'editor')
    )

    const bobRow = screen.getByText('Bob').closest('li')
    expect(bobRow).not.toBeNull()

    await user.click(within(bobRow!).getByRole('button', { name: '継承に戻す' }))

    await waitFor(() =>
      expect(mockClearProjectMemberRole).toHaveBeenCalledWith('project-1', 'user-2')
    )
  })

  test('non-admin members only see read-only project roles', async () => {
    mockGetProjectMembers.mockResolvedValue([
      makeMember({
        role: 'editor',
        workspace_role: 'member',
      }),
      makeMember({
        user_id: 'user-2',
        name: 'Bob',
        role: 'viewer',
        workspace_role: 'viewer',
      }),
    ])

    renderProjectSettings()

    expect(await screen.findByText('Bob')).toBeInTheDocument()
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '継承に戻す' })).not.toBeInTheDocument()
    expect(screen.getByText('Editor')).toBeInTheDocument()
    expect(screen.getByText('Viewer')).toBeInTheDocument()
  })
})
