import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { DragDropContext, Droppable, Draggable, type DropResult } from '@hello-pangea/dnd'
import { Plus, GripVertical, Pencil, Trash2, ChevronDown, ChevronRight, Search, X } from 'lucide-react'
import { getIssues, updateIssueSprint, deleteIssue, reorderIssues } from '../api/issues'
import { getSprints } from '../api/sprints'
import { useAppStore } from '../store'
import { Modal } from '../components/common/Modal'
import { DetailPanel } from '../components/common/DetailPanel'
import { IssueForm } from '../components/Issue/IssueForm'
import { IssueDetail } from '../components/Issue/IssueDetail'
import { TypeIcon, PriorityBadge, StatusBadge } from '../components/common/Badge'
import { Avatar } from '../components/common/Avatar'
import { ConfirmDialog } from '../components/common/ConfirmDialog'
import { useToast } from '../components/common/Toast'
import type { Issue } from '../types'

function SubtaskRow({ issue, selectedId, onDetail }: { issue: Issue; selectedId?: string | null; onDetail: (id: string) => void }) {
  return (
    <div
      onClick={() => onDetail(issue.id)}
      className={`flex items-center gap-3 py-2 pl-12 pr-4 cursor-pointer border-t border-gray-100 ${
        selectedId === issue.id ? 'bg-blue-50' : 'bg-gray-50/50 hover:bg-blue-50/30'
      }`}
    >
      <TypeIcon type={issue.type} />
      <span className="text-xs text-gray-400 font-mono w-14 shrink-0">#{issue.number}</span>
      <span className="flex-1 text-sm text-gray-700 truncate">{issue.title}</span>
      <div className="flex items-center gap-2 shrink-0">
        <StatusBadge status={issue.status} />
        <PriorityBadge priority={issue.priority} />
        {issue.points != null && (
          <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded font-mono w-12 text-center">
            {issue.points}pt
          </span>
        )}
        {issue.assignee_name && <Avatar name={issue.assignee_name} size="sm" />}
      </div>
    </div>
  )
}

function IssueRow({
  issue,
  index,
  projectId,
  subtasks = [],
  selectedId,
  onDetail,
}: {
  issue: Issue
  index: number
  projectId: string
  subtasks?: Issue[]
  selectedId?: string | null
  onDetail: (id: string) => void
}) {
  const qc = useQueryClient()
  const [editing, setEditing] = useState(false)
  const [subtasksOpen, setSubtasksOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const showToast = useToast()
  const deleteMutation = useMutation({
    mutationFn: () => deleteIssue(issue.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['issues', projectId] }),
    onError: () => showToast('イシューの削除に失敗しました', 'error'),
  })

  return (
    <>
      <Draggable draggableId={issue.id} index={index}>
        {(provided, snapshot) => (
          <div
            ref={provided.innerRef}
            {...provided.draggableProps}
            {...provided.dragHandleProps}
            style={{
              ...provided.draggableProps.style,
              opacity: snapshot.isDropAnimating ? 0 : undefined,
            }}
            onClick={() => !snapshot.isDragging && onDetail(issue.id)}
            className={`flex items-center gap-3 py-2.5 px-4 group transition-colors ${
              snapshot.isDragging
                ? 'bg-blue-50 border border-blue-200 rounded-lg shadow-md cursor-grabbing'
                : selectedId === issue.id
                  ? 'bg-blue-50 cursor-grab'
                  : 'hover:bg-blue-50/40 cursor-grab'
            }`}
          >
            <GripVertical size={14} className="text-gray-300 shrink-0" />
            {subtasks.length > 0 ? (
              <button
                onClick={e => { e.stopPropagation(); setSubtasksOpen(v => !v) }}
                className="shrink-0 text-gray-400 hover:text-gray-600"
              >
                {subtasksOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </button>
            ) : (
              <span className="w-3.5 shrink-0" />
            )}
            <TypeIcon type={issue.type} />
            <span className="text-xs text-gray-400 font-mono w-14 shrink-0">#{issue.number}</span>
            <span className="flex-1 text-sm text-gray-900 truncate font-medium hover:text-blue-600">
              {issue.title}
            </span>
            <div className="flex items-center gap-2 shrink-0" onClick={e => e.stopPropagation()}>
              {subtasks.length > 0 && (
                <span className="text-xs text-gray-400">{subtasks.length}件</span>
              )}
              <StatusBadge status={issue.status} />
              <PriorityBadge priority={issue.priority} />
              {issue.points != null && (
                <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded font-mono w-12 text-center">
                  {issue.points}pt
                </span>
              )}
              {issue.assignee_name && <Avatar name={issue.assignee_name} size="sm" />}
              <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1 transition-opacity">
                <button
                  onClick={e => { e.stopPropagation(); setEditing(true) }}
                  className="p-1 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded"
                  title="Edit"
                  aria-label="イシューを編集"
                >
                  <Pencil size={12} aria-hidden="true" />
                </button>
                <button
                  onClick={e => { e.stopPropagation(); setConfirmDelete(true) }}
                  className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded"
                  title="Delete"
                  aria-label="イシューを削除"
                >
                  <Trash2 size={12} aria-hidden="true" />
                </button>
              </div>
            </div>
          </div>
        )}
      </Draggable>

      {subtasksOpen && subtasks.map(sub => (
        <SubtaskRow key={sub.id} issue={sub} selectedId={selectedId} onDetail={onDetail} />
      ))}

      {editing && (
        <Modal title={`Edit #${issue.number}`} onClose={() => setEditing(false)}>
          <IssueForm projectId={projectId} issue={issue} onClose={() => setEditing(false)} />
        </Modal>
      )}

      {confirmDelete && (
        <ConfirmDialog
          message={
            subtasks.length > 0
              ? `このストーリーには${subtasks.length}件のサブタスクがあります。削除すると親の関連が解除されます。続けますか？`
              : 'このイシューを削除しますか？'
          }
          onConfirm={() => { setConfirmDelete(false); deleteMutation.mutate() }}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </>
  )
}

function deadlineLabel(endDate: string): { text: string; className: string } {
  const days = Math.ceil((new Date(endDate).getTime() - Date.now()) / 86400000)
  if (days < 0)  return { text: `${Math.abs(days)}日超過`, className: 'text-red-600 font-medium' }
  if (days === 0) return { text: '今日が期限',              className: 'text-red-600 font-medium' }
  if (days <= 2)  return { text: `残り${days}日`,           className: 'text-orange-500 font-medium' }
  if (days <= 5)  return { text: `残り${days}日`,           className: 'text-yellow-600' }
  return               { text: `残り${days}日`,             className: 'text-gray-400' }
}

function SprintGroup({
  label,
  status,
  endDate,
  droppableId,
  issues,
  allIssues,
  totalPts,
  projectId,
  selectedId,
  onDetail,
  defaultOpen = true,
}: {
  label: string
  status?: string
  endDate?: string
  droppableId: string
  issues: Issue[]
  allIssues: Issue[]
  totalPts: number
  projectId: string
  selectedId?: string | null
  onDetail: (id: string) => void
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      <div
        className="bg-gray-50 px-4 py-3 flex items-center justify-between cursor-pointer hover:bg-gray-100 transition-colors select-none"
        onClick={() => setOpen(o => !o)}
      >
        <div className="flex items-center gap-3">
          {open ? <ChevronDown size={14} className="text-gray-400" /> : <ChevronRight size={14} className="text-gray-400" />}
          <span className="font-semibold text-gray-800 text-sm">{label}</span>
          {status && (
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
              status === 'active' ? 'bg-blue-100 text-blue-700' :
              status === 'completed' ? 'bg-emerald-100 text-emerald-700' :
              'bg-gray-100 text-gray-600'
            }`}>{status}</span>
          )}
          <span className="text-xs text-gray-400">{issues.length} issues</span>
          {endDate && (() => { const d = deadlineLabel(endDate); return <span className={`text-xs ${d.className}`}>{d.text}</span> })()}
        </div>
        <span className="text-xs font-mono text-gray-500">{totalPts}pt</span>
      </div>

      <Droppable droppableId={droppableId} isDropDisabled={!open}>
        {(provided, snapshot) => (
          <div
            ref={provided.innerRef}
            {...provided.droppableProps}
            className={`transition-colors duration-150 ${
              open ? '' : 'hidden'
            } ${snapshot.isDraggingOver ? 'bg-blue-50/60' : ''}`}
          >
            {open && (
              <div className="divide-y divide-gray-100">
                {issues.length === 0 && !snapshot.isDraggingOver ? (
                  <p className="text-sm text-gray-400 px-4 py-3 italic">Issueなし</p>
                ) : (
                  issues.map((issue, index) => (
                    <IssueRow
                      key={issue.id}
                      issue={issue}
                      index={index}
                      projectId={projectId}
                      subtasks={allIssues.filter(i => i.parent_id === issue.id)}
                      selectedId={selectedId}
                      onDetail={onDetail}
                    />
                  ))
                )}
              </div>
            )}
            {provided.placeholder}
          </div>
        )}
      </Droppable>
    </div>
  )
}

export function BacklogPage() {
  const { activeProjectId } = useAppStore()
  const qc = useQueryClient()
  const showToast = useToast()
  const [creating, setCreating] = useState(false)
  const [detailId, setDetailId] = useState<string | null>(null)
  const [filterQuery, setFilterQuery] = useState('')

  const { data: sprints = [] } = useQuery({
    queryKey: ['sprints', activeProjectId],
    queryFn: () => getSprints(activeProjectId!),
    enabled: !!activeProjectId,
  })

  const { data: issues = [], isLoading } = useQuery({
    queryKey: ['issues', activeProjectId],
    queryFn: () => getIssues(activeProjectId!),
    enabled: !!activeProjectId,
  })

  const sprintMutation = useMutation({
    mutationFn: ({ issueId, sprintId }: { issueId: string; sprintId: string | null }) =>
      updateIssueSprint(issueId, sprintId),
    onMutate: async ({ issueId, sprintId }) => {
      await qc.cancelQueries({ queryKey: ['issues', activeProjectId] })
      const previous = qc.getQueryData<Issue[]>(['issues', activeProjectId])
      qc.setQueryData<Issue[]>(['issues', activeProjectId], old =>
        old?.map(i => i.id === issueId ? { ...i, sprint_id: sprintId } : i) ?? []
      )
      return { previous }
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) qc.setQueryData(['issues', activeProjectId], context.previous)
      showToast('スプリントの割り当てに失敗しました', 'error')
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['issues', activeProjectId] }),
  })

  const reorderMutation = useMutation({
    mutationFn: (ids: string[]) => reorderIssues(activeProjectId!, ids),
    onError: () => showToast('並び替えの保存に失敗しました', 'error'),
    onSettled: () => qc.invalidateQueries({ queryKey: ['issues', activeProjectId] }),
  })

  const handleDragEnd = (result: DropResult) => {
    const { draggableId, source, destination } = result
    if (!destination) return
    if (source.droppableId === destination.droppableId && source.index === destination.index) return

    const newSprintId = destination.droppableId === 'backlog' ? null : destination.droppableId
    const issue = issues.find(i => i.id === draggableId)
    if (!issue) return

    if (source.droppableId === destination.droppableId) {
      // 同一グループ内：位置を並び替え
      const groupIssues = issues.filter(
        i => !i.parent_id && (newSprintId === null ? !i.sprint_id : i.sprint_id === newSprintId)
      )
      const reordered = [...groupIssues]
      const [moved] = reordered.splice(source.index, 1)
      reordered.splice(destination.index, 0, moved)

      // 楽観的更新
      qc.setQueryData<Issue[]>(['issues', activeProjectId], old => {
        if (!old) return old
        const posMap = new Map(reordered.map((iss, idx) => [iss.id, idx * 1000]))
        return old.map(i => posMap.has(i.id) ? { ...i, position: posMap.get(i.id)! } : i)
      })

      reorderMutation.mutate(reordered.map(i => i.id))
    } else {
      // 別グループへ：スプリント移動
      sprintMutation.mutate({ issueId: draggableId, sprintId: newSprintId })
    }
  }

  if (!activeProjectId) {
    return <div className="flex-1 flex items-center justify-center text-gray-400">← プロジェクトを選択してください</div>
  }

  // サブタスク（parent_idあり）はトップレベルには表示しない
  const q = filterQuery.trim().toLowerCase()
  const topLevel = issues.filter(i => !i.parent_id && (!q || i.title.toLowerCase().includes(q)))
  const backlog = topLevel.filter(i => !i.sprint_id)
  const grouped = sprints
    .filter(s => s.status !== 'completed')
    .map(s => ({
      sprint: s,
      issues: topLevel.filter(i => i.sprint_id === s.id),
      totalPts: topLevel.filter(i => i.sprint_id === s.id).reduce((sum, i) => sum + (i.points ?? 0), 0),
    }))

  return (
    <div className="flex-1 flex overflow-hidden">
    <div className="flex-1 overflow-auto">
      <div className="p-6 max-w-6xl">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-gray-900">Backlog</h1>
        <button
          onClick={() => setCreating(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700"
        >
          <Plus size={16} /> Issueを作成
        </button>
      </div>
      <div className="relative mb-4">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
        <input
          value={filterQuery}
          onChange={e => setFilterQuery(e.target.value)}
          placeholder="タイトルで絞り込み..."
          className="w-full pl-9 pr-8 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400"
        />
        {filterQuery && (
          <button
            onClick={() => setFilterQuery('')}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {isLoading ? (
        <div role="status" aria-label="読み込み中" className="text-gray-400 text-center py-12">読み込み中...</div>
      ) : (
        <DragDropContext onDragEnd={handleDragEnd}>
          <div className="space-y-4">
            {grouped.map(({ sprint, issues: sprintIssues, totalPts }) => (
              <SprintGroup
                key={sprint.id}
                label={sprint.name}
                status={sprint.status}
                endDate={sprint.end_date ?? undefined}
                droppableId={sprint.id}
                issues={sprintIssues}
                allIssues={issues}
                totalPts={totalPts}
                projectId={activeProjectId}
                selectedId={detailId}
                onDetail={setDetailId}
                defaultOpen={sprint.status === 'active'}
              />
            ))}

            <SprintGroup
              label="Backlog"
              droppableId="backlog"
              issues={backlog}
              allIssues={issues}
              totalPts={backlog.reduce((s, i) => s + (i.points ?? 0), 0)}
              projectId={activeProjectId}
              selectedId={detailId}
              onDetail={setDetailId}
            />
          </div>
        </DragDropContext>
      )}

      {creating && (
        <Modal title="New Issue" onClose={() => setCreating(false)}>
          <IssueForm projectId={activeProjectId} onClose={() => setCreating(false)} />
        </Modal>
      )}
      </div>
    </div>

      {detailId && (() => {
        const issue = issues.find(i => i.id === detailId)
        return (
          <DetailPanel
            title={issue ? `#${issue.number} ${issue.title}` : 'Issue Detail'}
            onClose={() => setDetailId(null)}
          >
            <IssueDetail issueId={detailId} projectId={activeProjectId} onClose={() => setDetailId(null)} />
          </DetailPanel>
        )
      })()}
    </div>
  )
}
