import { useQuery } from '@tanstack/react-query'
import { MessageSquare, History } from 'lucide-react'
import { getActivity, getComments } from '../../api/issues'
import { Avatar } from '../common/Avatar'

interface Props {
  issueId: string
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
      kind: 'activity'
      created_at: string
      field: string
      old_value: string | null
      new_value: string | null
    }

const FIELD_LABELS: Record<string, string> = {
  status: 'ステータス',
  sprint_id: 'スプリント',
  assignee_id: '担当者',
  priority: '優先度',
  due_date: '期限日',
}

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

export function IssueActivity({ issueId }: Props) {
  const { data: activity = [], isError: activityError } = useQuery({
    queryKey: ['activity', issueId],
    queryFn: () => getActivity(issueId),
  })
  const { data: comments = [], isError: commentsError } = useQuery({
    queryKey: ['comments', issueId],
    queryFn: () => getComments(issueId),
  })

  const timeline: TimelineItem[] = [
    ...comments.map(comment => ({
      id: comment.id,
      kind: 'comment' as const,
      created_at: comment.created_at,
      author_name: comment.author_name,
      author_avatar_url: comment.author_avatar_url,
      body: comment.body,
    })),
    ...activity.map(item => ({
      id: item.id,
      kind: 'activity' as const,
      created_at: item.created_at,
      field: item.field,
      old_value: item.old_value,
      new_value: item.new_value,
    })),
  ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

  const groupedTimeline = timeline.reduce<Record<string, TimelineItem[]>>((groups, item) => {
    const key = groupKey(item.created_at)
    if (!groups[key]) groups[key] = []
    groups[key].push(item)
    return groups
  }, {})

  return (
    <div className="space-y-4">
      {(activityError || commentsError) && (
        <p className="text-sm text-red-400">タイムラインの取得に失敗しました</p>
      )}
      {!activityError && !commentsError && timeline.length === 0 && (
        <p className="text-sm text-gray-400">タイムラインなし</p>
      )}
      {Object.entries(groupedTimeline).map(([date, items]) => (
        <div key={date}>
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">{date}</p>
          <div className="space-y-2">
            {items.map(item => (
              item.kind === 'comment' ? (
                <div key={item.id} className="flex gap-3 rounded-xl border border-blue-100 bg-blue-50/60 p-3">
                  <Avatar name={item.author_name} avatarUrl={item.author_avatar_url ?? undefined} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-medium text-blue-700">
                        <MessageSquare size={11} /> コメント
                      </span>
                      <span className="text-xs font-medium text-gray-700">{item.author_name}</span>
                      <span className="text-xs text-gray-400">
                        {new Date(item.created_at).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <p className="text-sm text-gray-700 whitespace-pre-wrap">{item.body}</p>
                  </div>
                </div>
              ) : (
                <div key={item.id} className="rounded-xl border border-gray-200 bg-white p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-600">
                      <History size={11} /> 変更
                    </span>
                    <span className="text-xs text-gray-400">
                      {new Date(item.created_at).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <p className="text-sm text-gray-700">
                    <strong>{timelineLabel(item.field)}</strong> を
                    <span className="mx-1 rounded bg-gray-100 px-1.5 py-0.5 font-mono text-xs text-gray-600">
                      {item.old_value ?? '—'}
                    </span>
                    から
                    <span className="ml-1 rounded bg-blue-50 px-1.5 py-0.5 font-mono text-xs text-blue-700">
                      {item.new_value ?? '—'}
                    </span>
                    に変更
                  </p>
                </div>
              )
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
