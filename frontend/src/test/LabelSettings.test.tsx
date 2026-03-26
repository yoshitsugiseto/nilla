import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { LabelSettings } from '../components/Settings/LabelSettings'
import { useAuthStore } from '../store/auth'
import type { ProjectLabel, ProjectMember } from '../types'

const {
  mockGetLabels,
  mockGetProjectMembers,
  mockShowToast,
} = vi.hoisted(() => ({
  mockGetLabels: vi.fn(),
  mockGetProjectMembers: vi.fn(),
  mockShowToast: vi.fn(),
}))

vi.mock('../api/labels', () => ({
  getLabels: mockGetLabels,
  createLabel: vi.fn(),
  updateLabel: vi.fn(),
  deleteLabel: vi.fn(),
}))

vi.mock('../api/workspaces', () => ({
  getProjectMembers: mockGetProjectMembers,
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
    user_id: 'member-1',
    name: 'Alice',
    email: 'alice@example.com',
    avatar_url: null,
    role: 'viewer',
    workspace_role: 'viewer',
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

describe('LabelSettings', () => {
  beforeEach(() => {
    mockGetLabels.mockReset()
    mockGetProjectMembers.mockReset()
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

    mockGetLabels.mockResolvedValue([makeLabel()])
    mockGetProjectMembers.mockResolvedValue([makeMember()])
  })

  afterEach(() => {
    useAuthStore.setState({ accessToken: null, user: null, isLoading: false })
    vi.restoreAllMocks()
  })

  test('renders labels in read-only mode for non-admin members', async () => {
    const queryClient = createQueryClient()

    render(
      <QueryClientProvider client={queryClient}>
        <LabelSettings projectId="project-1" />
      </QueryClientProvider>
    )

    expect(await screen.findByText('Frontend')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '編集' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '削除' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '追加' })).not.toBeInTheDocument()
    expect(screen.getByText('現在のプロジェクト権限ではラベルを編集できません。変更が必要な場合はプロジェクト管理者に依頼してください。')).toBeInTheDocument()
  })
})
