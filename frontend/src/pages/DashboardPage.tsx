import { useQuery } from '@tanstack/react-query'
import { getIssues } from '../api/issues'
import { getSprints } from '../api/sprints'
import { useAppStore } from '../store'
import { TypeIcon, PriorityBadge } from '../components/common/Badge'
import { DetailPanel } from '../components/common/DetailPanel'
import { IssueDetail } from '../components/Issue/IssueDetail'
import { useState } from 'react'
import { ProjectRoleBadge } from '../components/common/ProjectRoleBadge'
import { CheckCircle2, AlertCircle, Clock, BarChart3 } from 'lucide-react'
import { useCurrentTime } from '../hooks/useCurrentTime'
import { useProjectPermissions } from '../hooks/useProjectPermissions'
import { deadlineLabel } from '../utils/date'

const STATUS_COLORS: Record<string, string> = {
  todo: 'bg-gray-200',
  in_progress: 'bg-blue-400',
  in_review: 'bg-purple-400',
  done: 'bg-emerald-400',
}

const STATUS_LABELS: Record<string, string> = {
  todo: 'Todo',
  in_progress: 'In Progress',
  in_review: 'In Review',
  done: 'Done',
}

export function DashboardPage() {
  const { activeProjectId } = useAppStore()
  const { role } = useProjectPermissions(activeProjectId)
  const [detailId, setDetailId] = useState<string | null>(null)
  const nowMs = useCurrentTime()

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

  if (!activeProjectId) {
    return <div className="flex-1 flex items-center justify-center text-gray-400">← プロジェクトを選択してください</div>
  }

  const activeSprint = sprints.find(s => s.status === 'active')
  const activeIssues = activeSprint ? issues.filter(i => i.sprint_id === activeSprint.id) : []
  const totalPts = activeIssues.reduce((s, i) => s + (i.points ?? 0), 0)
  const donePts = activeIssues.filter(i => i.status === 'done').reduce((s, i) => s + (i.points ?? 0), 0)
  const pct = totalPts > 0 ? Math.round((donePts / totalPts) * 100) : 0

  const byStatus = (s: string) => issues.filter(i => i.status === s)
  const statuses = ['todo', 'in_progress', 'in_review', 'done']

  const highPriorityOpen = issues
    .filter(i => (i.priority === 'critical' || i.priority === 'high') && i.status !== 'done')
    .slice(0, 5)
  const hasHighPriorityIssues = issues.some(i => i.priority === 'critical' || i.priority === 'high')

  const recentIssues = [...issues]
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
    .slice(0, 5)
  const needsOnboarding = issues.length === 0 || sprints.length === 0

  return (
    <div className="flex-1 flex overflow-hidden">
    <div className="flex-1 overflow-auto">
      <div className="p-6 max-w-6xl space-y-6">
      <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
        <BarChart3 size={20} /> Dashboard
        <ProjectRoleBadge role={role} />
      </h1>

      {needsOnboarding && (
        <section aria-label="はじめての使い方" className="rounded-2xl border border-blue-200 bg-blue-50/60 p-5">
          <h2 className="text-sm font-semibold text-blue-900">はじめての使い方</h2>
          <p className="mt-1 text-sm text-blue-800">
            {issues.length === 0 && sprints.length === 0
              ? '最初は「イシューを作る」「スプリントを作る」「Boardで進捗を見る」の順で始めると分かりやすいです。'
              : issues.length === 0
                ? 'スプリントの準備はできています。次は Backlog でイシューを作ると進行を始められます。'
                : 'イシューはあります。次は Sprints でスプリントを作ると Board が使いやすくなります。'}
          </p>
          <div className="mt-3 grid gap-3 md:grid-cols-3">
            <div className="rounded-xl bg-white p-4">
              <p className="text-xs font-medium text-gray-500">1. Backlog</p>
              <p className="mt-1 text-sm text-gray-700">
                {role === 'viewer'
                  ? '作成されたイシュー一覧を確認できます。'
                  : 'タスクやストーリーを作成して優先順位を整理します。'}
              </p>
            </div>
            <div className="rounded-xl bg-white p-4">
              <p className="text-xs font-medium text-gray-500">2. Sprints</p>
              <p className="mt-1 text-sm text-gray-700">
                {role === 'viewer'
                  ? '進行中スプリントの状況を確認できます。'
                  : '対象のイシューをスプリントへ割り当てて開始します。'}
              </p>
            </div>
            <div className="rounded-xl bg-white p-4">
              <p className="text-xs font-medium text-gray-500">3. Board</p>
              <p className="mt-1 text-sm text-gray-700">
                進行中・レビュー待ち・完了の流れを見ながら、毎日の更新を進めます。
              </p>
            </div>
          </div>
        </section>
      )}

      {/* Stats row */}
      <div className="grid grid-cols-4 gap-4">
        {statuses.map(status => {
          const count = byStatus(status).length
          return (
            <div key={status} className="bg-white border border-gray-200 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <span className={`w-2 h-2 rounded-full ${STATUS_COLORS[status]}`} />
                <span className="text-xs text-gray-500">{STATUS_LABELS[status]}</span>
              </div>
              <p className="text-3xl font-bold text-gray-900">{count}</p>
            </div>
          )
        })}
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* Active sprint */}
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-4 flex items-center gap-2">
            <Clock size={14} /> アクティブスプリント
          </h2>
          {activeSprint ? (
            <>
              <p className="font-semibold text-gray-900 mb-1">{activeSprint.name}</p>
              {activeSprint.goal && <p className="text-sm text-gray-500 mb-3">{activeSprint.goal}</p>}
              <div className="flex items-center gap-3 mb-2">
                <div className="flex-1 bg-gray-100 rounded-full h-2">
                  <div
                    className="bg-emerald-500 h-2 rounded-full transition-all"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className="text-sm font-semibold text-gray-700 w-12 text-right">{pct}%</span>
              </div>
              <p className="text-xs text-gray-400">{donePts}/{totalPts}pt 完了 · {activeIssues.length}件</p>
              {activeSprint.end_date && nowMs && (() => {
                const d = deadlineLabel(activeSprint.end_date!, nowMs)
                return (
                  <p className="text-xs mt-1 flex items-center gap-2">
                    <span className="text-gray-400">期限: {activeSprint.end_date}</span>
                    <span className={d.className}>{d.text}</span>
                  </p>
                )
              })()}
            </>
          ) : (
            <p className="text-sm text-gray-400 italic">アクティブなスプリントはありません</p>
          )}
        </div>

        {/* High priority open issues */}
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-4 flex items-center gap-2">
            <AlertCircle size={14} className="text-red-500" /> 優先度 High/Critical（未完了）
          </h2>
          {highPriorityOpen.length === 0 ? (
            hasHighPriorityIssues ? (
              <div className="flex items-center gap-2 text-sm text-emerald-600">
                <CheckCircle2 size={14} />
                <span>すべて対応済みです</span>
              </div>
            ) : (
              <p className="text-sm text-gray-400 italic">High / Critical のイシューはありません</p>
            )
          ) : (
            <div className="space-y-2">
              {highPriorityOpen.map(issue => (
                <div
                  key={issue.id}
                  onClick={() => setDetailId(issue.id)}
                  className="flex items-center gap-2 cursor-pointer hover:text-blue-600 group"
                >
                  <TypeIcon type={issue.type} />
                  <span className="text-xs font-mono text-gray-400 shrink-0">#{issue.number}</span>
                  <span className="text-sm text-gray-800 truncate group-hover:text-blue-600">{issue.title}</span>
                  <PriorityBadge priority={issue.priority} />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Recently updated */}
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">最近更新されたイシュー</h2>
        {isLoading ? (
          <p role="status" aria-label="読み込み中" className="text-gray-400 text-sm">読み込み中...</p>
        ) : (
          <div className="divide-y divide-gray-100">
            {recentIssues.map(issue => (
              <div
                key={issue.id}
                onClick={() => setDetailId(issue.id)}
                className="flex items-center gap-3 py-2.5 cursor-pointer hover:bg-blue-50/40 rounded px-1 -mx-1 transition-colors"
              >
                <TypeIcon type={issue.type} />
                <span className="text-xs text-gray-400 font-mono w-14 shrink-0">#{issue.number}</span>
                <span className="flex-1 text-sm text-gray-900 truncate">{issue.title}</span>
                <span className={`shrink-0 text-xs px-2 py-0.5 rounded-full ${STATUS_COLORS[issue.status]} text-white`}>
                  {STATUS_LABELS[issue.status]}
                </span>
                <span className="text-xs text-gray-400 shrink-0">
                  {new Date(issue.updated_at).toLocaleDateString('ja-JP')}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
      </div>
    </div>

      {detailId && (() => {
        const issue = issues.find(i => i.id === detailId)
        return (
          <DetailPanel
            title={issue ? `#${issue.number} ${issue.title}` : 'Issue詳細'}
            onClose={() => setDetailId(null)}
          >
            <IssueDetail issueId={detailId} projectId={activeProjectId} />
          </DetailPanel>
        )
      })()}
    </div>
  )
}
