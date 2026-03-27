import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Plus, CalendarDays, Target, BarChart2, SlidersHorizontal } from 'lucide-react'
import { getIssues } from '../api/issues'
import { getSprints } from '../api/sprints'
import { useAppStore } from '../store'
import { Board } from '../components/Board/Board'
import { BoardFilters, type Filters } from '../components/Board/BoardFilters'
import { BurndownChart } from '../components/Board/BurndownChart'
import { Modal } from '../components/common/Modal'
import { IssueForm } from '../components/Issue/IssueForm'
import { ProjectRoleBadge } from '../components/common/ProjectRoleBadge'
import { useProjectPermissions } from '../hooks/useProjectPermissions'
import type { Issue, Sprint, IssueType } from '../types'

const PRIORITY_ORDER: Record<string, number> = {
  critical: 0, high: 1, medium: 2, low: 3,
}

const statusLabel: Record<string, { text: string; className: string }> = {
  active: { text: 'Active', className: 'bg-blue-100 text-blue-700' },
  planning: { text: 'Planning', className: 'bg-gray-100 text-gray-600' },
  completed: { text: 'Completed', className: 'bg-emerald-100 text-emerald-700' },
}

const QUICK_CREATE_OPTIONS: { type: IssueType; label: string }[] = [
  { type: 'task', label: 'タスク' },
  { type: 'bug', label: 'バグ' },
]

export function BoardPage() {
  const { activeProjectId, activeSprint, setActiveSprint } = useAppStore()
  const { role, canEditProject } = useProjectPermissions(activeProjectId)
  const [creating, setCreating] = useState(false)
  const [createType, setCreateType] = useState<IssueType>('task')
  const [filters, setFilters] = useState<Filters>({})
  const [showFilters, setShowFilters] = useState(true)
  const [showBurndown, setShowBurndown] = useState(false)
  const [sortByPriority, setSortByPriority] = useState(false)

  const { data: sprints = [] } = useQuery({
    queryKey: ['sprints', activeProjectId],
    queryFn: () => getSprints(activeProjectId!),
    enabled: !!activeProjectId,
  })

  const currentSprint: Sprint | undefined =
    activeSprint ?? sprints.find(s => s.status === 'active') ?? sprints[0]

  const issuesQueryKey = ['issues', activeProjectId, currentSprint?.id] as const

  const { data: rawIssues = [], isLoading } = useQuery({
    queryKey: issuesQueryKey,
    queryFn: () => getIssues(activeProjectId!, { sprint_id: currentSprint?.id }),
    enabled: !!activeProjectId && !!currentSprint,
  })

  if (!activeProjectId) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-400">
        ← プロジェクトを選択してください
      </div>
    )
  }

  if (sprints.length === 0) {
    return (
      <div className="flex-1 overflow-auto">
        <div className="p-6 max-w-6xl">
          <h1 className="text-xl font-bold text-gray-900 mb-6">Board</h1>
          <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-6">
            <p className="text-base font-medium text-gray-800">スプリントがまだありません</p>
            <p className="mt-2 text-sm text-gray-500">
              最初の流れは「Sprints でスプリント作成 → Board で進捗確認」です。編集権限がない場合はプロジェクト管理者に作成を依頼してください。
            </p>
          </div>
        </div>
      </div>
    )
  }

  // フィルタリング
  let issues: Issue[] = rawIssues
  if (filters.assignee_id) issues = issues.filter(i => i.assignee_id === filters.assignee_id)
  if (filters.priority) issues = issues.filter(i => i.priority === filters.priority)
  if (filters.type) issues = issues.filter(i => i.type === filters.type)

  // 優先度ソート
  if (sortByPriority) {
    issues = [...issues].sort(
      (a, b) => (PRIORITY_ORDER[a.priority] ?? 9) - (PRIORITY_ORDER[b.priority] ?? 9)
    )
  }

  const totalPoints = rawIssues.reduce((s, i) => s + (i.points ?? 0), 0)
  const donePoints = rawIssues.filter(i => i.status === 'done').reduce((s, i) => s + (i.points ?? 0), 0)
  const inProgressCount = rawIssues.filter(i => i.status === 'in_progress').length
  const progress = totalPoints > 0 ? Math.round((donePoints / totalPoints) * 100) : 0
  const sprintStatus = statusLabel[currentSprint?.status ?? ''] ?? statusLabel.planning
  const hasFilters = Object.values(filters).some(Boolean)

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Sprint header */}
      <div className="border-b border-gray-200 bg-white px-6 py-4 shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-gray-900">
                {currentSprint?.name ?? 'No Sprint'}
              </h2>
              <ProjectRoleBadge role={role} />
              {currentSprint && (
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${sprintStatus.className}`}>
                  {sprintStatus.text}
                </span>
              )}
            </div>

            {sprints.length > 1 && (
              <select
                value={currentSprint?.id ?? ''}
                onChange={e => {
                  const s = sprints.find(sp => sp.id === e.target.value)
                  setActiveSprint(s ?? null)
                }}
                className="border border-gray-200 rounded px-2 py-1 text-xs text-gray-500"
              >
                {sprints.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            )}

            {currentSprint?.start_date && (
              <div className="flex items-center gap-1 text-xs text-gray-400">
                <CalendarDays size={12} />
                {currentSprint.start_date} → {currentSprint.end_date ?? '?'}
              </div>
            )}

            {currentSprint?.goal && (
              <div className="flex items-center gap-1 text-xs text-gray-500 max-w-xs truncate">
                <Target size={12} className="shrink-0" />
                {currentSprint.goal}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* フィルターボタン */}
            <button
              onClick={() => setShowFilters(v => !v)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                showFilters || hasFilters
                  ? 'bg-blue-50 text-blue-700 border-blue-300'
                  : 'border-gray-200 text-gray-600 hover:border-gray-300'
              }`}
            >
              <SlidersHorizontal size={14} />
              フィルター
              {hasFilters && (
                <span className="bg-blue-600 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center">
                  {Object.values(filters).filter(Boolean).length}
                </span>
              )}
            </button>

            {/* 優先度ソートボタン */}
            <button
              onClick={() => setSortByPriority(v => !v)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                sortByPriority
                  ? 'bg-orange-50 text-orange-700 border-orange-300'
                  : 'border-gray-200 text-gray-600 hover:border-gray-300'
              }`}
              title="優先度順にソート"
            >
              ↕ 優先度
            </button>

            {/* バーンダウンボタン */}
            <button
              onClick={() => setShowBurndown(v => !v)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                showBurndown
                  ? 'bg-purple-50 text-purple-700 border-purple-300'
                  : 'border-gray-200 text-gray-600 hover:border-gray-300'
              }`}
            >
              <BarChart2 size={14} />
              バーンダウン
            </button>

            {canEditProject && (
              <>
                <div className="flex items-center gap-1 rounded-lg border border-gray-200 bg-white p-1">
                  {QUICK_CREATE_OPTIONS.map(option => (
                    <button
                      key={option.type}
                      onClick={() => {
                        setCreateType(option.type)
                        setCreating(true)
                      }}
                      className="rounded-md px-2.5 py-1.5 text-xs text-gray-600 hover:bg-gray-50"
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
                <button
                  onClick={() => {
                    setCreateType('task')
                    setCreating(true)
                  }}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700"
                >
                  <Plus size={16} /> Issueを作成
                </button>
              </>
            )}
          </div>
        </div>

        {/* Progress bar */}
        <div className="flex items-center gap-4 mt-3">
          <div className="flex-1 bg-gray-100 rounded-full h-2 max-w-xs">
            <div
              className="bg-emerald-500 h-2 rounded-full transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="flex items-center gap-4 text-xs text-gray-500">
            <span className="font-medium text-gray-700">{progress}% 完了</span>
            <span>{donePoints}/{totalPoints} pts</span>
            <span>{rawIssues.length} 件</span>
            {inProgressCount > 0 && (
              <span className="text-blue-600">{inProgressCount} 件進行中</span>
            )}
          </div>
        </div>

        {/* フィルターパネル */}
        {showFilters && (
          <div className="mt-3 pt-3 border-t border-gray-100">
            <BoardFilters issues={rawIssues} filters={filters} onChange={setFilters} />
          </div>
        )}

        {/* バーンダウンチャート */}
        {showBurndown && currentSprint && (
          <div className="mt-3 pt-3 border-t border-gray-100">
            <p className="text-xs font-medium text-gray-500 mb-2">バーンダウンチャート</p>
            <BurndownChart sprint={currentSprint} />
          </div>
        )}
      </div>

      {/* Board */}
      <div className="flex-1 overflow-auto p-6">
        {isLoading ? (
          <div role="status" aria-label="読み込み中" className="text-gray-400 text-center py-12">読み込み中...</div>
        ) : (
          <Board issues={issues} projectId={activeProjectId} queryKey={issuesQueryKey} canEdit={canEditProject} />
        )}
      </div>

      {creating && canEditProject && (
        <Modal title={`${QUICK_CREATE_OPTIONS.find(option => option.type === createType)?.label ?? 'イシュー'}を作成`} onClose={() => setCreating(false)}>
          <IssueForm
            projectId={activeProjectId}
            sprintId={currentSprint?.id}
            defaultType={createType}
            onClose={() => setCreating(false)}
          />
        </Modal>
      )}
    </div>
  )
}
