import { useEffect, useId, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { bulkUpdateIssues, getIssuesPaged } from '../api/issues'
import { getLabels } from '../api/labels'
import { getSprints } from '../api/sprints'
import { getProjectMembers } from '../api/workspaces'
import { useAppStore } from '../store'
import { useAuthStore } from '../store/auth'
import { TypeIcon, PriorityBadge, StatusBadge } from '../components/common/Badge'
import { Modal } from '../components/common/Modal'
import { IssueBulkActionBar, formatBulkUpdateToast } from '../components/Issue/IssueBulkActionBar'
import { IssueDetail } from '../components/Issue/IssueDetail'
import { useToast } from '../components/common/useToast'
import { useCurrentTime } from '../hooks/useCurrentTime'
import { useProjectPermissions } from '../hooks/useProjectPermissions'
import { dueDateLabel } from '../utils/date'
import { ProjectRoleBadge } from '../components/common/ProjectRoleBadge'
import { Search, ChevronLeft, ChevronRight, SlidersHorizontal, X, CheckSquare, Square } from 'lucide-react'
import type { BulkUpdatePayload, IssueSearchFilters } from '../types'

const PAGE_SIZE = 20
const EMPTY_FILTERS: IssueSearchFilters = { status: '', type: '', priority: '', assignee_id: '' }
const QUICK_FILTERS = [
  { key: 'mine', label: '自分の担当' },
  { key: 'unassigned', label: '未割り当て' },
  { key: 'in_progress', label: '進行中' },
  { key: 'in_review', label: 'レビュー中' },
  { key: 'critical', label: '緊急' },
] as const

interface Props {
  query: string
  filters: IssueSearchFilters
  onApplyPreset?: (query: string, filters: IssueSearchFilters) => void
  onFiltersChange: (filters: IssueSearchFilters) => void
}

export function SearchPage({ query, filters, onApplyPreset, onFiltersChange }: Props) {
  const qc = useQueryClient()
  const showToast = useToast()
  const { user } = useAuthStore()
  const {
    activeProjectId,
    searchPresets,
    saveSearchPreset,
    renameSearchPreset,
    deleteSearchPreset,
  } = useAppStore()
  const statusId = useId()
  const typeId = useId()
  const priorityId = useId()
  const assigneeId = useId()
  const nowMs = useCurrentTime()
  const { role, canEditProject } = useProjectPermissions(activeProjectId)
  const [detailId, setDetailId] = useState<string | null>(null)
  const [pageState, setPageState] = useState({ scope: '', page: 0 })
  const [showFilters, setShowFilters] = useState(false)
  const [bulkMode, setBulkMode] = useState(false)
  const [bulkSelected, setBulkSelected] = useState<Set<string>>(new Set())
  const searchScope = JSON.stringify({ query, filters })
  const hasFilters = Object.values(filters).some(Boolean)
  const effectivePage =
    (query.length >= 2 || hasFilters) && pageState.scope === searchScope ? pageState.page : 0
  const projectPresets = searchPresets.filter((preset) => preset.project_id === activeProjectId)
  const canSavePreset = query.trim().length >= 2 || hasFilters

  const { data: members = [] } = useQuery({
    queryKey: ['project-members', activeProjectId],
    queryFn: () => getProjectMembers(activeProjectId!),
    enabled: !!activeProjectId && (showFilters || bulkMode),
  })

  const { data: sprints = [] } = useQuery({
    queryKey: ['sprints', activeProjectId],
    queryFn: () => getSprints(activeProjectId!),
    enabled: !!activeProjectId && bulkMode,
  })

  const { data: projectLabels = [] } = useQuery({
    queryKey: ['labels', activeProjectId],
    queryFn: () => getLabels(activeProjectId!),
    enabled: !!activeProjectId && bulkMode,
  })

  const { data, isLoading, isError } = useQuery({
    queryKey: ['issues', activeProjectId, 'search', query, effectivePage, filters],
    queryFn: () =>
      getIssuesPaged(activeProjectId!, {
        q: query.trim().length >= 2 ? query : undefined,
        limit: PAGE_SIZE,
        offset: effectivePage * PAGE_SIZE,
        status: filters.status || undefined,
        type: filters.type || undefined,
        priority: filters.priority || undefined,
        assignee_id: filters.assignee_id || undefined,
      }),
    enabled: !!activeProjectId && (query.length >= 2 || hasFilters),
    placeholderData: prev => prev,
  })

  const issues = data?.items ?? []
  const total = data?.total ?? 0
  const totalPages = Math.ceil(total / PAGE_SIZE)
  const start = effectivePage * PAGE_SIZE + 1
  const end = Math.min(effectivePage * PAGE_SIZE + issues.length, total)

  useEffect(() => {
    setBulkSelected(new Set())
  }, [activeProjectId, effectivePage, searchScope])

  const bulkMutation = useMutation({
    mutationFn: (payload: Omit<BulkUpdatePayload, 'issue_ids'>) =>
      bulkUpdateIssues(activeProjectId!, { issue_ids: [...bulkSelected], ...payload }),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ['issues', activeProjectId] })
      setBulkSelected(new Set())
      setBulkMode(false)
      const toast = formatBulkUpdateToast(result)
      showToast(toast.message, toast.type)
    },
    onError: () => showToast('一括更新に失敗しました', 'error'),
  })

  const setFilter = (key: keyof IssueSearchFilters, value: string) =>
    onFiltersChange({ ...filters, [key]: value })

  const clearFilters = () => onFiltersChange(EMPTY_FILTERS)
  const toggleBulkSelect = (issueId: string) => {
    setBulkSelected(previous => {
      const next = new Set(previous)
      if (next.has(issueId)) next.delete(issueId)
      else next.add(issueId)
      return next
    })
  }
  const selectVisibleIssues = () => {
    setBulkSelected(new Set(issues.map(issue => issue.id)))
  }
  const applyQuickFilter = (key: (typeof QUICK_FILTERS)[number]['key']) => {
    const nextFilters = { ...filters }
    switch (key) {
      case 'mine':
        if (!user) return
        nextFilters.assignee_id = user.id
        break
      case 'unassigned':
        nextFilters.assignee_id = '__unassigned__'
        break
      case 'in_progress':
        nextFilters.status = 'in_progress'
        break
      case 'in_review':
        nextFilters.status = 'in_review'
        break
      case 'critical':
        nextFilters.priority = 'critical'
        break
    }
    onFiltersChange(nextFilters)
    setShowFilters(true)
  }
  const isQuickFilterActive = (key: (typeof QUICK_FILTERS)[number]['key']) => {
    switch (key) {
      case 'mine':
        return !!user && filters.assignee_id === user.id
      case 'unassigned':
        return filters.assignee_id === '__unassigned__'
      case 'in_progress':
        return filters.status === 'in_progress'
      case 'in_review':
        return filters.status === 'in_review'
      case 'critical':
        return filters.priority === 'critical'
    }
  }
  const saveCurrentPreset = () => {
    if (!activeProjectId || !canSavePreset) return
    const defaultName = query.trim().length >= 2 ? query.trim() : 'フィルタ'
    const name = window.prompt('プリセット名', defaultName)
    if (!name?.trim()) return
    saveSearchPreset(activeProjectId, name.trim(), query, filters)
  }

  const applyPreset = (presetId: string) => {
    const preset = projectPresets.find((item) => item.id === presetId)
    if (!preset) return
    onApplyPreset?.(preset.query, preset.filters)
    setPageState({ scope: JSON.stringify({ query: preset.query, filters: preset.filters }), page: 0 })
    setShowFilters(Object.values(preset.filters).some(Boolean))
  }

  if (!activeProjectId) {
    return <div className="flex-1 flex items-center justify-center text-gray-400">← プロジェクトを選択してください</div>
  }

  return (
    <div className="flex-1 overflow-auto">
      <div className="p-6 max-w-4xl">
        {/* Header */}
        <div className="flex items-center justify-between gap-2 mb-4">
          <div className="flex items-center gap-2">
            <Search size={18} className="text-gray-400" aria-hidden="true" />
            <h1 className="text-xl font-bold text-gray-900">
              {query.length >= 2 ? `"${query}" の検索結果` : hasFilters ? 'フィルター結果' : '検索'}
            </h1>
            <ProjectRoleBadge role={role} />
            {(query.length >= 2 || hasFilters) && !isLoading && total > 0 && (
              <span className="text-sm text-gray-400 ml-1">{total}件</span>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {canEditProject && (query.length >= 2 || hasFilters) && total > 0 && (
              <button
                onClick={() => {
                  setBulkMode(value => !value)
                  setBulkSelected(new Set())
                }}
                className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm transition-colors ${
                  bulkMode ? 'border-blue-300 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}
              >
                <CheckSquare size={14} /> 一括操作
              </button>
            )}
            <button
              onClick={saveCurrentPreset}
              disabled={!canSavePreset}
              className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              条件を保存
            </button>
            <button
              onClick={() => setShowFilters(v => !v)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                showFilters || hasFilters
                  ? 'bg-blue-50 text-blue-700 border-blue-300'
                  : 'border-gray-200 text-gray-600 hover:bg-gray-50'
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
          </div>
        </div>

        <div className="mb-4 flex flex-wrap items-center gap-2">
          <span className="text-xs text-gray-400">よく使う条件</span>
          {QUICK_FILTERS.filter(filter => filter.key !== 'mine' || !!user).map(filter => (
            <button
              key={filter.key}
              onClick={() => applyQuickFilter(filter.key)}
              className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                isQuickFilterActive(filter.key)
                  ? 'border-blue-300 bg-blue-50 text-blue-700'
                  : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
              }`}
            >
              {filter.label}
            </button>
          ))}
          {hasFilters && (
            <button
              onClick={clearFilters}
              className="text-xs text-gray-400 hover:text-gray-600"
            >
              条件をクリア
            </button>
          )}
        </div>

        {projectPresets.length > 0 && (
          <div className="mb-4 flex flex-wrap items-center gap-2">
            {projectPresets.map(preset => (
              <div key={preset.id} className="inline-flex items-center gap-1 rounded-full border border-gray-200 bg-white px-2 py-1">
                <button
                  onClick={() => applyPreset(preset.id)}
                  className="text-xs text-gray-700 hover:text-blue-600"
                >
                  {preset.name}
                </button>
                <button
                  onClick={() => {
                    const name = window.prompt('プリセット名を変更', preset.name)
                    if (!name?.trim()) return
                    renameSearchPreset(preset.id, name.trim())
                  }}
                  className="text-[10px] text-gray-400 hover:text-gray-600"
                  aria-label={`${preset.name} をリネーム`}
                >
                  編集
                </button>
                <button
                  onClick={() => deleteSearchPreset(preset.id)}
                  className="text-[10px] text-gray-400 hover:text-red-500"
                  aria-label={`${preset.name} を削除`}
                >
                  削除
                </button>
              </div>
            ))}
          </div>
        )}

        {canEditProject && bulkMode && bulkSelected.size > 0 && (
          <IssueBulkActionBar
            selectedCount={bulkSelected.size}
            members={members}
            sprints={sprints}
            projectLabels={projectLabels}
            isPending={bulkMutation.isPending}
            onApply={(payload) => bulkMutation.mutate(payload)}
            onClearSelection={() => setBulkSelected(new Set())}
          />
        )}

        {canEditProject && bulkMode && bulkSelected.size === 0 && issues.length > 0 && (
          <div className="mb-4 flex items-center gap-3 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm">
            <span className="text-gray-500">表示中の検索結果をまとめて操作できます</span>
            <button onClick={selectVisibleIssues} className="text-blue-600 hover:text-blue-700">
              表示中を全選択
            </button>
          </div>
        )}

        {/* Filter panel */}
        {showFilters && (
          <div className="mb-4 p-4 bg-gray-50 border border-gray-200 rounded-xl">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div>
                <label htmlFor={statusId} className="block text-xs text-gray-500 mb-1">ステータス</label>
                <select
                  id={statusId}
                  value={filters.status}
                  onChange={e => setFilter('status', e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
                >
                  <option value="">すべて</option>
                  <option value="todo">未着手</option>
                  <option value="in_progress">進行中</option>
                  <option value="in_review">レビュー中</option>
                  <option value="done">完了</option>
                </select>
              </div>
              <div>
                <label htmlFor={typeId} className="block text-xs text-gray-500 mb-1">タイプ</label>
                <select
                  id={typeId}
                  value={filters.type}
                  onChange={e => setFilter('type', e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
                >
                  <option value="">すべて</option>
                  <option value="story">ストーリー</option>
                  <option value="task">タスク</option>
                  <option value="bug">バグ</option>
                  <option value="spike">スパイク</option>
                </select>
              </div>
              <div>
                <label htmlFor={priorityId} className="block text-xs text-gray-500 mb-1">優先度</label>
                <select
                  id={priorityId}
                  value={filters.priority}
                  onChange={e => setFilter('priority', e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
                >
                  <option value="">すべて</option>
                  <option value="critical">緊急</option>
                  <option value="high">高</option>
                  <option value="medium">中</option>
                  <option value="low">低</option>
                </select>
              </div>
              <div>
                <label htmlFor={assigneeId} className="block text-xs text-gray-500 mb-1">担当者</label>
                <select
                  id={assigneeId}
                  value={filters.assignee_id}
                  onChange={e => setFilter('assignee_id', e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
                >
                  <option value="">すべて</option>
                  <option value="__unassigned__">未割り当て</option>
                  {members.map(m => (
                    <option key={m.user_id} value={m.user_id}>{m.name}</option>
                  ))}
                </select>
              </div>
            </div>
            {hasFilters && (
              <button
                onClick={clearFilters}
                className="mt-3 flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600"
              >
                <X size={12} /> フィルターをクリア
              </button>
            )}
          </div>
        )}

        {/* Pagination info */}
        {(query.length >= 2 || hasFilters) && !isLoading && total > 0 && (
          <p className="text-xs text-gray-400 mb-4">
            {start}〜{end}件目を表示
          </p>
        )}

        {query.length < 2 && !hasFilters && (
          <p className="text-gray-400 text-sm">2文字以上入力してください</p>
        )}

        {isLoading && (
          <p role="status" aria-label="検索中" className="text-gray-400">検索中...</p>
        )}

        {isError && (
          <p className="text-red-400 text-sm">検索に失敗しました</p>
        )}

        {!isLoading && !isError && (query.length >= 2 || hasFilters) && issues.length === 0 && (
          <p className="text-gray-400 text-sm">
            {hasFilters ? '条件に一致するイシューが見つかりません' : '該当するイシューが見つかりません'}
          </p>
        )}

        {/* Results */}
        <div className="space-y-1">
          {issues.map(issue => (
            <div
              key={issue.id}
              onClick={() => {
                if (bulkMode) {
                  toggleBulkSelect(issue.id)
                  return
                }
                setDetailId(issue.id)
              }}
              className={`flex items-center gap-3 rounded-lg border py-2.5 px-4 transition-colors ${
                bulkSelected.has(issue.id)
                  ? 'border-blue-200 bg-blue-50'
                  : 'border-gray-100 bg-white hover:border-blue-200 hover:bg-blue-50/30'
              } cursor-pointer`}
            >
              {bulkMode && (
                <span className="shrink-0 text-blue-500">
                  {bulkSelected.has(issue.id) ? <CheckSquare size={15} /> : <Square size={15} className="text-gray-300" />}
                </span>
              )}
              <TypeIcon type={issue.type} />
              <span className="text-xs text-gray-400 font-mono w-14 shrink-0">#{issue.number}</span>
              <span className="flex-1 text-sm text-gray-900 font-medium truncate">{issue.title}</span>
              <div className="flex items-center gap-2 shrink-0">
                {issue.due_date && nowMs && (() => {
                  const due = dueDateLabel(issue.due_date, nowMs, 'compact')
                  return (
                    <span className={`text-xs ${due.className}`}>
                      {due.text}
                    </span>
                  )
                })()}
                <StatusBadge status={issue.status} />
                <PriorityBadge priority={issue.priority} />
                {issue.points != null && (
                  <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded font-mono">
                    {issue.points}pt
                  </span>
                )}
              </div>
            </div>
          ))}
          {issues.length > 0 && Array.from({ length: PAGE_SIZE - issues.length }).map((_, i) => (
            <div key={`ph-${i}`} className="flex items-center py-2.5 px-4 border border-transparent" aria-hidden="true">
              <span className="text-sm invisible">_</span>
            </div>
          ))}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <nav
            aria-label="ページネーション"
            className="mt-4 flex items-center justify-between"
          >
            <button
              onClick={() => setPageState({ scope: searchScope, page: Math.max(0, effectivePage - 1) })}
              disabled={effectivePage === 0}
              className="flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
              aria-label="前のページ"
            >
              <ChevronLeft size={14} aria-hidden="true" />
              前へ
            </button>

            <div className="flex items-center gap-1">
              {Array.from({ length: totalPages }, (_, i) => {
                if (
                  i === 0 ||
                  i === totalPages - 1 ||
                  Math.abs(i - effectivePage) <= 1
                ) {
                  return (
                    <button
                      key={i}
                      onClick={() => setPageState({ scope: searchScope, page: i })}
                      aria-current={i === effectivePage ? 'page' : undefined}
                      className={`w-8 h-8 text-sm rounded-lg ${
                        i === effectivePage
                          ? 'bg-blue-600 text-white font-medium'
                          : 'text-gray-600 hover:bg-gray-100'
                      }`}
                    >
                      {i + 1}
                    </button>
                  )
                }
                if (i === 1 && effectivePage > 3) {
                  return <span key="ellipsis-start" className="text-gray-400 px-1">…</span>
                }
                if (i === totalPages - 2 && effectivePage < totalPages - 4) {
                  return <span key="ellipsis-end" className="text-gray-400 px-1">…</span>
                }
                return null
              })}
            </div>

            <button
              onClick={() => setPageState({ scope: searchScope, page: Math.min(totalPages - 1, effectivePage + 1) })}
              disabled={effectivePage >= totalPages - 1}
              className="flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
              aria-label="次のページ"
            >
              次へ
              <ChevronRight size={14} aria-hidden="true" />
            </button>
          </nav>
        )}
      </div>

      {detailId && (() => {
        const issue = issues.find(i => i.id === detailId)
        return (
          <Modal
            title={issue ? `#${issue.number} ${issue.title}` : 'Issue詳細'}
            onClose={() => setDetailId(null)}
            size="lg"
          >
            <IssueDetail issueId={detailId} projectId={activeProjectId} />
          </Modal>
        )
      })()}
    </div>
  )
}
