import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { DragDropContext, Droppable, Draggable, type DropResult } from '@hello-pangea/dnd'
import { Plus, GripVertical, Pencil, Trash2, ChevronDown, ChevronRight, Search, X, CheckSquare, Square } from 'lucide-react'
import { getIssues, updateIssueSprint, deleteIssue, reorderIssues, bulkUpdateIssues } from '../api/issues'
import { getLabels } from '../api/labels'
import { getSprints } from '../api/sprints'
import { getProjectMembers } from '../api/workspaces'
import { useAppStore } from '../store'
import { Modal } from '../components/common/Modal'
import { DetailPanel } from '../components/common/DetailPanel'
import { IssueForm } from '../components/Issue/IssueForm'
import { IssueDetail } from '../components/Issue/IssueDetail'
import { TypeIcon, PriorityBadge, StatusBadge } from '../components/common/Badge'
import { Avatar } from '../components/common/Avatar'
import { ConfirmDialog } from '../components/common/ConfirmDialog'
import { ProjectRoleBadge } from '../components/common/ProjectRoleBadge'
import { useToast } from '../components/common/useToast'
import { useCurrentTime } from '../hooks/useCurrentTime'
import { useProjectPermissions } from '../hooks/useProjectPermissions'
import { deadlineLabel, dueDateLabel } from '../utils/date'
import type { Issue, IssuePriority, IssueStatus, IssueType } from '../types'

const BULK_SELECT_PLACEHOLDER = '__placeholder__'
const BULK_UNASSIGNED_ASSIGNEE = '__unassigned__'
const QUICK_CREATE_OPTIONS: { type: IssueType; label: string }[] = [
  { type: 'task', label: 'タスク' },
  { type: 'bug', label: 'バグ' },
  { type: 'story', label: 'ストーリー' },
]

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
  bulkMode,
  bulkSelected,
  onBulkToggle,
  canEdit,
}: {
  issue: Issue
  index: number
  projectId: string
  subtasks?: Issue[]
  selectedId?: string | null
  onDetail: (id: string) => void
  bulkMode?: boolean
  bulkSelected?: boolean
  onBulkToggle?: (id: string) => void
  canEdit: boolean
}) {
  const qc = useQueryClient()
  const [editing, setEditing] = useState(false)
  const [subtasksOpen, setSubtasksOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const nowMs = useCurrentTime()

  const showToast = useToast()
  const deleteMutation = useMutation({
    mutationFn: () => deleteIssue(issue.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['issues', projectId] }),
    onError: () => showToast('イシューの削除に失敗しました', 'error'),
  })

  return (
    <>
      <Draggable draggableId={issue.id} index={index} isDragDisabled={bulkMode || !canEdit}>
        {(provided, snapshot) => (
          <div
            ref={provided.innerRef}
            {...provided.draggableProps}
            {...(canEdit && !bulkMode ? provided.dragHandleProps : {})}
            style={{
              ...provided.draggableProps.style,
              opacity: snapshot.isDropAnimating ? 0 : undefined,
            }}
            onClick={() => {
              if (snapshot.isDragging) return
              if (bulkMode && onBulkToggle) { onBulkToggle(issue.id); return }
              onDetail(issue.id)
            }}
            className={`flex items-center gap-3 py-2.5 px-4 group transition-colors ${
              snapshot.isDragging
                ? 'bg-blue-50 border border-blue-200 rounded-lg shadow-md cursor-grabbing'
                : bulkSelected
                  ? 'bg-blue-50 cursor-pointer'
                  : selectedId === issue.id
                    ? 'bg-blue-50 cursor-grab'
                    : 'hover:bg-blue-50/40 cursor-grab'
            }`}
          >
            {bulkMode ? (
              <button
                onClick={e => { e.stopPropagation(); onBulkToggle?.(issue.id) }}
                className="shrink-0 text-blue-500"
              >
                {bulkSelected ? <CheckSquare size={15} /> : <Square size={15} className="text-gray-300" />}
              </button>
            ) : (
              <GripVertical size={14} className={`shrink-0 ${canEdit ? 'text-gray-300' : 'text-gray-200'}`} />
            )}
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
            {issue.epic_id && issue.epic_title && (
              <span className="flex items-center gap-1 text-xs text-purple-600 bg-purple-50 px-1.5 py-0.5 rounded shrink-0 max-w-28 truncate">
                <TypeIcon type="epic" />
                {issue.epic_title}
              </span>
            )}
            <div className="flex items-center gap-2 shrink-0" onClick={e => e.stopPropagation()}>
              {issue.type === 'story' && subtasks.length > 0 && (() => {
                const done = subtasks.filter(s => s.status === 'done').length
                return (
                  <div className="flex items-center gap-1.5 w-20">
                    <div className="flex-1 bg-gray-100 rounded-full h-1.5">
                      <div
                        className="bg-emerald-400 h-1.5 rounded-full"
                        style={{ width: `${(done / subtasks.length) * 100}%` }}
                      />
                    </div>
                    <span className="text-xs text-gray-400 shrink-0">{done}/{subtasks.length}</span>
                  </div>
                )
              })()}
              {issue.due_date && nowMs && (() => {
                const due = dueDateLabel(issue.due_date, nowMs, 'minimal')
                return (
                  <span className={`text-xs ${due.className}`}>
                    {due.text}
                  </span>
                )
              })()}
              <StatusBadge status={issue.status} />
              <PriorityBadge priority={issue.priority} />
              {issue.points != null && (
                <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded font-mono w-12 text-center">
                  {issue.points}pt
                </span>
              )}
              {issue.assignee_name && <Avatar name={issue.assignee_name} size="sm" />}
              {canEdit && (
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
              )}
            </div>
          </div>
        )}
      </Draggable>

      {subtasksOpen && subtasks.map(sub => (
        <SubtaskRow key={sub.id} issue={sub} selectedId={selectedId} onDetail={onDetail} />
      ))}

      {editing && canEdit && (
        <Modal title={`Edit #${issue.number}`} onClose={() => setEditing(false)}>
          <IssueForm projectId={projectId} issue={issue} onClose={() => setEditing(false)} />
        </Modal>
      )}

      {confirmDelete && canEdit && (
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
  bulkMode,
  bulkSelected,
  onBulkToggle,
  canEdit,
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
  bulkMode?: boolean
  bulkSelected?: Set<string>
  onBulkToggle?: (id: string) => void
  canEdit: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  const [maxVisible, setMaxVisible] = useState(50)
  const nowMs = useCurrentTime()
  const visibleIssues = issues.slice(0, maxVisible)

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
          {endDate && nowMs && (() => { const d = deadlineLabel(endDate, nowMs); return <span className={`text-xs ${d.className}`}>{d.text}</span> })()}
        </div>
        <span className="text-xs font-mono text-gray-500">{totalPts}pt</span>
      </div>

      <Droppable droppableId={droppableId} isDropDisabled={!open || !canEdit}>
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
                  visibleIssues.map((issue, index) => (
                    <IssueRow
                      key={issue.id}
                      issue={issue}
                      index={index}
                      projectId={projectId}
                      subtasks={allIssues.filter(i => i.parent_id === issue.id)}
                      selectedId={selectedId}
                      onDetail={onDetail}
                      bulkMode={bulkMode}
                      bulkSelected={bulkSelected?.has(issue.id)}
                      onBulkToggle={onBulkToggle}
                      canEdit={canEdit}
                    />
                  ))
                )}
                {issues.length > maxVisible && (
                  <button
                    onClick={e => { e.stopPropagation(); setMaxVisible(v => v + 50) }}
                    className="w-full py-2 text-xs text-blue-600 hover:bg-blue-50 transition-colors"
                  >
                    さらに表示（残り {issues.length - maxVisible} 件）
                  </button>
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
  const { role, canEditProject } = useProjectPermissions(activeProjectId)
  const [creating, setCreating] = useState(false)
  const [createType, setCreateType] = useState<IssueType>('task')
  const [detailId, setDetailId] = useState<string | null>(null)
  const [filterQuery, setFilterQuery] = useState('')
  const [bulkMode, setBulkMode] = useState(false)
  const [bulkSelected, setBulkSelected] = useState<Set<string>>(new Set())
  const [bulkLabelInput, setBulkLabelInput] = useState('')

  const { data: sprints = [] } = useQuery({
    queryKey: ['sprints', activeProjectId],
    queryFn: () => getSprints(activeProjectId!),
    enabled: !!activeProjectId,
  })

  const { data: members = [] } = useQuery({
    queryKey: ['project-members', activeProjectId],
    queryFn: () => getProjectMembers(activeProjectId!),
    enabled: !!activeProjectId && bulkMode,
  })

  const { data: projectLabels = [] } = useQuery({
    queryKey: ['labels', activeProjectId],
    queryFn: () => getLabels(activeProjectId!),
    enabled: !!activeProjectId && bulkMode,
  })

  const bulkMutation = useMutation({
    mutationFn: (payload: {
      status?: IssueStatus
      sprint_id?: string
      assignee_id?: string
      priority?: IssuePriority
      labels?: string[]
    }) =>
      bulkUpdateIssues(activeProjectId!, { issue_ids: [...bulkSelected], ...payload }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['issues', activeProjectId] })
      setBulkSelected(new Set())
      setBulkMode(false)
      setBulkLabelInput('')
      showToast('一括更新しました', 'success')
    },
    onError: () => showToast('一括更新に失敗しました', 'error'),
  })

  const toggleBulkSelect = (id: string) => {
    setBulkSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const selectVisibleIssues = (ids: string[]) => {
    setBulkSelected(new Set(ids))
  }

  const applyBulkLabels = () => {
    const labels = bulkLabelInput
      .split(',')
      .map(label => label.trim())
      .filter(Boolean)
    bulkMutation.mutate({ labels })
  }

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
    if (!canEditProject) return
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
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-bold text-gray-900">Backlog</h1>
          <ProjectRoleBadge role={role} />
        </div>
        <div className="flex items-center gap-2">
          {canEditProject && (
            <button
              onClick={() => { setBulkMode(v => !v); setBulkSelected(new Set()) }}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg border transition-colors ${
                bulkMode ? 'bg-blue-50 border-blue-300 text-blue-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
            >
              <CheckSquare size={14} /> 一括操作
            </button>
          )}
          {canEditProject && (
            <button
              onClick={() => {
                setCreateType('task')
                setCreating(true)
              }}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700"
            >
              <Plus size={16} /> Issueを作成
            </button>
          )}
        </div>
      </div>

      {canEditProject && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <span className="text-xs text-gray-400">クイック作成</span>
          {QUICK_CREATE_OPTIONS.map(option => (
            <button
              key={option.type}
              onClick={() => {
                setCreateType(option.type)
                setCreating(true)
              }}
              className="rounded-full border border-gray-200 bg-white px-3 py-1 text-xs text-gray-600 hover:bg-gray-50"
            >
              {option.label}
            </button>
          ))}
        </div>
      )}

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

	      {canEditProject && bulkMode && bulkSelected.size > 0 && (
	        <div className="flex items-center gap-3 mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm">
          <span className="text-blue-700 font-medium shrink-0">{bulkSelected.size}件選択中</span>
	          <select
	            defaultValue={BULK_SELECT_PLACEHOLDER}
	            onChange={e => {
                if (e.target.value === BULK_SELECT_PLACEHOLDER) return
                bulkMutation.mutate({ status: e.target.value as IssueStatus })
                e.target.value = BULK_SELECT_PLACEHOLDER
              }}
	            className="border border-gray-200 rounded px-2 py-1 text-sm"
	          >
	            <option value={BULK_SELECT_PLACEHOLDER}>ステータス変更...</option>
            <option value="todo">Todo</option>
            <option value="in_progress">In Progress</option>
            <option value="in_review">In Review</option>
            <option value="done">Done</option>
          </select>
	          <select
	            defaultValue={BULK_SELECT_PLACEHOLDER}
	            onChange={e => {
                if (e.target.value === BULK_SELECT_PLACEHOLDER) return
                bulkMutation.mutate({ sprint_id: e.target.value })
                e.target.value = BULK_SELECT_PLACEHOLDER
              }}
	            className="border border-gray-200 rounded px-2 py-1 text-sm"
	          >
	            <option value={BULK_SELECT_PLACEHOLDER}>スプリント変更...</option>
            <option value="backlog">Backlog</option>
            {sprints.filter(s => s.status !== 'completed').map(s => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
	          <select
	            defaultValue={BULK_SELECT_PLACEHOLDER}
	            onChange={e => {
                if (e.target.value === BULK_SELECT_PLACEHOLDER) return
                bulkMutation.mutate({
                  assignee_id: e.target.value === BULK_UNASSIGNED_ASSIGNEE ? '' : e.target.value,
                })
                e.target.value = BULK_SELECT_PLACEHOLDER
              }}
	            className="border border-gray-200 rounded px-2 py-1 text-sm"
	          >
	            <option value={BULK_SELECT_PLACEHOLDER}>担当者変更...</option>
	            <option value={BULK_UNASSIGNED_ASSIGNEE}>未割り当て</option>
            {members.map(m => (
              <option key={m.user_id} value={m.user_id}>{m.name}</option>
            ))}
          </select>
	          <select
	            defaultValue={BULK_SELECT_PLACEHOLDER}
	            onChange={e => {
                if (e.target.value === BULK_SELECT_PLACEHOLDER) return
                bulkMutation.mutate({ priority: e.target.value as IssuePriority })
                e.target.value = BULK_SELECT_PLACEHOLDER
              }}
	            className="border border-gray-200 rounded px-2 py-1 text-sm"
	          >
	            <option value={BULK_SELECT_PLACEHOLDER}>優先度変更...</option>
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
          <input
            value={bulkLabelInput}
            onChange={e => setBulkLabelInput(e.target.value)}
            list="bulk-label-suggestions"
            placeholder="labels,comma,separated"
            className="border border-gray-200 rounded px-2 py-1 text-sm min-w-44"
          />
          <datalist id="bulk-label-suggestions">
            {projectLabels.map(label => (
              <option key={label.id} value={label.name} />
            ))}
          </datalist>
          <button
            onClick={applyBulkLabels}
            disabled={bulkMutation.isPending}
            className="px-2 py-1 text-xs rounded border border-gray-200 text-gray-600 hover:bg-white disabled:opacity-40"
          >
            ラベル反映
          </button>
          <button onClick={() => setBulkSelected(new Set())} className="ml-auto text-gray-400 hover:text-gray-600">
            <X size={14} />
          </button>
        </div>
      )}

      {canEditProject && bulkMode && bulkSelected.size === 0 && topLevel.length > 0 && (
        <div className="mb-4 flex items-center gap-3 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm">
          <span className="text-gray-500">表示中のイシューをまとめて操作できます</span>
          <button
            onClick={() => selectVisibleIssues(topLevel.map(issue => issue.id))}
            className="text-blue-600 hover:text-blue-700"
          >
            表示中を全選択
          </button>
        </div>
      )}

      {!isLoading && topLevel.length === 0 && (
        <div className="mb-4 rounded-xl border border-dashed border-gray-300 bg-gray-50 px-4 py-4">
          <p className="text-sm font-medium text-gray-800">まだイシューがありません</p>
          <p className="mt-1 text-sm text-gray-500">
            {canEditProject
              ? 'まずはタスクかストーリーを1件作成すると、Backlog と Board の流れをすぐ確認できます。'
              : 'イシューが作成されるとここに一覧表示されます。必要ならプロジェクト管理者に作成を依頼してください。'}
          </p>
        </div>
      )}

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
                bulkMode={bulkMode}
                bulkSelected={bulkSelected}
                onBulkToggle={toggleBulkSelect}
                canEdit={canEditProject}
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
              bulkMode={bulkMode}
              bulkSelected={bulkSelected}
              onBulkToggle={toggleBulkSelect}
              canEdit={canEditProject}
            />
          </div>
        </DragDropContext>
      )}

      {creating && canEditProject && (
        <Modal title={`${QUICK_CREATE_OPTIONS.find(option => option.type === createType)?.label ?? 'Issue'}を作成`} onClose={() => setCreating(false)}>
          <IssueForm projectId={activeProjectId} defaultType={createType} onClose={() => setCreating(false)} />
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
