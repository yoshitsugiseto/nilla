import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { SettingsPage } from '../pages/SettingsPage'
import { useAppStore } from '../store'

const mockUseProjectPermissions = vi.fn()

vi.mock('../hooks/useProjectPermissions', () => ({
  useProjectPermissions: (...args: unknown[]) => mockUseProjectPermissions(...args),
}))

vi.mock('../components/Settings/WorkspaceSettings', () => ({
  WorkspaceSettings: () => <div>WorkspaceSettings</div>,
}))

vi.mock('../components/Settings/ProjectSettings', () => ({
  ProjectSettings: () => <div>ProjectSettings</div>,
}))

vi.mock('../components/Settings/LabelSettings', () => ({
  LabelSettings: () => <div>LabelSettings</div>,
}))

vi.mock('../components/Settings/TemplateSettings', () => ({
  TemplateSettings: () => <div>TemplateSettings</div>,
}))

describe('SettingsPage', () => {
  beforeEach(() => {
    useAppStore.setState({
      activeWorkspaceId: 'workspace-1',
      activeProjectId: 'project-1',
      activeSprint: null,
      pendingOpenIssueId: null,
      pendingOpenIssueTitle: null,
      searchPresets: [],
      boardFilters: {},
    })
    mockUseProjectPermissions.mockReset()
  })

  test('shows clearer viewer guidance and separates workspace/project sections', () => {
    mockUseProjectPermissions.mockReturnValue({
      role: 'viewer',
      canAdminProject: false,
    })

    render(<SettingsPage />)

    expect(screen.getByRole('heading', { name: '設定' })).toBeInTheDocument()
    expect(screen.getByText('ワークスペース設定に加えて、選択中プロジェクトの権限、ラベル、テンプレートを管理できます。')).toBeInTheDocument()
    expect(screen.getByText('現在のプロジェクト権限は「閲覧専用」です。')).toBeInTheDocument()
    expect(screen.getByText('このプロジェクトの設定は閲覧のみ可能です。変更が必要な場合はプロジェクト管理者に依頼してください。')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Workspace' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Project' })).toBeInTheDocument()
  })
})
