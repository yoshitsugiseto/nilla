import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useToast } from '../common/useToast'
import { extractErrorMessage } from '../../api/client'
import { createProject } from '../../api/projects'
import { useAppStore } from '../../store'

interface NewProjectFormProps {
  onClose: () => void
  workspaceId: string
}

export function NewProjectForm({ onClose, workspaceId }: NewProjectFormProps) {
  const qc = useQueryClient()
  const { setActiveProject } = useAppStore()
  const [form, setForm] = useState({ name: '', key: '', description: '' })
  const showToast = useToast()

  const mutation = useMutation({
    mutationFn: () => createProject({ ...form, workspace_id: workspaceId }),
    onSuccess: (proj) => {
      qc.invalidateQueries({ queryKey: ['projects'] })
      setActiveProject(proj.id)
      onClose()
    },
    onError: (err) => showToast(extractErrorMessage(err, 'プロジェクトの作成に失敗しました'), 'error'),
  })

  return (
    <form onSubmit={e => { e.preventDefault(); mutation.mutate() }} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">プロジェクト名 *</label>
        <input required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="新しいプロジェクト" />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">キー * (例: PROJ)</label>
        <input required value={form.key} onChange={e => setForm(f => ({ ...f, key: e.target.value.toUpperCase() }))}
          maxLength={8}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono uppercase"
          placeholder="PROJ" />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">説明</label>
        <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
          rows={2} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
      </div>
      <div className="flex justify-end gap-3 pt-2">
        <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600">キャンセル</button>
        <button type="submit" disabled={mutation.isPending}
          className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50">
          {mutation.isPending ? '作成中...' : 'プロジェクトを作成'}
        </button>
      </div>
    </form>
  )
}
