import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { TemplateSettings } from '../components/Settings/TemplateSettings'
import { useAuthStore } from '../store/auth'
import type { ProjectMember } from '../types'

const {
  mockGetTemplates,
  mockGetProjectMembers,
  mockShowToast,
} = vi.hoisted(() => ({
  mockGetTemplates: vi.fn(),
  mockGetProjectMembers: vi.fn(),
  mockShowToast: vi.fn(),
}))

vi.mock('../api/templates', () => ({
  getTemplates: mockGetTemplates,
  createTemplate: vi.fn(),
  updateTemplate: vi.fn(),
  deleteTemplate: vi.fn(),
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
    role: 'admin',
    workspace_role: 'admin',
    inherited: true,
    joined_at: '2026-03-01T00:00:00Z',
    ...overrides,
  }
}

describe('TemplateSettings', () => {
  beforeEach(() => {
    mockGetTemplates.mockReset()
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

    mockGetProjectMembers.mockResolvedValue([makeMember()])
  })

  afterEach(() => {
    useAuthStore.setState({ accessToken: null, user: null, isLoading: false })
    vi.restoreAllMocks()
  })

  test('shows simplified error copy without project ids', async () => {
    const queryClient = createQueryClient()
    mockGetTemplates.mockRejectedValue(new Error('network'))

    render(
      <QueryClientProvider client={queryClient}>
        <TemplateSettings projectId="project-1" />
      </QueryClientProvider>
    )

    expect(await screen.findByText('取得に失敗しました')).toBeInTheDocument()
    expect(screen.queryByText(/project-1/)).not.toBeInTheDocument()
  })
})
