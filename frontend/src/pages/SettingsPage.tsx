import { Settings } from 'lucide-react'
import { WorkspaceSettings } from '../components/Settings/WorkspaceSettings'
import { ProjectSettings } from '../components/Settings/ProjectSettings'
import { LabelSettings } from '../components/Settings/LabelSettings'
import { TemplateSettings } from '../components/Settings/TemplateSettings'
import { ProjectRoleBadge } from '../components/common/ProjectRoleBadge'
import { useProjectPermissions } from '../hooks/useProjectPermissions'
import { useAppStore } from '../store'
import { getProjectRoleMeta } from '../utils/projectRoles'

export function SettingsPage() {
  const { activeWorkspaceId, activeProjectId } = useAppStore()
  const { role, canAdminProject } = useProjectPermissions(activeProjectId)
  const roleMeta = getProjectRoleMeta(role)
  const roleSummary = role === 'viewer'
    ? 'このプロジェクトの設定は閲覧のみ可能です。変更が必要な場合はプロジェクト管理者に依頼してください。'
    : 'イシューやスプリントは編集できますが、ラベルやテンプレートなど管理系設定はプロジェクト管理者のみ変更できます。'

  if (!activeWorkspaceId) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-400">
        ← ワークスペースを選択してください
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="p-6 max-w-6xl">
        <div className="mb-8 flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Settings size={20} className="text-gray-500" />
              <h1 className="text-xl font-bold text-gray-900">設定</h1>
              {activeProjectId && <ProjectRoleBadge role={role} />}
            </div>
            <p className="mt-2 max-w-2xl text-sm text-gray-500">
              ワークスペース設定に加えて、選択中プロジェクトの権限、ラベル、テンプレートを管理できます。
            </p>
          </div>

          {activeProjectId && (
            <div className={`rounded-2xl border px-4 py-3 text-sm xl:max-w-sm ${
              canAdminProject
                ? 'border-blue-200 bg-blue-50 text-blue-900'
                : 'border-amber-200 bg-amber-50 text-amber-900'
            }`}>
              <p className="text-xs font-semibold uppercase tracking-wide opacity-70">Project Summary</p>
              <p className="mt-2 font-medium">
                現在のプロジェクト権限は「{roleMeta?.label ?? '未設定'}」です。
              </p>
              <p className={`mt-1 text-xs ${canAdminProject ? 'text-blue-700' : 'text-amber-700'}`}>
                {canAdminProject
                  ? 'プロジェクト権限、ラベル、テンプレートをここでまとめて管理できます。'
                  : roleSummary}
              </p>
            </div>
          )}
        </div>

        <div
          aria-label="settings-columns"
          className={activeProjectId
            ? 'grid gap-8 xl:grid-cols-[minmax(18rem,0.95fr)_minmax(0,1.35fr)]'
            : 'grid gap-8'}
        >
          <div className="min-w-0">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">Workspace</h2>
            <WorkspaceSettings workspaceId={activeWorkspaceId} />
          </div>

          {activeProjectId && (
            <div className="min-w-0">
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">Project</h2>
              <ProjectSettings projectId={activeProjectId} />
            </div>
          )}
        </div>

        {activeProjectId && (
          <div
            aria-label="settings-project-assets"
            className="mt-8 grid gap-6 xl:grid-cols-[minmax(18rem,0.95fr)_minmax(0,1.35fr)]"
          >
            <LabelSettings projectId={activeProjectId} />
            <TemplateSettings projectId={activeProjectId} />
          </div>
        )}
      </div>
    </div>
  )
}
