import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Shield, Eye, Pencil, Undo2, FolderCog } from 'lucide-react'
import { getProjectMembers, updateProjectMemberRole, clearProjectMemberRole } from '../../api/workspaces'
import { Avatar } from '../common/Avatar'
import { useToast } from '../common/useToast'
import { useAuthStore } from '../../store/auth'
import type { ProjectRole } from '../../types'

const ROLE_OPTIONS: { value: ProjectRole; label: string; icon: React.ReactNode }[] = [
  { value: 'admin', label: 'Admin', icon: <Shield size={12} /> },
  { value: 'editor', label: 'Editor', icon: <Pencil size={12} /> },
  { value: 'viewer', label: 'Viewer', icon: <Eye size={12} /> },
]

const roleColor: Record<ProjectRole, string> = {
  admin: 'bg-blue-100 text-blue-700',
  editor: 'bg-emerald-100 text-emerald-700',
  viewer: 'bg-gray-100 text-gray-600',
}

interface Props {
  projectId: string
}

export function ProjectSettings({ projectId }: Props) {
  const qc = useQueryClient()
  const showToast = useToast()
  const { user } = useAuthStore()

  const { data: members = [], isLoading } = useQuery({
    queryKey: ['project-members', projectId],
    queryFn: () => getProjectMembers(projectId),
    enabled: !!projectId,
  })

  const myMember = members.find(member => member.user_id === user?.id)
  const isProjectAdmin = myMember?.role === 'admin'

  const roleMutation = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: ProjectRole }) =>
      updateProjectMemberRole(projectId, userId, role),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['project-members', projectId] })
      showToast('プロジェクト権限を更新しました', 'success')
    },
    onError: () => showToast('プロジェクト権限の更新に失敗しました', 'error'),
  })

  const clearMutation = useMutation({
    mutationFn: (userId: string) => clearProjectMemberRole(projectId, userId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['project-members', projectId] })
      showToast('継承設定に戻しました', 'success')
    },
    onError: () => showToast('継承設定への復帰に失敗しました', 'error'),
  })

  return (
    <section className="mt-8">
      <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3 flex items-center gap-1.5">
        <FolderCog size={13} /> プロジェクト権限
      </h2>
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {isLoading ? (
          <div className="p-6 text-center text-gray-400 text-sm">読み込み中...</div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {members.map(member => (
              <li key={member.user_id} className="flex items-center gap-3 px-4 py-3">
                <Avatar name={member.name} avatarUrl={member.avatar_url ?? undefined} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-800 truncate">{member.name}</span>
                    {member.user_id === user?.id && (
                      <span className="text-xs text-blue-500">(あなた)</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs text-gray-400">
                      workspace: {member.workspace_role}
                    </span>
                    <span className="text-xs text-gray-300">/</span>
                    <span className="text-xs text-gray-400">
                      {member.inherited ? 'project: 継承' : 'project: override'}
                    </span>
                  </div>
                </div>

                {isProjectAdmin ? (
                  <div className="flex items-center gap-2">
                    <select
                      value={member.role}
                      onChange={e => roleMutation.mutate({ userId: member.user_id, role: e.target.value as ProjectRole })}
                      className="text-xs border border-gray-200 rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-blue-400"
                    >
                      {ROLE_OPTIONS.map(option => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                    <button
                      onClick={() => clearMutation.mutate(member.user_id)}
                      disabled={member.inherited || clearMutation.isPending}
                      className="p-1 text-gray-300 hover:text-gray-600 disabled:opacity-30"
                      aria-label="継承に戻す"
                    >
                      <Undo2 size={13} />
                    </button>
                  </div>
                ) : (
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex items-center gap-1 ${roleColor[member.role]}`}>
                    {ROLE_OPTIONS.find(option => option.value === member.role)?.icon}
                    {ROLE_OPTIONS.find(option => option.value === member.role)?.label}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}
