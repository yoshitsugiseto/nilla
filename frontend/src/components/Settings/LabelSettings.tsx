import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Trash2, Pencil, Check, X, Tag } from 'lucide-react'
import { getLabels, createLabel, updateLabel, deleteLabel } from '../../api/labels'
import { useToast } from '../common/useToast'
import { useProjectPermissions } from '../../hooks/useProjectPermissions'

interface Props {
  projectId: string
}

export function LabelSettings({ projectId }: Props) {
  const qc = useQueryClient()
  const showToast = useToast()
  const { canAdminProject } = useProjectPermissions(projectId)

  const [newLabelName, setNewLabelName] = useState('')
  const [newLabelColor, setNewLabelColor] = useState('#6366f1')
  const [editingLabelId, setEditingLabelId] = useState<string | null>(null)
  const [editLabelForm, setEditLabelForm] = useState({ name: '', color: '#6366f1' })

  const { data: labels = [], isError: labelsError } = useQuery({
    queryKey: ['labels', projectId],
    queryFn: () => getLabels(projectId),
    enabled: !!projectId,
  })

  const updateLabelMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: { name?: string; color?: string } }) =>
      updateLabel(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['labels', projectId] })
      setEditingLabelId(null)
      showToast('ラベルを更新しました', 'success')
    },
    onError: () => showToast('ラベルの更新に失敗しました', 'error'),
  })

  const createLabelMutation = useMutation({
    mutationFn: () => createLabel(projectId, newLabelName.trim(), newLabelColor),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['labels', projectId] })
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
    onSuccess: () => qc.invalidateQueries({ queryKey: ['labels', projectId] }),
    onError: () => showToast('ラベルの削除に失敗しました', 'error'),
  })

  return (
    <section className="mt-8">
      <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3 flex items-center gap-1.5">
        <Tag size={13} /> プロジェクトラベル
      </h2>
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-4">
        {labelsError ? (
          <p className="px-4 py-3 text-sm text-red-400">取得に失敗しました（project: {projectId}）</p>
        ) : labels.length === 0 ? (
          <p className="px-4 py-3 text-sm text-gray-400">ラベルなし（project: {projectId}）</p>
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
                    {canAdminProject && (
                      <>
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
      ) : (
        <p className="text-xs text-gray-400">ラベルの編集は project admin のみ利用できます</p>
      )}
    </section>
  )
}
