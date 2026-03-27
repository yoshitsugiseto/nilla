import { useId, useState } from 'react'
import { useQueries, useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Play, CheckCircle, BarChart2, AlertCircle, History, Pencil, Trophy, TrendingUp } from 'lucide-react'
import { getSprints, createSprint, updateSprint, startSprint, completeSprint } from '../api/sprints'
import { getActivity, getIssues } from '../api/issues'
import { getWorkspaceAutomationSettings } from '../api/workspaces'
import { useAppStore } from '../store'
import { Modal } from '../components/common/Modal'
import { BurndownChart } from '../components/Board/BurndownChart'
import { ProjectRoleBadge } from '../components/common/ProjectRoleBadge'
import { useToast } from '../components/common/useToast'
import { useCurrentTime } from '../hooks/useCurrentTime'
import { useProjectPermissions } from '../hooks/useProjectPermissions'
import { extractErrorMessage } from '../api/client'
import { deadlineLabel } from '../utils/date'
import { buildActiveSprintSnapshot } from '../utils/reporting'
import type { Issue, Sprint, IssueType, SprintCarryoverMode } from '../types'

interface SprintReportData {
  sprint: Sprint
  totalIssues: number
  doneIssues: number
  totalPts: number
  donePts: number
  carryOverIssues: number
  carryOverPts: number
  byType: Record<string, { total: number; done: number }>
  previousSprint?: {
    name: string
    totalIssues: number
    doneIssues: number
    totalPts: number
    donePts: number
  }
}

interface SprintRiskSignal {
  sprint_id: string
  sprint_name: string
  overdue_count: number
  unassigned_count: number
  review_count: number
  remaining_points: number
  remaining_issues: number
  days_left: number | null
}

const TYPE_LABELS: Record<IssueType, string> = {
  epic: 'Epic', story: 'Story', task: 'Task', bug: 'Bug', spike: 'Spike',
}

const DAY_MS = 24 * 60 * 60 * 1000
const MAX_CYCLE_ACTIVITY_ISSUES = 20

function daysLeftUntil(endDate: string, nowMs: number): number {
  const endMs = new Date(`${endDate}T23:59:59`).getTime()
  return Math.ceil((endMs - nowMs) / DAY_MS)
}

function buildSprintRiskSignal(sprint: Sprint, issues: Issue[], nowMs: number | null): SprintRiskSignal | null {
  if (sprint.status !== 'active') return null

  const sprintIssues = issues.filter(issue => issue.sprint_id === sprint.id && !issue.parent_id)
  if (sprintIssues.length === 0) return null

  const overdueCount = sprintIssues.filter(issue =>
    issue.status !== 'done' &&
    !!issue.due_date &&
    nowMs != null &&
    new Date(`${issue.due_date}T23:59:59`).getTime() < nowMs
  ).length
  const unassignedCount = sprintIssues.filter(issue => issue.status !== 'done' && !issue.assignee_id).length
  const reviewCount = sprintIssues.filter(issue => issue.status === 'in_review').length
  const remainingIssues = sprintIssues.filter(issue => issue.status !== 'done')
  const remainingPoints = remainingIssues.reduce((sum, issue) => sum + (issue.points ?? 0), 0)
  const daysLeft = sprint.end_date && nowMs != null ? daysLeftUntil(sprint.end_date, nowMs) : null
  const isUrgent = daysLeft != null && daysLeft <= 2 && remainingIssues.length > 0

  if (!overdueCount && !unassignedCount && !reviewCount && !isUrgent) return null

  return {
    sprint_id: sprint.id,
    sprint_name: sprint.name,
    overdue_count: overdueCount,
    unassigned_count: unassignedCount,
    review_count: reviewCount,
    remaining_points: remainingPoints,
    remaining_issues: remainingIssues.length,
    days_left: daysLeft,
  }
}

function SprintReportModal({
  report,
  onClose,
  onHistory,
}: {
  report: SprintReportData
  onClose: () => void
  onHistory: () => void
}) {
  const pct = report.totalPts > 0 ? Math.round((report.donePts / report.totalPts) * 100) : 0
  const issuePct = report.totalIssues > 0 ? Math.round((report.doneIssues / report.totalIssues) * 100) : 0
  const carryOverPct = report.totalIssues > 0 ? Math.round((report.carryOverIssues / report.totalIssues) * 100) : 0
  const previousPct = report.previousSprint && report.previousSprint.totalPts > 0
    ? Math.round((report.previousSprint.donePts / report.previousSprint.totalPts) * 100)
    : null

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3 p-4 bg-emerald-50 border border-emerald-200 rounded-xl">
        <Trophy size={24} className="text-emerald-600 shrink-0" />
        <div>
          <p className="font-semibold text-emerald-800">スプリント完了！</p>
          <p className="text-sm text-emerald-600">
            {report.sprint.start_date} → {report.sprint.end_date ?? '—'}
          </p>
        </div>
      </div>

      {report.sprint.goal && (
        <div>
          <p className="text-xs text-gray-400 mb-1">ゴール</p>
          <p className="text-sm text-gray-700 bg-gray-50 rounded-lg p-3">{report.sprint.goal}</p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-xs text-gray-400 mb-1">イシュー完了率</p>
          <p className="text-2xl font-bold text-gray-900">{issuePct}%</p>
          <p className="text-sm text-gray-500 mt-1">{report.doneIssues} / {report.totalIssues} 件</p>
          <div className="mt-2 bg-gray-100 rounded-full h-1.5">
            <div className="bg-emerald-500 h-1.5 rounded-full" style={{ width: `${issuePct}%` }} />
          </div>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-xs text-gray-400 mb-1">ポイント完了率</p>
          <p className="text-2xl font-bold text-gray-900">{pct}%</p>
          <p className="text-sm text-gray-500 mt-1">{report.donePts} / {report.totalPts} pt</p>
          <div className="mt-2 bg-gray-100 rounded-full h-1.5">
            <div className="bg-blue-500 h-1.5 rounded-full" style={{ width: `${pct}%` }} />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <p className="text-xs text-amber-700 mb-1">Carry over</p>
          <p className="text-2xl font-bold text-amber-900">{carryOverPct}%</p>
          <p className="text-sm text-amber-800 mt-1">{report.carryOverIssues} 件 / {report.carryOverPts} pt</p>
        </div>
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
          <p className="text-xs text-slate-500 mb-1">前回スプリント比較</p>
          {report.previousSprint && previousPct != null ? (
            <>
              <p className="text-sm font-semibold text-slate-900">{report.previousSprint.name}</p>
              <p className="text-sm text-slate-600 mt-1">
                {previousPct}% → {pct}% ({pct - previousPct >= 0 ? '+' : ''}{pct - previousPct}%差)
              </p>
              <p className="text-xs text-slate-500 mt-1">
                {report.previousSprint.doneIssues}/{report.previousSprint.totalIssues} 件, {report.previousSprint.donePts}/{report.previousSprint.totalPts} pt
              </p>
            </>
          ) : (
            <p className="text-sm text-slate-500">比較できる完了済み sprint はまだありません</p>
          )}
        </div>
      </div>

      {Object.keys(report.byType).length > 0 && (
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">タイプ別</p>
          <div className="space-y-2">
            {Object.entries(report.byType).map(([type, counts]) => {
              const p = counts.total > 0 ? Math.round((counts.done / counts.total) * 100) : 0
              return (
                <div key={type} className="flex items-center gap-3">
                  <span className="text-xs text-gray-500 w-12 shrink-0">{TYPE_LABELS[type as IssueType] ?? type}</span>
                  <div className="flex-1 bg-gray-100 rounded-full h-1.5">
                    <div className="bg-indigo-400 h-1.5 rounded-full transition-all" style={{ width: `${p}%` }} />
                  </div>
                  <span className="text-xs text-gray-400 w-16 text-right shrink-0">{counts.done}/{counts.total} ({p}%)</span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      <div className="flex justify-between pt-2 border-t border-gray-100">
        <button
          onClick={() => { onClose(); onHistory() }}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-blue-600"
        >
          <TrendingUp size={14} /> 履歴を見る
        </button>
        <button
          onClick={onClose}
          className="px-4 py-2 bg-emerald-600 text-white text-sm rounded-lg hover:bg-emerald-700"
        >
          閉じる
        </button>
      </div>
    </div>
  )
}

function SprintForm({
  projectId,
  sprint,
  onClose,
}: {
  projectId: string
  sprint?: Sprint
  onClose: () => void
}) {
  const qc = useQueryClient()
  const showToast = useToast()
  const nameId = useId()
  const goalId = useId()
  const startDateId = useId()
  const endDateId = useId()
  const [form, setForm] = useState({
    name: sprint?.name ?? '',
    goal: sprint?.goal ?? '',
    start_date: sprint?.start_date ?? '',
    end_date: sprint?.end_date ?? '',
  })

  const mutation = useMutation({
    mutationFn: () => sprint
      ? updateSprint(sprint.id, {
          name: form.name,
          goal: form.goal || undefined,
          start_date: form.start_date,
          end_date: form.end_date,
        })
      : createSprint(projectId, {
          name: form.name,
          goal: form.goal || undefined,
          start_date: form.start_date,
          end_date: form.end_date,
        }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sprints', projectId] })
      onClose()
    },
    onError: (err) => showToast(extractErrorMessage(err, sprint ? 'スプリントの更新に失敗しました' : 'スプリントの作成に失敗しました'), 'error'),
  })

  return (
    <form onSubmit={e => { e.preventDefault(); mutation.mutate() }} className="space-y-4">
      <div>
        <label htmlFor={nameId} className="block text-sm font-medium text-gray-700 mb-1">スプリント名 *</label>
        <input id={nameId} required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="Sprint 1" />
      </div>
      <div>
        <label htmlFor={goalId} className="block text-sm font-medium text-gray-700 mb-1">ゴール</label>
        <textarea id={goalId} value={form.goal} onChange={e => setForm(f => ({ ...f, goal: e.target.value }))}
          rows={2} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor={startDateId} className="block text-sm font-medium text-gray-700 mb-1">開始日 *</label>
          <input id={startDateId} required type="date" value={form.start_date} onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
        </div>
        <div>
          <label htmlFor={endDateId} className="block text-sm font-medium text-gray-700 mb-1">終了日 *</label>
          <input id={endDateId} required type="date" value={form.end_date} onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
        </div>
      </div>
      <div className="flex justify-end gap-3 pt-2">
        <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600">キャンセル</button>
        <button type="submit" disabled={mutation.isPending}
          className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50">
          {mutation.isPending ? '保存中...' : sprint ? '保存' : 'Sprintを作成'}
        </button>
      </div>
    </form>
  )
}

function CompleteSprintDialog({
  sprint,
  incompleteIssues,
  otherSprints,
  carryoverMode,
  onConfirm,
  onClose,
}: {
  sprint: Sprint
  incompleteIssues: Issue[]
  otherSprints: Sprint[]
  carryoverMode: SprintCarryoverMode
  onConfirm: (nextSprintId: string | null) => void
  onClose: () => void
}) {
  const nextSprintIdField = useId()
  const [nextSprintId, setNextSprintId] = useState<string>('')
  const nextAvailableSprint = otherSprints.find(s => s.id !== sprint.id && s.status !== 'completed')

  return (
    <div className="space-y-4">
      {incompleteIssues.length > 0 ? (
        <>
          <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
            <AlertCircle size={16} className="text-amber-600 shrink-0 mt-0.5" />
            <p className="text-sm text-amber-800">
              <strong>{incompleteIssues.length}件</strong>の未完了イシューがあります。
              {carryoverMode === 'prompt' ? '移動先を選んでください。' : 'Automation ルールに従って移動します。'}
            </p>
          </div>
          {carryoverMode === 'prompt' ? (
            <div>
              <label htmlFor={nextSprintIdField} className="block text-sm font-medium text-gray-700 mb-1">未完了イシューの移動先</label>
              <select
                id={nextSprintIdField}
                value={nextSprintId}
                onChange={e => setNextSprintId(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              >
                <option value="">Backlog（未アサイン）</option>
                {otherSprints.filter(s => s.id !== sprint.id && s.status !== 'completed').map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
          ) : (
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm text-gray-600">
              {carryoverMode === 'backlog'
                ? '未完了イシューは Backlog に戻されます。'
                : nextAvailableSprint
                  ? `未完了イシューは「${nextAvailableSprint.name}」へ自動で移動します。`
                  : '移動可能な次 sprint がないため、未完了イシューは Backlog に戻されます。'}
            </div>
          )}
          <div className="text-xs text-gray-500 space-y-1 max-h-32 overflow-y-auto">
            {incompleteIssues.map(i => (
              <div key={i.id} className="flex items-center gap-2">
                <span className="font-mono text-gray-400">#{i.number}</span>
                <span className="truncate">{i.title}</span>
                <span className="ml-auto shrink-0 text-gray-400">{i.status}</span>
              </div>
            ))}
          </div>
        </>
      ) : (
        <p className="text-sm text-gray-600">全イシュー完了しています。スプリントを完了しますか？</p>
      )}
      <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
        <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600">キャンセル</button>
        <button
          onClick={() => onConfirm(nextSprintId || null)}
          className="px-4 py-2 bg-emerald-600 text-white text-sm rounded-lg hover:bg-emerald-700"
        >
          スプリントを完了
        </button>
      </div>
    </div>
  )
}

function SprintCard({
  sprint, sprintIssues, totalPts, donePts, projectId, onStart, onComplete,
  canEdit,
}: {
  sprint: Sprint
  sprintIssues: Issue[]
  totalPts: number
  donePts: number
  projectId: string
  onStart: () => void
  onComplete: () => void
  canEdit: boolean
}) {
  const [showBurndown, setShowBurndown] = useState(false)
  const [editing, setEditing] = useState(false)
  const nowMs = useCurrentTime()
  const pct = totalPts > 0 ? Math.round((donePts / totalPts) * 100) : 0

  return (
    <div className="border border-gray-200 rounded-xl p-5">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h3 className="font-semibold text-gray-900">{sprint.name}</h3>
            <span className={`text-xs px-2 py-0.5 rounded-full ${
              sprint.status === 'active' ? 'bg-blue-100 text-blue-700' :
              sprint.status === 'completed' ? 'bg-emerald-100 text-emerald-700' :
              'bg-gray-100 text-gray-600'
            }`}>{sprint.status}</span>
          </div>
          {sprint.goal && <p className="text-sm text-gray-500 mb-2">{sprint.goal}</p>}
          {(sprint.start_date || sprint.end_date) && (
            <p className="text-xs text-gray-400 flex items-center gap-2">
              <span>{sprint.start_date} → {sprint.end_date}</span>
              {sprint.end_date && sprint.status === 'active' && nowMs && (() => {
                const d = deadlineLabel(sprint.end_date!, nowMs)
                return <span className={d.className}>{d.text}</span>
              })()}
            </p>
          )}
        </div>

        <div className="flex items-center gap-2">
          {canEdit && (
            <button
              onClick={() => setEditing(true)}
              className="flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg bg-gray-50 text-gray-600 hover:bg-gray-100"
              title="Edit sprint"
            >
              <Pencil size={14} />
            </button>
          )}
          {(sprint.status === 'active' || sprint.status === 'completed') && (
            <button
              onClick={() => setShowBurndown(v => !v)}
              className={`flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg transition-colors ${
                showBurndown ? 'bg-purple-100 text-purple-700' : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
              }`}
            >
              <BarChart2 size={14} /> バーンダウン
            </button>
          )}
          {canEdit && sprint.status === 'planning' && (
            <button onClick={onStart}
              className="flex items-center gap-1 px-3 py-1.5 bg-blue-50 text-blue-700 text-sm rounded-lg hover:bg-blue-100">
              <Play size={14} /> 開始
            </button>
          )}
          {canEdit && sprint.status === 'active' && (
            <button onClick={onComplete}
              className="flex items-center gap-1 px-3 py-1.5 bg-emerald-50 text-emerald-700 text-sm rounded-lg hover:bg-emerald-100">
              <CheckCircle size={14} /> 完了
            </button>
          )}
        </div>
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

      {editing && canEdit && (
        <Modal title={`「${sprint.name}」を編集`} onClose={() => setEditing(false)}>
          <SprintForm projectId={projectId} sprint={sprint} onClose={() => setEditing(false)} />
        </Modal>
      )}
    </div>
  )
}

export function SprintPage({ onNavigate }: { onNavigate: (page: string) => void }) {
  const { activeProjectId, activeWorkspaceId } = useAppStore()
  const qc = useQueryClient()
  const showToast = useToast()
  const nowMs = useCurrentTime()
  const { role, canEditProject } = useProjectPermissions(activeProjectId)
  const [creating, setCreating] = useState(false)
  const [completing, setCompleting] = useState<string | null>(null)
  const [report, setReport] = useState<SprintReportData | null>(null)

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
  const { data: automationSettings } = useQuery({
    queryKey: ['workspace-automation', activeWorkspaceId],
    queryFn: () => getWorkspaceAutomationSettings(activeWorkspaceId!),
    enabled: !!activeWorkspaceId,
  })

  const startMutation = useMutation({
    mutationFn: startSprint,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sprints', activeProjectId] }),
    onError: (err) => showToast(extractErrorMessage(err, 'スプリントの開始に失敗しました'), 'error'),
  })
  const completeMutation = useMutation({
    mutationFn: ({ id, nextSprintId }: { id: string; nextSprintId: string | null }) =>
      completeSprint(id, nextSprintId),
    onSuccess: (_, { id }) => {
      const sprint = sprints.find(s => s.id === id)
      const sprintIssues = issues.filter(i => i.sprint_id === id && !i.parent_id)
      const totalPts = sprintIssues.reduce((s, i) => s + (i.points ?? 0), 0)
      const donePts = sprintIssues.filter(i => i.status === 'done').reduce((s, i) => s + (i.points ?? 0), 0)
      const carryOverIssues = sprintIssues.filter(i => i.status !== 'done')
      const previousSprint = sprints
        .filter(s => s.status === 'completed' && s.id !== id)
        .sort((a, b) => b.updated_at.localeCompare(a.updated_at))[0]
      const byType: Record<string, { total: number; done: number }> = {}
      for (const issue of sprintIssues) {
        if (!byType[issue.type]) byType[issue.type] = { total: 0, done: 0 }
        byType[issue.type].total++
        if (issue.status === 'done') byType[issue.type].done++
      }
      qc.invalidateQueries({ queryKey: ['sprints', activeProjectId] })
      qc.invalidateQueries({ queryKey: ['issues', activeProjectId] })
      setCompleting(null)
      if (sprint) {
        setReport({
          sprint,
          totalIssues: sprintIssues.length,
          doneIssues: sprintIssues.filter(i => i.status === 'done').length,
          totalPts,
          donePts,
          carryOverIssues: carryOverIssues.length,
          carryOverPts: carryOverIssues.reduce((sum, issue) => sum + (issue.points ?? 0), 0),
          byType,
          previousSprint: previousSprint
            ? (() => {
                const previousIssues = issues.filter(i => i.sprint_id === previousSprint.id && !i.parent_id)
                return {
                  name: previousSprint.name,
                  totalIssues: previousIssues.length,
                  doneIssues: previousIssues.filter(i => i.status === 'done').length,
                  totalPts: previousIssues.reduce((sum, issue) => sum + (issue.points ?? 0), 0),
                  donePts: previousIssues
                    .filter(i => i.status === 'done')
                    .reduce((sum, issue) => sum + (issue.points ?? 0), 0),
                }
              })()
            : undefined,
        })
      } else {
        showToast('スプリントを完了しました', 'success')
      }
    },
    onError: (err) => showToast(extractErrorMessage(err, 'スプリントの完了に失敗しました'), 'error'),
  })

  const sprintRiskSignals = sprints
    .map(sprint => buildSprintRiskSignal(sprint, issues, nowMs))
    .filter((signal): signal is SprintRiskSignal => signal !== null)
  const activeSprint = sprints.find(sprint => sprint.status === 'active')
  const activeSprintDoneIssues = activeSprint
    ? issues
        .filter(issue => issue.sprint_id === activeSprint.id && !issue.parent_id && issue.status === 'done')
        .sort((left, right) => right.updated_at.localeCompare(left.updated_at))
        .slice(0, MAX_CYCLE_ACTIVITY_ISSUES)
    : []
  const activeSprintCycleQueries = useQueries({
    queries: activeSprintDoneIssues.map(issue => ({
      queryKey: ['activity', issue.id],
      queryFn: () => getActivity(issue.id),
      enabled: !!activeProjectId,
    })),
  })
  const activeSprintActivityByIssueId = Object.fromEntries(
    activeSprintDoneIssues.map((issue, index) => [issue.id, activeSprintCycleQueries[index]?.data ?? []]),
  )
  const activeSprintSnapshot = buildActiveSprintSnapshot(
    activeSprint,
    issues,
    nowMs,
    activeSprintActivityByIssueId,
  )

  if (!activeProjectId) {
    return <div className="flex-1 flex items-center justify-center text-gray-400">← プロジェクトを選択してください</div>
  }

  return (
    <div className="flex-1 overflow-auto">
    <div className="p-6 max-w-6xl">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-bold text-gray-900">Sprints</h1>
          <ProjectRoleBadge role={role} />
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => onNavigate('sprint-history')}
            className="flex items-center gap-2 px-4 py-2 text-gray-600 text-sm rounded-lg border border-gray-200 hover:bg-gray-50">
            <History size={16} /> 履歴
          </button>
          {canEditProject && (
            <button onClick={() => setCreating(true)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700">
              <Plus size={16} /> Sprintを作成
            </button>
          )}
        </div>
      </div>

      {isLoading ? (
        <div role="status" aria-label="読み込み中" className="text-gray-400 text-center py-12">読み込み中...</div>
      ) : (
        <div className="space-y-4">
          {activeSprint && activeSprintSnapshot && (
            <section
              aria-label="アクティブスプリントサマリー"
              className="rounded-2xl border border-blue-200 bg-blue-50/50 p-4"
            >
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold text-blue-900">アクティブスプリントの見通し</h2>
                  <p className="text-xs text-blue-800">{activeSprint.name} の進み具合とペースをまとめています。</p>
                </div>
                {activeSprint.end_date && nowMs && (() => {
                  const deadline = deadlineLabel(activeSprint.end_date, nowMs)
                  return <span className={`text-xs font-medium ${deadline.className}`}>{deadline.text}</span>
                })()}
              </div>
              <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <div className="rounded-xl border border-blue-100 bg-white p-4">
                    <p className="text-xs text-gray-500">完了状況</p>
                    <p className="mt-1 text-2xl font-bold text-gray-900">
                      {activeSprintSnapshot.doneIssues}/{activeSprintSnapshot.totalIssues}
                    </p>
                    <p className="mt-1 text-sm text-gray-500">
                      {activeSprintSnapshot.donePoints}/{activeSprintSnapshot.totalPoints}pt
                    </p>
                  </div>
                  <div className="rounded-xl border border-blue-100 bg-white p-4">
                    <p className="text-xs text-gray-500">残り作業</p>
                    <p className="mt-1 text-2xl font-bold text-gray-900">{activeSprintSnapshot.remainingIssues}件</p>
                    <p className="mt-1 text-sm text-gray-500">{activeSprintSnapshot.remainingPoints}pt 残り</p>
                  </div>
                  <div className="rounded-xl border border-blue-100 bg-white p-4">
                    <p className="text-xs text-gray-500">平均 cycle time</p>
                    <p className="mt-1 text-2xl font-bold text-gray-900">
                      {activeSprintSnapshot.avgCycleDays != null ? `${activeSprintSnapshot.avgCycleDays}日` : '—'}
                    </p>
                    <p className="mt-1 text-sm text-gray-500">作業開始から完了まで。activity がないものは近似</p>
                  </div>
                  <div className="rounded-xl border border-blue-100 bg-white p-4">
                    <p className="text-xs text-gray-500">リスク</p>
                    <p className="mt-1 text-2xl font-bold text-gray-900">
                      {activeSprintSnapshot.overdueCount + activeSprintSnapshot.unassignedCount + activeSprintSnapshot.reviewCount}件
                    </p>
                    <p className="mt-1 text-sm text-gray-500">
                      期限超過 {activeSprintSnapshot.overdueCount} / 未アサイン {activeSprintSnapshot.unassignedCount} / レビュー待ち {activeSprintSnapshot.reviewCount}
                    </p>
                  </div>
                </div>
                <div className="rounded-xl border border-blue-100 bg-white p-4">
                  <div className="mb-2">
                    <h3 className="text-sm font-semibold text-gray-700">バーンダウントレンド</h3>
                    <p className="text-xs text-gray-400">理想線とのズレをすぐ見られます</p>
                  </div>
                  <BurndownChart sprint={activeSprint} />
                </div>
              </div>
            </section>
          )}

          {sprintRiskSignals.length > 0 && (
            <section
              aria-label="スプリント危険信号"
              className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4"
            >
              <div className="mb-3 flex items-center gap-2">
                <AlertCircle size={16} className="text-amber-600" />
                <div>
                  <h2 className="text-sm font-semibold text-amber-900">危険信号</h2>
                  <p className="text-xs text-amber-800">期限超過、未アサイン、レビュー滞留を先に確認できます。</p>
                </div>
              </div>
              <div className="grid gap-3 lg:grid-cols-2">
                {sprintRiskSignals.map(signal => (
                  <div key={signal.sprint_id} className="rounded-xl border border-amber-200 bg-white p-4">
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <p className="font-medium text-gray-900">{signal.sprint_name}</p>
                      {signal.days_left != null && (
                        <span className={`text-xs font-medium ${
                          signal.days_left < 0 ? 'text-red-600' : signal.days_left <= 2 ? 'text-amber-700' : 'text-gray-500'
                        }`}>
                          {signal.days_left < 0
                            ? `${Math.abs(signal.days_left)}日超過`
                            : signal.days_left === 0
                              ? '今日が最終日'
                              : `残り${signal.days_left}日`}
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {signal.overdue_count > 0 && (
                        <span className="rounded-full bg-red-50 px-2.5 py-1 text-xs font-medium text-red-700">
                          期限超過 {signal.overdue_count}件
                        </span>
                      )}
                      {signal.unassigned_count > 0 && (
                        <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700">
                          未アサイン {signal.unassigned_count}件
                        </span>
                      )}
                      {signal.review_count > 0 && (
                        <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700">
                          レビュー待ち {signal.review_count}件
                        </span>
                      )}
                    </div>
                    <p className="mt-3 text-xs text-gray-500">
                      未完了 {signal.remaining_issues}件 / 残り {signal.remaining_points}pt
                    </p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {sprints.filter(s => s.status !== 'completed').map(sprint => {
            const sprintIssues = issues.filter(i => i.sprint_id === sprint.id)
            const totalPts = sprintIssues.reduce((s, i) => s + (i.points ?? 0), 0)
            const donePts = sprintIssues.filter(i => i.status === 'done').reduce((s, i) => s + (i.points ?? 0), 0)

            return (
              <SprintCard
                key={sprint.id}
                sprint={sprint}
                sprintIssues={sprintIssues}
                totalPts={totalPts}
                donePts={donePts}
                projectId={activeProjectId}
                onStart={() => startMutation.mutate(sprint.id)}
                onComplete={() => setCompleting(sprint.id)}
                canEdit={canEditProject}
              />
            )
          })}

	          {sprints.filter(s => s.status !== 'completed').length === 0 && (
	            <div className="text-center py-12 text-gray-400">
	              {canEditProject
                  ? 'スプリントがありません。作成してください。'
                  : 'スプリントはまだありません。作成が必要な場合はプロジェクト管理者に依頼してください。'}
	            </div>
	          )}
        </div>
      )}

      {creating && canEditProject && (
        <Modal title="Sprintを作成" onClose={() => setCreating(false)}>
          <SprintForm projectId={activeProjectId} onClose={() => setCreating(false)} />
        </Modal>
      )}

      {canEditProject && completing && (() => {
        const sprint = sprints.find(s => s.id === completing)!
        const incompleteIssues = issues.filter(i => i.sprint_id === completing && i.status !== 'done' && !i.parent_id)
        return (
          <Modal title={`「${sprint.name}」を完了`} onClose={() => setCompleting(null)}>
            <CompleteSprintDialog
              sprint={sprint}
              incompleteIssues={incompleteIssues}
              otherSprints={sprints}
              carryoverMode={automationSettings?.sprint_carryover_mode ?? 'prompt'}
              onConfirm={nextSprintId => completeMutation.mutate({ id: completing, nextSprintId })}
              onClose={() => setCompleting(null)}
            />
          </Modal>
        )
      })()}

      {report && (
        <Modal title={`「${report.sprint.name}」完了レポート`} onClose={() => setReport(null)}>
          <SprintReportModal
            report={report}
            onClose={() => setReport(null)}
            onHistory={() => onNavigate('sprint-history')}
          />
        </Modal>
      )}
    </div>
    </div>
  )
}
