import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Trash2, Pencil, Check, X, Layout } from 'lucide-react'
import { getTemplates, createTemplate, updateTemplate, deleteTemplate } from '../../api/templates'
import { useToast } from '../common/useToast'
import { useProjectPermissions } from '../../hooks/useProjectPermissions'

const TEMPLATE_TYPE_LABELS: Record<string, string> = {
  task: 'タスク',
  story: 'ストーリー',
  bug: 'バグ',
  spike: 'スパイク',
}

const PRIORITY_LABELS: Record<string, string> = {
  low: '低',
  medium: '中',
  high: '高',
  critical: '緊急',
}

interface Props {
  projectId: string
}

export function TemplateSettings({ projectId }: Props) {
  const qc = useQueryClient()
  const showToast = useToast()
  const { canAdminProject } = useProjectPermissions(projectId)

  const [newTplName, setNewTplName] = useState('')
  const [newTplType, setNewTplType] = useState('task')
  const [newTplPriority, setNewTplPriority] = useState('medium')
  const [editingTplId, setEditingTplId] = useState<string | null>(null)
  const [editTplForm, setEditTplForm] = useState({ name: '', description: '', type: 'task', priority: 'medium', points: '' })

  const { data: templates = [], isError: templatesError } = useQuery({
    queryKey: ['templates', projectId],
    queryFn: () => getTemplates(projectId),
    enabled: !!projectId,
  })

  const createTemplateMutation = useMutation({
    mutationFn: () => createTemplate(projectId, { name: newTplName.trim(), type: newTplType, priority: newTplPriority }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['templates', projectId] })
      setNewTplName('')
      showToast('テンプレートを作成しました', 'success')
    },
    onError: () => showToast('テンプレートの作成に失敗しました', 'error'),
  })

  const updateTemplateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof updateTemplate>[1] }) =>
      updateTemplate(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['templates', projectId] })
      setEditingTplId(null)
      showToast('テンプレートを更新しました', 'success')
    },
    onError: () => showToast('テンプレートの更新に失敗しました', 'error'),
  })

  const deleteTemplateMutation = useMutation({
    mutationFn: (id: string) => deleteTemplate(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['templates', projectId] }),
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

  return (
    <section>
      <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3 flex items-center gap-1.5">
        <Layout size={13} /> イシューテンプレート
      </h2>
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-4">
        {templatesError ? (
          <p className="px-4 py-3 text-sm text-red-400">取得に失敗しました</p>
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
                        <option value="task">タスク</option>
                        <option value="story">ストーリー</option>
                        <option value="bug">バグ</option>
                        <option value="spike">スパイク</option>
                      </select>
                      <select
                        value={editTplForm.priority}
                        onChange={e => setEditTplForm(f => ({ ...f, priority: e.target.value }))}
                        className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm"
                      >
                        <option value="low">低</option>
                        <option value="medium">中</option>
                        <option value="high">高</option>
                        <option value="critical">緊急</option>
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
                    <span className="text-xs text-gray-400 px-1.5 py-0.5 bg-gray-100 rounded">
                      {TEMPLATE_TYPE_LABELS[tpl.type] ?? tpl.type}
                    </span>
                    <span className="text-xs text-gray-400 px-1.5 py-0.5 bg-gray-100 rounded">
                      {PRIORITY_LABELS[tpl.priority] ?? tpl.priority}
                    </span>
                    {tpl.points != null && (
                      <span className="text-xs text-gray-400 font-mono">{tpl.points}pt</span>
                    )}
                    {canAdminProject && (
                      <>
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
                      </>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
      {canAdminProject ? (
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
              <option value="task">タスク</option>
              <option value="story">ストーリー</option>
              <option value="bug">バグ</option>
              <option value="spike">スパイク</option>
            </select>
            <select
              value={newTplPriority}
              onChange={e => setNewTplPriority(e.target.value)}
              className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm"
            >
              <option value="low">低</option>
              <option value="medium">中</option>
              <option value="high">高</option>
              <option value="critical">緊急</option>
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
      ) : (
        <p className="text-xs text-gray-400">現在のプロジェクト権限ではテンプレートを編集できません。変更が必要な場合はプロジェクト管理者に依頼してください。</p>
      )}
    </section>
  )
}
