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

export function BulkUpdateResultPanel({
  result,
  onDismiss,
  onRetrySkipped,
}: {
  result: BulkUpdateResult
  onDismiss: () => void
  onRetrySkipped?: (issueIds: string[]) => void
}) {
  return (
    <div className="mb-4 rounded-xl border border-gray-200 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-gray-900">一括更新結果</p>
          <p className="mt-1 text-sm text-gray-600">
            {result.updated_count}件更新
            {result.skipped.length > 0 ? ` / ${result.skipped.length}件スキップ` : ''}
          </p>
        </div>
        <button onClick={onDismiss} className="text-gray-400 hover:text-gray-600">
          <X size={14} />
        </button>
      </div>
      {result.skipped.length > 0 && (
        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50/60 p-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-medium text-amber-800">スキップ詳細</p>
            {onRetrySkipped && (
              <button
                onClick={() => onRetrySkipped(result.skipped_ids)}
                className="rounded-full bg-white px-2.5 py-1 text-[11px] font-medium text-amber-800 hover:bg-amber-100"
              >
                スキップ分を再選択
              </button>
            )}
          </div>
          <div className="mt-2 space-y-1 text-xs text-amber-900">
            {result.skipped.map(item => (
              <div key={item.issue_id} className="flex items-center gap-2">
                <span className="font-mono text-amber-700">{item.issue_id}</span>
                <span>{item.reason}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
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
