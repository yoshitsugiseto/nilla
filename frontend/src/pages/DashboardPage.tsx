import { useQueries, useQuery } from '@tanstack/react-query'
import { getActivity, getIssues } from '../api/issues'
import { getSprints } from '../api/sprints'
import { useAppStore } from '../store'
import { TypeIcon, PriorityBadge } from '../components/common/Badge'
import { VelocityChart } from '../components/Board/VelocityChart'
import { DetailPanel } from '../components/common/DetailPanel'
import { IssueDetail } from '../components/Issue/IssueDetail'
import { useState } from 'react'
import { ProjectRoleBadge } from '../components/common/ProjectRoleBadge'
import { CheckCircle2, AlertCircle, Clock, BarChart3 } from 'lucide-react'
import { useCurrentTime } from '../hooks/useCurrentTime'
import { useProjectPermissions } from '../hooks/useProjectPermissions'
import { deadlineLabel } from '../utils/date'
import {
  buildAverageCycleSnapshot,
  buildOpenRiskSnapshot,
  buildThroughputSnapshot,
} from '../utils/reporting'

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

const MAX_CYCLE_ACTIVITY_ISSUES = 20

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
  const throughput14d = buildThroughputSnapshot(issues, nowMs, 14)
  const recentDoneIssues = nowMs == null
    ? []
    : issues
        .filter(issue => {
          if (issue.status !== 'done') return false
          const updatedMs = new Date(issue.updated_at).getTime()
          return Number.isFinite(updatedMs) && updatedMs >= nowMs - 30 * 24 * 60 * 60 * 1000
        })
        .sort((left, right) => right.updated_at.localeCompare(left.updated_at))
        .slice(0, MAX_CYCLE_ACTIVITY_ISSUES)
  const cycleActivityQueries = useQueries({
    queries: recentDoneIssues.map(issue => ({
      queryKey: ['activity', issue.id],
      queryFn: () => getActivity(issue.id),
      enabled: !!activeProjectId,
    })),
  })
  const cycleActivityByIssueId = Object.fromEntries(
    recentDoneIssues.map((issue, index) => [issue.id, cycleActivityQueries[index]?.data ?? []]),
  )
  const avgCycle30d = buildAverageCycleSnapshot(issues, nowMs, 30, cycleActivityByIssueId)
  const openRiskSnapshot = buildOpenRiskSnapshot(issues, nowMs)

  const recentIssues = [...issues]
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
    .slice(0, 5)
  const needsOnboarding = issues.length === 0 || sprints.length === 0

  if (!activeProjectId) {
    return <div className="flex-1 flex items-center justify-center text-gray-400">← プロジェクトを選択してください</div>
  }

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

      <section aria-label="デリバリースナップショット" className="space-y-4">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-gray-700">デリバリースナップショット</h2>
          <span className="text-xs text-gray-400">直近の完了速度と滞留を確認できます</span>
        </div>
        <div className="grid gap-4 md:grid-cols-4">
          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <p className="text-xs text-gray-500">14日 throughput</p>
            <p className="mt-1 text-2xl font-bold text-gray-900">{throughput14d.issueCount}件</p>
            <p className="mt-1 text-sm text-gray-500">{throughput14d.pointCount}pt 完了</p>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <p className="text-xs text-gray-500">平均 cycle time</p>
            <p className="mt-1 text-2xl font-bold text-gray-900">
              {avgCycle30d != null ? `${avgCycle30d}日` : '—'}
            </p>
            <p className="mt-1 text-sm text-gray-500">作業開始から完了まで。activity がないものは近似</p>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <p className="text-xs text-gray-500">期限超過</p>
            <p className={`mt-1 text-2xl font-bold ${openRiskSnapshot.overdueCount > 0 ? 'text-red-600' : 'text-gray-900'}`}>
              {openRiskSnapshot.overdueCount}件
            </p>
            <p className="mt-1 text-sm text-gray-500">未完了 issue のみ</p>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <p className="text-xs text-gray-500">レビュー待ち</p>
            <p className={`mt-1 text-2xl font-bold ${openRiskSnapshot.reviewCount > 0 ? 'text-blue-700' : 'text-gray-900'}`}>
              {openRiskSnapshot.reviewCount}件
            </p>
            <p className="mt-1 text-sm text-gray-500">未アサイン {openRiskSnapshot.unassignedCount}件</p>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-gray-700">最近のスプリント傾向</h2>
            <p className="text-xs text-gray-400">完了済み sprint ごとの throughput を見られます</p>
          </div>
        </div>
        <VelocityChart projectId={activeProjectId} />
      </section>

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
