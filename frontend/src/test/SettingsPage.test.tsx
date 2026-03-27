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
    expect(screen.getByText('ワークスペースとプロジェクトの境界を分けて、運用に必要な設定をセクションごとに確認できます。')).toBeInTheDocument()
    expect(screen.getByText('現在のプロジェクト権限は「閲覧専用」です。')).toBeInTheDocument()
    expect(screen.getByText('このプロジェクトの設定は閲覧のみ可能です。変更が必要な場合はプロジェクト管理者に依頼してください。')).toBeInTheDocument()
    expect(screen.getByLabelText('settings-shell')).toHaveClass('w-full', 'max-w-4xl', 'p-6')
    expect(screen.getByLabelText('settings-sections')).toHaveClass('flex', 'flex-col', 'gap-8')
    expect(screen.getByText('権限サマリー')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'ワークスペース' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'プロジェクト' })).toBeInTheDocument()
    expect(screen.getByText('一般設定、自動化、メンバー管理をワークスペース単位でまとめています。')).toBeInTheDocument()
    expect(screen.getByText('プロジェクト権限、プロジェクトラベル、イシューテンプレートをプロジェクト単位で管理します。')).toBeInTheDocument()
  })
})
