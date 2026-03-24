import { X } from 'lucide-react'
import { TypeIcon } from '../common/Badge'
import type { Issue, IssuePriority, IssueType } from '../../types'

export interface Filters {
  assignee_id?: string
  priority?: IssuePriority
  type?: IssueType
}

interface Props {
  issues: Issue[]
  filters: Filters
  onChange: (filters: Filters) => void
}

export function BoardFilters({ issues, filters, onChange }: Props) {
  // Build unique assignees from issues (id -> name mapping)
  const assigneeMap = new Map<string, string>()
  for (const i of issues) {
    if (i.assignee_id && i.assignee_name) {
      assigneeMap.set(i.assignee_id, i.assignee_name)
    }
  }
  const assignees = [...assigneeMap.entries()]
  const hasFilters = Object.values(filters).some(Boolean)

  return (
    <div className="flex items-center gap-3 flex-wrap">
      {/* Assignee */}
      <div className="flex items-center gap-1">
        <span className="text-xs text-gray-400">担当:</span>
        <div className="flex gap-1">
          {assignees.map(([id, name]) => (
            <button
              key={id}
              onClick={() => onChange({ ...filters, assignee_id: filters.assignee_id === id ? undefined : id })}
              className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${
                filters.assignee_id === id
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'border-gray-200 text-gray-600 hover:border-blue-300'
              }`}
            >
              {name}
            </button>
          ))}
        </div>
      </div>

      {/* Priority */}
      <div className="flex items-center gap-1">
        <span className="text-xs text-gray-400">優先度:</span>
        {(['critical', 'high', 'medium', 'low'] as IssuePriority[]).map(p => {
          const colorClass = p === 'critical' ? 'bg-red-500' : p === 'high' ? 'bg-orange-400' : p === 'medium' ? 'bg-yellow-400' : 'bg-gray-300'
          return (
            <button
              key={p}
              onClick={() => onChange({ ...filters, priority: filters.priority === p ? undefined : p })}
              className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border transition-colors ${
                filters.priority === p
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'border-gray-200 text-gray-600 hover:border-blue-300'
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${colorClass}`} />
              <span className="capitalize">{p}</span>
            </button>
          )
        })}
      </div>

      {/* Type */}
      <div className="flex items-center gap-1">
        <span className="text-xs text-gray-400">タイプ:</span>
        {(['story', 'task', 'bug', 'spike'] as IssueType[]).map(t => (
          <button
            key={t}
            onClick={() => onChange({ ...filters, type: filters.type === t ? undefined : t })}
            className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border transition-colors ${
              filters.type === t
                ? 'bg-blue-600 text-white border-blue-600'
                : 'border-gray-200 text-gray-600 hover:border-blue-300'
            }`}
          >
            <TypeIcon type={t} />
            <span className="capitalize">{t}</span>
          </button>
        ))}
      </div>

      {hasFilters && (
        <button
          onClick={() => onChange({})}
          className="flex items-center gap-1 text-xs text-gray-400 hover:text-red-500 ml-1"
        >
          <X size={12} /> クリア
        </button>
      )}
    </div>
  )
}
