import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useToast } from '../common/Toast'
import { createWorkspace } from '../../api/workspaces'

interface NewWorkspaceFormProps {
  onClose: () => void
  onCreated: (id: string) => void
}

export function NewWorkspaceForm({ onClose, onCreated }: NewWorkspaceFormProps) {
  const qc = useQueryClient()
  const [name, setName] = useState('')
  const showToast = useToast()

  const mutation = useMutation({
    mutationFn: () => createWorkspace(name),
    onSuccess: (ws) => {
      qc.invalidateQueries({ queryKey: ['workspaces'] })
      onCreated(ws.id)
    },
    onError: () => showToast('ワークスペースの作成に失敗しました', 'error'),
  })

  return (
    <form onSubmit={e => { e.preventDefault(); mutation.mutate() }} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Workspace Name *</label>
        <input required value={name} onChange={e => setName(e.target.value)}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="My Team" autoFocus />
      </div>
      <div className="flex justify-end gap-3 pt-2">
        <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600">Cancel</button>
        <button type="submit" disabled={mutation.isPending}
          className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50">
          {mutation.isPending ? 'Creating...' : 'Create Workspace'}
        </button>
      </div>
    </form>
  )
}
