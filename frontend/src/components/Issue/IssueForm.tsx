import { useId, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createIssue, updateIssue, getIssues } from '../../api/issues'
import { getProjectMembers } from '../../api/workspaces'
import { getTemplates } from '../../api/templates'
import { getLabels } from '../../api/labels'
import type { Issue, IssueType, IssuePriority, UpdateIssue } from '../../types'
import { useToast } from '../common/useToast'
import { extractErrorMessage } from '../../api/client'

interface Props {
  projectId: string
  sprintId?: string
  parentId?: string
  parentPriority?: IssuePriority
  issue?: Issue
  onClose: () => void
}

export function IssueForm({ projectId, sprintId, parentId, parentPriority, issue, onClose }: Props) {
  const qc = useQueryClient()
  const showToast = useToast()
  const templateSelectId = useId()
  const epicSelectId = useId()
  const parentSelectId = useId()
  const titleInputId = useId()
  const descriptionInputId = useId()
  const typeSelectId = useId()
  const prioritySelectId = useId()
  const assigneeSelectId = useId()
  const dueDateInputId = useId()
  const [form, setForm] = useState({
    title: issue?.title ?? '',
    description: issue?.description ?? '',
    type: (issue?.type ?? 'task') as IssueType,
    priority: (issue?.priority ?? parentPriority ?? 'medium') as IssuePriority,
    points: issue?.points?.toString() ?? '',
    assignee_id: issue?.assignee_id ?? '',
    parent_id: issue?.parent_id ?? parentId ?? '',
    epic_id: issue?.epic_id ?? '',
    due_date: issue?.due_date ?? '',
    labels: issue?.labels ?? [] as string[],
  })

  // 全イシュー（親候補・エピック候補）
  const { data: allIssues = [] } = useQuery({
    queryKey: ['issues', projectId],
    queryFn: () => getIssues(projectId),
  })
  const stories = allIssues.filter(i => i.type === 'story' && i.id !== issue?.id)
  const epics = allIssues.filter(i => i.type === 'epic' && i.id !== issue?.id)

  // テンプレート
  const { data: templates = [] } = useQuery({
    queryKey: ['templates', projectId],
    queryFn: () => getTemplates(projectId),
  })

  const { data: projectLabels = [] } = useQuery({
    queryKey: ['labels', projectId],
    queryFn: () => getLabels(projectId),
  })

  // Project members for assignee dropdown
  const { data: members = [] } = useQuery({
    queryKey: ['project-members', projectId],
    queryFn: () => getProjectMembers(projectId),
  })

  // エピック・親ストーリーの選択状況に応じて選べるタイプを絞り込む
  const allowedTypes: { value: IssueType; label: string }[] = form.parent_id
    ? [
        { value: 'task',  label: 'Task' },
        { value: 'bug',   label: 'Bug' },
        { value: 'spike', label: 'Spike' },
      ]
    : form.epic_id
      ? [
          { value: 'story', label: 'Story' },
          { value: 'task',  label: 'Task' },
          { value: 'bug',   label: 'Bug' },
          { value: 'spike', label: 'Spike' },
        ]
      : [
          { value: 'epic',  label: 'Epic' },
          { value: 'story', label: 'Story' },
          { value: 'task',  label: 'Task' },
          { value: 'bug',   label: 'Bug' },
          { value: 'spike', label: 'Spike' },
        ]

  const effectiveType: IssueType = allowedTypes.some(t => t.value === form.type)
    ? form.type
    : allowedTypes[0].value

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['issues', projectId] })
    onClose()
  }

  const createMutation = useMutation({
    mutationFn: () =>
      createIssue(projectId, {
        ...form,
        type: effectiveType,
        assignee_id: form.assignee_id || undefined,
        points: form.points ? parseInt(form.points) : undefined,
        sprint_id: sprintId,
        parent_id: form.parent_id || undefined,
        epic_id: form.epic_id || undefined,
        due_date: form.due_date || undefined,
        labels: form.labels.length > 0 ? form.labels : undefined,
      }),
    onSuccess: invalidate,
    onError: (err) => showToast(extractErrorMessage(err, 'イシューの作成に失敗しました'), 'error'),
  })

  const updateMutation = useMutation({
    mutationFn: () => {
      const data: UpdateIssue = {
        ...form,
        type: effectiveType,
        assignee_id: form.assignee_id || null,
        points: form.points ? parseInt(form.points) : undefined,
        parent_id: form.parent_id || null,
        epic_id: form.epic_id || null,
        due_date: form.due_date || null,
        labels: form.labels,
      }
      return updateIssue(issue!.id, data)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['issues', projectId] })
      qc.invalidateQueries({ queryKey: ['issue', issue!.id] })
      onClose()
    },
    onError: (err) => showToast(extractErrorMessage(err, 'イシューの更新に失敗しました'), 'error'),
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (issue) updateMutation.mutate()
    else createMutation.mutate()
  }

  const isPending = createMutation.isPending || updateMutation.isPending

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {!issue && templates.length > 0 && (
        <div>
          <label htmlFor={templateSelectId} className="block text-sm font-medium text-gray-700 mb-1">テンプレートから作成</label>
          <select
            id={templateSelectId}
            onChange={e => {
              const t = templates.find(t => t.id === e.target.value)
              if (!t) return
              setForm(f => ({
                ...f,
                title: t.name,
                description: t.description ?? '',
                type: t.type,
                priority: t.priority,
                points: t.points?.toString() ?? '',
                labels: t.labels ?? [],
              }))
            }}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            defaultValue=""
          >
            <option value="">テンプレートを選択...</option>
            {templates.map(t => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>
      )}

      {/* コンテキスト選択（Epic → 親Story）を先頭に */}
      {epics.length > 0 && (
        <div>
          <label htmlFor={epicSelectId} className="block text-sm font-medium text-gray-700 mb-1">エピック</label>
          <select
            id={epicSelectId}
            value={form.epic_id}
            onChange={e => {
              const epic_id = e.target.value
              setForm(f => {
                const next = { ...f, epic_id }
                // エピック選択時は epic タイプ不可 → 必要ならリセット
                if (epic_id && next.type === 'epic') next.type = 'story'
                return next
              })
            }}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
          >
            <option value="">なし</option>
            {epics.map(ep => (
              <option key={ep.id} value={ep.id}>#{ep.number} {ep.title}</option>
            ))}
          </select>
        </div>
      )}

      {stories.length > 0 && (
        <div>
          <label htmlFor={parentSelectId} className="block text-sm font-medium text-gray-700 mb-1">親ストーリー</label>
          <select
            id={parentSelectId}
            value={form.parent_id}
            onChange={e => {
              const parent_id = e.target.value
              setForm(f => {
                const next = { ...f, parent_id }
                // 親ストーリー選択時は epic・story タイプ不可
                if (parent_id && (next.type === 'epic' || next.type === 'story')) next.type = 'task'
                return next
              })
            }}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
          >
            <option value="">なし</option>
            {stories.map(s => (
              <option key={s.id} value={s.id}>#{s.number} {s.title}</option>
            ))}
          </select>
        </div>
      )}

      <div>
        <label htmlFor={titleInputId} className="block text-sm font-medium text-gray-700 mb-1">タイトル *</label>
        <input
          id={titleInputId}
          required
          value={form.title}
          onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="Issueのタイトル"
        />
      </div>

      <div>
        <label htmlFor={descriptionInputId} className="block text-sm font-medium text-gray-700 mb-1">説明</label>
        <textarea
          id={descriptionInputId}
          value={form.description}
          onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
          rows={4}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="説明（任意）"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor={typeSelectId} className="block text-sm font-medium text-gray-700 mb-1">タイプ</label>
          <select
            id={typeSelectId}
            value={effectiveType}
            onChange={e => setForm(f => ({ ...f, type: e.target.value as IssueType }))}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
          >
            {allowedTypes.map(t => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor={prioritySelectId} className="block text-sm font-medium text-gray-700 mb-1">優先度</label>
          <select
            id={prioritySelectId}
            value={form.priority}
            onChange={e => setForm(f => ({ ...f, priority: e.target.value as IssuePriority }))}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
          >
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="critical">Critical</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">ポイント</label>
          <input
            type="number"
            min="0"
            max="999"
            value={form.points}
            onChange={e => setForm(f => ({ ...f, points: e.target.value }))}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            placeholder="0"
            aria-label="ストーリーポイント (0〜999)"
          />
        </div>

        <div>
          <label htmlFor={assigneeSelectId} className="block text-sm font-medium text-gray-700 mb-1">担当者</label>
          <select
            id={assigneeSelectId}
            value={form.assignee_id}
            onChange={e => setForm(f => ({ ...f, assignee_id: e.target.value }))}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
          >
            <option value="">未割り当て</option>
            {members.map(m => (
              <option key={m.user_id} value={m.user_id}>{m.name}</option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label htmlFor={dueDateInputId} className="block text-sm font-medium text-gray-700 mb-1">期限日</label>
        <input
          id={dueDateInputId}
          type="date"
          value={form.due_date}
          onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
        />
        {form.due_date && new Date(form.due_date) < new Date(new Date().toDateString()) && (
          <p className="text-xs text-amber-600 mt-1">過去の日付が設定されています</p>
        )}
      </div>

      {projectLabels.length > 0 && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">ラベル</label>
          <div className="flex flex-wrap gap-2">
            {projectLabels.map(label => {
              const selected = form.labels.includes(label.name)
              return (
                <button
                  key={label.id}
                  type="button"
                  onClick={() => setForm(f => ({
                    ...f,
                    labels: selected
                      ? f.labels.filter(l => l !== label.name)
                      : [...f.labels, label.name],
                  }))}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-all ${
                    selected
                      ? 'border-transparent text-white'
                      : 'border-gray-200 text-gray-600 hover:border-gray-300'
                  }`}
                  style={selected ? { backgroundColor: label.color } : {}}
                >
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: label.color }}
                  />
                  {label.name}
                </button>
              )
            })}
          </div>
        </div>
      )}

      <div className="flex justify-end gap-3 pt-2">
        <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">
          キャンセル
        </button>
        <button
          type="submit"
          disabled={isPending}
          className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          {isPending ? '保存中...' : issue ? '更新' : '作成'}
        </button>
      </div>
    </form>
  )
}
