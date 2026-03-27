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
      <div aria-label="settings-shell" className="w-full max-w-4xl p-6">
        <div className="mb-8 flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Settings size={20} className="text-gray-500" />
              <h1 className="text-xl font-bold text-gray-900">設定</h1>
              {activeProjectId && <ProjectRoleBadge role={role} />}
            </div>
            <p className="mt-2 max-w-2xl text-sm text-gray-500">
              ワークスペースとプロジェクトの境界を分けて、運用に必要な設定をセクションごとに確認できます。
            </p>
          </div>
        </div>

        <div
          aria-label="settings-sections"
          className="flex flex-col gap-8"
        >
          <section className="min-w-0 rounded-3xl border border-gray-200 bg-gray-50/60 p-5">
            <div className="mb-5 border-b border-gray-200 pb-4">
              <h2 className="text-base font-semibold text-gray-900">ワークスペース</h2>
              <p className="mt-1 text-sm text-gray-500">
                一般設定、自動化、メンバー管理をワークスペース単位でまとめています。
              </p>
            </div>
            <WorkspaceSettings workspaceId={activeWorkspaceId} />
          </section>

          {activeProjectId && (
            <section className="min-w-0 rounded-3xl border border-blue-100 bg-blue-50/40 p-5">
              <div className="mb-5 border-b border-blue-100 pb-4">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-base font-semibold text-gray-900">プロジェクト</h2>
                  <ProjectRoleBadge role={role} />
                </div>
                <p className="mt-1 text-sm text-gray-500">
                  プロジェクト権限、プロジェクトラベル、イシューテンプレートをプロジェクト単位で管理します。
                </p>
              </div>

              <div className={`mb-6 rounded-2xl border px-4 py-3 text-sm ${
                canAdminProject
                  ? 'border-blue-200 bg-white text-blue-900'
                  : 'border-amber-200 bg-amber-50 text-amber-900'
              }`}>
                <p className="text-xs font-semibold uppercase tracking-wide opacity-70">権限サマリー</p>
                <p className="mt-2 font-medium">
                  現在のプロジェクト権限は「{roleMeta?.label ?? '未設定'}」です。
                </p>
                <p className={`mt-1 text-xs ${canAdminProject ? 'text-blue-700' : 'text-amber-700'}`}>
                  {canAdminProject
                    ? 'このセクションから権限、ラベル、テンプレートをまとめて管理できます。'
                    : roleSummary}
                </p>
              </div>

              <div className="space-y-8">
                <ProjectSettings projectId={activeProjectId} />
                <LabelSettings projectId={activeProjectId} />
                <TemplateSettings projectId={activeProjectId} />
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  )
}
