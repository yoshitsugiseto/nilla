import { useQuery } from '@tanstack/react-query'
import { getActivity } from '../../api/issues'

interface Props {
  issueId: string
}

export function IssueActivity({ issueId }: Props) {
  const { data: activity = [], isError: activityError } = useQuery({
    queryKey: ['activity', issueId],
    queryFn: () => getActivity(issueId),
  })

  return (
    <div className="space-y-2">
      {activityError && (
        <p className="text-sm text-red-400">アクティビティの取得に失敗しました</p>
      )}
      {!activityError && activity.length === 0 && (
        <p className="text-sm text-gray-400">アクティビティなし</p>
      )}
      {activity.map(a => (
        <div key={a.id} className="flex items-center gap-2 text-sm text-gray-600">
          <span className="w-2 h-2 rounded-full bg-gray-300 shrink-0" />
          <span>
            <strong>{a.field}</strong> changed from{' '}
            <span className="font-mono text-xs bg-gray-100 px-1 rounded">{a.old_value ?? '—'}</span>
            {' → '}
            <span className="font-mono text-xs bg-blue-50 text-blue-700 px-1 rounded">{a.new_value ?? '—'}</span>
          </span>
          <span className="text-xs text-gray-400 ml-auto shrink-0">
            {new Date(a.created_at).toLocaleString('ja-JP', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
      ))}
    </div>
  )
}
