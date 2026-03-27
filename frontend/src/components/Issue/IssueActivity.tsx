import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { History, MessageSquare } from 'lucide-react'
import { getActivity, getComments } from '../../api/issues'
import { getSprints } from '../../api/sprints'
import { getProjectMembers } from '../../api/workspaces'
import { Avatar } from '../common/Avatar'

interface Props {
  issueId: string
  projectId: string
}

interface ActivityItem {
  id: string
  created_at: string
  field: string
  old_value: string | null
  new_value: string | null
}

type TimelineItem =
  | {
      id: string
      kind: 'comment'
      created_at: string
      author_name: string
      author_avatar_url: string | null
      body: string
    }
  | {
      id: string
      kind: 'activity_group'
      created_at: string
      items: ActivityItem[]
    }

type ActivityFilter = 'all' | 'comments' | 'changes' | 'automation'

const FIELD_LABELS: Record<string, string> = {
  status: 'ステータス',
  sprint_id: 'スプリント',
  sprint_carryover: 'スプリント移動',
  assignee_id: '担当者',
  assignee_notification: '担当変更通知',
  priority: '優先度',
  labels: 'ラベル',
  due_date: '期限日',
  review_ready: 'レビュー通知',
  overdue: '期限超過通知',
}

const STATUS_LABELS: Record<string, string> = {
  todo: '未着手',
  in_progress: '進行中',
  in_review: 'レビュー中',
  done: '完了',
}

const PRIORITY_LABELS: Record<string, string> = {
  critical: '緊急',
  high: '高',
  medium: '中',
  low: '低',
}

const SYSTEM_FIELDS = new Set(['assignee_notification', 'review_ready', 'overdue', 'sprint_carryover'])

function timelineLabel(field: string) {
  return FIELD_LABELS[field] ?? field
}

function groupKey(createdAt: string) {
  return new Date(createdAt).toLocaleDateString('ja-JP', {
    month: 'short',
    day: 'numeric',
    weekday: 'short',
  })
}

function timeLabel(createdAt: string) {
  return new Date(createdAt).toLocaleTimeString('ja-JP', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

function parseLabels(value: string | null) {
  if (!value) return []
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : []
  } catch {
    return value ? [value] : []
  }
}

function resolveMemberName(value: string | null, memberNames: Record<string, string>) {
  if (!value) return '未割り当て'
  return memberNames[value] ?? value
}

function resolveSprintName(value: string | null, sprintNames: Record<string, string>) {
  if (!value) return 'バックログ'
  return sprintNames[value] ?? value
}

function formatValueTokens(
  field: string,
  value: string | null,
  memberNames: Record<string, string>,
  sprintNames: Record<string, string>,
) {
  switch (field) {
    case 'status':
      return [value ? (STATUS_LABELS[value] ?? value) : '—']
    case 'priority':
      return [value ? (PRIORITY_LABELS[value] ?? value) : '—']
    case 'assignee_id':
      return [resolveMemberName(value, memberNames)]
    case 'sprint_id':
    case 'sprint_carryover':
      return [resolveSprintName(value, sprintNames)]
    case 'due_date':
      return [value ?? 'なし']
    case 'labels': {
      const labels = parseLabels(value)
      return labels.length > 0 ? labels : ['なし']
    }
    case 'review_ready':
    case 'overdue':
      return [resolveMemberName(value, memberNames)]
    default:
      return [value ?? '—']
  }
}

function renderValuePills(tokens: string[], tone: 'old' | 'new') {
  const className = tone === 'old'
    ? 'bg-gray-100 text-gray-600'
    : 'bg-blue-50 text-blue-700'

  return (
    <span className="inline-flex flex-wrap gap-1 align-middle">
      {tokens.map(token => (
        <span key={`${tone}-${token}`} className={`rounded px-1.5 py-0.5 text-xs font-medium ${className}`}>
          {token}
        </span>
      ))}
    </span>
  )
}

function systemMessage(
  item: ActivityItem,
  memberNames: Record<string, string>,
  sprintNames: Record<string, string>,
) {
  switch (item.field) {
    case 'review_ready':
      return `${item.old_value ?? '誰か'} が ${resolveMemberName(item.new_value, memberNames)} にレビュー待ち通知を送信`
    case 'assignee_notification':
      return `${item.old_value ?? '誰か'} が ${resolveMemberName(item.new_value, memberNames)} に担当変更通知を送信`
    case 'overdue':
      return `${resolveMemberName(item.new_value, memberNames)} に期限超過通知を送信`
    case 'sprint_carryover':
      return `スプリント完了に伴い ${resolveSprintName(item.old_value, sprintNames)} から ${resolveSprintName(item.new_value, sprintNames)} に移動`
    default:
      return timelineLabel(item.field)
  }
}

function activityGroupTone(items: ActivityItem[]) {
  if (items.every(item => SYSTEM_FIELDS.has(item.field))) {
    return {
      container: 'border-amber-200 bg-amber-50/60',
      badge: 'bg-amber-100 text-amber-700',
      summary: 'text-amber-900',
      detail: 'text-amber-800',
    }
  }

  const hasWorkflow = items.some(item => item.field === 'status' || item.field === 'sprint_id')
  if (hasWorkflow) {
    return {
      container: 'border-blue-200 bg-blue-50/40',
      badge: 'bg-blue-100 text-blue-700',
      summary: 'text-blue-900',
      detail: 'text-gray-700',
    }
  }

  return {
    container: 'border-gray-200 bg-white',
    badge: 'bg-gray-100 text-gray-600',
    summary: 'text-gray-900',
    detail: 'text-gray-700',
  }
}

function groupActivities(items: ActivityItem[]) {
  const sorted = [...items].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
  return sorted.reduce<Array<{ id: string; created_at: string; items: ActivityItem[] }>>((groups, item) => {
    const current = groups[groups.length - 1]
    if (current && current.created_at === item.created_at) {
      current.items.push(item)
      return groups
    }

    groups.push({
      id: item.id,
      created_at: item.created_at,
      items: [item],
    })
    return groups
  }, [])
}

function filterActivityItems(items: ActivityItem[], filter: ActivityFilter) {
  switch (filter) {
    case 'changes':
      return items.filter(item => !SYSTEM_FIELDS.has(item.field))
    case 'automation':
      return items.filter(item => SYSTEM_FIELDS.has(item.field))
    default:
      return items
  }
}

function badgeLabel(items: ActivityItem[]) {
  const isSystemOnly = items.every(entry => SYSTEM_FIELDS.has(entry.field))
  return isSystemOnly ? '自動化' : items.length > 1 ? 'まとめて更新' : '変更'
}

function timelineCounts(items: TimelineItem[]) {
  return items.reduce(
    (acc, item) => {
      if (item.kind === 'comment') {
        acc.comments += 1
        return acc
      }

      item.items.forEach(entry => {
        if (SYSTEM_FIELDS.has(entry.field)) acc.automation += 1
        else acc.changes += 1
      })
      return acc
    },
    { comments: 0, changes: 0, automation: 0 },
  )
}

export function IssueActivity({ issueId, projectId }: Props) {
  const [activeFilter, setActiveFilter] = useState<ActivityFilter>('all')
  const { data: activity = [], isError: activityError } = useQuery({
    queryKey: ['activity', issueId],
    queryFn: () => getActivity(issueId),
  })
  const { data: comments = [], isError: commentsError } = useQuery({
    queryKey: ['comments', issueId],
    queryFn: () => getComments(issueId),
  })
  const { data: members = [] } = useQuery({
    queryKey: ['project-members', projectId],
    queryFn: () => getProjectMembers(projectId),
    enabled: !!projectId,
    staleTime: 30_000,
  })
  const { data: sprints = [] } = useQuery({
    queryKey: ['sprints', projectId],
    queryFn: () => getSprints(projectId),
    enabled: !!projectId,
    staleTime: 30_000,
  })

  const memberNames = Object.fromEntries(members.map(member => [member.user_id, member.name]))
  const sprintNames = Object.fromEntries(sprints.map(sprint => [sprint.id, sprint.name]))

  const commentTimeline: TimelineItem[] = comments.map(comment => ({
    id: comment.id,
    kind: 'comment',
    created_at: comment.created_at,
    author_name: comment.author_name,
    author_avatar_url: comment.author_avatar_url,
    body: comment.body,
  }))
  const activityTimeline: TimelineItem[] = groupActivities(activity).map(group => ({
    id: group.id,
    kind: 'activity_group',
    created_at: group.created_at,
    items: group.items,
  }))
  const rawTimeline: TimelineItem[] = [
    ...commentTimeline,
    ...activityTimeline,
  ]
  const timeline: TimelineItem[] = rawTimeline
    .filter(item => {
      if (activeFilter === 'all') return true
      if (activeFilter === 'comments') return item.kind === 'comment'
      if (item.kind === 'comment') return false
      return filterActivityItems(item.items, activeFilter).length > 0
    })
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

  const groupedTimeline = timeline.reduce<Record<string, TimelineItem[]>>((groups, item) => {
    const key = groupKey(item.created_at)
    if (!groups[key]) groups[key] = []
    groups[key].push(item)
    return groups
  }, {})
  const counts = timelineCounts(rawTimeline)
  const filterSummary = activeFilter === 'comments'
    ? `${counts.comments}件のコメント`
    : activeFilter === 'changes'
      ? `${counts.changes}件の変更`
      : activeFilter === 'automation'
        ? `${counts.automation}件の自動化`
        : `${counts.comments + counts.changes + counts.automation}件の履歴`

  return (
    <div className="space-y-4">
      <div aria-label="タイムラインフィルター" className="flex flex-wrap gap-2">
        {[
          { value: 'all' as const, label: 'すべて' },
          { value: 'comments' as const, label: 'コメント' },
          { value: 'changes' as const, label: '変更' },
          { value: 'automation' as const, label: '自動化' },
        ].map(filter => (
          <button
            key={filter.value}
            onClick={() => setActiveFilter(filter.value)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              activeFilter === filter.value
                ? 'bg-blue-100 text-blue-700'
                : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
            }`}
          >
            {filter.label}
          </button>
        ))}
      </div>
      <p className="text-xs text-gray-400">{filterSummary}</p>
      {(activityError || commentsError) && (
        <p className="text-sm text-red-400">タイムラインの取得に失敗しました</p>
      )}
      {!activityError && !commentsError && timeline.length === 0 && (
        <p className="text-sm text-gray-400">
          {activeFilter === 'all' ? 'タイムラインなし' : 'この条件に一致する履歴はありません'}
        </p>
      )}
      {Object.entries(groupedTimeline).map(([date, items]) => (
        <div key={date}>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">{date}</p>
          <div className="space-y-2">
            {items.map(item => (
              item.kind === 'comment' ? (
                <div key={item.id} className="flex gap-3 rounded-xl border border-blue-100 bg-blue-50/60 p-3">
                  <Avatar name={item.author_name} avatarUrl={item.author_avatar_url ?? undefined} />
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex items-center gap-2">
                      <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-medium text-blue-700">
                        <MessageSquare size={11} /> コメント
                      </span>
                      <span className="text-xs font-medium text-gray-700">{item.author_name}</span>
                      <span className="text-xs text-gray-400">{timeLabel(item.created_at)}</span>
                    </div>
                    <p className="whitespace-pre-wrap text-sm text-gray-700">{item.body}</p>
                  </div>
                </div>
              ) : (() => {
                  const visibleEntries = filterActivityItems(item.items, activeFilter)
                  const tone = activityGroupTone(visibleEntries)
                  const label = badgeLabel(visibleEntries)

                  return (
                    <div key={item.id} className={`rounded-xl border p-3 ${tone.container}`}>
                      <div className="mb-2 flex items-center gap-2">
                        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${tone.badge}`}>
                          <History size={11} /> {label}
                        </span>
                        {visibleEntries.length > 1 && (
                          <span className={`text-xs font-medium ${tone.summary}`}>{visibleEntries.length}件</span>
                        )}
                        <span className="text-xs text-gray-400">{timeLabel(item.created_at)}</span>
                      </div>
                      <div className="space-y-2">
                        {visibleEntries.map(entry => (
                          SYSTEM_FIELDS.has(entry.field) ? (
                            <p key={entry.id} className={`text-sm ${tone.detail}`}>
                              {systemMessage(entry, memberNames, sprintNames)}
                            </p>
                          ) : (
                            <div key={entry.id} className="flex flex-wrap items-center gap-1.5 text-sm text-gray-700">
                              <strong>{timelineLabel(entry.field)}</strong>
                              <span>を</span>
                              {renderValuePills(
                                formatValueTokens(entry.field, entry.old_value, memberNames, sprintNames),
                                'old',
                              )}
                              <span>から</span>
                              {renderValuePills(
                                formatValueTokens(entry.field, entry.new_value, memberNames, sprintNames),
                                'new',
                              )}
                              <span>に変更</span>
                            </div>
                          )
                        ))}
                      </div>
                    </div>
                  )
                })()
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
