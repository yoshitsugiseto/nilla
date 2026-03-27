import { useId, useState } from 'react'
import { X } from 'lucide-react'
import type {
  BulkUpdatePayload,
  BulkUpdateResult,
  IssuePriority,
  IssueStatus,
  ProjectLabel,
  ProjectMember,
  Sprint,
} from '../../types'

const BULK_SELECT_PLACEHOLDER = '__placeholder__'
const BULK_UNASSIGNED_ASSIGNEE = '__unassigned__'

interface Props {
  selectedCount: number
  members: ProjectMember[]
  sprints: Sprint[]
  projectLabels: ProjectLabel[]
  isPending: boolean
  onApply: (payload: Omit<BulkUpdatePayload, 'issue_ids'>) => void
  onClearSelection: () => void
}

export function formatBulkUpdateToast(result: BulkUpdateResult) {
  if (result.updated_count === 0 && result.skipped_ids.length > 0) {
    return {
      message: `${result.skipped_ids.length}件をスキップしました`,
      type: 'info' as const,
    }
  }
  if (result.skipped_ids.length > 0) {
    return {
      message: `${result.updated_count}件更新しました（${result.skipped_ids.length}件はスキップ）`,
      type: 'info' as const,
    }
  }
  return {
    message: `${result.updated_count}件更新しました`,
    type: 'success' as const,
  }
}

export function IssueBulkActionBar({
  selectedCount,
  members,
  sprints,
  projectLabels,
  isPending,
  onApply,
  onClearSelection,
}: Props) {
  const labelsListId = useId()
  const [labelInput, setLabelInput] = useState('')
  const [dueDateInput, setDueDateInput] = useState('')

  const applyLabels = () => {
    const labels = labelInput
      .split(',')
      .map(label => label.trim())
      .filter(Boolean)
    if (labels.length === 0) return
    onApply({ labels })
  }

  return (
    <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm">
      <span className="shrink-0 font-medium text-blue-700">{selectedCount}件選択中</span>
      <select
        defaultValue={BULK_SELECT_PLACEHOLDER}
        onChange={event => {
          if (event.target.value === BULK_SELECT_PLACEHOLDER) return
          onApply({ status: event.target.value as IssueStatus })
          event.target.value = BULK_SELECT_PLACEHOLDER
        }}
        className="rounded border border-gray-200 px-2 py-1 text-sm"
      >
        <option value={BULK_SELECT_PLACEHOLDER}>ステータス変更...</option>
        <option value="todo">Todo</option>
        <option value="in_progress">In Progress</option>
        <option value="in_review">In Review</option>
        <option value="done">Done</option>
      </select>
      <select
        defaultValue={BULK_SELECT_PLACEHOLDER}
        onChange={event => {
          if (event.target.value === BULK_SELECT_PLACEHOLDER) return
          onApply({ sprint_id: event.target.value })
          event.target.value = BULK_SELECT_PLACEHOLDER
        }}
        className="rounded border border-gray-200 px-2 py-1 text-sm"
      >
        <option value={BULK_SELECT_PLACEHOLDER}>スプリント変更...</option>
        <option value="backlog">Backlog</option>
        {sprints
          .filter(sprint => sprint.status !== 'completed')
          .map(sprint => (
            <option key={sprint.id} value={sprint.id}>
              {sprint.name}
            </option>
          ))}
      </select>
      <select
        defaultValue={BULK_SELECT_PLACEHOLDER}
        onChange={event => {
          if (event.target.value === BULK_SELECT_PLACEHOLDER) return
          onApply({
            assignee_id: event.target.value === BULK_UNASSIGNED_ASSIGNEE ? '' : event.target.value,
          })
          event.target.value = BULK_SELECT_PLACEHOLDER
        }}
        className="rounded border border-gray-200 px-2 py-1 text-sm"
      >
        <option value={BULK_SELECT_PLACEHOLDER}>担当者変更...</option>
        <option value={BULK_UNASSIGNED_ASSIGNEE}>未割り当て</option>
        {members.map(member => (
          <option key={member.user_id} value={member.user_id}>
            {member.name}
          </option>
        ))}
      </select>
      <select
        defaultValue={BULK_SELECT_PLACEHOLDER}
        onChange={event => {
          if (event.target.value === BULK_SELECT_PLACEHOLDER) return
          onApply({ priority: event.target.value as IssuePriority })
          event.target.value = BULK_SELECT_PLACEHOLDER
        }}
        className="rounded border border-gray-200 px-2 py-1 text-sm"
      >
        <option value={BULK_SELECT_PLACEHOLDER}>優先度変更...</option>
        <option value="critical">Critical</option>
        <option value="high">High</option>
        <option value="medium">Medium</option>
        <option value="low">Low</option>
      </select>
      <div className="flex items-center gap-2">
        <input
          type="date"
          value={dueDateInput}
          onChange={event => setDueDateInput(event.target.value)}
          className="rounded border border-gray-200 px-2 py-1 text-sm"
          aria-label="一括期限日"
        />
        <button
          onClick={() => dueDateInput && onApply({ due_date: dueDateInput })}
          disabled={isPending || !dueDateInput}
          className="rounded border border-gray-200 px-2 py-1 text-xs text-gray-600 hover:bg-white disabled:opacity-40"
        >
          期限日反映
        </button>
        <button
          onClick={() => {
            setDueDateInput('')
            onApply({ due_date: null })
          }}
          disabled={isPending}
          className="rounded border border-gray-200 px-2 py-1 text-xs text-gray-600 hover:bg-white disabled:opacity-40"
        >
          期限日クリア
        </button>
      </div>
      <input
        value={labelInput}
        onChange={event => setLabelInput(event.target.value)}
        list={labelsListId}
        placeholder="labels,comma,separated"
        className="min-w-44 rounded border border-gray-200 px-2 py-1 text-sm"
      />
      <datalist id={labelsListId}>
        {projectLabels.map(label => (
          <option key={label.id} value={label.name} />
        ))}
      </datalist>
      <button
        onClick={applyLabels}
        disabled={isPending || labelInput.trim().length === 0}
        className="rounded border border-gray-200 px-2 py-1 text-xs text-gray-600 hover:bg-white disabled:opacity-40"
      >
        ラベル反映
      </button>
      <button onClick={onClearSelection} className="ml-auto text-gray-400 hover:text-gray-600">
        <X size={14} />
      </button>
    </div>
  )
}
