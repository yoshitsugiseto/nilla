import { Settings } from 'lucide-react'
import { WorkspaceSettings } from '../components/Settings/WorkspaceSettings'
import { ProjectSettings } from '../components/Settings/ProjectSettings'
import { LabelSettings } from '../components/Settings/LabelSettings'
import { TemplateSettings } from '../components/Settings/TemplateSettings'
import { useAppStore } from '../store'

export function SettingsPage() {
  const { activeWorkspaceId, activeProjectId } = useAppStore()

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
      <div className="flex items-center gap-2 mb-8">
        <Settings size={20} className="text-gray-500" />
        <h1 className="text-xl font-bold text-gray-900">ワークスペース設定</h1>
      </div>

      <WorkspaceSettings workspaceId={activeWorkspaceId} />

      {activeProjectId && (
        <ProjectSettings projectId={activeProjectId} />
      )}

      {activeProjectId && (
        <LabelSettings projectId={activeProjectId} />
      )}

      {activeProjectId && (
        <TemplateSettings projectId={activeProjectId} />
      )}
    </div>
    </div>
  )
}
