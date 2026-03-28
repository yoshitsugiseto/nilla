import type { IssuePriority, IssueStatus, IssueType, SprintStatus } from '../types'

export const ISSUE_STATUS_LABELS: Record<IssueStatus, string> = {
  todo: '未着手',
  in_progress: '進行中',
  in_review: 'レビュー待ち',
  done: '完了',
}

export const ISSUE_PRIORITY_LABELS: Record<IssuePriority, string> = {
  critical: '最優先',
  high: '高',
  medium: '中',
  low: '低',
}

export const ISSUE_TYPE_LABELS: Record<IssueType, string> = {
  epic: 'エピック',
  story: 'ストーリー',
  task: 'タスク',
  bug: 'バグ',
  spike: '調査',
}

export const SPRINT_STATUS_LABELS: Record<SprintStatus, string> = {
  planning: '計画中',
  active: '進行中',
  completed: '完了',
}

export function issueStatusLabel(status: IssueStatus | string): string {
  return ISSUE_STATUS_LABELS[status as IssueStatus] ?? status
}

export function issuePriorityLabel(priority: IssuePriority | string): string {
  return ISSUE_PRIORITY_LABELS[priority as IssuePriority] ?? priority
}

export function issueTypeLabel(type: IssueType | string): string {
  return ISSUE_TYPE_LABELS[type as IssueType] ?? type
}

export function sprintStatusLabel(status: SprintStatus | string): string {
  return SPRINT_STATUS_LABELS[status as SprintStatus] ?? status
}
