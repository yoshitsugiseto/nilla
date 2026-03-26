import { DragDropContext, type DropResult } from '@hello-pangea/dnd'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { updateIssueStatus, reorderIssues } from '../../api/issues'
import type { Issue, IssueStatus } from '../../types'
import { Column } from './Column'
import { useToast } from '../common/useToast'

const STATUSES: IssueStatus[] = ['todo', 'in_progress', 'in_review', 'done']

const isValidStatus = (s: string): s is IssueStatus =>
  STATUSES.includes(s as IssueStatus)

interface Props {
  issues: Issue[]
  projectId: string
  queryKey: readonly unknown[]
}

export function Board({ issues, projectId, queryKey }: Props) {
  const qc = useQueryClient()
  const showToast = useToast()

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      updateIssueStatus(id, status),
    onMutate: async ({ id, status }) => {
      await qc.cancelQueries({ queryKey })
      const previous = qc.getQueryData<Issue[]>(queryKey)
      qc.setQueryData<Issue[]>(queryKey, old =>
        old?.map(i => i.id === id && isValidStatus(status) ? { ...i, status } : i) ?? []
      )
      return { previous }
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) qc.setQueryData(queryKey, context.previous)
      showToast('ステータスの更新に失敗しました', 'error')
    },
    onSettled: () => qc.invalidateQueries({ queryKey, exact: true }),
  })

  const reorderMutation = useMutation({
    mutationFn: (ids: string[]) => reorderIssues(projectId, ids),
    onSettled: () => qc.invalidateQueries({ queryKey, exact: true }),
  })

  const handleDragEnd = (result: DropResult) => {
    const { draggableId, source, destination } = result
    if (!destination) return

    const rawStatus = destination.droppableId
    if (!isValidStatus(rawStatus)) return
    const newStatus = rawStatus

    if (source.droppableId === destination.droppableId) {
      // 同じカラム内の並び替え
      if (source.index === destination.index) return
      const columnIssues = issues
        .filter(i => i.status === newStatus)
        .sort((a, b) => a.position - b.position)
      const reordered = [...columnIssues]
      const [moved] = reordered.splice(source.index, 1)
      reordered.splice(destination.index, 0, moved)
      // 楽観的更新
      qc.setQueryData<Issue[]>(['issues', projectId], old => {
        if (!old) return old
        const positionMap = new Map(reordered.map((i, idx) => [i.id, idx * 1000]))
        return old.map(i => positionMap.has(i.id) ? { ...i, position: positionMap.get(i.id)! } : i)
      })
      reorderMutation.mutate(reordered.map(i => i.id))
      return
    }

    // 別カラムへの移動
    const issue = issues.find(i => i.id === draggableId)
    if (!issue || issue.status === newStatus) return
    statusMutation.mutate({ id: draggableId, status: newStatus })
  }

  const byStatus = (status: IssueStatus) =>
    issues.filter(i => i.status === status).sort((a, b) => a.position - b.position)

  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      <div className="flex gap-4 overflow-x-auto pb-4">
        {STATUSES.map(status => (
          <Column
            key={status}
            status={status}
            issues={byStatus(status)}
            projectId={projectId}
          />
        ))}
      </div>
    </DragDropContext>
  )
}
