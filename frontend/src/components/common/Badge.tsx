import { BookOpen, CheckSquare, Bug, Zap, Layers } from 'lucide-react'
import type { IssueStatus, IssuePriority, IssueType } from '../../types'
import { ISSUE_PRIORITY_LABELS, ISSUE_STATUS_LABELS, ISSUE_TYPE_LABELS } from '../../utils/labels'

const statusConfig: Record<IssueStatus, { label: string; className: string }> = {
  todo: { label: ISSUE_STATUS_LABELS.todo, className: 'bg-gray-100 text-gray-600' },
  in_progress: { label: ISSUE_STATUS_LABELS.in_progress, className: 'bg-blue-100 text-blue-700' },
  in_review: { label: ISSUE_STATUS_LABELS.in_review, className: 'bg-purple-100 text-purple-700' },
  done: { label: ISSUE_STATUS_LABELS.done, className: 'bg-emerald-100 text-emerald-700' },
}

const priorityConfig: Record<IssuePriority, { label: string; className: string }> = {
  critical: { label: ISSUE_PRIORITY_LABELS.critical, className: 'bg-red-100 text-red-700' },
  high: { label: ISSUE_PRIORITY_LABELS.high, className: 'bg-orange-100 text-orange-700' },
  medium: { label: ISSUE_PRIORITY_LABELS.medium, className: 'bg-yellow-100 text-yellow-700' },
  low: { label: ISSUE_PRIORITY_LABELS.low, className: 'bg-gray-100 text-gray-500' },
}

const typeConfig: Record<IssueType, { label: string; icon: React.ReactNode; className: string }> = {
  epic:   { label: ISSUE_TYPE_LABELS.epic,  icon: <Layers size={11} />,      className: 'bg-purple-100 text-purple-700' },
  story:  { label: ISSUE_TYPE_LABELS.story, icon: <BookOpen size={11} />,    className: 'bg-green-100 text-green-700' },
  task:   { label: ISSUE_TYPE_LABELS.task,  icon: <CheckSquare size={11} />, className: 'bg-blue-100 text-blue-700' },
  bug:    { label: ISSUE_TYPE_LABELS.bug,   icon: <Bug size={11} />,         className: 'bg-red-100 text-red-700' },
  spike:  { label: ISSUE_TYPE_LABELS.spike, icon: <Zap size={11} />,         className: 'bg-amber-100 text-amber-700' },
}

export function StatusBadge({ status }: { status: IssueStatus }) {
  const cfg = statusConfig[status] ?? { label: status, className: 'bg-gray-100 text-gray-600' }
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${cfg.className}`}>
      {cfg.label}
    </span>
  )
}

export function PriorityBadge({ priority }: { priority: IssuePriority }) {
  const cfg = priorityConfig[priority] ?? { label: priority, className: 'bg-gray-100 text-gray-500' }
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${cfg.className}`}>
      {cfg.label}
    </span>
  )
}

export function TypeIcon({ type }: { type: IssueType }) {
  const cfg = typeConfig[type] ?? { label: type, icon: <CheckSquare size={11} />, className: 'bg-gray-100 text-gray-500' }
  return (
    <span
      title={cfg.label}
      className={`inline-flex items-center justify-center w-5 h-5 rounded ${cfg.className} shrink-0`}
    >
      {cfg.icon}
    </span>
  )
}
