import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Settings, UserPlus, Trash2, Crown, Shield, User as UserIcon, Eye, Pencil, Check, X, Tag, Layout } from 'lucide-react'
import {
  getWorkspaceMembers,
  addWorkspaceMember,
  removeWorkspaceMember,
  updateMemberRole,
  updateWorkspace,
  getUsers,
} from '../api/workspaces'
import { getLabels, createLabel, updateLabel, deleteLabel } from '../api/labels'
import { getTemplates, createTemplate, updateTemplate, deleteTemplate } from '../api/templates'
import { Avatar } from '../components/common/Avatar'
import { useToast } from '../components/common/Toast'
import { useAuthStore } from '../store/auth'
import { useAppStore } from '../store'

type Role = 'owner' | 'admin' | 'member' | 'viewer'

const ROLE_OPTIONS: { value: Role; label: string; icon: React.ReactNode }[] = [
  { value: 'owner', label: 'Owner', icon: <Crown size={12} /> },
  { value: 'admin', label: 'Admin', icon: <Shield size={12} /> },
  { value: 'member', label: 'Member', icon: <UserIcon size={12} /> },
  { value: 'viewer', label: 'Viewer', icon: <Eye size={12} /> },
]

const roleColor: Record<Role, string> = {
  owner: 'bg-yellow-100 text-yellow-700',
  admin: 'bg-blue-100 text-blue-700',
  member: 'bg-gray-100 text-gray-700',
  viewer: 'bg-purple-100 text-purple-700',
}

export function SettingsPage() {
  const qc = useQueryClient()
  const showToast = useToast()
  const { user } = useAuthStore()
  const { activeWorkspaceId, activeProjectId } = useAppStore()

  const [editingName, setEditingName] = useState(false)
  const [nameInput, setNameInput] = useState('')
  const [addUserId, setAddUserId] = useState('')
  const [addRole, setAddRole] = useState<Role>('member')

  // Labels state
  const [newLabelName, setNewLabelName] = useState('')
  const [newLabelColor, setNewLabelColor] = useState('#6366f1')
  const [editingLabelId, setEditingLabelId] = useState<string | null>(null)
  const [editLabelForm, setEditLabelForm] = useState({ name: '', color: '#6366f1' })

  // Templates state
  const [newTplName, setNewTplName] = useState('')
  const [newTplType, setNewTplType] = useState('task')
  const [newTplPriority, setNewTplPriority] = useState('medium')
  const [editingTplId, setEditingTplId] = useState<string | null>(null)
  const [editTplForm, setEditTplForm] = useState({ name: '', description: '', type: 'task', priority: 'medium', points: '' })

  const { data: members = [], isLoading: membersLoading } = useQuery({
    queryKey: ['workspace-members', activeWorkspaceId],
    queryFn: () => getWorkspaceMembers(activeWorkspaceId!),
    enabled: !!activeWorkspaceId,
  })

  const { data: allUsers = [] } = useQuery({
    queryKey: ['users'],
    queryFn: getUsers,
  })

  const memberIds = new Set(members.map(m => m.user_id))
  const addableUsers = allUsers.filter(u => !memberIds.has(u.id))

  const myRole = members.find(m => m.user_id === user?.id)?.role as Role | undefined
  const isAdmin = myRole === 'owner' || myRole === 'admin'

  const renameMutation = useMutation({
    mutationFn: (name: string) => updateWorkspace(activeWorkspaceId!, name),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workspaces'] })
      setEditingName(false)
      showToast('ワークスペース名を更新しました', 'success')
    },
    onError: () => showToast('更新に失敗しました', 'error'),
  })

  const addMutation = useMutation({
    mutationFn: () => addWorkspaceMember(activeWorkspaceId!, addUserId, addRole),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workspace-members', activeWorkspaceId] })
      setAddUserId('')
      setAddRole('member')
      showToast('メンバーを追加しました', 'success')
    },
    onError: () => showToast('追加に失敗しました', 'error'),
  })

  const roleMutation = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: Role }) =>
      updateMemberRole(activeWorkspaceId!, userId, role),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workspace-members', activeWorkspaceId] })
    },
    onError: () => showToast('ロールの変更に失敗しました', 'error'),
  })

  const removeMutation = useMutation({
    mutationFn: (userId: string) => removeWorkspaceMember(activeWorkspaceId!, userId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workspace-members', activeWorkspaceId] })
      showToast('メンバーを削除しました', 'success')
    },
    onError: () => showToast('削除に失敗しました', 'error'),
  })

  // Labels
  const { data: labels = [], isError: labelsError } = useQuery({
    queryKey: ['labels', activeProjectId],
    queryFn: () => getLabels(activeProjectId!),
    enabled: !!activeProjectId,
  })

  const updateLabelMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: { name?: string; color?: string } }) =>
      updateLabel(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['labels', activeProjectId] })
      setEditingLabelId(null)
      showToast('ラベルを更新しました', 'success')
    },
    onError: () => showToast('ラベルの更新に失敗しました', 'error'),
  })

  const createLabelMutation = useMutation({
    mutationFn: () => createLabel(activeProjectId!, newLabelName.trim(), newLabelColor),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['labels', activeProjectId] })
      setNewLabelName('')
      setNewLabelColor('#6366f1')
      showToast('ラベルを作成しました', 'success')
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? ''
      if (msg.toLowerCase().includes('unique') || msg.toLowerCase().includes('already')) {
        showToast('同名のラベルが既に存在します', 'error')
      } else {
        showToast('ラベルの作成に失敗しました', 'error')
      }
    },
  })

  const deleteLabelMutation = useMutation({
    mutationFn: (id: string) => deleteLabel(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['labels', activeProjectId] }),
    onError: () => showToast('ラベルの削除に失敗しました', 'error'),
  })

  // Templates
  const { data: templates = [], isError: templatesError } = useQuery({
    queryKey: ['templates', activeProjectId],
    queryFn: () => getTemplates(activeProjectId!),
    enabled: !!activeProjectId,
  })

  const createTemplateMutation = useMutation({
    mutationFn: () => createTemplate(activeProjectId!, { name: newTplName.trim(), type: newTplType, priority: newTplPriority }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['templates', activeProjectId] })
      setNewTplName('')
      showToast('テンプレートを作成しました', 'success')
    },
    onError: () => showToast('テンプレートの作成に失敗しました', 'error'),
  })

  const updateTemplateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof updateTemplate>[1] }) =>
      updateTemplate(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['templates', activeProjectId] })
      setEditingTplId(null)
      showToast('テンプレートを更新しました', 'success')
    },
    onError: () => showToast('テンプレートの更新に失敗しました', 'error'),
  })

  const deleteTemplateMutation = useMutation({
    mutationFn: (id: string) => deleteTemplate(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['templates', activeProjectId] }),
    onError: () => showToast('テンプレートの削除に失敗しました', 'error'),
  })

  const startEditTpl = (tpl: { id: string; name: string; description?: string | null; type: string; priority: string; points?: number | null }) => {
    setEditingTplId(tpl.id)
    setEditTplForm({
      name: tpl.name,
      description: tpl.description ?? '',
      type: tpl.type,
      priority: tpl.priority,
      points: tpl.points != null ? String(tpl.points) : '',
    })
  }

  if (!activeWorkspaceId) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-400">
        ← ワークスペースを選択してください
      </div>
    )
  }

  const workspace = qc.getQueryData<{ id: string; name: string }[]>(['workspaces'])
    ?.find(w => w.id === activeWorkspaceId)

  return (
    <div className="flex-1 overflow-y-auto">
    <div className="p-6 max-w-2xl">
      <div className="flex items-center gap-2 mb-8">
        <Settings size={20} className="text-gray-500" />
        <h1 className="text-xl font-bold text-gray-900">ワークスペース設定</h1>
      </div>

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
      {/* Labels */}
      {activeProjectId && (
        <section className="mt-8">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3 flex items-center gap-1.5">
            <Tag size={13} /> プロジェクトラベル
          </h2>
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-4">
            {labelsError ? (
              <p className="px-4 py-3 text-sm text-red-400">取得に失敗しました（project: {activeProjectId}）</p>
            ) : labels.length === 0 ? (
              <p className="px-4 py-3 text-sm text-gray-400">ラベルなし（project: {activeProjectId}）</p>
            ) : (
              <ul className="divide-y divide-gray-100">
                {labels.map(label => (
                  <li key={label.id}>
                    {editingLabelId === label.id ? (
                      <div className="flex items-center gap-2 px-4 py-2.5">
                        <input
                          type="color"
                          value={editLabelForm.color}
                          onChange={e => setEditLabelForm(f => ({ ...f, color: e.target.value }))}
                          className="w-8 h-8 rounded border border-gray-200 cursor-pointer p-0.5 shrink-0"
                        />
                        <input
                          autoFocus
                          value={editLabelForm.name}
                          onChange={e => setEditLabelForm(f => ({ ...f, name: e.target.value }))}
                          onKeyDown={e => {
                            if (e.key === 'Enter') updateLabelMutation.mutate({ id: label.id, data: editLabelForm })
                            if (e.key === 'Escape') setEditingLabelId(null)
                          }}
                          className="flex-1 border border-gray-300 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        <button
                          onClick={() => updateLabelMutation.mutate({ id: label.id, data: editLabelForm })}
                          disabled={!editLabelForm.name.trim() || updateLabelMutation.isPending}
                          className="p-1 text-green-600 hover:text-green-700 disabled:opacity-40"
                          aria-label="保存"
                        >
                          <Check size={16} />
                        </button>
                        <button
                          onClick={() => setEditingLabelId(null)}
                          className="p-1 text-gray-400 hover:text-gray-600"
                          aria-label="キャンセル"
                        >
                          <X size={16} />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-3 px-4 py-2.5">
                        <span className="w-4 h-4 rounded-full shrink-0" style={{ backgroundColor: label.color }} />
                        <span className="flex-1 text-sm text-gray-800">{label.name}</span>
                        <button
                          onClick={() => { setEditingLabelId(label.id); setEditLabelForm({ name: label.name, color: label.color }) }}
                          className="text-gray-300 hover:text-blue-500 transition-colors"
                          aria-label="編集"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          onClick={() => deleteLabelMutation.mutate(label.id)}
                          disabled={deleteLabelMutation.isPending}
                          className="text-gray-300 hover:text-red-500 transition-colors"
                          aria-label="削除"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={newLabelColor}
                onChange={e => setNewLabelColor(e.target.value)}
                className="w-8 h-8 rounded border border-gray-200 cursor-pointer p-0.5"
              />
              <input
                value={newLabelName}
                onChange={e => setNewLabelName(e.target.value)}
                placeholder="ラベル名"
                className="flex-1 border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                onClick={() => createLabelMutation.mutate()}
                disabled={!newLabelName.trim() || createLabelMutation.isPending}
                className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-40 whitespace-nowrap"
              >
                追加
              </button>
            </div>
          </div>
        </section>
      )}

      {/* Templates */}
      {activeProjectId && (
        <section className="mt-8">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3 flex items-center gap-1.5">
            <Layout size={13} /> イシューテンプレート
          </h2>
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-4">
            {templatesError ? (
              <p className="px-4 py-3 text-sm text-red-400">取得に失敗しました（project: {activeProjectId}）</p>
            ) : templates.length === 0 ? (
              <p className="px-4 py-3 text-sm text-gray-400">テンプレートなし</p>
            ) : (
              <ul className="divide-y divide-gray-100">
                {templates.map(tpl => (
                  <li key={tpl.id}>
                    {editingTplId === tpl.id ? (
                      <div className="px-4 py-3 space-y-2">
                        <input
                          autoFocus
                          value={editTplForm.name}
                          onChange={e => setEditTplForm(f => ({ ...f, name: e.target.value }))}
                          className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          placeholder="テンプレート名"
                        />
                        <textarea
                          value={editTplForm.description}
                          onChange={e => setEditTplForm(f => ({ ...f, description: e.target.value }))}
                          rows={3}
                          className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          placeholder="説明（Markdown）"
                        />
                        <div className="flex items-center gap-2">
                          <select
                            value={editTplForm.type}
                            onChange={e => setEditTplForm(f => ({ ...f, type: e.target.value }))}
                            className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm"
                          >
                            <option value="task">Task</option>
                            <option value="story">Story</option>
                            <option value="bug">Bug</option>
                            <option value="spike">Spike</option>
                          </select>
                          <select
                            value={editTplForm.priority}
                            onChange={e => setEditTplForm(f => ({ ...f, priority: e.target.value }))}
                            className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm"
                          >
                            <option value="low">Low</option>
                            <option value="medium">Medium</option>
                            <option value="high">High</option>
                            <option value="critical">Critical</option>
                          </select>
                          <input
                            type="number"
                            value={editTplForm.points}
                            onChange={e => setEditTplForm(f => ({ ...f, points: e.target.value }))}
                            className="w-20 border border-gray-300 rounded-lg px-2 py-1.5 text-sm"
                            placeholder="pt"
                            min={0}
                          />
                          <div className="flex items-center gap-1 ml-auto">
                            <button
                              onClick={() => updateTemplateMutation.mutate({
                                id: tpl.id,
                                data: {
                                  name: editTplForm.name,
                                  description: editTplForm.description || undefined,
                                  type: editTplForm.type,
                                  priority: editTplForm.priority,
                                  points: editTplForm.points ? Number(editTplForm.points) : undefined,
                                },
                              })}
                              disabled={!editTplForm.name.trim() || updateTemplateMutation.isPending}
                              className="p-1 text-green-600 hover:text-green-700 disabled:opacity-40"
                              aria-label="保存"
                            >
                              <Check size={16} />
                            </button>
                            <button
                              onClick={() => setEditingTplId(null)}
                              className="p-1 text-gray-400 hover:text-gray-600"
                              aria-label="キャンセル"
                            >
                              <X size={16} />
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-3 px-4 py-2.5">
                        <span className="flex-1 text-sm text-gray-800">{tpl.name}</span>
                        <span className="text-xs text-gray-400 px-1.5 py-0.5 bg-gray-100 rounded">{tpl.type}</span>
                        <span className="text-xs text-gray-400 px-1.5 py-0.5 bg-gray-100 rounded">{tpl.priority}</span>
                        {tpl.points != null && (
                          <span className="text-xs text-gray-400 font-mono">{tpl.points}pt</span>
                        )}
                        <button
                          onClick={() => startEditTpl(tpl)}
                          className="text-gray-300 hover:text-blue-500 transition-colors"
                          aria-label="編集"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          onClick={() => deleteTemplateMutation.mutate(tpl.id)}
                          disabled={deleteTemplateMutation.isPending}
                          className="text-gray-300 hover:text-red-500 transition-colors"
                          aria-label="削除"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center gap-2">
              <input
                value={newTplName}
                onChange={e => setNewTplName(e.target.value)}
                placeholder="テンプレート名"
                className="flex-1 border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <select
                value={newTplType}
                onChange={e => setNewTplType(e.target.value)}
                className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm"
              >
                <option value="task">Task</option>
                <option value="story">Story</option>
                <option value="bug">Bug</option>
                <option value="spike">Spike</option>
              </select>
              <select
                value={newTplPriority}
                onChange={e => setNewTplPriority(e.target.value)}
                className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </select>
              <button
                onClick={() => createTemplateMutation.mutate()}
                disabled={!newTplName.trim() || createTemplateMutation.isPending}
                className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-40 whitespace-nowrap"
              >
                追加
              </button>
            </div>
          </div>
        </section>
      )}
    </div>
    </div>
  )
}
