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

  if (!activeWorkspaceId) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-400">
        ← ワークスペースを選択してください
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto">
    <div className="p-6 max-w-2xl">
      <div className="mb-8">
        <div className="flex items-center gap-2">
        <Settings size={20} className="text-gray-500" />
        <h1 className="text-xl font-bold text-gray-900">設定</h1>
        {activeProjectId && <ProjectRoleBadge role={role} />}
        </div>
        <p className="mt-2 text-sm text-gray-500">
          ワークスペース設定に加えて、選択中プロジェクトの権限、ラベル、テンプレートを管理できます。
        </p>
      </div>

      {activeProjectId && !canAdminProject && (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <p className="font-medium">
            現在のプロジェクト権限は「{roleMeta?.label ?? '未設定'}」です。
          </p>
          <p className="mt-1 text-xs text-amber-700">
            {role === 'viewer'
              ? 'このプロジェクトの設定は閲覧のみ可能です。変更が必要な場合はプロジェクト管理者に依頼してください。'
              : 'イシューやスプリントは編集できますが、ラベルやテンプレートなど管理系設定はプロジェクト管理者のみ変更できます。'}
          </p>
        </div>
      )}

      <div className="mb-8">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">Workspace</h2>
      <WorkspaceSettings workspaceId={activeWorkspaceId} />
      </div>

      {activeProjectId && (
        <div>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">Project</h2>
          <ProjectSettings projectId={activeProjectId} />
          <LabelSettings projectId={activeProjectId} />
          <TemplateSettings projectId={activeProjectId} />
        </div>
      )}
    </div>
    </div>
  )
}
