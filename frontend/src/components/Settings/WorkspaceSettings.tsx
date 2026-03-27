import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Trash2, Crown, Shield, User as UserIcon, Eye, Pencil, Check, X, UserPlus } from 'lucide-react'
import {
  getWorkspaceMembers,
  getWorkspaceAutomationSettings,
  addWorkspaceMember,
  removeWorkspaceMember,
  updateMemberRole,
  updateWorkspaceAutomationSettings,
  updateWorkspace,
  getUsers,
} from '../../api/workspaces'
import { Avatar } from '../common/Avatar'
import { useToast } from '../common/useToast'
import { useAuthStore } from '../../store/auth'
import { useAppStore } from '../../store'
import type { SprintCarryoverMode } from '../../types'

type Role = 'owner' | 'admin' | 'member' | 'viewer'

const ROLE_OPTIONS: { value: Role; label: string; icon: React.ReactNode }[] = [
  { value: 'owner', label: 'オーナー', icon: <Crown size={12} /> },
  { value: 'admin', label: '管理者', icon: <Shield size={12} /> },
  { value: 'member', label: 'メンバー', icon: <UserIcon size={12} /> },
  { value: 'viewer', label: '閲覧専用', icon: <Eye size={12} /> },
]

const roleColor: Record<Role, string> = {
  owner: 'bg-yellow-100 text-yellow-700',
  admin: 'bg-blue-100 text-blue-700',
  member: 'bg-gray-100 text-gray-700',
  viewer: 'bg-purple-100 text-purple-700',
}

interface Props {
  workspaceId: string
}

export function WorkspaceSettings({ workspaceId }: Props) {
  const qc = useQueryClient()
  const showToast = useToast()
  const { user } = useAuthStore()
  const { activeProjectId } = useAppStore()

  const [editingName, setEditingName] = useState(false)
  const [nameInput, setNameInput] = useState('')
  const [addUserId, setAddUserId] = useState('')
  const [addRole, setAddRole] = useState<Role>('member')

  const { data: members = [], isLoading: membersLoading } = useQuery({
    queryKey: ['workspace-members', workspaceId],
    queryFn: () => getWorkspaceMembers(workspaceId),
    enabled: !!workspaceId,
  })

  const { data: allUsers = [] } = useQuery({
    queryKey: ['users'],
    queryFn: getUsers,
  })
  const { data: automationSettings } = useQuery({
    queryKey: ['workspace-automation', workspaceId],
    queryFn: () => getWorkspaceAutomationSettings(workspaceId),
    enabled: !!workspaceId,
  })

  const memberIds = new Set(members.map(m => m.user_id))
  const addableUsers = allUsers.filter(u => !memberIds.has(u.id))

  const myRole = members.find(m => m.user_id === user?.id)?.role as Role | undefined
  const isAdmin = myRole === 'owner' || myRole === 'admin'

  const invalidateProjectMembers = () => {
    if (!activeProjectId) return
    qc.invalidateQueries({ queryKey: ['project-members', activeProjectId] })
  }

  const renameMutation = useMutation({
    mutationFn: (name: string) => updateWorkspace(workspaceId, name),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workspaces'] })
      setEditingName(false)
      showToast('ワークスペース名を更新しました', 'success')
    },
    onError: () => showToast('更新に失敗しました', 'error'),
  })

  const addMutation = useMutation({
    mutationFn: () => addWorkspaceMember(workspaceId, addUserId, addRole),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workspace-members', workspaceId] })
      invalidateProjectMembers()
      setAddUserId('')
      setAddRole('member')
      showToast('メンバーを追加しました', 'success')
    },
    onError: () => showToast('追加に失敗しました', 'error'),
  })

  const roleMutation = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: Role }) =>
      updateMemberRole(workspaceId, userId, role),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workspace-members', workspaceId] })
      invalidateProjectMembers()
    },
    onError: () => showToast('ロールの変更に失敗しました', 'error'),
  })

  const removeMutation = useMutation({
    mutationFn: (userId: string) => removeWorkspaceMember(workspaceId, userId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workspace-members', workspaceId] })
      invalidateProjectMembers()
      showToast('メンバーを削除しました', 'success')
    },
    onError: () => showToast('削除に失敗しました', 'error'),
  })
  const automationMutation = useMutation({
    mutationFn: (data: {
      notify_on_assignee_change?: boolean
      notify_on_review_ready?: boolean
      notify_on_overdue_transition?: boolean
      sprint_carryover_mode?: SprintCarryoverMode
    }) => updateWorkspaceAutomationSettings(workspaceId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workspace-automation', workspaceId] })
      showToast('Automation 設定を更新しました', 'success')
    },
    onError: () => showToast('Automation 設定の更新に失敗しました', 'error'),
  })

  const workspace = qc.getQueryData<{ id: string; name: string }[]>(['workspaces'])
    ?.find(w => w.id === workspaceId)

  return (
    <>
      {/* Workspace Name */}
      <section className="mb-8">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">一般</h2>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <label className="block text-xs text-gray-400 mb-1">ワークスペース名</label>
          {editingName ? (
            <div className="flex items-center gap-2">
              <input
                autoFocus
                value={nameInput}
                onChange={e => setNameInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') renameMutation.mutate(nameInput)
                  if (e.key === 'Escape') setEditingName(false)
                }}
                className="flex-1 border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                onClick={() => renameMutation.mutate(nameInput)}
                disabled={renameMutation.isPending || !nameInput.trim()}
                className="p-1 text-green-600 hover:text-green-700 disabled:opacity-40"
              >
                <Check size={16} />
              </button>
              <button onClick={() => setEditingName(false)} className="p-1 text-gray-400 hover:text-gray-600">
                <X size={16} />
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-gray-800">{workspace?.name ?? '—'}</span>
              {isAdmin && (
                <button
                  onClick={() => { setNameInput(workspace?.name ?? ''); setEditingName(true) }}
                  className="flex items-center gap-1 text-xs text-gray-400 hover:text-blue-600"
                >
                  <Pencil size={12} /> 編集
                </button>
              )}
            </div>
          )}
        </div>
      </section>

      <section className="mb-8">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Automation</h2>
        <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-gray-800">担当変更を通知</p>
              <p className="text-xs text-gray-500 mt-1">担当者が変わったときに新しい assignee へ通知します。</p>
            </div>
            <input
              aria-label="担当変更を通知"
              type="checkbox"
              checked={automationSettings?.notify_on_assignee_change ?? true}
              disabled={!isAdmin || automationMutation.isPending || !automationSettings}
              onChange={e => automationMutation.mutate({ notify_on_assignee_change: e.target.checked })}
              className="mt-1 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 disabled:opacity-50"
            />
          </div>

          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-gray-800">レビュー待ちを通知</p>
              <p className="text-xs text-gray-500 mt-1">Issue が `in_review` に変わったときに担当者へ通知します。</p>
            </div>
            <input
              aria-label="レビュー待ちを通知"
              type="checkbox"
              checked={automationSettings?.notify_on_review_ready ?? true}
              disabled={!isAdmin || automationMutation.isPending || !automationSettings}
              onChange={e => automationMutation.mutate({ notify_on_review_ready: e.target.checked })}
              className="mt-1 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 disabled:opacity-50"
            />
          </div>

          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-gray-800">期限超過を通知</p>
              <p className="text-xs text-gray-500 mt-1">期限切れに遷移したタイミングで担当者へ通知します。</p>
            </div>
            <input
              aria-label="期限超過を通知"
              type="checkbox"
              checked={automationSettings?.notify_on_overdue_transition ?? true}
              disabled={!isAdmin || automationMutation.isPending || !automationSettings}
              onChange={e => automationMutation.mutate({ notify_on_overdue_transition: e.target.checked })}
              className="mt-1 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 disabled:opacity-50"
            />
          </div>

          <div>
            <label htmlFor="workspace-carryover-mode" className="block text-sm font-medium text-gray-800 mb-1">
              スプリント完了時の未完了イシュー
            </label>
            <p className="text-xs text-gray-500 mb-2">完了時の carry over 先をワークスペースの共通ルールとして決めます。</p>
            <select
              id="workspace-carryover-mode"
              value={automationSettings?.sprint_carryover_mode ?? 'prompt'}
              disabled={!isAdmin || automationMutation.isPending || !automationSettings}
              onChange={e => automationMutation.mutate({ sprint_carryover_mode: e.target.value as SprintCarryoverMode })}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
            >
              <option value="prompt">毎回選ぶ</option>
              <option value="backlog">常に Backlog に戻す</option>
              <option value="next_sprint">次の未完了 sprint に送る</option>
            </select>
            {!isAdmin && (
              <p className="mt-2 text-xs text-gray-400">Automation 設定の変更はワークスペース管理者のみ可能です。</p>
            )}
          </div>
        </div>
      </section>

      {/* Members */}
      <section>
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
          メンバー ({members.length})
        </h2>

        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-4">
          {membersLoading ? (
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
                    {member.email && (
                      <span className="text-xs text-gray-400 truncate">{member.email}</span>
                    )}
                  </div>

                  {/* Role */}
                  {isAdmin && member.role !== 'owner' ? (
                    <select
                      value={member.role}
                      onChange={e => roleMutation.mutate({ userId: member.user_id, role: e.target.value as Role })}
                      className="text-xs border border-gray-200 rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-blue-400"
                    >
                      {ROLE_OPTIONS.filter(r => r.value !== 'owner').map(r => (
                        <option key={r.value} value={r.value}>{r.label}</option>
                      ))}
                    </select>
                  ) : (
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex items-center gap-1 ${roleColor[member.role as Role] ?? 'bg-gray-100 text-gray-700'}`}>
                      {ROLE_OPTIONS.find(r => r.value === member.role)?.icon}
                      {ROLE_OPTIONS.find(r => r.value === member.role)?.label ?? member.role}
                    </span>
                  )}

                  {/* Remove */}
                  {isAdmin && member.role !== 'owner' && member.user_id !== user?.id && (
                    <button
                      onClick={() => removeMutation.mutate(member.user_id)}
                      disabled={removeMutation.isPending}
                      className="text-gray-300 hover:text-red-500 transition-colors disabled:opacity-40"
                      aria-label="メンバーを削除"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Add member */}
        {isAdmin && (
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <h3 className="text-xs font-semibold text-gray-500 mb-3 flex items-center gap-1">
              <UserPlus size={13} /> メンバーを追加
            </h3>
            {addableUsers.length === 0 ? (
              <p className="text-xs text-gray-400">追加できるユーザーがいません（まず相手にログインしてもらう必要があります）</p>
            ) : (
              <div className="flex items-center gap-2">
                <select
                  aria-label="追加するユーザー"
                  value={addUserId}
                  onChange={e => setAddUserId(e.target.value)}
                  className="flex-1 border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">ユーザーを選択...</option>
                  {addableUsers.map(u => (
                    <option key={u.id} value={u.id}>
                      {u.name}{u.email ? ` (${u.email})` : ''}
                    </option>
                  ))}
                </select>
                <select
                  aria-label="追加時ロール"
                  value={addRole}
                  onChange={e => setAddRole(e.target.value as Role)}
                  className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {ROLE_OPTIONS.filter(r => r.value !== 'owner').map(r => (
                    <option key={r.value} value={r.value}>{r.label}</option>
                  ))}
                </select>
                <button
                  onClick={() => addMutation.mutate()}
                  disabled={!addUserId || addMutation.isPending}
                  className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-40 whitespace-nowrap"
                >
                  追加
                </button>
              </div>
            )}
          </div>
        )}
      </section>
    </>
  )
}
