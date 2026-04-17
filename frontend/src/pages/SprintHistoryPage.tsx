import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { BarChart2, ChevronDown, ChevronRight, ArrowLeft, TrendingUp } from 'lucide-react'
import { getSprints } from '../api/sprints'
import { getIssues } from '../api/issues'
import { useAppStore } from '../store'
import { BurndownChart } from '../components/Board/BurndownChart'
import { VelocityChart } from '../components/Board/VelocityChart'
import { StatusBadge, PriorityBadge, TypeIcon } from '../components/common/Badge'
import { sprintStatusLabel } from '../utils/labels'
import type { Sprint, Issue } from '../types'

function CompletedSprintCard({ sprint, issues }: { sprint: Sprint; issues: Issue[] }) {
  const [showBurndown, setShowBurndown] = useState(false)
  const [showIssues, setShowIssues] = useState(false)

  const sprintIssues = issues.filter(i => i.sprint_id === sprint.id && !i.parent_id)
  const totalPts = sprintIssues.reduce((s, i) => s + (i.points ?? 0), 0)
  const donePts = sprintIssues.filter(i => i.status === 'done').reduce((s, i) => s + (i.points ?? 0), 0)
  const pct = totalPts > 0 ? Math.round((donePts / totalPts) * 100) : 0

  return (
    <div className="border border-gray-200 rounded-xl p-5">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h3 className="font-semibold text-gray-900">{sprint.name}</h3>
            <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">{sprintStatusLabel('completed')}</span>
          </div>
          {sprint.goal && <p className="text-sm text-gray-500 mb-2">{sprint.goal}</p>}
          {(sprint.start_date || sprint.end_date) && (
            <p className="text-xs text-gray-400">{sprint.start_date} → {sprint.end_date}</p>
          )}
        </div>
        <button
          onClick={() => setShowBurndown(v => !v)}
          className={`flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg transition-colors ${
            showBurndown ? 'bg-purple-100 text-purple-700' : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
          }`}
        >
          <BarChart2 size={14} /> バーンダウン
        </button>
      </div>

      <div className="mt-4 flex items-center gap-6 text-sm text-gray-500">
        <span>{sprintIssues.length} 件</span>
        <span>{donePts}/{totalPts} pts</span>
        {totalPts > 0 && (
          <div className="flex items-center gap-2 flex-1">
            <div className="flex-1 bg-gray-200 rounded-full h-1.5">
              <div className="bg-emerald-500 h-1.5 rounded-full" style={{ width: `${pct}%` }} />
            </div>
            <span className="text-xs font-medium">{pct}%</span>
          </div>
        )}
      </div>

      {showBurndown && (
        <div className="mt-4 pt-4 border-t border-gray-100">
          <BurndownChart sprint={sprint} />
        </div>
      )}

      <div className="mt-4 pt-3 border-t border-gray-100">
        <button
          onClick={() => setShowIssues(v => !v)}
          className="flex items-center gap-2 text-xs text-gray-500 hover:text-gray-700"
        >
          {showIssues ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          イシュー一覧を{showIssues ? '閉じる' : '表示'}（{sprintIssues.length}件）
        </button>
        {showIssues && (
          <div className="mt-2 divide-y divide-gray-100">
            {sprintIssues.map(issue => (
              <div key={issue.id} className="flex items-center gap-3 py-2">
                <TypeIcon type={issue.type} />
                <span className="text-xs text-gray-400 font-mono w-14 shrink-0">#{issue.number}</span>
                <span className="flex-1 text-sm text-gray-700 truncate">{issue.title}</span>
                <div className="flex items-center gap-2 shrink-0">
                  <StatusBadge status={issue.status} />
                  <PriorityBadge priority={issue.priority} />
                  {issue.points != null && (
                    <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded font-mono w-12 text-center">
                      {issue.points}pt
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export function SprintHistoryPage() {
  const { activeProjectId } = useAppStore()
  const navigate = useNavigate()

  const { data: sprints = [], isLoading } = useQuery({
    queryKey: ['sprints', activeProjectId],
    queryFn: () => getSprints(activeProjectId!),
    enabled: !!activeProjectId,
  })

  const { data: issues = [] } = useQuery({
    queryKey: ['issues', activeProjectId],
    queryFn: () => getIssues(activeProjectId!),
    enabled: !!activeProjectId,
  })

  if (!activeProjectId) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-400">
        ← プロジェクトを選択してください
      </div>
    )
  }

  const completed = [...sprints].filter(s => s.status === 'completed').reverse()

  return (
    <div className="flex-1 overflow-auto">
    <div className="p-6 max-w-6xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Sprint History</h1>
          <p className="text-sm text-gray-400 mt-1">{completed.length}件の完了済みスプリント</p>
        </div>
        <button
          onClick={() => navigate('/sprints')}
          className="flex items-center gap-2 px-4 py-2 text-gray-600 text-sm rounded-lg border border-gray-200 hover:bg-gray-50"
        >
          <ArrowLeft size={16} /> Sprint一覧
        </button>
      </div>

      {isLoading ? (
        <div role="status" aria-label="読み込み中" className="text-gray-400 text-center py-12">読み込み中...</div>
      ) : completed.length === 0 ? (
        <div className="text-center py-12 text-gray-400">完了済みのスプリントはありません</div>
      ) : (
        <>
          {completed.length >= 2 && (
            <div className="mb-6 border border-gray-200 rounded-xl p-5">
              <h2 className="text-sm font-semibold text-gray-700 flex items-center gap-2 mb-4">
                <TrendingUp size={16} /> ベロシティ推移
              </h2>
              <VelocityChart projectId={activeProjectId!} />
            </div>
          )}
          <div className="space-y-4">
            {completed.map(sprint => (
              <CompletedSprintCard key={sprint.id} sprint={sprint} issues={issues} />
            ))}
          </div>
        </>
      )}
    </div>
    </div>
  )
}
